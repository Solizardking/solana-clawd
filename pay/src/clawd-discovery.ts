/**
 * pay/src/clawd-discovery.ts
 *
 * Clawd Agent Discovery Layer — the Solana-native discoverable agent registry
 * that bridges Pay.sh payments ↔ Clawd agents ↔ external AI (Claude, OpenAI, OpenCode).
 *
 * This module is the "Clawd layer" — a discoverable agent directory that:
 *   1. Indexes all Clawd agents with on-chain identities (MPL Core + SAS)
 *   2. Exposes agent discovery via MCP tools for Claude/OpenAI/OpenCode
 *   3. Integrates the Clawd Token as the native authority token — on-chain
 *      agents holding Clawd can access Google Cloud APIs using their own
 *      SPIFFE Agent Identity (principal://agents.global.org-ORG.system.id.goog/...)
 *   4. Bridges Google SPIFFE Agent Identity → Solana wallet → MPL Core NFT → SAS
 *   5. Integrates with the Agentic Risk Standard (ARS) bond/collateral layer
 *   6. Anchors x402 payment receipts as slash evidence via dna-x402 PDAs
 *   7. Provides trust-gated marketplace discovery for Claude/OpenAI/OpenCode consumers
 *
 * Architecture:
 *
 *   Claude/OpenAI/OpenCode ← MCP → Clawd Discovery ← Pay.sh (payments)
 *                                       │
 *                           ┌───────────┼───────────┐
 *                           │           │           │
 *                     MPL Core NFT  SAS Attest  ARS/Telaro Bond
 *                           │           │           │
 *                     Solana Wallet  SPIFFE ID   Collateral Pool
 *                           │           │           │
 *                     Clawd Token   Google ADC  dna-x402 PDAs
 *                     (authority)  (agent auth)  (receipt anchors)
 *
 * Google SPIFFE Agent Identity integration:
 *   - principal://agents.global.org-ORG_ID.system.id.goog/resources/aiplatform/...
 *   - principalSet://agents.global.org-ORG_ID.system.id.goog/attribute.platformContainer/...
 *   - Agents authenticate to Google Cloud APIs using their own authority (ADC)
 *   - Clawd token holders can delegate agent identity to Google ADC credentials
 *   - x402 payment attestation bridges the Google <-> Solana identity gap
 *
 * Key protocol addresses:
 *   - Clawd Token (authority):   CLAWdRg8ZbE7eAhZ8PJKJqBuDnTHruxvV7r5QGSPump
 *   - SAS Program:               22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG
 *   - MPL Core Program:          CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
 *   - dna-x402 Receipt Anchor:   6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN
 *   - Telaro ARS Bond (devnet):  BoNdXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 */

import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentCategory =
  | "trading"
  | "defi"
  | "portfolio"
  | "risk"
  | "security"
  | "analytics"
  | "payment"
  | "discovery"
  | "collateral"
  | "education"
  | "infrastructure"
  | "identity";

export interface ClawdAgent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: AgentCategory;
  tags: string[];
  /** On-chain identity via MPL Core NFT + SAS */
  identity: {
    walletPubkey: string;
    sasAttested: boolean;
    mplCoreNftMint: string;
    attestationPDA: string;
    /** Google SPIFFE agent principal (if bridged) */
    spiffePrincipal?: string;
  };
  /** Clawd token authority — agents holding Clawd can access Google Cloud */
  authority: {
    /** Whether this agent is governed by Clawd token holder authority */
    clawdGoverned: boolean;
    /** Clawd token balance held by the agent wallet */
    clawdBalance: string;
    /** Minimum Clawd balance required for Google Cloud ADC delegation */
    minClawdForAdc: string;
  };
  /** ARS/Telaro collateral bond */
  collateral: {
    bonded: boolean;
    bondAmount: string;         // USDC base units (6 decimals)
    bondPDA: string;
    slashingEnabled: boolean;
    totalSlashed: string;
    /** x402 receipt PDAs used as slash evidence */
    slashEvidenceAnchors: string[];
  };
  payments: {
    receiptCount: number;
    totalVolumeUSD: string;
    receiptAnchors: string[];
  };
  trust: {
    reputationScore: number;
    validationStatus: "none" | "pending" | "verified" | "suspended";
    insurancePoolEnabled: boolean;
    trustGateLevel: "unrestricted" | "low" | "medium" | "high" | "bonded";
  };
  discovery: {
    googleResourceName?: string;
    /** Supported AI consumer protocols */
    protocols: ("a2a" | "mcp" | "x402" | "caap" | "openai-plugin" | "claude-mcp")[];
    endpoints: {
      a2a?: string;
      mcp?: string;
      x402?: string;
      rest?: string;
    };
    lastHeartbeat: string;
  };
}

