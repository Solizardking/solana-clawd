import { FormEvent, useEffect, useMemo, useState } from "react";

type RouteId = "auto" | "solana" | "birdeye" | "perps" | "stocks" | "x402";
type IntentKind = "wallet" | "token" | "transaction" | "stock" | "perps" | "stream" | "x402" | "market";
type MessageRole = "user" | "assistant" | "system";
type ConnectionStatus = "idle" | "checking" | "connected" | "offline" | "error";

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
  reason: string;
  provider: "solana-clawd" | "birdeye" | "massive" | "solana-rpc" | "x402";
  executable: boolean;
};

type RequestPayload = {
  label: string;
  method: "GET" | "POST" | "WS" | "MCP";
  endpoint: string;
  headers?: Record<string, string>;
  body?: unknown;
};

type IntentPlan = {
  id: string;
  kind: IntentKind;
  title: string;
  summary: string;
  target: string;
  confidence: number;
  route: RouteId;
  toolCalls: ToolCall[];
  payloads: RequestPayload[];
  resultRows: ResultRow[];
  riskNotes: string[];
};

type ResultRow = {
  metric: string;
  value: string;
  source: string;
  tone?: "good" | "warn" | "bad" | "neutral";
};

type ChatMessage = {
  id: string;
  role: MessageRole;
  text: string;
  plan?: IntentPlan;
  rawResult?: string;
  at: string;
};

type StudioContext = {
  chain: string;
  wallet: string;
  token: string;
  pair: string;
  transaction: string;
  stock: string;
  perpWallet: string;
  timeframe: string;
};

type StudioSettings = {
  mcpEndpoint: string;
  mcpApiKey: string;
  birdeyeApiKey: string;
  massiveReady: boolean;
  liveMcp: boolean;
  x402Mode: boolean;
};

type McpTool = {
  name: string;
  description?: string;
};

type McpSession = {
  sessionId: string;
  tools: McpTool[];
};

const STORAGE_KEY = "clawd-mcp-studio-v1";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const defaultContext: StudioContext = {
  chain: "solana",
  wallet: "5Q544fKrFoe6tsEbLhJ2fJfSLavYWhfXQ5QfVf8h2y2x",
  token: SOL_MINT,
  pair: "",
  transaction: "",
  stock: "AAPL",
  perpWallet: "0x9d9f4f02d3a06f82d85f1c2f08f71fd98a68c709",
  timeframe: "1m",
};

const defaultSettings: StudioSettings = {
  mcpEndpoint: "http://127.0.0.1:3001/mcp",
  mcpApiKey: "",
  birdeyeApiKey: "",
  massiveReady: true,
  liveMcp: false,
  x402Mode: false,
};

const routes: Array<{ id: RouteId; label: string; state: string; count: number }> = [
  { id: "auto", label: "Auto", state: "intent router", count: 6 },
  { id: "solana", label: "Solana", state: "native RPC", count: 12 },
  { id: "birdeye", label: "Birdeye", state: "tokens + streams", count: 9 },
  { id: "perps", label: "Perps", state: "wallet risk", count: 3 },
  { id: "stocks", label: "Stocks", state: "Massive", count: 8 },
  { id: "x402", label: "x402", state: "paid data", count: 5 },
];

const quickPrompts = [
  "What happened in this wallet over the last hour?",
  "Track SOL transfers above $10k and show live payloads",
  "Research AAPL with previous close, news, and 30 day bars",
  "Show perps exposure and open positions for this wallet",
  "Build an x402 token overview request for SOL",
  "Explain this transaction and related token flow",
];

const streamTape = [
  { label: "SOL", value: "$145.20", delta: "+2.8%", tone: "good" },
  { label: "JUP", value: "$0.91", delta: "-0.7%", tone: "warn" },
  { label: "AAPL", value: "$213.40", delta: "+0.4%", tone: "good" },
  { label: "BTC perp", value: "7.2x", delta: "bearish", tone: "bad" },
  { label: "x402", value: "ready", delta: "USDC", tone: "neutral" },
];

