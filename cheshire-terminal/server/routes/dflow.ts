// @ts-nocheck
import { randomUUID } from "crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { redis } from "../redis";
import { qstash, qstashConfigured, verifyQstashRequest } from "../qstash";
import { relayDflowOrderbook, relayDflowTrades } from "../lib/discord/trading-relay";

// DFlow Prediction Markets — quote API + prediction markets API.
// All requests pass through the server proxy so DFLOW_API_KEY stays server-side.
const QUOTE_BASE = (process.env.DFLOW_QUOTE_API_BASE || "https://d.quote-api.dflow.net").replace(/\/$/, "");
const PREDICTION_BASE = (process.env.DFLOW_PREDICTION_MARKETS_API_BASE || "https://d.prediction-markets-api.dflow.net").replace(/\/$/, "");
const HEADERS = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(process.env.DFLOW_API_KEY ? { "x-api-key": process.env.DFLOW_API_KEY } : {}),
  ...extra,
});

const router = Router();

type ForwardResult = {
  ok: boolean;
  status: number;
  data: any;
  stale?: boolean;
};

type CacheEntry = {
  status: number;
  data: any;
  expiresAt: number;
  staleUntil: number;
};

type StreamChannel = "orderbook" | "trades";

type StreamClient = {
  id: string;
  res: Response;
  tickers: Set<string>;
  channels: Set<StreamChannel>;
};

type MarketFanout = {
  ticker: string;
  channels: Set<StreamChannel>;
  orderbookTimer?: NodeJS.Timeout;
  tradesTimer?: NodeJS.Timeout;
  lastOrderbookHash?: string;
  lastTradesHash?: string;
};

type RateLimitRule = {
  key: string;
  max: number;
  windowSec: number;
};

type CounterState = {
  count: number;
  expiresAt: number;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.DFLOW_TIMEOUT_MS ?? 8000);
const MAX_LIMIT = Number(process.env.DFLOW_MAX_LIMIT ?? 100);
const HAS_REDIS = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const SHARED_CACHE_PREFIX = "dflow:cache:";
const RATE_LIMIT_PREFIX = "dflow:ratelimit:";
const STREAM_HEARTBEAT_MS = Number(process.env.DFLOW_STREAM_HEARTBEAT_MS ?? 20_000);
const STREAM_ORDERBOOK_POLL_MS = Number(process.env.DFLOW_STREAM_ORDERBOOK_POLL_MS ?? 2_500);
const STREAM_TRADES_POLL_MS = Number(process.env.DFLOW_STREAM_TRADES_POLL_MS ?? 4_000);
const STREAM_TRADE_LIMIT = Number(process.env.DFLOW_STREAM_TRADE_LIMIT ?? 25);
const STREAM_ORDERBOOK_DEPTH = Number(process.env.DFLOW_STREAM_ORDERBOOK_DEPTH ?? 20);
const DFlow_QSTASH_WARM_DELAY_SEC = Number(process.env.DFLOW_QSTASH_WARM_DELAY_SEC ?? 30);
const DFlow_QSTASH_DEDUPE_SEC = Number(process.env.DFLOW_QSTASH_DEDUPE_SEC ?? 20);

const responseCache = new Map<string, CacheEntry>();
const inflightGets = new Map<string, Promise<ForwardResult>>();
const localRateCounters = new Map<string, CounterState>();
const streamClients = new Map<string, StreamClient>();
const marketFanouts = new Map<string, MarketFanout>();

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function ttlForPath(path: string) {
  if (path === "/priority-fees") return { ttlMs: 20_000, staleMs: 120_000 };
  if (path === "/status") return { ttlMs: 30_000, staleMs: 120_000 };
  if (path.includes("/orderbook") || path.includes("/trades") || path.includes("/live_data")) {
    return { ttlMs: 5_000, staleMs: 20_000 };
  }
  if (path.includes("/events") || path.includes("/markets") || path.includes("/search")) {
    return { ttlMs: 15_000, staleMs: 60_000 };
  }
  if (path.includes("/candlesticks")) return { ttlMs: 30_000, staleMs: 120_000 };
  if (path.includes("/tags_by_categories") || path.includes("/filters_by_sports")) {
    return { ttlMs: 300_000, staleMs: 1_800_000 };
  }
  if (path === "/tokens" || path === "/tokens-with-decimals" || path === "/venues") {
    return { ttlMs: 300_000, staleMs: 1_800_000 };
  }
  return { ttlMs: 15_000, staleMs: 60_000 };
}

function buildCacheKey(base: string, path: string, params?: URLSearchParams) {
  return `${base}${path}${params && params.toString() ? `?${params.toString()}` : ""}`;
}

function getFreshCache(key: string) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}

function getStaleCache(key: string) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.staleUntil <= Date.now()) return null;
  return entry;
}

function setLocalCache(key: string, status: number, data: any, ttlMs: number, staleMs: number) {
  const now = Date.now();
  responseCache.set(key, {
    status,
    data,
    expiresAt: now + ttlMs,
    staleUntil: now + staleMs,
  });
}

