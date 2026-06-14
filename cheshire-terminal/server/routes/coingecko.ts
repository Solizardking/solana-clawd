// @ts-nocheck
import { Router } from "express";
import type { Response } from "express";

const router = Router();

// CoinGecko key types:
//   CG-xxx  = Demo key  → api.coingecko.com,     x-cg-demo-api-key header
//   (other) = Pro key   → pro-api.coingecko.com, x-cg-pro-api-key header
const CG_PRO_BASE  = "https://pro-api.coingecko.com/api/v3";
const CG_FREE_BASE = "https://api.coingecko.com/api/v3";

function getHeaders() {
  const key = process.env.COINGECKO_API_KEY;
  if (!key) return { accept: "application/json" };
  const isDemo = key.startsWith("CG-");
  return isDemo
    ? { "x-cg-demo-api-key": key, accept: "application/json" }
    : { "x-cg-pro-api-key":  key, accept: "application/json" };
}

function base() {
  const key = process.env.COINGECKO_API_KEY;
  if (key && !key.startsWith("CG-")) return CG_PRO_BASE;
  return CG_FREE_BASE;
}

async function cgFetch(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinGecko ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function handleError(res: Response, e: unknown) {
  console.error("[coingecko]", e);
  res.status(502).json({ error: String(e) });
}

// ─── Global Market Stats ──────────────────────────────────────────────────────

// GET /api/coingecko/global
router.get("/global", async (_req, res) => {
  try {
    const data = await cgFetch("/global");
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Coins ─────────────────────────────────────────────────────────────────────

// GET /api/coingecko/trending
router.get("/trending", async (_req, res) => {
  try {
    const data = await cgFetch("/search/trending");
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// GET /api/coingecko/markets?vs_currency=usd&ids=bitcoin,ethereum&category=...&order=market_cap_desc&per_page=50&page=1&sparkline=false
router.get("/markets", async (req, res) => {
  try {
    const {
      vs_currency = "usd",
      ids,
      category,
      order = "market_cap_desc",
      per_page = "50",
      page = "1",
      sparkline = "false",
      price_change_percentage = "1h,24h,7d",
    } = req.query as Record<string, string>;

    const params: Record<string, string | number> = {
      vs_currency,
      order,
      per_page,
      page,
      sparkline,
      price_change_percentage,
    };
    if (ids) params.ids = ids;
    if (category) params.category = category;

    const data = await cgFetch("/coins/markets", params);
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// GET /api/coingecko/coin/:id — full coin detail (description, links, market_data, etc.)
router.get("/coin/:id", async (req, res) => {
  try {
    const data = await cgFetch(`/coins/${req.params.id}`, {
      localization: "false",
      tickers: "false",
      market_data: "true",
      community_data: "false",
      developer_data: "false",
      sparkline: "false",
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// GET /api/coingecko/coin/:id/ohlc?vs_currency=usd&days=30
router.get("/coin/:id/ohlc", async (req, res) => {
  try {
    const { vs_currency = "usd", days = "30" } = req.query as Record<string, string>;
    const data = await cgFetch(`/coins/${req.params.id}/ohlc`, { vs_currency, days });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// GET /api/coingecko/coin/:id/chart?vs_currency=usd&days=30&interval=daily
router.get("/coin/:id/chart", async (req, res) => {
  try {
    const { vs_currency = "usd", days = "30", interval = "daily" } = req.query as Record<string, string>;
    const data = await cgFetch(`/coins/${req.params.id}/market_chart`, { vs_currency, days, interval });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Simple Price ─────────────────────────────────────────────────────────────

// GET /api/coingecko/price?ids=bitcoin,solana,ethereum&vs_currencies=usd&include_24hr_change=true
router.get("/price", async (req, res) => {
  try {
    const {
      ids = "solana,bitcoin,ethereum",
      vs_currencies = "usd",
      include_24hr_change = "true",
      include_market_cap = "true",
      include_24hr_vol = "true",
    } = req.query as Record<string, string>;
    const data = await cgFetch("/simple/price", {
      ids,
      vs_currencies,
      include_24hr_change,
      include_market_cap,
      include_24hr_vol,
    });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// GET /api/coingecko/price/contract/:platform/:address?vs_currencies=usd
// e.g. platform = "ethereum", address = "0x..."
router.get("/price/contract/:platform/:address", async (req, res) => {
  try {
    const { vs_currencies = "usd", include_24hr_change = "true" } = req.query as Record<string, string>;
    const data = await cgFetch(
      `/simple/token_price/${req.params.platform}`,
      { contract_addresses: req.params.address, vs_currencies, include_24hr_change }
    );
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Search ───────────────────────────────────────────────────────────────────

// GET /api/coingecko/search?query=solana
router.get("/search", async (req, res) => {
  try {
    const { query = "" } = req.query as Record<string, string>;
    if (!query) return res.json({ coins: [], exchanges: [], icos: [], categories: [], nfts: [] });
    const data = await cgFetch("/search", { query });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Categories ───────────────────────────────────────────────────────────────

// GET /api/coingecko/categories?order=market_cap_desc
router.get("/categories", async (req, res) => {
  try {
    const { order = "market_cap_desc" } = req.query as Record<string, string>;
    const data = await cgFetch("/coins/categories", { order });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── DeFi / NFT Stats ─────────────────────────────────────────────────────────

// GET /api/coingecko/defi
router.get("/defi", async (_req, res) => {
  try {
    const data = await cgFetch("/global/decentralized_finance_defi");
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Exchanges ─────────────────────────────────────────────────────────────────

// GET /api/coingecko/exchanges?per_page=20&page=1
router.get("/exchanges", async (req, res) => {
  try {
    const { per_page = "20", page = "1" } = req.query as Record<string, string>;
    const data = await cgFetch("/exchanges", { per_page, page });
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Asset Platforms ──────────────────────────────────────────────────────────

// GET /api/coingecko/asset-platforms  (Solana = "solana")
router.get("/asset-platforms", async (_req, res) => {
  try {
    const data = await cgFetch("/asset_platforms");
    res.json(data);
  } catch (e) { handleError(res, e); }
});

export default router;