function shortId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function compact(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function asCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function extractSolanaAddress(text: string): string | null {
  const match = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
  return match?.[0] ?? null;
}

function extractSignature(text: string): string | null {
  const match = text.match(/\b[1-9A-HJ-NP-Za-km-z]{64,96}\b/);
  return match?.[0] ?? null;
}

function extractEvmAddress(text: string): string | null {
  const match = text.match(/\b0x[a-fA-F0-9]{40}\b/);
  return match?.[0] ?? null;
}

function extractTicker(text: string): string | null {
  const dollar = text.match(/\$([A-Z]{1,6})(?![a-z])/);
  if (dollar) return dollar[1];
  const stockIntent = /\b(stock|stocks|equity|earnings|shares|massive|ticker|previous close|news)\b/i.test(text);
  if (!stockIntent) return null;
  const match = text.match(/\b[A-Z]{1,5}\b/);
  return match?.[0] ?? null;
}

function routeForText(text: string, activeRoute: RouteId): RouteId {
  if (activeRoute !== "auto") return activeRoute;
  if (/\b(stock|stocks|equity|earnings|shares|ticker|AAPL|TSLA|NVDA|MSFT)\b/i.test(text)) return "stocks";
  if (/\b(perp|perps|perpetual|hyperliquid|funding|open positions|leverage|roe|roi)\b/i.test(text)) return "perps";
  if (/\b(x402|pay|paid data|payment required|usdc)\b/i.test(text)) return "x402";
  if (/\b(birdeye|stream|websocket|transfer|token stats|meme|new listing|pair|ohlcv)\b/i.test(text)) return "birdeye";
  return "solana";
}

function kindForText(text: string, route: RouteId): IntentKind {
  if (route === "stocks") return "stock";
  if (route === "perps") return "perps";
  if (route === "x402") return "x402";
  if (/\b(tx|transaction|signature|hash)\b/i.test(text) || extractSignature(text)) return "transaction";
  if (/\b(wallet|address|net worth|portfolio|pnl|transfers)\b/i.test(text)) return "wallet";
  if (/\b(stream|websocket|subscribe|live|watch|transfer|ohlcv|stats|meme|listing)\b/i.test(text)) return "stream";
  if (/\b(token|mint|holders|security|price|pair|market)\b/i.test(text)) return "token";
  return route === "birdeye" ? "stream" : "market";
}

function solanaRpcPayload(kind: IntentKind, context: StudioContext, target: string): RequestPayload {
  const method =
    kind === "transaction" ? "getTransaction" :
    kind === "wallet" ? "getSignaturesForAddress" :
    kind === "token" ? "getTokenLargestAccounts" :
    "getHealth";

  const params =
    method === "getTransaction" ? [target || context.transaction, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }] :
    method === "getSignaturesForAddress" ? [target || context.wallet, { limit: 20 }] :
    method === "getTokenLargestAccounts" ? [target || context.token] :
    [];

  return {
    label: "Solana RPC",
    method: "POST",
    endpoint: "https://api.mainnet-beta.solana.com",
    body: { jsonrpc: "2.0", id: 1, method, params },
  };
}

function birdeyeStreamPayload(kind: IntentKind, context: StudioContext, target: string): RequestPayload {
  if (kind === "wallet") {
    return {
      label: "Birdeye transfer stream",
      method: "WS",
      endpoint: `wss://public-api.birdeye.so/socket/${context.chain}`,
      headers: { "X-API-KEY": "BIRDEYE_API_KEY" },
      body: {
        type: "SUBSCRIBE_TRANSFER",
        data: {
          filters: [
            {
              wallet_addresses: [target || context.wallet],
              flow: "in",
              token_addresses: [context.token],
              value_min: 10_000,
            },
          ],
        },
      },
    };
  }

  if (kind === "transaction") {
    return {
      label: "Birdeye wallet tx stream",
      method: "WS",
      endpoint: `wss://public-api.birdeye.so/socket/${context.chain}`,
      body: { type: "SUBSCRIBE_WALLET_TXS", data: { address: context.wallet } },
    };
  }

  return {
    label: "Birdeye token stats stream",
    method: "WS",
    endpoint: `wss://public-api.birdeye.so/socket/${context.chain}`,
    headers: { "X-API-KEY": "BIRDEYE_API_KEY" },
    body: {
      type: "SUBSCRIBE_TOKEN_STATS",
      data: {
        address: target || context.token,
        select: {
          price: true,
          trade_data: {
            volume: true,
            trade: true,
            price_history: true,
            volume_history: true,
            price_change: true,
            trade_history: true,
            trade_change: true,
            volume_change: true,
            unique_wallet: true,
            intervals: ["30m", "1h", "4h", "24h"],
          },
          fdv: true,
          marketcap: true,
          supply: true,
          last_trade: true,
          liquidity: true,
        },
      },
    },
  };
}

