import { Router, type Response } from 'express';
import fetch from 'node-fetch';

const router = Router();
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const SOLANA_TRACKER_API_KEY = process.env.SOLANA_TRACKER_API_KEY || process.env.VITE_SOLANA_TRACKER_API_KEY;
const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const SOLANA_TRACKER_BASE = (process.env.SOLANA_TRACKER_URL || 'https://data.solanatracker.io').replace(/\/$/, '');
const DFLOW_PREDICTION_BASE = (process.env.DFLOW_PREDICTION_MARKETS_API_BASE || 'https://d.prediction-markets-api.dflow.net').replace(/\/$/, '');
const FIRECRAWL_BASE = (process.env.FIRECRAWL_API_BASE || 'https://api.firecrawl.dev').replace(/\/$/, '');
const BUBBLEMAPS_BASE = 'https://v2.bubblemaps.io';
const TOKEN_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BIRDEYE_DEFAULT_PERPS_EXCHANGE = 'hyperliquid';
const BIRDEYE_PERPS_TTL_MS = 15_000;
const BIRDEYE_PERPS_STALE_MS = 90_000;
const BIRDEYE_PERPS_DOCS = {
  index: 'https://docs.birdeye.so/llms.txt',
  tokenList: 'https://docs.birdeye.so/reference/get-perps-v1-token-list.md',
  tokenOverview: 'https://docs.birdeye.so/reference/get-perps-v1-token-overview.md',
  tokenOpenPositions: 'https://docs.birdeye.so/reference/get-perps-v1-token-open_positions.md',
  tokenLiquidationMap: 'https://docs.birdeye.so/reference/get-perps-v1-token-liquidation_map.md',
  walletOverview: 'https://docs.birdeye.so/reference/get-perps-v1-wallet-overview.md',
  walletOpenPositions: 'https://docs.birdeye.so/reference/get-perps-v1-wallet-open_positions.md',
};
const PERPS_TIME_FRAMES = ['4h', '1d', '7d', '30d', 'all'] as const;
const PERPS_TOKEN_LIST_SORTS = ['long_io', 'short_io', 'open_interest'] as const;
const PERPS_OPEN_POSITION_SORTS = ['position_value', 'open_time'] as const;
const SORT_TYPES = ['desc', 'asc'] as const;
const PERPS_TOKEN_PATTERN = /^[A-Z0-9]{1,20}$/;
const HYPERLIQUID_WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

type CachedPerpsResponse = {
  data: any;
  expiresAt: number;
  staleUntil: number;
};

const birdeyePerpsCache = new Map<string, CachedPerpsResponse>();

// Helper function for BirdEye API requests
async function birdEyeRequest(
  endpoint: string,
  params: Record<string, string | number> = {},
  chain = 'solana'
) {
  if (!BIRDEYE_API_KEY) throw new Error('BirdEye API key is not configured');

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => queryParams.append(k, String(v)));
  const qs = queryParams.toString();
  const url = `${BIRDEYE_BASE}${endpoint}${qs ? '?' + qs : ''}`;

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-chain': chain,
      'x-api-key': BIRDEYE_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BirdEye API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function birdEyePost(endpoint: string, body: any, chain = 'solana') {
  if (!BIRDEYE_API_KEY) throw new Error('BirdEye API key is not configured');
  const response = await fetch(`${BIRDEYE_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-chain': chain,
      'x-api-key': BIRDEYE_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BirdEye API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function normalizePerpsToken(raw: unknown) {
  const token = String(raw || '').trim().toUpperCase();
  return PERPS_TOKEN_PATTERN.test(token) ? token : null;
}

function normalizeHyperliquidWallet(raw: unknown) {
  const wallet = String(raw || '').trim().toLowerCase();
  return HYPERLIQUID_WALLET_PATTERN.test(wallet) ? wallet : null;
}

function buildPerpsPayload(raw: any, stale: boolean) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: true, data: raw, meta: { stale } };
  }

  return {
    ...raw,
    success: raw.success !== false,
    meta: {
      ...(raw.meta && typeof raw.meta === 'object' ? raw.meta : {}),
      stale,
      exchange: BIRDEYE_DEFAULT_PERPS_EXCHANGE,
    },
  };
}

function setPerpsResponseHeaders(res: Response, stale: boolean, ttlMs = BIRDEYE_PERPS_TTL_MS, staleMs = BIRDEYE_PERPS_STALE_MS) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(staleMs / 1000)}`,
  );
  if (stale) res.setHeader('X-Birdeye-Stale', '1');
}

