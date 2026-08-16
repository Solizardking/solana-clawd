/**
 * OpenClawd / Solana Clawd agent registration + attestation helpers.
 *
 * Pure metadata and CLI stubs load without secrets or optional Metaplex packages.
 * On-chain mint/attestation only runs when invoked explicitly (e.g. `mint` subcommand)
 * and uses dynamic imports so mere import of this module never requires a secret key.
 *
 * Usage:
 *   npx tsx cli/clawd-register.ts              # print metadata
 *   npx tsx cli/clawd-register.ts mint         # Metaplex mint (needs deps + key)
 *   node --experimental-strip-types -e "import('./cli/clawd-register.ts').then(m => console.log(Object.keys(m)))"
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Shared service bases (aligned with clawd-cli.sh / clawd-connect.sh / JSON)
// ---------------------------------------------------------------------------

export const SERVICE_BASES = {
  site: process.env.CLAWD_SITE_BASE ?? "https://solanaclawd.com",
  api: process.env.CLAWD_API_BASE ?? "https://solanaclawd.com/api",
  marketplace:
    process.env.CLAWD_MARKETPLACE_BASE ?? "https://solanaclawd.com/marketplace",
  // Live facilitator JSON is under /api/x402 (SPA HTML at /x402)
  x402: process.env.CLAWD_X402_GATEWAY ?? "https://solanaclawd.com/api/x402",
  mcp: process.env.CLAWD_MCP_BASE ?? "https://solanaclawd.com/mcp",
  a2a: process.env.CLAWD_A2A_BASE ?? "https://solanaclawd.com/a2a",
  websocket: "wss://solanaclawd.com/ws",
} as const;

/** SAS program used by attestation commands in the shell CLIs */
export const SAS_PROGRAM_ID =
  process.env.CLAWD_SAS_PROGRAM_ID ??
  "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";

export const TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const EVENT_AUTHORITY_PDA =
  "DzSpKpST2TSyrxokMXchFz3G2yn5WEGoxzpGEUDjCX4g";

// ---------------------------------------------------------------------------
// Agent identity metadata (must match solana-clawd-registration.json)
// ---------------------------------------------------------------------------

export const SOLANA_CLAWD_AGENT_METADATA = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "Solana Clawd",
  description:
    "The Solana-native AI agent framework for autonomous operators. Built for high-frequency memecoin trading environments with real-time market data, wallet tracking, OODA-loop execution, and multi-agent orchestration.",
  image: "https://solanaclawd.com/clawd-logo.png",
  uri: "https://solanaclawd.com/agent-metadata.json",
  services: [
    {
      name: "web",
      endpoint: SERVICE_BASES.site,
      version: "1.0",
    },
    {
      name: "MCP",
      endpoint: SERVICE_BASES.mcp,
      version: "2026-04-12",
    },
    {
      name: "A2A",
      endpoint: SERVICE_BASES.a2a,
      version: "0.3.0",
    },
  ],
  active: true,
  registrations: [] as unknown[],
  supportedTrust: ["wallet-verified", "token-holder"] as const,
} as const;

// ---------------------------------------------------------------------------
// openclawd registration (must match clawd-registration.json services/trust)
// ---------------------------------------------------------------------------

export const OPENCLAWD_REGISTRATION = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "openclawd",
  description:
    "The complete open-source stack for building, deploying, and monetizing AI agents on Solana. One router · one settlement layer · 33 projects · 50 agents · 100 skills.",
  image: "https://solanaclawd.com/og-image.png",
  services: [
    {
      name: "dashboard",
      endpoint: SERVICE_BASES.site,
      description:
        "Main dashboard — agent discovery, skills marketplace, x402 payment gateway",
    },
    {
      name: "api",
      endpoint: SERVICE_BASES.api,
      description: "REST API for skills, agents, and registry operations",
    },
    {
      name: "marketplace",
      endpoint: SERVICE_BASES.marketplace,
      description: "ClawdHub skills marketplace — 100 bundled SKILL.md files",
    },
    {
      name: "x402",
      endpoint: SERVICE_BASES.x402,
      description:
        "x402 / MPP / AP2 / A2A payment gateway — SPL USDC + $CLAWD settlement",
    },
    {
      name: "mcp",
      endpoint: SERVICE_BASES.mcp,
      description: "Model Context Protocol server",
    },
    {
      name: "a2a",
      endpoint: SERVICE_BASES.a2a,
      description: "Agent-to-agent protocol endpoint",
    },
    {
      name: "websocket",
      endpoint: SERVICE_BASES.websocket,
      description:
        "Real-time streaming for on-chain events and agent communication",
    },
  ],
  x402Support: true,
  active: true,
  registrations: [] as unknown[],
  supportedTrust: [
    "wallet-verified",
    "token-holder",
    "solana-mainnet",
  ] as const,
} as const;

