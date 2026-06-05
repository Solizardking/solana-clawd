/** Clawd Agent Auth Protocol — CAAP/1.0 capability constants.
 *
 * These names must stay in sync with the `capabilities` array in ClawdBrowser's
 * `@better-auth/agent-auth` plugin configuration (src/lib/auth.ts).
 */

export const CLAWD_PROVIDER = "Clawd";
export const CAAP_VERSION = "1.0";
export const CAAP_PROTOCOL = "CAAP/1.0";

export const CLAWD_AUTH_BASE = "https://x402.wtf/api/auth";
export const CLAWD_DISCOVERY_URL = "https://x402.wtf/.well-known/agent-auth.json";

export const CAPABILITIES = {
  ATTEST_AGENT: "attest_agent",
  GET_PEER_CARD: "get_peer_card",
  LIST_AGENTS: "list_agents",
  AGENT_CHAT: "agent_chat",
} as const;

export type ClawdCapability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export interface CapabilityRequest {
  name: ClawdCapability;
  constraints?: Record<string, unknown>;
}

export const CAPABILITY_LOCATIONS: Record<ClawdCapability, string> = {
  attest_agent: "https://x402.wtf/api/agents/attest",
  get_peer_card: "https://x402.wtf/api/agents/peer-card",
  list_agents: "https://x402.wtf/api/agents/catalog",
  agent_chat: "https://x402.wtf/api/agents/chat",
};