async function birdEyePerpsRequest(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  {
    ttlMs = BIRDEYE_PERPS_TTL_MS,
    staleMs = BIRDEYE_PERPS_STALE_MS,
    exchange = BIRDEYE_DEFAULT_PERPS_EXCHANGE,
  }: {
    ttlMs?: number;
    staleMs?: number;
    exchange?: string;
  } = {},
) {
  if (!BIRDEYE_API_KEY) throw new Error('BirdEye API key is not configured');

  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, String(value));
    }
  }
  const qs = queryParams.toString();
  const url = `${BIRDEYE_BASE}${endpoint}${qs ? '?' + qs : ''}`;
  const cacheKey = `${exchange}:${url}`;
  const now = Date.now();
  const cached = birdeyePerpsCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return { data: cached.data, stale: false };
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-perp': exchange,
        'X-API-KEY': BIRDEYE_API_KEY,
      },
    });

    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      const detail =
        parsed?.error ||
        parsed?.message ||
        (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
      throw new Error(`BirdEye perps error ${response.status}: ${String(detail).slice(0, 240)}`);
    }

    birdeyePerpsCache.set(cacheKey, {
      data: parsed,
      expiresAt: now + ttlMs,
      staleUntil: now + staleMs,
    });
    return { data: parsed, stale: false };
  } catch (error) {
    if (cached && cached.staleUntil > now) {
      return { data: cached.data, stale: true };
    }
    throw error;
  }
}

