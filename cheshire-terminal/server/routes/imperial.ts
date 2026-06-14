import type { Request, Response } from "express";
import { Router } from "express";
import fetch from "node-fetch";

const router = Router();

const IMPERIAL_API_BASE = (process.env.IMPERIAL_API_BASE || "https://api.imperial.space").replace(/\/$/, "");
const RPC_URL =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  process.env.VITE_HELIUS_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const DEFAULT_TTL_MS = 5_000;
const DEFAULT_STALE_MS = 45_000;

type CacheEntry = {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
};

const cache = new Map<string, CacheEntry>();

const forwardedQueryKeys = [
  "asset",
  "side",
  "notional",
  "desiredLeverage",
  "symbol",
  "symbols",
  "venue",
  "wallet",
  "profileIndex",
  "index",
  "market",
  "limit",
  "offset",
  "from",
  "to",
  "start",
  "end",
  "interval",
  "underwriter",
] as const;

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return value[0] == null ? "" : String(value[0]);
  return value == null ? "" : String(value);
}

function appendForwardedQuery(req: Request) {
  const qs = new URLSearchParams();
  for (const key of forwardedQueryKeys) {
    const value = firstQueryValue(req.query[key]);
    if (!value) continue;
    qs.set(key, value.slice(0, 180));
  }
  return qs.toString();
}

function setCacheHeaders(res: Response, ttlMs: number, staleMs: number, stale: boolean) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(staleMs / 1000)}`,
  );
  if (stale) res.setHeader("X-Imperial-Stale", "1");
}

async function cachedImperialGet(
  upstreamPath: string,
  req: Request,
  {
    ttlMs = DEFAULT_TTL_MS,
    staleMs = DEFAULT_STALE_MS,
  }: {
    ttlMs?: number;
    staleMs?: number;
  } = {},
) {
  const qs = appendForwardedQuery(req);
  const path = `${upstreamPath}${qs ? `?${qs}` : ""}`;
  const cacheKey = `GET ${path}`;
  const now = Date.now();
  const entry = cache.get(cacheKey);
  if (entry && entry.expiresAt > now) return { data: entry.data, stale: false };

  try {
    const response = await fetch(`${IMPERIAL_API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message =
        typeof data === "object" && data && "error" in data
          ? String((data as { error?: unknown }).error)
          : text.slice(0, 240);
      throw new Error(`Imperial ${response.status}: ${message || upstreamPath}`);
    }

    cache.set(cacheKey, {
      data,
      expiresAt: now + ttlMs,
      staleUntil: now + staleMs,
    });
    return { data, stale: false };
  } catch (error) {
    const stale = cache.get(cacheKey);
    if (stale && stale.staleUntil > now) return { data: stale.data, stale: true };
    throw error;
  }
}

function rpcProviderLabel() {
  if (RPC_URL.includes("helius-rpc.com")) return "helius";
  if (RPC_URL.includes("mainnet-beta.solana.com")) return "public-mainnet";
  return "custom";
}

async function readRpcStatus() {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "imperial-desk-slot",
        method: "getSlot",
        params: [{ commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await response.json()) as { result?: number; error?: { message?: string } };
    return {
      ok: response.ok && typeof json.result === "number",
      provider: rpcProviderLabel(),
      slot: typeof json.result === "number" ? json.result : null,
      error: json.error?.message ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      provider: rpcProviderLabel(),
      slot: null,
      error: error instanceof Error ? error.message : "RPC unavailable",
    };
  }
}

function sendError(res: Response, error: unknown, label = "Imperial API unavailable") {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(502).json({ success: false, error: label, detail: message });
}

router.get("/status", async (req: Request, res: Response) => {
  try {
    const [imperial, rpc] = await Promise.allSettled([
      cachedImperialGet("/api/v1/status", req, { ttlMs: 10_000, staleMs: 60_000 }),
      readRpcStatus(),
    ]);

    const upstream =
      imperial.status === "fulfilled"
        ? { ok: true, stale: imperial.value.stale, data: imperial.value.data }
        : { ok: false, stale: false, data: null, error: imperial.reason instanceof Error ? imperial.reason.message : String(imperial.reason) };

    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      data: {
        upstream,
        rpc: rpc.status === "fulfilled" ? rpc.value : { ok: false, provider: rpcProviderLabel(), slot: null, error: "RPC status unavailable" },
        imperialBase: "api.imperial.space",
        imperialTradingConfigured: Boolean(process.env.IMPERIAL_JWT || process.env.IMPERIAL_API_KEY),
        phoenixUnderwriter: 2,
      },
    });
  } catch (error) {
    sendError(res, error, "Imperial status unavailable");
  }
});

