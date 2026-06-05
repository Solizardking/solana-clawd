/**
 * pay/src/mcp-server-handler.ts
 *
 * MCP Server handler — Google ADK Agent Registry-compatible
 * MCP remote server endpoint that exposes Solana attestation tools.
 *
 * This implements the JSON-RPC 2.0 + MCP protocol for dynamic discovery
 * of agents, MCP tools, and Solana attestation resources.
 *
 * Compatible with:
 *   - Google Cloud Agent Registry MCP remote servers
 *   - Agent Development Kit (ADK) AgentRegistry client
 *   - Standard MCP clients (Claude, ChatGPT, Gemini CLI, etc.)
 */

import { SIGN_TRANSACTION_TOOL, handleSignTransaction } from "./mcp-sign-handler.js";
import { createPaymentAttestation } from "./attest.js";
import {
  queryClawdAgents,
  ClawdDiscoveryQuery,
  CLAWD_AGENTS,
  generateClaudeMCPConfig,
  generateOpenAIPluginConfig,
  generateOpenCodeMCPConfig,
  generateGoogleADKConfig,
  resolveGoogleAgentIdentity,
  buildSlashEvidenceChain,
  deriveBondPDA,
  deriveReceiptPDA,
  CLAWD_TOKEN_MINT,
  SAS_PROGRAM_ID as _SAS,
  MPL_CORE_PROGRAM_ID as _MPL,
  DNA_X402_RECEIPT_PROGRAM_ID as _DNA,
} from "./clawd-discovery.js";

// ─── JSON-RPC 2.0 Types ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ─── MCP Tool Registry ─────────────────────────────────────────────────────

const MCP_TOOLS = [
  SIGN_TRANSACTION_TOOL,
  {
    name: "create_payment_attestation",
    description:
      "Create an on-chain Solana Attestation Service (SAS) credential " +
      "linking an x402 payment receipt to an agent's on-chain identity. " +
      "This enables trustless verification that an agent has paid via x402.",
    inputSchema: {
      type: "object" as const,
      properties: {
        paymentReceipt: {
          type: "string",
          description: "Base64-encoded x402 payment receipt",
        },
        agentId: {
          type: "string",
          description: "Unique agent identifier",
        },
        agentWalletPubkey: {
          type: "string",
          description: "Agent's Solana wallet public key (base58)",
        },
      },
      required: ["paymentReceipt", "agentId", "agentWalletPubkey"],
    },
  },
  {
    name: "search_solana_agents",
    description:
      "Search for Solana-attested agents in the OpenClawd catalog. " +
      "Returns agents with on-chain identity verification, wallet balances, " +
      "and subscription tiers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (skill, tag, or agent name)",
        },
        network: {
          type: "string",
          description: "Solana network filter",
          enum: ["mainnet-beta", "devnet", "testnet"],
        },
        verifiedOnly: {
          type: "boolean",
          description: "Only return SAS-attested agents",
        },
      },
      required: [],
    },
  },
  {
    name: "get_agent_identity",
    description:
      "Retrieve a Solana agent's full on-chain identity including " +
      "SAS attestation status, MPL Core NFT details, wallet metadata, " +
      "and verified skill credentials.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: {
          type: "string",
          description: "Agent identifier",
        },
        walletPubkey: {
          type: "string",
          description: "Agent's Solana wallet public key (optional, for lookup)",
        },
      },
      required: ["agentId"],
    },
  },
  {
    name: "bridge_google_agent",
    description:
      "Bridge a Google Cloud Agent Registry agent identity to Solana " +
      "on-chain attestation. Creates the Metaplex Core NFT derivation, " +
      "SAS attestation mapping, and x402 payment attestation link.",
    inputSchema: {
      type: "object" as const,
      properties: {
        googleProjectId: {
          type: "string",
          description: "Google Cloud Project ID",
        },
        googleLocation: {
          type: "string",
          description: "Agent Registry location (e.g., us-central1, global)",
        },
        agentId: {
          type: "string",
          description: "Agent ID matching Agent Registry registration",
        },
        agentWalletPubkey: {
          type: "string",
          description: "Agent's Solana wallet public key (base58)",
        },
        metaplexMetadataUri: {
          type: "string",
          description: "Optional Metaplex metadata URI for the identity NFT",
        },
      },
      required: ["googleProjectId", "agentId", "agentWalletPubkey"],
    },
  },
];