function handleError(res: any, error: unknown) {
  console.error('[BirdEye]', error);
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
      ? Number((error as { status: number }).status)
      : 500;
  return res.status(status).json({
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
}

const chartTypeToSeconds: Record<string, number> = {
  '1s': 1,
  '5s': 5,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '1w': 604800,
  '1mn': 2592000,
};

function normalizeOhlcvItem(item: any, source: string) {
  const unixTime = Number(item.unixTime ?? item.unix_time ?? item.time ?? item.timestamp);
  const open = Number(item.open ?? item.o);
  const high = Number(item.high ?? item.h);
  const low = Number(item.low ?? item.l);
  const close = Number(item.close ?? item.c);
  const volume = Number(item.volume ?? item.v ?? item.v_usd ?? item.vUsd ?? item.vBase ?? item.vQuote ?? 0);

  if (!Number.isFinite(unixTime) || !Number.isFinite(close)) return null;

  return {
    ...item,
    unixTime,
    time: unixTime,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    source,
  };
}

function normalizeOhlcvItems(items: any[], source: string) {
  return items
    .map((item) => normalizeOhlcvItem(item, source))
    .filter(Boolean)
    .sort((a: any, b: any) => a.unixTime - b.unixTime);
}

async function solanaTrackerChart(address: string, params: Record<string, string | number | boolean>) {
  if (!SOLANA_TRACKER_API_KEY) throw new Error('Solana Tracker API key is not configured');

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => queryParams.append(key, String(value)));

  const response = await fetch(`${SOLANA_TRACKER_BASE}/chart/${encodeURIComponent(address)}?${queryParams}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': SOLANA_TRACKER_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Solana Tracker chart error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data: any = await response.json();
  const rawItems = data?.data?.items || data?.items || data?.ohlcv || data?.oclhv || [];
  return {
    raw: data,
    items: normalizeOhlcvItems(Array.isArray(rawItems) ? rawItems : [], 'solana-tracker'),
  };
}

async function solanaTrackerRequest(endpoint: string, params: Record<string, string | number | boolean> = {}) {
  if (!SOLANA_TRACKER_API_KEY) throw new Error('Solana Tracker API key is not configured');

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => queryParams.append(key, String(value)));
  const qs = queryParams.toString();
  const response = await fetch(`${SOLANA_TRACKER_BASE}${endpoint}${qs ? '?' + qs : ''}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': SOLANA_TRACKER_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Solana Tracker API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function dflowPredictionRequest(endpoint: string, params: Record<string, string | number | boolean> = {}) {
  if (!process.env.DFLOW_API_KEY) throw new Error('DFlow API key is not configured');

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => queryParams.append(key, String(value)));
  const qs = queryParams.toString();
  const response = await fetch(`${DFLOW_PREDICTION_BASE}${endpoint}${qs ? '?' + qs : ''}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': process.env.DFLOW_API_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DFlow API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

function buildBubblemapsUrl(address: string, chain = 'solana') {
  const url = new URL('/map', BUBBLEMAPS_BASE);
  url.searchParams.set('chain', chain);
  url.searchParams.set('address', address);
  return url.toString();
}

function serializeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function captureSource(work: () => Promise<any>) {
  try {
    const raw = await work();
    return {
      available: true,
      data: raw?.data ?? raw,
    };
  } catch (error) {
    return {
      available: false,
      data: null,
      error: serializeError(error),
    };
  }
}

function latestOwnershipValue(metric: string, result: any) {
  const data = result?.data ?? result;
  const seriesKey = metric === 'holders' ? 'holders' : metric;
  const series = Array.isArray(data?.[seriesKey])
    ? data[seriesKey]
    : Array.isArray(data?.data?.[seriesKey])
      ? data.data[seriesKey]
      : Array.isArray(data?.items)
        ? data.items
        : [];
  const latest = series[series.length - 1];
  if (!latest) return null;
  return Number(latest.value ?? latest.percentage ?? latest.holders ?? latest.count ?? latest.amount);
}

type SourceError = { source: string; error: string };
type IntelSignalLevel = 'positive' | 'watch' | 'risk' | 'info';
type IntelSignal = {
  level: IntelSignalLevel;
  label: string;
  value: string;
  detail: string;
  source: string;
};

function collectSourceErrors(prefix: string, value: any): SourceError[] {
  return Object.entries(value || {})
    .flatMap(([key, result]: [string, any]): SourceError[] => {
      if (result && typeof result === 'object' && 'available' in result) {
        return result.available ? [] : [{ source: `${prefix}.${key}`, error: result.error || 'Unavailable' }];
      }
      return collectSourceErrors(`${prefix}.${key}`, result);
    });
}

async function firecrawlJson(endpoint: string, body?: any, method = 'POST') {
  if (!process.env.FIRECRAWL_API_KEY) throw new Error('Firecrawl API key is not configured');

  const response = await fetch(`${FIRECRAWL_BASE}${endpoint}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok) {
    throw new Error(`Firecrawl API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return data;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pctValue(value: unknown) {
  const number = finiteNumber(value);
  return number == null ? '—' : `${number.toFixed(2)}%`;
}

function buildSignal(level: IntelSignalLevel, label: string, value: string, detail: string, source: string): IntelSignal {
  return { level, label, value, detail, source };
}

function buildIntelSignals(summary: any, firecrawlConfigured: boolean): IntelSignal[] {
  const signals: IntelSignal[] = [];
  const top10 = finiteNumber(summary?.top10HolderPercent);
  if (top10 != null) {
    signals.push(buildSignal(
      top10 >= 50 ? 'risk' : top10 >= 25 ? 'watch' : 'positive',
      'Top holder concentration',
      pctValue(top10),
      top10 >= 50
        ? 'Top 10 wallets control a majority of supply.'
        : top10 >= 25
          ? 'Top 10 wallets hold a material share of supply.'
          : 'Top 10 wallet concentration is not elevated.',
      'birdeye.security',
    ));
  }

  const creator = finiteNumber(summary?.creatorPercentage);
  if (creator != null) {
    signals.push(buildSignal(
      creator >= 25 ? 'risk' : creator >= 10 ? 'watch' : 'positive',
      'Creator share',
      pctValue(creator),
      creator >= 25
        ? 'Creator wallet retains a large share of supply.'
        : creator >= 10
          ? 'Creator wallet share is worth monitoring.'
          : 'Creator wallet concentration is low.',
      'birdeye.security',
    ));
  }

  const riskScore = finiteNumber(summary?.riskScore);
  if (riskScore != null) {
    signals.push(buildSignal(
      summary?.rugged ? 'risk' : riskScore >= 8 ? 'risk' : riskScore >= 5 ? 'watch' : 'positive',
      'Solana Tracker risk',
      String(riskScore),
      summary?.rugged
        ? 'Solana Tracker marks this token as rugged.'
        : riskScore >= 8
          ? 'Risk score is elevated.'
          : riskScore >= 5
            ? 'Risk score is in a caution band.'
            : 'Risk score is low.',
      'solana-tracker.token',
    ));
  }

  const ownershipChecks = [
    ['Sniper ownership', summary?.ownership?.snipersPercent, 'solana-tracker.ownership.snipers'],
    ['Bundler ownership', summary?.ownership?.bundlersPercent, 'solana-tracker.ownership.bundlers'],
    ['Insider ownership', summary?.ownership?.insidersPercent, 'solana-tracker.ownership.insiders'],
  ] as const;

  for (const [label, rawValue, source] of ownershipChecks) {
    const value = finiteNumber(rawValue);
    if (value == null) continue;
    signals.push(buildSignal(
      value >= 25 ? 'risk' : value >= 10 ? 'watch' : 'positive',
      label,
      pctValue(value),
      value >= 25
        ? 'Ownership signal is high and should be reviewed on the Bubblemap.'
        : value >= 10
          ? 'Ownership signal is present but not dominant.'
          : 'Ownership signal is low.',
      source,
    ));
  }

  if (summary?.dflowMarket?.ticker) {
    signals.push(buildSignal(
      'info',
      'DFlow market link',
      summary.dflowMarket.ticker,
      summary.dflowMarket.title || 'DFlow returned a market for this mint.',
      'dflow.market',
    ));
  }

  signals.push(buildSignal(
    firecrawlConfigured ? 'positive' : 'info',
    'Bubblemap interaction',
    firecrawlConfigured ? 'Enabled' : 'Open-link only',
    firecrawlConfigured
      ? 'Firecrawl is configured for live natural-language Bubblemap inspection.'
      : 'Open the Bubblemap directly; Firecrawl is not configured in this environment.',
    'bubblemaps',
  ));

  return signals;
}

// ─── Trending & Lists ──────────────────────────────────────────────────────

function trendingParams(query: any, defaults: { sortBy?: string; sortType?: string; limit?: number } = {}) {
  const sortAliases: Record<string, string> = {
    rank: 'rank',
    volumeUSD: 'volume24hUSD',
    volume24hUSD: 'volume24hUSD',
    liquidity: 'liquidity',
  };
  const interval = ['1h', '4h', '24h'].includes(String(query.interval)) ? String(query.interval) : '24h';
  const sortBy = sortAliases[String(query.sort_by || defaults.sortBy || 'rank')] || 'rank';
  const sortType = String(query.sort_type || defaults.sortType || 'asc') === 'desc' ? 'desc' : 'asc';
  const limit = Math.min(Math.max(Number(query.limit || defaults.limit || 20), 1), 20);
  return {
    sort_by: sortBy,
    interval,
    sort_type: sortType,
    offset: Math.max(Number(query.offset) || 0, 0),
    limit,
    ui_amount_mode: String(query.ui_amount_mode || 'scaled') === 'raw' ? 'raw' : 'scaled',
  };
}

router.get('/trending-tokens', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_trending', trendingParams(req.query)) as any;
    const tokens = data?.data?.tokens || data?.data?.items || [];
    res.json({
      ...data,
      success: data?.success !== false,
      data: { ...(data?.data || {}), tokens },
    });
  } catch (e) { handleError(res, e); }
});

router.get('/trending', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_trending', trendingParams(req.query, { sortBy: 'volume24hUSD', sortType: 'desc' })) as any;
    const tokens = data?.data?.tokens || data?.data?.items || [];
    res.json({
      ...data,
      success: data?.success !== false,
      data: { ...(data?.data || {}), tokens },
    });
  } catch (e) { handleError(res, e); }
});

router.get('/token-list', async (req, res) => {
  try {
    const params: Record<string, string | number> = {
      limit: Number(req.query.limit) || 50,
      sort_by: (req.query.sort_by as string) || 'liquidity',
      sort_type: (req.query.sort_type as string) || 'desc',
    };
    if (req.query.scroll_id) params.scroll_id = req.query.scroll_id as string;
    if (req.query.min_liquidity) params.min_liquidity = Number(req.query.min_liquidity);
    const data = await birdEyeRequest('/defi/v3/token/list/scroll', params);
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/new-listings', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v2/tokens/new_listing', {
      limit: Number(req.query.limit) || 20,
      time_to: Math.floor(Date.now() / 1000),
      meme_platform_enabled: 'true',
    });
    res.json(data);
  } catch (e) {
    // Fall back gracefully if endpoint is unavailable
    res.json({ success: true, data: { items: [] } });
  }
});

router.get('/meme-tokens', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_trending', trendingParams(req.query, { sortBy: 'volume24hUSD', sortType: 'desc', limit: 20 }));
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Perps Data ────────────────────────────────────────────────────────────

router.get('/perps/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      configured: Boolean(BIRDEYE_API_KEY),
      exchange: BIRDEYE_DEFAULT_PERPS_EXCHANGE,
      dataAvailability: '2025-05-25T15:00:00Z',
      docs: BIRDEYE_PERPS_DOCS,
    },
  });
});

router.get('/perps/token-list', async (req, res) => {
  try {
    const { data, stale } = await birdEyePerpsRequest('/perps/v1/token/list', {
      time_frame: pickEnum(req.query.time_frame, PERPS_TIME_FRAMES, 'all'),
      sort_by: pickEnum(req.query.sort_by, PERPS_TOKEN_LIST_SORTS, 'open_interest'),
      sort_type: pickEnum(req.query.sort_type, SORT_TYPES, 'desc'),
      offset: Math.max(Number(req.query.offset) || 0, 0),
      limit: clampNumber(req.query.limit, 20, 1, 20),
    });
    setPerpsResponseHeaders(res, stale);
    res.json(buildPerpsPayload(data, stale));
  } catch (e) { handleError(res, e); }
});

router.get('/perps/token-overview/:token', async (req, res) => {
  try {
    const token = normalizePerpsToken(req.params.token);
    if (!token) {
      return res.status(400).json({ success: false, error: 'valid token symbol is required' });
    }
    const { data, stale } = await birdEyePerpsRequest(
      '/perps/v1/token/overview',
      { token },
      { ttlMs: 10_000, staleMs: 60_000 },
    );
    setPerpsResponseHeaders(res, stale, 10_000, 60_000);
    res.json(buildPerpsPayload(data, stale));
  } catch (e) { handleError(res, e); }
});

router.get('/perps/token-open-positions/:token', async (req, res) => {
  try {
    const token = normalizePerpsToken(req.params.token);
    if (!token) {
      return res.status(400).json({ success: false, error: 'valid token symbol is required' });
    }
    const { data, stale } = await birdEyePerpsRequest(
      '/perps/v1/token/open_positions',
      {
        token,
        sort_by: pickEnum(req.query.sort_by, PERPS_OPEN_POSITION_SORTS, 'open_time'),
        sort_type: pickEnum(req.query.sort_type, SORT_TYPES, 'desc'),
        offset: Math.max(Number(req.query.offset) || 0, 0),
        limit: clampNumber(req.query.limit, 10, 1, 50),
      },
      { ttlMs: 10_000, staleMs: 60_000 },
    );
    setPerpsResponseHeaders(res, stale, 10_000, 60_000);
    res.json(buildPerpsPayload(data, stale));
  } catch (e) { handleError(res, e); }
});

router.get('/perps/token-liquidation-map/:token', async (req, res) => {
  try {
    const token = normalizePerpsToken(req.params.token);
    if (!token) {
      return res.status(400).json({ success: false, error: 'valid token symbol is required' });
    }
    const { data, stale } = await birdEyePerpsRequest(
      '/perps/v1/token/liquidation_map',
      { token },
      { ttlMs: 20_000, staleMs: 90_000 },
    );
    setPerpsResponseHeaders(res, stale, 20_000, 90_000);
    res.json(buildPerpsPayload(data, stale));
  } catch (e) { handleError(res, e); }
});

router.get('/perps/wallet/overview', async (req, res) => {
  try {
    const wallet = normalizeHyperliquidWallet(req.query.wallet);
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'valid Hyperliquid wallet address is required' });
    }
    const { data, stale } = await birdEyePerpsRequest(
      '/perps/v1/wallet/overview',
      { wallet },
      { ttlMs: 10_000, staleMs: 60_000 },
    );
    setPerpsResponseHeaders(res, stale, 10_000, 60_000);
    res.json(buildPerpsPayload(data, stale));
  } catch (e) { handleError(res, e); }
});

router.get('/perps/wallet/open-positions', async (req, res) => {
  try {
    const wallet = normalizeHyperliquidWallet(req.query.wallet);
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'valid Hyperliquid wallet address is required' });
    }
    const { data, stale } = await birdEyePerpsRequest(
      '/perps/v1/wallet/open_positions',
      { wallet },
      { ttlMs: 10_000, staleMs: 60_000 },
    );
    setPerpsResponseHeaders(res, stale, 10_000, 60_000);
    res.json(buildPerpsPayload(data, stale));
  } catch (e) { handleError(res, e); }
});

// ─── Token Data ────────────────────────────────────────────────────────────

router.get('/price/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/price', {
      address: req.params.address,
      include_liquidity: 'true',
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/token-overview/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_overview', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/token-metadata/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v3/token/meta-data/single', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/market-data/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v3/token/market-data', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/trade-data/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v3/token/trade-data/single', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/liquidity/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v3/token/liquidity/single', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/price-stats/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/price_stats', {
      address: req.params.address,
      address_type: 'token',
      time_from: Math.floor(Date.now() / 1000) - 86400,
      time_to: Math.floor(Date.now() / 1000),
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/security/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_security', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/token-creation/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_creation_info', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// Combined single call for token detail panel (overview + metadata)
router.get('/token-full/:address', async (req, res) => {
  try {
    const [overview, metadata] = await Promise.allSettled([
      birdEyeRequest('/defi/token_overview', { address: req.params.address }),
      birdEyeRequest('/defi/v3/token/meta-data/single', { address: req.params.address }),
    ]);
    res.json({
      success: true,
      data: {
        overview: overview.status === 'fulfilled' ? (overview.value as any).data : null,
        metadata: metadata.status === 'fulfilled' ? (metadata.value as any).data : null,
      },
    });
  } catch (e) { handleError(res, e); }
});

router.get('/token-intelligence/:address', async (req, res) => {
  const { address } = req.params;
  if (!TOKEN_ADDRESS_PATTERN.test(address)) {
    return res.status(400).json({ success: false, error: 'invalid token address' });
  }

  try {
    const [
      overview,
      metadata,
      marketData,
      tradeData,
      liquidity,
      security,
      creation,
      trackerToken,
      trackerHolders,
      trackerBundlers,
      trackerSnipersChart,
      trackerBundlersChart,
      trackerInsidersChart,
      trackerHoldersChart,
      dflowMarket,
      dflowLiveData,
      dflowTrades,
    ] = await Promise.all([
      captureSource(() => birdEyeRequest('/defi/token_overview', { address })),
      captureSource(() => birdEyeRequest('/defi/v3/token/meta-data/single', { address })),
      captureSource(() => birdEyeRequest('/defi/v3/token/market-data', { address })),
      captureSource(() => birdEyeRequest('/defi/v3/token/trade-data/single', { address })),
      captureSource(() => birdEyeRequest('/defi/v3/token/liquidity/single', { address })),
      captureSource(() => birdEyeRequest('/defi/token_security', { address })),
      captureSource(() => birdEyeRequest('/defi/token_creation_info', { address })),
      captureSource(() => solanaTrackerRequest(`/tokens/${encodeURIComponent(address)}`)),
      captureSource(() => solanaTrackerRequest(`/tokens/${encodeURIComponent(address)}/holders`)),
      captureSource(() => solanaTrackerRequest(`/tokens/${encodeURIComponent(address)}/bundlers`)),
      captureSource(() => solanaTrackerRequest(`/snipers/chart/${encodeURIComponent(address)}`)),
      captureSource(() => solanaTrackerRequest(`/bundlers/chart/${encodeURIComponent(address)}`)),
      captureSource(() => solanaTrackerRequest(`/insiders/chart/${encodeURIComponent(address)}`)),
      captureSource(() => solanaTrackerRequest(`/holders/chart/${encodeURIComponent(address)}`)),
      captureSource(() => dflowPredictionRequest(`/api/v1/market/by-mint/${encodeURIComponent(address)}`)),
      captureSource(() => dflowPredictionRequest(`/api/v1/live_data/by-mint/${encodeURIComponent(address)}`)),
      captureSource(() => dflowPredictionRequest(`/api/v1/trades/by-mint/${encodeURIComponent(address)}`, {
        limit: 10,
        sort_by: 'timestamp',
        sort_direction: 'desc',
      })),
    ]);

    const birdeye = { overview, metadata, marketData, tradeData, liquidity, security, creation };
    const ownership = {
      snipers: trackerSnipersChart,
      bundlers: trackerBundlersChart,
      insiders: trackerInsidersChart,
      holders: trackerHoldersChart,
    };
    const solanaTracker = { token: trackerToken, holders: trackerHolders, bundlers: trackerBundlers, ownership };
    const dflow = {
      configured: Boolean(process.env.DFLOW_API_KEY),
      market: dflowMarket,
      liveData: dflowLiveData,
      trades: dflowTrades,
    };
    const bubblemaps = {
      chain: 'solana',
      appUrl: buildBubblemapsUrl(address),
      firecrawlConfigured: Boolean(process.env.FIRECRAWL_API_KEY),
    };

    const overviewData = overview.data || {};
    const metadataData = metadata.data || {};
    const securityData = security.data || {};
    const trackerData = trackerToken.data || {};
    const trackerRisk = trackerData?.risk || trackerData?.data?.risk;
    const dflowMarketData = dflowMarket.data || {};

    const sources = { birdeye, solanaTracker, dflow, bubblemaps };
    const errors = [
      ...collectSourceErrors('birdeye', birdeye),
      ...collectSourceErrors('solanaTracker', solanaTracker),
      ...collectSourceErrors('dflow', dflow),
    ];
    const sourceStatuses = [
      overview, metadata, marketData, tradeData, liquidity, security, creation,
      trackerToken, trackerHolders, trackerBundlers, trackerSnipersChart, trackerBundlersChart,
      trackerInsidersChart, trackerHoldersChart, dflowMarket, dflowLiveData, dflowTrades,
    ];
    const summary = {
      symbol: overviewData.symbol || metadataData.symbol || trackerData?.token?.symbol || null,
      name: overviewData.name || metadataData.name || trackerData?.token?.name || null,
      price: overviewData.price ?? trackerData?.pools?.[0]?.price?.usd ?? null,
      liquidity: overviewData.liquidity ?? trackerData?.pools?.[0]?.liquidity?.usd ?? null,
      marketCap: overviewData.marketCap ?? trackerData?.pools?.[0]?.marketCap?.usd ?? null,
      holderCount: overviewData.holder ?? trackerData?.holders ?? trackerHolders.data?.total ?? null,
      top10HolderPercent: securityData.top10HolderPercent ?? null,
      creatorPercentage: securityData.creatorPercentage ?? null,
      riskScore: trackerRisk?.score ?? null,
      rugged: trackerRisk?.rugged ?? null,
      ownership: {
        snipersPercent: latestOwnershipValue('snipers', trackerSnipersChart),
        bundlersPercent: latestOwnershipValue('bundlers', trackerBundlersChart),
        insidersPercent: latestOwnershipValue('insiders', trackerInsidersChart),
        holders: latestOwnershipValue('holders', trackerHoldersChart),
      },
      dflowMarket: dflowMarket.available
        ? {
            ticker: dflowMarketData.ticker ?? dflowMarketData.market?.ticker ?? null,
            title: dflowMarketData.title ?? dflowMarketData.market?.title ?? null,
            status: dflowMarketData.status ?? dflowMarketData.market?.status ?? null,
          }
        : null,
    };

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      data: {
        address,
        summary,
        signals: buildIntelSignals(summary, bubblemaps.firecrawlConfigured),
        sourceCoverage: {
          total: sourceStatuses.length,
          available: sourceStatuses.filter((source) => source.available).length,
          unavailable: sourceStatuses.filter((source) => !source.available).length,
        },
        sources,
        errors,
      },
    });
  } catch (e) { handleError(res, e); }
});

router.post('/bubblemaps/ask', async (req, res) => {
  const address = String(req.body?.address || '');
  const prompt = String(req.body?.prompt || '').trim();
  const chain = String(req.body?.chain || 'solana').trim() || 'solana';

  if (!TOKEN_ADDRESS_PATTERN.test(address)) {
    return res.status(400).json({ success: false, error: 'invalid token address' });
  }
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'prompt required' });
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    return res.status(503).json({ success: false, error: 'Firecrawl API key is not configured' });
  }

  const mapUrl = buildBubblemapsUrl(address, chain);
  let scrapeId: string | null = null;

  try {
    const scrape = await firecrawlJson('/v2/scrape', {
      url: mapUrl,
      formats: ['markdown'],
      waitFor: 3000,
      timeout: 60000,
    });

    scrapeId = scrape?.data?.metadata?.scrapeId || scrape?.metadata?.scrapeId || scrape?.scrapeId || null;
    if (!scrapeId) {
      return res.status(502).json({
        success: false,
        error: 'Firecrawl scrape did not return an interactive session id',
        mapUrl,
      });
    }

    const interaction = await firecrawlJson(`/v2/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      prompt: [
        `You are looking at the Bubblemaps V2 page for ${chain} token ${address}.`,
        'Use only what is visible or inspectable on the live page.',
        'Focus on holder concentration, connected clusters, exchange/contract labels, suspicious wallet links, and notable transfer patterns.',
        `User question: ${prompt.slice(0, 1000)}`,
        'Answer concisely. If the page cannot load the map or a detail is not visible, say so explicitly.',
      ].join('\n'),
    });

    res.json({
      success: true,
      mapUrl,
      answer: interaction?.output || interaction?.data?.output || interaction?.result || interaction?.stdout || null,
      liveViewUrl: interaction?.liveViewUrl || interaction?.data?.liveViewUrl || null,
      interactiveLiveViewUrl: interaction?.interactiveLiveViewUrl || interaction?.data?.interactiveLiveViewUrl || null,
      raw: {
        exitCode: interaction?.exitCode ?? interaction?.data?.exitCode ?? null,
      },
    });
  } catch (e) {
    handleError(res, e);
  } finally {
    if (scrapeId) {
      try {
        await firecrawlJson(`/v2/scrape/${encodeURIComponent(scrapeId)}/interact`, undefined, 'DELETE');
      } catch {
        // Best-effort session cleanup.
      }
    }
  }
});

