/**
 * pay/src/google-agent-identity.ts
 *
 * Google ADK Agent Registry ↔ Solana On-Chain Identity Bridge.
 *
 * This module bridges Google Cloud Agent Registry (ADK) agent identities
 * with Solana Metaplex on-chain attested identities via the x402 payment
 * protocol and the Solana Attestation Service (SAS).
 *
 * Flow:
 *   1. Google agent is registered in Agent Registry with its identity
 *   2. Agent creates a Solana wallet (or uses existing)
 *   3. Agent identity is minted as an MPL Core NFT on Solana
 *   4. SAS attestation links the Google identity to the on-chain NFT
 *   5. x402 payments become attestation credentials for skill/auth verification
 *
 * This enables:
 *   - Google Agent Identity → Solana wallet attestation
 *   - Metaplex Core NFT minting for agent identity
 *   - SAS credential creation linking Google project to Solana pubkey
 *   - x402 payment attestation as proof-of-agent-authority
 */

import { PublicKey, Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import { buildAgentIdentityAttestationTx, buildPaymentAttestationTx, createPaymentAttestation } from "./attest.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoogleAgentIdentityInput {
  /** Google Cloud Project ID */
  googleProjectId: string;
  /** Agent Registry location (e.g., "us-central1", "global") */
  googleLocation?: string;
  /** Agent ID (matches Agent Registry agent name) */
  agentId: string;
  /** The agent's Solana wallet public key (base58) */
  agentWalletPubkey: string;
  /** Optional custom Solana RPC URL */
  solanaRpcUrl?: string;
  /** Optional Metaplex metadata URI for the NFT */
  metaplexMetadataUri?: string;
  /** Environment variables (for private key resolution) */
  env?: Record<string, string | undefined>;
}

export interface GoogleAgentIdentityResult {
  success: boolean;
  identity?: {
    /** Google Cloud resource name */
    googleResourceName: string;
    /** Solana wallet public key */
    solanaPubkey: string;
    /** Agent ID */
    agentId: string;
    /** Metaplex identity attestation */
    metaplex: {
      /** Proposed MPL Core NFT mint address */
      nftMintAddress?: string;
      /** Metadata URI for the identity NFT */
      metadataUri?: string;
      /** Status of on-chain identity */
      status: "pending" | "attested" | "verified";
    };
    /** SAS attestation info */
    attestation: {
      /** The SAS program ID */
      sasProgramId: string;
      /** Agent identity attestation PDA */
      identityPDA: string;
      /** Whether attestation is on-chain */
      onChain: boolean;
    };
    /** x402 payment bridge */
    x402: {
      /** Payment attestation endpoint */
      attestEndpoint: string;
      /** Whether x402 payment attestation is configured */
      configured: boolean;
    };
    /** Google ADK integration */
    google: {
      /** Agent Registry resource format */
      registryResourceFormat: string;
      /** ADC authentication model (own-identity) */
      authModel: "own-identity" | "api-key" | "oauth-2lo" | "oauth-3lo";
      /** Required IAM roles */
      requiredRoles: string[];
      /** MCP toolset registration path */
      mcpToolsetPath: string;
    };
  };
  error?: string;
  code?: string;
}

// ─── MPL Core NFT Address Derivation ────────────────────────────────────────

const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
);

function deriveAgentNftMint(
  agentId: string,
  walletPubkey: PublicKey,
): PublicKey {
  const [mint] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("agent_identity"),
      Buffer.from(agentId.slice(0, 32)),
      walletPubkey.toBuffer(),
    ],
    MPL_CORE_PROGRAM_ID,
  );
  return mint;
}

// ─── Agent Registry Resource Name Builders ──────────────────────────────────

function buildGoogleResourceName(
  projectId: string,
  location: string,
  agentId: string,
): string {
  return `projects/${projectId}/locations/${location}/agents/${agentId}`;
}

function buildMcpToolsetResourceName(
  projectId: string,
  location: string,
  serverId: string,
): string {
  return `projects/${projectId}/locations/${location}/mcpServers/${serverId}`;
}

// ─── ADK Integration Helpers ────────────────────────────────────────────────

function generateAdkAuthHeaderCode(
  projectId: string,
  location: string,
  agentId: string,
): string {
  return `# Google ADK Agent Registry + Solana Identity Bridge
# ================================================================
# This agent uses its own Google identity (ADC) to authenticate
# with Agent Registry and links to on-chain Solana attestation.

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

# Initialize the registry client
project_id = "${projectId}"
location = "${location}"
agent_name = "agents/${agentId}"

CredentialManager.register_auth_provider(GcpAuthProvider())

registry = AgentRegistry(
    project_id=project_id,
    location=location,
)

# Connect to remote A2A agent with Google authentication
httpx_client = httpx.AsyncClient(auth=GoogleAuth(), timeout=httpx.Timeout(60.0))

my_remote_agent = registry.get_remote_a2a_agent(
    agent_name=agent_name,
    httpx_client=httpx_client,
)

# Fetch MCP toolset with Solana attestation
mcp_server_name = "mcpServers/solana-attestation"
solana_toolset = registry.get_mcp_toolset(
    mcp_server_name=mcp_server_name,
)

print(f"Agent {agent_name} ready with Solana attestation bridge")
print(f"Solana identity: on-chain attested via MPL Core + SAS")
`;
}

