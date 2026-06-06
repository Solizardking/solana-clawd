import type { SubscriptionTier } from "./subscription";

export interface AgentAuthSolanaConfig {
  /** CLAWD SPL token mint address (default: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump) */
  clawdMint?: string;
  /** Helius API key for DAS/RPC access */
  heliusApiKey?: string;
  /** Enable subscription tier computation from CLAWD balance */
  enableSubscriptionTiers?: boolean;
  /** Enable Helius DAS attestation for agent NFT verification */
  enableDasAttestation?: boolean;
  /** Require verified agent attestation for all sessions */
  requireVerifiedAgent?: boolean;
  /** Solana RPC URL for on-chain identity verification (defaults to heliusRpcUrl) */
  identityRpcUrl?: string;
}

export interface VerifiedAgentSession {
  walletAddress: string;
  agentId?: string;
  verified: boolean;
  tier: SubscriptionTier;
  clawdBalance: number;
  solBalance: number;
  attestationHash?: string;
}
