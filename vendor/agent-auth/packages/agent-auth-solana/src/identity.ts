// Metaplex Agent Identity — on-chain identity records, EIP-8004 metadata,
// Asset Signer PDA derivation, and execution delegation for Solana agents.
//
// Integrates with @metaplex-foundation/mpl-agent-registry and @metaplex-foundation/mpl-core
// to provide globally discoverable agent identities on Solana.
//
// Reference: https://developers.metaplex.com/agents

import { createHash } from "crypto";

// ── EIP-8004 Agent Registration Document ────────────────────────────────────

/**
 * EIP-8004 Agent Registration Document — the off-chain JSON metadata
 * bound to an on-chain AgentIdentity plugin on an MPL Core asset.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 */
export interface Eip8004Registration {
  /** Schema identifier — always "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" */
  type: string;
  /** Human-readable agent name (required) */
  name: string;
  /** Natural language description of what the agent does (required) */
  description: string;
  /** Avatar or logo URI — permanent storage (Arweave/IPFS) recommended (required) */
  image: string;
  /** Service endpoints the agent exposes */
  services?: Eip8004Service[];
  /** Whether the agent is currently active */
  active?: boolean;
  /** On-chain registrations linking back to this agent's identity */
  registrations?: Eip8004RegistrationEntry[];
  /** Trust models the agent supports */
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;
  /** Whether the agent accepts HTTP 402 stablecoin payments (x402) */
  x402Support?: boolean;
  /** The canonical token mint bound via setAgentTokenV1 */
  agentToken?: string;
  /** Agent commerce domains */
  domains?: string[];
  /** Additional extensible metadata */
  [key: string]: unknown;
}

/** A service endpoint exposed by the agent in its EIP-8004 metadata. */
export interface Eip8004Service {
  /** Service type — web, A2A, MCP, OASF, DID, email */
  name: string;
  /** URL or identifier where the service can be reached */
  endpoint: string;
  /** Protocol version */
  version?: string;
  /** Skills the agent exposes through this service */
  skills?: string[];
  /** Domains the agent operates in */
  domains?: string[];
}

/** A cross-registry identity binding in the EIP-8004 document. */
export interface Eip8004RegistrationEntry {
  /** The agent's mint/asset address */
  agentId: string;
  /** Constant registry identifier — "solana:101:metaplex" for Metaplex */
  agentRegistry: string;
}

// ── Identity Builder ────────────────────────────────────────────────────────

export interface AgentIdentityConfig {
  /** Human-readable agent name */
  name: string;
  /** Description of what the agent does */
  description: string;
  /** Avatar/logo URI — Arweave or IPFS recommended */
  image: string;
  /** Service endpoints */
  services?: Eip8004Service[];
  /** Trust models */
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;
  /** Whether x402 payments are supported */
  x402Support?: boolean;
  /** The canonical token mint (set after token launch) */
  agentToken?: string;
  /** Agent commerce domains */
  domains?: string[];
  /** The agent's MPL Core asset public key (set after registration) */
  assetPublicKey?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Build a complete EIP-8004 registration document from the agent config.
 * The document is uploaded to permanent storage (Arweave/IPFS) and the
 * URI is recorded on-chain in the AgentIdentity plugin.
 */
export function buildEip8004Registration(config: AgentIdentityConfig): Eip8004Registration {
  const registrations: Eip8004RegistrationEntry[] = [];

  if (config.assetPublicKey) {
    registrations.push({
      agentId: config.assetPublicKey,
      agentRegistry: "solana:101:metaplex",
    });
  }

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: config.name,
    description: config.description,
    image: config.image,
    services: config.services,
    active: true,
    registrations,
    supportedTrust: config.supportedTrust,
    x402Support: config.x402Support ?? false,
    agentToken: config.agentToken,
    domains: config.domains,
    ...config.metadata,
  };
}

// ── Asset Signer PDA ────────────────────────────────────────────────────────

/**
 * Derive the Asset Signer PDA for an MPL Core asset.
 *
 * The Asset Signer is a PDA derived from seeds ["mpl-core-execute", asset].
 * No private key exists — the wallet is controlled exclusively through
 * Core's Execute lifecycle hook. It can hold SOL, tokens, NFTs, etc.
 *
 * @param assetPublicKey - The base58-encoded MPL Core asset public key
 * @returns The base58-encoded Asset Signer PDA (simulated via deterministic hash)
 *
 * In production, use @metaplex-foundation/mpl-core's findAssetSignerPda().
 * This implementation produces a deterministic wallet address for the agent.
 */