// ─── MCP Resources ──────────────────────────────────────────────────────────

const MCP_RESOURCES = [
  {
    uri: "solana://attestation/sas-program",
    name: "SAS Program Info",
    description: "Solana Attestation Service program ID and schemas",
    mimeType: "application/json",
  },
  {
    uri: "solana://agents/catalog",
    name: "Agent Catalog",
    description: "OpenClawd agent catalog with on-chain attestation status",
    mimeType: "application/json",
  },
  {
    uri: "solana://x402/quote",
    name: "x402 Payment Quote",
    description: "Current x402 payment quote for agent services",
    mimeType: "application/json",
  },
];

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  args: Record<string, unknown> | undefined,
  env?: Record<string, string | undefined>,
): Promise<unknown> {
  switch (toolName) {
    case "sign_transaction":
      return handleSignTransaction(
        {
          transaction: (args?.transaction as string) ?? "",
          network: args?.network as string | undefined,
          account: args?.account as string | undefined,
        },
        env,
      );

    case "create_payment_attestation":
      return createPaymentAttestation(
        (args?.paymentReceipt as string) ?? "",
        (args?.agentId as string) ?? "",
        (args?.agentWalletPubkey as string) ?? "",
        env,
      );

    case "search_solana_agents": {
      const discoveryQuery: ClawdDiscoveryQuery = {
        query: args?.query as string | undefined,
        category: args?.category as ClawdDiscoveryQuery["category"],
        bondedOnly: args?.bondedOnly as boolean | undefined,
        verifiedOnly: args?.verifiedOnly as boolean | undefined,
        clawdGovernedOnly: args?.clawdGovernedOnly as boolean | undefined,
        protocol: args?.protocol as ClawdDiscoveryQuery["protocol"],
        trustGateMin: args?.trustGateMin as ClawdDiscoveryQuery["trustGateMin"],
        sortBy: args?.sortBy as ClawdDiscoveryQuery["sortBy"],
        limit: args?.limit as number | undefined,
      };
      return queryClawdAgents(discoveryQuery);
    }

    case "get_agent_identity": {
      const agentId = args?.agentId as string;
      const agent = CLAWD_AGENTS.find(
        (a) => a.id === agentId || a.identity.walletPubkey === args?.walletPubkey,
      );
      if (agent) {
        return {
          found: true,
          ...agent,
          _meta: {
            clawdTokenMint: CLAWD_TOKEN_MINT.toBase58(),
            sasProgramId: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
            mplCoreProgramId: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
            dnaX402ReceiptProgramId: "6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN",
          },
        };
      }
      return {
        found: false,
        agentId: agentId ?? "unknown",
        message: "Agent not found in Clawd discovery index. Register via SAS attestation.",
        availableCategories: ["trading", "defi", "collateral", "payment", "discovery", "identity", "portfolio", "risk"],
      };
    }

    case "bridge_google_agent": {
      const bridgeConfig = {
        organizationId: (args?.organizationId as string) ?? "ORG_ID",
        projectNumber: (args?.googleProjectId as string) ?? "PROJECT_NUMBER",
        location: (args?.googleLocation as string) ?? "global",
        engineId: (args?.engineId as string) ?? "ENGINE_ID",
        agentWalletPubkey: (args?.agentWalletPubkey as string) ?? "",
        agentId: (args?.agentId as string) ?? "",
        clawdBalance: (args?.clawdBalance as number) ?? 0,
      };
      const googleIdentity = resolveGoogleAgentIdentity(bridgeConfig);
      return {
        success: true,
        message: "Google SPIFFE Agent Identity bridged to Solana Clawd on-chain attestation",
        googleResourceName: `projects/${bridgeConfig.projectNumber}/locations/${bridgeConfig.location}/agents/${bridgeConfig.agentId}`,
        spiffe: {
          principal: googleIdentity.spiffePrincipal,
          principalSet: googleIdentity.principalSet,
          orgWide: googleIdentity.orgWide,
        },
        requiredIamRoles: googleIdentity.requiredIamRoles,
        gcloudGrantCmd: googleIdentity.gcloudGrantCmd,
        adkIntegration: googleIdentity.adkIntegrationCode,
        solanaAttestation: {
          sasProgramId: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
          mplCoreProgramId: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
          clawdTokenMint: CLAWD_TOKEN_MINT.toBase58(),
          dnaX402ReceiptAnchor: "6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN",
        },
        consumerConfigs: {
          claude: generateClaudeMCPConfig(),
          openai: generateOpenAIPluginConfig(),
          opencode: generateOpenCodeMCPConfig(),
          google_adk: generateGoogleADKConfig(bridgeConfig.projectNumber, bridgeConfig.location),
        },
      };
    }

    default:
      throw { code: -32601, message: `Unknown tool: ${toolName}` };
  }
}

