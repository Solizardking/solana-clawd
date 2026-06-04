export interface AgentService {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
}

export interface AgentRegistration {
  agentId: string;
  agentRegistry: string;
}

export interface AgentMetadata {
  type: "agent";
  name: string;
  description: string;
  image?: string;
  services?: AgentService[];
  registrations?: AgentRegistration[];
  supportedTrust?: string[];
  active?: boolean;
  /** Extended Clawd fields */
  models?: string[];
  capabilities?: string[];
  pricing?: { unit: string; amount: number; token: string };
  version?: string;
  clawdVersion?: string;
}

export interface RegisteredAgent {
  assetAddress: string;
  owner: string;
  name: string;
  uri: string;
  registrationUri?: string;
  metadata?: AgentMetadata;
  network: AgentNetwork;
  mintSignature?: string;
  registeredAt: number;
  indexedAt: number;
  active: boolean;
}

export type AgentNetwork =
  | "solana-mainnet"
  | "solana-devnet"
  | "localnet"
  | "eclipse-mainnet"
  | "sonic-mainnet"
  | "sonic-devnet"
  | "fogo-mainnet"
  | "fogo-testnet";

export interface MintAgentOptions {
  name: string;
  uri: string;
  metadata: AgentMetadata;
  network?: AgentNetwork;
  secretKey: Uint8Array;
  rpcUrl?: string;
  baseUrl?: string;
}

export interface RegisterAgentOptions {
  assetAddress: string;
  collectionAddress?: string;
  registrationUri: string;
  secretKey: Uint8Array;
  rpcUrl?: string;
}

export interface SearchOptions {
  query?: string;
  network?: AgentNetwork;
  service?: string;
  capability?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export interface IndexStats {
  total: number;
  active: number;
  byNetwork: Record<string, number>;
  lastIndexed: number;
}
