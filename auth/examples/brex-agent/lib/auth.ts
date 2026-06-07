// CAAP/1.0 auth for clawd-perps — SIWS + Phoenix DEX perpetuals capabilities.
import { createCaapPlugin } from "@clawd/agent-auth-solana";
import { jwtVerify, SignJWT } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-perps-dev-secret-min-32-chars"
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

// Phoenix DEX perpetuals capabilities — CLAWD tier-gated
export const PERPS_CAPABILITIES = [
  {
    name: "perps.markets",
    description: "List available perpetual markets on Phoenix DEX with funding rates and OI.",
    input: { type: "object", properties: {} },
  },
  {
    name: "perps.position",
    description: "Get the caller's current open positions. Requires Bronze tier.",
    input: {
      type: "object",
      properties: { market: { type: "string", description: "Market symbol e.g. SOL-PERP" } },
    },
  },
  {
    name: "perps.open",
    description: "Open a long or short perpetual position. Requires Silver tier.",
    input: {
      type: "object",
      properties: {
        market: { type: "string" },
        side: { type: "string", enum: ["long", "short"] },
        sizeUsd: { type: "number", description: "Position size in USD" },
        leverage: { type: "number", description: "Leverage multiplier (1–20)" },
      },
      required: ["market", "side", "sizeUsd"],
    },
  },
  {
    name: "perps.close",
    description: "Close an existing perpetual position. Requires Silver tier.",
    input: {
      type: "object",
      properties: {
        market: { type: "string" },
        positionId: { type: "string" },
      },
      required: ["market"],
    },
  },
  {
    name: "perps.history",
    description: "Get trade history for the caller's wallet.",
    input: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
] as const;