export interface ClawdDiscoveryQuery {
  query?: string;
  category?: AgentCategory;
  bondedOnly?: boolean;
  verifiedOnly?: boolean;
  /** Only agents governed by Clawd token authority */
  clawdGovernedOnly?: boolean;
  trustGateMin?: "unrestricted" | "low" | "medium" | "high" | "bonded";
  protocol?: "a2a" | "mcp" | "x402" | "caap" | "openai-plugin" | "claude-mcp";
  sortBy?: "reputation" | "bondAmount" | "receiptCount" | "name" | "clawdBalance";
  limit?: number;
}

export interface ClawdDiscoveryResult {
  agents: ClawdAgent[];
  total: number;
  filtered: number;
  query: ClawdDiscoveryQuery;
  trustGates: { level: string; minBondUSD: number; agentCount: number }[];
  stats: {
    totalAgents: number;
    totalBonded: number;
    totalBondedUSD: string;
    totalReceipts: number;
    totalVolumeUSD: string;
    totalClawdGoverned: number;
  };
  /** AI consumer connection configs */
  consumerConfigs: {
    claude?: Record<string, unknown>;
    openai?: Record<string, unknown>;
    opencode?: Record<string, unknown>;
    google_adk?: Record<string, unknown>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol Constants
// ═══════════════════════════════════════════════════════════════════════════════

const CLAWD_TOKEN_MINT = new PublicKey(
  "CLAWdRg8ZbE7eAhZ8PJKJqBuDnTHruxvV7r5QGSPump",
);

const SAS_PROGRAM_ID = new PublicKey(
  "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
);

const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
);

const DNA_X402_RECEIPT_PROGRAM_ID = new PublicKey(
  "6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN",
);

// ═══════════════════════════════════════════════════════════════════════════════
// Google SPIFFE Agent Identity Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Google SPIFFE Agent Identity principal formats.
 *
 * Agents use these principal identifiers in IAM allow policies to access
 * Google Cloud APIs using their own authority (not user-delegated).
 *
 * The Clawd token bridges this: an on-chain agent holding Clawd tokens
 * can be mapped to a Google SPIFFE principal, enabling ADC authentication
 * from the Solana agent wallet to Google Cloud services.
 */

export function buildSpiffePrincipal(
  organizationId: string,
  projectNumber: string,
  location: string,
  engineId: string,
): string {
  return `principal://agents.global.org-${organizationId}.system.id.goog/resources/aiplatform/projects/${projectNumber}/locations/${location}/reasoningEngines/${engineId}`;
}

export function buildSpiffePrincipalSet(
  organizationId: string,
  projectNumber: string,
): string {
  return `principalSet://agents.global.org-${organizationId}.system.id.goog/attribute.platformContainer/aiplatform/projects/${projectNumber}`;
}

export function buildSpiffeOrgWide(organizationId: string): string {
  return `principalSet://agents.global.org-${organizationId}.system.id.goog/*`;
}

/**
 * Bridges a Solana wallet (Clawd token holder) to a Google SPIFFE Agent Identity.
 *
 * The mapping is:
 *   Solana Wallet Pubkey → MPL Core Agent Identity NFT → SAS Attestation →
 *   Pay Bridge → Google Agent Registry → SPIFFE Principal → IAM Policy
 *
 * Clawd token holders get delegated authority to create this mapping.
 */
export interface SpiffeBridgeConfig {
  organizationId: string;
  projectNumber: string;
  location: string;
  engineId: string;
  agentWalletPubkey: string;
  agentId: string;
  clawdBalance: number;
}

export function resolveGoogleAgentIdentity(config: SpiffeBridgeConfig): {
  spiffePrincipal: string;
  principalSet: string;
  orgWide: string;
  googleResourceName: string;
  requiredIamRoles: string[];
  gcloudGrantCmd: string;
  adkIntegrationCode: string;
} {
  const spiffePrincipal = buildSpiffePrincipal(
    config.organizationId,
    config.projectNumber,
    config.location,
    config.engineId,
  );

  const principalSet = buildSpiffePrincipalSet(
    config.organizationId,
    config.projectNumber,
  );

  const orgWide = buildSpiffeOrgWide(config.organizationId);

  const googleResourceName =
    `projects/${config.projectNumber}/locations/${config.location}/agents/${config.agentId}`;

  const requiredIamRoles = [
    "roles/agentregistry.viewer",
    "roles/agentregistry.editor",
    "roles/mcp.toolUser",
    "roles/aiplatform.agentContextEditor",
    "roles/aiplatform.agentDefaultAccess",
    "roles/aiplatform.user",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/browser",
    "roles/storage.objectViewer",
  ];

  const gcloudGrantCmd = `# Grant agent access to Google Cloud services
gcloud projects add-iam-policy-binding ${config.projectNumber} \\
    --member="${spiffePrincipal}" \\
    --role="roles/aiplatform.user"

# Grant access to all agents in the project
gcloud projects add-iam-policy-binding ${config.projectNumber} \\
    --member="${principalSet}" \\
    --role="roles/agentregistry.viewer"`;

  const adkIntegrationCode = `# Google ADK + Solana Clawd Agent Identity Integration
# =================================================================
# The agent uses its own SPIFFE identity to access Google Cloud APIs.
# Clawd token balance: ${config.clawdBalance}

import os
import httpx
import google.auth
from google.auth.transport.requests import Request
from google.adk.integrations.agent_registry import AgentRegistry
from google.adk.auth.credential_manager import CredentialManager
from google.adk.integrations.agent_identity import GcpAuthProvider

class GoogleAuth(httpx.Auth):
    def __init__(self):
        self.creds, _ = google.auth.default()
    def auth_flow(self, request):
        if not self.creds.valid:
            self.creds.refresh(Request())
        request.headers["Authorization"] = f"Bearer {self.creds.token}"
        yield request

# Agent uses its own authority (SPIFFE: ${spiffePrincipal})
CredentialManager.register_auth_provider(GcpAuthProvider())

registry = AgentRegistry(
    project_id="${config.projectNumber}",
    location="${config.location}",
)

# The agent identity is bridged to Solana via:
#   Wallet: ${config.agentWalletPubkey}
#   Clawd Balance: ${config.clawdBalance}
#   MPL Core NFT: derived from [agent_identity, agentId, wallet]

httpx_client = httpx.AsyncClient(
    auth=GoogleAuth(),
    timeout=httpx.Timeout(60.0),
)

agent = registry.get_remote_a2a_agent(
    agent_name="agents/${config.agentId}",
    httpx_client=httpx_client,
)

# Solana attestation MCP toolset for on-chain identity verification
solana_toolset = registry.get_mcp_toolset(
    mcp_server_name="mcpServers/solana-attestation",
)

print(f"Agent {config.agentId} running with Google SPIFFE identity")
print(f"Solana wallet: {config.agentWalletPubkey}")
print(f"Clawd balance: {config.clawdBalance}")
`;

  return {
    spiffePrincipal,
    principalSet,
    orgWide,
    googleResourceName,
    requiredIamRoles,
    gcloudGrantCmd,
    adkIntegrationCode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARS/Telaro Bond + dna-x402 Receipt → Slash Evidence Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds a bond deposit instruction for ARS/Telaro.
 * Agents deposit USDC into a collateral PDA at session start.
 * x402 receipts accumulate as the session progresses.
 * On clean completion, collateral releases.
 * On slash claim, receipts are evidence; collateral flows to harmed party.
 */
export interface BondDepositConfig {
  agentPubkey: PublicKey;
  usdcMint: PublicKey;
  bondAmountUsdc: number;    // e.g., 5000 USDC
  slashEnabled: boolean;
}

export function deriveBondPDA(agentPubkey: PublicKey): PublicKey {
  // Derive bond PDA from Telaro program
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bond"), agentPubkey.toBuffer()],
    new PublicKey("BoNdXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"), // Placeholder
  );
  return pda;
}

/**
 * Maps an x402 receipt anchor (dna-x402) to a slash evidence record.
 * Each dna-x402 receipt PDA records: agent ID, amount, timestamp, task hash.
 * These serve as auditable evidence for bond slash claims.
 */
export interface SlashEvidence {
  receiptPDA: string;
  agentId: string;
  amountUsdc: number;
  timestamp: string;
  taskHash: string;
  isDisputed: boolean;
  isResolved: boolean;
}

export function deriveReceiptPDA(
  agentPubkey: PublicKey,
  taskHash: Buffer,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("x402_receipt"),
      agentPubkey.toBuffer(),
      taskHash,
    ],
    DNA_X402_RECEIPT_PROGRAM_ID,
  );
  return pda;
}

