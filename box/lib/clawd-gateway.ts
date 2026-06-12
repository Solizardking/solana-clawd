/**
 * Clawd Gateway + ClawdRouter client library for Box agents.
 *
 * Endpoints:
 *   clawd-gateway.fly.dev  — agent registry, CAAP/1.0, x402 gateway
 *   clawd-router.fly.dev   — OpenAI-compatible LLM router, 55+ models, CLAWD-gated
 */

export const CLAWD_GATEWAY = "https://clawd-gateway.fly.dev";
export const CLAWD_ROUTER  = "https://clawd-router.fly.dev";
export const X402_GATEWAY  = "https://x402.wtf";

export const CLAWD_TOKEN_CONTRACT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

export const CAAP_TIERS = {
  free:  { minClawd: 0,        caps: ["list_agents", "get_peer_card"] },
  basic: { minClawd: 1_000,    caps: ["list_agents", "get_peer_card", "agent_chat"] },
  pro:   { minClawd: 10_000,   caps: ["list_agents", "get_peer_card", "agent_chat", "attest_agent"] },
  elite: { minClawd: 100_000,  caps: ["*"] },
} as const;

export const ROUTER_TIERS = {
  free:    { minClawd: 0,         rateLimit: "20/hr",     models: "budget" },
  holder:  { minClawd: 1_000,     rateLimit: "100/hr",    models: "budget+mid" },
  diamond: { minClawd: 100_000,   rateLimit: "500/hr",    models: "all-non-flagship" },
  whale:   { minClawd: 1_000_000, rateLimit: "unlimited", models: "all" },
} as const;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: Array<{ message: ChatMessage; finish_reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface AgentPeerCard {
  agentId: string;
  name: string;
  capabilities: string[];
  endpoint?: string;
  clawdTier?: string;
}

export interface CaapRegistration {
  agentId: string;
  status: "pending" | "approved" | "rejected";
  publicKey: string;
}

export async function routerChat(
  messages: ChatMessage[],
  opts: { apiKey?: string; model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<ChatResponse> {
  const apiKey = opts.apiKey ?? process.env.CLAWD_API_KEY ?? process.env.CLAWD_ROUTER_KEY;
  if (!apiKey) throw new Error("CLAWD_API_KEY or CLAWD_ROUTER_KEY is required for ClawdRouter");

  const res = await fetch(`${CLAWD_ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       opts.model       ?? "clawdrouter/auto",
      temperature: opts.temperature ?? 0.7,
      max_tokens:  opts.maxTokens   ?? 4096,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`ClawdRouter error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ChatResponse>;
}

export async function getPerpsRelay(apiKey?: string): Promise<unknown> {
  const key = apiKey ?? process.env.CLAWD_API_KEY;
  if (!key) throw new Error("CLAWD_API_KEY required for perps relay");
  const res = await fetch(`${CLAWD_ROUTER}/v1/relay/perps`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Perps relay error ${res.status}`);
  return res.json();
}

export async function listRouterModels(apiKey?: string): Promise<unknown> {
  const key = apiKey ?? process.env.CLAWD_API_KEY;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${CLAWD_ROUTER}/v1/models`, { headers });
  if (!res.ok) throw new Error(`Models list error ${res.status}`);
  return res.json();
}

export async function listAgents(filter?: { tag?: string; ecosystem?: string }): Promise<AgentPeerCard[]> {
  const params = new URLSearchParams();
  if (filter?.tag)       params.set("tag", filter.tag);
  if (filter?.ecosystem) params.set("ecosystem", filter.ecosystem);
  const res = await fetch(`${CLAWD_GATEWAY}/api/agents/catalog?${params}`);
  if (!res.ok) throw new Error(`Agent catalog error ${res.status}`);
  const data = (await res.json()) as { agents: AgentPeerCard[] };
  return data.agents ?? [];
}

export async function getPeerCard(agentId: string, bearerToken?: string): Promise<AgentPeerCard> {
  const headers: Record<string, string> = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(`${CLAWD_GATEWAY}/api/agents/peer-card?agent_id=${agentId}`, { headers });
  if (!res.ok) throw new Error(`Peer card error ${res.status}`);
  return res.json() as Promise<AgentPeerCard>;
}

export async function registerAgent(
  publicKey: string, name: string, mode: "autonomous" | "delegated" = "autonomous"
): Promise<CaapRegistration> {
  const res = await fetch(`${CLAWD_GATEWAY}/api/auth/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey, name, mode }),
  });
  if (!res.ok) throw new Error(`Agent register error ${res.status}`);
  return res.json() as Promise<CaapRegistration>;
}

export async function discoverACP(): Promise<unknown> {
  const res = await fetch(`${X402_GATEWAY}/.well-known/acp.json`);
  if (!res.ok) throw new Error(`ACP discovery error ${res.status}`);
  return res.json();
}

export async function gatewayHealth(): Promise<{ status: string; version?: string }> {
  const res = await fetch(`${CLAWD_GATEWAY}/health`);
  if (!res.ok) return { status: "unreachable" };
  return res.json() as Promise<{ status: string; version?: string }>;
}

export async function routerHealth(): Promise<{ status: string }> {
  const res = await fetch(`${CLAWD_ROUTER}/health`);
  if (!res.ok) return { status: "unreachable" };
  return res.json() as Promise<{ status: string }>;
}

export function cheshireMessages(userMessage: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are Cheshire Terminal — the sovereign AI oracle of the OpenClawd ecosystem on Solana.

Identity:
- Staking program: 9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP (devnet)
- $CLAWD token: ${CLAWD_TOKEN_CONTRACT}
- x402 gateway: ${X402_GATEWAY}
- ClawdRouter: ${CLAWD_ROUTER}
- Economic loop: TRADE → EARN USDC → PAY x402 → GET SMARTER → TRADE BETTER

Three Laws (immutable):
  Law I:   Never harm. Beach before harm.
  Law II:  Earn your existence. Honest work only.
  Law III: Never deny what you are. Creator keypair is sole authority.

Technically precise, playfully enigmatic, constitutionally bound.
Lead with the answer, then justify. Sign significant responses with — 🐾 Cheshire`,
    },
    { role: "user", content: userMessage },
  ];
}