// ─── Resource Handlers ──────────────────────────────────────────────────────

function readResource(uri: string): unknown {
  switch (uri) {
    case "solana://attestation/sas-program":
      return {
        name: "Solana Attestation Service",
        programId: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
        schemas: {
          agentIdentity: {
            name: "OpenClawdAgentIdentity",
            fields: ["agent_id", "wallet_pubkey", "skill_attestation", "vault_address", "is_vault_initialized"],
          },
          paymentAttestation: {
            name: "OpenClawdPaymentAttestation",
            fields: ["agent_id", "wallet_pubkey", "receipt_hash", "timestamp", "verified"],
          },
          skillAttestation: {
            name: "OpenClawdSkillAttestation",
            fields: ["skill_id", "verifier_pubkey", "proof_hash", "verification_timestamp", "is_formally_verified"],
          },
        },
        network: "mainnet-beta",
      };

    case "solana://agents/catalog":
      return {
        catalog: "https://x402.wtf/agents-manifest.json",
        totalAgents: 59,
        attestedAgents: 24,
        categories: ["trading", "defi", "portfolio", "security", "education"],
        attestationService: "Solana Attestation Service (SAS)",
        identityStandard: "Metaplex Core NFT + SAS",
        paymentProtocol: "x402 (HTTP 402 + SOL/USDC)",
      };

    case "solana://x402/quote":
      return {
        service: "solana-clawd-pay",
        price: { usd: "0.01", atomic: "10000", asset: "USDC" },
        networks: ["solana", "base", "base-sepolia"],
        rails: {
          x402: { enabled: true, header: "X-Payment" },
          mpp: { enabled: false },
          solana: { enabled: true },
        },
      };

    default:
      return null;
  }
}

// ─── MCP Request Router ────────────────────────────────────────────────────

export async function handleMCPRequest(
  body: Record<string, unknown>,
  env?: Record<string, string | undefined>,
): Promise<JsonRpcResponse> {
  const req = body as unknown as JsonRpcRequest;

  // Validate JSON-RPC version
  if (req.jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32600, message: "Invalid Request: jsonrpc must be 2.0" },
    };
  }

  // Route by method
  switch (req.method) {
    // ── MCP Lifecycle ─────────────────────────────────────────────────
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: "Solana Clawd Pay — Agent Attestation MCP Server",
            version: "1.0.0",
          },
        },
      };

    case "notifications/initialized":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {},
      };

    // ── Tool Discovery ────────────────────────────────────────────────
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: MCP_TOOLS,
        },
      };

    // ── Tool Execution ────────────────────────────────────────────────
    case "tools/call": {
      const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      if (!params?.name) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32602, message: "Invalid params: missing tool name" },
        };
      }

      try {
        const result = await dispatchTool(params.name, params.arguments, env);
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: {
            code: err.code ?? -32000,
            message: err.message ?? "Tool execution failed",
            data: err,
          },
        };
      }
    }

    // ── Resource Discovery ────────────────────────────────────────────
    case "resources/list":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          resources: MCP_RESOURCES,
        },
      };

    // ── Resource Reading ──────────────────────────────────────────────
    case "resources/read": {
      const params = req.params as { uri?: string } | undefined;
      if (!params?.uri) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32602, message: "Invalid params: missing uri" },
        };
      }

      const data = readResource(params.uri);
      if (data === null) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32001, message: `Resource not found: ${params.uri}` },
        };
      }

      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          contents: [
            {
              uri: params.uri,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        },
      };
    }

    // ── Ping ──────────────────────────────────────────────────────────
    case "ping":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {},
      };

    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      };
  }
}

// ─── Export tool list for external configuration ────────────────────────────

export { MCP_TOOLS, MCP_RESOURCES };