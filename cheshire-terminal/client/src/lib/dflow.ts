// DFlow Prediction Markets — typed client wrappers.
// All requests go through the /api/dflow/* server proxy so the
// DFLOW_API_KEY stays server-side.

const BASE = "/api/dflow";

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") qs.set(k, String(v));
    }
  }
  const url = qs.toString() ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`dflow ${path} ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

async function send<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`dflow ${method} ${path} ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type DFlowStatus = {
  configured: boolean;
  quoteApi: string;
  predictionMarketsApi: string;
  sharedCache?: boolean;
};

export type DFlowPredictionAgent = {
  id: string;
  name: string;
  signal: string;
  confidence: number;
  marketTicker: string;
  headline: string;
  rationale: string;
};

export type DFlowBootstrap = {
  generatedAt: string;
  configured: boolean;
  sharedCache: boolean;
  quoteApi: string;
  predictionMarketsApi: string;
  query: {
    q: string | null;
    marketLimit: number;
    hydrateTickersLimit: number;
    selectedTicker: string | null;
  };
  priorityFees: unknown;
  tagsByCategories: unknown;
  filtersBySports: unknown;
  search: any;
  featuredMarkets: any[];
  hydrationTickers: string[];
  marketDetails: Record<string, {
    market: any;
    orderbook: any;
    trades: any;
    stale?: boolean;
  }>;
  predictionAgents: DFlowPredictionAgent[];
};

export type DFlowEvent = {
  ticker: string;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  tags?: string[];
  series_ticker?: string;
  status?: "open" | "settled" | "cancelled" | "closed";
  image_url?: string;
  starts_at?: string;
  ends_at?: string;
  resolves_at?: string;
  [k: string]: unknown;
};

export type DFlowMarket = {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  description?: string;
  status?: "open" | "closed" | "settled" | "cancelled";
  outcome_type?: string;
  outcome_mints?: DFlowOutcomeMint[];
  volume?: number;
  open_interest?: number;
  last_price?: number;
  best_bid?: number;
  best_ask?: number;
  [k: string]: unknown;
};

export type DFlowOutcomeMint = {
  mint_address: string;
  label: string;
  ticker?: string;
  [k: string]: unknown;
};

export type DFlowOrderbookEntry = {
  price: number;
  size: number;
  total?: number;
};

export type DFlowOrderbook = {
  bids: DFlowOrderbookEntry[];
  asks: DFlowOrderbookEntry[];
  spread?: number;
  spread_percent?: number;
  [k: string]: unknown;
};

export type DFlowTrade = {
  signature: string;
  market_ticker: string;
  event_ticker?: string;
  side: "buy" | "sell";
  outcome_label?: string;
  price: number;
  size: number;
  total: number;
  wallet_address?: string;
  timestamp: string;
  [k: string]: unknown;
};

export type DFlowLiveData = {
  market_ticker: string;
  event_ticker?: string;
  last_price?: number;
  best_bid?: number;
  best_ask?: number;
  volume_24h?: number;
  open_interest?: number;
  price_change_24h?: number;
  updated_at?: string;
  [k: string]: unknown;
};

export type DFlowSeries = {
  ticker: string;
  title: string;
  subtitle?: string;
  status?: string;
  events_count?: number;
  [k: string]: unknown;
};

export type DFlowCandlestick = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  [k: string]: unknown;
};

export type DFlowTagCategory = {
  category: string;
  tags: string[];
  [k: string]: unknown;
};

export type DFlowSportFilter = {
  sport: string;
  leagues?: string[];
  [k: string]: unknown;
};

export type DFlowSearchResult = {
  type: "event" | "market" | "series";
  ticker: string;
  title: string;
  subtitle?: string;
  [k: string]: unknown;
};

export type DFlowPaginated<T> = {
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages?: number;
  };
};

export type DFlowPriorityFees = {
  low: number;
  medium: number;
  high: number;
  [k: string]: unknown;
};

export type DFlowToken = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logo_uri?: string;
  [k: string]: unknown;
};

export type DFlowVenue = {
  name: string;
  address: string;
  program_id?: string;
  [k: string]: unknown;
};

// ─── Intent Swap Types ───────────────────────────────────────────────────────

export type DFlowIntentQuote = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  minOutAmount: string;
  slippageBps: number;
  feeBudget: number;
  priceImpactPct: string;
  openTransaction?: string;
  lastValidBlockHeight?: number;
  expiry?: { slotsAfterOpen: number };
  platformFee?: {
    amount: string;
    feeBps: number;
    feeAccount: string;
    segmenterFeeAmount: string;
    segmenterFeePct: number;
  } | null;
};

