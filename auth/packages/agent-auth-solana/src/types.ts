import type { SubscriptionTier } from "./subscription";

export interface AgentAuthSolanaConfig {
  clawdMint?: string;
  heliusApiKey?: string;
  enableSubscriptionTiers?: boolean;
  enableDasAttestation?: boolean;
  requireVerifiedAgent?: boolean;
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
