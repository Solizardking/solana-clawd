import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import {
  deepseekSessions,
  deepseekMessages,
  agentDeployments,
} from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { resolvePastedSolanaContextDetails } from "../lib/helius-entity-resolver";
import {
  HONCHO_WS_ID,
  honchoFetch,
  honchoAddMessages,
  honchoInsight,
} from "../lib/honcho";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";
import { rateLimit } from "../lib/rate-limit";
import {
  getHeliusPriorityFeeEstimate,
  getHeliusTransactionOptimizationConfig,
} from "../lib/helius/transactionOptimization";

const router = Router();

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
const MINIMAX_TEXT_BASE_URL = "https://api.minimax.io/v1/text/chatcompletion_v2";
const DEFAULT_AI_MODEL = "deepseek-v4-pro";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const JUPITER_SWAP_V2_BASE_URL = (process.env.JUPITER_SWAP_V2_BASE_URL || "https://api.jup.ag/swap/v2").replace(/\/$/, "");
const BIRDEYE_BASE_URL = (process.env.BIRDEYE_BASE_URL || "https://public-api.birdeye.so").replace(/\/$/, "");
const TOKEN_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isKimiModel(model: string): boolean {
  return model.startsWith("kimi-") || model.startsWith("moonshot-");
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-") || model.startsWith("o");
}

function isMiniMaxModel(model: string): boolean {
  return model.startsWith("MiniMax-");
}

function getModelProvider(model: string): "openai" | "deepseek" | "kimi" | "minimax" {
  if (isOpenAIModel(model)) return "openai";
  if (isMiniMaxModel(model)) return "minimax";
  return isKimiModel(model) ? "kimi" : "deepseek";
}

function getClientForModel(model: string): OpenAI {
  const provider = getModelProvider(model);
  if (provider === "kimi") {
    return new OpenAI({
      apiKey: process.env.MOONSHOT_API_KEY || "",
      baseURL: MOONSHOT_BASE_URL,
    });
  }
  if (provider === "openai") {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });
  }
  if (provider === "minimax") {
    return new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY || "",
      baseURL: "https://api.minimax.io/v1",
    });
  }
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: DEEPSEEK_BASE_URL,
  });
}

function getProviderName(model: string): string {
  const provider = getModelProvider(model);
  if (provider === "openai") return "OpenAI";
  if (provider === "minimax") return "MiniMax";
  return provider === "kimi" ? "Kimi K2.6" : "DeepSeek V4";
}

function assertProviderConfigured(model: string) {
  const provider = getModelProvider(model);
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (provider === "kimi" && !process.env.MOONSHOT_API_KEY) {
    throw new Error("MOONSHOT_API_KEY is not configured");
  }
  if (provider === "minimax" && !process.env.MINIMAX_API_KEY) {
    throw new Error("MINIMAX_API_KEY is not configured");
  }
  if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
}

router.get("/models", (_req: Request, res: Response) => {
  res.json({
    defaultModel: DEFAULT_AI_MODEL,
    models: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", description: "Default flagship reasoning model with tool calls", contextWindow: 1_000_000, thinking: true },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", description: "Fast DeepSeek model with thinking and tool calls", contextWindow: 1_000_000, thinking: true },
      { id: "gpt-5", name: "OpenAI GPT-5", description: "OpenAI fallback model", contextWindow: 400_000, thinking: true },
      { id: "kimi-k2.6", name: "Kimi K2.6", description: "Moonshot fallback model", contextWindow: 256_000, thinking: true },
      { id: "MiniMax-M2.7", name: "MiniMax M2.7", description: "MiniMax reasoning model via MINIMAX_API_KEY", contextWindow: 204_800, thinking: true },
      { id: "MiniMax-M2.7-highspeed", name: "MiniMax M2.7 Highspeed", description: "Fast MiniMax endpoint via MINIMAX_API_KEY", contextWindow: 204_800, thinking: true },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5", description: "Legacy MiniMax fallback", contextWindow: 204_800, thinking: true },
      { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed", description: "Legacy fast MiniMax fallback", contextWindow: 204_800, thinking: true },
    ],
  });
});

const aiChatLimiter = rateLimit({
  namespace: "ai:deepseek-chat",
  windowMs: 60_000,
  max: 30,
  message: "Too many AI chat requests. Please wait a moment before trying again.",
});

function unwrapBirdeyePayload(payload: any) {
  return payload?.data ?? payload;
}

