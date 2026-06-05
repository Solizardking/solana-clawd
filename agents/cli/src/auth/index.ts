export {
  CAAP_PROTOCOL,
  CAAP_VERSION,
  CAPABILITIES,
  CAPABILITY_LOCATIONS,
  CLAWD_AUTH_BASE,
  CLAWD_DISCOVERY_URL,
  CLAWD_PROVIDER,
} from "./capabilities.js";
export type { CapabilityRequest, ClawdCapability } from "./capabilities.js";

export { AgentAuthClient, createClawdAgentClient } from "./client.js";
export type { ClawdAgentClientOptions } from "./client.js";
