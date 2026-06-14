import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Sanitize a string-ish value (e.g. from a JSON body) into a trimmed,
 * length-bounded optional string. Used to bound the user-controlled
 * fields we accept before they are written to the DB.
 */
function str(value: unknown, max = 512): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max) || undefined;
}

const PRIMARY_ADMIN_WALLET = "Becdrh2JbLt8qcLXpNbNF8w4Z5W1AQXJhGYMDigjcJr3";
const LEGACY_ADMIN_WALLET = "EFH1ouVP6ikYgyHm9zaLXSPHJDXsfVcaVLFPjtzw6BbF";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const HOLDER_MIN = Number(process.env.CLAWD_HOLDER_MIN ?? "1");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_CLAWD_BALANCE = 1_000_000;
const SOL_INCINERATOR = "1nc1nerator11111111111111111111111111111111";
const DEFAULT_TREASURY_WALLET = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const INITIAL_SUPPLY_FALLBACK = 1_000_000_000;
const SUPPLY_CACHE_TTL_MS = 15_000;

type ClawdSupplyStats = {
  mint: string;
  decimals: number;
  initial: number;
  current: number;
  floating: number;
  locked: number;
  burned: number;
  burnedPct: number;
  effectiveBurned: number;
  effectiveBurnedPct: number;
  incineratorBalance: number;
  lockedBreakdown: { owner: string; amount: number; label: string }[];
  updatedAt: string;
};

let supplyCache: { at: number; data: ClawdSupplyStats } | null = null;

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBase64url(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function adminWalletList() {
  const primaryAdmin =
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    process.env.TREASURY_WALLET ||
    PRIMARY_ADMIN_WALLET;
  const configuredWallets = [
    process.env.ADMIN_WALLETS || "",
    process.env.ADMINWALLETS || "",
    process.env.CLAWD_ADMIN_WALLETS || "",
  ]
    .flatMap((value) => value.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  const wallets = Array.from(new Set(configuredWallets));
  if (!wallets.includes(primaryAdmin)) {
    wallets.push(primaryAdmin);
  }
  if (!wallets.includes(PRIMARY_ADMIN_WALLET)) {
    wallets.push(PRIMARY_ADMIN_WALLET);
  }
  if (!wallets.includes(LEGACY_ADMIN_WALLET)) {
    wallets.push(LEGACY_ADMIN_WALLET);
  }
  return wallets;
}

function isAdminWallet(wallet: string): boolean {
  return adminWalletList().includes(wallet);
}

function getCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v ?? "");
  }
  return null;
}

function requestProto(req: Request): string {
  const appForwarded = req.headers.get("x-cheshire-forwarded-proto")?.split(",")[0]?.trim();
  if (appForwarded) return appForwarded;
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return new URL(req.url).protocol.replace(":", "");
  } catch {
    return "https";
  }
}

function isSecureRequest(req: Request): boolean {
  return requestProto(req) === "https";
}

function sessionCookieName(req: Request) {
  return isSecureRequest(req) ? "__Host-cheshire.sid" : "cheshire.sid";
}

function buildSessionCookie(req: Request, value: string, maxAgeSeconds: number) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${sessionCookieName(req)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie(req: Request) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${sessionCookieName(req)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function getSessionCookie(req: Request) {
  return getCookie(req, "__Host-cheshire.sid") ?? getCookie(req, "cheshire.sid");
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cookie",
  };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

async function getClawdBalance(wallet: string): Promise<number> {
  const apiKey = process.env.HELIUS_API_KEY ?? "";
  if (!apiKey) return 0;
  try {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "clawd-balance",
        method: "getTokenAccountsByOwner",
        params: [wallet, { mint: CLAWD_MINT }, { encoding: "jsonParsed" }],
      }),
    });
    const data = (await r.json()) as any;
    if (data.error) return 0;
    let raw = 0, decimals = 6;
    for (const acc of (data.result?.value ?? [])) {
      const info = acc.account?.data?.parsed?.info;
      if (info) {
        raw += Number(info.tokenAmount?.amount ?? 0);
        decimals = info.tokenAmount?.decimals ?? decimals;
      }
    }
    return raw / Math.pow(10, decimals);
  } catch { return 0; }
}

async function rpc<T = any>(method: string, params: any): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY ?? "";
  if (!apiKey) return null;
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    });
    const json = await response.json() as any;
    if (json?.error) return null;
    return json?.result ?? null;
  } catch {
    return null;
  }
}

function lockedWallets() {
  const treasuryWallet =
    process.env.TREASURY_WALLET ||
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    DEFAULT_TREASURY_WALLET;
  const configured = (process.env.CLAWD_LOCKED_WALLETS || "")
    .split(",")
    .map((wallet) => wallet.trim())
    .filter(Boolean);
  return Array.from(new Set([treasuryWallet, ...configured]));
}

