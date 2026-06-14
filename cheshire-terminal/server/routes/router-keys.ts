import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { Router, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getWalletAccessState } from "../lib/access-control";

const router = Router();
const CHALLENGE_TTL_MS = 5 * 60_000;
const DEFAULT_SCOPES = ["inference:write", "usage:read"];

type ClerkIdentity = {
  userId: string;
  tokenType: string;
  claims: JWTPayload;
};

type AccessContext = {
  walletAddress: string;
  clerk: ClerkIdentity | null;
};

const clerkJwks = createRemoteJWKSet(new URL(
  process.env.CLERK_JWKS_URL ||
  process.env.JWKS_URL ||
  "https://clerk.cheshireterminal.ai/.well-known/jwks.json",
));

type RouterKeyRecord = {
  id: string;
  keyPrefix?: string;
  name?: string;
  walletAddress?: string;
  ownerUserId?: string | null;
  ownerAuthProvider?: string | null;
  ownerTokenType?: string | null;
  holderTier?: string;
  scopes?: string[];
  createdAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  monthlyLimitUSDC?: number | null;
  remainingUSDC?: number | null;
  usagePercent?: number | null;
  usage?: {
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    costUSDC?: number;
  };
};

function routerBaseUrl() {
  return (
    process.env.CLAWDROUTER_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_CLAWDROUTER_URL ||
    process.env.CLAWDROUTER_BASE_URL ||
    "https://clawd-router.fly.dev"
  ).trim().replace(/\/$/, "");
}

function internalSecret() {
  return (process.env.CLAWDROUTER_INTERNAL_SECRET || "").trim();
}

function challengeSecret() {
  return (process.env.ROUTER_WALLET_CHALLENGE_SECRET || process.env.SESSION_SECRET || "").trim();
}

function sessionWallet(req: Request) {
  return (req.session?.walletAddress ?? req.convexAuth?.walletAddress ?? "").trim();
}

function sessionUserId(req: Request) {
  return String(req.session?.userId ?? req.convexAuth?.userId ?? sessionWallet(req) ?? "");
}

function bearerToken(req: Request) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function clerkIssuers() {
  return Array.from(new Set([
    process.env.CLERK_ISSUER,
    process.env.CLERK_ISSUER_URL,
    process.env.CLERK_JWT_ISSUER,
    process.env.CLERK_ACCOUNT_PORTAL_URL,
    process.env.CLERK_FRONTEND_API_URL,
    process.env.CLERK_FRONTEND_API,
    "https://clerk.cheshireterminal.ai",
  ].map((value) => value?.trim().replace(/\/$/, "")).filter(Boolean) as string[]));
}

async function getClerkIdentity(req: Request): Promise<ClerkIdentity | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { payload, protectedHeader } = await jwtVerify(token, clerkJwks, {
    issuer: clerkIssuers(),
  });
  const userId = typeof payload.sub === "string" ? payload.sub : "";
  if (!userId) return null;
  const tokenType =
    typeof payload.typ === "string" ? payload.typ :
    typeof payload.token_type === "string" ? payload.token_type :
    typeof protectedHeader.typ === "string" ? protectedHeader.typ :
    "clerk_token";
  return { userId, tokenType, claims: payload };
}

async function getAccessContext(req: Request, walletCandidate = ""): Promise<AccessContext | null> {
  const sessionAddress = sessionWallet(req);
  const candidateAddress = walletCandidate.trim();
  const walletAddress = sessionAddress || candidateAddress;
  if (!walletAddress) return null;

  if (sessionAddress && candidateAddress && sessionAddress !== candidateAddress) {
    return null;
  }

  try {
    const clerk = await getClerkIdentity(req);
    if (!sessionAddress && !clerk) return null;
    return { walletAddress, clerk };
  } catch {
    return null;
  }
}

function ownerUserId(req: Request, clerk: ClerkIdentity | null) {
  return clerk?.userId || sessionUserId(req);
}

function ownerProvider(clerk: ClerkIdentity | null) {
  return clerk ? "clerk" : "cheshire-wallet";
}