// ─── OHLCV & Price ────────────────────────────────────────────────────────

router.get('/ohlcv/:address', async (req, res) => {
  try {
    const typeParam = (req.query.type as string) || '15m';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    const now = Math.floor(Date.now() / 1000);
    const interval = chartTypeToSeconds[typeParam] || 900;
    const time_from = Number(req.query.time_from) || now - interval * limit;
    const time_to = Number(req.query.time_to) || now;

    let data: any;
    let source = 'birdeye-v3';
    try {
      data = await birdEyeRequest('/defi/v3/ohlcv', {
        address: req.params.address,
        type: typeParam,
        currency: 'usd',
        time_from,
        time_to,
        ui_amount_mode: 'scaled',
        mode: 'range',
        padding: 'false',
      });
    } catch {
      source = 'birdeye-v1';
      data = await birdEyeRequest('/defi/ohlcv', {
        address: req.params.address,
        type: typeParam,
        currency: 'usd',
        time_from,
        time_to,
        ui_amount_mode: 'scaled',
      });
    }

    let items = normalizeOhlcvItems(data?.data?.items || [], source);
    let fallbackError: string | undefined;

    if (items.length === 0) {
      try {
        const tracker = await solanaTrackerChart(req.params.address, {
          type: typeParam,
          time_from,
          time_to,
          currency: 'usd',
          removeOutliers: 'true',
          dynamicPools: 'true',
        });
        data = tracker.raw;
        items = tracker.items;
        source = 'solana-tracker';
      } catch (error) {
        fallbackError = error instanceof Error ? error.message : 'Solana Tracker fallback failed';
      }
    }

    res.json({
      ...data,
      success: data?.success !== false,
      source,
      fallbackError,
      data: { ...(data?.data || {}), items, source },
    });
  } catch (e) {
    console.error('[BirdEye OHLCV]', e);
    try {
      const typeParam = (req.query.type as string) || '15m';
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
      const now = Math.floor(Date.now() / 1000);
      const interval = chartTypeToSeconds[typeParam] || 900;
      const time_from = Number(req.query.time_from) || now - interval * limit;
      const time_to = Number(req.query.time_to) || now;
      const tracker = await solanaTrackerChart(req.params.address, {
        type: typeParam,
        time_from,
        time_to,
        currency: 'usd',
        removeOutliers: 'true',
        dynamicPools: 'true',
      });
      res.json({
        success: true,
        source: 'solana-tracker',
        birdeyeError: e instanceof Error ? e.message : 'BirdEye OHLCV unavailable',
        data: { ...(tracker.raw?.data || {}), items: tracker.items, source: 'solana-tracker' },
      });
    } catch (fallback) {
      res.json({
        success: false,
        error: fallback instanceof Error ? fallback.message : e instanceof Error ? e.message : 'OHLCV unavailable',
        data: { items: [], source: 'unavailable' },
      });
    }
  }
});