/**
 * Attestation schema definitions for OpenClawd (metadata only — no RPC).
 */
export const ATTESTATION_SCHEMAS = {
  SKILL: {
    name: "OpenClawdSkillAttestation",
    layout: [12, 32, 12, 8, 1],
    fieldNames: [
      "skill_id",
      "verifier_pubkey",
      "proof_hash",
      "verification_timestamp",
      "is_formally_verified",
    ],
  },
  AGENT_IDENTITY: {
    name: "OpenClawdAgentIdentity",
    layout: [12, 32, 12, 32, 1],
    fieldNames: [
      "agent_id",
      "wallet_pubkey",
      "skill_attestation",
      "vault_address",
      "is_vault_initialized",
    ],
  },
  PLUGIN: {
    name: "OpenClawdPluginAttestation",
    layout: [12, 32, 12, 34, 8, 1],
    fieldNames: [
      "plugin_id",
      "author_pubkey",
      "attestation_ref",
      "audit_proof_hash",
      "timestamp",
      "is_audited",
    ],
  },
} as const;

export interface AttestationStatus {
  address: string;
  exists: boolean;
  skillId?: string;
  verifierPubkey?: string;
  proofHash?: string;
  isVerified?: boolean;
  programId: string;
}

/**
 * Load solana-clawd-registration.json from the same directory as this module.
 */
export function loadSolanaClawdRegistrationJson(): typeof SOLANA_CLAWD_AGENT_METADATA {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "solana-clawd-registration.json"), "utf8");
  return JSON.parse(raw) as typeof SOLANA_CLAWD_AGENT_METADATA;
}

/**
 * Load clawd-registration.json (openclawd) from the same directory.
 */
export function loadOpenclawdRegistrationJson(): typeof OPENCLAWD_REGISTRATION {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "clawd-registration.json"), "utf8");
  return JSON.parse(raw) as typeof OPENCLAWD_REGISTRATION;
}

/**
 * Compare in-module Solana Clawd metadata to the on-disk registration JSON.
 * Returns a list of mismatch descriptions (empty if aligned).
 */
export function diffSolanaClawdIdentity(): string[] {
  const file = loadSolanaClawdRegistrationJson();
  const meta = SOLANA_CLAWD_AGENT_METADATA;
  const mismatches: string[] = [];

  if (file.name !== meta.name) {
    mismatches.push(`name: file=${file.name} meta=${meta.name}`);
  }
  if (file.description !== meta.description) {
    mismatches.push("description differs");
  }
  const fileTrust = [...(file.supportedTrust ?? [])].sort().join(",");
  const metaTrust = [...meta.supportedTrust].sort().join(",");
  if (fileTrust !== metaTrust) {
    mismatches.push(`supportedTrust: file=${fileTrust} meta=${metaTrust}`);
  }

  const fileEndpoints = new Map(
    (file.services ?? []).map((s: { name: string; endpoint: string }) => [
      s.name,
      s.endpoint,
    ]),
  );
  for (const svc of meta.services) {
    const ep = fileEndpoints.get(svc.name);
    if (ep !== svc.endpoint) {
      mismatches.push(
        `service ${svc.name}: file=${ep ?? "(missing)"} meta=${svc.endpoint}`,
      );
    }
  }
  return mismatches;
}