export type DFlowIntentParams = {
  inputMint: string;
  outputMint: string;
  amount: number;
  userPublicKey?: string;
  slippageBps?: number | "auto";
  priceImpactTolerancePct?: number;
  platformFeeBps?: number;
  feeAccount?: string;
  referralAccount?: string;
  wrapAndUnwrapSol?: boolean;
  feeBudget?: number;
  maxAutoFeeBudget?: number;
};

export type DFlowSubmitIntentResult = {
  programId: string;
  orderAddress: string;
  openTransactionSignature: string;
};

// ─── Status ──────────────────────────────────────────────────────────────────

// ─── Intent (declarative token swap) ────────────────────────────────────────

export const getDFlowIntent = (params: DFlowIntentParams) =>
  get<DFlowIntentQuote>("/intent", {
    ...params,
    slippageBps: params.slippageBps ?? "auto",
  } as Record<string, string | number | boolean | undefined>);

export const submitDFlowIntent = (quoteResponse: DFlowIntentQuote, signedOpenTransaction: string) =>
  send<DFlowSubmitIntentResult>("POST", "/submit-intent", { quoteResponse, signedOpenTransaction });

// ─── Status ──────────────────────────────────────────────────────────────────

export const getDFlowStatus = () => get<DFlowStatus>("/status");
export const getDFlowBootstrap = (params?: {
  q?: string;
  status?: string;
  sort?: string;
  order?: string;
  marketLimit?: number;
  hydrateTickers?: number;
  tradeLimit?: number;
  orderbookDepth?: number;
  marketTicker?: string;
  walletAddress?: string;
}) => get<DFlowBootstrap>("/bootstrap", params as Record<string, string | number | boolean | undefined>);

// ─── Quote API ───────────────────────────────────────────────────────────────

export const getDFlowPredictionMarketInit = (payer: string, outcomeMint?: string) =>
  get<unknown>("/prediction-market-init", { payer, outcomeMint });

export const getDFlowPriorityFees = () => get<DFlowPriorityFees>("/priority-fees");

export const getDFlowTokens = () => get<DFlowToken[]>("/tokens");

export const getDFlowTokensWithDecimals = () => get<DFlowToken[]>("/tokens-with-decimals");

export const getDFlowVenues = () => get<DFlowVenue[]>("/venues");

// ─── Events ──────────────────────────────────────────────────────────────────

export const listDFlowEvents = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  tag?: string;
  series_ticker?: string;
  sort_by?: string;
  sort_direction?: string;
  start?: string;
  end?: string;
}) => get<DFlowPaginated<DFlowEvent>>("/events", params as Record<string, string | number | boolean | undefined>);

export const getDFlowEvent = (ticker: string) =>
  get<DFlowEvent>(`/events/${encodeURIComponent(ticker)}`);

// ─── Markets ─────────────────────────────────────────────────────────────────

export const listDFlowMarkets = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  event_ticker?: string;
  series_ticker?: string;
  sort_by?: string;
  sort_direction?: string;
}) => get<DFlowPaginated<DFlowMarket>>("/markets", params as Record<string, string | number | boolean | undefined>);

export const getDFlowMarket = (marketId: string) =>
  get<DFlowMarket>(`/market/${encodeURIComponent(marketId)}`);

export const getDFlowMarketByMint = (mintAddress: string) =>
  get<DFlowMarket>(`/market/by-mint/${encodeURIComponent(mintAddress)}`);

export const getDFlowMarketsBatch = (body: unknown) =>
  send<DFlowMarket[]>("POST", "/markets/batch", body);

// ─── Orderbook ───────────────────────────────────────────────────────────────

export const getDFlowOrderbook = (marketTicker: string, limit?: number) =>
  get<DFlowOrderbook>(`/orderbook/${encodeURIComponent(marketTicker)}`, { limit });

export const getDFlowOrderbookByMint = (mintAddress: string, limit?: number) =>
  get<DFlowOrderbook>(`/orderbook/by-mint/${encodeURIComponent(mintAddress)}`, { limit });

// ─── Trades ──────────────────────────────────────────────────────────────────

export const listDFlowTrades = (params?: {
  page?: number;
  limit?: number;
  market_ticker?: string;
  event_ticker?: string;
  series_ticker?: string;
  wallet_address?: string;
  sort_by?: string;
  sort_direction?: string;
  start?: string;
  end?: string;
}) => get<DFlowPaginated<DFlowTrade>>("/trades", params as Record<string, string | number | boolean | undefined>);

export const listDFlowTradesByMint = (mintAddress: string, params?: {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_direction?: string;
}) => get<DFlowPaginated<DFlowTrade>>(`/trades/by-mint/${encodeURIComponent(mintAddress)}`, params as Record<string, string | number | boolean | undefined>);