function birdeyePerpsPayload(context: StudioContext, target: string): RequestPayload {
  const wallet = target || context.perpWallet || context.wallet;
  return {
    label: "Birdeye perps wallet overview",
    method: "GET",
    endpoint: `https://public-api.birdeye.so/perps/v1/wallet/overview?wallet=${encodeURIComponent(wallet)}`,
    headers: {
      accept: "application/json",
      "X-API-KEY": "BIRDEYE_API_KEY",
      "x-perp": "hyperliquid",
    },
  };
}

function birdeyePerpsPositionsPayload(context: StudioContext, target: string): RequestPayload {
  const wallet = target || context.perpWallet || context.wallet;
  return {
    label: "Birdeye perps open positions",
    method: "GET",
    endpoint: `https://public-api.birdeye.so/perps/v1/wallet/open_positions?wallet=${encodeURIComponent(wallet)}`,
    headers: {
      accept: "application/json",
      "X-API-KEY": "BIRDEYE_API_KEY",
      "x-perp": "hyperliquid",
    },
  };
}

function x402Payload(context: StudioContext, target: string): RequestPayload {
  return {
    label: "Birdeye x402 token overview",
    method: "GET",
    endpoint: `https://public-api.birdeye.so/x402/defi/token_overview?address=${encodeURIComponent(target || context.token)}`,
    headers: {
      "PAYMENT-SIGNATURE": "signed Solana USDC payment payload",
    },
  };
}

function massivePayload(context: StudioContext, ticker: string): RequestPayload {
  return {
    label: "Massive stock aggregates",
    method: "MCP",
    endpoint: "stock_aggregates",
    body: {
      ticker,
      from: "30 days ago",
      to: "today",
      timespan: "day",
      store_as: `${ticker.toLowerCase()}_daily`,
      apply: "sma(close, 20)",
    },
  };
}

function toolCallsFor(kind: IntentKind, route: RouteId, context: StudioContext, target: string): ToolCall[] {
  if (kind === "stock") {
    const ticker = target || context.stock;
    return [
      { name: "stock_ticker_details", args: { ticker }, reason: "Resolve exchange, market, active state, and issuer metadata.", provider: "massive", executable: true },
      { name: "stock_previous_close", args: { ticker }, reason: "Anchor the current analysis with latest previous close.", provider: "massive", executable: true },
      { name: "stock_ticker_news", args: { ticker, limit: 25 }, reason: "Pull recent news and sentiment insights where the plan includes Massive news data.", provider: "massive", executable: true },
      { name: "stock_aggregates", args: { ticker, store_as: `${ticker.toLowerCase()}_daily`, apply: "sma(close, 20)" }, reason: "Store daily bars for follow-up table queries.", provider: "massive", executable: true },
    ];
  }

  if (kind === "perps" || route === "perps") {
    const wallet = target || context.perpWallet || context.wallet;
    return [
      { name: "birdeye_perps_wallet_overview", args: { wallet, perp: "hyperliquid" }, reason: "Read wallet-level perps equity, PnL, leverage, and directional bias.", provider: "birdeye", executable: false },
      { name: "birdeye_perps_open_positions", args: { wallet, perp: "hyperliquid" }, reason: "List current perps exposure by market.", provider: "birdeye", executable: false },
    ];
  }

  if (kind === "x402" || route === "x402") {
    return [
      { name: "x402_status", args: {}, reason: "Confirm local x402 and p-token settlement readiness.", provider: "solana-clawd", executable: true },
      { name: "birdeye_x402_token_overview", args: { address: target || context.token }, reason: "Fetch paid token overview using Solana USDC pay-per-request.", provider: "x402", executable: false },
    ];
  }

  if (kind === "transaction") {
    const signature = target || context.transaction;
    return [
      { name: "solana_rpc_getTransaction", args: { signature }, reason: "Decode account keys, token balances, logs, and program instructions.", provider: "solana-rpc", executable: false },
      { name: "helius_transactions", args: { address: context.wallet, limit: 10 }, reason: "Use enhanced transaction context when a wallet is present.", provider: "solana-clawd", executable: true },
    ];
  }

  if (kind === "wallet") {
    const wallet = target || context.wallet;
    return [
      { name: "helius_transactions", args: { address: wallet, limit: 25 }, reason: "Read recent enhanced activity for the wallet.", provider: "solana-clawd", executable: true },
      { name: "solana_wallet_tokens", args: { wallet }, reason: "List SPL token accounts using Solana-native RPC.", provider: "solana-clawd", executable: true },
      { name: "birdeye_transfer_stream", args: { wallet, token: context.token, value_min: 10_000 }, reason: "Prepare live transfer monitoring for high-value token movement.", provider: "birdeye", executable: false },
    ];
  }

  return [
    { name: "solana_token_info", args: { mint: target || context.token }, reason: "Resolve token metadata, security, and on-chain state.", provider: "solana-clawd", executable: true },
    { name: "solana_price", args: { token: target || context.token }, reason: "Fetch current price from the configured Solana data path.", provider: "solana-clawd", executable: true },
    { name: "birdeye_token_stats_stream", args: { address: target || context.token, intervals: ["30m", "1h", "4h", "24h"] }, reason: "Prepare real-time token stats stream.", provider: "birdeye", executable: false },
  ];
}

