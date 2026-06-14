import type { Request, Response } from "express";
import { Router } from "express";
import fetch from "node-fetch";

const router = Router();

const FLASH_API_BASE = (process.env.FLASH_V2_BASE_URL || "https://flashapi.trade/v2").replace(/\/$/, "");
const ER_RPC_URL = process.env.FLASH_ER_RPC_URL || process.env.ER_RPC_URL || "https://flash.magicblock.xyz";
const BASE_RPC_URL =
  process.env.FLASH_BASE_RPC_URL ||
  process.env.BASE_RPC_URL ||
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  process.env.VITE_HELIUS_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const READ_TTL_MS = 2_000;
const READ_STALE_MS = 20_000;

type CacheEntry = {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
};

const cache = new Map<string, CacheEntry>();

function setFlashHeaders(res: Response, stale = false) {
  res.setHeader("Cache-Control", "public, max-age=2, stale-while-revalidate=20");
  if (stale) res.setHeader("X-Flash-Stale", "1");
}

async function readJson(path: string) {
  const cacheKey = `GET ${path}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { data: cached.data, stale: false };

  try {
    const response = await fetch(`${FLASH_API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`Flash ${response.status}: ${typeof data === "string" ? data : text.slice(0, 240)}`);
    }
    cache.set(cacheKey, {
      data,
      expiresAt: now + READ_TTL_MS,
      staleUntil: now + READ_STALE_MS,
    });
    return { data, stale: false };
  } catch (error) {
    const stale = cache.get(cacheKey);
    if (stale && stale.staleUntil > now) return { data: stale.data, stale: true };
    throw error;
  }
}

function sendError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  res.status(502).json({ success: false, error: message });
}

router.get("/status", (_req, res) => {
  res.json({
    success: true,
    data: {
      network: "mainnet",
      apiBase: FLASH_API_BASE,
      erRpc: ER_RPC_URL,
      baseRpc: BASE_RPC_URL,
      routing: {
        trading: "Ephemeral Rollup RPC",
        setupWithdrawal: "Base Solana RPC",
      },
    },
  });
});

router.get("/health", async (_req, res) => {
  try {
    const { data, stale } = await readJson("/health");
    setFlashHeaders(res, stale);
    res.json({ success: true, data, meta: { stale, source: "flash-v2" } });
  } catch (error) {
    sendError(res, error, "Could not reach Flash health endpoint");
  }
});

router.get("/tokens", async (_req, res) => {
  try {
    const { data, stale } = await readJson("/tokens");
    setFlashHeaders(res, stale);
    res.json({ success: true, data, meta: { stale, source: "flash-v2" } });
  } catch (error) {
    sendError(res, error, "Could not reach Flash token endpoint");
  }
});

router.get("/prices", async (_req, res) => {
  try {
    const { data, stale } = await readJson("/prices");
    setFlashHeaders(res, stale);
    res.json({ success: true, data, meta: { stale, source: "flash-v2" } });
  } catch (error) {
    sendError(res, error, "Could not reach Flash price endpoint");
  }
});

router.get("/prices/:symbol", async (req, res) => {
  try {
    const symbol = String(req.params.symbol || "SOL").toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 16);
    const { data, stale } = await readJson(`/prices/${encodeURIComponent(symbol)}`);
    setFlashHeaders(res, stale);
    res.json({ success: true, data, meta: { stale, source: "flash-v2" } });
  } catch (error) {
    sendError(res, error, "Could not reach Flash price endpoint");
  }
});

router.post("/quote", async (req: Request, res: Response) => {
  try {
    const symbol = String(req.body?.outputTokenSymbol || req.body?.symbol || "SOL").toUpperCase();
    const tradeType = String(req.body?.tradeType || "LONG").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
    const leverage = Math.max(1, Math.min(50, Number(req.body?.leverage || 5)));
    const inputAmount = Math.max(1, Math.min(100_000, Number(req.body?.inputAmountUi || 11)));
    const body = {
      inputTokenSymbol: "USDC",
      outputTokenSymbol: symbol.replace(/[^A-Z0-9.]/g, "").slice(0, 16) || "SOL",
      inputAmountUi: inputAmount.toFixed(2).replace(/\.00$/, ""),
      leverage,
      tradeType,
    };

    const response = await fetch(`${FLASH_API_BASE}/transaction-builder/open-position`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok || data?.err) {
      res.status(response.ok ? 400 : response.status).json({
        success: false,
        error: data?.err || text || response.statusText,
        request: body,
      });
      return;
    }
    res.json({ success: true, data, request: body, meta: { source: "flash-v2", txBuilt: false } });
  } catch (error) {
    sendError(res, error, "Could not build Flash quote");
  }
});

export default router;