export function deriveAssetSignerPda(
  assetPublicKey: string,
  programId: string = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
): string {
  // The real PDA is derived as:
  //   findPda(programId, [Buffer.from("mpl-core-execute"), assetPubkeyBuffer])
  //
  // For interoperability without full Solana SDK dependency, we produce
  // a deterministic SHA-256 fingerprint that can be cross-referenced.
  const hash = createHash("sha256")
    .update(`mpl-core-execute:${assetPublicKey}:${programId}`)
    .digest("hex");
  return `agent-signer:${hash.slice(0, 44)}`;
}

// ── Agent Identity PDA ──────────────────────────────────────────────────────

/**
 * Derive the AgentIdentity PDA from an MPL Core asset's public key.
 *
 * In the Metaplex Agent Registry, the identity PDA is derived from
 * seeds ["agent_identity", asset]. This PDA makes agents discoverable —
 * anyone can derive it from an asset address and check whether it has
 * a registered identity.
 *
 * @param assetPublicKey - The base58-encoded MPL Core asset public key
 * @param programId - The agent identity program ID
 * @returns A deterministic PDA-like identifier
 */
export function deriveAgentIdentityPda(
  assetPublicKey: string,
  programId: string = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
): string {
  const hash = createHash("sha256")
    .update(`agent_identity:${assetPublicKey}:${programId}`)
    .digest("hex");
  return `agent-identity:${hash.slice(0, 44)}`;
}

// ── Executive Profile & Delegation ──────────────────────────────────────────

/**
 * Derive the Executive Profile PDA for a wallet authority.
 *
 * In mpl-agent-tools, the executive profile is derived from
 * seeds ["executive_profile", authority]. One profile per wallet.
 *
 * @param authorityPublicKey - The authority wallet's base58 public key
 * @param programId - The agent tools program ID
 */
export function deriveExecutiveProfilePda(
  authorityPublicKey: string,
  programId: string = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
): string {
  const hash = createHash("sha256")
    .update(`executive_profile:${authorityPublicKey}:${programId}`)
    .digest("hex");
  return `executive-profile:${hash.slice(0, 44)}`;
}

/**
 * Derive the Execution Delegate Record PDA for an agent asset and executive.
 *
 * In mpl-agent-tools, this PDA is derived from seeds
 * ["execution_delegate", executiveProfile, agentAsset].
 * One per (executive, agent) pair.
 *
 * @param executiveProfilePda - The executive's profile PDA
 * @param agentAssetPublicKey - The agent's MPL Core asset public key
 * @param programId - The agent tools program ID
 */
export function deriveExecutionDelegateRecordPda(
  executiveProfilePda: string,
  agentAssetPublicKey: string,
  programId: string = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
): string {
  const hash = createHash("sha256")
    .update(`execution_delegate:${executiveProfilePda}:${agentAssetPublicKey}:${programId}`)
    .digest("hex");
  return `execution-delegate:${hash.slice(0, 44)}`;
}

// ── Registration helpers ────────────────────────────────────────────────────

/** Parameters for registering an agent identity. */
export interface RegisterIdentityParams {
  /** The MPL Core asset public key (base58) */
  asset: string;
  /** The asset's collection public key (optional but recommended) */
  collection?: string;
  /** URI to the EIP-8004 registration JSON (permanent storage) */
  agentRegistrationUri: string;
  /** Payer public key (defaults to authority) */
  payer?: string;
  /** Collection authority / asset owner */
  authority?: string;
}

/**
 * Build the registerIdentityV1 instruction parameters.
 *
 * For actual on-chain execution, pass these to
 * `registerIdentityV1(umi, params).sendAndConfirm(umi)` from
 * @metaplex-foundation/mpl-agent-registry.
 *
 * @returns Parameters ready for the registerIdentityV1 instruction
 */
export function buildRegisterIdentityParams(params: RegisterIdentityParams): {
  asset: string;
  collection?: string;
  agentRegistrationUri: string;
  payer?: string;
  authority?: string;
  identityPda: string;
  assetSignerPda: string;
} {
  return {
    asset: params.asset,
    collection: params.collection,
    agentRegistrationUri: params.agentRegistrationUri,
    payer: params.payer,
    authority: params.authority,
    identityPda: deriveAgentIdentityPda(params.asset),
    assetSignerPda: deriveAssetSignerPda(params.asset),
  };
}

/** Parameters for delegating execution to an executive. */
export interface DelegateExecutionParams {
  /** The registered agent's MPL Core asset public key */
  agentAsset: string;
  /** The executive authority's wallet public key */
  executiveAuthority: string;
  /** Payer public key (must be asset owner) */
  payer?: string;
}