function resultRowsFor(kind: IntentKind, route: RouteId, target: string): ResultRow[] {
  if (kind === "stock") {
    return [
      { metric: "symbol", value: target || "AAPL", source: "Massive", tone: "neutral" },
      { metric: "workflow", value: "details + close + news + bars", source: "MCP", tone: "good" },
      { metric: "table", value: `${(target || "AAPL").toLowerCase()}_daily`, source: "query_data", tone: "neutral" },
    ];
  }
  if (kind === "perps" || route === "perps") {
    return [
      { metric: "exchange", value: "hyperliquid", source: "Birdeye perps", tone: "neutral" },
      { metric: "bias", value: "wallet-level long/short tilt", source: "overview", tone: "warn" },
      { metric: "positions", value: "open_positions route", source: "Birdeye", tone: "good" },
    ];
  }
  if (kind === "x402" || route === "x402") {
    return [
      { metric: "payment", value: "Solana USDC", source: "x402", tone: "good" },
      { metric: "endpoint", value: "/x402/defi/token_overview", source: "Birdeye", tone: "neutral" },
      { metric: "idempotency", value: "payment-identifier", source: "x402", tone: "good" },
    ];
  }
  if (kind === "wallet") {
    return [
      { metric: "wallet", value: compact(target), source: "Solana", tone: "neutral" },
      { metric: "activity", value: "enhanced tx + token accounts", source: "MCP", tone: "good" },
      { metric: "live filter", value: "transfer value >= $10k", source: "Birdeye WS", tone: "warn" },
    ];
  }
  if (kind === "transaction") {
    return [
      { metric: "signature", value: compact(target), source: "Solana RPC", tone: "neutral" },
      { metric: "decode", value: "jsonParsed + balances", source: "RPC", tone: "good" },
      { metric: "chain", value: "Solana native", source: "Studio", tone: "neutral" },
    ];
  }
  return [
    { metric: "token", value: compact(target), source: "Solana", tone: "neutral" },
    { metric: "price", value: "solana_price", source: "MCP", tone: "good" },
    { metric: "stream", value: "TOKEN_STATS_DATA", source: "Birdeye WS", tone: "good" },
  ];
}

