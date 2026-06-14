import { Router } from "express";

// Jupiter Prediction Markets (BETA) — events, markets, positions, orders, history.
// Base URL is configurable but defaults to the documented endpoint.
const BASE = (process.env.JUPITER_PREDICTION_BASE || "https://api.jup.ag/prediction/v1").replace(/\/$/, "");
const HEADERS = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
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

async function forwardJson(method: "POST" | "DELETE", path: string, body?: unknown) {
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

function copyParams(src: any, keys: string[]): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of keys) {
    const v = src?.[k];
    if (v != null && v !== "") p.set(k, String(v));
  }
  return p;
}

// ─── Events ──────────────────────────────────────────────────────────────────

// GET /api/jupiter-prediction/events
router.get("/events", async (req, res) => {
  try {
    const params = copyParams(req.query, [
      "category", "subcategory", "filter", "sortBy", "sortDirection",
      "includeMarkets", "start", "end",
    ]);
    const { ok, status, data } = await forwardGet("/events", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/events/search
router.get("/events/search", async (req, res) => {
  if (!req.query.query) return res.status(400).json({ error: "query required" });
  try {
    const params = copyParams(req.query, ["query", "limit"]);
    const { ok, status, data } = await forwardGet("/events/search", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/events/suggested/:pubkey
router.get("/events/suggested/:pubkey", async (req, res) => {
  try {
    const { ok, status, data } = await forwardGet(`/events/suggested/${encodeURIComponent(req.params.pubkey)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/events/:eventId
router.get("/events/:eventId", async (req, res) => {
  try {
    const { ok, status, data } = await forwardGet(`/events/${encodeURIComponent(req.params.eventId)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Markets ─────────────────────────────────────────────────────────────────

// GET /api/jupiter-prediction/markets/:marketId
router.get("/markets/:marketId", async (req, res) => {
  try {
    const { ok, status, data } = await forwardGet(`/markets/${encodeURIComponent(req.params.marketId)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/orderbook/:marketId
router.get("/orderbook/:marketId", async (req, res) => {
  try {
    const { ok, status, data } = await forwardGet(`/orderbook/${encodeURIComponent(req.params.marketId)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/trading-status
router.get("/trading-status", async (_req, res) => {
  try {
    const { ok, status, data } = await forwardGet("/trading-status");
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Orders (write) ──────────────────────────────────────────────────────────

// POST /api/jupiter-prediction/orders  → returns { transaction, txMeta, order: { ... } }
router.post("/orders", async (req, res) => {
  const { ownerPubkey, marketId, isYes, isBuy, depositAmount, depositMint, contracts } = req.body || {};
  if (!ownerPubkey || !marketId || isYes == null || isBuy == null || !depositAmount || !depositMint) {
    return res.status(400).json({ error: "ownerPubkey, marketId, isYes, isBuy, depositAmount, depositMint required" });
  }
  try {
    const body: Record<string, unknown> = { ownerPubkey, marketId, isYes, isBuy, depositAmount, depositMint };
    if (contracts != null) body.contracts = String(contracts);
    const { ok, status, data } = await forwardJson("POST", "/orders", body);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/orders?ownerPubkey=...
router.get("/orders", async (req, res) => {
  if (!req.query.ownerPubkey) return res.status(400).json({ error: "ownerPubkey required" });
  try {
    const params = copyParams(req.query, ["ownerPubkey", "start", "end"]);
    const { ok, status, data } = await forwardGet("/orders", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/orders/status/:orderPubkey
router.get("/orders/status/:orderPubkey", async (req, res) => {
  try {
    const { ok, status, data } = await forwardGet(`/orders/status/${encodeURIComponent(req.params.orderPubkey)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Positions ───────────────────────────────────────────────────────────────

// GET /api/jupiter-prediction/positions?ownerPubkey=...
router.get("/positions", async (req, res) => {
  if (!req.query.ownerPubkey) return res.status(400).json({ error: "ownerPubkey required" });
  try {
    const params = copyParams(req.query, ["ownerPubkey", "marketPubkey", "marketId", "isYes", "start", "end"]);
    const { ok, status, data } = await forwardGet("/positions", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/jupiter-prediction/positions/:positionPubkey
router.get("/positions/:positionPubkey", async (req, res) => {
  try {
    const { ok, status, data } = await forwardGet(`/positions/${encodeURIComponent(req.params.positionPubkey)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/jupiter-prediction/positions/:positionPubkey  → close single position
router.delete("/positions/:positionPubkey", async (req, res) => {
  const { ownerPubkey } = req.body || {};
  if (!ownerPubkey) return res.status(400).json({ error: "ownerPubkey required" });
  try {
    const { ok, status, data } = await forwardJson(
      "DELETE",
      `/positions/${encodeURIComponent(req.params.positionPubkey)}`,
      { ownerPubkey },
    );
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/jupiter-prediction/positions  → close ALL positions
router.delete("/positions", async (req, res) => {
  const { ownerPubkey } = req.body || {};
  if (!ownerPubkey) return res.status(400).json({ error: "ownerPubkey required" });
  try {
    const { ok, status, data } = await forwardJson("DELETE", "/positions", { ownerPubkey });
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/jupiter-prediction/positions/:positionPubkey/claim
router.post("/positions/:positionPubkey/claim", async (req, res) => {
  const { ownerPubkey } = req.body || {};
  if (!ownerPubkey) return res.status(400).json({ error: "ownerPubkey required" });
  try {
    const { ok, status, data } = await forwardJson(
      "POST",
      `/positions/${encodeURIComponent(req.params.positionPubkey)}/claim`,
      { ownerPubkey },
    );
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── History ─────────────────────────────────────────────────────────────────

// GET /api/jupiter-prediction/history?ownerPubkey=...
router.get("/history", async (req, res) => {
  if (!req.query.ownerPubkey) return res.status(400).json({ error: "ownerPubkey required" });
  try {
    const params = copyParams(req.query, ["ownerPubkey", "positionPubkey", "start", "end", "id"]);
    const { ok, status, data } = await forwardGet("/history", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
