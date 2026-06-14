import { Router } from "express";
import { z } from "zod";

const router = Router();

const LEGACY_HERMES_BASE = "https://hermes.pyth.network";
const AUTHED_HERMES_BASE = (process.env.PYTH_HERMES_BASE || "https://pyth.dourolabs.app/hermes").replace(/\/$/, "");
const BENCHMARKS_BASE = (process.env.PYTH_BENCHMARKS_BASE || "https://benchmarks.pyth.network").replace(/\/$/, "");
const FINANCIAL_DATASETS_BASE = (process.env.FINANCIAL_DATASETS_BASE || "https://api.financialdatasets.ai").replace(/\/$/, "");
const FINANCIAL_DATASETS_DOCS_BASE = "https://docs.financialdatasets.ai";
const MASSIVE_BASE = (process.env.MASSIVE_API_BASE || "https://api.massive.com").replace(/\/$/, "");
const MASSIVE_DOCS_BASE = "https://massive.com/docs/rest/stocks";
const PYTH_UPGRADE_CUTOVER_DATE = "2026-07-31";
const FEATURED_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "SPY"] as const;
const SEARCH_LIMIT = 12;
const SPACEX_IPO_SYMBOLS = ["SPCX"] as const;
const SPACEX_COMPARABLES = [
  { symbol: "RKLB", name: "Rocket Lab", lane: "Launch systems" },
  { symbol: "ASTS", name: "AST SpaceMobile", lane: "Satellite connectivity" },
  { symbol: "LUNR", name: "Intuitive Machines", lane: "Lunar services" },
  { symbol: "RDW", name: "Redwire", lane: "Space infrastructure" },
  { symbol: "BA", name: "Boeing", lane: "Aerospace prime" },
  { symbol: "LMT", name: "Lockheed Martin", lane: "Defense space" },
] as const;
const FINANCIAL_DATASETS_DOCS = [
  {
    label: "Documentation index",
    url: `${FINANCIAL_DATASETS_DOCS_BASE}/llms.txt`,
    use: "Canonical index to discover every Financial Datasets documentation page.",
  },
  {
    label: "OpenAPI spec",
    url: `${FINANCIAL_DATASETS_DOCS_BASE}/api/openapi.json`,
    use: "Endpoint schema for company facts, filings, news, metrics, and stock prices.",
  },
  {
    label: "Data provenance",
    url: `${FINANCIAL_DATASETS_DOCS_BASE}/data-provenance`,
    use: "Source lineage for SEC data, market data, and news data.",
  },
  {
    label: "Market coverage",
    url: `${FINANCIAL_DATASETS_DOCS_BASE}/market-coverage`,
    use: "Coverage checks before assuming a ticker is available.",
  },
] as const;
const FINANCIAL_DATASETS_ENDPOINTS = [
  { name: "Market news", method: "GET", path: "/news", params: "ticker?, limit<=10" },
  { name: "Company facts", method: "GET", path: "/company/facts", params: "ticker or cik" },
  { name: "Financial metrics snapshot", method: "GET", path: "/financial-metrics/snapshot", params: "ticker or cik" },
  { name: "SEC filings", method: "GET", path: "/filings", params: "ticker or cik, filing_type?, limit?" },
  { name: "Price snapshot", method: "GET", path: "/prices/snapshot", params: "ticker" },
] as const;
const MASSIVE_DOCS = [
  {
    label: "Ticker types",
    url: `${MASSIVE_DOCS_BASE}/tickers/ticker-types`,
    use: "Reference taxonomy for stock ticker asset classes, locales, and instrument types.",
  },
  {
    label: "All tickers",
    url: `${MASSIVE_DOCS_BASE}/tickers/all-tickers`,
    use: "Ticker search and active US stock discovery.",
  },
  {
    label: "Ticker overview",
    url: `${MASSIVE_DOCS_BASE}/tickers/ticker-overview`,
    use: "Company profile, exchange, SIC, market cap, branding, and identifiers.",
  },
  {
    label: "Aggregate bars",
    url: `${MASSIVE_DOCS_BASE}/aggregates/custom-bars`,
    use: "OHLCV chart candles over custom date ranges and intervals.",
  },
  {
    label: "Single ticker snapshot",
    url: `${MASSIVE_DOCS_BASE}/snapshots/single-ticker-snapshot`,
    use: "Latest trade, quote, day bar, minute bar, and previous day state.",
  },
  {
    label: "Technical indicators",
    url: `${MASSIVE_DOCS_BASE}/technical-indicators/simple-moving-average`,
    use: "SMA, EMA, RSI, and related chart overlay series.",
  },
  {
    label: "News",
    url: `${MASSIVE_DOCS_BASE}/news`,
    use: "Ticker-linked market news for context panels.",
  },
] as const;
const MASSIVE_ENDPOINTS = [
  { name: "Ticker types", method: "GET", path: "/v3/reference/tickers/types", params: "asset_class=stocks, locale=us" },
  { name: "Ticker search", method: "GET", path: "/v3/reference/tickers", params: "market=stocks, search?, ticker?, active=true, limit" },
  { name: "Ticker overview", method: "GET", path: "/v3/reference/tickers/{ticker}", params: "date?" },
  { name: "OHLC aggregates", method: "GET", path: "/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}", params: "adjusted=true, sort=asc, limit<=50000" },
  { name: "Ticker snapshot", method: "GET", path: "/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}", params: "ticker path parameter" },
  { name: "Last trade", method: "GET", path: "/v2/last/trade/{ticker}", params: "ticker path parameter" },
  { name: "SMA", method: "GET", path: "/v1/indicators/sma/{ticker}", params: "timespan, window, series_type, order, limit" },
  { name: "EMA", method: "GET", path: "/v1/indicators/ema/{ticker}", params: "timespan, window, series_type, order, limit" },
  { name: "RSI", method: "GET", path: "/v1/indicators/rsi/{ticker}", params: "timespan, window, series_type, order, limit" },
  { name: "News", method: "GET", path: "/v2/reference/news", params: "ticker, limit, order=desc" },
] as const;

const SESSION_ORDER = ["regular", "pre", "post", "overnight"] as const;
type SessionKey = (typeof SESSION_ORDER)[number];

type QuoteValue = {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
};

type ParsedPriceUpdate = {
  id: string;
  price: QuoteValue;
  ema_price?: QuoteValue;
  metadata?: {
    slot?: number;
    proof_available_time?: number;
    prev_publish_time?: number;
  };
};

type HermesLatestResponse = {
  parsed?: ParsedPriceUpdate[];
};

type TradingViewHistoryResponse = {
  s: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
};

type FinancialDatasetsNewsItem = {
  title?: string;
  headline?: string;
  summary?: string;
  description?: string;
  source?: string;
  publisher?: string;
  url?: string;
  article_url?: string;
  ticker?: string;
  tickers?: string[];
  published_at?: string;
  date?: string;
  created_at?: string;
};

type FinancialDatasetsFilingItem = {
  ticker?: string;
  cik?: string;
  filing_type?: string;
  form_type?: string;
  accession_number?: string;
  filing_date?: string;
  filed_at?: string;
  report_date?: string;
  url?: string;
  document_url?: string;
  title?: string;
};

type PythFeedAttributes = {
  asset_type?: string;
  base?: string;
  country?: string;
  description?: string;
  display_symbol?: string;
  publish_interval?: string;
  quote_currency?: string;
  schedule?: string;
  symbol: string;
};

type PythFeed = {
  id: string;
  attributes: PythFeedAttributes;
};

type QuoteSnapshot = {
  price: number;
  confidence: number;
  confidencePercent: number | null;
  expo: number;
  publishTime: number;
  ageSeconds: number;
  emaPrice: number | null;
  slot: number | null;
  proofAvailableTime: number | null;
};

type SessionFeed = {
  session: SessionKey;
  feedId: string;
  ticker: string;
  description: string;
  displaySymbol: string;
  schedule: string | null;
  publishInterval: string | null;
  country: string | null;
  base: string;
  quoteCurrency: string | null;
  quote: QuoteSnapshot | null;
};