function buildPlan(text: string, context: StudioContext, activeRoute: RouteId): IntentPlan {
  const route = routeForText(text, activeRoute);
  const kind = kindForText(text, route);
  const solAddress = extractSolanaAddress(text);
  const evmAddress = extractEvmAddress(text);
  const signature = extractSignature(text);
  const ticker = extractTicker(text);
  const target =
    kind === "stock" ? (ticker ?? context.stock) :
    kind === "transaction" ? (signature ?? context.transaction ?? solAddress ?? "") :
    kind === "perps" ? (evmAddress ?? solAddress ?? context.perpWallet) :
    kind === "wallet" ? (solAddress ?? evmAddress ?? context.wallet) :
    kind === "x402" ? (solAddress ?? context.token) :
    solAddress ?? context.token;
  const toolCalls = toolCallsFor(kind, route, context, target);
  const payloads: RequestPayload[] = [];

  if (route === "stocks" || kind === "stock") payloads.push(massivePayload(context, target));
  if (route === "perps" || kind === "perps") payloads.push(birdeyePerpsPayload(context, target), birdeyePerpsPositionsPayload(context, target));
  if (route === "x402" || kind === "x402") payloads.push(x402Payload(context, target));
  if (route === "birdeye" || kind === "stream" || kind === "token" || kind === "wallet") payloads.push(birdeyeStreamPayload(kind, context, target));
  if (route === "solana" || kind === "wallet" || kind === "token" || kind === "transaction") payloads.push(solanaRpcPayload(kind, context, target));

  const title =
    kind === "stock" ? `Stock research: ${target}` :
    kind === "perps" ? `Perps wallet: ${compact(target)}` :
    kind === "x402" ? `Paid token data: ${compact(target)}` :
    kind === "transaction" ? `Transaction decode: ${compact(target)}` :
    kind === "wallet" ? `Wallet investigation: ${compact(target)}` :
    `Token market read: ${compact(target)}`;

  return {
    id: shortId("plan"),
    kind,
    title,
    summary: `Routed to ${route === "auto" ? "Solana" : route} with ${toolCalls.length} tool steps and ${payloads.length} payloads.`,
    target,
    confidence: Math.min(98, 72 + toolCalls.length * 5 + payloads.length * 3),
    route,
    toolCalls,
    payloads,
    resultRows: resultRowsFor(kind, route, target),
    riskNotes: [
      "Read-only by default; no signing or trading action is executed from this studio.",
      "API keys stay local to the browser session unless you call an MCP endpoint you control.",
      "Transaction and market data may be delayed or plan-gated by the selected provider.",
    ],
  };
}

function formatPlan(plan: IntentPlan) {
  const tools = plan.toolCalls.map((tool, index) => `${index + 1}. ${tool.name}`).join("\n");
  return `${plan.title}\n\n${plan.summary}\n\n${tools}`;
}

function parseMcpResponse(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const dataLine = trimmed.split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (dataLine) return JSON.parse(dataLine.slice(5).trim());
  }
  return JSON.parse(trimmed);
}

