import { Router } from "express";

// Jupiter Tokens API V2 — search, tag, category, recent + Express Verification.
const BASE = (process.env.JUPITER_TOKENS_BASE || "https://api.jup.ag/tokens/v2").replace(/\/$/, "");
const HEADERS = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(process.env.JUPITER_API_KEY ? { Authorization: `Bearer ${process.env.JUPITER_API_KEY}` } : {}),
  ...extra,
});

const router = Router();

async function forwardGet(path: string, params?: URLSearchParams) {
  const url = params && params.toString() ? `${BASE}${path}?${params}` : `${BASE}${path}`;
  const r = await fetch(url, { headers: HEADERS() });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function forwardJson(method: "POST", path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

// ─── Search ──────────────────────────────────────────────────────────────────

// GET /api/jupiter-tokens/search?query=<symbol|name|mint|csv-of-mints>
router.get("/search", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });
  try {
    const params = new URLSearchParams({ query: String(query) });
    const { ok, status, data } = await forwardGet("/search", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Tag ─────────────────────────────────────────────────────────────────────

const TAG_VALUES = new Set(["lst", "verified", "stocks"]);

// GET /api/jupiter-tokens/tag?query=verified
router.get("/tag", async (req, res) => {
  const q = String(req.query.query ?? "");
  if (!TAG_VALUES.has(q)) {
    return res.status(400).json({ error: `query must be one of: ${[...TAG_VALUES].join(", ")}` });
  }
  try {
    const params = new URLSearchParams({ query: q });
    const { ok, status, data } = await forwardGet("/tag", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Recent ──────────────────────────────────────────────────────────────────

// GET /api/jupiter-tokens/recent
router.get("/recent", async (_req, res) => {
  try {
    const { ok, status, data } = await forwardGet("/recent");
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Express Verification ────────────────────────────────────────────────────
// Defined BEFORE the catch-all /:category/:interval route below so the literal
// /verify segment matches first.

// GET /api/jupiter-tokens/verify/check-eligibility?tokenId=<mint>
router.get("/verify/check-eligibility", async (req, res) => {
  const { tokenId } = req.query;
  if (!tokenId) return res.status(400).json({ error: "tokenId required" });
  try {
    const params = new URLSearchParams({ tokenId: String(tokenId) });
    const { ok, status, data } = await forwardGet("/verify/express/check-eligibility", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-tokens/verify/craft-txn?senderAddress=<wallet>
router.get("/verify/craft-txn", async (req, res) => {
  const { senderAddress } = req.query;
  if (!senderAddress) return res.status(400).json({ error: "senderAddress required" });
  try {
    const params = new URLSearchParams({ senderAddress: String(senderAddress) });
    const { ok, status, data } = await forwardGet("/verify/express/craft-txn", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/jupiter-tokens/verify/execute
// Body: { transaction, requestId, senderAddress, tokenId, twitterHandle?, description?, tokenMetadata? }
router.post("/verify/execute", async (req, res) => {
  const { transaction, requestId, senderAddress, tokenId } = req.body || {};
  if (!transaction || !requestId || !senderAddress || !tokenId) {
    return res.status(400).json({ error: "transaction, requestId, senderAddress, tokenId required" });
  }
  try {
    const { ok, status, data } = await forwardJson("POST", "/verify/express/execute", req.body);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Category ────────────────────────────────────────────────────────────────
// GET /api/jupiter-tokens/:category/:interval?limit=50
// category: toporganicscore | toptraded | toptrending
// interval: 5m | 1h | 6h | 24h

const CATEGORIES  = new Set(["toporganicscore", "toptraded", "toptrending"]);
const INTERVALS   = new Set(["5m", "1h", "6h", "24h"]);

router.get("/:category/:interval", async (req, res) => {
  const { category, interval } = req.params;
  if (!CATEGORIES.has(category)) {
    return res.status(400).json({ error: `category must be one of: ${[...CATEGORIES].join(", ")}` });
  }
  if (!INTERVALS.has(interval)) {
    return res.status(400).json({ error: `interval must be one of: ${[...INTERVALS].join(", ")}` });
  }
  try {
    const params = new URLSearchParams();
    const limit = req.query.limit;
    if (limit != null && limit !== "") {
      const n = Number(limit);
      if (!Number.isFinite(n)) return res.status(400).json({ error: "limit must be a number" });
      params.set("limit", String(Math.max(1, Math.min(100, Math.floor(n)))));
    }
    const { ok, status, data } = await forwardGet(
      `/${encodeURIComponent(category)}/${encodeURIComponent(interval)}`,
      params,
    );
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