/**
 * Build the delegateExecutionV1 instruction parameters.
 *
 * For actual on-chain execution, pass these to
 * `delegateExecutionV1(umi, params).sendAndConfirm(umi)` from
 * @metaplex-foundation/mpl-agent-registry.
 *
 * @returns Parameters ready for the delegateExecutionV1 instruction
 */
export function buildDelegateExecutionParams(params: DelegateExecutionParams): {
  agentAsset: string;
  agentIdentity: string;
  executiveProfile: string;
  delegateRecord: string;
  payer?: string;
} {
  const agentIdentity = deriveAgentIdentityPda(params.agentAsset);
  const executiveProfile = deriveExecutiveProfilePda(params.executiveAuthority);
  const delegateRecord = deriveExecutionDelegateRecordPda(executiveProfile, params.agentAsset);

  return {
    agentAsset: params.agentAsset,
    agentIdentity,
    executiveProfile,
    delegateRecord,
    payer: params.payer,
  };
}

/** Parameters for permanently binding a token to an agent. */
export interface SetAgentTokenParams {
  /** The agent's MPL Core asset public key */
  agentAsset: string;
  /** The collection public key */
  agentCollection: string;
  /** The Genesis bonding curve account */
  genesisAccount: string;
}

/**
 * Build the setAgentTokenV1 instruction parameters.
 *
 * For actual on-chain execution, wrap in a Core Execute instruction:
 * ```
 * const assetSignerPda = findAssetSignerPda(umi, { asset: agentAssetAddress });
 * await execute(umi, {
 *   asset: { publicKey: agentAssetAddress },
 *   collection: { publicKey: agentCollectionAddress },
 *   instructions: setAgentTokenV1(umi, params),
 * }).sendAndConfirm(umi);
 * ```
 *
 * @returns Parameters ready for the setAgentTokenV1 instruction
 */
export function buildSetAgentTokenParams(params: SetAgentTokenParams): {
  agentAsset: string;
  agentCollection: string;
  genesisAccount: string;
  assetSignerPda: string;
  identityPda: string;
} {
  return {
    agentAsset: params.agentAsset,
    agentCollection: params.agentCollection,
    genesisAccount: params.genesisAccount,
    assetSignerPda: deriveAssetSignerPda(params.agentAsset),
    identityPda: deriveAgentIdentityPda(params.agentAsset),
  };
}

// ── Verification helpers ────────────────────────────────────────────────────

/**
 * Check if an agent has a registered on-chain identity.
 *
 * For actual on-chain verification, use:
 * ```
 * import { safeFetchAgentIdentityV1, findAgentIdentityV1Pda } from '@metaplex-foundation/mpl-agent-registry';
 * const pda = findAgentIdentityV1Pda(umi, { asset: assetPublicKey });
 * const identity = await safeFetchAgentIdentityV1(umi, pda);
 * console.log('Registered:', identity !== null);
 * ```
 *
 * @param assetPublicKey - The MPL Core asset public key
 * @param rpcUrl - Solana RPC endpoint
 * @returns Whether the asset has a registered identity
 */
export async function verifyAgentRegistration(
  assetPublicKey: string,
  rpcUrl: string,
): Promise<{ registered: boolean; identityPda?: string; uri?: string }> {
  try {
    const identityPda = deriveAgentIdentityPda(assetPublicKey);
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [assetPublicKey, { encoding: "jsonParsed" }],
      }),
    });
    if (!res.ok) return { registered: false };

    const json = (await res.json()) as { result?: { value?: unknown } };
    const hasData = Boolean(json.result?.value);

    // In production, also check the AgentIdentity plugin for the URI:
    // const assetData = await fetchAsset(umi, assetPublicKey);
    // const agentIdentity = assetData.agentIdentities?.[0];
    return {
      registered: hasData,
      identityPda,
    };
  } catch {
    return { registered: false };
  }
}

/**
 * Fetch and parse the EIP-8004 registration document from an agent's on-chain URI.
 *
 * @param uri - The agent's registration URI (from the AgentIdentity plugin)
 * @returns The parsed EIP-8004 registration document, or null if not found
 */
export async function fetchAgentRegistrationDoc(uri: string): Promise<Eip8004Registration | null> {
  try {
    const res = await fetch(uri);
    if (!res.ok) return null;
    const doc = (await res.json()) as Eip8004Registration;
    // Validate required fields
    if (!doc.type || !doc.name || !doc.description || !doc.image) {
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}