export const listDFlowOnchainTrades = (params?: {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_direction?: string;
}) => get<DFlowPaginated<DFlowTrade>>("/onchain-trades", params as Record<string, string | number | boolean | undefined>);

export const listDFlowOnchainTradesByEvent = (eventTicker: string, params?: { page?: number; limit?: number }) =>
  get<DFlowPaginated<DFlowTrade>>(`/onchain-trades/by-event/${encodeURIComponent(eventTicker)}`, params as Record<string, string | number | boolean | undefined>);

export const listDFlowOnchainTradesByMarket = (marketTicker: string, params?: { page?: number; limit?: number }) =>
  get<DFlowPaginated<DFlowTrade>>(`/onchain-trades/by-market/${encodeURIComponent(marketTicker)}`, params as Record<string, string | number | boolean | undefined>);

// ─── Live Data ───────────────────────────────────────────────────────────────

export const listDFlowLiveData = (params?: {
  page?: number;
  limit?: number;
  event_ticker?: string;
  market_ticker?: string;
  series_ticker?: string;
  status?: string;
}) => get<DFlowPaginated<DFlowLiveData>>("/live-data", params as Record<string, string | number | boolean | undefined>);

export const getDFlowLiveDataByEvent = (eventTicker: string) =>
  get<DFlowLiveData[]>(`/live-data/by-event/${encodeURIComponent(eventTicker)}`);

export const getDFlowLiveDataByMint = (mintAddress: string) =>
  get<DFlowLiveData[]>(`/live-data/by-mint/${encodeURIComponent(mintAddress)}`);

// ─── Series ──────────────────────────────────────────────────────────────────

export const listDFlowSeries = (params?: { page?: number; limit?: number; status?: string }) =>
  get<DFlowPaginated<DFlowSeries>>("/series", params as Record<string, string | number | boolean | undefined>);

export const getDFlowSeriesByTicker = (seriesTicker: string) =>
  get<DFlowSeries>(`/series/by-ticker/${encodeURIComponent(seriesTicker)}`);

// ─── Outcome Mints ───────────────────────────────────────────────────────────

export const listDFlowOutcomeMints = (params?: {
  page?: number;
  limit?: number;
  market_ticker?: string;
  event_ticker?: string;
}) => get<DFlowPaginated<DFlowOutcomeMint>>("/outcome-mints", params as Record<string, string | number | boolean | undefined>);

export const filterDFlowOutcomeMints = (body: unknown) =>
  send<DFlowOutcomeMint[]>("POST", "/outcome-mints/filter", body);

// ─── Candlesticks ────────────────────────────────────────────────────────────

export const getDFlowEventCandlesticks = (ticker: string, params?: {
  interval?: string;
  limit?: number;
  start?: string;
  end?: string;
  periodInterval?: number;
  startTs?: number;
  endTs?: number;
}) => get<DFlowCandlestick[]>(`/candlesticks/event/${encodeURIComponent(ticker)}`, params as Record<string, string | number | boolean | undefined>);

export const getDFlowMarketCandlesticks = (ticker: string, params?: {
  interval?: string;
  limit?: number;
  start?: string;
  end?: string;
  periodInterval?: number;
  startTs?: number;
  endTs?: number;
}) => get<DFlowCandlestick[]>(`/candlesticks/market/${encodeURIComponent(ticker)}`, params as Record<string, string | number | boolean | undefined>);

export const getDFlowMarketCandlesticksByMint = (mintAddress: string, params?: {
  interval?: string;
  limit?: number;
  start?: string;
  end?: string;
  periodInterval?: number;
  startTs?: number;
  endTs?: number;
}) => get<DFlowCandlestick[]>(`/candlesticks/market/by-mint/${encodeURIComponent(mintAddress)}`, params as Record<string, string | number | boolean | undefined>);

// ─── Tags, Filters, Search ───────────────────────────────────────────────────

export const getDFlowTagsByCategories = () => get<DFlowTagCategory[]>("/tags-by-categories");

export const getDFlowFiltersBySports = () => get<DFlowSportFilter[]>("/filters-by-sports");

export const searchDFlow = (query: string, limit?: number, type?: string) =>
  get<any>("/search", { q: query, limit, type, withNestedMarkets: true, withMarketAccounts: true });

export function buildDFlowStreamUrl(params: {
  tickers: string[];
  channels?: Array<"orderbook" | "trades">;
  walletAddress?: string | null;
}) {
  const qs = new URLSearchParams();
  qs.set("tickers", params.tickers.join(","));
  if (params.channels?.length) qs.set("channels", params.channels.join(","));
  if (params.walletAddress) qs.set("walletAddress", params.walletAddress);
  return `${BASE}/stream?${qs.toString()}`;
}

