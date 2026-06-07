// CAAP: Clawd Agent Attestation Protocol v1.0
export const CAAP_VERSION = "1.0";
export const CAAP_PROTOCOL = "CAAP/1.0";

export type { AttestationResult, WalletSnapshot } from "./attestation";
export type { SubscriptionTier, TierInfo } from "./subscription";
export type { AgentAuthSolanaConfig, VerifiedAgentSession } from "./types";

export { attestAgent, fetchWalletSnapshot } from "./attestation";
export {
  computeTier,
  detectSell,
  tierBadgeColor,
  tierLabel,
  TIER_THRESHOLDS,
} from "./subscription";
export { verifySiws, createSiwsInput, verifySolanaSignature } from "./siws";
export { createCaapPlugin } from "./plugin";
