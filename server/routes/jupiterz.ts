import { Router } from "express";

// JupiterZ — RFQ market-maker network analytics & transaction lookup.
// Base URL is configurable: defaults to api.jup.ag/jupiterz; override with
// JUPITERZ_API_BASE if Jupiter exposes the service elsewhere.
const BASE = (process.env.JUPITERZ_API_BASE || "https://api.jup.ag/jupiterz").replace(/\/$/, "");
const HEADERS = (): Record<string, string> =>
  process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {};

const router = Router();

async function proxy(path: string, params?: URLSearchParams) {
  const url = params && params.toString() ? `${BASE}${path}?${params}` : `${BASE}${path}`;
  const r = await fetch(url, { headers: HEADERS() });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

// ─── Transaction Endpoints ───────────────────────────────────────────────────

// GET /api/jupiterz/transactions/latest
router.get("/transactions/latest", async (_req, res) => {
  try {
    const { ok, status, data } = await proxy("/api/transactions/latest");
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jupiterz/transactions/stats
router.get("/transactions/stats", async (_req, res) => {
  try {
    const { ok, status, data } = await proxy("/api/transactions/stats");
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jupiterz/transactions/slot-range?start_slot=...&end_slot=...
router.get("/transactions/slot-range", async (req, res) => {
  const { start_slot, end_slot } = req.query;
  if (!start_slot || !end_slot) {
    return res.status(400).json({ error: "start_slot and end_slot required" });
  }
  try {
    const params = new URLSearchParams({
      start_slot: String(start_slot),
      end_slot: String(end_slot),
    });
    const { ok, status, data } = await proxy("/api/transactions/slot-range", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jupiterz/transactions/by-request-id?request_id=...
router.get("/transactions/by-request-id", async (req, res) => {
  const { request_id } = req.query;
  if (!request_id) return res.status(400).json({ error: "request_id required" });
  try {
    const params = new URLSearchParams({ request_id: String(request_id) });
    const { ok, status, data } = await proxy("/api/transactions/by-request-id", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jupiterz/transactions/:id
// Defined LAST among /transactions/* so literal paths above match first.
router.get("/transactions/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const { ok, status, data } = await proxy(`/api/transactions/${encodeURIComponent(id)}`);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7-Day Statistics ────────────────────────────────────────────────────────

const SEVEN_DAY_PATHS = [
  "volume",
  "fees",
  "trade-count",
  "daily",
  "average-fee",
  "comprehensive",
] as const;

for (const seg of SEVEN_DAY_PATHS) {
  router.get(`/stats/7d/${seg}`, async (_req, res) => {
    try {
      const { ok, status, data } = await proxy(`/api/stats/7d/${seg}`);
      res.status(ok ? 200 : status).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── Token & Pair Analytics ──────────────────────────────────────────────────

function clampLimit(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return String(Math.max(1, Math.min(100, Math.floor(n))));
}

// GET /api/jupiterz/stats/7d/top-pairs?limit=10
router.get("/stats/7d/top-pairs", async (req, res) => {
  try {
    const params = new URLSearchParams();
    const limit = clampLimit(req.query.limit);
    if (limit) params.set("limit", limit);
    const { ok, status, data } = await proxy("/api/stats/7d/top-pairs", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jupiterz/stats/7d/top-makers?limit=10
router.get("/stats/7d/top-makers", async (req, res) => {
  try {
    const params = new URLSearchParams();
    const limit = clampLimit(req.query.limit);
    if (limit) params.set("limit", limit);
    const { ok, status, data } = await proxy("/api/stats/7d/top-makers", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jupiterz/stats/7d/token-volume?token_id=<mint>
router.get("/stats/7d/token-volume", async (req, res) => {
  const { token_id } = req.query;
  if (!token_id) return res.status(400).json({ error: "token_id (mint address) required" });
  try {
    const params = new URLSearchParams({ token_id: String(token_id) });
    const { ok, status, data } = await proxy("/api/stats/7d/token-volume", params);
    res.status(ok ? 200 : status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
