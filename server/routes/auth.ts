import bs58 from "bs58";
import crypto from "crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { Router, type Request } from "express";
import { Redis } from "@upstash/redis";
import nacl from "tweetnacl";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { db, hasDatabase } from "../db";
import { auth as betterAuth } from "../../lib/auth";
import { getClawdBalance, CLAWD_MINT } from "../lib/clawd-balance";
import { getClawdSupplyStats } from "../lib/clawd-supply";
import { isAuthenticated } from "../middleware/session";
import { ADMIN_CLAWD_BALANCE, HOLDER_MIN, adminWalletList, getWalletAccessState } from "../lib/access-control";
import {
  authChallenges,
  authSessions,
  entryPayments,
  holderVerifications,
  metaplexAgents,
  users,
  walletActivityLog,
  walletProfiles,
  walletSocialLinks,
} from "../../drizzle/schema";

const router = Router();

router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (isTrustedOrigin(req)) return next();
  return res.status(403).json({ error: "Untrusted request origin." });
});

const DEFAULT_TREASURY_WALLET = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const CONFIGURED_ADMIN_WALLET = process.env.ADMIN_WALLET || process.env.ADMINWALLET;
const ADMIN_WALLET = CONFIGURED_ADMIN_WALLET || process.env.TREASURY_WALLET || DEFAULT_TREASURY_WALLET;
const CLAWD_DECIMALS = Number(process.env.CLAWD_DECIMALS ?? "6");
const ENTRY_FEE_CLAWD = 69_420;
const CLAWD_MINT_STR = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const rpcUrl = process.env.HELIUS_RPC_URL || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "https://api.mainnet-beta.solana.com");
const connection = new Connection(rpcUrl, "confirmed");
const nonceStore = new Map<string, { nonce: string; expiresAt: number; message: string }>();
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const authRedis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
      })
    : null;
let authSchemaReady = false;
let authSchemaPromise: Promise<void> | null = null;
type ColumnNameRow = { columnName?: string; column_name?: string };
const IP_ADDRESS_HEADERS = [
  "cf-connecting-ip",
  "x-vercel-forwarded-for",
  "fly-client-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;
const starterAgentNames = [
  "Bytechu",
  "Clawdmon",
  "Nibbles",
  "Zappit",
  "Hexlet",
  "Mintasaur",
  "Puffbyte",
  "Patchy",
];

function makeStarterAgentName(walletAddress: string) {
  const seed = walletAddress.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = starterAgentNames[seed % starterAgentNames.length] ?? "Clawdling";
  return `${base}-${walletAddress.slice(0, 4)}`;
}

function getRequestMeta(req: Parameters<typeof isAuthenticated>[0]) {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  };
}

function getClientIp(req: Request) {
  for (const header of IP_ADDRESS_HEADERS) {
    const value = req.headers[header]?.toString().split(",")[0]?.trim();
    if (value) return value;
  }
  return req.socket.remoteAddress ?? null;
}

function isValidWalletAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return false;
  try {
    return new PublicKey(trimmed).toBase58() === trimmed;
  } catch {
    return false;
  }
}

function isValidTxSignature(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(value.trim());
}

function cleanHandle(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^@/, "").slice(0, maxLength);
  if (!trimmed) return null;
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
}

function cleanHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 1000);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? trimmed : null;
  } catch {
    return null;
  }
}

function toHeadersObject(req: Request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  return headers;
}

async function getBetterAuthSession(req: Request) {
  if (process.env.ENABLE_BETTER_AUTH !== "true") {
    return null;
  }
  try {
    return await betterAuth.api.getSession({
      headers: toHeadersObject(req),
    });
  } catch (error) {
    console.warn("[auth/me] better-auth session lookup failed:", error);
    return null;
  }
}

function safeBase58Decode(value: string, expectedLength?: number) {
  try {
    const decoded = bs58.decode(value);
    if (expectedLength && decoded.length !== expectedLength) return null;
    return decoded;
  } catch {
    return null;
  }
}

function authKey(req: Request, walletAddress?: string) {
  const ip = getClientIp(req) ?? "unknown";
  return `${ip}:${walletAddress ?? "anonymous"}`;
}