// ─── Pairs ─────────────────────────────────────────────────────────────────

router.get('/pair-overview/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v3/pair/overview/single', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/token-pairs/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v2/markets', {
      token: req.params.address,
      sort_by: 'liquidity',
      sort_type: 'desc',
      offset: 0,
      limit: 10,
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Transactions & Traders ───────────────────────────────────────────────

router.get('/transactions/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/txs/token', {
      address: req.params.address,
      tx_type: (req.query.tx_type as string) || 'swap',
      sort_type: 'desc',
      offset: 0,
      limit: Number(req.query.limit) || 20,
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.get('/top-traders/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/v2/tokens/top_traders', {
      address: req.params.address,
      time_frame: (req.query.time_frame as string) || '24h',
      sort_by: (req.query.sort_by as string) || 'volume',
      sort_type: 'desc',
      offset: 0,
      limit: Number(req.query.limit) || 10,
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

router.post('/all-time-trades', async (req, res) => {
  try {
    const { addresses, time_frame } = req.body;
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ success: false, error: 'addresses array required' });
    }
    const results: Record<string, any> = {};
    await Promise.all(
      addresses.slice(0, 5).map(async (addr: string) => {
        try {
          const d = await birdEyeRequest('/defi/txs/token', {
            address: addr,
            tx_type: 'swap',
            sort_type: 'desc',
            offset: 0,
            limit: 20,
          });
          results[addr] = (d as any).data;
        } catch {}
      })
    );
    res.json({ success: true, data: results });
  } catch (e) { handleError(res, e); }
});

// ─── Search ───────────────────────────────────────────────────────────────

router.get('/search-tokens', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ success: false, error: 'query required' });

    // Try v3 search first, fall back to token_list search
    try {
      const data = await birdEyeRequest('/defi/v3/search', {
        keyword: query,
        target: 'token',
        sort_by: 'liquidity',
        sort_type: 'desc',
        offset: 0,
        limit: 20,
      });
      return res.json(data);
    } catch {
      // Fallback to trending list filtered by keyword
      const data = await birdEyeRequest('/defi/token_trending', {
        sort_by: 'rank',
        sort_type: 'asc',
        offset: 0,
        limit: 20,
      });
      return res.json(data);
    }
  } catch (e) { handleError(res, e); }
});