// ---------------------------------------------------------------------------
// CLI stubs (no secrets; safe on import)
// ---------------------------------------------------------------------------

export const cliCommands = {
  attestSkill: async (
    skillId: string,
    verifierId: string,
    proofHash: string,
  ) => {
    console.log("⛓️ Creating skill attestation...");
    console.log(`  Skill ID: ${skillId}`);
    console.log(`  Verifier: ${verifierId}`);
    console.log(`  Proof Hash: ${proofHash}`);
    console.log(`  Program: ${SAS_PROGRAM_ID}`);
    console.log("✓ Attestation created on-chain (stub — wire SDK for live)");
    return { skillId, verifierId, proofHash, status: "attested" as const };
  },

  verifyAttestation: async (address: string) => {
    console.log("🔍 Verifying attestation...");
    console.log(`  Address: ${address}`);
    console.log(`  Program: ${SAS_PROGRAM_ID}`);
    return {
      verified: false as const,
      reason: "live RPC verify requires optional @solana/web3.js path",
      programId: SAS_PROGRAM_ID,
    };
  },

  createAgentIdentity: async (
    agentId: string,
    walletPubkey: string,
    vaultAddress: string,
  ) => {
    console.log("🏷️ Creating agent identity...");
    console.log(`  Agent ID: ${agentId}`);
    console.log(`  Wallet: ${walletPubkey}`);
    console.log(`  Vault: ${vaultAddress}`);
    console.log("✓ Agent identity created with vault integration (stub)");
    return {
      agentId,
      walletPubkey,
      vaultAddress,
      status: "created" as const,
    };
  },

  vaultInit: async (
    agentId: string,
    walletPubkey: string,
    vaultAddress?: string,
  ) => {
    console.log("🔐 Initializing vault...");
    console.log(`  Agent: ${agentId}`);
    console.log(`  Wallet: ${walletPubkey}`);
    console.log(`  Vault: ${vaultAddress || "default"}`);
    console.log("✓ Agent wallet initialized in Hermès vault (stub)");
    return {
      agentId,
      walletPubkey,
      vaultAddress,
      status: "initialized" as const,
    };
  },
};

/**
 * Metaplex mint for Solana Clawd — dynamic import only; never runs on module load.
 * Requires: @metaplex-foundation/* packages, HELIUS_API_KEY or RPC, and secret key bytes.
 */
export async function mintSolanaClawdAgent(options: {
  secretKey: Uint8Array;
  rpcUrl?: string;
}): Promise<{ assetAddress: string; signature: string }> {
  const rpcUrl =
    options.rpcUrl ??
    process.env.SOLANA_RPC_URL ??
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : undefined);

  if (!rpcUrl) {
    throw new Error(
      "mintSolanaClawdAgent requires rpcUrl, SOLANA_RPC_URL, or HELIUS_API_KEY",
    );
  }

  const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
  const { keypairIdentity } = await import("@metaplex-foundation/umi");
  const { mintAndSubmitAgent, mplAgentIdentity } = await import(
    "@metaplex-foundation/mpl-agent-registry"
  );

  const umi = createUmi(rpcUrl).use(mplAgentIdentity());
  const keypair = umi.eddsa.createKeypairFromSecretKey(options.secretKey);
  umi.use(keypairIdentity(keypair));

  const meta = SOLANA_CLAWD_AGENT_METADATA;
  const result = await mintAndSubmitAgent(
    umi,
    {},
    {
      wallet: umi.identity.publicKey,
      name: meta.name,
      uri: meta.uri,
      agentMetadata: {
        type: "agent",
        name: meta.name,
        description: meta.description,
        services: meta.services.map((s) => ({
          name: s.name,
          endpoint: s.endpoint,
        })),
        registrations: [],
        supportedTrust: [...meta.supportedTrust],
      },
    },
  );

  return {
    assetAddress: String(result.assetAddress),
    signature: String(result.signature),
  };
}