async function consumeAttempt(key: string, limit: number, windowMs: number) {
  if (authRedis) {
    try {
      const count = await authRedis.incr(`auth-attempt:${key}`);
      if (count === 1) {
        await authRedis.expire(`auth-attempt:${key}`, Math.ceil(windowMs / 1000));
      }
      if (count > limit) {
        const retryAfterSeconds = await authRedis.ttl(`auth-attempt:${key}`);
        return { allowed: false, retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : Math.ceil(windowMs / 1000) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (error) {
      console.warn("[auth] Redis attempt limiter failed, falling back to memory:", error);
    }
  }

  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

async function clearAttempts(key: string) {
  if (authRedis) {
    await authRedis.del(`auth-attempt:${key}`).catch((error) => {
      console.warn("[auth] failed to clear Redis auth attempt bucket:", error);
    });
  }
  authAttempts.delete(key);
}

async function loadPendingChallenge(walletAddress: string) {
  const inMemory = nonceStore.get(walletAddress);
  if (inMemory) {
    return {
      nonce: inMemory.nonce,
      message: inMemory.message,
      expiresAt: inMemory.expiresAt,
      source: "memory" as const,
    };
  }

  if (!hasDatabase) return null;

  try {
    await ensureAuthSchema();
    const [persisted] = await db
      .select()
      .from(authChallenges)
      .where(eq(authChallenges.walletAddress, walletAddress))
      .orderBy(desc(authChallenges.createdAt))
      .limit(1);

    if (!persisted || persisted.usedAt) return null;

    return {
      nonce: persisted.nonce,
      message: persisted.message,
      expiresAt: persisted.expiresAt.getTime(),
      source: "database" as const,
    };
  } catch (error) {
    console.warn("[auth] failed to load persisted challenge:", error);
    return null;
  }
}

function isTrustedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim() ?? req.headers.host;
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.host === host) return true;
    const allowed = [
      process.env.APP_ORIGIN,
      process.env.VITE_APP_URL,
      process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : undefined,
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim().replace(/\/$/, ""));
    return allowed.includes(origin.replace(/\/$/, ""));
  } catch {
    return false;
  }
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getExecuteRows(result: unknown): ColumnNameRow[] {
  if (Array.isArray(result)) return result as ColumnNameRow[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as ColumnNameRow[]) : [];
}

async function getUsersColumns() {
  const result = await db.execute(sql`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN (
        'telegramuserid',
        'telegramUserId',
        'telegramusername',
        'telegramUsername',
        'telegramchatid',
        'telegramChatId'
      )
  `);

  return new Set(
    getExecuteRows(result)
      .map((row) => row.columnName ?? row.column_name)
      .filter((value): value is string => typeof value === "string"),
  );
}

async function normalizeTelegramUserColumns() {
  const columns = await getUsersColumns();

  if (columns.has("telegramuserid") && !columns.has("telegramUserId")) {
    await db.execute(sql`ALTER TABLE "users" RENAME COLUMN "telegramuserid" TO "telegramUserId"`);
  }
  if (columns.has("telegramusername") && !columns.has("telegramUsername")) {
    await db.execute(sql`ALTER TABLE "users" RENAME COLUMN "telegramusername" TO "telegramUsername"`);
  }
  if (columns.has("telegramchatid") && !columns.has("telegramChatId")) {
    await db.execute(sql`ALTER TABLE "users" RENAME COLUMN "telegramchatid" TO "telegramChatId"`);
  }
}

async function ensureAuthSchema() {
  if (!hasDatabase || authSchemaReady) return;
  if (authSchemaPromise) return authSchemaPromise;

  authSchemaPromise = (async () => {
    try {
      await normalizeTelegramUserColumns();
    } catch (error) {
      // Metadata access can fail on some managed/HTTP Postgres paths. Do not
      // block sign-in; the ADD COLUMN IF NOT EXISTS step below is sufficient
      // for new installs and leaves legacy lowercase columns harmless.
      console.warn("[auth/schema] telegram column normalization skipped:", error);
    }

    await db.execute(sql`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "primaryWalletAddress" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "agentName" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "bio" TEXT,
        ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "twitterUsername" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "githubUsername" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "telegramUserId" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "telegramUsername" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "telegramChatId" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN DEFAULT false NOT NULL,
        ADD COLUMN IF NOT EXISTS "lastHolderVerifiedAt" TIMESTAMP
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "auth_challenges" (
        "id" SERIAL PRIMARY KEY,
        "walletAddress" VARCHAR(64) NOT NULL,
        "nonce" VARCHAR(128) NOT NULL,
        "message" TEXT NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "usedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_auth_challenges_wallet" ON "auth_challenges" ("walletAddress")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_auth_challenges_nonce" ON "auth_challenges" ("nonce")`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "walletAddress" VARCHAR(64) NOT NULL,
        "sessionToken" VARCHAR(255) NOT NULL UNIQUE,
        "loginMethod" VARCHAR(64) DEFAULT 'solana-wallet' NOT NULL,
        "ipAddress" VARCHAR(64),
        "userAgent" TEXT,
        "isTokenHolder" BOOLEAN DEFAULT false NOT NULL,
        "clawdBalance" REAL DEFAULT 0 NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "lastSeenAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "revokedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user" ON "auth_sessions" ("userId")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_auth_sessions_wallet" ON "auth_sessions" ("walletAddress")`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "holder_verifications" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER,
        "walletAddress" VARCHAR(64) NOT NULL,
        "tokenMint" VARCHAR(64) NOT NULL,
        "rawBalance" BIGINT DEFAULT 0 NOT NULL,
        "balance" REAL DEFAULT 0 NOT NULL,
        "isHolder" BOOLEAN DEFAULT false NOT NULL,
        "source" VARCHAR(64) DEFAULT 'helius-rpc' NOT NULL,
        "verifiedAt" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_holder_verifications_wallet" ON "holder_verifications" ("walletAddress")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_holder_verifications_user" ON "holder_verifications" ("userId")`);


    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "wallet_profiles" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "walletAddress" VARCHAR(64) NOT NULL,
        "displayName" VARCHAR(128),
        "agentName" VARCHAR(64),
        "bio" TEXT,
        "avatarUrl" TEXT,
        "twitterUsername" VARCHAR(64),
        "githubUsername" VARCHAR(64),
        "isPrimary" BOOLEAN DEFAULT false NOT NULL,
        "lastLoginAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_profiles_wallet" ON "wallet_profiles" ("walletAddress")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_profiles_user_wallet" ON "wallet_profiles" ("userId", "walletAddress")`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "wallet_social_links" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "walletAddress" VARCHAR(64) NOT NULL,
        "provider" VARCHAR(32) NOT NULL,
        "handle" VARCHAR(128) NOT NULL,
        "url" TEXT,
        "verified" BOOLEAN DEFAULT false NOT NULL,
        "metadata" JSON,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_social_links_wallet_provider" ON "wallet_social_links" ("walletAddress", "provider")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_social_links_user_provider" ON "wallet_social_links" ("userId", "provider")`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "wallet_activity_log" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER,
        "walletAddress" VARCHAR(64) NOT NULL,
        "activityType" VARCHAR(64) NOT NULL,
        "route" TEXT,
        "ipAddress" VARCHAR(64),
        "userAgent" TEXT,
        "metadata" JSON,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_activity_log_wallet" ON "wallet_activity_log" ("walletAddress")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_activity_log_user" ON "wallet_activity_log" ("userId")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_wallet_activity_log_type" ON "wallet_activity_log" ("activityType")`);

    authSchemaReady = true;
  })().catch((error) => {
    authSchemaPromise = null;
    throw error;
  });

  return authSchemaPromise;
}

async function logWalletActivity(input: {
  userId?: number | null;
  walletAddress: string;
  activityType: string;
  route?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  if (!hasDatabase) return;
  await ensureAuthSchema();
  await db.insert(walletActivityLog).values({
    userId: input.userId ?? null,
    walletAddress: input.walletAddress,
    activityType: input.activityType,
    route: input.route ?? null,
    metadata: input.metadata ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}



async function upsertSocialLink(userId: number, walletAddress: string, provider: "github", handle?: string | null) {
  if (!hasDatabase || !handle) return;
  await ensureAuthSchema();
  const existing = await db.select().from(walletSocialLinks).where(
    and(
      eq(walletSocialLinks.userId, userId),
      eq(walletSocialLinks.walletAddress, walletAddress),
      eq(walletSocialLinks.provider, provider),
    ),
  ).limit(1);

  const url = `https://github.com/${handle.replace(/^@/, "")}`;

  if (existing[0]) {
    await db.update(walletSocialLinks).set({
      handle,
      url,
      updatedAt: new Date(),
    }).where(eq(walletSocialLinks.id, existing[0].id));
    return;
  }

  await db.insert(walletSocialLinks).values({
    userId,
    walletAddress,
    provider,
    handle,
    url,
  });
}

async function getOwnedAgents(walletAddress: string) {
  if (!hasDatabase) return [];
  return db.select().from(metaplexAgents).where(
    or(
      eq(metaplexAgents.ownerWallet, walletAddress),
      eq(metaplexAgents.authorityWallet, walletAddress),
      eq(metaplexAgents.payerWallet, walletAddress),
    ),
  ).orderBy(desc(metaplexAgents.updatedAt)).limit(24);
}

async function syncBetterAuthUser(
  sessionUser: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  },
  walletUser?: typeof users.$inferSelect | null,
) {
  if (!hasDatabase) return null;

  await ensureAuthSchema();

  const email = sessionUser.email?.trim().toLowerCase() || null;
  const name = sessionUser.name?.trim() || null;
  const avatarUrl = cleanHttpUrl(sessionUser.image);
  const now = new Date();

  if (walletUser) {
    await db.update(users).set({
      openId: sessionUser.id,
      email: email ?? walletUser.email,
      name: name ?? walletUser.name,
      avatarUrl: avatarUrl ?? walletUser.avatarUrl,
      loginMethod: walletUser.loginMethod ?? "better-auth",
      updatedAt: now,
      lastSignedIn: now,
    }).where(eq(users.id, walletUser.id));

    return (await db.select().from(users).where(eq(users.id, walletUser.id)).limit(1))[0] ?? walletUser;
  }

  let [viewer] = await db.select().from(users).where(eq(users.openId, sessionUser.id)).limit(1);

  if (!viewer && email) {
    [viewer] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  }

  if (viewer) {
    await db.update(users).set({
      openId: viewer.openId ?? sessionUser.id,
      email: email ?? viewer.email,
      name: name ?? viewer.name,
      avatarUrl: avatarUrl ?? viewer.avatarUrl,
      loginMethod: viewer.loginMethod ?? "better-auth",
      updatedAt: now,
      lastSignedIn: now,
    }).where(eq(users.id, viewer.id));

    return (await db.select().from(users).where(eq(users.id, viewer.id)).limit(1))[0] ?? viewer;
  }

  return null;
}

function getUserLinkedWallet(user?: typeof users.$inferSelect | null) {
  return user?.primaryWalletAddress ?? user?.walletAddress ?? null;
}

async function getAuthorizedViewerState(user?: typeof users.$inferSelect | null) {
  const walletAddress = getUserLinkedWallet(user);
  const access = await getWalletAccessState(walletAddress);
  const isAdmin = user?.role === "admin" || access.isAdmin;
  return {
    user,
    walletAddress,
    access,
    isAdmin,
    isAuthorized: Boolean(user) && (isAdmin || access.allowed),
  };
}

async function getAuthorizedBetterAuthViewer(
  sessionUser: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  },
) {
  const viewer = await syncBetterAuthUser(sessionUser);
  return getAuthorizedViewerState(viewer);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (value.expiresAt < now) nonceStore.delete(key);
  }
  for (const [key, value] of authAttempts.entries()) {
    if (value.resetAt < now) authAttempts.delete(key);
  }
}, 10 * 60 * 1000);