async function mcpPost(settings: StudioSettings, sessionId: string | null, method: string, params?: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (settings.mcpApiKey) headers.Authorization = `Bearer ${settings.mcpApiKey}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(settings.mcpEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  const nextSessionId = res.headers.get("mcp-session-id") ?? sessionId;
  const raw = await res.text();
  if (!res.ok) throw new Error(raw || `MCP HTTP ${res.status}`);
  return { sessionId: nextSessionId, data: parseMcpResponse(raw), raw };
}

function responseText(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const record = value as Record<string, unknown>;
  const result = record.result as Record<string, unknown> | undefined;
  const content = result?.content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (item && typeof item === "object" && "text" in item) return String((item as { text: unknown }).text);
      return JSON.stringify(item);
    }).join("\n");
  }
  return JSON.stringify(value, null, 2);
}

export default function App() {
  const [query, setQuery] = useState("Research AAPL with previous close, news, and 30 day bars");
  const [activeRoute, setActiveRoute] = useState<RouteId>("auto");
  const [context, setContext] = useState<StudioContext>(defaultContext);
  const [settings, setSettings] = useState<StudioSettings>(defaultSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "system",
      role: "system",
      text: "MCP Studio online. Solana native, Birdeye, perps, x402, and stocks routes loaded.",
      at: nowLabel(),
    },
  ]);
  const [selectedPlan, setSelectedPlan] = useState<IntentPlan>(() => buildPlan("Research AAPL with previous close, news, and 30 day bars", defaultContext, "stocks"));
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [mcpSession, setMcpSession] = useState<McpSession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<{ context: StudioContext; settings: StudioSettings }>;
      if (parsed.context) setContext({ ...defaultContext, ...parsed.context });
      if (parsed.settings) setSettings({ ...defaultSettings, ...parsed.settings });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ context, settings }));
  }, [context, settings]);

  const availableToolNames = useMemo(() => new Set((mcpSession?.tools ?? []).map((tool) => tool.name)), [mcpSession]);
  const lastPayload = selectedPlan.payloads[0];

  async function connectMcp() {
    setConnectionStatus("checking");
    setBusy(true);
    try {
      const initialized = await mcpPost(settings, null, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "clawd-mcp-studio", version: "0.1.0" },
      });
      const sessionId = initialized.sessionId;
      if (!sessionId) throw new Error("MCP server did not return a session id");
      await mcpPost(settings, sessionId, "notifications/initialized");
      const listed = await mcpPost(settings, sessionId, "tools/list");
      const result = (listed.data as { result?: { tools?: McpTool[] } })?.result;
      setMcpSession({ sessionId, tools: result?.tools ?? [] });
      setConnectionStatus("connected");
      setSettings((current) => ({ ...current, liveMcp: true }));
    } catch (error) {
      setConnectionStatus("error");
      setMessages((current) => current.concat({
        id: shortId("msg"),
        role: "assistant",
        text: `MCP connection failed: ${error instanceof Error ? error.message : String(error)}`,
        at: nowLabel(),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function executeFirstMcpTool(plan: IntentPlan) {
    const sessionId = mcpSession?.sessionId;
    if (!settings.liveMcp || !sessionId) return null;
    const call = plan.toolCalls.find((tool) => tool.executable && availableToolNames.has(tool.name));
    if (!call) return null;
    const result = await mcpPost(settings, sessionId, "tools/call", { name: call.name, arguments: call.args });
    return `Executed ${call.name}\n\n${responseText(result.data)}`;
  }

  async function submitQuery(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = { id: shortId("user"), role: "user", text: trimmed, at: nowLabel() };
    const plan = buildPlan(trimmed, context, activeRoute);
    setSelectedPlan(plan);
    setMessages((current) => current.concat(userMessage));
    setQuery("");
    setBusy(true);

    try {
      const rawResult = await executeFirstMcpTool(plan);
      const assistant: ChatMessage = {
        id: shortId("assistant"),
        role: "assistant",
        text: rawResult ? `${formatPlan(plan)}\n\n${rawResult}` : formatPlan(plan),
        plan,
        rawResult: rawResult ?? undefined,
        at: nowLabel(),
      };
      setMessages((current) => current.concat(assistant));
    } catch (error) {
      setMessages((current) => current.concat({
        id: shortId("assistant"),
        role: "assistant",
        text: `${formatPlan(plan)}\n\nLive MCP call failed: ${error instanceof Error ? error.message : String(error)}`,
        plan,
        at: nowLabel(),
      }));
    } finally {
      setBusy(false);
    }
  }

  function updateContext<K extends keyof StudioContext>(key: K, value: StudioContext[K]) {
    setContext((current) => ({ ...current, [key]: value }));
  }

  function updateSettings<K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="studioRoot">
      <aside className="rail">
        <div className="brand">
          <div className="brandGlyph">C</div>
          <div>
            <strong>Clawd MCP Studio</strong>
            <span>{connectionStatus === "connected" ? `${mcpSession?.tools.length ?? 0} tools` : "local planner"}</span>
          </div>
        </div>

        <div className="routeStack">
          {routes.map((route) => (
            <button
              key={route.id}
              className={`routeButton ${activeRoute === route.id ? "active" : ""}`}
              onClick={() => setActiveRoute(route.id)}
              type="button"
            >
              <span>{route.label}</span>
              <small>{route.state}</small>
              <b>{route.count}</b>
            </button>
          ))}
        </div>

        <div className="statusStrip">
          <span className={`statusDot ${connectionStatus}`} />
          <div>
            <strong>{connectionStatus}</strong>
            <span>{settings.liveMcp ? "MCP live mode" : "planner mode"}</span>
          </div>
        </div>
      </aside>

      <main className="workbench">
        <header className="topbar">
          <div className="marketTape">
            {streamTape.map((item) => (
              <div key={item.label} className={`tapeItem ${item.tone}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.delta}</small>
              </div>
            ))}
          </div>
          <div className="topActions">
            <button type="button" onClick={connectMcp} disabled={busy}>
              {connectionStatus === "connected" ? "Reconnect" : "Connect"}
            </button>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.liveMcp}
                onChange={(event) => updateSettings("liveMcp", event.target.checked)}
              />
              <span />
              <b>Live</b>
            </label>
          </div>
        </header>

        <section className="chatPanel">
          <div className="messages">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`} onClick={() => message.plan && setSelectedPlan(message.plan)}>
                <div className="messageMeta">
                  <span>{message.role}</span>
                  <time>{message.at}</time>
                </div>
                <pre>{message.text}</pre>
                {message.plan && (
                  <div className="messageChips">
                    <span>{message.plan.route}</span>
                    <span>{message.plan.kind}</span>
                    <span>{message.plan.confidence}%</span>
                  </div>
                )}
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={submitQuery}>
            <div className="promptRow">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setQuery(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            <div className="inputLine">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                rows={3}
                placeholder="Wallet, token, transaction, perps wallet, or stock..."
              />
              <button type="submit" disabled={busy || !query.trim()}>
                Run
              </button>
            </div>
          </form>
        </section>
      </main>

      <aside className="inspector">
        <section className="panel contextPanel">
          <div className="panelTitle">
            <strong>Context</strong>
            <span>{context.chain}</span>
          </div>
          <div className="fieldGrid">
            <label>
              <span>Chain</span>
              <select value={context.chain} onChange={(event) => updateContext("chain", event.target.value)}>
                <option value="solana">solana</option>
                <option value="ethereum">ethereum</option>
                <option value="base">base</option>
                <option value="bsc">bsc</option>
                <option value="arbitrum">arbitrum</option>
                <option value="polygon">polygon</option>
              </select>
            </label>
            <label>
              <span>Wallet</span>
              <input value={context.wallet} onChange={(event) => updateContext("wallet", event.target.value)} />
            </label>
            <label>
              <span>Token</span>
              <input value={context.token} onChange={(event) => updateContext("token", event.target.value)} />
            </label>
            <label>
              <span>Transaction</span>
              <input value={context.transaction} onChange={(event) => updateContext("transaction", event.target.value)} />
            </label>
            <label>
              <span>Stock</span>
              <input value={context.stock} onChange={(event) => updateContext("stock", event.target.value.toUpperCase())} />
            </label>
            <label>
              <span>Perps</span>
              <input value={context.perpWallet} onChange={(event) => updateContext("perpWallet", event.target.value)} />
            </label>
          </div>
        </section>

        <section className="panel planPanel">
          <div className="panelTitle">
            <strong>{selectedPlan.title}</strong>
            <span>{selectedPlan.confidence}%</span>
          </div>
          <div className="resultGrid">
            {selectedPlan.resultRows.map((row) => (
              <div key={`${row.metric}-${row.source}`} className={`resultCell ${row.tone ?? "neutral"}`}>
                <span>{row.metric}</span>
                <strong>{row.value}</strong>
                <small>{row.source}</small>
              </div>
            ))}
          </div>
          <div className="toolStack">
            {selectedPlan.toolCalls.map((tool, index) => (
              <div key={`${tool.name}-${index}`} className="toolLine">
                <b>{index + 1}</b>
                <div>
                  <strong>{tool.name}</strong>
                  <span>{tool.reason}</span>
                </div>
                <em className={tool.executable && availableToolNames.has(tool.name) ? "ready" : ""}>
                  {tool.executable && availableToolNames.has(tool.name) ? "ready" : tool.provider}
                </em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel payloadPanel">
          <div className="panelTitle">
            <strong>{lastPayload?.label ?? "Payload"}</strong>
            <span>{lastPayload?.method ?? "none"}</span>
          </div>
          <pre>{JSON.stringify(lastPayload ?? selectedPlan.payloads, null, 2)}</pre>
        </section>

        <section className="panel settingsPanel">
          <div className="panelTitle">
            <strong>MCP</strong>
            <span>{mcpSession?.sessionId ? compact(mcpSession.sessionId) : "no session"}</span>
          </div>
          <label>
            <span>Endpoint</span>
            <input value={settings.mcpEndpoint} onChange={(event) => updateSettings("mcpEndpoint", event.target.value)} />
          </label>
          <label>
            <span>Bearer</span>
            <input value={settings.mcpApiKey} onChange={(event) => updateSettings("mcpApiKey", event.target.value)} type="password" />
          </label>
          <label className="switch fullSwitch">
            <input checked={settings.x402Mode} onChange={(event) => updateSettings("x402Mode", event.target.checked)} type="checkbox" />
            <span />
            <b>x402</b>
          </label>
        </section>
      </aside>
    </div>
  );
}