async function ownerTokenBalance(owner: string) {
  const response = await rpc<any>("getTokenAccountsByOwner", [
    owner,
    { mint: CLAWD_MINT },
    { encoding: "jsonParsed" },
  ]);
  return (response?.value || []).reduce((sum: number, account: any) => {
    return sum + Number(account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }, 0);
}

async function getClawdSupplyStats(): Promise<ClawdSupplyStats | null> {
  if (supplyCache && Date.now() - supplyCache.at < SUPPLY_CACHE_TTL_MS) {
    return supplyCache.data;
  }

  const [asset, supplyResult] = await Promise.all([
    rpc<any>("getAsset", { id: CLAWD_MINT }),
    rpc<any>("getTokenSupply", [CLAWD_MINT]),
  ]);
  if (!asset && !supplyResult) return null;

  const decimals =
    asset?.token_info?.decimals ??
    supplyResult?.value?.decimals ??
    Number(process.env.CLAWD_DECIMALS ?? "6");
  const currentSupplyRaw = Number(asset?.token_info?.supply ?? supplyResult?.value?.amount ?? 0);
  const current = currentSupplyRaw / Math.pow(10, decimals);
  const initial = Number(process.env.CLAWD_INITIAL_SUPPLY ?? INITIAL_SUPPLY_FALLBACK);
  const burned = Math.max(0, initial - current);

  let locked = 0;
  const treasuryWallet =
    process.env.TREASURY_WALLET ||
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    DEFAULT_TREASURY_WALLET;
  const lockedBreakdown: ClawdSupplyStats["lockedBreakdown"] = [];
  for (const owner of lockedWallets()) {
    const amount = await ownerTokenBalance(owner);
    if (amount <= 0) continue;
    locked += amount;
    lockedBreakdown.push({
      owner,
      amount,
      label: owner === treasuryWallet ? "Treasury" : "Locked",
    });
  }

  const incineratorBalance = await ownerTokenBalance(SOL_INCINERATOR);
  const effectiveBurned = burned + incineratorBalance;
  const data: ClawdSupplyStats = {
    mint: CLAWD_MINT,
    decimals,
    initial,
    current,
    floating: Math.max(0, current - locked),
    locked,
    burned,
    burnedPct: initial > 0 ? (burned / initial) * 100 : 0,
    effectiveBurned,
    effectiveBurnedPct: initial > 0 ? (effectiveBurned / initial) * 100 : 0,
    incineratorBalance,
    lockedBreakdown,
    updatedAt: new Date().toISOString(),
  };

  supplyCache = { at: Date.now(), data };
  return data;
}

// GET /api/auth/entry
export const entryHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const sessionToken = getSessionCookie(req);
  const session = sessionToken
    ? await ctx.runQuery(internal.walletAuth.getSession, { sessionToken })
    : null;
  const sessionActive = !!session && !session.revokedAt && session.expiresAt >= Date.now();
  const walletAddress = sessionActive ? session.walletAddress : null;
  const adminCheck = walletAddress ? isAdminWallet(walletAddress) : false;
  const clawdBalance = walletAddress ? (adminCheck ? ADMIN_CLAWD_BALANCE : await getClawdBalance(walletAddress)) : 0;
  const supply = await getClawdSupplyStats();

  return json({
    authenticated: sessionActive,
    walletAddress,
    isHolder: adminCheck || clawdBalance >= HOLDER_MIN,
    clawdBalance,
    holderMinimum: HOLDER_MIN,
    clawdMint: CLAWD_MINT,
    clawdSupply: supply,
  }, 200, c);
});