router.get("/entry", async (req, res) => {
  const supply = await getClawdSupplyStats().catch((error) => {
    console.warn("[auth/entry] failed to load supply stats:", error);
    return null;
  });
  const walletAddress = req.session.walletAddress ?? null;
  const access = await getWalletAccessState(walletAddress);

  const hasPaidEntry = walletAddress && hasDatabase
    ? !!(await getEntryPaymentRecord(walletAddress).catch(() => null))
    : false;

  return res.json({
    authenticated: Boolean(req.session.isAuthenticated && walletAddress),
    walletAddress,
    isHolder: access.allowed,
    clawdBalance: access.balance,
    holderMinimum: HOLDER_MIN,
    clawdMint: CLAWD_MINT,
    clawdSupply: supply,
    hasPaidEntry,
    entryFeeAmount: ENTRY_FEE_CLAWD,
    treasuryWallet: process.env.TREASURY_WALLET || CONFIGURED_ADMIN_WALLET || DEFAULT_TREASURY_WALLET,
  });
});

router.get("/challenge", async (req, res) => {
  const wallet = req.query.wallet;
  if (!isValidWalletAddress(wallet)) {
    return res.status(400).json({ error: "Valid wallet query param required" });
  }

  const attempt = await consumeAttempt(authKey(req, wallet), 20, 10 * 60 * 1000);
  if (!attempt.allowed) {
    res.setHeader("Retry-After", String(attempt.retryAfterSeconds));
    return res.status(429).json({ error: "Too many auth attempts. Try again shortly." });
  }

  const nonce = crypto.randomBytes(32).toString("base64url");
  const timestamp = Date.now();
  const expiresAt = timestamp + 5 * 60 * 1000;
  const message = [
    "Sign in to CLAWD Terminal",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(timestamp).toISOString()}`,
    `Holder requirement: >= ${HOLDER_MIN} $CLAWD`,
  ].join("\n");

  nonceStore.set(wallet, { nonce, expiresAt, message });

  if (hasDatabase) {
    try {
      await ensureAuthSchema();
      await db.insert(authChallenges).values({
        walletAddress: wallet,
        nonce,
        message,
        expiresAt: new Date(expiresAt),
      });
    } catch (error) {
      console.warn("[auth/challenge] failed to persist challenge:", error);
    }
  }

  res.json({ message, nonce, expiresAt });
});



router.post("/verify", async (req, res) => {
  try {
    if (hasDatabase) await ensureAuthSchema();
    const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
    const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    if (!isValidWalletAddress(walletAddress) || !signature || !message) {
      return res.status(400).json({ error: "walletAddress, signature, and message are required" });
    }

    const attemptKey = authKey(req, walletAddress);
    const attempt = await consumeAttempt(attemptKey, 8, 10 * 60 * 1000);
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfterSeconds));
      return res.status(429).json({ error: "Too many sign-in attempts. Try again shortly." });
    }

    const challenge = await loadPendingChallenge(walletAddress);
    if (!challenge) {
      return res.status(401).json({ error: "No pending challenge for this wallet. Request a new challenge." });
    }
    if (challenge.expiresAt < Date.now()) {
      nonceStore.delete(walletAddress);
      return res.status(401).json({ error: "Challenge expired. Please sign in again." });
    }
    if (challenge.message !== message || !message.includes(challenge.nonce)) {
      return res.status(401).json({ error: "Message nonce mismatch." });
    }

    const signatureBytes = safeBase58Decode(signature, 64);
    const walletBytes = safeBase58Decode(walletAddress, 32);
    if (!signatureBytes || !walletBytes) {
      return res.status(400).json({ error: "Invalid wallet address or signature encoding." });
    }

    const valid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      signatureBytes,
      walletBytes,
    );
    if (!valid) {
      return res.status(401).json({ error: "Invalid signature. Authentication failed." });
    }

    nonceStore.delete(walletAddress);
    await clearAttempts(attemptKey);
    if (hasDatabase) {
      await db.update(authChallenges).set({ usedAt: new Date() }).where(
        and(
          eq(authChallenges.walletAddress, walletAddress),
          eq(authChallenges.nonce, challenge.nonce),
        ),
      ).catch((error) => console.warn("[auth/verify] failed to mark challenge used:", error));
    }

    const adminWallets = adminWalletList();
    const isAdmin = adminWallets.includes(walletAddress);

    const access = await getWalletAccessState(walletAddress);
    const clawdBalance = access.balance;
    const isHolder = access.allowed;

    // Entry-fee path: wallet paid 69,420 CLAWD but may not hold any now
    const hasPaidEntry = !isHolder && hasDatabase
      ? !!(await getEntryPaymentRecord(walletAddress))
      : false;

    const meta = getRequestMeta(req);
    const hasTokenGateAccess = isAdmin || isHolder || hasPaidEntry;
    let userId: number | null = null;
    let user: typeof users.$inferSelect | null = null;
    let profile: typeof walletProfiles.$inferSelect | null = null;
    let agentName = makeStarterAgentName(walletAddress);

    if (hasDatabase) {
      let existing: (typeof users.$inferSelect)[] = [];
      try {
        await ensureAuthSchema();
        existing = await db.select().from(users).where(
          or(
            eq(users.walletAddress, walletAddress),
            eq(users.primaryWalletAddress, walletAddress),
            eq(users.openId, walletAddress),
          ),
        ).limit(1);
      } catch (dbErr) {
        console.error("[auth/verify] DB user lookup failed:", dbErr);
      }

      try {
        if (existing[0]) {
          user = existing[0];
          agentName = user.agentName || agentName;
          await db.update(users).set({
            walletAddress,
            primaryWalletAddress: user.primaryWalletAddress || walletAddress,
            loginMethod: "solana-wallet",
            role: isAdmin ? "admin" : user.role,
            clawdBalance,
            isTokenGated: hasTokenGateAccess,
            agentName,
            lastHolderVerifiedAt: hasTokenGateAccess ? new Date() : user.lastHolderVerifiedAt,
            lastSignedIn: new Date(),
            updatedAt: new Date(),
          }).where(eq(users.id, user.id));
          userId = user.id;
        } else {
          const inserted = await db.insert(users).values({
            openId: walletAddress,
            walletAddress,
            primaryWalletAddress: walletAddress,
            loginMethod: "solana-wallet",
            role: isAdmin ? "admin" : "user",
            clawdBalance,
            isTokenGated: hasTokenGateAccess,
            agentName,
            onboardingCompleted: false,
            lastHolderVerifiedAt: hasTokenGateAccess ? new Date() : null,
          }).returning();
          user = inserted[0] ?? null;
          userId = user?.id ?? null;
        }
      } catch (dbErr) {
        console.error("[auth/verify] DB user upsert failed:", dbErr);
      }

      if (userId) {
        const existingProfile = await db.select().from(walletProfiles).where(
          and(eq(walletProfiles.userId, userId), eq(walletProfiles.walletAddress, walletAddress)),
        ).limit(1);

        if (existingProfile[0]) {
          await db.update(walletProfiles).set({
            agentName,
            isPrimary: true,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(walletProfiles.id, existingProfile[0].id));
          profile = existingProfile[0];
        } else {
          const insertedProfile = await db.insert(walletProfiles).values({
            userId,
            walletAddress,
            agentName,
            displayName: user?.name ?? null,
            bio: user?.bio ?? null,
            avatarUrl: user?.avatarUrl ?? null,
            twitterUsername: user?.twitterUsername ?? null,
            githubUsername: user?.githubUsername ?? null,
            isPrimary: true,
          }).returning();
          profile = insertedProfile[0] ?? null;
        }

        if (hasTokenGateAccess) {
          await db.insert(holderVerifications).values({
            userId,
            walletAddress,
            tokenMint: CLAWD_MINT,
            rawBalance: Math.round(clawdBalance * 1_000_000),
            balance: clawdBalance,
            isHolder,
          });
        }


        await logWalletActivity({
          userId,
          walletAddress,
          activityType: "sign_in_success",
          route: req.path,
          metadata: { clawdBalance, isHolder, hasPaidEntry, registeredOnly: !hasTokenGateAccess },
          ...meta,
        });
      }
    }

    await regenerateSession(req);
    req.session.isAuthenticated = true;
    req.session.walletAddress = walletAddress;
    req.session.userId = userId ?? undefined;
    req.session.userRole = isAdmin ? "admin" : (user?.role ?? "user");
    try {
      await saveSession(req);
    } catch (sessionErr) {
      console.error("[auth/verify] Session save failed:", sessionErr);
    }

    if (hasDatabase && userId) {
      try {
        await db.insert(authSessions).values({
          userId,
          walletAddress,
          sessionToken: req.sessionID,
          loginMethod: "solana-wallet",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          isTokenHolder: hasTokenGateAccess,
          clawdBalance,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      } catch (dbErr) {
        console.error("[auth/verify] authSessions insert failed:", dbErr);
      }
    }

    const ownedAgents = await getOwnedAgents(walletAddress);

    return res.json({
      ok: true,
      walletAddress,
      userId,
      role: req.session.userRole,
      clawdBalance,
      isTokenGated: hasTokenGateAccess,
      holderMinimum: HOLDER_MIN,
      entryFeeRequired: !hasTokenGateAccess,
      entryFeeAmount: ENTRY_FEE_CLAWD,
      onboardingCompleted: user?.onboardingCompleted ?? false,
      profile: {
        displayName: profile?.displayName ?? user?.name ?? null,
        bio: profile?.bio ?? user?.bio ?? null,
        avatarUrl: profile?.avatarUrl ?? user?.avatarUrl ?? null,
        twitterUsername: profile?.twitterUsername ?? user?.twitterUsername ?? null,
        githubUsername: profile?.githubUsername ?? user?.githubUsername ?? null,
        agentName: profile?.agentName ?? user?.agentName ?? agentName,
      },
      agents: ownedAgents,
    });
  } catch (err: unknown) {
    console.error("[auth/verify] error:", err);
    res.status(500).json({ error: `Verification failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.get("/me", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.session.isAuthenticated || !req.session.walletAddress) {
    const betterAuthSession = await getBetterAuthSession(req);
    if (!betterAuthSession?.user) {
      return res.json({ authenticated: false });
    }

    const viewerState = await getAuthorizedBetterAuthViewer({
      id: betterAuthSession.user.id,
      email: betterAuthSession.user.email ?? null,
      name: betterAuthSession.user.name ?? null,
      image: betterAuthSession.user.image ?? null,
    });

    if (!viewerState.isAuthorized || !viewerState.user) {
      return res.status(403).json({
        authenticated: false,
        holderRequired: true,
        walletAddress: viewerState.walletAddress,
        clawdBalance: viewerState.access.balance,
        holderMinimum: viewerState.access.holderMinimum,
      });
    }

    return res.json({
      authenticated: true,
      userId: viewerState.user.id,
      walletAddress: viewerState.walletAddress,
      role: viewerState.isAdmin ? "admin" : viewerState.user.role,
      clawdBalance: viewerState.access.balance,
      isTokenGated: true,
      onboardingCompleted: viewerState.user.onboardingCompleted ?? false,
      createdAt: viewerState.user.createdAt ?? null,
      profile: {
        displayName: viewerState.user.name ?? betterAuthSession.user.name ?? null,
        bio: viewerState.user.bio ?? null,
        avatarUrl: viewerState.user.avatarUrl ?? betterAuthSession.user.image ?? null,
        twitterUsername: viewerState.user.twitterUsername ?? null,
        githubUsername: viewerState.user.githubUsername ?? null,
        agentName: viewerState.user.agentName ?? null,
      },
      agents: [],
    });
  }

  const access = await getWalletAccessState(req.session.walletAddress);
  const hasPaidEntry = hasDatabase
    ? !!(await getEntryPaymentRecord(req.session.walletAddress).catch(() => null))
    : false;
  const hasTokenGateAccess = access.allowed || access.isAdmin || hasPaidEntry;

  if (!hasTokenGateAccess) {
    return res.json({
      authenticated: true,
      userId: req.session.userId ?? null,
      walletAddress: req.session.walletAddress,
      role: req.session.userRole ?? "user",
      clawdBalance: access.balance,
      isTokenGated: false,
      holderMinimum: access.holderMinimum,
    });
  }

  if (!hasDatabase || !req.session.userId) {
    return res.json({
      authenticated: true,
      walletAddress: req.session.walletAddress,
      userId: req.session.userId ?? null,
      role: access.isAdmin ? "admin" : (req.session.userRole ?? "user"),
      clawdBalance: access.balance,
      isTokenGated: true,
    });
  }

  await ensureAuthSchema();

  const [authSession] = await db.select().from(authSessions).where(eq(authSessions.sessionToken, req.sessionID)).limit(1);
  if (authSession && (authSession.revokedAt || authSession.expiresAt.getTime() <= Date.now())) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }

  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }

  const betterAuthSession = await getBetterAuthSession(req);
  const linkedUser = betterAuthSession?.user
    ? await syncBetterAuthUser({
        id: betterAuthSession.user.id,
        email: betterAuthSession.user.email ?? null,
        name: betterAuthSession.user.name ?? null,
        image: betterAuthSession.user.image ?? null,
      }, user)
    : user;

  const [profile] = await db.select().from(walletProfiles).where(
    and(eq(walletProfiles.userId, user.id), eq(walletProfiles.walletAddress, req.session.walletAddress)),
  ).limit(1);
  const agents = await getOwnedAgents(req.session.walletAddress);

  await db.update(authSessions).set({
    lastSeenAt: new Date(),
  }).where(eq(authSessions.sessionToken, req.sessionID));

  return res.json({
    authenticated: true,
    userId: linkedUser?.id ?? user.id,
    walletAddress: req.session.walletAddress,
    role: access.isAdmin ? "admin" : (linkedUser?.role ?? user.role),
    clawdBalance: access.balance,
    isTokenGated: hasTokenGateAccess,
    onboardingCompleted: linkedUser?.onboardingCompleted ?? user.onboardingCompleted ?? false,
    createdAt: linkedUser?.createdAt ?? user.createdAt,
    profile: {
      displayName: profile?.displayName ?? linkedUser?.name ?? user.name ?? null,
      bio: profile?.bio ?? linkedUser?.bio ?? user.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? linkedUser?.avatarUrl ?? user.avatarUrl ?? null,
      twitterUsername: profile?.twitterUsername ?? linkedUser?.twitterUsername ?? user.twitterUsername ?? null,
      githubUsername: profile?.githubUsername ?? linkedUser?.githubUsername ?? user.githubUsername ?? null,
      agentName: profile?.agentName ?? linkedUser?.agentName ?? user.agentName ?? null,
    },
    agents,
  });
});