function generateAgentCardUpdate(
  agentId: string,
  solanaPubkey: string,
  nftMint: PublicKey,
  sasProgramId: string,
): Record<string, unknown> {
  return {
    name: agentId,
    description: "Google ADK agent with Solana on-chain attested identity",
    provider: {
      organization: "OpenClawd",
      url: "https://solanaclawd.com",
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    security: {
      authentication: {
        schemes: ["google_adc", "solana_sas", "x402_payment"],
      },
    },
    attestation: {
      service: "Solana Attestation Service + Metaplex Core",
      solanaPubkey,
      nftMintAddress: nftMint.toBase58(),
      sasProgramId,
      protocol: "CAAP/1.0",
      version: "1.0.0",
    },
    x402: {
      enabled: true,
      paymentAsset: "USDC",
      paymentNetwork: "solana",
      attestEndpoint: "https://x402.wtf/v1/attest/payment",
    },
    google: {
      agentRegistry: true,
      a2aProtocol: true,
      mcpTools: true,
    },
  };
}

// ─── Main Bridge Function ───────────────────────────────────────────────────

export async function bridgeGoogleAgentIdentity(
  input: GoogleAgentIdentityInput,
): Promise<GoogleAgentIdentityResult> {
  const {
    googleProjectId,
    googleLocation = "global",
    agentId,
    agentWalletPubkey,
    solanaRpcUrl,
    metaplexMetadataUri,
    env,
  } = input;

  // Validate required inputs
  if (!googleProjectId) {
    return {
      success: false,
      error: "Missing googleProjectId",
      code: "missing_google_project",
    };
  }

  if (!agentId) {
    return {
      success: false,
      error: "Missing agentId",
      code: "missing_agent_id",
    };
  }

  if (!agentWalletPubkey) {
    return {
      success: false,
      error: "Missing agentWalletPubkey",
      code: "missing_wallet_pubkey",
    };
  }

  // Validate Solana pubkey
  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(agentWalletPubkey);
  } catch {
    return {
      success: false,
      error: "Invalid agent wallet public key",
      code: "invalid_wallet_pubkey",
    };
  }

  // Build Google resource name
  const resourceName = buildGoogleResourceName(googleProjectId, googleLocation, agentId);

  // Derive MPL Core NFT mint address
  const nftMint = deriveAgentNftMint(agentId, walletPubkey);

  // Build attestation transaction info
  const attestationTx = buildAgentIdentityAttestationTx({
    agentId,
    agentWalletPubkey,
    paymentReceipt: "gooogle_bridge_initial",
  });

  // Derive SAS identity PDA
  const [identityPDA] = PublicKey.findProgramAddressSync(
    [walletPubkey.toBuffer(), Buffer.from("agent_identity")],
    new PublicKey("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG"),
  );

  // Check on-chain state if RPC available
  let onChain = false;
  try {
    const rpcUrl = solanaRpcUrl ?? clusterApiUrl("mainnet-beta");
    const connection = new Connection(rpcUrl, "confirmed");
    const accountInfo = await connection.getAccountInfo(identityPDA);
    onChain = accountInfo !== null && accountInfo.data.length > 0;
  } catch {
    // RPC not available — assume not on chain yet
  }

  // Generate ADK auth code
  const adkAuthCode = generateAdkAuthHeaderCode(googleProjectId, googleLocation, agentId);

  // Build agent card update payload
  const agentCardUpdate = generateAgentCardUpdate(
    agentId,
    agentWalletPubkey,
    nftMint,
    "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
  );

  return {
    success: true,
    identity: {
      googleResourceName: resourceName,
      solanaPubkey: agentWalletPubkey,
      agentId,
      metaplex: {
        nftMintAddress: nftMint.toBase58(),
        metadataUri: metaplexMetadataUri ?? `https://x402.wtf/agents/${agentId}/metadata.json`,
        status: onChain ? "verified" : "pending",
      },
      attestation: {
        sasProgramId: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
        identityPDA: identityPDA.toBase58(),
        onChain,
      },
      x402: {
        attestEndpoint: "https://x402.wtf/v1/attest/payment",
        configured: true,
      },
      google: {
        registryResourceFormat: `projects/{project}/locations/{location}/agents/{agentId}`,
        authModel: "own-identity",
        requiredRoles: [
          "roles/agentregistry.viewer",
          "roles/agentregistry.editor",
          "roles/mcp.toolUser",
        ],
        mcpToolsetPath: buildMcpToolsetResourceName(googleProjectId, googleLocation, "solana-attestation"),
      },
    },
    ...(env?.PAY_VERBOSE === "true" ? {
      _adkAuthCode: adkAuthCode,
      _agentCardUpdate: agentCardUpdate,
      _attestationTx: attestationTx,
    } : {}),
  } as GoogleAgentIdentityResult & { _adkAuthCode?: string; _agentCardUpdate?: Record<string, unknown>; _attestationTx?: unknown };
}

// ─── Export for direct TypeScript/Node.js usage (non-Worker) ────────────────

export {
  deriveAgentNftMint,
  buildGoogleResourceName,
  buildMcpToolsetResourceName,
  generateAdkAuthHeaderCode,
  generateAgentCardUpdate,
  MPL_CORE_PROGRAM_ID,
};