// ─── OODA Loop — Swap API ─────────────────────────────────────────────────────

export type DFlowQuoteResponse = {
  contextSlot: number;
  inAmount: string;
  inputMint: string;
  outAmount: string;
  minOutAmount: string;
  otherAmountThreshold: string;
  outputMint: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: unknown[];
  requestId?: string;
};

export type DFlowOrderResponse = DFlowQuoteResponse & {
  executionMode?: string;
  transaction?: string;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  prioritizationType?: unknown;
  addressLookupTables?: unknown[];
};

export type DFlowSwapResult = {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
};

export const getSwapQuote = (params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number | "auto";
  onlyDirectRoutes?: boolean;
}) =>
  get<DFlowQuoteResponse>("/quote", {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps ?? "auto",
    onlyDirectRoutes: params.onlyDirectRoutes,
  });

export const getDFlowOrder = (params: {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  userPublicKey?: string;
  slippageBps?: number | "auto";
  prioritizationFeeLamports?: number | "auto" | "medium" | "high" | "veryHigh" | "disabled";
  priceImpactTolerancePct?: number;
  onlyDirectRoutes?: boolean;
  includeAddressLookupTables?: boolean;
}) =>
  get<DFlowOrderResponse>("/order", {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    userPublicKey: params.userPublicKey,
    slippageBps: params.slippageBps ?? "auto",
    prioritizationFeeLamports: params.prioritizationFeeLamports ?? "auto",
    priceImpactTolerancePct: params.priceImpactTolerancePct,
    onlyDirectRoutes: params.onlyDirectRoutes,
    includeAddressLookupTables: params.includeAddressLookupTables,
  });

export const getIntentQuote = (params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  userPublicKey: string;
  slippageBps?: number | "auto";
}) =>
  get<DFlowIntentQuote>("/intent", {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    userPublicKey: params.userPublicKey,
    slippageBps: params.slippageBps ?? "auto",
  });

export const createSwapTransaction = (quoteResponse: DFlowQuoteResponse, userPublicKey: string) =>
  send<DFlowSwapResult>("POST", "/swap", {
    quoteResponse,
    userPublicKey,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: "auto",
    wrapAndUnwrapSol: true,
  });

export const submitIntent = (quoteResponse: DFlowIntentQuote, signedOpenTransaction: string) =>
  send<DFlowSubmitIntentResult>("POST", "/submit-intent", { quoteResponse, signedOpenTransaction });

// ─── OODA Loop — well-known token registry ────────────────────────────────────

export type KnownToken = { symbol: string; mint: string; decimals: number };

export const KNOWN_TOKENS: KnownToken[] = [
  { symbol: "SOL",  mint: "So11111111111111111111111111111111111111112",  decimals: 9 },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  decimals: 6 },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
  { symbol: "JUP",  mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  decimals: 6 },
  { symbol: "WIF",  mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6 },
  { symbol: "PYTH", mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",  decimals: 6 },
  { symbol: "RAY",  mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",  decimals: 6 },
];

export function toBaseUnits(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals);
}

export function fromBaseUnits(amount: number, decimals: number): number {
  return amount / 10 ** decimals;
}

// ─── OODA Loop — condition evaluation ────────────────────────────────────────

export type OODAConditionType = "always" | "price_above" | "price_below" | "output_min";

export type OODACondition = {
  type: OODAConditionType;
  value: number; // USD price or output amount threshold
};

export function evaluateOODACondition(
  condition: OODACondition,
  quote: DFlowQuoteResponse | DFlowIntentQuote,
  outputDecimals: number,
): { pass: boolean; reason: string } {
  const outAmount = fromBaseUnits(Number(quote.outAmount), outputDecimals);
  const inAmount = fromBaseUnits(Number(quote.inAmount), 9); // assume SOL input for price calc
  const impliedPrice = inAmount > 0 ? outAmount / inAmount : 0;

  switch (condition.type) {
    case "always":
      return { pass: true, reason: "Always execute" };
    case "price_above":
      return {
        pass: impliedPrice >= condition.value,
        reason: `Price ${impliedPrice.toFixed(4)} ${impliedPrice >= condition.value ? "≥" : "<"} ${condition.value}`,
      };
    case "price_below":
      return {
        pass: impliedPrice <= condition.value,
        reason: `Price ${impliedPrice.toFixed(4)} ${impliedPrice <= condition.value ? "≤" : ">"} ${condition.value}`,
      };
    case "output_min":
      return {
        pass: outAmount >= condition.value,
        reason: `Output ${outAmount.toFixed(4)} ${outAmount >= condition.value ? "≥" : "<"} ${condition.value}`,
      };
    default:
      return { pass: false, reason: "Unknown condition" };
  }
}