router.post("/profile", async (req, res) => {
  if ((!req.session.isAuthenticated || !req.session.walletAddress) && hasDatabase) {
    const betterAuthSession = await getBetterAuthSession(req);
    if (betterAuthSession?.user) {
      const viewerState = await getAuthorizedBetterAuthViewer({
        id: betterAuthSession.user.id,
        email: betterAuthSession.user.email ?? null,
        name: betterAuthSession.user.name ?? null,
        image: betterAuthSession.user.image ?? null,
      });

      if (!viewerState.isAuthorized || !viewerState.user) {
        return res.status(403).json({
          error: `Profile updates require the admin wallet or at least ${HOLDER_MIN} $CLAWD.`,
        });
      }

      const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 128) || null : null;
      const bio = typeof req.body?.bio === "string" ? req.body.bio.trim().slice(0, 280) || null : null;
      const avatarUrl = cleanHttpUrl(req.body?.avatarUrl) ?? cleanHttpUrl(betterAuthSession.user.image);
      const twitterUsername = cleanHandle(req.body?.twitterUsername, 64);
      const githubUsername = cleanHandle(req.body?.githubUsername, 64);
      const agentName = typeof req.body?.agentName === "string" ? req.body.agentName.trim().slice(0, 64) || null : null;
      const onboardingCompleted = Boolean(agentName);

      const viewer = viewerState.user;

      await db.update(users).set({
        name: displayName ?? viewer.name,
        bio,
        avatarUrl,
        twitterUsername,
        githubUsername,
        agentName,
        onboardingCompleted,
        updatedAt: new Date(),
      }).where(eq(users.id, viewer.id));

      return res.json({ ok: true, onboardingCompleted });
    }
  }

  if (!req.session.isAuthenticated || !req.session.walletAddress) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!hasDatabase || !req.session.userId || !req.session.walletAddress) {
    return res.status(503).json({ error: "Database-backed profiles are unavailable." });
  }

  await ensureAuthSchema();

  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 128) || null : null;
  const bio = typeof req.body?.bio === "string" ? req.body.bio.trim().slice(0, 280) || null : null;
  const avatarUrl = cleanHttpUrl(req.body?.avatarUrl);
  const twitterUsername = cleanHandle(req.body?.twitterUsername, 64);
  const githubUsername = cleanHandle(req.body?.githubUsername, 64);
  const agentName = typeof req.body?.agentName === "string" ? req.body.agentName.trim().slice(0, 64) || null : null;

  const onboardingCompleted = Boolean(agentName);

  await db.update(users).set({
    name: displayName,
    bio,
    avatarUrl,
    twitterUsername,
    githubUsername,
    agentName,
    onboardingCompleted,
    updatedAt: new Date(),
  }).where(eq(users.id, req.session.userId));

  const [existingProfile] = await db.select().from(walletProfiles).where(
    and(eq(walletProfiles.userId, req.session.userId), eq(walletProfiles.walletAddress, req.session.walletAddress)),
  ).limit(1);

  if (existingProfile) {
    await db.update(walletProfiles).set({
      displayName,
      bio,
      avatarUrl,
      twitterUsername,
      githubUsername,
      agentName,
      updatedAt: new Date(),
    }).where(eq(walletProfiles.id, existingProfile.id));
  } else {
    await db.insert(walletProfiles).values({
      userId: req.session.userId,
      walletAddress: req.session.walletAddress,
      displayName,
      bio,
      avatarUrl,
      twitterUsername,
      githubUsername,
      agentName,
      isPrimary: true,
    });
  }

  await upsertSocialLink(req.session.userId, req.session.walletAddress, "github", githubUsername);

  const meta = getRequestMeta(req);
  await logWalletActivity({
    userId: req.session.userId,
    walletAddress: req.session.walletAddress,
    activityType: "profile_updated",
    route: req.path,
    metadata: { onboardingCompleted },
    ...meta,
  });

  return res.json({ ok: true, onboardingCompleted });
});