function ownerTokenType(clerk: ClerkIdentity | null) {
  return clerk?.tokenType || "wallet_signature";
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signChallenge(payload: string) {
  const secret = challengeSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function buildChallenge(walletAddress: string) {
  const issuedAt = Date.now();
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${walletAddress}.${issuedAt}.${nonce}`;
  const mac = signChallenge(payload);
  if (!mac) throw new Error("ROUTER_WALLET_CHALLENGE_SECRET is not configured");
  const message = [
    "Cheshire Terminal API key request",
    "",
    `Wallet: ${walletAddress}`,
    `Issued At: ${new Date(issuedAt).toISOString()}`,
    `Nonce: ${nonce}`,
    `MAC: ${mac}`,
  ].join("\n");
  return { message, issuedAt, nonce, mac };
}

function parseChallenge(message: string) {
  const wallet = message.match(/^Wallet:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const issuedAtIso = message.match(/^Issued At:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const nonce = message.match(/^Nonce:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const mac = message.match(/^MAC:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const issuedAt = Date.parse(issuedAtIso);
  return { wallet, issuedAt, nonce, mac };
}

function verifyWalletSignature(walletAddress: string, message: string, signature: string) {
  const parsed = parseChallenge(message);
  if (!parsed.wallet || parsed.wallet !== walletAddress) return false;
  if (!Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > CHALLENGE_TTL_MS) return false;
  const expected = signChallenge(`${parsed.wallet}.${parsed.issuedAt}.${parsed.nonce}`);
  if (!expected || !safeEqual(parsed.mac, expected)) return false;

  const publicKey = new PublicKey(walletAddress);
  const signatureBytes = bs58.decode(signature);
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
}

async function callClawdRouter(path: string, init: RequestInit = {}) {
  const secret = internalSecret();
  if (!secret) {
    const error = new Error("CLAWDROUTER_INTERNAL_SECRET is not configured");
    (error as any).status = 503;
    throw error;
  }
  const response = await fetch(`${routerBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-ClawdRouter-Internal-Secret": secret,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || `CLAWD Router returned ${response.status}`);
    (error as any).status = response.status;
    (error as any).data = data;
    throw error;
  }
  return data;
}

function normalizeKey(record: RouterKeyRecord) {
  const used = Number(record.usage?.costUSDC ?? 0);
  const limit = typeof record.monthlyLimitUSDC === "number" ? record.monthlyLimitUSDC : null;
  return {
    ...record,
    usage: {
      requests: Number(record.usage?.requests ?? 0),
      inputTokens: Number(record.usage?.inputTokens ?? 0),
      outputTokens: Number(record.usage?.outputTokens ?? 0),
      costUSDC: used,
    },
    remainingUSDC: typeof record.remainingUSDC === "number" ? record.remainingUSDC : limit === null ? null : Math.max(0, limit - used),
    usagePercent: typeof record.usagePercent === "number" ? record.usagePercent : limit && limit > 0 ? Math.min(100, (used / limit) * 100) : null,
  };
}

router.get("/status", async (req, res) => {
  const walletCandidate = typeof req.query.walletAddress === "string" ? req.query.walletAddress : "";
  const context = await getAccessContext(req, walletCandidate);
  if (!context) return res.status(401).json({ error: "Connect a wallet session or send a valid Clerk bearer token." });
  const access = await getWalletAccessState(context.walletAddress);
  res.json({
    configured: Boolean(routerBaseUrl() && internalSecret()),
    routerUrl: routerBaseUrl(),
    walletAddress: context.walletAddress || null,
    authProvider: context.clerk ? "clerk" : "cheshire-wallet",
    holderMinimum: access.holderMinimum,
    clawdBalance: access.balance,
    allowed: access.allowed,
  });
});

router.post("/challenge", async (req: Request, res: Response) => {
  const walletCandidate = String(req.body?.walletAddress ?? "").trim();
  const context = await getAccessContext(req, walletCandidate);
  if (!context) return res.status(401).json({ error: "Connect a wallet session or send a valid Clerk bearer token." });
  const { walletAddress } = context;
  const access = await getWalletAccessState(walletAddress);
  if (!access.allowed) {
    return res.status(403).json({ error: `API keys require the admin wallet or at least ${access.holderMinimum} $CLAWD.`, access });
  }
  try {
    res.json(buildChallenge(walletAddress));
  } catch (error: any) {
    res.status(503).json({ error: error?.message || "Challenge signing is not configured." });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const walletCandidate = typeof req.query.walletAddress === "string" ? req.query.walletAddress : "";
    const context = await getAccessContext(req, walletCandidate);
    if (!context) return res.status(401).json({ error: "Connect a wallet session or send a valid Clerk bearer token." });
    const walletAddress = context.walletAddress;
    const data = await callClawdRouter("/v1/api-keys", { method: "GET" });
    const keys = Array.isArray(data?.data) ? data.data.map(normalizeKey) : [];
    const visible = req.session?.userRole === "admin" ? keys : keys.filter((key: RouterKeyRecord) => key.walletAddress === walletAddress);
    res.json({ object: "list", data: visible });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Failed to load API keys." });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const message = String(req.body?.message ?? "");
  const challengeWallet = parseChallenge(message).wallet;
  const walletCandidate = String(req.body?.walletAddress ?? challengeWallet ?? "").trim();
  const context = await getAccessContext(req, walletCandidate);
  if (!context) return res.status(401).json({ error: "Connect a wallet session or send a valid Clerk bearer token." });
  const { walletAddress, clerk } = context;

  const access = await getWalletAccessState(walletAddress);
  if (!access.allowed) {
    return res.status(403).json({ error: `API keys require the admin wallet or at least ${access.holderMinimum} $CLAWD.`, access });
  }

  const signature = String(req.body?.signature ?? "");
  try {
    if (!message || !signature || !verifyWalletSignature(walletAddress, message, signature)) {
      return res.status(401).json({ error: "Wallet signature is missing or invalid." });
    }
  } catch {
    return res.status(401).json({ error: "Wallet signature is missing or invalid." });
  }

  const name = String(req.body?.name ?? "Cheshire Terminal key").trim().slice(0, 80) || "Cheshire Terminal key";
  const monthlyLimitUSDC = req.body?.monthlyLimitUSDC === "" || req.body?.monthlyLimitUSDC == null
    ? null
    : Number(req.body.monthlyLimitUSDC);

  try {
    const issued = await callClawdRouter("/v1/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name,
        walletAddress,
        ownerUserId: ownerUserId(req, clerk),
        ownerAuthProvider: ownerProvider(clerk),
        ownerTokenType: ownerTokenType(clerk),
        scopes: Array.isArray(req.body?.scopes) && req.body.scopes.length ? req.body.scopes : DEFAULT_SCOPES,
        monthlyLimitUSDC: Number.isFinite(monthlyLimitUSDC) ? monthlyLimitUSDC : null,
      }),
    });
    res.status(201).json({ ...issued, key: normalizeKey(issued.key) });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Failed to issue API key." });
  }
});

router.get("/usage", async (req: Request, res: Response) => {
  try {
    const keyId = typeof req.query.keyId === "string" ? req.query.keyId.trim() : "";
    const walletCandidate = typeof req.query.walletAddress === "string" ? req.query.walletAddress : "";
    const context = await getAccessContext(req, walletCandidate);
    if (!context) return res.status(401).json({ error: "Connect a wallet session or send a valid Clerk bearer token." });
    const data = await callClawdRouter("/v1/usage", { method: "GET" });
    const walletAddress = context.walletAddress;
    const keys = Array.isArray(data?.localKeys) ? data.localKeys.map(normalizeKey) : [];
    const visible = req.session?.userRole === "admin" ? keys : keys.filter((key: RouterKeyRecord) => key.walletAddress === walletAddress);
    res.json({
      usage: data?.usage ?? null,
      apiKey: keyId ? visible.find((key: RouterKeyRecord) => key.id === keyId) ?? null : null,
      localKeys: visible,
    });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Failed to load usage." });
  }
});

export default router;
