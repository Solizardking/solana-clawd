// CAAP/1.0 auth for clawd-pump — SIWS + CLAWD token-gated pump.fun capabilities.
import { createCaapPlugin } from "@clawd/agent-auth-solana";
import { jwtVerify, SignJWT } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
export const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-pump-dev-secret-min-32-chars"
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

// CLAWD pump.fun capabilities — tier-gated
export const PUMP_CAPABILITIES = [
  {
    name: "pump.quote",
    description: "Get a buy/sell quote for any pump.fun token using the bonding curve.",
    input: {
      type: "object",
      properties: {
        mint: { type: "string", description: "Token mint address" },
        side: { type: "string", enum: ["buy", "sell"] },
        amountSol: { type: "number", description: "SOL amount for buy, or token amount for sell" },
      },
      required: ["mint", "side", "amountSol"],
    },
  },
  {
    name: "pump.buy",
    description: "Buy a token on pump.fun. Requires Bronze tier or higher.",
    input: {
      type: "object",
      properties: {
        mint: { type: "string" },
        amountSol: { type: "number" },
        slippageBps: { type: "number", description: "Slippage in basis points (default 500)" },
      },
      required: ["mint", "amountSol"],
    },
  },
  {
    name: "pump.sell",
    description: "Sell a token on pump.fun. Requires Bronze tier or higher.",
    input: {
      type: "object",
      properties: {
        mint: { type: "string" },
        tokenAmount: { type: "number" },
        slippageBps: { type: "number" },
      },
      required: ["mint", "tokenAmount"],
    },
  },
  {
    name: "pump.launch",
    description: "Launch a new token on pump.fun. Requires Gold tier or higher.",
    input: {
      type: "object",
      properties: {
        name: { type: "string" },
        symbol: { type: "string" },
        description: { type: "string" },
        initialBuySol: { type: "number" },
      },
      required: ["name", "symbol"],
    },
  },
] as const;