function setSharedCacheHeaders(res: Response, ttlMs: number, staleMs: number, stale = false) {
  const maxAge = Math.max(1, Math.floor(ttlMs / 1000));
  const staleWhileRevalidate = Math.max(1, Math.floor(staleMs / 1000));
  res.setHeader("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
  if (stale) res.setHeader("X-Cache-Stale", "1");
}

async function getSharedCache(key: string) {
  if (!HAS_REDIS) return null;
  try {
    const entry = await redis.get<CacheEntry>(`${SHARED_CACHE_PREFIX}${key}`);
    if (!entry) return null;
    if (entry.staleUntil <= Date.now()) return null;
    return entry;
  } catch (error: any) {
    console.warn("[dflow] shared cache read failed:", error?.message || error);
    return null;
  }
}

async function setSharedCache(key: string, entry: CacheEntry) {
  if (!HAS_REDIS) return;
  try {
    const ttlSec = Math.max(1, Math.ceil((entry.staleUntil - Date.now()) / 1000));
    await redis.set(`${SHARED_CACHE_PREFIX}${key}`, entry, { ex: ttlSec });
  } catch (error: any) {
    console.warn("[dflow] shared cache write failed:", error?.message || error);
  }
}

async function claimWarmJob(key: string) {
  if (!HAS_REDIS) return true;
  try {
    const result = await redis.set(`dflow:qstash:warm:${key}`, "1", {
      ex: DFlow_QSTASH_DEDUPE_SEC,
      nx: true,
    } as any);
    return result === "OK" || result === true;
  } catch (error: any) {
    console.warn("[dflow] warm dedupe failed:", error?.message || error);
    return true;
  }
}

async function forwardGet(base: string, path: string, params?: URLSearchParams): Promise<ForwardResult> {
  const key = buildCacheKey(base, path, params);
  const fresh = getFreshCache(key);
  if (fresh) {
    return { ok: fresh.status >= 200 && fresh.status < 300, status: fresh.status, data: fresh.data };
  }

  const shared = await getSharedCache(key);
  if (shared && shared.expiresAt > Date.now()) {
    responseCache.set(key, shared);
    return { ok: shared.status >= 200 && shared.status < 300, status: shared.status, data: shared.data };
  }

  const existing = inflightGets.get(key);
  if (existing) return existing;

  const { ttlMs, staleMs } = ttlForPath(path);
  const work = (async (): Promise<ForwardResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const url = params && params.toString() ? `${base}${path}?${params}` : `${base}${path}`;
      const r = await fetch(url, { headers: HEADERS(), signal: controller.signal });
      const text = await r.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (r.ok) {
        const entry: CacheEntry = {
          status: r.status,
          data,
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + staleMs,
        };
        responseCache.set(key, entry);
        void setSharedCache(key, entry);
      }

      return { ok: r.ok, status: r.status, data };
    } catch (error: any) {
      const stale = getStaleCache(key) ?? await getSharedCache(key);
      if (stale) {
        responseCache.set(key, stale);
        return {
          ok: true,
          status: stale.status,
          data: stale.data,
          stale: true,
        };
      }
      if (error?.name === "AbortError") {
        return { ok: false, status: 504, data: { error: "DFlow upstream timeout" } };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      inflightGets.delete(key);
    }
  })();

  inflightGets.set(key, work);
  return work;
}

async function forwardJson(base: string, method: "POST" | "DELETE", path: string, body?: unknown) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: HEADERS({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

function copyParams(src: any, keys: string[]): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of keys) {
    const v = src?.[k];
    if (v == null || v === "") continue;
    if (k === "limit") {
      p.set(k, String(clampInt(v, 50, 1, MAX_LIMIT)));
      continue;
    }
    if (k === "page" || k === "cursor") {
      p.set(k, String(clampInt(v, k === "page" ? 1 : 0, 0, 10_000)));
      continue;
    }
    p.set(k, String(v));
  }
  return p;
}

function getClientIp(req: Request) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0]!.trim();
  if (Array.isArray(xff) && xff[0]) return xff[0];
  return req.ip || "unknown";
}

function getWalletKey(req: Request) {
  const headerWallet = req.headers["x-wallet-address"];
  const queryWallet = req.query.walletAddress ?? req.query.wallet_address ?? req.query.wallet ?? req.query.owner ?? req.query.ownerPubkey;
  const wallet = typeof headerWallet === "string" && headerWallet
    ? headerWallet
    : typeof queryWallet === "string" && queryWallet
      ? queryWallet
      : null;
  return wallet?.trim() || null;
}

