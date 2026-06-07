// CAAP/1.0 auth — Sign In With Solana + CLAWD tier gating. No better-auth.
import {
  attestAgent,
  computeTier,
  createCaapPlugin,
  createSiwsInput,
  fetchWalletSnapshot,
  verifySiws,
} from "@clawd/agent-auth-solana";
import { SignJWT, jwtVerify } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-deploy-dev-secret-min-32-chars"
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

export const MAX_HTML_SIZE = 5 * 1024 * 1024;
export const MAX_NAME_LENGTH = 200;

// Capability definitions (CLAWD-native, no better-auth Capability type)
export const DEPLOY_CAPABILITIES = [
  {
    name: "sites.list",
    description: "List all deployed sites for the authenticated wallet",
    input: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "sites.create",
    description: "Deploy a new HTML site. Requires Bronze tier or higher.",
    input: {
      type: "object",
      properties: {
        name: { type: "string" },
        html: { type: "string" },
        description: { type: "string" },
      },
      required: ["name", "html"],
    },
  },
  {
    name: "sites.update",
    description: "Update an existing site's content",
    input: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        html: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "sites.delete",
    description: "Delete a site. Requires Silver tier or higher.",
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
] as const;

export { createSiwsInput, verifySiws, computeTier, attestAgent, fetchWalletSnapshot };