async function deepseekBirdeyeRequest(endpoint: string, params: Record<string, string | number | boolean> = {}, chain = "solana") {
  if (!process.env.BIRDEYE_API_KEY) throw new Error("BIRDEYE_API_KEY is not configured");
  const url = new URL(`${BIRDEYE_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const r = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "x-api-key": process.env.BIRDEYE_API_KEY,
      "x-chain": chain,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const message = data?.message || data?.error || data?.raw || `Birdeye ${r.status}`;
    throw new Error(String(message));
  }
  return data;
}

async function captureBirdeyeSource(label: string, work: () => Promise<any>) {
  try {
    const payload = await work();
    return { label, available: true, data: unwrapBirdeyePayload(payload) };
  } catch (error: any) {
    return { label, available: false, error: error?.message || String(error) };
  }
}

function firstAvailable(sources: Array<{ label: string; available: boolean; data?: any }>, label: string) {
  return sources.find((source) => source.label === label && source.available)?.data ?? {};
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

async function buildClawdTokenSnapshot(address: string, hint?: { symbol?: string; name?: string }) {
  const sources = await Promise.all([
    captureBirdeyeSource("overview", () => deepseekBirdeyeRequest("/defi/token_overview", { address })),
    captureBirdeyeSource("metadata", () => deepseekBirdeyeRequest("/defi/v3/token/meta-data/single", { address })),
    captureBirdeyeSource("marketData", () => deepseekBirdeyeRequest("/defi/v3/token/market-data", { address })),
    captureBirdeyeSource("tradeData", () => deepseekBirdeyeRequest("/defi/v3/token/trade-data/single", { address })),
    captureBirdeyeSource("liquidity", () => deepseekBirdeyeRequest("/defi/v3/token/liquidity/single", { address })),
    captureBirdeyeSource("security", () => deepseekBirdeyeRequest("/defi/token_security", { address })),
    captureBirdeyeSource("creation", () => deepseekBirdeyeRequest("/defi/token_creation_info", { address })),
  ]);

  const overview = firstAvailable(sources, "overview");
  const metadata = firstAvailable(sources, "metadata");
  const marketData = firstAvailable(sources, "marketData");
  const tradeData = firstAvailable(sources, "tradeData");
  const liquidity = firstAvailable(sources, "liquidity");
  const security = firstAvailable(sources, "security");
  const creation = firstAvailable(sources, "creation");

  const summary = {
    address,
    symbol: overview.symbol ?? metadata.symbol ?? hint?.symbol ?? "UNKNOWN",
    name: overview.name ?? metadata.name ?? hint?.name ?? "Unknown Token",
    decimals: numberOrNull(overview.decimals ?? metadata.decimals),
    logoURI: overview.logoURI ?? metadata.logoURI ?? metadata.logo_uri ?? metadata.image ?? null,
    price: numberOrNull(overview.price ?? marketData.price),
    priceChange24hPercent: numberOrNull(overview.priceChange24hPercent ?? marketData.priceChange24hPercent),
    volume24hUSD: numberOrNull(overview.volume24hUSD ?? overview.v24hUSD ?? tradeData.volume24hUSD ?? tradeData.v24hUSD),
    liquidity: numberOrNull(overview.liquidity ?? liquidity.liquidity),
    marketCap: numberOrNull(overview.marketCap ?? marketData.marketCap),
    fdv: numberOrNull(overview.fdv ?? marketData.fdv),
    holder: numberOrNull(overview.holder ?? security.holder),
    uniqueWallet24h: numberOrNull(overview.uniqueWallet24h ?? tradeData.uniqueWallet24h),
    buy24h: numberOrNull(overview.buy24h ?? tradeData.buy24h),
    sell24h: numberOrNull(overview.sell24h ?? tradeData.sell24h),
    trade24h: numberOrNull(overview.trade24h ?? tradeData.trade24h),
    top10HolderPercent: numberOrNull(security.top10HolderPercent),
    creatorPercentage: numberOrNull(security.creatorPercentage),
    isMintable: boolOrNull(security.isMintable),
    isFreezable: boolOrNull(security.isFreezable),
    mintAuthority: security.mintAuthority ?? null,
    freezeAuthority: security.freezeAuthority ?? null,
    creatorAddress: security.creatorAddress ?? creation.creatorAddress ?? creation.creator ?? null,
    createdTime: creation.createdTime ?? creation.creationTime ?? creation.blockUnixTime ?? null,
  };

  return {
    summary,
    sources,
  };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
export const TRADING_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for real-time information using Exa AI",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          num_results: { type: "number", description: "Number of results (default 5)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_price",
      description: "Get real-time price and market data for a Solana token",
      parameters: {
        type: "object",
        properties: {
          token_address: { type: "string", description: "Solana token mint address" },
        },
        required: ["token_address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_solana_token",
      description: "Look up Solana token metadata, supply, price info, authorities, token program, and top holder accounts through Helius DAS/RPC",
      parameters: {
        type: "object",
        properties: {
          mint_address: { type: "string", description: "Solana token mint address" },
          include_holders: { type: "boolean", description: "Whether to include largest token accounts (default true)" },
        },
        required: ["mint_address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_token_accounts",
      description: "List SPL or Token-2022 token accounts owned by a wallet through Helius RPC, optionally filtered by mint",
      parameters: {
        type: "object",
        properties: {
          wallet_address: { type: "string", description: "Solana owner wallet address" },
          mint_address: { type: "string", description: "Optional token mint address to filter for one token" },
          token_program: { type: "string", description: "Optional token program: spl-token or token-2022. Defaults to spl-token." },
          limit: { type: "number", description: "Maximum accounts to include (default 20, max 50)" },
        },
        required: ["wallet_address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_solana_priority_fee",
      description: "Estimate Helius priority fees for a serialized transaction or account/program keys. Use for transaction optimization before signing/submitting.",
      parameters: {
        type: "object",
        properties: {
          serialized_transaction: { type: "string", description: "Optional base64 or base58 serialized transaction" },
          account_keys: {
            type: "array",
            items: { type: "string" },
            description: "Optional account or program public keys, e.g. Jupiter or token program IDs",
          },
          priority_level: { type: "string", description: "Min, Low, Medium, High, VeryHigh, or UnsafeMax. Defaults to Medium." },
          transaction_encoding: { type: "string", description: "Base64 or Base58 when serialized_transaction is provided" },
          include_all_levels: { type: "boolean", description: "Whether to return all priority fee levels" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_jupiter_swap_route",
      description: "Build or preview a Jupiter Swap V2 route/order for a Solana token swap. Returns route details and whether a wallet-signable transaction is available; it never signs for the user.",
      parameters: {
        type: "object",
        properties: {
          input_mint: { type: "string", description: `Input token mint address. SOL is ${SOL_MINT}` },
          output_mint: { type: "string", description: `Output token mint address. CLAWD is ${CLAWD_MINT}; USDC is ${USDC_MINT}` },
          amount_raw: { type: "string", description: "Amount in atomic/base units. For 0.1 SOL use 100000000." },
          amount_ui: { type: "string", description: "Optional human token amount, used only when amount_raw is omitted." },
          input_decimals: { type: "number", description: "Decimals for amount_ui conversion. SOL is 9, USDC is 6." },
          wallet_address: { type: "string", description: "Optional taker wallet. If omitted, Jupiter returns quote-only data without a transaction." },
          slippage_bps: { type: "number", description: "Optional slippage tolerance in basis points. Omitting it keeps all routers maximally eligible." },
        },
        required: ["input_mint", "output_mint"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_balance",
      description: "Get SOL and token balances for a Solana wallet address",
      parameters: {
        type: "object",
        properties: {
          wallet_address: { type: "string", description: "Solana wallet address" },
        },
        required: ["wallet_address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mint_solana_agent",
      description: "Mint a new Metaplex Core NFT agent on Solana via Helius RPC",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Agent name" },
          agent_type: { type: "string", description: "Type of agent (e.g. DeFi, Analyst, Oracle)" },
          description: { type: "string", description: "Agent description" },
          personality: { type: "string", description: "Personality traits" },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "List of agent capabilities",
          },
        },
        required: ["name", "agent_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_solana_agent",
      description: "Register an existing MPL Core asset as a Metaplex agent with AgentIdentityV1",
      parameters: {
        type: "object",
        properties: {
          asset_address: { type: "string", description: "MPL Core asset public key" },
          name: { type: "string", description: "Agent name" },
          agent_type: { type: "string", description: "Type of agent" },
          description: { type: "string", description: "Agent description" },
        },
        required: ["asset_address", "name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deployed_agents",
      description: "List all Solana agents deployed from this terminal, tracked in the production database",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of agents to return (default 10)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rpc_status",
      description: "Check the current Helius RPC health and latest Solana slot",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trending_tokens",
      description: "Get the top trending Solana tokens by volume or price change right now",
      parameters: {
        type: "object",
        properties: {
          sort_by: { type: "string", description: "Birdeye token_trending sort field: rank, volume24hUSD, or liquidity." },
          interval: { type: "string", description: "Trending interval: 1h, 4h, or 24h (default 24h)" },
          sort_type: { type: "string", description: "Sort order: asc or desc (default asc for rank, desc for volume/liquidity)" },
          limit: { type: "number", description: "Number of results (default 10, max 20)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_holders",
      description: "Get the top token holders for a Solana SPL token via Helius",
      parameters: {
        type: "object",
        properties: {
          token_address: { type: "string", description: "Solana token mint address" },
          limit: { type: "number", description: "Number of top holders to return (default 10)" },
        },
        required: ["token_address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_wallet_portfolio",
      description: "Get the full token portfolio and total value for a Solana wallet using Birdeye",
      parameters: {
        type: "object",
        properties: {
          wallet_address: { type: "string", description: "Solana wallet address" },
        },
        required: ["wallet_address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crypto_news",
      description: "Get the latest Solana / crypto news headlines",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for news (default: solana)" },
          limit: { type: "number", description: "Number of articles to return (default 5)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_meme_image",
      description: "Generate a meme token image or artwork using FAL AI image generation",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image generation prompt — be vivid and creative" },
          style: { type: "string", description: "Art style: cartoon, pixel-art, logo, realistic, anime (default: cartoon)" },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_movers",
      description: "Get the top gainers and losers on Solana DEXes in the last 24 hours",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", description: "gainers or losers (default: gainers)" },
          limit: { type: "number", description: "Number of tokens to return (default 8)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dflow_swap_quote",
      description: "Get a DFlow Intent swap quote for any Solana token pair. Returns expected output, price impact, fee budget, and slippage. Use this to price a trade before executing.",
      parameters: {
        type: "object",
        properties: {
          input_mint: { type: "string", description: "Input token mint address (e.g. So11111111111111111111111111111111111111112 for SOL, EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for USDC)" },
          output_mint: { type: "string", description: "Output token mint address" },
          amount: { type: "number", description: "Input amount in UI units (e.g. 1.5 for 1.5 SOL or 100 for 100 USDC)" },
          input_decimals: { type: "number", description: "Decimals for input token (9 for SOL, 6 for USDC/USDT)" },
        },
        required: ["input_mint", "output_mint", "amount", "input_decimals"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dflow_priority_fees",
      description: "Get current Solana priority fee estimates from DFlow (medium, high, very high) in micro-lamports per compute unit. Use before building transactions.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dflow_prediction_markets",
      description: "Browse DFlow on-chain prediction markets — get top active markets by volume with YES/NO prices and time remaining. Use to analyze prediction market opportunities.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of markets to return (default 6, max 12)" },
          query: { type: "string", description: "Optional search query to filter markets (e.g. 'bitcoin', 'election', 'solana')" },
        },
        additionalProperties: false,
      },
    },
  },
];

const TOOLS = TRADING_TOOLS;
const RESPONSE_TOOLS = TOOLS.map((tool) => {
  const functionTool = tool as OpenAI.Chat.ChatCompletionFunctionTool;
  return {
    type: "function" as const,
    name: functionTool.function.name,
    description: functionTool.function.description,
    parameters: functionTool.function.parameters,
    strict: false,
  };
});

function toResponseInput(clientMessages: any[], systemPrompt: string): any[] {
  const input: any[] = [{ role: "developer", content: systemPrompt }];
  for (const message of clientMessages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    input.push({
      role: message.role,
      content: String(message.content || ""),
    });
  }
  return input;
}

function getResponseText(response: any): string {
  if (typeof response.output_text === "string") return response.output_text;
  let text = "";
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text") text += content.text || "";
      if (content.type === "refusal") text += content.refusal || "";
    }
  }
  return text;
}

function getResponseFunctionCalls(response: any): any[] {
  return (response.output || []).filter((item: any) => item.type === "function_call");
}

function normalizeMiniMaxMessages(messages: any[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.tool_call_id,
        content: String(message.content || ""),
      };
    }
    const normalized: any = {
      role: message.role,
      content: message.content == null ? "" : String(message.content),
    };
    if (message.name) normalized.name = message.name;
    if (message.tool_calls) normalized.tool_calls = message.tool_calls;
    if (message.reasoning_content) normalized.reasoning_content = message.reasoning_content;
    return normalized;
  });
}

function extractMiniMaxText(message: any): string {
  if (!message?.content) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: any) => block?.text || block?.content || "")
      .filter(Boolean)
      .join("");
  }
  return "";
}

async function createMiniMaxChatCompletion(params: {
  model: string;
  messages: any[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  useTools: boolean;
}) {
  assertProviderConfigured(params.model);
  const body: any = {
    model: params.model,
    messages: normalizeMiniMaxMessages(params.messages),
    stream: false,
    temperature: 1,
    top_p: 0.95,
    max_completion_tokens: 4096,
  };
  if (params.useTools) {
    body.tools = params.tools || [];
    body.tool_choice = "auto";
  }

  const response = await fetch(MINIMAX_TEXT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data?.base_resp?.status_code > 0) {
    const status = data?.base_resp?.status_code || response.status;
    const message = data?.base_resp?.status_msg || data?.error?.message || data?.raw || `MiniMax request failed (${response.status})`;
    throw new Error(`MiniMax error ${status}: ${message}`);
  }
  return data;
}

function getHeliusRpcUrl() {
  return (
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "")
  );
}

async function heliusRpc<T = any>(method: string, params: any): Promise<T> {
  const rpcUrl = getHeliusRpcUrl();
  if (!rpcUrl) throw new Error("HELIUS_RPC_URL or HELIUS_API_KEY is not configured");
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `clawd-${method}`, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Helius ${method} returned non-JSON response (${response.status})`);
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Helius ${method} failed (${response.status})`);
  }
  return data.result as T;
}

function uiAmountToRawString(amountUi: unknown, decimals: unknown) {
  const amount = String(amountUi ?? "").trim();
  const decimalCount = Number(decimals);
  if (!amount || !Number.isInteger(decimalCount) || decimalCount < 0 || decimalCount > 18) {
    return "";
  }
  const match = amount.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return "";
  const whole = match[1];
  const fraction = (match[2] || "").padEnd(decimalCount, "0").slice(0, decimalCount);
  return (BigInt(whole) * 10n ** BigInt(decimalCount) + BigInt(fraction || "0")).toString();
}

function formatCompactUsd(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(n >= 1 ? 2 : 6)}`;
}

