/**
 * AgentAuthClient factory for Clawd agents.
 *
 * Usage:
 *   import { createClawdAgentClient } from "@solanaclawd/clawd-agents-cli/auth";
 *   const client = createClawdAgentClient();
 *   const token = await client.getToken();
 */
import { AgentAuthClient, type AgentAuthClientOptions } from "@auth/agent";
import { CLAWD_DISCOVERY_URL } from "./capabilities.js";

export type ClawdAgentClientOptions = Omit<AgentAuthClientOptions, "directoryUrl"> & {
  /** Override the x402.wtf base URL (e.g. for local dev). */
  baseUrl?: string;
};

export function createClawdAgentClient(options?: ClawdAgentClientOptions): AgentAuthClient {
  const { baseUrl, ...rest } = options ?? {};
  return new AgentAuthClient({
    directoryUrl: baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/.well-known/agent-auth.json`
      : CLAWD_DISCOVERY_URL,
    hostName: "clawd-agent",
    ...rest,
    allowDirectDiscovery: true,
  });
}

export { AgentAuthClient } from "@auth/agent";
export { CLAWD_AUTH_BASE, CLAWD_DISCOVERY_URL } from "./capabilities.js";
