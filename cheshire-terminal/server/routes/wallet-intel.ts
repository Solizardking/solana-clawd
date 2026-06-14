import { Router } from "express";
import { z } from "zod";
import { getWalletAccessState } from "../lib/access-control";
import { CLAWD_MINT } from "../lib/clawd-balance";
import { heliusRpc } from "../lib/helius/transactionOptimization";

const router = Router();

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const walletSchema = z.string().regex(SOLANA_ADDRESS_RE, "Invalid Solana wallet address");

type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

type NormalizedNetWorthChartPoint = {
  time: number;
  value: number;
  change: number;
  changePercent: number;
};

const summaryCache = new Map<string, CacheEntry<any>>();
const leaderboardCache = new Map<string, CacheEntry<any>>();
const perpsCache = new Map<string, CacheEntry<any>>();

function birdeyeKey() {
  return process.env.BIRDEYE_API_KEY?.trim() || "";
}

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.data;
}

function cacheSet<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function birdeyeGet(endpoint: string, params: Record<string, string | number | boolean | undefined>, chain = "solana") {
  const key = birdeyeKey();
  if (!key) throw new Error("BIRDEYE_API_KEY is not configured");
  const qs = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      qs.append(name, String(value));
    }
  }
  const response = await fetch(`${BIRDEYE_BASE}${endpoint}${qs.size ? `?${qs.toString()}` : ""}`, {
    headers: {
      accept: "application/json",
      "x-chain": chain,
      "x-api-key": key,
    },
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    const message = json?.message || json?.error || text || response.statusText;
    throw new Error(`Birdeye ${response.status}: ${String(message).slice(0, 220)}`);
  }
  return json;
}

async function birdeyePerpsGet(endpoint: string, params: Record<string, string | number | boolean | undefined>) {
  const key = birdeyeKey();
  if (!key) throw new Error("BIRDEYE_API_KEY is not configured");
  const qs = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      qs.append(name, String(value));
    }
  }
  const response = await fetch(`${BIRDEYE_BASE}${endpoint}${qs.size ? `?${qs.toString()}` : ""}`, {
    headers: {
      accept: "application/json",
      "x-perp": "hyperliquid",
      "X-API-KEY": key,
    },
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    const message = json?.message || json?.error || text || response.statusText;
    throw new Error(`Birdeye perps ${response.status}: ${String(message).slice(0, 220)}`);
  }
  return json;
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function birdeyeUtcTime(date = new Date()) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function timestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeNetWorth(raw: any) {
  const data = raw?.data ?? raw ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    totalValue: numberValue(data.total_value ?? data.totalValue ?? data.value),
    currency: String(data.currency || "USD"),
    items: items.slice(0, 12).map((item: any) => ({
      address: String(item.address ?? item.mint ?? ""),
      name: String(item.name ?? item.symbol ?? "Unknown"),
      symbol: String(item.symbol ?? "???"),
      logoUri: item.logo_uri ?? item.logoURI ?? item.logo ?? null,
      amount: numberValue(item.amount ?? item.uiAmount),
      price: numberValue(item.price),
      value: numberValue(item.value),
      decimals: numberValue(item.decimals, 0),
    })),
  };
}

function normalizeNetWorthChart(raw: any) {
  const data = raw?.data ?? raw ?? {};
  const history: any[] = Array.isArray(data.history) ? data.history : [];
  return history
    .map((item: any): NormalizedNetWorthChartPoint => ({
      time: timestampMs(item.timestamp ?? item.time ?? item.date),
      value: numberValue(item.net_worth ?? item.netWorth ?? item.total_value ?? item.value),
      change: numberValue(item.net_worth_change ?? item.netWorthChange, 0),
      changePercent: numberValue(item.net_worth_change_percent ?? item.netWorthChangePercent, 0),
    }))
    .filter((point: NormalizedNetWorthChartPoint) => point.time > 0 && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);
}

