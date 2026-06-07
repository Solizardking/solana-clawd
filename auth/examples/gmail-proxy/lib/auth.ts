// CAAP/1.0 auth for clawd-mcp — SIWS + CLAWD-gated MCP proxy capabilities.
import { createCaapPlugin } from "@clawd/agent-auth-solana";
import { jwtVerify, SignJWT } from "jose";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "clawd-mcp-dev-secret-at-least-32ch"
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

// CLAWD MCP proxy capabilities — exposes Solana/CLAWD tools to AI agents
export const MCP_CAPABILITIES = [
  {
    name: "mcp.tools.list",
    description: "List available MCP tools registered with this proxy.",
    input: { type: "object", properties: {} },
  },
  {
    name: "mcp.tools.call",
    description: "Call an MCP tool by name with arguments. Requires Bronze tier.",
    input: {
      type: "object",
      properties: {
        tool: { type: "string", description: "Tool name" },
        args: { type: "object", description: "Tool arguments" },
      },
      required: ["tool"],
    },
  },
  {
    name: "mcp.attest",
    description: "Run CAAP attestation for an agent wallet. Returns tier and verification status.",
    input: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        walletAddress: { type: "string" },
      },
      required: ["agentId", "walletAddress"],
    },
  },
  {
    name: "mcp.discovery",
    description: "Return the CAAP/1.0 discovery document for this proxy.",
    input: { type: "object", properties: {} },
  },
] as const;
