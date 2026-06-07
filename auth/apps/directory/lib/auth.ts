// CAAP/1.0 auth for the agent directory — SIWS replaces email/password + GitHub OAuth.
import {
  attestAgent,
  computeTier,
  createCaapPlugin,
  createSiwsInput,
  fetchWalletSnapshot,
  verifySiws,
} from "@clawd/agent-auth-solana";
import { jwtVerify, SignJWT } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
export const BASE_URL =
  process.env.CAAP_BASE_URL ?? process.env.PORTLESS_URL ?? "http://directory.localhost";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-directory-dev-secret-32chars"
);

export function buildRpcUrl(): string {
  const key = process.env.HELIUS_API_KEY ?? "";
  return key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";
}

export async function createSession(walletAddress: string, tier: string): Promise<string> {
  return new SignJWT({ walletAddress, tier, iss: BASE_URL })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SESSION_SECRET);
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return payload as { walletAddress: string; tier: string };
  } catch {
    return null;
  }
}

// CAAP plugin — exposes /caap/attest, /caap/status/:agentId, /caap/discovery
export const caap = createCaapPlugin({
  heliusApiKey: process.env.HELIUS_API_KEY,
  clawdMint: CLAWD_MINT,
  enableSubscriptionTiers: true,
  enableDasAttestation: true,
});

export { attestAgent, computeTier, createSiwsInput, fetchWalletSnapshot, verifySiws };