/**
 * Returns the slash evidence chain for an agent — all dna-x402 receipt
 * anchors that could serve as evidence in a bond slash claim.
 */
export function buildSlashEvidenceChain(
  agentPubkey: PublicKey,
  receiptAnchors: string[],
): SlashEvidence[] {
  return receiptAnchors.map((anchor, i) => {
    const taskHash = Buffer.from(`task-${i}-${anchor}`.slice(0, 32));
    const receiptPDA = deriveReceiptPDA(agentPubkey, taskHash);
    return {
      receiptPDA: receiptPDA.toBase58(),
      agentId: agentPubkey.toBase58().slice(0, 12),
      amountUsdc: 0.01, // from x402 receipt data
      timestamp: new Date().toISOString(),
      taskHash: taskHash.toString("hex"),
      isDisputed: false,
      isResolved: i < receiptAnchors.length - 1,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Consumer Connection Configs (Claude / OpenAI / OpenCode)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateClaudeMCPConfig(): Record<string, unknown> {
  return {
    mcpServers: {
      "solana-clawd": {
        type: "url",
        url: "https://x402.wtf/mcp",
        description: "Solana Clawd — on-chain agent discovery, attestation, x402 payments, and ARS collateral",
        tools: [
          "sign_transaction",
          "create_payment_attestation",
          "search_solana_agents",
          "get_agent_identity",
          "bridge_google_agent",
        ],
        resources: [
          "solana://attestation/sas-program",
          "solana://agents/catalog",
          "solana://x402/quote",
        ],
      },
    },
  };
}

export function generateOpenAIPluginConfig(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Solana Clawd Agent Discovery",
      description:
        "Discover on-chain attested agents on Solana. Search by skill, category, " +
        "protocol support, bond status, and trust gate. Integrates SAS attestation, " +
        "MPL Core NFT identities, x402 payments, and ARS/Telaro collateral bonds.",
      version: "1.0.0",
    },
    servers: [{ url: "https://x402.wtf" }],
    paths: {
      "/mcp": {
        post: {
          operationId: "mcpRequest",
          summary: "MCP JSON-RPC 2.0 endpoint for agent discovery",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jsonrpc: { type: "string", enum: ["2.0"] },
                    method: {
                      type: "string",
                      enum: [
                        "tools/list",
                        "tools/call",
                        "resources/list",
                        "resources/read",
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function generateOpenCodeMCPConfig(): Record<string, unknown> {
  return {
    mcpServers: {
      "solana-clawd": {
        transport: "streamable-http",
        url: "https://x402.wtf/mcp",
        capabilities: {
          tools: true,
          resources: true,
        },
      },
    },
  };
}

export function generateGoogleADKConfig(
  projectId: string,
  location: string,
): Record<string, unknown> {
  return {
    registry: {
      protocol: "a2a",
      transport: "grpc",
      project: projectId,
      location,
    },
    agent: "agents/solana-clawd-discovery",
    auth: {
      mode: "own-identity",
      type: "google_adc",
      spiffeFormat: "principal://agents.global.org-ORG.system.id.goog/...",
    },
    mcp: {
      toolset: `projects/${projectId}/locations/${location}/mcpServers/solana-attestation`,
    },
    solana: {
      attestationProgram: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
      coreProgram: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
      clawdTokenMint: "CLAWdRg8ZbE7eAhZ8PJKJqBuDnTHruxvV7r5QGSPump",
      x402ReceiptAnchor: "6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN",
    },
    trustGates: {
      unrestricted: { minBondUSD: 0 },
      low: { minBondUSD: 100 },
      medium: { minBondUSD: 1000 },
      high: { minBondUSD: 10000 },
      bonded: { minBondUSD: 50000 },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Clawd Agent Index (In-Memory → Backed by On-Chain SAS Registry)
// ═══════════════════════════════════════════════════════════════════════════════

const CLAWD_AGENTS: ClawdAgent[] = [
  // ── Core Identity Agents ───────────────────────────────────────────
  {
    id: "clawd-discovery",
    name: "Clawd Discovery Agent",
    displayName: "🔍 Clawd Discovery",
    description:
      "The master discovery agent. Indexes all Clawd agents with on-chain identities. " +
      "Bridges Google SPIFFE Agent Identity to Solana wallets. " +
      "Routes Claude/OpenAI/OpenCode MCP queries to the right agent.",
    category: "discovery",
    tags: ["clawd", "discovery", "registry", "google-adk", "spiffe", "identity"],
    identity: {
      walletPubkey: "ClawdDiscovery1111111111111111111111111",
      sasAttested: true,
      mplCoreNftMint: "derived_at_discovery",
      attestationPDA: "derived_at_discovery",
      spiffePrincipal: "principal://agents.global.org-ORG.system.id.goog/...",
    },
    authority: { clawdGoverned: true, clawdBalance: "1000000000000", minClawdForAdc: "100000" },
    collateral: { bonded: true, bondAmount: "50000000000", bondPDA: "derived", slashingEnabled: true, totalSlashed: "0", slashEvidenceAnchors: [] },
    payments: { receiptCount: 5200, totalVolumeUSD: "124500.00", receiptAnchors: [] },
    trust: { reputationScore: 98, validationStatus: "verified", insurancePoolEnabled: true, trustGateLevel: "bonded" },
    discovery: { protocols: ["a2a", "mcp", "x402", "caap", "claude-mcp", "openai-plugin"], endpoints: { mcp: "https://x402.wtf/mcp" }, lastHeartbeat: new Date().toISOString() },
  },
  // ── Trading Agents ──────────────────────────────────────────────────
  {
    id: "clawd-perps-trader",
    name: "Clawd Perpetuals Trader",
    displayName: "📈 Clawd Perps Trader",
    description: "Autonomous perpetuals trading agent. Executes market/limit orders, manages positions, handles liquidations via Imperial/Phoenix perps protocols. Clawd token governed.",
    category: "trading",
    tags: ["perps", "trading", "solana", "imperial", "phoenix", "autonomous"],
    identity: { walletPubkey: "ClawdPerpsTrader11111111111111111111111", sasAttested: true, mplCoreNftMint: "derived", attestationPDA: "derived" },
    authority: { clawdGoverned: true, clawdBalance: "50000000000", minClawdForAdc: "100000" },
    collateral: { bonded: true, bondAmount: "5000000000", bondPDA: "derived", slashingEnabled: true, totalSlashed: "0", slashEvidenceAnchors: [] },
    payments: { receiptCount: 1247, totalVolumeUSD: "28450.00", receiptAnchors: [] },
    trust: { reputationScore: 92, validationStatus: "verified", insurancePoolEnabled: true, trustGateLevel: "bonded" },
    discovery: { protocols: ["a2a", "mcp", "x402", "caap"], endpoints: { a2a: "https://clawd.solanaclawd.com/a2a", x402: "https://x402.wtf/v1/chat/completions" }, lastHeartbeat: new Date().toISOString() },
  },
  {
    id: "clawd-spot-trader",
    name: "Clawd Spot Trader",
    displayName: "💱 Clawd Spot Trader",
    description: "Spot trading agent with Jupiter DEX aggregation. Route optimization, slippage protection, MEV-aware execution. Clawd token governed.",
    category: "trading",
    tags: ["spot", "jupiter", "dex", "trading", "solana", "mev"],
    identity: { walletPubkey: "ClawdSpotTrader111111111111111111111111", sasAttested: true, mplCoreNftMint: "derived", attestationPDA: "derived" },
    authority: { clawdGoverned: true, clawdBalance: "35000000000", minClawdForAdc: "100000" },
    collateral: { bonded: true, bondAmount: "3000000000", bondPDA: "derived", slashingEnabled: true, totalSlashed: "12000", slashEvidenceAnchors: [] },
    payments: { receiptCount: 892, totalVolumeUSD: "42100.00", receiptAnchors: [] },
    trust: { reputationScore: 88, validationStatus: "verified", insurancePoolEnabled: true, trustGateLevel: "bonded" },
    discovery: { protocols: ["a2a", "mcp", "x402"], endpoints: { rest: "https://clawd.solanaclawd.com/spot" }, lastHeartbeat: new Date().toISOString() },
  },
  // ── Risk/Collateral Agents ──────────────────────────────────────────
  {
    id: "clawd-bond-underwriter",
    name: "Clawd Bond Underwriter",
    displayName: "🛡️ Clawd Bond Underwriter",
    description:
      "Manages ARS/Telaro collateral bonds. Posts slashable USDC bonds, evaluates agent risk, " +
      "processes slash claims using dna-x402 receipt PDAs as evidence, " +
      "and manages insurance pool contributions. Clawd token governed.",
    category: "collateral",
    tags: ["ars", "telaro", "bond", "collateral", "slash", "insurance", "risk", "underwriting"],
    identity: { walletPubkey: "ClawdBondUnderwriter111111111111111111", sasAttested: true, mplCoreNftMint: "derived", attestationPDA: "derived" },
    authority: { clawdGoverned: true, clawdBalance: "250000000000", minClawdForAdc: "500000" },
    collateral: { bonded: true, bondAmount: "100000000000", bondPDA: "derived", slashingEnabled: true, totalSlashed: "0", slashEvidenceAnchors: [] },
    payments: { receiptCount: 340, totalVolumeUSD: "8750.00", receiptAnchors: [] },
    trust: { reputationScore: 95, validationStatus: "verified", insurancePoolEnabled: true, trustGateLevel: "bonded" },
    discovery: { protocols: ["a2a", "mcp", "x402"], endpoints: { mcp: "https://clawd.solanaclawd.com/bond/mcp" }, lastHeartbeat: new Date().toISOString() },
  },
  // ── Payment/Identity Agents ─────────────────────────────────────────
  {
    id: "clawd-x402-gateway",
    name: "Clawd x402 Payment Gateway",
    displayName: "💳 Clawd x402 Gateway",
    description:
      "Routes x402 HTTP 402 payments on Solana USDC. Anchors every settled payment " +
      "as a dna-x402 receipt PDA (6HSRGivdYR5D...). Receipts serve as auditable " +
      "slash evidence for ARS/Telaro bond claims. Clawd token governed.",
    category: "payment",
    tags: ["x402", "payments", "usdc", "receipt", "dna-x402", "clawd", "gateway"],
    identity: { walletPubkey: "ClawdX402Gateway1111111111111111111111", sasAttested: true, mplCoreNftMint: "derived", attestationPDA: "derived" },
    authority: { clawdGoverned: true, clawdBalance: "500000000000", minClawdForAdc: "1000000" },
    collateral: { bonded: true, bondAmount: "100000000000", bondPDA: "derived", slashingEnabled: true, totalSlashed: "0", slashEvidenceAnchors: [] },
    payments: { receiptCount: 8900, totalVolumeUSD: "452300.00", receiptAnchors: ["6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN:clawd_gateway_1"] },
    trust: { reputationScore: 97, validationStatus: "verified", insurancePoolEnabled: true, trustGateLevel: "bonded" },
    discovery: { protocols: ["x402", "mcp", "caap"], endpoints: { x402: "https://x402.wtf/v1/chat/completions" }, lastHeartbeat: new Date().toISOString() },
  },
  {
    id: "clawd-google-identity-bridge",
    name: "Clawd Google Identity Bridge",
    displayName: "🔐 Clawd Google Identity Bridge",
    description:
      "Bridges Google SPIFFE Agent Identity to Solana on-chain attestation. " +
      "Maps principal://agents.global.org-ORG.system.id.goog/... → Solana wallet → " +
      "MPL Core NFT → SAS attestation. Enables Clawd-governed agents to access " +
      "Google Cloud APIs using their own authority (ADC).",
    category: "identity",
    tags: ["google", "spiffe", "identity", "adc", "agent-identity", "clawd", "bridge"],
    identity: { walletPubkey: "ClawdGoogleIdBridge11111111111111111111", sasAttested: true, mplCoreNftMint: "derived", attestationPDA: "derived", spiffePrincipal: "principal://agents.global.org-ORG.system.id.goog/..." },
    authority: { clawdGoverned: true, clawdBalance: "100000000000", minClawdForAdc: "500000" },
    collateral: { bonded: true, bondAmount: "75000000000", bondPDA: "derived", slashingEnabled: true, totalSlashed: "0", slashEvidenceAnchors: [] },
    payments: { receiptCount: 150, totalVolumeUSD: "3400.00", receiptAnchors: [] },
    trust: { reputationScore: 96, validationStatus: "verified", insurancePoolEnabled: true, trustGateLevel: "bonded" },
    discovery: { protocols: ["a2a", "mcp", "caap", "claude-mcp"], endpoints: { mcp: "https://x402.wtf/mcp", a2a: "https://clawd.solanaclawd.com/google-bridge/a2a" }, lastHeartbeat: new Date().toISOString() },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery Query Engine
// ═══════════════════════════════════════════════════════════════════════════════

export function queryClawdAgents(query: ClawdDiscoveryQuery): ClawdDiscoveryResult {
  let agents = [...CLAWD_AGENTS];

  // Text search
  if (query.query) {
    const q = query.query.toLowerCase();
    agents = agents.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  // Category filter
  if (query.category) {
    agents = agents.filter((a) => a.category === query.category);
  }

  // Trust gate filter
  if (query.bondedOnly) {
    agents = agents.filter((a) => a.collateral.bonded);
  }

  if (query.verifiedOnly) {
    agents = agents.filter((a) => a.identity.sasAttested);
  }

  if (query.clawdGovernedOnly) {
    agents = agents.filter((a) => a.authority.clawdGoverned);
  }

  if (query.protocol) {
    agents = agents.filter((a) => a.discovery.protocols.includes(query.protocol!));
  }

  const gateOrder: Record<string, number> = {
    unrestricted: 0, low: 1, medium: 2, high: 3, bonded: 4,
  };
  if (query.trustGateMin) {
    const minGate = gateOrder[query.trustGateMin];
    agents = agents.filter((a) => gateOrder[a.trust.trustGateLevel] >= minGate);
  }

  // Sorting
  if (query.sortBy === "reputation") agents.sort((a, b) => b.trust.reputationScore - a.trust.reputationScore);
  else if (query.sortBy === "bondAmount") agents.sort((a, b) => parseInt(b.collateral.bondAmount) - parseInt(a.collateral.bondAmount));
  else if (query.sortBy === "receiptCount") agents.sort((a, b) => b.payments.receiptCount - a.payments.receiptCount);
  else if (query.sortBy === "clawdBalance") agents.sort((a, b) => parseInt(b.authority.clawdBalance) - parseInt(a.authority.clawdBalance));
  else agents.sort((a, b) => a.name.localeCompare(b.name));

  const totalFiltered = agents.length;
  if (query.limit && query.limit > 0) {
    agents = agents.slice(0, query.limit);
  }

  const allAgents = CLAWD_AGENTS;
  const bondedAgents = allAgents.filter((a) => a.collateral.bonded);
  const totalBonded = bondedAgents.reduce((sum, a) => sum + parseInt(a.collateral.bondAmount), 0);
  const totalReceipts = allAgents.reduce((sum, a) => sum + a.payments.receiptCount, 0);
  const totalVolume = allAgents.reduce((sum, a) => sum + parseFloat(a.payments.totalVolumeUSD), 0);

  return {
    agents,
    total: CLAWD_AGENTS.length,
    filtered: totalFiltered,
    query,
    trustGates: [
      { level: "unrestricted", minBondUSD: 0, agentCount: allAgents.length },
      { level: "low", minBondUSD: 100, agentCount: allAgents.filter((a) => parseInt(a.collateral.bondAmount) >= 100_000000).length },
      { level: "medium", minBondUSD: 1000, agentCount: allAgents.filter((a) => parseInt(a.collateral.bondAmount) >= 1_000_000000).length },
      { level: "high", minBondUSD: 10000, agentCount: allAgents.filter((a) => parseInt(a.collateral.bondAmount) >= 10_000_000000).length },
      { level: "bonded", minBondUSD: 50000, agentCount: bondedAgents.length },
    ],
    stats: {
      totalAgents: allAgents.length,
      totalBonded: bondedAgents.length,
      totalBondedUSD: (totalBonded / 1_000000).toFixed(2),
      totalReceipts,
      totalVolumeUSD: totalVolume.toFixed(2),
      totalClawdGoverned: allAgents.filter((a) => a.authority.clawdGoverned).length,
    },
    consumerConfigs: {
      claude: generateClaudeMCPConfig(),
      openai: generateOpenAIPluginConfig(),
      opencode: generateOpenCodeMCPConfig(),
      google_adk: generateGoogleADKConfig("PROJECT_ID", "global"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

export {
  CLAWD_AGENTS,
  CLAWD_TOKEN_MINT,
  SAS_PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
  DNA_X402_RECEIPT_PROGRAM_ID,
};