type GroupedEquity = {
  symbol: string;
  name: string;
  description: string;
  country: string | null;
  sessions: Record<SessionKey, SessionFeed | null>;
};

type HistoryPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type RangeKey = "1D" | "5D" | "1M" | "3M" | "1Y";

const RANGE_CONFIG: Record<
  RangeKey,
  {
    resolution: string;
    fetchLookbackDays: number;
    trimTo: number;
  }
> = {
  "1D": { resolution: "15", fetchLookbackDays: 4, trimTo: 32 },
  "5D": { resolution: "60", fetchLookbackDays: 14, trimTo: 40 },
  "1M": { resolution: "D", fetchLookbackDays: 75, trimTo: 30 },
  "3M": { resolution: "D", fetchLookbackDays: 150, trimTo: 66 },
  "1Y": { resolution: "D", fetchLookbackDays: 420, trimTo: 260 },
};
const MASSIVE_RANGE_CONFIG: Record<
  RangeKey,
  {
    multiplier: number;
    timespan: "minute" | "hour" | "day" | "week" | "month";
    lookbackDays: number;
    limit: number;
    trimTo: number;
  }
> = {
  "1D": { multiplier: 15, timespan: "minute", lookbackDays: 5, limit: 5000, trimTo: 96 },
  "5D": { multiplier: 30, timespan: "minute", lookbackDays: 10, limit: 5000, trimTo: 120 },
  "1M": { multiplier: 1, timespan: "day", lookbackDays: 45, limit: 5000, trimTo: 32 },
  "3M": { multiplier: 1, timespan: "day", lookbackDays: 120, limit: 5000, trimTo: 72 },
  "1Y": { multiplier: 1, timespan: "week", lookbackDays: 420, limit: 5000, trimTo: 80 },
};

const cache = new Map<string, { expiresAt: number; data: unknown }>();

function getPythApiKey(): string {
  return process.env.PYTH_API_KEY?.trim() || "";
}

function getFinancialDatasetsApiKey(): string {
  return (
    process.env.FINANCIAL_DATASETS_API_KEY ||
    process.env.FINANCIALDATASETS_API_KEY ||
    process.env.FD_API_KEY ||
    ""
  ).trim();
}

function getMassiveApiKey(): string {
  return (process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "").trim();
}

function getHermesBase(): string {
  return getPythApiKey() ? AUTHED_HERMES_BASE : LEGACY_HERMES_BASE;
}

function pythHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = getPythApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function financialDatasetsHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "X-API-KEY": getFinancialDatasetsApiKey(),
  };
}

function financialDatasetsStatus() {
  return {
    configured: Boolean(getFinancialDatasetsApiKey()),
    base: FINANCIAL_DATASETS_BASE,
    authHeader: "X-API-KEY",
    docs: FINANCIAL_DATASETS_DOCS,
    endpoints: FINANCIAL_DATASETS_ENDPOINTS,
  };
}

function massiveStatus() {
  return {
    configured: Boolean(getMassiveApiKey()),
    base: MASSIVE_BASE,
    authMode: "apiKey query parameter",
    docs: MASSIVE_DOCS,
    endpoints: MASSIVE_ENDPOINTS,
  };
}

async function withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  const data = await loader();
  cache.set(key, { expiresAt: Date.now() + ttlMs, data });
  return data;
}