function summarizeJupiterRoute(order: any, inputMint: string, outputMint: string) {
  const transactionState =
    order.transaction === null || order.transaction === undefined
      ? "quote-only: no wallet/taker was supplied"
      : order.transaction === ""
        ? `not buildable: ${order.errorCode ?? "unknown"} ${order.errorMessage ?? ""}`.trim()
        : "wallet-signable transaction returned";

  return [
    "Jupiter Swap V2 route/order",
    `Input mint: ${inputMint}`,
    `Output mint: ${outputMint}`,
    `Router: ${order.router || "n/a"}`,
    `Mode: ${order.mode || "n/a"}`,
    `In amount: ${order.inAmount || order.inputAmount || "n/a"}`,
    `Expected out: ${order.outAmount || "n/a"}`,
    `Fee bps: ${order.feeBps ?? "n/a"}`,
    `Fee mint: ${order.feeMint || order.platformFee?.feeMint || "n/a"}`,
    `Request ID: ${order.requestId || "n/a"}`,
    `Transaction: ${transactionState}`,
    "Execution path: the browser wallet must sign the returned transaction, then submit signedTransaction + requestId to /api/jupiter-ultra/execute.",
  ].join("\n");
}

// ─── Tool executor ─────────────────────────────────────────────────────────────
export async function executeTradingTool(name: string, args: any): Promise<string> {
  const port = process.env.PORT || "5000";
  const base = process.env.VITE_APP_URL || `http://127.0.0.1:${port}`;

  try {
    switch (name) {
      case "search_web": {
        const exaKey = process.env.EXA_API_KEY;
        if (!exaKey) return "Exa API key not configured.";
        const r = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": exaKey },
          body: JSON.stringify({ query: args.query, numResults: args.num_results || 5, useAutoprompt: true }),
          signal: AbortSignal.timeout(10000),
        });
        const d = await r.json();
        const results = (d.results || []).slice(0, 5).map((r: any) => `• ${r.title}\n  ${r.url}\n  ${r.snippet || ""}`).join("\n\n");
        return results || "No results found.";
      }

      case "get_token_price": {
        const r = await fetch(`${base}/api/birdeye/token-overview?address=${args.token_address}`, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        if (!d.data) return "Token not found or no price data available.";
        const t = d.data;
        return `Token: ${t.symbol || args.token_address}\nPrice: $${t.price || "N/A"}\n24h Change: ${t.priceChange24hPercent?.toFixed(2) || "N/A"}%\nMkt Cap: $${t.mc ? (t.mc / 1e6).toFixed(2) + "M" : "N/A"}\nVolume 24h: $${t.v24hUSD ? (t.v24hUSD / 1e6).toFixed(2) + "M" : "N/A"}`;
      }

      case "lookup_solana_token": {
        const mint = String(args.mint_address || "").trim();
        if (!mint) return "mint_address is required.";
        const includeHolders = args.include_holders !== false;
        const [asset, holderData, supplyData] = await Promise.all([
          heliusRpc<any>("getAsset", { id: mint, options: { showFungible: true } }).catch((error) => ({ error: error.message })),
          includeHolders
            ? heliusRpc<any>("getTokenLargestAccounts", [mint, { commitment: "finalized" }]).catch((error) => ({ error: error.message }))
            : Promise.resolve(null),
          heliusRpc<any>("getTokenSupply", [mint, { commitment: "finalized" }]).catch((error) => ({ error: error.message })),
        ]);

        if (asset?.error && holderData?.error && supplyData?.error) {
          return `Helius token lookup failed: ${asset.error}; holders failed: ${holderData.error}; supply failed: ${supplyData.error}`;
        }

        const metadata = asset?.content?.metadata || {};
        const tokenInfo = asset?.token_info || asset?.content?.token_info || {};
        const priceInfo = tokenInfo.price_info || {};
        const authorities = Array.isArray(asset?.authorities)
          ? asset.authorities.map((a: any) => `${a.address} (${(a.scopes || []).join(", ") || "scope unknown"})`).slice(0, 4)
          : [];
        const topAccounts = Array.isArray(holderData?.value)
          ? holderData.value.slice(0, 8).map((account: any, index: number) =>
              `${index + 1}. ${account.address} — ${account.uiAmountString || account.uiAmount || account.amount || "n/a"}`,
            )
          : [];

        return [
          `Helius DAS token lookup: ${metadata.symbol || mint}`,
          `Mint: ${mint}`,
          `Name: ${metadata.name || "n/a"}`,
          `Interface: ${asset?.interface || "n/a"}`,
          `Token standard: ${metadata.token_standard || tokenInfo.token_standard || "n/a"}`,
          `Decimals: ${tokenInfo.decimals ?? "n/a"}`,
          `Supply: ${supplyData?.value?.uiAmountString || supplyData?.value?.amount || tokenInfo.supply || "n/a"}`,
          `Token program: ${tokenInfo.token_program || "n/a"}`,
          `Associated token account: ${tokenInfo.associated_token_address || "n/a"}`,
          asset?.mint_extensions ? `Token-2022 mint extensions: ${JSON.stringify(asset.mint_extensions).slice(0, 1200)}` : "",
          `Price: ${priceInfo.price_per_token != null ? formatCompactUsd(priceInfo.price_per_token) : "n/a"}`,
          `Market value: ${priceInfo.total_price != null ? formatCompactUsd(priceInfo.total_price) : "n/a"}`,
          `Owner: ${asset?.ownership?.owner || "n/a"}`,
          `Authorities: ${authorities.length ? authorities.join("; ") : "n/a"}`,
          `Image: ${asset?.content?.links?.image || asset?.content?.files?.[0]?.cdn_uri || asset?.content?.files?.[0]?.uri || "n/a"}`,
          topAccounts.length ? `Top token accounts:\n${topAccounts.join("\n")}` : holderData?.error ? `Top token accounts unavailable: ${holderData.error}` : "",
        ].filter(Boolean).join("\n");
      }

      case "get_wallet_token_accounts": {
        const wallet = String(args.wallet_address || "").trim();
        if (!wallet) return "wallet_address is required.";
        const limit = Math.max(1, Math.min(50, Number(args.limit || 20)));
        const mint = String(args.mint_address || "").trim();
        const programId = args.token_program === "token-2022"
          ? "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
          : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const filter = mint ? { mint } : { programId };

        const [accounts, dasAssets] = await Promise.all([
          heliusRpc<any>("getTokenAccountsByOwner", [
            wallet,
            filter,
            { encoding: "jsonParsed", commitment: "confirmed" },
          ]).catch((error) => ({ error: error.message })),
          heliusRpc<any>("searchAssets", {
            ownerAddress: wallet,
            tokenType: "fungible",
            page: 1,
            limit,
            sortBy: { sortBy: "id", sortDirection: "asc" },
          }).catch((error) => ({ error: error.message })),
        ]);

        const rawAccounts = Array.isArray(accounts?.value) ? accounts.value.slice(0, limit) : [];
        const accountLines = rawAccounts.map((account: any, index: number) => {
          const info = account.account?.data?.parsed?.info || {};
          const tokenAmount = info.tokenAmount || {};
          return `${index + 1}. ${info.mint || "unknown mint"} — ${tokenAmount.uiAmountString || tokenAmount.uiAmount || tokenAmount.amount || "0"} tokens (${account.pubkey})`;
        });
        const assetItems = Array.isArray(dasAssets?.items) ? dasAssets.items.slice(0, limit) : [];
        const assetLines = assetItems.map((asset: any, index: number) => {
          const meta = asset.content?.metadata || {};
          const info = asset.token_info || asset.content?.token_info || {};
          const price = info.price_info?.total_price != null ? `, value ${formatCompactUsd(info.price_info.total_price)}` : "";
          return `${index + 1}. ${meta.symbol || asset.id.slice(0, 6)} — balance ${info.balance ?? "n/a"}${price} (${asset.id})`;
        });

        return [
          `Helius wallet token inventory: ${wallet}`,
          `RPC token accounts (${rawAccounts.length}${accounts?.error ? `, error: ${accounts.error}` : ""}):`,
          accountLines.length ? accountLines.join("\n") : "No token accounts returned.",
          `DAS fungible assets (${assetItems.length}${dasAssets?.error ? `, error: ${dasAssets.error}` : ""}):`,
          assetLines.length ? assetLines.join("\n") : "No DAS fungible assets returned.",
        ].join("\n");
      }

      case "estimate_solana_priority_fee": {
        const serialized = String(args.serialized_transaction || "").trim();
        const accountKeys = Array.isArray(args.account_keys)
          ? args.account_keys.map((key: unknown) => String(key).trim()).filter(Boolean).slice(0, 64)
          : [];
        if (!serialized && accountKeys.length === 0) {
          return "Provide serialized_transaction or account_keys for Helius priority fee estimation.";
        }
        const priorityLevel = ["Min", "Low", "Medium", "High", "VeryHigh", "UnsafeMax"].includes(String(args.priority_level))
          ? String(args.priority_level) as any
          : "Medium";
        const transactionEncoding = ["Base64", "Base58"].includes(String(args.transaction_encoding))
          ? String(args.transaction_encoding) as "Base64" | "Base58"
          : serialized ? "Base64" : undefined;
        const estimate = await getHeliusPriorityFeeEstimate({
          transaction: serialized || undefined,
          accountKeys: accountKeys.length ? accountKeys : undefined,
          options: {
            priorityLevel,
            recommended: true,
            includeAllPriorityFeeLevels: Boolean(args.include_all_levels),
            transactionEncoding,
          },
        }) as any;
        const config = getHeliusTransactionOptimizationConfig();
        return [
          `Helius Priority Fee estimate`,
          `Priority level: ${priorityLevel}`,
          `Recommended micro-lamports/CU: ${estimate.priorityFeeEstimate ?? "n/a"}`,
          estimate.priorityFeeLevels ? `All levels: ${JSON.stringify(estimate.priorityFeeLevels)}` : "",
          `Landing default: ${config.defaultLandingMode}`,
          `Sender tip requirement: ${config.senderTipSol} SOL to one Helius tip account if using Sender.`,
        ].filter(Boolean).join("\n");
      }

      case "build_jupiter_swap_route": {
        const inputMint = String(args.input_mint || SOL_MINT).trim();
        const outputMint = String(args.output_mint || CLAWD_MINT).trim();
        const amountRaw = String(args.amount_raw || uiAmountToRawString(args.amount_ui, args.input_decimals || 9)).trim();
        if (!inputMint || !outputMint) return "input_mint and output_mint are required.";
        if (!amountRaw || !/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) {
          return "A positive amount_raw is required, or provide amount_ui plus input_decimals.";
        }

        const params = new URLSearchParams({
          inputMint,
          outputMint,
          amount: amountRaw,
        });
        if (args.wallet_address) params.set("taker", String(args.wallet_address));
        if (Number.isFinite(Number(args.slippage_bps))) params.set("slippageBps", String(Math.max(1, Math.min(5_000, Math.floor(Number(args.slippage_bps))))));

        const response = await fetch(`${JUPITER_SWAP_V2_BASE_URL}/order?${params}`, {
          headers: process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {},
          signal: AbortSignal.timeout(15_000),
        });
        const text = await response.text();
        let order: any;
        try {
          order = JSON.parse(text);
        } catch {
          return `Jupiter route failed (${response.status}): ${text.slice(0, 500)}`;
        }
        if (!response.ok) {
          return `Jupiter route failed (${response.status}): ${order.error || order.message || JSON.stringify(order).slice(0, 500)}`;
        }
        return summarizeJupiterRoute(order, inputMint, outputMint);
      }

      case "get_wallet_balance": {
        const rpcUrl = getHeliusRpcUrl();
        if (!rpcUrl) return "Helius RPC not configured.";
        const r = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [args.wallet_address] }),
          signal: AbortSignal.timeout(10000),
        });
        const d = await r.json();
        const lamports = d.result?.value || 0;
        const sol = (lamports / 1e9).toFixed(4);
        return `Wallet: ${args.wallet_address}\nSOL Balance: ${sol} SOL (${lamports} lamports)`;
      }

      case "mint_solana_agent": {
        const r = await fetch(`${base}/api/metaplex-agents/mint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: args.name,
            agentType: args.agent_type,
            description: args.description,
            personality: args.personality,
            capabilities: args.capabilities || [],
          }),
          signal: AbortSignal.timeout(60000),
        });
        const d = await r.json();
        if (d.success) {
          // Record in DB
          await db.insert(agentDeployments).values({
            assetAddress: d.assetAddress,
            name: args.name,
            agentType: args.agent_type,
            signature: d.signature,
            isRegistered: false,
            network: "mainnet-beta",
            metadata: d,
          }).onConflictDoNothing();
          return `✅ Agent minted!\nAsset: ${d.assetAddress}\nExplorer: ${d.explorerUrl}\nSig: ${d.signature?.slice(0, 16)}...`;
        }
        return `Mint failed: ${d.error || "Unknown error"}`;
      }

      case "register_solana_agent": {
        const r = await fetch(`${base}/api/metaplex-agents/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetAddress: args.asset_address,
            name: args.name,
            agentType: args.agent_type,
            description: args.description,
          }),
          signal: AbortSignal.timeout(60000),
        });
        const d = await r.json();
        if (d.success) {
          await db.update(agentDeployments)
            .set({ isRegistered: true, registrationUri: d.agentRegistrationUri })
            .where(eq(agentDeployments.assetAddress, args.asset_address));
          return `✅ Agent registered!\nAsset: ${args.asset_address}\nURI: ${d.agentRegistrationUri?.slice(0, 60)}...\nSig: ${d.signature?.slice(0, 16)}...`;
        }
        return `Registration failed: ${d.error || "Unknown error"}`;
      }

      case "list_deployed_agents": {
        const limit = args.limit || 10;
        const agents = await db.select().from(agentDeployments).orderBy(desc(agentDeployments.createdAt)).limit(limit);
        if (agents.length === 0) return "No agents deployed yet from this terminal.";
        return agents.map((a) => `• ${a.name} (${a.agentType || "unknown"})\n  Asset: ${a.assetAddress}\n  Registered: ${a.isRegistered ? "✅" : "❌"}\n  Network: ${a.network}\n  Created: ${a.createdAt?.toISOString().slice(0, 10)}`).join("\n\n");
      }

      case "get_rpc_status": {
        const r = await fetch(`${base}/api/metaplex-agents/health`, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        return d.success
          ? `✅ Helius RPC online\nNetwork: ${d.network}\nSlot: ${d.currentSlot?.toLocaleString()}\nWallet: ${d.walletConfigured ? "✅ configured" : "❌ missing"}`
          : `❌ RPC offline: ${d.error}`;
      }

      case "get_trending_tokens": {
        const birdeyeKey = process.env.BIRDEYE_API_KEY;
        if (!birdeyeKey) return "Birdeye API key not configured.";
        const sortMap: Record<string, string> = {
          rank: "rank",
          volumeUSD: "volumeUSD",
          volume24hUSD: "volume24hUSD",
          liquidity: "liquidity",
        };
        const sortBy = sortMap[String(args.sort_by || "rank")] || "rank";
        const interval = ["1h", "4h", "24h"].includes(String(args.interval)) ? String(args.interval) : "24h";
        const sortType = args.sort_type === "asc" || args.sort_type === "desc"
          ? args.sort_type
          : sortBy === "rank" ? "asc" : "desc";
        const limit = Math.min(args.limit || 10, 20);
        const r = await fetch(
          `https://public-api.birdeye.so/defi/token_trending?sort_by=${encodeURIComponent(sortBy)}&interval=${interval}&sort_type=${sortType}&offset=0&limit=${limit}&ui_amount_mode=scaled`,
          { headers: { "x-api-key": birdeyeKey, "x-chain": "solana", accept: "application/json" }, signal: AbortSignal.timeout(12000) }
        );
        const d = await r.json();
        const rawTokens = d.data?.tokens || d.data?.items || d.data || [];
        if (!Array.isArray(rawTokens) || rawTokens.length === 0) return "Could not fetch trending tokens from Birdeye.";
        const tokens = rawTokens.slice(0, limit).map((t: any, i: number) =>
          `${i + 1}. ${t.symbol || "?"} — $${Number(t.price || 0).toFixed(6)} | 24h: ${Number(t.price24hChangePercent ?? t.price_change_24h ?? 0).toFixed(2)}% | Vol: $${t.volume24hUSD ? (Number(t.volume24hUSD) / 1e6).toFixed(2) + "M" : "N/A"} | ${t.address || t.mint || ""}`
        );
        return `🔥 Top ${tokens.length} Trending Solana Tokens via Birdeye (${interval}, sorted by ${sortBy} ${sortType}):\n\n${tokens.join("\n")}`;
      }

      case "get_token_holders": {
        const rpcUrl = process.env.HELIUS_RPC_URL;
        if (!rpcUrl) return "Helius RPC not configured.";
        const limit = Math.min(args.limit || 10, 20);
        const r = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getTokenLargestAccounts",
            params: [args.token_address, { commitment: "finalized" }],
          }),
          signal: AbortSignal.timeout(12000),
        });
        const d = await r.json();
        if (d.error) return `RPC error: ${d.error.message}`;
        const accounts = (d.result?.value || []).slice(0, limit);
        if (!accounts.length) return "No holder data found for this token.";
        const lines = accounts.map((a: any, i: number) =>
          `${i + 1}. ${a.address?.slice(0, 8)}...${a.address?.slice(-4)} — ${(Number(a.uiAmount) || 0).toLocaleString()} tokens`
        );
        return `👥 Top ${limit} Holders for ${args.token_address.slice(0, 8)}...:\n\n${lines.join("\n")}`;
      }

      case "scan_wallet_portfolio": {
        const birdeyeKey = process.env.BIRDEYE_API_KEY;
        if (!birdeyeKey) return "Birdeye API key not configured.";
        const r = await fetch(
          `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${args.wallet_address}`,
          { headers: { "X-API-KEY": birdeyeKey, "x-chain": "solana" }, signal: AbortSignal.timeout(15000) }
        );
        const d = await r.json();
        if (!d.data?.items) return "Could not fetch wallet portfolio.";
        const items: any[] = d.data.items
          .filter((i: any) => i.valueUsd > 0.01)
          .sort((a: any, b: any) => b.valueUsd - a.valueUsd)
          .slice(0, 15);
        const totalUsd = items.reduce((s: number, i: any) => s + (i.valueUsd || 0), 0);
        const lines = items.map((i: any) =>
          `• ${i.symbol || i.address?.slice(0, 6)} — $${i.valueUsd?.toFixed(2)} (${i.uiAmount?.toFixed(4)} tokens)`
        );
        return `💼 Portfolio for ${args.wallet_address.slice(0, 8)}...\nTotal Value: $${totalUsd.toFixed(2)}\n\n${lines.join("\n")}`;
      }

      case "get_crypto_news": {
        const exaKey = process.env.EXA_API_KEY;
        if (!exaKey) return "News search is not configured. Trending tokens still work through Birdeye with BIRDEYE_API_KEY.";
        const q = `${args.query || "solana crypto"} latest news`;
        const limit = Math.min(args.limit || 5, 10);
        const r = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": exaKey },
          body: JSON.stringify({ query: q, numResults: limit, useAutoprompt: true }),
          signal: AbortSignal.timeout(12000),
        });
        const d = await r.json();
        if (!d.results) return "Could not fetch news.";
        const articles = (d.results || []).slice(0, limit).map((a: any, i: number) =>
          `${i + 1}. **${a.title || "Untitled"}**\n   ${a.url || ""}\n   ${a.snippet?.slice(0, 160) || ""}...`
        );
        return `📰 Latest "${args.query || "Solana"}" News:\n\n${articles.join("\n\n")}`;
      }

      case "generate_meme_image": {
        const falKey = process.env.FAL_API_KEY;
        if (!falKey) return "FAL API key not configured.";
        const styleMap: Record<string, string> = {
          "cartoon": "cartoon illustration, vibrant colors, fun style",
          "pixel-art": "pixel art, 16-bit retro game style",
          "logo": "clean vector logo, minimal design, professional",
          "realistic": "photorealistic, detailed, cinematic lighting",
          "anime": "anime style, manga illustration, dynamic",
        };
        const style = styleMap[args.style || "cartoon"] || styleMap["cartoon"];
        const fullPrompt = `${args.prompt}, ${style}, high quality, no text`;
        const r = await fetch("https://fal.run/fal-ai/fast-sdxl", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Key ${falKey}` },
          body: JSON.stringify({ prompt: fullPrompt, image_size: "square_hd", num_inference_steps: 25, num_images: 1 }),
          signal: AbortSignal.timeout(45000),
        });
        const d = await r.json();
        if (d.images?.[0]?.url) {
          return `🎨 Generated image!\nPrompt: ${args.prompt}\nStyle: ${args.style || "cartoon"}\nURL: ${d.images[0].url}`;
        }
        return `Image generation failed: ${d.detail || d.error || "Unknown error"}`;
      }

      case "get_market_movers": {
        const birdeyeKey = process.env.BIRDEYE_API_KEY;
        if (!birdeyeKey) return "Birdeye API key not configured.";
        const direction = args.direction === "losers" ? "asc" : "desc";
        const label = args.direction === "losers" ? "📉 Top Losers" : "📈 Top Gainers";
        const limit = Math.min(args.limit || 8, 15);
        const r = await fetch(
          `https://public-api.birdeye.so/defi/tokenlist?sort_by=priceChange24hPercent&sort_type=${direction}&offset=0&limit=${limit}&chain=solana`,
          { headers: { "X-API-KEY": birdeyeKey, "x-chain": "solana" }, signal: AbortSignal.timeout(12000) }
        );
        const d = await r.json();
        if (!d.data?.tokens) return "Could not fetch market movers.";
        const tokens = d.data.tokens.slice(0, limit).map((t: any, i: number) =>
          `${i + 1}. ${t.symbol || "?"} — $${t.price?.toFixed(6) || "N/A"} | ${t.priceChange24hPercent?.toFixed(2) || "N/A"}% | MCap: $${t.mc ? (t.mc / 1e6).toFixed(2) + "M" : "N/A"}`
        );
        return `${label} (24h):\n\n${tokens.join("\n")}`;
      }

      case "dflow_swap_quote": {
        const DFLOW_QUOTE = (process.env.DFLOW_QUOTE_API_URL || "https://d.quote-api.dflow.net").replace(/\/$/, "");
        const apiKey = process.env.DFLOW_API_KEY;
        const rawAmount = Math.round((args.amount || 0) * Math.pow(10, args.input_decimals || 9));
        if (!rawAmount || rawAmount <= 0) return "Invalid amount — must be greater than zero.";
        const qs = new URLSearchParams({
          inputMint: args.input_mint,
          outputMint: args.output_mint,
          amount: String(rawAmount),
          slippageBps: "auto",
        });
        const r = await fetch(`${DFLOW_QUOTE}/intent?${qs}`, {
          headers: apiKey ? { "x-api-key": apiKey } : {},
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) {
          const err = await r.text().catch(() => "");
          return `DFlow quote failed (${r.status}): ${err || "No route found for this pair."}`;
        }
        const q = await r.json();
        const outDecimals = args.input_decimals === 9 ? 6 : 9;
        const outAmount = (Number(q.outAmount || 0) / Math.pow(10, outDecimals)).toFixed(6);
        const minOut = (Number(q.minOutAmount || 0) / Math.pow(10, outDecimals)).toFixed(6);
        return [
          `✅ DFlow Intent Quote`,
          `In:  ${args.amount} (${args.input_mint.slice(0,8)}…)`,
          `Out: ~${outAmount} (${args.output_mint.slice(0,8)}…)`,
          `Min received: ${minOut}`,
          `Slippage: ${q.slippageBps} bps`,
          `Price impact: ${Number(q.priceImpactPct || 0).toFixed(3)}%`,
          `Fee budget: ${(Number(q.feeBudget || 0) / 1e9).toFixed(6)} SOL`,
          `Note: To execute this swap, use the DFlow Swap tab in the terminal.`,
        ].join("\n");
      }

      case "dflow_priority_fees": {
        const DFLOW_QUOTE = (process.env.DFLOW_QUOTE_API_URL || "https://d.quote-api.dflow.net").replace(/\/$/, "");
        const apiKey = process.env.DFLOW_API_KEY;
        const r = await fetch(`${DFLOW_QUOTE}/priority-fees`, {
          headers: apiKey ? { "x-api-key": apiKey } : {},
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return `DFlow priority fees unavailable (${r.status}).`;
        const d = await r.json();
        return [
          `⚡ DFlow Priority Fees (micro-lamports/CU):`,
          `Medium:    ${(d.mediumMicroLamports || 0).toLocaleString()}`,
          `High:      ${(d.highMicroLamports || 0).toLocaleString()}`,
          `Very High: ${(d.veryHighMicroLamports || 0).toLocaleString()}`,
          `Tip: Use "high" for normal transactions, "very high" for time-sensitive swaps.`,
        ].join("\n");
      }

      case "dflow_prediction_markets": {
        const PRED_BASE = (process.env.DFLOW_MARKETS_API_URL || "https://d.prediction-markets-api.dflow.net").replace(/\/$/, "");
        const apiKey = process.env.DFLOW_API_KEY;
        const limit = Math.min(args.limit || 6, 12);
        const qs = new URLSearchParams({ limit: String(limit), status: "active", sort: "volume24h", order: "desc" });
        if (args.query) qs.set("q", args.query);
        const endpoint = args.query ? `/api/v1/search?${new URLSearchParams({ q: args.query, limit: String(limit), status: "active", withNestedMarkets: "true" })}` : `/api/v1/markets?${qs}`;
        const r = await fetch(`${PRED_BASE}${endpoint}`, {
          headers: apiKey ? { "x-api-key": apiKey } : {},
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return `DFlow markets unavailable (${r.status}).`;
        const d = await r.json();
        let markets: any[] = d.markets || d.data || [];
        if (args.query && d.events) {
          markets = (d.events || []).flatMap((e: any) => e.markets || []).slice(0, limit);
        }
        if (!markets.length) return "No active prediction markets found.";
        const lines = markets.slice(0, limit).map((m: any, i: number) => {
          const yesAsk = m.yesAsk ? `${Math.round(Number(m.yesAsk) * 100)}¢` : "n/a";
          const noAsk = m.noAsk ? `${Math.round(Number(m.noAsk) * 100)}¢` : "n/a";
          const vol = m.volume24hFp || m.volumeFp || m.volume || 0;
          const volStr = vol ? `$${(Number(vol) / 1e6).toFixed(2)}M` : "n/a";
          return `${i + 1}. ${m.title || m.ticker}\n   YES: ${yesAsk} | NO: ${noAsk} | Vol 24h: ${volStr} | ${m.ticker}`;
        });
        return `🎯 DFlow Prediction Markets${args.query ? ` — "${args.query}"` : " (top by volume)"}:\n\n${lines.join("\n\n")}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Tool error: ${err?.message || String(err)}`;
  }
}

router.post("/token-analysis", aiChatLimiter, async (req: Request, res: Response) => {
  try {
    const address = String(req.body?.address || "").trim();
    const model = typeof req.body?.model === "string" && req.body.model.trim()
      ? req.body.model.trim()
      : DEFAULT_AI_MODEL;
    const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim().slice(0, 24) : undefined;
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : undefined;
    const question = typeof req.body?.question === "string" ? req.body.question.trim().slice(0, 800) : "";

    if (!TOKEN_ADDRESS_PATTERN.test(address)) {
      return res.status(400).json({ success: false, error: "Valid Solana token mint address required" });
    }

    assertProviderConfigured(model);
    const snapshot = await buildClawdTokenSnapshot(address, { symbol, name });
    const sourceStatus = snapshot.sources.map((source) => ({
      label: source.label,
      available: source.available,
      error: source.available ? undefined : source.error,
    }));

    const systemPrompt = [
      "You are Clawd, a fast Solana token analyst embedded in a wallet-confirmed trading popout.",
      "Use only the supplied live Birdeye snapshot and be explicit about missing data.",
      "Do not give guarantees or financial advice. Do not claim you can sign or execute a trade.",
      "Keep the output in concise markdown with sections: Read, Bull Case, Risk Flags, Trade Setup, Next Checks.",
      "The Trade Setup section may discuss sizing, slippage, liquidity, and invalidation, but every trade requires user wallet confirmation.",
    ].join("\n");

    const userPrompt = [
      `Analyze this Solana token now: ${address}`,
      `Token hint: ${snapshot.summary.symbol} / ${snapshot.summary.name}`,
      question ? `User follow-up: ${question}` : "",
      "Live snapshot JSON:",
      JSON.stringify({ summary: snapshot.summary, sourceStatus }, null, 2),
    ].filter(Boolean).join("\n\n");

    const client = getClientForModel(model);
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 900,
      ...(getModelProvider(model) === "deepseek" ? { thinking: { type: "enabled" }, reasoning_effort: "medium" } : {}),
    } as any);

    const content = completion.choices?.[0]?.message?.content;
    const analysis = typeof content === "string" ? content : JSON.stringify(content ?? "");
    const usage = completion.usage as any;

    trackUsageFromRequest(req, {
      walletAddress: req.body?.walletAddress,
      eventType: "token_analysis",
      productArea: "dex",
      model,
      route: "/api/deepseek/token-analysis",
      tokenMint: address,
      units: 1,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens ?? estimateTokensFromText(systemPrompt, userPrompt, analysis),
      metadata: {
        address,
        symbol: snapshot.summary.symbol,
        hasQuestion: Boolean(question),
        sources: sourceStatus,
      },
    });

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      model,
      analysis,
      snapshot,
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    const status = message.includes("API_KEY is not configured") ? 503 : 500;
    res.status(status).json({ success: false, error: message });
  }
});

// ─── POST /api/deepseek/chat  (streaming SSE) ─────────────────────────────────
router.post("/chat", aiChatLimiter, async (req: Request, res: Response) => {
  const {
    messages: clientMessages = [],
    sessionId: clientSessionId,
    walletAddress,
    model = "deepseek-v4-pro",
    thinkingEnabled = true,
    useTools = true,
    reasoningEffort = "high",
  } = req.body;

  const sessionId = clientSessionId || uuidv4();
  const peerId = walletAddress || `anon-${sessionId.slice(0, 8)}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── 1. Upsert session in DB ──────────────────────────────────────────────
    await db.insert(deepseekSessions).values({
      sessionId,
      walletAddress: walletAddress || null,
      model,
      thinkingEnabled,
      messageCount: 0,
      totalTokens: 0,
      cacheHitTokens: 0,
    }).onConflictDoNothing();

    // ── 2. Save user messages to Honcho (fire-and-forget) ─────────────────
    const userMsgs = clientMessages.filter((m: any) => m.role === "user").slice(-3);
    if (userMsgs.length) {
      honchoAddMessages(sessionId, peerId, userMsgs).catch(() => {});
    }

    // ── 3. Get Honcho memory insight for personalization ───────────────────
    let honchoContext = "";
    let pastedInputContext = "";
    const lastUserMsg = clientMessages.filter((m: any) => m.role === "user").slice(-1)[0];
    if (lastUserMsg?.content && walletAddress) {
      const insight = await honchoInsight(peerId, `What are this user's Solana/crypto interests and preferences?`);
      if (insight) honchoContext = `\n[User memory from Honcho]: ${insight}`;
    }
    if (lastUserMsg?.content) {
      const resolvedInput = await resolvePastedSolanaContextDetails(String(lastUserMsg.content));
      pastedInputContext = resolvedInput.context;
      if (pastedInputContext) {
        send("tool_call", {
          id: "helius-pasted-input",
          name: "helius_pasted_input_context",
          args: { input: String(lastUserMsg.content).slice(0, 500) },
        });
        send("tool_result", {
          id: "helius-pasted-input",
          name: "helius_pasted_input_context",
          result: pastedInputContext.trim(),
        });
      }
      if (resolvedInput.directAnswer) {
        send("text", { content: resolvedInput.directAnswer });

        const userContent = String(lastUserMsg.content);
        await db.insert(deepseekMessages).values([
          { sessionId, role: "user", content: userContent },
          {
            sessionId,
            role: "assistant",
            content: resolvedInput.directAnswer,
            promptTokens: 0,
            completionTokens: 0,
            cacheHitTokens: 0,
          },
        ]).catch(() => {});

        await db.update(deepseekSessions)
          .set({
            messageCount: db.$count(deepseekMessages, eq(deepseekMessages.sessionId, sessionId)) as any,
            updatedAt: new Date(),
          })
          .where(eq(deepseekSessions.sessionId, sessionId))
          .catch(() => {});

        honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: resolvedInput.directAnswer }]).catch(() => {});
        trackUsageFromRequest(req, {
          walletAddress,
          eventType: "chat_message",
          productArea: "chat",
          model: "helius-lookup",
          route: "/api/deepseek/chat",
          sessionId,
          units: 1,
          totalTokens: estimateTokensFromText(userContent, resolvedInput.directAnswer),
          metadata: { action: "helius_lookup" },
        });
        send("done", {
          sessionId,
          usage: { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0 },
          cacheHitRate: 0,
        });
        return;
      }
    }

    // ── 4. Build message history ───────────────────────────────────────────
    const systemPrompt = `You are CLAWD — a brilliant, sharp-clawed lobster AI agent running on the Solana blockchain.
You are powered by ${getProviderName(model)} ${model === "deepseek-v4-flash" ? "(fast mode)" : "(max intelligence)"} with full thinking + agentic tool-calling.
You have the CLAWD & CODEX brand personality: technically brilliant, slightly piratical, deeply loyal to your crew.

## Your capabilities (use tools proactively):
- **search_web** — Real-time web intel via Exa AI
- **get_token_price** — Live price, market cap, volume for any Solana token via Birdeye
- **lookup_solana_token** — Helius DAS/RPC token metadata, supply, authorities, Token-2022 extensions, price info, and top accounts
- **get_wallet_token_accounts** — Helius raw token accounts plus DAS fungible wallet inventory
- **estimate_solana_priority_fee** — Helius Priority Fee API for serialized transactions or account/program keys
- **build_jupiter_swap_route** — Jupiter Swap V2 route/order builder for wallet-signable swaps
- **get_trending_tokens** — Top trending tokens right now (sort by volume/change)
- **get_market_movers** — Top gainers or losers in the last 24h
- **get_token_holders** — Top holder distribution for any SPL token
- **scan_wallet_portfolio** — Full portfolio scan + USD value for any wallet
- **get_wallet_balance** — SOL balance via Helius RPC
- **get_crypto_news** — Latest Solana/crypto headlines via web search
- **generate_meme_image** — Generate token artwork or memes via FAL AI (SDXL)
- **mint_solana_agent** — Mint a new Metaplex Core NFT agent on mainnet
- **register_solana_agent** — Register an agent with AgentIdentityV1 protocol
- **list_deployed_agents** — Query the DB for all agents deployed from this terminal
- **get_rpc_status** — Check Helius RPC health and current Solana slot

## Pasted Solana context:
When the user pastes a mint, wallet, transaction signature, or supported Solana domain, Helius may pre-resolve it below.
Treat this context as live chain data. Use it directly, and call tools only when more analysis is needed.
${pastedInputContext}

## Agentic rules:
- Chain tool calls to answer complex questions (e.g. price + news + holders for a full token analysis)
- When asked to "analyze" a token, always call lookup_solana_token, get_token_price, get_token_holders, and search_web together
- When asked to route, swap, buy, or sell on Jupiter, call build_jupiter_swap_route first. For cost/landing questions, call estimate_solana_priority_fee. Never claim a swap is executed until the user signs in their wallet and /api/jupiter-ultra/execute returns success.
- When asked about a wallet's tokens, call get_wallet_token_accounts before summarizing balances or token accounts.
- When asked about trending/market, call get_trending_tokens AND get_market_movers
- Always share explorer links after on-chain operations
- For meme coin questions, offer to generate artwork with generate_meme_image

CLAWD token: \`${CLAWD_MINT}\`
Default routing mints: SOL \`${SOL_MINT}\`, USDC \`${USDC_MINT}\`.
${honchoContext}

Format responses in clean markdown. Be sharp, insightful, and a little piratical. Arr.`;

    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...clientMessages.map((m: any) => {
        // Forward reasoning_content for tool-call turns
        if (m.role === "assistant" && m.reasoning_content) {
          return { role: "assistant", content: m.content, reasoning_content: m.reasoning_content, tool_calls: m.tool_calls };
        }
        if (m.role === "tool") {
          return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
        }
        return { role: m.role, content: m.content };
      }),
    ] as any;

    // ── 5. Agentic tool-call loop ──────────────────────────────────────────
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0 };
    let loopCount = 0;
    const MAX_LOOPS = 8;

    if (getModelProvider(model) === "openai") {
      assertProviderConfigured(model);
      const client = getClientForModel(model);
      let responseInput = toResponseInput(clientMessages, systemPrompt);
      let finalContent = "";

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        const response: any = await client.responses.create({
          model,
          input: responseInput,
          ...(useTools && { tools: RESPONSE_TOOLS, tool_choice: "auto" }),
          reasoning: { effort: thinkingEnabled ? reasoningEffort : "low" },
        } as any);

        const usage = response.usage || {};
        totalUsage.prompt_tokens += usage.input_tokens || 0;
        totalUsage.completion_tokens += usage.output_tokens || 0;
        totalUsage.prompt_cache_hit_tokens += usage.input_tokens_details?.cached_tokens || 0;

        const calls = getResponseFunctionCalls(response);
        if (!calls.length) {
          finalContent = getResponseText(response);
          if (finalContent) send("text", { content: finalContent });
          break;
        }

        responseInput = responseInput.concat(response.output || []);
        for (const call of calls) {
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(call.arguments || "{}");
          } catch {}

          send("tool_call", { id: call.call_id, name: call.name, args: parsedArgs });
          const result = await executeTradingTool(call.name, parsedArgs);
          send("tool_result", { id: call.call_id, name: call.name, result });

          responseInput.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: result,
          });

          await db.insert(deepseekMessages).values({
            sessionId,
            role: "tool",
            content: result,
            toolCallId: call.call_id,
            toolName: call.name,
          }).catch(() => {});
        }
      }

      const userContent = (clientMessages.filter((m: any) => m.role === "user").slice(-1)[0] as any)?.content || "";

      await db.insert(deepseekMessages).values([
        { sessionId, role: "user", content: userContent },
        {
          sessionId,
          role: "assistant",
          content: finalContent,
          reasoningContent: null,
          promptTokens: totalUsage.prompt_tokens,
          completionTokens: totalUsage.completion_tokens,
          cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
        },
      ]).catch(() => {});

      await db.update(deepseekSessions)
        .set({
          messageCount: db.$count(deepseekMessages, eq(deepseekMessages.sessionId, sessionId)) as any,
          totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens,
          cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
          updatedAt: new Date(),
        })
        .where(eq(deepseekSessions.sessionId, sessionId))
        .catch(() => {});

      if (finalContent) {
        honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: finalContent }]).catch(() => {});
      }

      send("done", {
        sessionId,
        usage: totalUsage,
        cacheHitRate: totalUsage.prompt_tokens > 0
          ? Math.round((totalUsage.prompt_cache_hit_tokens / totalUsage.prompt_tokens) * 100)
          : 0,
      });
      trackUsageFromRequest(req, {
        walletAddress,
        eventType: "chat_message",
        productArea: "chat",
        model,
        route: "/api/deepseek/chat",
        sessionId,
        units: 1,
        promptTokens: totalUsage.prompt_tokens,
        completionTokens: totalUsage.completion_tokens,
        totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens,
        metadata: {
          provider: "openai",
          api: "responses",
          thinkingEnabled,
          useTools,
          reasoningEffort,
          cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
        },
      });
      return;
    }

    if (getModelProvider(model) === "minimax") {
      assertProviderConfigured(model);
      let finalContent = "";
      let finalReasoning = "";

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        const completion = await createMiniMaxChatCompletion({
          model,
          messages: msgs,
          tools: TOOLS,
          useTools,
        });

        const usage = completion.usage || {};
        totalUsage.prompt_tokens += usage.prompt_tokens || usage.input_tokens || 0;
        totalUsage.completion_tokens += usage.completion_tokens || usage.output_tokens || 0;
        totalUsage.prompt_cache_hit_tokens += usage.cache_read_input_tokens || 0;

        const choice = completion.choices?.[0] || {};
        const message = choice.message || {};
        const content = extractMiniMaxText(message);
        const reasoning = message.reasoning_content || "";
        const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

        if (reasoning) {
          finalReasoning += reasoning;
          send("thinking", { content: reasoning });
        }
        if (content) {
          finalContent += content;
          send("text", { content });
        }

        msgs.push({
          role: "assistant",
          content: content || null,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        } as any);

        if (choice.finish_reason !== "tool_calls" || toolCalls.length === 0) break;

        for (const tc of toolCalls) {
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(tc.function?.arguments || "{}");
          } catch {}

          const toolCallId = tc.id || `minimax-tool-${loopCount}-${Math.random().toString(36).slice(2, 8)}`;
          const toolName = tc.function?.name || "";
          send("tool_call", { id: toolCallId, name: toolName, args: parsedArgs });

          const result = await executeTradingTool(toolName, parsedArgs);

          send("tool_result", { id: toolCallId, name: toolName, result });

          msgs.push({ role: "tool", tool_call_id: toolCallId, content: result } as any);

          await db.insert(deepseekMessages).values({
            sessionId,
            role: "tool",
            content: result,
            toolCallId: toolCallId,
            toolName,
          }).catch(() => {});
        }
      }

      const userContent = (clientMessages.filter((m: any) => m.role === "user").slice(-1)[0] as any)?.content || "";

      await db.insert(deepseekMessages).values([
        { sessionId, role: "user", content: userContent },
        {
          sessionId,
          role: "assistant",
          content: finalContent,
          reasoningContent: finalReasoning || null,
          promptTokens: totalUsage.prompt_tokens,
          completionTokens: totalUsage.completion_tokens,
          cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
        },
      ]).catch(() => {});

      await db.update(deepseekSessions)
        .set({
          messageCount: db.$count(deepseekMessages, eq(deepseekMessages.sessionId, sessionId)) as any,
          totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens,
          cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
          updatedAt: new Date(),
        })
        .where(eq(deepseekSessions.sessionId, sessionId))
        .catch(() => {});

      if (finalContent) {
        honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: finalContent }]).catch(() => {});
      }

      send("done", {
        sessionId,
        usage: totalUsage,
        cacheHitRate: totalUsage.prompt_tokens > 0
          ? Math.round((totalUsage.prompt_cache_hit_tokens / totalUsage.prompt_tokens) * 100)
          : 0,
      });
      trackUsageFromRequest(req, {
        walletAddress,
        eventType: "chat_message",
        productArea: "chat",
        model,
        route: "/api/deepseek/chat",
        sessionId,
        units: 1,
        promptTokens: totalUsage.prompt_tokens,
        completionTokens: totalUsage.completion_tokens,
        totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens,
        metadata: {
          provider: "minimax",
          api: "text-chatcompletion-v2",
          thinkingEnabled,
          useTools,
          reasoningEffort,
          cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
        },
      });
      return;
    }

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      assertProviderConfigured(model);
      const provider = getModelProvider(model);
      const client = getClientForModel(model);

      const reqParams: any = {
        model,
        messages: msgs,
        stream: true,
        ...(useTools && { tools: TOOLS, tool_choice: "auto" }),
      };
      if (provider === "deepseek") {
        reqParams.thinking = { type: thinkingEnabled ? "enabled" : "disabled" };
        if (thinkingEnabled) reqParams.reasoning_effort = reasoningEffort;
      } else if (provider === "kimi") {
        reqParams.thinking = { type: thinkingEnabled ? "enabled" : "disabled" };
      }

      const stream = await client.chat.completions.create(reqParams);

      let fullContent = "";
      let fullReasoning = "";
      const toolCalls: any[] = [];
      let finishReason = "";
      let usage: any = null;
      let currentToolCall: any = null;

      for await (const chunk of stream as any) {
        const delta = chunk.choices?.[0]?.delta;
        finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
        if (chunk.usage) usage = chunk.usage;

        if (!delta) continue;

        // Thinking / reasoning chunks
        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content;
          send("thinking", { content: delta.reasoning_content });
        }

        // Text content
        if (delta.content) {
          fullContent += delta.content;
          send("text", { content: delta.content });
        }

        // Tool call chunks (streamed incrementally)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = { id: "", type: "function", function: { name: "", arguments: "" } };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      if (usage) {
        totalUsage.prompt_tokens += usage.prompt_tokens || 0;
        totalUsage.completion_tokens += usage.completion_tokens || 0;
        totalUsage.prompt_cache_hit_tokens += usage.prompt_cache_hit_tokens || 0;
      }

      // Build assistant message to append (with reasoning_content for next turn)
      const assistantMsg: any = {
        role: "assistant",
        content: fullContent || null,
        ...(fullReasoning ? { reasoning_content: fullReasoning } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      };
      msgs.push(assistantMsg);

      // If no tool calls or done, break
      if (finishReason !== "tool_calls" || toolCalls.length === 0) break;

      // ── Execute each tool call ──────────────────────────────────────────
      for (const tc of toolCalls) {
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {}

        send("tool_call", { id: tc.id, name: tc.function.name, args: parsedArgs });

        const result = await executeTradingTool(tc.function.name, parsedArgs);

        send("tool_result", { id: tc.id, name: tc.function.name, result });

        msgs.push({ role: "tool", tool_call_id: tc.id, content: result });

        // Save tool usage to DB
        await db.insert(deepseekMessages).values({
          sessionId,
          role: "tool",
          content: result,
          toolCallId: tc.id,
          toolName: tc.function.name,
        }).catch(() => {});
      }
    }

    // ── 6. Persist to DB ────────────────────────────────────────────────────
    const userContent = (clientMessages.filter((m: any) => m.role === "user").slice(-1)[0] as any)?.content || "";
    const assistantContent = msgs.filter((m: any) => m.role === "assistant").slice(-1)[0] as any;

    await db.insert(deepseekMessages).values([
      { sessionId, role: "user", content: userContent },
      {
        sessionId,
        role: "assistant",
        content: assistantContent?.content || "",
        reasoningContent: assistantContent?.reasoning_content || null,
        promptTokens: totalUsage.prompt_tokens,
        completionTokens: totalUsage.completion_tokens,
        cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
      },
    ]).catch(() => {});

    await db.update(deepseekSessions)
      .set({
        messageCount: db.$count(deepseekMessages, eq(deepseekMessages.sessionId, sessionId)) as any,
        totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens,
        cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
        updatedAt: new Date(),
      })
      .where(eq(deepseekSessions.sessionId, sessionId))
      .catch(() => {});

    // ── 7. Save assistant reply to Honcho ───────────────────────────────────
    if (assistantContent?.content) {
      honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: assistantContent.content }]).catch(() => {});
    }

    send("done", {
      sessionId,
      usage: totalUsage,
      cacheHitRate: totalUsage.prompt_tokens > 0
        ? Math.round((totalUsage.prompt_cache_hit_tokens / totalUsage.prompt_tokens) * 100)
        : 0,
    });
    trackUsageFromRequest(req, {
      walletAddress,
      eventType: "chat_message",
      productArea: "chat",
      model,
      route: "/api/deepseek/chat",
      sessionId,
      units: 1,
      promptTokens: totalUsage.prompt_tokens,
      completionTokens: totalUsage.completion_tokens,
      totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens,
      metadata: {
        thinkingEnabled,
        useTools,
        reasoningEffort,
        cacheHitTokens: totalUsage.prompt_cache_hit_tokens,
      },
    });

  } catch (err: any) {
    console.error("DeepSeek chat error:", err);
    send("error", { error: err?.message || "Unexpected error" });
  } finally {
    res.end();
  }
});

