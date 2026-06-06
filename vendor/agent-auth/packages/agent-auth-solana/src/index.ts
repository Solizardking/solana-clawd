// CAAP: Clawd Agent Attestation Protocol v1.0
export const CAAP_VERSION = "1.0";
export const CAAP_PROTOCOL = "CAAP/1.0";

export type { AttestationResult, WalletSnapshot } from "./attestation";
export type { SubscriptionTier, TierInfo } from "./subscription";
export type { AgentAuthSolanaConfig, VerifiedAgentSession } from "./types";
export type {
  Eip8004Registration,
  Eip8004Service,
  Eip8004RegistrationEntry,
  AgentIdentityConfig,
  RegisterIdentityParams,
  DelegateExecutionParams,
  SetAgentTokenParams,
} from "./identity";
export type { GenesisLaunchResult, GenesisLaunchInput } from "./genesis";

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
export {
  buildEip8004Registration,
  deriveAssetSignerPda,
  deriveAgentIdentityPda,
  deriveExecutiveProfilePda,
  deriveExecutionDelegateRecordPda,
  buildRegisterIdentityParams,
  buildDelegateExecutionParams,
  buildSetAgentTokenParams,
  verifyAgentRegistration,
  fetchAgentRegistrationDoc,
} from "./identity";
export {
  buildGenesisLaunchInput,
  validateGenesisLaunchInput,
  GENESIS_API_BASE,
} from "./genesis";