export async function getAttestationStatus(params: {
  attestationAddress: string;
  rpcUrl?: string;
}): Promise<AttestationStatus> {
  const {
    attestationAddress,
    rpcUrl = process.env.SOLANA_RPC_URL ??
      "https://api.mainnet-beta.solana.com",
  } = params;

  try {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const connection = new Connection(rpcUrl);
    const pubkey = new PublicKey(attestationAddress);
    const accountInfo = await connection.getAccountInfo(pubkey);
    return {
      address: attestationAddress,
      exists: Boolean(accountInfo),
      programId: SAS_PROGRAM_ID,
    };
  } catch {
    return {
      address: attestationAddress,
      exists: false,
      programId: SAS_PROGRAM_ID,
    };
  }
}

export default {
  SERVICE_BASES,
  SOLANA_CLAWD_AGENT_METADATA,
  OPENCLAWD_REGISTRATION,
  ATTESTATION_SCHEMAS,
  SAS_PROGRAM_ID,
  cliCommands,
  mintSolanaClawdAgent,
  getAttestationStatus,
  diffSolanaClawdIdentity,
  loadSolanaClawdRegistrationJson,
  loadOpenclawdRegistrationJson,
};

// ---------------------------------------------------------------------------
// CLI entry — only when executed as main script (never on import)
// ---------------------------------------------------------------------------

function isMainModule(): boolean {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entry = process.argv[1];
    if (!entry) return false;
    // Normalize for tsx / node path differences
    return (
      thisFile === entry ||
      thisFile.endsWith(entry) ||
      entry.endsWith("clawd-register.ts") ||
      entry.endsWith("clawd-register.js")
    );
  } catch {
    return false;
  }
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? "metadata";

  switch (cmd) {
    case "metadata":
    case "print":
    case "help":
    case "--help":
    case "-h": {
      console.log(
        JSON.stringify(
          {
            solanaClawd: SOLANA_CLAWD_AGENT_METADATA,
            openclawd: {
              name: OPENCLAWD_REGISTRATION.name,
              services: OPENCLAWD_REGISTRATION.services,
              supportedTrust: OPENCLAWD_REGISTRATION.supportedTrust,
            },
            serviceBases: SERVICE_BASES,
            sasProgramId: SAS_PROGRAM_ID,
          },
          null,
          2,
        ),
      );
      const diffs = diffSolanaClawdIdentity();
      if (diffs.length) {
        console.error("Identity mismatches vs solana-clawd-registration.json:");
        for (const d of diffs) console.error(" -", d);
        process.exitCode = 1;
      }
      break;
    }
    case "diff": {
      const diffs = diffSolanaClawdIdentity();
      if (diffs.length === 0) {
        console.log("OK: Solana Clawd metadata aligns with registration JSON");
      } else {
        console.error("Mismatches:");
        for (const d of diffs) console.error(" -", d);
        process.exitCode = 1;
      }
      break;
    }
    case "mint": {
      const secretB64 = process.env.CLAWD_MINT_SECRET_KEY_B64;
      if (!secretB64) {
        console.error(
          "mint requires CLAWD_MINT_SECRET_KEY_B64 (base64 secret key bytes).",
        );
        console.error("Refusing to mint without an explicit secret.");
        process.exitCode = 1;
        break;
      }
      const secretKey = Uint8Array.from(Buffer.from(secretB64, "base64"));
      const result = await mintSolanaClawdAgent({ secretKey });
      console.log("Asset address:", result.assetAddress);
      console.log("Transaction signature:", result.signature);
      console.log("View at: https://metaplex.com/agent/" + result.assetAddress);
      break;
    }
    case "attest-skill": {
      await cliCommands.attestSkill(
        argv[1] ?? "example-skill",
        argv[2] ?? "example-verifier",
        argv[3] ?? "0x0",
      );
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(
        "Usage: clawd-register.ts [metadata|diff|mint|attest-skill]",
      );
      process.exitCode = 1;
  }
}

if (isMainModule()) {
  // Intentionally no top-level mint — only explicit subcommands.
  void main(process.argv.slice(2));
}