async function incrementCounter(key: string, windowSec: number) {
  const expiresAt = Date.now() + (windowSec * 1000);

  if (HAS_REDIS) {
    try {
      const redisKey = `${RATE_LIMIT_PREFIX}${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSec);
      return { count, expiresAt };
    } catch (error: any) {
      console.warn("[dflow] rate counter redis failure:", error?.message || error);
    }
  }

  const current = localRateCounters.get(key);
  if (!current || current.expiresAt <= Date.now()) {
    const next = { count: 1, expiresAt };
    localRateCounters.set(key, next);
    return next;
  }
  current.count += 1;
  return current;
}

async function enforceRateLimits(req: Request, res: Response, rules: RateLimitRule[]) {
  let mostConstrained: { remaining: number; limit: number; retryAfter: number } | null = null;

  for (const rule of rules) {
    const result = await incrementCounter(rule.key, rule.windowSec);
    const remaining = Math.max(0, rule.max - result.count);
    const retryAfter = Math.max(1, Math.ceil((result.expiresAt - Date.now()) / 1000));

    if (!mostConstrained || remaining < mostConstrained.remaining) {
      mostConstrained = { remaining, limit: rule.max, retryAfter };
    }

    if (result.count > rule.max) {
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(rule.max));
      res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(429).json({
        error: "Too many DFlow requests",
        scope: rule.key.includes(":wallet:") ? "wallet" : "ip",
        retryAfter,
      });
    }
  }

  if (mostConstrained) {
    res.setHeader("X-RateLimit-Limit", String(mostConstrained.limit));
    res.setHeader("X-RateLimit-Remaining", String(mostConstrained.remaining));
  }

  return null;
}

async function applyRouteQuota(req: Request, res: Response) {
  const ip = getClientIp(req);
  const wallet = getWalletKey(req);
  const path = req.path;
  const isStream = path === "/stream";
  const isBootstrap = path === "/bootstrap";
  const isSearch = path === "/search";
  const isHotRoute = isStream || isBootstrap || path.includes("/orderbook") || path.includes("/trades") || path.includes("/live-data");

  const rules: RateLimitRule[] = [];

  if (isStream) {
    rules.push({ key: `ip:${ip}:stream:min`, max: 20, windowSec: 60 });
  } else if (isBootstrap) {
    rules.push({ key: `ip:${ip}:bootstrap:min`, max: 60, windowSec: 60 });
  } else if (isSearch) {
    rules.push({ key: `ip:${ip}:search:min`, max: 90, windowSec: 60 });
  } else if (isHotRoute) {
    rules.push({ key: `ip:${ip}:hot:min`, max: 120, windowSec: 60 });
  } else {
    rules.push({ key: `ip:${ip}:general:min`, max: 180, windowSec: 60 });
  }

  if (wallet) {
    if (isStream) {
      rules.push({ key: `wallet:${wallet}:stream:min`, max: 10, windowSec: 60 });
      rules.push({ key: `wallet:${wallet}:stream:day`, max: 500, windowSec: 86_400 });
    } else if (isBootstrap) {
      rules.push({ key: `wallet:${wallet}:bootstrap:min`, max: 30, windowSec: 60 });
      rules.push({ key: `wallet:${wallet}:bootstrap:day`, max: 1_200, windowSec: 86_400 });
    } else if (isHotRoute) {
      rules.push({ key: `wallet:${wallet}:hot:min`, max: 75, windowSec: 60 });
      rules.push({ key: `wallet:${wallet}:hot:day`, max: 2_000, windowSec: 86_400 });
    } else {
      rules.push({ key: `wallet:${wallet}:general:min`, max: 90, windowSec: 60 });
      rules.push({ key: `wallet:${wallet}:general:day`, max: 3_000, windowSec: 86_400 });
    }
  }

  return enforceRateLimits(req, res, rules);
}

function sanitizeTickerList(value: unknown) {
  const tickers = String(value ?? "")
    .split(",")
    .map((ticker) => ticker.trim())
    .filter(Boolean)
    .slice(0, 8);

  return Array.from(new Set(tickers));
}

function normalizeChannels(value: unknown) {
  const raw = String(value ?? "orderbook,trades")
    .split(",")
    .map((channel) => channel.trim().toLowerCase())
    .filter(Boolean);

  const channels = new Set<StreamChannel>();
  for (const channel of raw) {
    if (channel === "orderbook" || channel === "trades") channels.add(channel);
  }
  if (!channels.size) {
    channels.add("orderbook");
    channels.add("trades");
  }
  return channels;
}

function sseSend(res: Response, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseComment(res: Response, comment: string) {
  res.write(`: ${comment}\n\n`);
}

function getInterestedClients(ticker: string, channel: StreamChannel) {
  return Array.from(streamClients.values()).filter((client) =>
    client.tickers.has(ticker) && client.channels.has(channel),
  );
}

function cleanupFanout(ticker: string) {
  const interest = Array.from(streamClients.values()).some((client) => client.tickers.has(ticker));
  if (interest) return;
  const fanout = marketFanouts.get(ticker);
  if (!fanout) return;
  if (fanout.orderbookTimer) clearInterval(fanout.orderbookTimer);
  if (fanout.tradesTimer) clearInterval(fanout.tradesTimer);
  marketFanouts.delete(ticker);
}

async function publishOrderbook(ticker: string) {
  const fanout = marketFanouts.get(ticker);
  if (!fanout || !fanout.channels.has("orderbook")) return;
  const clients = getInterestedClients(ticker, "orderbook");
  if (!clients.length) return cleanupFanout(ticker);

  const params = new URLSearchParams({ limit: String(STREAM_ORDERBOOK_DEPTH) });
  const result = await forwardGet(PREDICTION_BASE, `/api/v1/orderbook/${encodeURIComponent(ticker)}`, params);
  if (!result.ok) return;

  const nextHash = JSON.stringify(result.data);
  if (fanout.lastOrderbookHash === nextHash) return;
  fanout.lastOrderbookHash = nextHash;
  relayDflowOrderbook(ticker, result.data, Boolean(result.stale));

  for (const client of clients) {
    sseSend(client.res, "orderbook", {
      ticker,
      stale: Boolean(result.stale),
      payload: result.data,
      ts: new Date().toISOString(),
    });
  }
}

async function publishTrades(ticker: string) {
  const fanout = marketFanouts.get(ticker);
  if (!fanout || !fanout.channels.has("trades")) return;
  const clients = getInterestedClients(ticker, "trades");
  if (!clients.length) return cleanupFanout(ticker);

  const params = new URLSearchParams({
    market_ticker: ticker,
    limit: String(STREAM_TRADE_LIMIT),
    sort_by: "timestamp",
    sort_direction: "desc",
  });
  const result = await forwardGet(PREDICTION_BASE, "/api/v1/trades", params);
  if (!result.ok) return;

  const nextHash = JSON.stringify(result.data);
  if (fanout.lastTradesHash === nextHash) return;
  fanout.lastTradesHash = nextHash;
  relayDflowTrades(ticker, result.data, Boolean(result.stale));

  for (const client of clients) {
    sseSend(client.res, "trades", {
      ticker,
      stale: Boolean(result.stale),
      payload: result.data,
      ts: new Date().toISOString(),
    });
  }
}

function ensureFanout(ticker: string, channels: Set<StreamChannel>) {
  const existing = marketFanouts.get(ticker) ?? { ticker, channels: new Set<StreamChannel>() };
  for (const channel of channels) existing.channels.add(channel);
  marketFanouts.set(ticker, existing);

  if (existing.channels.has("orderbook") && !existing.orderbookTimer) {
    existing.orderbookTimer = setInterval(() => {
      void publishOrderbook(ticker);
    }, STREAM_ORDERBOOK_POLL_MS);
    void publishOrderbook(ticker);
  }

  if (existing.channels.has("trades") && !existing.tradesTimer) {
    existing.tradesTimer = setInterval(() => {
      void publishTrades(ticker);
    }, STREAM_TRADES_POLL_MS);
    void publishTrades(ticker);
  }
}

async function buildBootstrapPayload(query: Request["query"]) {
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const marketLimit = clampInt(query.marketLimit, 12, 1, 24);
  const hydrateTickersLimit = clampInt(query.hydrateTickers, 4, 1, 8);
  const tradeLimit = clampInt(query.tradeLimit, STREAM_TRADE_LIMIT, 5, 50);
  const orderbookDepth = clampInt(query.orderbookDepth, STREAM_ORDERBOOK_DEPTH, 5, 40);
  const selectedTicker = typeof query.marketTicker === "string" && query.marketTicker.trim()
    ? query.marketTicker.trim()
    : null;

  const marketParams = new URLSearchParams({
    limit: String(marketLimit),
    status: String(query.status || "active"),
    sort: String(query.sort || "volume24h"),
    order: String(query.order || "desc"),
  });

  const [priorityFees, tagsByCategories, filtersBySports, marketsResult, searchResult] = await Promise.all([
    forwardGet(QUOTE_BASE, "/priority-fees"),
    forwardGet(PREDICTION_BASE, "/api/v1/tags_by_categories"),
    forwardGet(PREDICTION_BASE, "/api/v1/filters_by_sports"),
    forwardGet(PREDICTION_BASE, "/api/v1/markets", marketParams),
    q
      ? forwardGet(PREDICTION_BASE, "/api/v1/search", new URLSearchParams({
          q,
          limit: String(marketLimit),
          withNestedMarkets: "true",
          withMarketAccounts: "true",
          status: String(query.status || "active"),
        }))
      : Promise.resolve<ForwardResult>({ ok: true, status: 200, data: null }),
  ]);

  const searchEvents = searchResult.data?.events;
  const searchedMarkets = Array.isArray(searchEvents)
    ? searchEvents.flatMap((event: any) => Array.isArray(event?.markets) ? event.markets : [])
    : [];

  const featuredMarkets = q
    ? searchedMarkets.slice(0, marketLimit)
    : Array.isArray(marketsResult.data?.markets)
      ? marketsResult.data.markets
      : Array.isArray(marketsResult.data?.data)
        ? marketsResult.data.data
        : [];

  const hydrationTickers = Array.from(new Set([
    ...(selectedTicker ? [selectedTicker] : []),
    ...featuredMarkets.slice(0, hydrateTickersLimit).map((market: any) => market?.ticker).filter(Boolean),
  ])).slice(0, hydrateTickersLimit);

  const marketDetailsEntries = await Promise.all(
    hydrationTickers.map(async (ticker) => {
      const [market, orderbook, trades] = await Promise.all([
        forwardGet(PREDICTION_BASE, `/api/v1/market/${encodeURIComponent(ticker)}`),
        forwardGet(
          PREDICTION_BASE,
          `/api/v1/orderbook/${encodeURIComponent(ticker)}`,
          new URLSearchParams({ limit: String(orderbookDepth) }),
        ),
        forwardGet(
          PREDICTION_BASE,
          "/api/v1/trades",
          new URLSearchParams({
            market_ticker: ticker,
            limit: String(tradeLimit),
            sort_by: "timestamp",
            sort_direction: "desc",
          }),
        ),
      ]);

      return [ticker, {
        market: market.data,
        orderbook: orderbook.data,
        trades: trades.data,
        stale: Boolean(market.stale || orderbook.stale || trades.stale),
      }] as const;
    }),
  );

  const marketDetails = Object.fromEntries(marketDetailsEntries);

  const agentUniverse = featuredMarkets.slice(0, 8);
  const topVolume = [...agentUniverse]
    .sort((a: any, b: any) => Number(b?.volume24hFp ?? b?.volumeFp ?? b?.volume ?? 0) - Number(a?.volume24hFp ?? a?.volumeFp ?? a?.volume ?? 0));
  const soonestExpiry = [...agentUniverse]
    .filter((market: any) => Number.isFinite(Number(market?.closeTime ?? market?.expirationTime)))
    .sort((a: any, b: any) => Number(a?.closeTime ?? a?.expirationTime) - Number(b?.closeTime ?? b?.expirationTime));
  const widestSpread = [...agentUniverse]
    .map((market: any) => {
      const yesAsk = Number(market?.yesAsk ?? 0);
      const yesBid = Number(market?.yesBid ?? 0);
      const noAsk = Number(market?.noAsk ?? 0);
      const noBid = Number(market?.noBid ?? 0);
      const spread = Math.max(yesAsk - yesBid, noAsk - noBid, 0);
      return { market, spread };
    })
    .sort((a, b) => b.spread - a.spread);

  const predictionAgents = [
    topVolume[0] && {
      id: "momentum",
      name: "Flow Momentum Agent",
      signal: "momentum",
      confidence: 82,
      marketTicker: topVolume[0].ticker,
      headline: topVolume[0].title,
      rationale: "Highest near-term flow and liquidity footprint in the current bootstrap set.",
    },
    soonestExpiry[0] && {
      id: "catalyst",
      name: "Catalyst Window Agent",
      signal: "event-risk",
      confidence: 74,
      marketTicker: soonestExpiry[0].ticker,
      headline: soonestExpiry[0].title,
      rationale: "Earliest closing active market, which usually creates compressed repricing windows.",
    },
    widestSpread[0]?.market && {
      id: "microstructure",
      name: "Spread Hunter Agent",
      signal: "spread",
      confidence: 68,
      marketTicker: widestSpread[0].market.ticker,
      headline: widestSpread[0].market.title,
      rationale: "Widest top-of-book spread in the current set, useful for discretionary monitoring.",
    },
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    configured: !!process.env.DFLOW_API_KEY,
    sharedCache: HAS_REDIS,
    quoteApi: QUOTE_BASE,
    predictionMarketsApi: PREDICTION_BASE,
    query: {
      q: q || null,
      marketLimit,
      hydrateTickersLimit,
      selectedTicker,
    },
    priorityFees: priorityFees.data,
    tagsByCategories: tagsByCategories.data,
    filtersBySports: filtersBySports.data,
    search: q ? searchResult.data : null,
    featuredMarkets,
    hydrationTickers,
    marketDetails,
    predictionAgents,
  };
}

function getAppBaseUrl(req: Request) {
  return process.env.APP_URL
    || process.env.VITE_APP_URL
    || `${req.protocol}://${req.get("host")}`;
}

async function enqueueBootstrapWarm(req: Request) {
  if (!qstashConfigured) return null;

  const warmBody = {
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    status: typeof req.query.status === "string" ? req.query.status : "active",
    sort: typeof req.query.sort === "string" ? req.query.sort : "volume24h",
    order: typeof req.query.order === "string" ? req.query.order : "desc",
    marketLimit: clampInt(req.query.marketLimit, 14, 1, 24),
    hydrateTickers: clampInt(req.query.hydrateTickers, 4, 1, 8),
    tradeLimit: clampInt(req.query.tradeLimit, 20, 5, 50),
    orderbookDepth: clampInt(req.query.orderbookDepth, 20, 5, 40),
    marketTicker: typeof req.query.marketTicker === "string" ? req.query.marketTicker : undefined,
  };

  const dedupeKey = JSON.stringify(warmBody);
  const claimed = await claimWarmJob(dedupeKey);
  if (!claimed) return null;

  try {
    const result = await qstash.publishJSON({
      url: `${getAppBaseUrl(req)}/api/dflow/warm`,
      body: warmBody,
      delay: `${DFlow_QSTASH_WARM_DELAY_SEC}s`,
    } as any);
    return result;
  } catch (error: any) {
    console.warn("[dflow] qstash enqueue failed:", error?.message || error);
    return null;
  }
}

router.use(async (req, res, next) => {
  const limited = await applyRouteQuota(req, res);
  if (limited) return;
  next();
});

// ─── Status ──────────────────────────────────────────────────────────────────

// GET /api/dflow/status — check if DFlow is configured
router.get("/status", (_req, res) => {
  setSharedCacheHeaders(res, 30_000, 120_000);
  res.json({
    configured: !!process.env.DFLOW_API_KEY,
    quoteApi: QUOTE_BASE,
    predictionMarketsApi: PREDICTION_BASE,
    sharedCache: HAS_REDIS,
  });
});

// GET /api/dflow/bootstrap — first-page hydration bundle
router.get("/bootstrap", async (req, res) => {
  try {
    const payload = await buildBootstrapPayload(req.query);
    void enqueueBootstrapWarm(req);
    setSharedCacheHeaders(res, 10_000, 45_000);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dflow/warm — signed QStash cache warmer
router.post("/warm", async (req, res) => {
  try {
    const verified = await verifyQstashRequest(req);
    if (!verified) return res.status(401).json({ error: "invalid qstash signature" });

    const query = {
      q: typeof req.body?.q === "string" ? req.body.q : undefined,
      status: typeof req.body?.status === "string" ? req.body.status : "active",
      sort: typeof req.body?.sort === "string" ? req.body.sort : "volume24h",
      order: typeof req.body?.order === "string" ? req.body.order : "desc",
      marketLimit: req.body?.marketLimit,
      hydrateTickers: req.body?.hydrateTickers,
      tradeLimit: req.body?.tradeLimit,
      orderbookDepth: req.body?.orderbookDepth,
      marketTicker: typeof req.body?.marketTicker === "string" ? req.body.marketTicker : undefined,
    };

    const payload = await buildBootstrapPayload(query as Request["query"]);
    res.json({
      ok: true,
      generatedAt: payload.generatedAt,
      hydrationTickers: payload.hydrationTickers,
      predictionAgents: payload.predictionAgents.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dflow/stream?tickers=A,B&channels=orderbook,trades
router.get("/stream", async (req, res) => {
  const tickers = sanitizeTickerList(req.query.tickers);
  if (!tickers.length) return res.status(400).json({ error: "tickers required" });

  const channels = normalizeChannels(req.query.channels);
  const clientId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const client: StreamClient = {
    id: clientId,
    res,
    tickers: new Set(tickers),
    channels,
  };
  streamClients.set(clientId, client);

  sseSend(res, "hello", {
    clientId,
    tickers,
    channels: Array.from(channels),
    ts: new Date().toISOString(),
  });

  for (const ticker of tickers) {
    ensureFanout(ticker, channels);
  }

  const heartbeat = setInterval(() => {
    sseComment(res, "keepalive");
    sseSend(res, "heartbeat", { ts: new Date().toISOString() });
  }, STREAM_HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    streamClients.delete(clientId);
    for (const ticker of tickers) cleanupFanout(ticker);
  });
});

// ─── Quote API — Imperative swap ─────────────────────────────────────────────

// GET /api/dflow/order?inputMint=...&outputMint=...&amount=...&userPublicKey=...
router.get("/order", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "userPublicKey", "inputMint", "outputMint", "amount", "slippageBps",
      "perLegSlippage", "predictionMarketSlippageBps", "priceImpactTolerancePct",
      "dexes", "excludeDexes", "platformFeeBps", "platformFeeMode",
      "feeAccount", "referralAccount", "positiveSlippageFeeAccount",
      "prioritizationFeeLamports", "onlyDirectRoutes", "maxRouteLength",
      "onlyJitRoutes", "enableSyncExecution", "enableAsyncExecution",
      "includeAddressLookupTables", "skipPumpfunCashbackClaim",
      "allowBondingCurveUnderconsumption",
    ]);
    if (!req.query.inputMint) return res.status(400).json({ error: "inputMint required" });
    if (!req.query.outputMint) return res.status(400).json({ error: "outputMint required" });
    if (!req.query.amount) return res.status(400).json({ error: "amount required" });

    const url = `${QUOTE_BASE}/order?${params.toString()}`;
    const r = await fetch(url, {
      headers: HEADERS(),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const text = await r.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    res.setHeader("Cache-Control", "no-store");
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (err: any) {
    if (err?.name === "AbortError") return res.status(504).json({ error: "DFlow upstream timeout" });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dflow/quote?inputMint=...&outputMint=...&amount=...&slippageBps=auto
router.get("/quote", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "inputMint", "outputMint", "amount", "slippageBps", "priceImpactTolerancePct",
      "dexes", "excludeDexes", "platformFeeBps", "platformFeeMode",
      "onlyDirectRoutes", "maxRouteLength", "onlyJitRoutes", "forJitoBundle",
    ]);
    if (!req.query.inputMint) return res.status(400).json({ error: "inputMint required" });
    if (!req.query.outputMint) return res.status(400).json({ error: "outputMint required" });
    if (!req.query.amount) return res.status(400).json({ error: "amount required" });
    const { ok, status, data } = await forwardGet(QUOTE_BASE, "/quote", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/dflow/swap
router.post("/swap", async (req, res) => {
  try {
    if (!req.body?.quoteResponse) return res.status(400).json({ error: "quoteResponse required" });
    if (!req.body?.userPublicKey) return res.status(400).json({ error: "userPublicKey required" });
    const { ok, status, data } = await forwardJson(QUOTE_BASE, "POST", "/swap", req.body);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/dflow/swap-instructions
router.post("/swap-instructions", async (req, res) => {
  try {
    if (!req.body?.quoteResponse) return res.status(400).json({ error: "quoteResponse required" });
    if (!req.body?.userPublicKey) return res.status(400).json({ error: "userPublicKey required" });
    const { ok, status, data } = await forwardJson(QUOTE_BASE, "POST", "/swap-instructions", req.body);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Quote API — Intent (declarative token swap) ─────────────────────────────

// GET /api/dflow/intent?inputMint=...&outputMint=...&amount=...&userPublicKey=...&slippageBps=auto
router.get("/intent", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "userPublicKey", "inputMint", "outputMint", "amount", "slippageBps",
      "priceImpactTolerancePct", "platformFeeBps", "feeAccount", "referralAccount",
      "wrapAndUnwrapSol", "feeBudget", "maxAutoFeeBudget",
    ]);
    if (!req.query.inputMint) return res.status(400).json({ error: "inputMint required" });
    if (!req.query.outputMint) return res.status(400).json({ error: "outputMint required" });
    if (!req.query.amount) return res.status(400).json({ error: "amount required" });
    const { ok, status, data } = await forwardGet(QUOTE_BASE, "/intent", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/dflow/submit-intent
router.post("/submit-intent", async (req, res) => {
  try {
    const { quoteResponse, signedOpenTransaction } = req.body ?? {};
    if (!quoteResponse) return res.status(400).json({ error: "quoteResponse required" });
    if (!signedOpenTransaction) return res.status(400).json({ error: "signedOpenTransaction required" });
    const { ok, status, data } = await forwardJson(QUOTE_BASE, "POST", "/submit-intent", {
      quoteResponse,
      signedOpenTransaction,
    });
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Quote API ───────────────────────────────────────────────────────────────

// GET /api/dflow/prediction-market-init?payer=...&outcomeMint=...
router.get("/prediction-market-init", async (req, res) => {
  try {
    const params = copyParams(req.query, ["payer", "outcomeMint"]);
    if (!req.query.payer) return res.status(400).json({ error: "payer required" });
    const { ok, status, data } = await forwardGet(QUOTE_BASE, "/prediction-market-init", params);
    setSharedCacheHeaders(res, 5_000, 20_000);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/priority-fees
router.get("/priority-fees", async (_req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(QUOTE_BASE, "/priority-fees");
    setSharedCacheHeaders(res, 20_000, 120_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/tokens
router.get("/tokens", async (_req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(QUOTE_BASE, "/tokens");
    setSharedCacheHeaders(res, 300_000, 1_800_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/tokens-with-decimals
router.get("/tokens-with-decimals", async (_req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(QUOTE_BASE, "/tokens-with-decimals");
    setSharedCacheHeaders(res, 300_000, 1_800_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/venues
router.get("/venues", async (_req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(QUOTE_BASE, "/venues");
    setSharedCacheHeaders(res, 300_000, 1_800_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Events ─────────────────────────────────────────

// GET /api/dflow/events
router.get("/events", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "page", "limit", "status", "category", "tag", "series_ticker",
      "sort_by", "sort_direction", "start", "end",
    ]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/events", params);
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/events/:ticker
router.get("/events/:ticker", async (req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/event/${encodeURIComponent(req.params.ticker)}`,
    );
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Markets ────────────────────────────────────────

// GET /api/dflow/markets
router.get("/markets", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "page", "cursor", "limit", "status", "event_ticker", "series_ticker",
      "sort", "order", "sort_by", "sort_direction",
    ]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/markets", params);
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/market/:marketId
router.get("/market/:marketId", async (req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/market/${encodeURIComponent(req.params.marketId)}`,
    );
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/market/by-mint/:mintAddress
router.get("/market/by-mint/:mintAddress", async (req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/market/by-mint/${encodeURIComponent(req.params.mintAddress)}`,
    );
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/dflow/markets/batch
router.post("/markets/batch", async (req, res) => {
  try {
    const { ok, status, data } = await forwardJson(PREDICTION_BASE, "POST", "/api/v1/markets/batch", req.body);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Orderbook ──────────────────────────────────────

// GET /api/dflow/orderbook/:marketTicker
router.get("/orderbook/:marketTicker", async (req, res) => {
  try {
    const params = copyParams(req.query, ["limit"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/orderbook/${encodeURIComponent(req.params.marketTicker)}`,
      params,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/orderbook/by-mint/:mintAddress
router.get("/orderbook/by-mint/:mintAddress", async (req, res) => {
  try {
    const params = copyParams(req.query, ["limit"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/orderbook/by-mint/${encodeURIComponent(req.params.mintAddress)}`,
      params,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Trades ─────────────────────────────────────────

// GET /api/dflow/trades
router.get("/trades", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "page", "limit", "market_ticker", "event_ticker", "series_ticker",
      "wallet_address", "sort_by", "sort_direction", "start", "end",
    ]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/trades", params);
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/trades/by-mint/:mintAddress
router.get("/trades/by-mint/:mintAddress", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit", "sort_by", "sort_direction"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/trades/by-mint/${encodeURIComponent(req.params.mintAddress)}`,
      params,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/onchain-trades
router.get("/onchain-trades", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit", "sort_by", "sort_direction"]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/onchain-trades", params);
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/onchain-trades/by-event/:eventTicker
router.get("/onchain-trades/by-event/:eventTicker", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/onchain-trades/by-event/${encodeURIComponent(req.params.eventTicker)}`,
      params,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/onchain-trades/by-market/:marketTicker
router.get("/onchain-trades/by-market/:marketTicker", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/onchain-trades/by-market/${encodeURIComponent(req.params.marketTicker)}`,
      params,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Live Data ──────────────────────────────────────

// GET /api/dflow/live-data
router.get("/live-data", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit", "event_ticker", "market_ticker", "series_ticker", "status"]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/live_data", params);
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/live-data/by-event/:eventTicker
router.get("/live-data/by-event/:eventTicker", async (req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/live_data/by-event/${encodeURIComponent(req.params.eventTicker)}`,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/live-data/by-mint/:mintAddress
router.get("/live-data/by-mint/:mintAddress", async (req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/live_data/by-mint/${encodeURIComponent(req.params.mintAddress)}`,
    );
    setSharedCacheHeaders(res, 5_000, 20_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Series ─────────────────────────────────────────

// GET /api/dflow/series
router.get("/series", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit", "status"]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/series", params);
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/series/by-ticker/:seriesTicker
router.get("/series/by-ticker/:seriesTicker", async (req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/series/by-ticker/${encodeURIComponent(req.params.seriesTicker)}`,
    );
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Outcome Mints ──────────────────────────────────

// GET /api/dflow/outcome-mints
router.get("/outcome-mints", async (req, res) => {
  try {
    const params = copyParams(req.query, ["page", "limit", "market_ticker", "event_ticker"]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/outcome_mints", params);
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/dflow/outcome-mints/filter
router.post("/outcome-mints/filter", async (req, res) => {
  try {
    const { ok, status, data } = await forwardJson(PREDICTION_BASE, "POST", "/api/v1/filter_outcome_mints", req.body);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Candlesticks ───────────────────────────────────

// GET /api/dflow/candlesticks/event/:ticker
router.get("/candlesticks/event/:ticker", async (req, res) => {
  try {
    const params = copyParams(req.query, ["periodInterval", "interval", "limit", "startTs", "endTs", "start", "end"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/event/${encodeURIComponent(req.params.ticker)}/candlesticks`,
      params,
    );
    setSharedCacheHeaders(res, 30_000, 120_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/candlesticks/market/:ticker
router.get("/candlesticks/market/:ticker", async (req, res) => {
  try {
    const params = copyParams(req.query, ["periodInterval", "interval", "limit", "startTs", "endTs", "start", "end"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/market/${encodeURIComponent(req.params.ticker)}/candlesticks`,
      params,
    );
    setSharedCacheHeaders(res, 30_000, 120_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/candlesticks/market/by-mint/:mintAddress
router.get("/candlesticks/market/by-mint/:mintAddress", async (req, res) => {
  try {
    const params = copyParams(req.query, ["periodInterval", "interval", "limit", "startTs", "endTs", "start", "end"]);
    const { ok, status, data, stale } = await forwardGet(
      PREDICTION_BASE,
      `/api/v1/market/by-mint/${encodeURIComponent(req.params.mintAddress)}/candlesticks`,
      params,
    );
    setSharedCacheHeaders(res, 30_000, 120_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Prediction Markets API — Tags & Filters ─────────────────────────────────

// GET /api/dflow/tags-by-categories
router.get("/tags-by-categories", async (_req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/tags_by_categories");
    setSharedCacheHeaders(res, 300_000, 1_800_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/filters-by-sports
router.get("/filters-by-sports", async (_req, res) => {
  try {
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/filters_by_sports");
    setSharedCacheHeaders(res, 300_000, 1_800_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/dflow/search
router.get("/search", async (req, res) => {
  try {
    const q = typeof req.query.query === "string" ? req.query.query : typeof req.query.q === "string" ? req.query.q : "";
    if (!q) return res.status(400).json({ error: "query required" });
    const params = copyParams({
      q,
      limit: req.query.limit,
      cursor: req.query.cursor,
      sort: req.query.sort,
      order: req.query.order,
      withNestedMarkets: req.query.withNestedMarkets ?? true,
      withMarketAccounts: req.query.withMarketAccounts ?? true,
      status: req.query.status,
    }, ["q", "limit", "cursor", "sort", "order", "withNestedMarkets", "withMarketAccounts", "status"]);
    const { ok, status, data, stale } = await forwardGet(PREDICTION_BASE, "/api/v1/search", params);
    setSharedCacheHeaders(res, 15_000, 60_000, stale);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