router.get("/funding-rates", async (req: Request, res: Response) => {
  try {
    const { data, stale } = await cachedImperialGet("/api/v1/funding-rates", req, {
      ttlMs: 8_000,
      staleMs: 60_000,
    });
    setCacheHeaders(res, 8_000, 60_000, stale);
    res.json({ success: true, data, meta: { stale, source: "imperial" } });
  } catch (error) {
    sendError(res, error, "Imperial funding rates unavailable");
  }
});

router.get("/mark-prices", async (req: Request, res: Response) => {
  try {
    const { data, stale } = await cachedImperialGet("/api/v1/mark-prices", req, {
      ttlMs: 5_000,
      staleMs: 45_000,
    });
    setCacheHeaders(res, 5_000, 45_000, stale);
    res.json({ success: true, data, meta: { stale, source: "imperial" } });
  } catch (error) {
    sendError(res, error, "Imperial mark prices unavailable");
  }
});

router.get("/route", async (req: Request, res: Response) => {
  const asset = firstQueryValue(req.query.asset).trim().toUpperCase();
  const side = firstQueryValue(req.query.side).trim().toLowerCase();
  const notional = Number(firstQueryValue(req.query.notional));
  const desiredLeverage = Number(firstQueryValue(req.query.desiredLeverage));

  if (!/^[A-Z0-9]{1,16}$/.test(asset)) {
    return res.status(400).json({ success: false, error: "valid asset is required" });
  }
  if (!["long", "short", "bid", "ask", "0", "1"].includes(side)) {
    return res.status(400).json({ success: false, error: "valid side is required" });
  }
  if (!Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) {
    return res.status(400).json({ success: false, error: "valid notional is required" });
  }
  if (!Number.isFinite(desiredLeverage) || desiredLeverage <= 0 || desiredLeverage > 200) {
    return res.status(400).json({ success: false, error: "valid desiredLeverage is required" });
  }

  try {
    const { data, stale } = await cachedImperialGet("/api/v1/route", req, {
      ttlMs: 3_000,
      staleMs: 30_000,
    });
    setCacheHeaders(res, 3_000, 30_000, stale);
    res.json({ success: true, data, meta: { stale, source: "imperial" } });
  } catch (error) {
    sendError(res, error, "Imperial route unavailable");
  }
});

router.get("/phoenix/depth", async (req: Request, res: Response) => {
  try {
    const { data, stale } = await cachedImperialGet("/api/v1/phoenix/depth", req, {
      ttlMs: 2_000,
      staleMs: 20_000,
    });
    setCacheHeaders(res, 2_000, 20_000, stale);
    res.json({ success: true, data, meta: { stale, source: "imperial" } });
  } catch (error) {
    sendError(res, error, "Imperial Phoenix depth unavailable");
  }
});

router.get("/phoenix/markets", async (req: Request, res: Response) => {
  try {
    const { data, stale } = await cachedImperialGet("/api/v1/phoenix/markets", req, {
      ttlMs: 30_000,
      staleMs: 300_000,
    });
    setCacheHeaders(res, 30_000, 300_000, stale);
    res.json({ success: true, data, meta: { stale, source: "imperial" } });
  } catch (error) {
    sendError(res, error, "Imperial Phoenix markets unavailable");
  }
});

const readRoutes: Record<string, { upstream: string; ttlMs: number; staleMs: number }> = {
  "/orders": { upstream: "/api/v1/orders", ttlMs: 5_000, staleMs: 30_000 },
  "/positions": { upstream: "/api/v1/positions", ttlMs: 5_000, staleMs: 30_000 },
  "/pnl-history": { upstream: "/api/v1/pnl-history", ttlMs: 30_000, staleMs: 180_000 },
  "/priority-fee": { upstream: "/api/v1/priority-fee", ttlMs: 5_000, staleMs: 30_000 },
  "/stats/markets": { upstream: "/api/v1/stats/markets", ttlMs: 20_000, staleMs: 120_000 },
  "/stats/open-interest": { upstream: "/api/v1/stats/open-interest", ttlMs: 20_000, staleMs: 120_000 },
  "/stats/summary": { upstream: "/api/v1/stats/summary", ttlMs: 20_000, staleMs: 120_000 },
  "/stats/volume": { upstream: "/api/v1/stats/volume", ttlMs: 20_000, staleMs: 120_000 },
  "/trades": { upstream: "/api/v1/trades", ttlMs: 5_000, staleMs: 30_000 },
};

for (const [localPath, config] of Object.entries(readRoutes)) {
  router.get(localPath, async (req: Request, res: Response) => {
    try {
      const { data, stale } = await cachedImperialGet(config.upstream, req, config);
      setCacheHeaders(res, config.ttlMs, config.staleMs, stale);
      res.json({ success: true, data, meta: { stale, source: "imperial" } });
    } catch (error) {
      sendError(res, error);
    }
  });
}

export default router;