function normalizePnl(raw: any) {
  const summary = raw?.data?.summary ?? raw?.summary ?? raw?.data ?? {};
  const pnl = summary.pnl ?? summary;
  const counts = summary.counts ?? {};
  return {
    totalUsd: numberValue(pnl.total_usd ?? pnl.totalUsd ?? pnl.pnl),
    realizedUsd: numberValue(pnl.realized_profit_usd ?? pnl.realizedUsd),
    realizedPct: numberValue(pnl.realized_profit_percent ?? pnl.realizedPct),
    unrealizedUsd: numberValue(pnl.unrealized_usd ?? pnl.unrealizedUsd),
    winRate: numberValue(counts.win_rate ?? summary.win_rate),
    totalBuy: numberValue(counts.total_buy ?? summary.total_buy),
    totalSell: numberValue(counts.total_sell ?? summary.total_sell),
  };
}

function buildNetWorthSeries(totalValue: number, pnlTotalUsd: number) {
  const now = Date.now();
  const points = 14;
  const startValue = Math.max(0, totalValue - pnlTotalUsd);
  return Array.from({ length: points }, (_, index) => {
    const progress = index / (points - 1);
    const drift = startValue + (totalValue - startValue) * progress;
    const wave = Math.sin(progress * Math.PI * 3) * Math.max(totalValue, 1) * 0.012;
    return {
      time: now - (points - 1 - index) * 12 * 60 * 60 * 1000,
      value: Math.max(0, index === points - 1 ? totalValue : drift + wave),
    };
  });
}

function normalizeAssets(raw: any) {
  const items = raw?.items ?? raw?.result?.items ?? [];
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((asset: any) => ({
    id: String(asset.id ?? ""),
    interface: asset.interface ?? null,
    name: asset.content?.metadata?.name ?? asset.token_info?.symbol ?? "Asset",
    symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? "",
    image: asset.content?.links?.image ?? asset.content?.files?.[0]?.uri ?? null,
    balance: numberValue(asset.token_info?.balance ?? asset.token_info?.token_amount),
    decimals: numberValue(asset.token_info?.decimals, 0),
  }));
}

function normalizeAssetLeaderboard(raw: any) {
  const data = raw?.data ?? raw ?? {};
  const items =
    data.items ??
    data.wallets ??
    data.leaderboard ??
    (Array.isArray(data) ? data : []);
  if (!Array.isArray(items)) return [];
  return items.slice(0, 10).map((item: any, index: number) => ({
    rank: index + 1,
    wallet: String(item.owner ?? item.wallet ?? item.address ?? ""),
    totalValue: numberValue(item.total_value ?? item.totalValue ?? item.value),
    currency: String(item.currency || "USD"),
  }));
}

function normalizePerpsList(raw: any) {
  const data = raw?.data ?? raw ?? {};
  const items = data.items ?? (Array.isArray(data) ? data : []);
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((item: any) => ({
    token: String(item.token ?? item.symbol ?? "").toUpperCase(),
    openInterest: numberValue(item.open_interest ?? item.openInterest),
    longOi: numberValue(item.long_io ?? item.longOi),
    shortOi: numberValue(item.short_io ?? item.shortOi),
    margin: numberValue(item.margin),
    unrealizedPnl: numberValue(item.unrealized_pnl ?? item.unrealizedPnl),
    bias: numberValue(item.bias),
    biasText: item.bias_text ?? item.biasText ?? "Neutral",
    leverage: numberValue(item.leverage),
  }));
}