router.post("/activity", isAuthenticated, async (req, res) => {
  if (!req.session.walletAddress) {
    return res.status(400).json({ error: "Missing wallet session." });
  }

  const activityType = typeof req.body?.activityType === "string" ? req.body.activityType.trim().slice(0, 64) : "";
  if (!activityType) {
    return res.status(400).json({ error: "activityType is required" });
  }

  const meta = getRequestMeta(req);
  await logWalletActivity({
    userId: req.session.userId ?? null,
    walletAddress: req.session.walletAddress,
    activityType,
    route: typeof req.body?.route === "string" ? req.body.route.slice(0, 1000) : req.path,
    metadata: typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : undefined,
    ...meta,
  });

  return res.json({ ok: true });
});

// ── On-chain helpers ──────────────────────────────────────────────────────────

async function getEntryPaymentRecord(walletAddress: string) {
  if (!hasDatabase) return null;
  await ensureAuthSchema();
  const [record] = await db
    .select()
    .from(entryPayments)
    .where(eq(entryPayments.walletAddress, walletAddress))
    .limit(1);
  return record ?? null;
}

async function verifyClawdTransfer(
  txSignature: string,
  expectedRecipient: string,
  minAmount: number,
): Promise<{ ok: true; received: number } | { ok: false; error: string }> {
  const tx = await connection.getTransaction(txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return { ok: false, error: "Transaction not found or not confirmed" };
  if (tx.meta?.err) return { ok: false, error: "Transaction failed on-chain" };
  if (!tx.meta) return { ok: false, error: "Transaction metadata unavailable" };

  // Find balance delta for treasury-owned CLAWD token accounts
  const pre = new Map<number, number>();
  const post = new Map<number, number>();
  for (const b of tx.meta.preTokenBalances ?? []) {
    if (b.mint === CLAWD_MINT_STR && b.owner === expectedRecipient) {
      pre.set(b.accountIndex, Number(b.uiTokenAmount.uiAmount ?? 0));
    }
  }
  for (const b of tx.meta.postTokenBalances ?? []) {
    if (b.mint === CLAWD_MINT_STR && b.owner === expectedRecipient) {
      post.set(b.accountIndex, Number(b.uiTokenAmount.uiAmount ?? 0));
    }
  }
  let received = 0;
  for (const [idx, postBal] of post) {
    received += postBal - (pre.get(idx) ?? 0);
  }
  if (received < minAmount - 0.001) {
    return { ok: false, error: `Insufficient transfer: received ${received.toFixed(2)} CLAWD, need ${minAmount}` };
  }
  return { ok: true, received };
}

// ── POST /api/auth/entry/verify ───────────────────────────────────────────────
// Verifies a 69,420 $CLAWD on-chain transfer and registers the user.
// This endpoint is intentionally public (listed in isRegistrationAuthPath).
router.post("/entry/verify", async (req, res) => {
  if (!hasDatabase) return res.status(503).json({ error: "Database unavailable" });

  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
  const txSignature = typeof req.body?.txSignature === "string" ? req.body.txSignature.trim() : "";

  if (!isValidWalletAddress(walletAddress) || !isValidTxSignature(txSignature)) {
    return res.status(400).json({ error: "walletAddress and txSignature are required" });
  }

  try {
    await ensureAuthSchema();

    // Idempotency: already processed this tx?
    const [existingByTx] = await db.select().from(entryPayments).where(eq(entryPayments.txSignature, txSignature));
    if (existingByTx) {
      return res.json({ ok: true, alreadyRegistered: true, walletAddress });
    }
    // Already paid entry with a different tx?
    const priorPayment = await getEntryPaymentRecord(walletAddress);
    if (priorPayment) {
      return res.json({ ok: true, alreadyRegistered: true, walletAddress });
    }

    const treasuryWallet = process.env.TREASURY_WALLET || CONFIGURED_ADMIN_WALLET || DEFAULT_TREASURY_WALLET;
    const result = await verifyClawdTransfer(txSignature, treasuryWallet, ENTRY_FEE_CLAWD);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    const meta = getRequestMeta(req);
    const agentName = makeStarterAgentName(walletAddress);
    const adminWallets = adminWalletList();
    const isAdmin = adminWallets.includes(walletAddress);

    // Record entry payment
    await db.insert(entryPayments).values({
      walletAddress,
      recipientWallet: treasuryWallet,
      tokenMint: CLAWD_MINT_STR,
      amount: result.received,
      rawAmount: Math.round(result.received * 10 ** CLAWD_DECIMALS),
      txSignature,
      status: "verified",
    });

    // Upsert user in local DB
    let userId: number | null = null;
    const [existingUser] = await db.select().from(users).where(
      or(eq(users.walletAddress, walletAddress), eq(users.openId, walletAddress)),
    ).limit(1);

    if (existingUser) {
      await db.update(users).set({
        isTokenGated: true,
        lastHolderVerifiedAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }).where(eq(users.id, existingUser.id));
      userId = existingUser.id;
    } else {
      const [inserted] = await db.insert(users).values({
        openId: walletAddress,
        walletAddress,
        primaryWalletAddress: walletAddress,
        loginMethod: "solana-wallet",
        role: isAdmin ? "admin" : "user",
        clawdBalance: 0,
        isTokenGated: true,
        agentName,
        onboardingCompleted: false,
        lastHolderVerifiedAt: new Date(),
      }).returning();
      userId = inserted?.id ?? null;
    }

    // Upsert wallet profile
    if (userId) {
      const [existingProfile] = await db.select().from(walletProfiles)
        .where(and(eq(walletProfiles.userId, userId), eq(walletProfiles.walletAddress, walletAddress))).limit(1);
      if (!existingProfile) {
        await db.insert(walletProfiles).values({ userId, walletAddress, agentName, isPrimary: true });
      }
      await logWalletActivity({
        userId,
        walletAddress,
        activityType: "entry_fee_paid",
        route: req.path,
        metadata: { txSignature, received: result.received, entryFee: ENTRY_FEE_CLAWD },
        ...meta,
      });
    }

    return res.json({ ok: true, registered: true, walletAddress, userId, agentName });
  } catch (err: unknown) {
    console.error("[auth/entry/verify] error:", err);
    return res.status(500).json({ error: `Registration failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.post("/logout", async (req, res) => {
  if (hasDatabase) {
    try {
      await ensureAuthSchema();
      await db.update(authSessions).set({
        revokedAt: new Date(),
        lastSeenAt: new Date(),
      }).where(eq(authSessions.sessionToken, req.sessionID));

      if (req.session.walletAddress) {
        const meta = getRequestMeta(req);
        await logWalletActivity({
          userId: req.session.userId ?? null,
          walletAddress: req.session.walletAddress,
          activityType: "sign_out",
          route: req.path,
          ...meta,
        });
      }
    } catch (error) {
      console.warn("[auth/logout] failed to persist logout:", error);
    }
  }

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie(process.env.NODE_ENV === "production" ? "__Host-cheshire.sid" : "cheshire.sid", { path: "/" });
    res.clearCookie("connect.sid", { path: "/" });
    res.json({ ok: true });
  });
});

router.get("/status", (req, res) => {
  res.json({
    isAuthenticated: !!req.session.isAuthenticated,
    walletAddress: req.session.walletAddress,
    userId: req.session.userId,
  });
});

router.get("/agents", isAuthenticated, async (req, res) => {
  if (!req.session.walletAddress) {
    return res.status(400).json({ error: "Missing wallet session." });
  }
  return res.json({ agents: await getOwnedAgents(req.session.walletAddress) });
});

export default router;
