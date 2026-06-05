export {
  CLAWD_PROVIDER,
  CAAP_VERSION,
  CAAP_PROTOCOL,
  CLAWD_AUTH_BASE,
  CLAWD_DISCOVERY_URL,
  CAPABILITIES,
  CAPABILITY_LOCATIONS,
} from "./capabilities";
export type { ClawdCapability, CapabilityRequest } from "./capabilities";

export { createClawdAgentClient, AgentAuthClient } from "./client";
export type { ClawdAgentClientOptions } from "./client";