// Keep legacy /token/:address for backward compat
router.get('/token/:address', async (req, res) => {
  try {
    const data = await birdEyeRequest('/defi/token_overview', { address: req.params.address });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── AI Analysis ─────────────────────────────────────────────────────────

router.post('/analyze-token', async (req, res) => {
  try {
    const { address, chart_image } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'address required' });

    // Fetch token overview for context
    let overview: any = null;
    try {
      const d: any = await birdEyeRequest('/defi/token_overview', { address });
      overview = d.data;
    } catch {}

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY });

    const messages: any[] = [
      {
        role: 'system',
        content: `You are Clawd, an expert DeFi analyst on Solana. Analyze this token and provide concise, actionable insights. Focus on: price action, volume, liquidity health, risk factors, and sentiment. Be direct and use emojis sparingly. Max 200 words.`,
      },
      {
        role: 'user',
        content: chart_image
          ? [
              {
                type: 'text',
                text: `Analyze token ${address}${overview ? `. Symbol: ${overview.symbol}, Price: $${overview.price?.toFixed(6)}, 24h change: ${overview.priceChange24hPercent?.toFixed(2)}%, Volume 24h: $${(overview.volume24hUSD || 0).toLocaleString()}, Liquidity: $${(overview.liquidity || 0).toLocaleString()}, Market Cap: $${(overview.marketCap || 0).toLocaleString()}` : ''}. Chart attached.`,
              },
              { type: 'image_url', image_url: { url: chart_image, detail: 'low' } },
            ]
          : `Analyze token ${address}${overview ? `. Symbol: ${overview.symbol}, Price: $${overview.price?.toFixed(6)}, 24h change: ${overview.priceChange24hPercent?.toFixed(2)}%, Volume 24h: $${(overview.volume24hUSD || 0).toLocaleString()}, Liquidity: $${(overview.liquidity || 0).toLocaleString()}, Market Cap: $${(overview.marketCap || 0).toLocaleString()}` : ''}`,
      },
    ];

    const baseURL = process.env.OPENAI_API_KEY ? undefined : 'https://api.x.ai/v1';
    const model = process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'grok-3-mini-beta';

    const completion = await new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    }).chat.completions.create({ model, messages, max_tokens: 300 });

    res.json({
      success: true,
      chart_analysis: completion.choices[0].message.content,
      token_data: overview,
    });
  } catch (e) { handleError(res, e); }
});

