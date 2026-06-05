export const CLAWD_PROJECT_ID = "x402-477302";
export const CLAWD_PROJECT_NUMBER = "1013652097839";
export const CLAWD_REASONING_ENGINE_LOCATION = "us-west1";
export const CLAWD_REASONING_ENGINE_ID = "9023111387018166272";
export const CLAWD_REASONING_ENGINE_URN =
  `urn:agent:projects-${CLAWD_PROJECT_NUMBER}:projects:${CLAWD_PROJECT_NUMBER}:locations:${CLAWD_REASONING_ENGINE_LOCATION}:aiplatform:reasoningEngines:${CLAWD_REASONING_ENGINE_ID}`;
export const CLAWD_SA =
  `service-${CLAWD_PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com`;

export interface RegisteredEndpoint {
  name: string;
  location: string;
  url: string;
  description: string;
}

export const REGISTERED_ENDPOINTS: RegisteredEndpoint[] = [
  {
    name: "Agent Orchestrator API",
    location: "global",
    url: "https://x402.wtf/api/orchestrator",
    description: "Multi-agent orchestration — routes tasks to specialized Solana agents",
  },
  {
    name: "Agents Catalog API",
    location: "global",
    url: "https://x402.wtf/api/agents",
    description: "Full Clawd agent catalog — 125+ agents with CAAP/1.0 discovery",
  },
  {
    name: "Clawd Chat API",
    location: "global",
    url: "https://x402.wtf/api/clawd",
    description: "Primary Clawd conversational interface",
  },
  {
    name: "Imperial Router API",
    location: "global",
    url: "https://x402.wtf/api/imperial",
    description: "Imperial Trading API — Jupiter, Flash, Phoenix, GMTrade routing",
  },
  {
    name: "Perps Trading API v1",
    location: "global",
    url: "https://x402.wtf/api/perps/v1",
    description: "Phoenix Perpetuals trading — preflight, paper, and live execution",
  },
  {
    name: "Phoenix Markets API",
    location: "global",
    url: "https://x402.wtf/api/phoenix/markets",
    description: "Phoenix DEX market data — orderbooks, tickers, funding rates",
  },
  {
    name: "Router v1 Chat Completions",
    location: "global",
    url: "https://x402.wtf/api/router/v1/chat/completions",
    description: "OpenAI-compatible chat completions routed through Clawd agents",
  },
  {
    name: "x402 Agent Chat API",
    location: "global",
    url: "https://x402.wtf/api/x402/agent/chat",
    description: "x402 payment-gated agent chat — micropayment per message",
  },
  {
    name: "x402wtf Registry",
    location: "global",
    url: "https://x402.wtf/agents/registry",
    description: "On-chain agent registry — Metaplex MPL Core NFT identities",
  },
];

export const CLAWD_AUTH_BASE = "https://x402.wtf/api/auth";
export const CLAWD_DISCOVERY_URL = "https://x402.wtf/.well-known/agent-auth.json";
