// CAAP/1.0 auth for clawd-gateway — SIWS + CLAWD API gateway capabilities.
import { createCaapPlugin } from "@clawd/agent-auth-solana";
import { jwtVerify, SignJWT } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-gateway-dev-secret-min-32ch"
);

export function buildRpcUrl(): string {
  const key = process.env.HELIUS_API_KEY ?? "";
  return key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";
}

export async function createSession(walletAddress: string, tier: string): Promise<string> {
  return new SignJWT({ walletAddress, tier })
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

export const caap = createCaapPlugin({
  heliusApiKey: process.env.HELIUS_API_KEY,
  clawdMint: CLAWD_MINT,
  enableSubscriptionTiers: true,
  enableDasAttestation: true,
});

// CLAWD API gateway capabilities — tier-gated LLM and data access
export const GATEWAY_CAPABILITIES = [
  {
    name: "gateway.status",
    description: "Check the CLAWD gateway status and the caller's tier and rate limits.",
    input: { type: "object", properties: {} },
  },
  {
    name: "gateway.llm",
    description: "Proxy an LLM completion request through the CLAWD gateway. Requires Bronze tier.",
    input: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model ID (e.g. claude-sonnet-4-6)" },
        messages: { type: "array", description: "Chat messages array" },
        maxTokens: { type: "number" },
      },
      required: ["model", "messages"],
    },
  },
  {
    name: "gateway.rpc",
    description: "Proxy a Solana RPC call through the CLAWD gateway. Requires Bronze tier.",
    input: {
      type: "object",
      properties: {
        method: { type: "string", description: "RPC method name" },
        params: { type: "array" },
      },
      required: ["method"],
    },
  },
  {
    name: "gateway.discovery",
    description: "Return the CAAP/1.0 discovery document for this gateway.",
    input: { type: "object", properties: {} },
  },
] as const;