// Multiple token metadata
router.get('/tokens-metadata', async (req, res) => {
  try {
    const addresses = req.query.addresses as string;
    if (!addresses) return res.status(400).json({ success: false, error: 'addresses required' });
    const data = await birdEyeRequest('/defi/v3/token/meta-data/multiple', {
      list_address: addresses,
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Wallet APIs ─────────────────────────────────────────────────────────

// GET /api/birdeye/wallet/net-worth?wallet=ADDRESS
router.get('/wallet/net-worth', async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' });
    const url = `${BIRDEYE_BASE}/wallet/v2/current-net-worth?wallet=${wallet}&sort_by=value&sort_type=desc&limit=50&flags[]=include_low_liquidity`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-chain': 'solana',
        'x-api-key': BIRDEYE_API_KEY!,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BirdEye error ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// GET /api/birdeye/wallet/pnl?wallet=ADDRESS&duration=all
router.get('/wallet/pnl', async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' });
    const duration = (req.query.duration as string) || 'all';
    const data = await birdEyeRequest('/wallet/v2/pnl/summary', { wallet, duration });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// POST /api/birdeye/wallet/token-balance  { wallet, token_addresses }
router.post('/wallet/token-balance', async (req, res) => {
  try {
    const { wallet, token_addresses } = req.body;
    if (!wallet || !token_addresses?.length) {
      return res.status(400).json({ success: false, error: 'wallet and token_addresses required' });
    }
    const data = await birdEyePost('/wallet/v2/token-balance', { wallet, token_addresses });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

export default router;