// GET /api/auth/challenge?wallet=...
export const challengeHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return json({ error: "Valid wallet query param required" }, 400, c);
  }

  const nonce = randomBase64url(32);
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000;
  const message = [
    "Sign in to CLAWD Terminal",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(now).toISOString()}`,
    `Holder requirement: >= ${HOLDER_MIN} $CLAWD`,
  ].join("\n");

  await ctx.runMutation(internal.walletAuth.storeChallenge, { walletAddress: wallet, nonce, message, expiresAt });
  return json({ message, nonce, expiresAt }, 200, c);
});

// POST /api/auth/verify
export const verifyHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, c); }

  const walletAddress = typeof body?.walletAddress === "string" ? body.walletAddress.trim() : "";
  const signature = typeof body?.signature === "string" ? body.signature.trim() : "";
  const message = typeof body?.message === "string" ? body.message : "";

  if (!walletAddress || !signature || !message) {
    return json({ error: "walletAddress, signature, and message are required" }, 400, c);
  }

  const challenge = await ctx.runQuery(internal.walletAuth.getChallenge, { walletAddress });
  if (!challenge || challenge.usedAt) {
    return json({ error: "No pending challenge. Request a new challenge." }, 401, c);
  }
  if (challenge.expiresAt < Date.now()) {
    return json({ error: "Challenge expired. Sign in again." }, 401, c);
  }
  if (challenge.message !== message || !message.includes(challenge.nonce)) {
    return json({ error: "Message nonce mismatch." }, 401, c);
  }

  let sigBytes: Uint8Array, walletBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(signature);
    walletBytes = bs58.decode(walletAddress);
    if (sigBytes.length !== 64 || walletBytes.length !== 32) throw new Error("bad lengths");
  } catch {
    return json({ error: "Invalid wallet address or signature encoding." }, 400, c);
  }

  if (!nacl.sign.detached.verify(new TextEncoder().encode(message), sigBytes, walletBytes)) {
    return json({ error: "Invalid signature. Authentication failed." }, 401, c);
  }

  await ctx.runMutation(internal.walletAuth.markChallengeUsed, { challengeId: challenge._id });

  const adminCheck = isAdminWallet(walletAddress);
  const clawdBalance = adminCheck ? 1_000_000 : await getClawdBalance(walletAddress);
  const isHolder = adminCheck || clawdBalance >= HOLDER_MIN;

  if (!isHolder) {
    return json({ error: `Access requires at least ${HOLDER_MIN} $CLAWD.`, walletAddress, clawdBalance, isHolder: false }, 403, c);
  }

  const { userId } = await ctx.runMutation(internal.walletAuth.upsertUserForSignIn, {
    walletAddress, isAdmin: adminCheck, clawdBalance,
  });

  const sessionToken = randomHex(40);
  const ipAddress = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  await ctx.runMutation(internal.walletAuth.createSession, {
    userId, walletAddress, sessionToken, loginMethod: "solana-wallet",
    ipAddress, userAgent, isTokenHolder: true, clawdBalance,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  const user = await ctx.runQuery(internal.walletAuth.getUserById, { userId });
  const cookie = buildSessionCookie(req, sessionToken, Math.floor(SESSION_TTL_MS / 1000));
  return new Response(JSON.stringify({
    ok: true, walletAddress, userId, role: adminCheck ? "admin" : "user",
    clawdBalance, isTokenGated: true,
    onboardingCompleted: user?.onboardingCompleted ?? false,
    profile: {
      agentName: user?.agentName ?? null,
      displayName: user?.name ?? null,
      bio: user?.bio ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      twitterUsername: user?.twitterUsername ?? null,
      githubUsername: user?.githubUsername ?? null,
    },
    agents: [],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie, ...c },
  });
});

// GET /api/auth/me
export const meHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const sessionToken = getSessionCookie(req);
  if (!sessionToken) return json({ authenticated: false }, 200, c);

  const session = await ctx.runQuery(internal.walletAuth.getSession, { sessionToken });
  if (!session || session.revokedAt || session.expiresAt < Date.now()) {
    return json({ authenticated: false }, 200, c);
  }

  await ctx.runMutation(internal.walletAuth.touchSession, { sessionId: session._id });

  const user = await ctx.runQuery(internal.walletAuth.getUserById, { userId: session.userId });
  const adminCheck = isAdminWallet(session.walletAddress);

  return json({
    authenticated: true,
    userId: session.userId,
    walletAddress: session.walletAddress,
    role: adminCheck ? "admin" : "user",
    clawdBalance: adminCheck ? 1_000_000 : session.clawdBalance,
    isTokenGated: true,
    onboardingCompleted: user?.onboardingCompleted ?? false,
    profile: {
      agentName: user?.agentName ?? null,
      displayName: user?.name ?? null,
      bio: user?.bio ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      twitterUsername: user?.twitterUsername ?? null,
      githubUsername: user?.githubUsername ?? null,
    },
    agents: [],
  }, 200, c);
});

// GET /api/auth/status
export const statusHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const sessionToken = getSessionCookie(req);
  if (!sessionToken) {
    return json({ isAuthenticated: false }, 200, c);
  }

  const session = await ctx.runQuery(internal.walletAuth.getSession, { sessionToken });
  if (!session || session.revokedAt || session.expiresAt < Date.now()) {
    return json({ isAuthenticated: false }, 200, c);
  }

  return json({
    isAuthenticated: true,
    walletAddress: session.walletAddress,
    userId: session.userId,
  }, 200, c);
});

// POST /api/auth/logout
export const logoutHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const sessionToken = getSessionCookie(req);
  if (sessionToken) {
    await ctx.runMutation(internal.walletAuth.revokeSession, { sessionToken });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(req),
      ...c,
    },
  });
});

// POST /api/auth/profile
export const profileHandler = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const sessionToken = getSessionCookie(req);
  if (!sessionToken) return json({ error: "Unauthorized" }, 401, c);

  const session = await ctx.runQuery(internal.walletAuth.getSession, { sessionToken });
  if (!session || session.revokedAt || session.expiresAt < Date.now()) {
    return json({ error: "Unauthorized" }, 401, c);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, c); }

  const agentName = typeof body.agentName === "string" ? body.agentName.trim().slice(0, 64) || undefined : undefined;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 128) || undefined : undefined;
  const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 280) || undefined : undefined;
  const twitterUsername = typeof body.twitterUsername === "string" ? body.twitterUsername.trim().replace(/^@/, "").slice(0, 64) || undefined : undefined;
  const githubUsername = typeof body.githubUsername === "string" ? body.githubUsername.trim().replace(/^@/, "").slice(0, 64) || undefined : undefined;
  const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim().slice(0, 500) || undefined : undefined;
  const onboardingCompleted = Boolean(agentName);

  await ctx.runMutation(internal.walletAuth.updateUserProfile, {
    userId: session.userId,
    walletAddress: session.walletAddress,
    agentName,
    displayName,
    bio,
    twitterUsername,
    githubUsername,
    avatarUrl,
    onboardingCompleted,
  });

  return json({ ok: true, onboardingCompleted }, 200, c);
});

// ── Twitter OAuth link (wallet-session-scoped PKCE flow) ─────────────────────

function generatePkceVerifier(): string {
  const arr = new Uint8Array(43);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...Array.from(arr)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(hash))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

const APP_URL = () => (process.env.BETTER_AUTH_URL ?? "https://cheshireterminal.ai").replace(/\/$/, "");
// Must match the Redirect URI registered in the Twitter Developer App
const TWITTER_LINK_CALLBACK = () =>
  process.env.TWITTER_LINK_CALLBACK_URL ?? `${APP_URL()}/api/auth/twitter-link/callback`;

// GET /api/auth/twitter-link/start
export const twitterLinkStartHandler = httpAction(async (ctx, req) => {
  const base = APP_URL();
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=not_configured` } });
  }

  const sessionToken = getSessionCookie(req);
  if (!sessionToken) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=not_authenticated` } });
  }

  const session = await ctx.runQuery(internal.walletAuth.getSession, { sessionToken });
  if (!session || session.revokedAt || session.expiresAt < Date.now()) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=not_authenticated` } });
  }

  const verifier = generatePkceVerifier();
  const challenge = await generatePkceChallenge(verifier);
  const state = randomHex(16);

  await ctx.runMutation(internal.walletAuth.storeTwitterOAuthState, {
    sessionToken,
    state,
    codeVerifier: verifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: TWITTER_LINK_CALLBACK(),
    scope: "tweet.read users.read offline.access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `https://twitter.com/i/oauth2/authorize?${params}` },
  });
});