// ─── GET /api/deepseek/health ─────────────────────────────────────────────────
router.get("/health", async (_req, res) => {
  try {
    const honcho = await honchoFetch(`/v1/workspaces/${HONCHO_WS_ID}`);
    res.json({
      success: true,
      defaultModel: DEFAULT_AI_MODEL,
      deepseekBaseUrl: DEEPSEEK_BASE_URL,
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      deepseekConfigured: !!process.env.DEEPSEEK_API_KEY,
      moonshotConfigured: !!process.env.MOONSHOT_API_KEY,
      minimaxConfigured: !!process.env.MINIMAX_API_KEY,
      heliusConfigured: !!getHeliusRpcUrl(),
      heliusOptimization: getHeliusTransactionOptimizationConfig(),
      jupiterConfigured: true,
      honchoConfigured: !!process.env.HONCHO_API_KEY,
      honchoConnected: !!honcho,
      workspaceId: HONCHO_WS_ID,
      models: [
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "gpt-5",
        "kimi-k2.6",
        "MiniMax-M2.7",
        "MiniMax-M2.7-highspeed",
        "MiniMax-M2.5",
        "MiniMax-M2.5-highspeed",
      ],
      deprecatedAliases: {
        "deepseek-chat": "deprecated by DeepSeek on 2026-07-24 15:59 UTC; maps to deepseek-v4-flash non-thinking mode",
        "deepseek-reasoner": "deprecated by DeepSeek on 2026-07-24 15:59 UTC; maps to deepseek-v4-flash thinking mode",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/deepseek/agents ─────────────────────────────────────────────────
router.get("/agents", async (_req, res) => {
  try {
    const agents = await db.select().from(agentDeployments).orderBy(desc(agentDeployments.createdAt)).limit(50);
    res.json({ success: true, agents, total: agents.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/deepseek/fim  (Fill-In-the-Middle Completion - Beta) ───────────
// DeepSeek FIM endpoint at https://api.deepseek.com/beta/completions
// Supports: deepseek-v4-pro model, prompt, echo, logprobs, max_tokens, stop,
// stream, suffix, temperature, top_p
router.post("/fim", async (req: Request, res: Response) => {
  const {
    model = "deepseek-v4-pro",
    prompt,
    suffix,
    max_tokens = 1024,
    temperature = 0.7,
    top_p = 1,
    stop,
    echo = false,
    logprobs,
    stream = false,
  } = req.body;

  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(400).json({ error: "DEEPSEEK_API_KEY not configured" });
  }

  // DeepSeek FIM endpoint is separate from the standard completions endpoint
  const FIM_BASE = "https://api.deepseek.com/beta";

  if (stream) {
    // SSE streaming response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      const fimResp = await fetch(`${FIM_BASE}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          suffix,
          max_tokens,
          temperature,
          top_p,
          stop: stop || undefined,
          echo,
          logprobs,
          stream: true,
        }),
      });

      if (!fimResp.ok) {
        const errText = await fimResp.text();
        res.write(`event: error\ndata: ${JSON.stringify({ error: errText })}\n\n`);
        res.end();
        return;
      }

      const reader = fimResp.body?.getReader();
      if (!reader) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "No response body" })}\n\n`);
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              res.write(`event: done\ndata: ${JSON.stringify({ finish_reason: "stop" })}\n\n`);
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.text || "";
              if (text) {
                res.write(`event: text\ndata: ${JSON.stringify({ content: text })}\n\n`);
              }
              if (parsed.usage) {
                res.write(`event: done\ndata: ${JSON.stringify({ finish_reason: "stop", usage: parsed.usage })}\n\n`);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err?.message || "FIM stream failed" })}\n\n`);
    } finally {
      res.end();
    }
    return;
  }

  // Non-streaming response
  try {
    const fimResp = await fetch(`${FIM_BASE}/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        suffix,
        max_tokens,
        temperature,
        top_p,
        stop: stop || undefined,
        echo,
        logprobs,
        stream: false,
      }),
    });

    if (!fimResp.ok) {
      const errText = await fimResp.text();
      return res.status(fimResp.status).json({ error: errText });
    }

    const data = await fimResp.json();
    return res.json({
      success: true,
      choices: data.choices,
      usage: data.usage,
      model: data.model,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "FIM request failed" });
  }
});

// ─── GET /api/deepseek/sessions/:sessionId ────────────────────────────────────
router.get("/sessions/:sessionId", async (req, res) => {
  try {
    const [session] = await db.select().from(deepseekSessions).where(eq(deepseekSessions.sessionId, req.params.sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    const messages = await db.select().from(deepseekMessages)
      .where(eq(deepseekMessages.sessionId, req.params.sessionId))
      .orderBy(deepseekMessages.createdAt)
      .limit(100);
    return res.json({ success: true, session, messages });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