function buildUrl(
  base: string,
  path: string,
  params: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined> = {},
) {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchJson<T>(
  base: string,
  path: string,
  params: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>,
  cacheKey: string,
  ttlMs: number,
) {
  return withCache(cacheKey, ttlMs, async () => {
    const response = await fetch(buildUrl(base, path, params), {
      headers: pythHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[stocks] ${response.status} ${text.slice(0, 240)}`);
    }
    return response.json() as Promise<T>;
  });
}

function parseJsonText(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.error || record.message || record.detail;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function fetchFinancialDatasets<T>(
  path: string,
  params: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>,
  cacheKey: string,
  ttlMs: number,
) {
  if (!getFinancialDatasetsApiKey()) {
    throw new Error("FINANCIAL_DATASETS_API_KEY is not configured");
  }

  return withCache(`financial-datasets:${cacheKey}`, ttlMs, async () => {
    const response = await fetch(buildUrl(FINANCIAL_DATASETS_BASE, path, params), {
      headers: financialDatasetsHeaders(),
    });
    const text = await response.text();
    const payload = parseJsonText(text);
    if (!response.ok) {
      throw new Error(`[financial-datasets] ${response.status} ${errorMessageFromPayload(payload, text.slice(0, 240))}`);
    }
    return payload as T;
  });
}

async function optionalFinancialDatasets<T>(label: string, loader: () => Promise<T>) {
  try {
    return { ok: true as const, data: await loader() };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || `${label} unavailable` };
  }
}

async function fetchMassive<T>(
  path: string,
  params: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>,
  cacheKey: string,
  ttlMs: number,
) {
  const apiKey = getMassiveApiKey();
  if (!apiKey) {
    throw new Error("MASSIVE_API_KEY is not configured");
  }

  return withCache(`massive:${cacheKey}`, ttlMs, async () => {
    const response = await fetch(buildUrl(MASSIVE_BASE, path, { ...params, apiKey }), {
      headers: { accept: "application/json" },
    });
    const text = await response.text();
    const payload = parseJsonText(text);
    if (!response.ok) {
      throw new Error(`[massive] ${response.status} ${errorMessageFromPayload(payload, text.slice(0, 240))}`);
    }
    return payload as T;
  });
}

async function optionalMassive<T>(label: string, loader: () => Promise<T>) {
  try {
    return { ok: true as const, data: await loader() };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || `${label} unavailable` };
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function unwrapRows<T = unknown>(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload as T[];
  const record = asRecord(payload);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [] as T[];
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function normalizeNewsPayload(payload: unknown) {
  return unwrapRows<FinancialDatasetsNewsItem>(payload, ["news", "data", "items"]).flatMap((item) => {
    const record = asRecord(item);
    const title = readString(record, ["title", "headline"]);
    if (!title) return [];
    return [{
      title,
      summary: readString(record, ["summary", "description"]),
      source: readString(record, ["source", "publisher"]),
      url: readString(record, ["url", "article_url"]),
      ticker: readString(record, ["ticker"]) || (Array.isArray(item.tickers) ? item.tickers.join(", ") : null),
      publishedAt: readString(record, ["published_at", "date", "created_at"]),
    }];
  });
}

function normalizeFilingsPayload(payload: unknown) {
  return unwrapRows<FinancialDatasetsFilingItem>(payload, ["filings", "data", "items"]).map((item) => {
    const record = asRecord(item);
    return {
      ticker: readString(record, ["ticker"]),
      cik: readString(record, ["cik"]),
      type: readString(record, ["filing_type", "form_type"]),
      accessionNumber: readString(record, ["accession_number"]),
      filingDate: readString(record, ["filing_date", "filed_at"]),
      reportDate: readString(record, ["report_date"]),
      url: readString(record, ["url", "document_url"]),
      title: readString(record, ["title"]),
    };
  });
}

function summarizeFactsPayload(payload: unknown) {
  const record = asRecord(asRecord(payload).company_facts || asRecord(payload).facts || asRecord(payload).company || payload);
  return {
    name: readString(record, ["name", "company_name", "legal_name"]),
    ticker: readString(record, ["ticker"]),
    cik: readString(record, ["cik"]),
    exchange: readString(record, ["exchange", "listing_exchange"]),
    industry: readString(record, ["industry", "sic_description"]),
    sector: readString(record, ["sector"]),
    website: readString(record, ["website", "company_url"]),
    fiscalYearEnd: readString(record, ["fiscal_year_end", "fiscal_year"]),
  };
}

function summarizeMetricsPayload(payload: unknown) {
  const record = asRecord(
    asRecord(payload).financial_metrics ||
      asRecord(payload).metrics ||
      asRecord(payload).snapshot ||
      payload,
  );
  return {
    marketCap: toNullableNumber(record.market_cap),
    enterpriseValue: toNullableNumber(record.enterprise_value),
    revenue: toNullableNumber(record.revenue),
    grossProfit: toNullableNumber(record.gross_profit),
    ebitda: toNullableNumber(record.ebitda),
    eps: toNullableNumber(record.earnings_per_share || record.eps),
    priceToSales: toNullableNumber(record.price_to_sales_ratio || record.price_to_sales),
    priceToEarnings: toNullableNumber(record.price_to_earnings_ratio || record.pe_ratio),
    debtToEquity: toNullableNumber(record.debt_to_equity),
  };
}

function normalizePriceSnapshotPayload(payload: unknown) {
  const record = asRecord(asRecord(payload).snapshot || payload);
  return {
    ticker: readString(record, ["ticker"]),
    price: toNullableNumber(record.price),
    dayChange: toNullableNumber(record.day_change),
    dayChangePercent: toNullableNumber(record.day_change_percent),
    time: readString(record, ["time", "timestamp"]),
    timeMilliseconds: toNullableNumber(record.time_milliseconds),
  };
}

function readRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object") return value as Record<string, unknown>;
  }
  return {};
}

function timestampToIso(value: unknown) {
  const numeric = toNullableNumber(value);
  if (!numeric) return null;
  const ms =
    numeric > 10_000_000_000_000 ? numeric / 1_000_000 :
    numeric > 10_000_000_000 ? numeric :
    numeric * 1_000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestampToSeconds(value: unknown) {
  const numeric = toNullableNumber(value);
  if (!numeric) return null;
  if (numeric > 10_000_000_000_000) return Math.floor(numeric / 1_000_000_000);
  if (numeric > 10_000_000_000) return Math.floor(numeric / 1_000);
  return Math.floor(numeric);
}

function normalizeMassiveTickerDetails(payload: unknown) {
  const record = asRecord(asRecord(payload).results || payload);
  if (!Object.keys(record).length) return null;
  const branding = readRecord(record, ["branding"]);
  return {
    ticker: readString(record, ["ticker"]),
    name: readString(record, ["name"]),
    description: readString(record, ["description"]),
    market: readString(record, ["market"]),
    locale: readString(record, ["locale"]),
    primaryExchange: readString(record, ["primary_exchange"]),
    currencyName: readString(record, ["currency_name"]),
    type: readString(record, ["type"]),
    active: typeof record.active === "boolean" ? record.active : null,
    marketCap: toNullableNumber(record.market_cap),
    listDate: readString(record, ["list_date"]),
    sicCode: readString(record, ["sic_code"]),
    sicDescription: readString(record, ["sic_description"]),
    totalEmployees: toNullableNumber(record.total_employees),
    homepageUrl: readString(record, ["homepage_url"]),
    logoUrl: readString(branding, ["logo_url"]),
    iconUrl: readString(branding, ["icon_url"]),
    cik: readString(record, ["cik"]),
    compositeFigi: readString(record, ["composite_figi"]),
    shareClassFigi: readString(record, ["share_class_figi"]),
    lastUpdatedUtc: readString(record, ["last_updated_utc"]),
  };
}

function normalizeMassiveTickerRows(payload: unknown) {
  return unwrapRows<Record<string, unknown>>(payload, ["results", "tickers", "data"]).flatMap((item) => {
    const record = asRecord(item);
    const symbol = readString(record, ["ticker"]);
    const name = readString(record, ["name"]);
    if (!symbol || !name) return [];
    return [{
      symbol,
      name,
      description: readString(record, ["type", "market"]) || "Massive stock ticker",
      country: readString(record, ["locale"]),
      market: readString(record, ["market"]),
      primaryExchange: readString(record, ["primary_exchange"]),
      active: typeof record.active === "boolean" ? record.active : null,
      type: readString(record, ["type"]),
      sessions: [] as Array<{
        session: SessionKey;
        feedId: string;
        ticker: string;
        displaySymbol: string;
        schedule: string | null;
      }>,
    }];
  });
}

function normalizeMassiveBar(record: Record<string, unknown>) {
  const seconds = timestampToSeconds(record.t);
  const open = toNullableNumber(record.o);
  const high = toNullableNumber(record.h);
  const low = toNullableNumber(record.l);
  const close = toNullableNumber(record.c);
  if (!seconds || open == null || high == null || low == null || close == null) return null;
  return {
    time: seconds,
    open,
    high,
    low,
    close,
    volume: toNullableNumber(record.v),
    vwap: toNullableNumber(record.vw),
    transactions: toNullableNumber(record.n),
  };
}

function normalizeMassiveAggregates(payload: unknown, range: RangeKey) {
  const record = asRecord(payload);
  const points = unwrapRows<Record<string, unknown>>(payload, ["results"])
    .map((item) => normalizeMassiveBar(asRecord(item)))
    .filter((point): point is NonNullable<ReturnType<typeof normalizeMassiveBar>> => Boolean(point));
  return {
    ticker: readString(record, ["ticker"]),
    range,
    adjusted: typeof record.adjusted === "boolean" ? record.adjusted : null,
    queryCount: toNullableNumber(record.queryCount),
    resultsCount: toNullableNumber(record.resultsCount),
    points,
  };
}

function normalizeMassiveDayBar(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    open: toNullableNumber(record.o),
    high: toNullableNumber(record.h),
    low: toNullableNumber(record.l),
    close: toNullableNumber(record.c),
    volume: toNullableNumber(record.v),
    vwap: toNullableNumber(record.vw),
    timestamp: timestampToIso(record.t),
    transactions: toNullableNumber(record.n),
  };
}

function normalizeMassiveTrade(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    price: toNullableNumber(record.p),
    size: toNullableNumber(record.s),
    exchange: toNullableNumber(record.x),
    timestamp: timestampToIso(record.t),
    conditions: Array.isArray(record.c) ? record.c : [],
    id: readString(record, ["i"]),
    tape: toNullableNumber(record.z),
  };
}

function normalizeMassiveQuote(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    bid: toNullableNumber(record.p),
    bidSize: toNullableNumber(record.s),
    ask: toNullableNumber(record.P),
    askSize: toNullableNumber(record.S),
    bidExchange: toNullableNumber(record.x),
    askExchange: toNullableNumber(record.X),
    timestamp: timestampToIso(record.t),
  };
}

function normalizeMassiveSnapshot(payload: unknown) {
  const ticker = asRecord(asRecord(payload).ticker || payload);
  if (!Object.keys(ticker).length) return null;
  const day = normalizeMassiveDayBar(ticker.day);
  const prevDay = normalizeMassiveDayBar(ticker.prevDay);
  const lastTrade = normalizeMassiveTrade(ticker.lastTrade);
  const lastQuote = normalizeMassiveQuote(ticker.lastQuote);
  const todaysChange = toNullableNumber(ticker.todaysChange);
  const todaysChangePercent = toNullableNumber(ticker.todaysChangePerc);
  return {
    ticker: readString(ticker, ["ticker"]),
    updatedAt: timestampToIso(ticker.updated),
    day,
    prevDay,
    minute: normalizeMassiveDayBar(ticker.min),
    lastTrade,
    lastQuote,
    latestPrice: lastTrade?.price ?? day?.close ?? prevDay?.close ?? null,
    todaysChange,
    todaysChangePercent,
    volume: day?.volume ?? null,
  };
}

function normalizeMassiveIndicator(payload: unknown) {
  const record = asRecord(asRecord(payload).results || payload);
  const values = unwrapRows<Record<string, unknown>>(record, ["values"]).flatMap((item) => {
    const point = asRecord(item);
    const timestamp = timestampToSeconds(point.timestamp);
    const value = toNullableNumber(point.value);
    if (!timestamp || value == null) return [];
    return [{ time: timestamp, value }];
  });
  return {
    values,
    underlyingUrl: readString(record, ["underlying_url"]),
  };
}

function normalizeMassiveNews(payload: unknown) {
  return unwrapRows<Record<string, unknown>>(payload, ["results", "news", "data"]).flatMap((item) => {
    const record = asRecord(item);
    const publisher = readRecord(record, ["publisher"]);
    const title = readString(record, ["title"]);
    if (!title) return [];
    return [{
      title,
      summary: readString(record, ["description", "summary"]),
      source: readString(publisher, ["name"]) || readString(record, ["source"]),
      url: readString(record, ["article_url", "url"]),
      imageUrl: readString(record, ["image_url"]),
      tickers: Array.isArray(record.tickers) ? record.tickers.filter((item) => typeof item === "string") : [],
      publishedAt: readString(record, ["published_utc", "published_at"]),
    }];
  });
}

function emptySessions(): Record<SessionKey, SessionFeed | null> {
  return {
    regular: null,
    pre: null,
    post: null,
    overnight: null,
  };
}

function sessionFromTicker(ticker: string): SessionKey {
  if (ticker.endsWith(".PRE")) return "pre";
  if (ticker.endsWith(".POST")) return "post";
  if (ticker.endsWith(".ON")) return "overnight";
  return "regular";
}

function cleanCompanyName(description: string, fallback: string) {
  const head = description.split(" / ")[0]?.trim();
  return head?.replace(/\s+-\s+(PRE|POST|OVERNIGHT).*$/i, "").trim() || fallback;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function toDecimalPrice(raw: string, expo: number) {
  return Number(raw) * 10 ** expo;
}

function normalizeQuote(update: ParsedPriceUpdate): QuoteSnapshot {
  const price = toDecimalPrice(update.price.price, update.price.expo);
  const confidence = toDecimalPrice(update.price.conf, update.price.expo);
  return {
    price,
    confidence,
    confidencePercent: Number.isFinite(price) && price !== 0 ? (Math.abs(confidence) / Math.abs(price)) * 100 : null,
    expo: update.price.expo,
    publishTime: update.price.publish_time,
    ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - update.price.publish_time),
    emaPrice: update.ema_price ? toDecimalPrice(update.ema_price.price, update.ema_price.expo) : null,
    slot: update.metadata?.slot ?? null,
    proofAvailableTime: update.metadata?.proof_available_time ?? null,
  };
}

async function searchEquityFeeds(query: string) {
  const normalized = query.trim();
  if (!normalized) return [] as PythFeed[];
  const data = await fetchJson<PythFeed[]>(
    getHermesBase(),
    "/v2/price_feeds",
    { query: normalized, asset_type: "equity" },
    `stocks:feeds:${normalized.toUpperCase()}`,
    5 * 60_000,
  );
  return data.filter((feed) => (feed.attributes.asset_type || "").toLowerCase() === "equity");
}

function groupFeeds(feeds: PythFeed[]) {
  const groups = new Map<string, GroupedEquity>();
  for (const feed of feeds) {
    const symbol = normalizeSymbol(feed.attributes.base || feed.attributes.display_symbol?.split("/")[0] || "");
    if (!symbol) continue;
    const existing = groups.get(symbol) || {
      symbol,
      name: cleanCompanyName(feed.attributes.description || symbol, symbol),
      description: feed.attributes.description || `${symbol} / USD`,
      country: feed.attributes.country || null,
      sessions: emptySessions(),
    };
    const session = sessionFromTicker(feed.attributes.symbol);
    existing.sessions[session] = {
      session,
      feedId: feed.id,
      ticker: feed.attributes.symbol,
      description: feed.attributes.description || symbol,
      displaySymbol: feed.attributes.display_symbol || `${symbol}/USD`,
      schedule: feed.attributes.schedule || null,
      publishInterval: feed.attributes.publish_interval || null,
      country: feed.attributes.country || null,
      base: symbol,
      quoteCurrency: feed.attributes.quote_currency || null,
      quote: null,
    };
    groups.set(symbol, existing);
  }
  return Array.from(groups.values());
}

async function resolveEquity(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const groups = groupFeeds(await searchEquityFeeds(normalized));
  return groups.find((group) => group.symbol === normalized) || groups[0] || null;
}

async function getLatestQuotes(sessionFeeds: SessionFeed[]) {
  const ids = Array.from(new Set(sessionFeeds.map((feed) => feed.feedId)));
  if (ids.length === 0) return new Map<string, QuoteSnapshot>();
  const data = await fetchJson<HermesLatestResponse>(
    getHermesBase(),
    "/v2/updates/price/latest",
    { "ids[]": ids, parsed: "true" },
    `stocks:quotes:${ids.sort().join(",")}`,
    10_000,
  );
  const mapped = new Map<string, QuoteSnapshot>();
  for (const update of data.parsed || []) {
    mapped.set(update.id.replace(/^0x/, "").toLowerCase(), normalizeQuote(update));
  }
  return mapped;
}

function hydrateSessions(group: GroupedEquity, quotes: Map<string, QuoteSnapshot>) {
  return SESSION_ORDER.map((session) => {
    const feed = group.sessions[session];
    if (!feed) return null;
    const quote = quotes.get(feed.feedId.replace(/^0x/, "").toLowerCase()) || null;
    return { ...feed, quote };
  }).filter(Boolean) as SessionFeed[];
}

function pickActiveFeed(sessions: SessionFeed[]) {
  const withQuotes = sessions.filter((session) => session.quote);
  if (withQuotes.length === 0) {
    return sessions.find((session) => session.session === "regular") || sessions[0] || null;
  }
  return [...withQuotes].sort((left, right) => {
    const publishDiff = (right.quote?.publishTime || 0) - (left.quote?.publishTime || 0);
    if (publishDiff !== 0) return publishDiff;
    return SESSION_ORDER.indexOf(left.session) - SESSION_ORDER.indexOf(right.session);
  })[0];
}

function historyPointsFromResponse(raw: TradingViewHistoryResponse, trimTo: number) {
  if (raw.s !== "ok" || !raw.t || !raw.o || !raw.h || !raw.l || !raw.c) return [] as HistoryPoint[];
  const size = Math.min(raw.t.length, raw.o.length, raw.h.length, raw.l.length, raw.c.length);
  const points: HistoryPoint[] = [];
  for (let index = 0; index < size; index += 1) {
    points.push({
      time: raw.t[index],
      open: raw.o[index],
      high: raw.h[index],
      low: raw.l[index],
      close: raw.c[index],
    });
  }
  return points.slice(-trimTo);
}

async function getHistoryForTicker(ticker: string, range: RangeKey) {
  const config = RANGE_CONFIG[range];
  const now = Math.floor(Date.now() / 1000);
  const from = now - config.fetchLookbackDays * 86_400;
  const data = await fetchJson<TradingViewHistoryResponse>(
    BENCHMARKS_BASE,
    "/v1/shims/tradingview/history",
    {
      symbol: ticker,
      resolution: config.resolution,
      from,
      to: now,
    },
    `stocks:history:${ticker}:${range}`,
    60_000,
  );
  return {
    range,
    resolution: config.resolution,
    points: historyPointsFromResponse(data, config.trimTo),
  };
}

async function getBestHistory(sessions: SessionFeed[], active: SessionFeed | null, range: RangeKey) {
  const tried = new Set<string>();
  const tickers = [
    active?.ticker,
    sessions.find((session) => session.session === "regular")?.ticker,
    sessions[0]?.ticker,
  ].filter((ticker): ticker is string => Boolean(ticker && !tried.has(ticker) && tried.add(ticker)));

  for (const ticker of tickers) {
    const history = await getHistoryForTicker(ticker, range);
    if (history.points.length > 0) {
      return { ticker, ...history };
    }
  }

  return {
    ticker: active?.ticker || sessions[0]?.ticker || "",
    range,
    resolution: RANGE_CONFIG[range].resolution,
    points: [] as HistoryPoint[],
  };
}

function isoDateDaysAgo(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function getMassiveAggregates(symbol: string, range: RangeKey) {
  const config = MASSIVE_RANGE_CONFIG[range];
  const ticker = encodeURIComponent(normalizeSymbol(symbol));
  const payload = await fetchMassive<unknown>(
    `/v2/aggs/ticker/${ticker}/range/${config.multiplier}/${config.timespan}/${isoDateDaysAgo(config.lookbackDays)}/${todayIsoDate()}`,
    { adjusted: "true", sort: "asc", limit: config.limit },
    `aggs:${ticker}:${range}`,
    range === "1D" ? 30_000 : 2 * 60_000,
  );
  const normalized = normalizeMassiveAggregates(payload, range);
  return {
    ...normalized,
    multiplier: config.multiplier,
    timespan: config.timespan,
    points: normalized.points.slice(-config.trimTo),
  };
}

async function getMassiveIndicators(symbol: string, range: RangeKey) {
  const ticker = encodeURIComponent(normalizeSymbol(symbol));
  const limit = range === "1Y" ? 220 : range === "3M" ? 110 : 80;
  const params = {
    timespan: "day",
    adjusted: "true",
    series_type: "close",
    order: "asc",
    limit,
  };
  const [sma20, sma50, ema20, rsi14] = await Promise.all([
    optionalMassive("Massive SMA 20", () =>
      fetchMassive<unknown>(`/v1/indicators/sma/${ticker}`, { ...params, window: 20 }, `sma20:${ticker}:${limit}`, 5 * 60_000),
    ),
    optionalMassive("Massive SMA 50", () =>
      fetchMassive<unknown>(`/v1/indicators/sma/${ticker}`, { ...params, window: 50 }, `sma50:${ticker}:${limit}`, 5 * 60_000),
    ),
    optionalMassive("Massive EMA 20", () =>
      fetchMassive<unknown>(`/v1/indicators/ema/${ticker}`, { ...params, window: 20 }, `ema20:${ticker}:${limit}`, 5 * 60_000),
    ),
    optionalMassive("Massive RSI 14", () =>
      fetchMassive<unknown>(`/v1/indicators/rsi/${ticker}`, { ...params, window: 14 }, `rsi14:${ticker}:${limit}`, 5 * 60_000),
    ),
  ]);
  return {
    values: {
      sma20: sma20.ok ? normalizeMassiveIndicator(sma20.data).values : [],
      sma50: sma50.ok ? normalizeMassiveIndicator(sma50.data).values : [],
      ema20: ema20.ok ? normalizeMassiveIndicator(ema20.data).values : [],
      rsi14: rsi14.ok ? normalizeMassiveIndicator(rsi14.data).values : [],
    },
    accessIssues: [sma20, sma50, ema20, rsi14].flatMap((result) => (result.ok ? [] : [result.error])),
  };
}

async function searchMassiveTickers(query: string) {
  const normalized = normalizeSymbol(query);
  const payload = await fetchMassive<unknown>(
    "/v3/reference/tickers",
    {
      market: "stocks",
      locale: "us",
      active: "true",
      search: query,
      ticker: /^[A-Z.]{1,8}$/.test(normalized) ? normalized : undefined,
      order: "asc",
      sort: "ticker",
      limit: SEARCH_LIMIT,
    },
    `ticker-search:${normalized}`,
    5 * 60_000,
  );
  return normalizeMassiveTickerRows(payload);
}

async function getMassiveAsset(symbol: string, range: RangeKey, newsLimit = 6) {
  const normalized = normalizeSymbol(symbol);
  if (!getMassiveApiKey()) {
    return {
      configured: false,
      base: MASSIVE_BASE,
      docs: MASSIVE_DOCS,
      endpoints: MASSIVE_ENDPOINTS,
      tickerTypes: null,
      details: null,
      snapshot: null,
      lastTrade: null,
      aggregates: { ticker: normalized, range, adjusted: null, queryCount: null, resultsCount: null, multiplier: null, timespan: null, points: [] },
      indicators: { values: { sma20: [], sma50: [], ema20: [], rsi14: [] }, accessIssues: [] },
      news: [],
      accessIssues: ["MASSIVE_API_KEY is not configured."],
    };
  }

  const ticker = encodeURIComponent(normalized);
  const [tickerTypes, details, snapshot, lastTrade, aggregates, indicators, news] = await Promise.all([
    optionalMassive("Massive ticker types", () =>
      fetchMassive<unknown>("/v3/reference/tickers/types", { asset_class: "stocks", locale: "us" }, "ticker-types:stocks:us", 60 * 60_000),
    ),
    optionalMassive("Massive ticker overview", () =>
      fetchMassive<unknown>(`/v3/reference/tickers/${ticker}`, {}, `ticker-overview:${ticker}`, 30 * 60_000),
    ),
    optionalMassive("Massive ticker snapshot", () =>
      fetchMassive<unknown>(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, `snapshot:${ticker}`, 30_000),
    ),
    optionalMassive("Massive last trade", () =>
      fetchMassive<unknown>(`/v2/last/trade/${ticker}`, {}, `last-trade:${ticker}`, 30_000),
    ),
    optionalMassive("Massive aggregates", () => getMassiveAggregates(normalized, range)),
    optionalMassive("Massive indicators", () => getMassiveIndicators(normalized, range)),
    optionalMassive("Massive news", () =>
      fetchMassive<unknown>(
        "/v2/reference/news",
        { ticker: normalized, limit: newsLimit, order: "desc", sort: "published_utc" },
        `news:${ticker}:${newsLimit}`,
        2 * 60_000,
      ),
    ),
  ]);

  const rawLastTrade = lastTrade.ok
    ? asRecord(asRecord(lastTrade.data).results || asRecord(lastTrade.data).last || lastTrade.data)
    : {};
  const normalizedIndicators = indicators.ok
    ? indicators.data
    : { values: { sma20: [], sma50: [], ema20: [], rsi14: [] }, accessIssues: [indicators.error] };

  return {
    configured: true,
    base: MASSIVE_BASE,
    docs: MASSIVE_DOCS,
    endpoints: MASSIVE_ENDPOINTS,
    tickerTypes: tickerTypes.ok
      ? {
          count: toNullableNumber(asRecord(tickerTypes.data).count),
          results: unwrapRows<Record<string, unknown>>(tickerTypes.data, ["results"]).slice(0, 12).map((item) => ({
            code: readString(asRecord(item), ["code"]),
            description: readString(asRecord(item), ["description"]),
            assetClass: readString(asRecord(item), ["asset_class"]),
            locale: readString(asRecord(item), ["locale"]),
          })),
        }
      : null,
    details: details.ok ? normalizeMassiveTickerDetails(details.data) : null,
    snapshot: snapshot.ok ? normalizeMassiveSnapshot(snapshot.data) : null,
    lastTrade: lastTrade.ok ? normalizeMassiveTrade(rawLastTrade) : null,
    aggregates: aggregates.ok
      ? aggregates.data
      : { ticker: normalized, range, adjusted: null, queryCount: null, resultsCount: null, multiplier: null, timespan: null, points: [] },
    indicators: normalizedIndicators,
    news: news.ok ? normalizeMassiveNews(news.data) : [],
    accessIssues: [tickerTypes, details, snapshot, lastTrade, aggregates, news]
      .flatMap((result) => (result.ok ? [] : [result.error]))
      .concat(normalizedIndicators.accessIssues)
      .filter((issue, index, issues) => issue && issues.indexOf(issue) === index),
  };
}

function quoteFromMassive(massive: Awaited<ReturnType<typeof getMassiveAsset>>): QuoteSnapshot | null {
  const price = massive.snapshot?.latestPrice ?? massive.lastTrade?.price ?? massive.aggregates.points.at(-1)?.close ?? null;
  if (price == null) return null;
  const timestampIso = massive.snapshot?.lastTrade?.timestamp ?? massive.lastTrade?.timestamp ?? massive.snapshot?.updatedAt ?? null;
  const publishTime = timestampIso ? Math.floor(new Date(timestampIso).getTime() / 1000) : Math.floor(Date.now() / 1000);
  return {
    price,
    confidence: 0,
    confidencePercent: null,
    expo: -2,
    publishTime,
    ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - publishTime),
    emaPrice: massive.indicators.values.ema20.at(-1)?.value ?? null,
    slot: null,
    proofAvailableTime: null,
  };
}

async function getPythEquitySnapshot(symbol: string) {
  const group = await resolveEquity(symbol);
  if (!group) return null;
  const sessionFeeds = SESSION_ORDER.flatMap((session) => {
    const feed = group.sessions[session];
    return feed ? [feed] : [];
  });
  const quoteMap = await getLatestQuotes(sessionFeeds);
  const sessions = hydrateSessions(group, quoteMap);
  const active = pickActiveFeed(sessions);
  return {
    symbol: group.symbol,
    name: group.name,
    description: group.description,
    active: active
      ? {
          session: active.session,
          feedId: active.feedId,
          ticker: active.ticker,
          displaySymbol: active.displaySymbol,
          quote: active.quote,
        }
      : null,
    sessions: sessions.map((session) => ({
      session: session.session,
      feedId: session.feedId,
      ticker: session.ticker,
      displaySymbol: session.displaySymbol,
      quote: session.quote,
    })),
  };
}

function changePercent(points: HistoryPoint[]) {
  if (points.length < 2) return null;
  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first) return null;
  return ((last - first) / first) * 100;
}

function shortSparkline(points: HistoryPoint[]) {
  return points.slice(-24).map((point) => point.close);
}

function compactGroupPayload(group: GroupedEquity) {
  return {
    symbol: group.symbol,
    name: group.name,
    description: group.description,
    country: group.country,
    sessions: SESSION_ORDER.flatMap((session) => {
      const feed = group.sessions[session];
      if (!feed) return [];
      return [{
        session: feed.session,
        feedId: feed.feedId,
        ticker: feed.ticker,
        displaySymbol: feed.displaySymbol,
        schedule: feed.schedule,
      }];
    }),
  };
}

const featuredSchema = z.object({
  symbols: z.string().optional(),
});

const searchSchema = z.object({
  q: z.string().trim().min(1).max(40),
});

const assetSchema = z.object({
  symbol: z.string().trim().min(1).max(16),
  range: z.enum(["1D", "5D", "1M", "3M", "1Y"]).optional().default("1D"),
});

const financialDatasetsNewsSchema = z.object({
  ticker: z.string().trim().min(1).max(16).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional().default(10),
});

const financialDatasetsAssetSchema = z.object({
  ticker: z.string().trim().min(1).max(16),
  limit: z.coerce.number().int().min(1).max(10).optional().default(10),
});

const spacexIpoSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional().default(10),
});

router.get("/status", (_req, res) => {
  res.json({
    configured: true,
    apiKeyConfigured: Boolean(getPythApiKey()),
    usingAuthenticatedHermes: Boolean(getPythApiKey()),
    hermesBase: getHermesBase(),
    benchmarksBase: BENCHMARKS_BASE,
    upgradeCutoverDate: PYTH_UPGRADE_CUTOVER_DATE,
    featuredSymbols: FEATURED_SYMBOLS,
    spacexIpoSymbols: SPACEX_IPO_SYMBOLS,
    financialDatasets: financialDatasetsStatus(),
    massive: massiveStatus(),
  });
});

router.get("/fd/news", async (req, res) => {
  try {
    const { ticker, limit } = financialDatasetsNewsSchema.parse(req.query);
    const normalizedTicker = ticker ? normalizeSymbol(ticker) : undefined;

    if (!getFinancialDatasetsApiKey()) {
      return res.json({
        configured: false,
        ticker: normalizedTicker || null,
        limit,
        items: [],
        accessIssues: ["FINANCIAL_DATASETS_API_KEY is not configured."],
        source: FINANCIAL_DATASETS_DOCS.find((doc) => doc.label === "OpenAPI spec"),
      });
    }

    const payload = await optionalFinancialDatasets("news", () =>
      fetchFinancialDatasets<unknown>(
        "/news",
        { ticker: normalizedTicker, limit },
        `news:${normalizedTicker || "market"}:${limit}`,
        2 * 60_000,
      ),
    );
    res.json({
      configured: true,
      ticker: normalizedTicker || null,
      limit,
      items: payload.ok ? normalizeNewsPayload(payload.data) : [],
      accessIssues: payload.ok ? [] : [payload.error],
      source: FINANCIAL_DATASETS_DOCS.find((doc) => doc.label === "OpenAPI spec"),
    });
  } catch (error: any) {
    const status = error?.name === "ZodError" ? 400 : 502;
    res.status(status).json({ error: error?.message || "Failed to load Financial Datasets news" });
  }
});

router.get("/fd/asset/:ticker", async (req, res) => {
  try {
    const { ticker, limit } = financialDatasetsAssetSchema.parse({
      ticker: req.params.ticker,
      limit: req.query.limit,
    });
    const normalizedTicker = normalizeSymbol(ticker);

    if (!getFinancialDatasetsApiKey()) {
      return res.json({
        configured: false,
        ticker: normalizedTicker,
        facts: null,
        metrics: null,
        price: null,
        filings: [],
        news: [],
        accessIssues: ["FINANCIAL_DATASETS_API_KEY is not configured."],
        sources: FINANCIAL_DATASETS_DOCS,
      });
    }

    const [facts, metrics, price, filings, news] = await Promise.all([
      optionalFinancialDatasets("company facts", () =>
        fetchFinancialDatasets<unknown>(
          "/company/facts",
          { ticker: normalizedTicker },
          `facts:${normalizedTicker}`,
          30 * 60_000,
        ),
      ),
      optionalFinancialDatasets("financial metrics", () =>
        fetchFinancialDatasets<unknown>(
          "/financial-metrics/snapshot",
          { ticker: normalizedTicker },
          `metrics-snapshot:${normalizedTicker}`,
          15 * 60_000,
        ),
      ),
      optionalFinancialDatasets("price snapshot", () =>
        fetchFinancialDatasets<unknown>(
          "/prices/snapshot",
          { ticker: normalizedTicker },
          `price-snapshot:${normalizedTicker}`,
          60_000,
        ),
      ),
      optionalFinancialDatasets("SEC filings", () =>
        fetchFinancialDatasets<unknown>(
          "/filings",
          { ticker: normalizedTicker, limit },
          `filings:${normalizedTicker}:${limit}`,
          10 * 60_000,
        ),
      ),
      optionalFinancialDatasets("company news", () =>
        fetchFinancialDatasets<unknown>(
          "/news",
          { ticker: normalizedTicker, limit },
          `news:${normalizedTicker}:${limit}`,
          2 * 60_000,
        ),
      ),
    ]);

    res.json({
      configured: true,
      ticker: normalizedTicker,
      facts: facts.ok ? summarizeFactsPayload(facts.data) : null,
      metrics: metrics.ok ? summarizeMetricsPayload(metrics.data) : null,
      price: price.ok ? normalizePriceSnapshotPayload(price.data) : null,
      filings: filings.ok ? normalizeFilingsPayload(filings.data) : [],
      news: news.ok ? normalizeNewsPayload(news.data) : [],
      accessIssues: [facts, metrics, price, filings, news].flatMap((result) => (result.ok ? [] : [result.error])),
      sources: FINANCIAL_DATASETS_DOCS,
    });
  } catch (error: any) {
    const status = error?.name === "ZodError" ? 400 : 502;
    res.status(status).json({ error: error?.message || "Failed to load Financial Datasets asset" });
  }
});

router.get("/ipo/spacex", async (req, res) => {
  try {
    const { limit } = spacexIpoSchema.parse(req.query);
    const primaryTicker = SPACEX_IPO_SYMBOLS[0];
    const financialDatasetsConfigured = Boolean(getFinancialDatasetsApiKey());

    const [pythCandidate, marketNews, spacexNews, facts, metrics, filings] = await Promise.all([
      optionalFinancialDatasets("Pyth SPCX feed", () => getPythEquitySnapshot(primaryTicker)),
      financialDatasetsConfigured
        ? optionalFinancialDatasets("market news", () =>
            fetchFinancialDatasets<unknown>("/news", { limit }, `news:market:${limit}`, 2 * 60_000),
          )
        : Promise.resolve({ ok: false as const, error: "FINANCIAL_DATASETS_API_KEY is not configured." }),
      financialDatasetsConfigured
        ? optionalFinancialDatasets("SpaceX ticker news", () =>
            fetchFinancialDatasets<unknown>("/news", { ticker: primaryTicker, limit }, `news:${primaryTicker}:${limit}`, 2 * 60_000),
          )
        : Promise.resolve({ ok: false as const, error: "FINANCIAL_DATASETS_API_KEY is not configured." }),
      financialDatasetsConfigured
        ? optionalFinancialDatasets("SpaceX company facts", () =>
            fetchFinancialDatasets<unknown>("/company/facts", { ticker: primaryTicker }, `facts:${primaryTicker}`, 30 * 60_000),
          )
        : Promise.resolve({ ok: false as const, error: "FINANCIAL_DATASETS_API_KEY is not configured." }),
      financialDatasetsConfigured
        ? optionalFinancialDatasets("SpaceX financial metrics", () =>
            fetchFinancialDatasets<unknown>(
              "/financial-metrics/snapshot",
              { ticker: primaryTicker },
              `metrics-snapshot:${primaryTicker}`,
              15 * 60_000,
            ),
          )
        : Promise.resolve({ ok: false as const, error: "FINANCIAL_DATASETS_API_KEY is not configured." }),
      financialDatasetsConfigured
        ? optionalFinancialDatasets("SpaceX SEC filings", () =>
            fetchFinancialDatasets<unknown>("/filings", { ticker: primaryTicker, limit }, `filings:${primaryTicker}:${limit}`, 10 * 60_000),
          )
        : Promise.resolve({ ok: false as const, error: "FINANCIAL_DATASETS_API_KEY is not configured." }),
    ]);

    const comparableSnapshots = financialDatasetsConfigured
      ? await Promise.all(
          SPACEX_COMPARABLES.map(async (comparable) => {
            const snapshot = await optionalFinancialDatasets(`${comparable.symbol} price snapshot`, () =>
              fetchFinancialDatasets<unknown>(
                "/prices/snapshot",
                { ticker: comparable.symbol },
                `price-snapshot:${comparable.symbol}`,
                60_000,
              ),
            );
            return {
              ...comparable,
              price: snapshot.ok ? normalizePriceSnapshotPayload(snapshot.data) : null,
              issue: snapshot.ok ? null : snapshot.error,
            };
          }),
        )
      : SPACEX_COMPARABLES.map((comparable) => ({ ...comparable, price: null, issue: null }));

    const pythSnapshot = pythCandidate.ok ? pythCandidate.data : null;
    const normalizedFilings = filings.ok ? normalizeFilingsPayload(filings.data) : [];
    const companyNews = spacexNews.ok ? normalizeNewsPayload(spacexNews.data) : [];
    const marketNewsItems = marketNews.ok ? normalizeNewsPayload(marketNews.data) : [];
    const issues = [
      pythCandidate.ok ? null : pythCandidate.error,
      marketNews.ok ? null : marketNews.error,
      spacexNews.ok ? null : spacexNews.error,
      facts.ok ? null : facts.error,
      metrics.ok ? null : metrics.error,
      filings.ok ? null : filings.error,
    ].filter((issue): issue is string => Boolean(issue));
    const financialDatasetsAuthIssue = issues.some((issue) => /401|403|invalid api key|unauthorized/i.test(issue));

    res.json({
      updatedAt: new Date().toISOString(),
      company: {
        name: "Space Exploration Technologies Corp.",
        commonName: "SpaceX",
        watchSymbols: SPACEX_IPO_SYMBOLS,
        primaryWatchSymbol: primaryTicker,
        statusNote:
          "IPO watch mode treats SPCX as the primary watch symbol and activates live modules as Pyth and Financial Datasets coverage appears.",
      },
      pyth: {
        configured: true,
        candidate: pythSnapshot,
      },
      financialDatasets: financialDatasetsStatus(),
      facts: facts.ok ? summarizeFactsPayload(facts.data) : null,
      metrics: metrics.ok ? summarizeMetricsPayload(metrics.data) : null,
      filings: normalizedFilings,
      news: {
        limit,
        company: companyNews,
        market: marketNewsItems,
      },
      comparables: comparableSnapshots,
      readiness: [
        {
          key: "market-feed",
          label: "Live quote feed",
          status: pythSnapshot?.active?.quote ? "live" : "watching",
          detail: pythSnapshot?.active?.quote
            ? "Pyth returned an active SPCX equity quote."
            : "The desk keeps SPCX on watch and will show a quote as soon as Pyth coverage resolves.",
        },
        {
          key: "financial-datasets",
          label: "Fundamentals and news provider",
          status: financialDatasetsAuthIssue || !financialDatasetsConfigured ? "configure" : "ready",
          detail: financialDatasetsAuthIssue
            ? "A Financial Datasets key is configured, but the provider rejected it. Update FINANCIAL_DATASETS_API_KEY to enable live SEC, facts, metrics, prices, and news."
            : financialDatasetsConfigured
            ? "Financial Datasets API key is configured for SEC filings, facts, metrics, prices, and news."
            : "Set FINANCIAL_DATASETS_API_KEY to enable SEC filings, company facts, metrics, price snapshots, and market news.",
        },
        {
          key: "sec-filings",
          label: "SEC filing monitor",
          status: normalizedFilings.length > 0 ? "live" : "watching",
          detail: normalizedFilings.length > 0
            ? `${normalizedFilings.length} filing records returned for ${primaryTicker}.`
            : "The monitor is ready for S-1, 424B, 8-K, 10-Q, and 10-K coverage once records are available.",
        },
        {
          key: "market-news",
          label: "Market news limit",
          status: marketNewsItems.length > 0 || companyNews.length > 0 ? "live" : "watching",
          detail: `News requests use the Financial Datasets /news endpoint with limit=${limit}.`,
        },
      ],
      accessIssues: Array.from(new Set(issues)),
      sources: FINANCIAL_DATASETS_DOCS,
    });
  } catch (error: any) {
    const status = error?.name === "ZodError" ? 400 : 502;
    res.status(status).json({ error: error?.message || "Failed to load SpaceX IPO watch" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q } = searchSchema.parse(req.query);
    const [pythResult, massiveResult] = await Promise.all([
      optionalMassive("Pyth equity feed search", () => searchEquityFeeds(q)),
      optionalMassive("Massive ticker search", () => searchMassiveTickers(q)),
    ]);
    const grouped = pythResult.ok ? groupFeeds(pythResult.data) : [];
    const massiveItems = massiveResult.ok ? massiveResult.data : [];
    const normalized = normalizeSymbol(q);
    const sorted = grouped.sort((left, right) => {
      const leftExact = left.symbol === normalized ? 1 : 0;
      const rightExact = right.symbol === normalized ? 1 : 0;
      if (leftExact !== rightExact) return rightExact - leftExact;
      const leftStarts = left.symbol.startsWith(normalized) ? 1 : 0;
      const rightStarts = right.symbol.startsWith(normalized) ? 1 : 0;
      if (leftStarts !== rightStarts) return rightStarts - leftStarts;
      return left.symbol.localeCompare(right.symbol);
    });
    const items = [...sorted.map(compactGroupPayload)];
    const seen = new Set(items.map((item) => item.symbol));
    for (const item of massiveItems) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      items.push(item);
    }
    res.json({
      query: q,
      items: items.slice(0, SEARCH_LIMIT),
      providers: {
        pyth: { ok: pythResult.ok, issue: pythResult.ok ? null : pythResult.error },
        massive: { ok: massiveResult.ok, configured: Boolean(getMassiveApiKey()), issue: massiveResult.ok ? null : massiveResult.error },
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Invalid search" });
  }
});

router.get("/featured", async (req, res) => {
  try {
    const { symbols } = featuredSchema.parse(req.query);
    const requested = Array.from(
      new Set(
        (symbols || FEATURED_SYMBOLS.join(","))
          .split(",")
          .map((value) => normalizeSymbol(value))
          .filter(Boolean),
      ),
    ).slice(0, 12);

    const settledGroups = await Promise.allSettled(requested.map((symbol) => resolveEquity(symbol)));
    const groups = settledGroups
      .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));

    const quoteResult = await optionalMassive("Pyth featured quotes", () =>
      getLatestQuotes(
        groups.flatMap((group) =>
          SESSION_ORDER.flatMap((session) => {
            const feed = group.sessions[session];
            return feed ? [feed] : [];
          }),
        ),
      ),
    );
    const quoteMap = quoteResult.ok ? quoteResult.data : new Map<string, QuoteSnapshot>();

    const items = [];
    for (const group of groups) {
      const sessions = hydrateSessions(group, quoteMap);
      const active = pickActiveFeed(sessions);
      const historyResult = await optionalMassive(`${group.symbol} Pyth featured history`, () => getBestHistory(sessions, active, "5D"));
      const history = historyResult.ok
        ? historyResult.data
        : {
            ticker: active?.ticker || sessions[0]?.ticker || "",
            range: "5D" as const,
            resolution: RANGE_CONFIG["5D"].resolution,
            points: [] as HistoryPoint[],
          };
      items.push({
        symbol: group.symbol,
        name: group.name,
        description: group.description,
        country: group.country,
        active: active
          ? {
              session: active.session,
              feedId: active.feedId,
              ticker: active.ticker,
              displaySymbol: active.displaySymbol,
              quote: active.quote,
            }
          : null,
        changePercent: changePercent(history.points),
        sparkline: shortSparkline(history.points),
        sessions: sessions.map((session) => ({
          session: session.session,
          feedId: session.feedId,
          ticker: session.ticker,
          displaySymbol: session.displaySymbol,
          schedule: session.schedule,
          quote: session.quote,
        })),
        providerIssues: [
          quoteResult.ok ? null : quoteResult.error,
          historyResult.ok ? null : historyResult.error,
        ].filter(Boolean),
      });
    }

    res.json({
      updatedAt: new Date().toISOString(),
      items,
      providerIssues: {
        pyth: quoteResult.ok ? [] : [quoteResult.error],
      },
    });
  } catch (error: any) {
    res.status(502).json({ error: error?.message || "Failed to load featured stocks" });
  }
});

router.get("/massive/:symbol", async (req, res) => {
  try {
    const { symbol, range } = assetSchema.parse({
      symbol: req.params.symbol,
      range: req.query.range,
    });
    const massive = await getMassiveAsset(symbol, range);
    res.json({
      symbol: normalizeSymbol(symbol),
      range,
      massive,
    });
  } catch (error: any) {
    const status = error?.name === "ZodError" ? 400 : 502;
    res.status(status).json({ error: error?.message || "Failed to load Massive stock data" });
  }
});

router.get("/asset/:symbol", async (req, res) => {
  try {
    const { symbol, range } = assetSchema.parse({
      symbol: req.params.symbol,
      range: req.query.range,
    });
    const normalizedSymbol = normalizeSymbol(symbol);
    const [groupResult, massiveResult] = await Promise.all([
      optionalMassive("Pyth equity", () => resolveEquity(normalizedSymbol)),
      optionalMassive("Massive stock asset", () => getMassiveAsset(normalizedSymbol, range)),
    ]);
    const group = groupResult.ok ? groupResult.data : null;
    const massive = massiveResult.ok
      ? massiveResult.data
      : {
          configured: Boolean(getMassiveApiKey()),
          base: MASSIVE_BASE,
          docs: MASSIVE_DOCS,
          endpoints: MASSIVE_ENDPOINTS,
          tickerTypes: null,
          details: null,
          snapshot: null,
          lastTrade: null,
          aggregates: { ticker: normalizedSymbol, range, adjusted: null, queryCount: null, resultsCount: null, multiplier: null, timespan: null, points: [] },
          indicators: { values: { sma20: [], sma50: [], ema20: [], rsi14: [] }, accessIssues: [] },
          news: [],
          accessIssues: [massiveResult.error],
        };

    if (!group && !massive.details && !massive.snapshot && massive.aggregates.points.length === 0) {
      return res.status(404).json({
        error: `No stock data found for ${normalizedSymbol}`,
        providers: {
          pyth: { ok: groupResult.ok, issue: groupResult.ok ? "No matching equity feed" : groupResult.error },
          massive: { configured: Boolean(getMassiveApiKey()), issues: massive.accessIssues },
        },
      });
    }

    if (!group) {
      const quote = quoteFromMassive(massive);
      const active = quote
        ? {
            session: "regular" as const,
            feedId: `massive:${normalizedSymbol}`,
            ticker: normalizedSymbol,
            displaySymbol: `${normalizedSymbol}/USD`,
            quote,
          }
        : null;
      const history = {
        ticker: massive.aggregates.ticker || normalizedSymbol,
        range,
        resolution: `${massive.aggregates.multiplier || 1}${massive.aggregates.timespan || "day"}`,
        points: massive.aggregates.points,
        source: "massive",
      };
      return res.json({
        symbol: normalizedSymbol,
        name: massive.details?.name || normalizedSymbol,
        description: massive.details?.description || massive.details?.sicDescription || `${normalizedSymbol} stock`,
        country: massive.details?.locale || null,
        active,
        history,
        changePercent: massive.snapshot?.todaysChangePercent ?? changePercent(massive.aggregates.points),
        sessions: active ? [active] : [],
        providerIssues: {
          pyth: groupResult.ok ? ["No Pyth equity feed found."] : [groupResult.error],
          massive: massive.accessIssues,
        },
        massive,
      });
    }

    const sessionFeeds = SESSION_ORDER.flatMap((session) => {
      const feed = group.sessions[session];
      return feed ? [feed] : [];
    });
    const quoteResult = await optionalMassive("Pyth latest quotes", () => getLatestQuotes(sessionFeeds));
    const quoteMap = quoteResult.ok ? quoteResult.data : new Map<string, QuoteSnapshot>();
    const sessions = hydrateSessions(group, quoteMap);
    const active = pickActiveFeed(sessions);
    const historyResult = await optionalMassive("Pyth benchmark history", () => getBestHistory(sessions, active, range));
    const pythHistory = historyResult.ok
      ? historyResult.data
      : {
          ticker: active?.ticker || sessions[0]?.ticker || "",
          range,
          resolution: RANGE_CONFIG[range].resolution,
          points: [] as HistoryPoint[],
        };
    const useMassiveHistory = pythHistory.points.length === 0 && massive.aggregates.points.length > 0;
    const history = useMassiveHistory
      ? {
          ticker: massive.aggregates.ticker || normalizedSymbol,
          range,
          resolution: `${massive.aggregates.multiplier || 1}${massive.aggregates.timespan || "day"}`,
          points: massive.aggregates.points,
          source: "massive",
        }
      : { ...pythHistory, source: "pyth" };

    res.json({
      symbol: group.symbol,
      name: massive.details?.name || group.name,
      description: massive.details?.description || group.description,
      country: group.country,
      active: active
        ? {
            session: active.session,
            feedId: active.feedId,
            ticker: active.ticker,
            displaySymbol: active.displaySymbol,
            quote: active.quote,
        }
        : null,
      history,
      changePercent: massive.snapshot?.todaysChangePercent ?? changePercent(history.points),
      sessions: sessions.map((session) => ({
        session: session.session,
        feedId: session.feedId,
        ticker: session.ticker,
        description: session.description,
        displaySymbol: session.displaySymbol,
        schedule: session.schedule,
        publishInterval: session.publishInterval,
        quote: session.quote,
      })),
      providerIssues: {
        pyth: [
          groupResult.ok ? null : groupResult.error,
          quoteResult.ok ? null : quoteResult.error,
          historyResult.ok ? null : historyResult.error,
        ].filter((issue): issue is string => Boolean(issue)),
        massive: massive.accessIssues,
      },
      massive,
    });
  } catch (error: any) {
    const status = error?.name === "ZodError" ? 400 : 502;
    res.status(status).json({ error: error?.message || "Failed to load stock" });
  }
});

export default router;
