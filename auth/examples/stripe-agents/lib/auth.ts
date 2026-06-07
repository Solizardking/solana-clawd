// CAAP/1.0 auth for clawd-token-pay — SIWS + CLAWD token-native payment capabilities.
import { createCaapPlugin } from "@clawd/agent-auth-solana";
import { jwtVerify, SignJWT } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-token-pay-dev-secret-min-32"
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

// CLAWD-native token payment capabilities — no Stripe, no credit cards
export const PAY_CAPABILITIES = [
  {
    name: "pay.balance",
    description: "Check the caller's CLAWD and SOL balance.",
    input: { type: "object", properties: {} },
  },
  {
    name: "pay.transfer",
    description: "Transfer SOL or CLAWD to a recipient wallet. Requires Silver tier.",
    input: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient wallet address" },
        amountLamports: { type: "number", description: "Amount in lamports (for SOL)" },
        token: { type: "string", enum: ["SOL", "CLAWD"], description: "Token to transfer" },
      },
      required: ["to", "amountLamports", "token"],
    },
  },
  {
    name: "pay.swap",
    description: "Swap tokens via Jupiter. Requires Bronze tier.",
    input: {
      type: "object",
      properties: {
        inputMint: { type: "string" },
        outputMint: { type: "string" },
        amountIn: { type: "number" },
        slippageBps: { type: "number" },
      },
      required: ["inputMint", "outputMint", "amountIn"],
    },
  },
  {
    name: "pay.history",
    description: "View recent on-chain transaction history for the caller's wallet.",
    input: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
] as const;
