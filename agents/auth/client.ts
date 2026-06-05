/**
 * AgentAuthClient factory for Clawd agents.
 *
 * Usage:
 *   import { createClawdAgentClient } from "./auth/client";
 *   const client = createClawdAgentClient();
 *   await client.connect("https://x402.wtf/api/auth");
 */
import { AgentAuthClient, type AgentAuthClientOptions } from "@auth/agent";
import { CLAWD_AUTH_BASE, CLAWD_DISCOVERY_URL } from "./capabilities";

export type ClawdAgentClientOptions = Omit<
  AgentAuthClientOptions,
  "directoryUrl"
> & {
  /** Override the x402.wtf base URL (e.g. for local dev). */
  baseUrl?: string;
};

export function createClawdAgentClient(options?: ClawdAgentClientOptions): AgentAuthClient {
  const { baseUrl, ...rest } = options ?? {};
  const authBase = baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/auth` : CLAWD_AUTH_BASE;

  return new AgentAuthClient({
    directoryUrl: baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/.well-known/agent-auth.json`
      : CLAWD_DISCOVERY_URL,
    hostName: "clawd-agent",
    ...rest,
    // Allow agents to discover Clawd directly without a global directory
    allowDirectDiscovery: true,
  });
}

export { AgentAuthClient } from "@auth/agent";
export { CLAWD_AUTH_BASE, CLAWD_DISCOVERY_URL };