// GET /api/auth/twitter-link/callback
export const twitterLinkCallbackHandler = httpAction(async (ctx, req) => {
  const base = APP_URL();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=${encodeURIComponent(error)}` } });
  }
  if (!code || !state) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=invalid_callback` } });
  }

  const oauthState = await ctx.runMutation(internal.walletAuth.getAndConsumeTwitterOAuthState, { state });
  if (!oauthState) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=invalid_state` } });
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=not_configured` } });
  }

  const basicCreds = btoa(`${clientId}:${clientSecret}`);
  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${basicCreds}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: TWITTER_LINK_CALLBACK(),
      code_verifier: oauthState.codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=token_exchange_failed` } });
  }

  const tokenData = await tokenRes.json() as { access_token: string };

  const userRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username,name", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return new Response(null, { status: 302, headers: { Location: `${base}?twitterError=user_fetch_failed` } });
  }

  const { data: twitterUser } = await userRes.json() as {
    data: { id: string; username: string; name: string };
  };

  const handle = twitterUser.username;

  const session = await ctx.runQuery(internal.walletAuth.getSession, { sessionToken: oauthState.sessionToken });
  if (session && !session.revokedAt && session.expiresAt > Date.now()) {
    await ctx.runMutation(internal.walletAuth.updateTwitterUsername, {
      userId: session.userId,
      walletAddress: session.walletAddress,
      twitterUsername: handle,
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `${base}?twitterLinked=1&twitterHandle=${encodeURIComponent(handle)}` },
  });
});