router.get("/summary", async (req, res) => {
  try {
    const wallet = walletSchema.parse(String(req.query.wallet || ""));
    const cacheKey = `summary:${wallet}`;
    const cached = cacheGet(summaryCache, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const [access, netWorthRaw, chartRaw, pnlRaw, assetsRaw] = await Promise.allSettled([
      getWalletAccessState(wallet),
      birdeyeGet("/wallet/v2/current-net-worth", {
        wallet,
        sort_by: "value",
        sort_type: "desc",
        limit: 50,
        "flags[]": "include_low_liquidity",
      }),
      birdeyeGet("/wallet/v2/net-worth", {
        wallet,
        count: 30,
        direction: "back",
        time: birdeyeUtcTime(),
        type: "1d",
        sort_type: "asc",
      }),
      birdeyeGet("/wallet/v2/pnl/summary", { wallet, duration: "all" }),
      heliusRpc("getAssetsByOwner", {
        ownerAddress: wallet,
        page: 1,
        limit: 80,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
          showGrandTotal: true,
          showZeroBalance: false,
        },
      }, { requestId: "wallet-intel-assets", timeoutMs: 6_000 }),
    ]);

    const accessState =
      access.status === "fulfilled"
        ? access.value
        : { allowed: false, isAdmin: false, balance: 0, holderMinimum: Number(process.env.CLAWD_HOLDER_MIN ?? "1") };
    const netWorth = netWorthRaw.status === "fulfilled" ? normalizeNetWorth(netWorthRaw.value) : null;
    const pnl = pnlRaw.status === "fulfilled" ? normalizePnl(pnlRaw.value) : null;
    const assets = assetsRaw.status === "fulfilled" ? normalizeAssets(assetsRaw.value) : [];
    const netWorthValue = netWorth?.totalValue ?? 0;
    const historicalChart = chartRaw.status === "fulfilled" ? normalizeNetWorthChart(chartRaw.value) : [];
    const fallbackChart = netWorthValue > 0 ? buildNetWorthSeries(netWorthValue, pnl?.totalUsd ?? 0) : [];
    const chart = historicalChart.length ? historicalChart : fallbackChart;

    const data = {
      success: true,
      wallet,
      clawd: {
        mint: CLAWD_MINT,
        balance: accessState.balance,
        isHolder: accessState.allowed,
        isAdmin: accessState.isAdmin,
        holderMinimum: accessState.holderMinimum,
      },
      netWorth,
      pnl,
      assets,
      netWorthChart: {
        source: historicalChart.length ? "birdeye-wallet-v2-net-worth" : "current-net-worth+pnl-estimate",
        points: chart,
      },
      sources: {
        birdeyeConfigured: Boolean(birdeyeKey()),
        heliusConfigured: Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY),
      },
      generatedAt: new Date().toISOString(),
    };

    cacheSet(summaryCache, cacheKey, data, 15_000);
    return res.json(data);
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : "Wallet intelligence lookup failed",
    });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 100);
    const offset = Math.min(Math.max(Number(req.query.offset) || 0, 0), 10_000);
    const fromValue = Number(req.query.from_value);
    const toValue = Number(req.query.to_value);
    const cacheKey = [
      "leaderboard:total-assets",
      limit,
      offset,
      Number.isFinite(fromValue) ? fromValue : "",
      Number.isFinite(toValue) ? toValue : "",
    ].join(":");
    const cached = cacheGet(leaderboardCache, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const raw = await birdeyeGet("/wallet/v2/leaderboard", {
      limit,
      offset,
      from_value: Number.isFinite(fromValue) && fromValue >= 100_000 ? fromValue : undefined,
      to_value: Number.isFinite(toValue) && toValue >= 100_000 ? toValue : undefined,
    });
    const wallets = normalizeAssetLeaderboard(raw);
    const data = {
      success: true,
      type: "total_asset_leaderboard",
      sort: "total_asset_value_desc",
      source: "birdeye-wallet-v2-leaderboard",
      wallets,
      generatedAt: new Date().toISOString(),
    };
    cacheSet(leaderboardCache, cacheKey, data, 20_000);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Leaderboard lookup failed",
    });
  }
});

router.get("/perps-overview", async (req, res) => {
  try {
    const cacheKey = "perps-overview:hyperliquid";
    const cached = cacheGet(perpsCache, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const raw = await birdeyePerpsGet(
      "/perps/v1/token/list",
      { time_frame: "all", sort_by: "open_interest", sort_type: "desc", offset: 0, limit: 8 },
    );
    const markets = normalizePerpsList(raw);
    const totals = markets.reduce(
      (acc, market) => {
        acc.openInterest += market.openInterest;
        acc.longOi += market.longOi;
        acc.shortOi += market.shortOi;
        acc.unrealizedPnl += market.unrealizedPnl;
        return acc;
      },
      { openInterest: 0, longOi: 0, shortOi: 0, unrealizedPnl: 0 },
    );
    const data = {
      success: true,
      exchange: "hyperliquid",
      markets,
      totals,
      generatedAt: new Date().toISOString(),
    };
    cacheSet(perpsCache, cacheKey, data, 15_000);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Perps overview lookup failed",
    });
  }
});

export default router;
