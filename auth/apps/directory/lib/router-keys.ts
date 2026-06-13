import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { auth } from "@clerk/nextjs/server";

type ClerkTokenType = "session_token" | "oauth_token" | "api_key";

export type RouterAuth = {
  userId: string;
  tokenType?: string;
  scopes?: string[];
};

export type WalletChallengePayload = {
  userId: string;
  walletAddress: string;
  nonce: string;
  expiresAt: string;
};

export type WalletChallenge = {
  message: string;
  token: string;
  expiresAt: string;
};

const ACCEPTED_TOKENS: ClerkTokenType[] = ["session_token", "oauth_token", "api_key"];

export async function requireRouterClerkAuth(requiredScope?: string): Promise<RouterAuth | Response> {
  const result = await auth({ acceptsToken: ACCEPTED_TOKENS });

  if (!result.isAuthenticated || !result.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenType = "tokenType" in result ? String(result.tokenType ?? "") : undefined;
  const scopes = "scopes" in result && Array.isArray(result.scopes) ? result.scopes.map(String) : [];

  if (tokenType === "api_key" && requiredScope && !scopes.includes(requiredScope)) {
    return Response.json({ error: `API key missing the "${requiredScope}" scope` }, { status: 401 });
  }

  return { userId: result.userId, tokenType, scopes };
}

export function createWalletChallenge(userId: string, walletAddress: string): WalletChallenge {
  assertSolanaAddress(walletAddress);
  const payload: WalletChallengePayload = {
    userId,
    walletAddress,
    nonce: randomBytes(16).toString("hex"),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);
  const message = formatChallengeMessage(payload);
  return { message, token: `${body}.${signature}`, expiresAt: payload.expiresAt };
}

export function verifyWalletChallenge(params: {
  userId: string;
  walletAddress: string;
  challenge: string;
  signedMessage: string;
  signature: string;
}): WalletChallengePayload {
  const [body, signature] = params.challenge.split(".");
  if (!body || !signature || !safeEqual(signature, sign(body))) {
    throw new Error("Invalid wallet challenge.");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as WalletChallengePayload;
  if (payload.userId !== params.userId || payload.walletAddress !== params.walletAddress) {
    throw new Error("Wallet challenge does not match this user and wallet.");
  }
  if (Date.parse(payload.expiresAt) < Date.now()) {
    throw new Error("Wallet challenge expired.");
  }

  const expectedMessage = formatChallengeMessage(payload);
  if (params.signedMessage !== expectedMessage) {
    throw new Error("Signed message mismatch.");
  }

  verifySolanaSignature(payload.walletAddress, expectedMessage, params.signature);
  return payload;
}

export async function callRouter(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = process.env.CLAWDROUTER_PUBLIC_URL ?? process.env.NEXT_PUBLIC_CLAWDROUTER_URL ?? "https://clawd-router.fly.dev";
  const internalSecret = process.env.CLAWDROUTER_INTERNAL_SECRET;

  if (!internalSecret) {
    return Response.json({ error: "CLAWDROUTER_INTERNAL_SECRET is not configured." }, { status: 500 });
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  headers.set("X-ClawdRouter-Internal-Secret", internalSecret);

  return fetch(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

function formatChallengeMessage(payload: WalletChallengePayload): string {
  return [
    "ClawdRouter API key request",
    "",
    `User: ${payload.userId}`,
    `Wallet: ${payload.walletAddress}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${payload.expiresAt}`,
    "",
    "Only sign this message on the ClawdRouter key page.",
  ].join("\n");
}

function verifySolanaSignature(walletAddress: string, message: string, signature: string): void {
  assertSolanaAddress(walletAddress);
  const publicKey = new PublicKey(walletAddress);
  const encodedMessage = new TextEncoder().encode(message);
  const decodedSignature = bs58.decode(signature);

  if (!PublicKey.isOnCurve(publicKey.toBytes())) {
    throw new Error("Wallet public key is not on the Ed25519 curve.");
  }

  const ok = nacl.sign.detached.verify(encodedMessage, decodedSignature, publicKey.toBytes());
  if (!ok) throw new Error("Invalid Solana wallet signature.");
}

function assertSolanaAddress(walletAddress: string): void {
  try {
    new PublicKey(walletAddress);
  } catch {
    throw new Error("Invalid Solana wallet address.");
  }
}

function sign(body: string): string {
  return createHmac("sha256", challengeSecret()).update(body).digest("base64url");
}

function challengeSecret(): string {
  return process.env.ROUTER_WALLET_CHALLENGE_SECRET ?? process.env.BETTER_AUTH_SECRET ?? process.env.CLAWDROUTER_INTERNAL_SECRET ?? "development-router-wallet-secret";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
