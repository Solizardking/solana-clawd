import type { Request, Response } from "express";
import { Router } from "express";
import { MarginType, Side, createPhoenixClient } from "@ellipsis-labs/rise";
import OpenAI from "openai";
import { getBrowserAgent, loadBrowserAgents } from "../lib/clawd/browserAgents";
import { deriveBrowserAgentRecommendation } from "../lib/clawd/browserAgentRecommendations";
import { rateLimit } from "../lib/rate-limit";
import {
  OPENROUTER_API_BASE_URL,
  getOpenRouterAttributionHeaders,
} from "../lib/openrouter-attribution";

const API = "https://perp-api.phoenix.trade";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_BUILDER_AUTHORITY = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEFAULT_XAI_MODEL = "grok-4.3";
const DEFAULT_OPENROUTER_FREE_MODEL = "openrouter/free";
const AI_MODEL_TIMEOUT_MS = Number(process.env.PHOENIX_STRATEGY_MODEL_TIMEOUT_MS ?? 8_000);
const AI_PROVIDER_TIMEOUT_MS = Number(process.env.PHOENIX_STRATEGY_PROVIDER_TIMEOUT_MS ?? 16_000);
const RPC_URL =
  process.env.HELIUS_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  process.env.VITE_HELIUS_RPC_URL ??
  "https://api.mainnet-beta.solana.com";
const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: DEEPSEEK_BASE_URL })
  : null;
const xaiClient = process.env.XAI_API_KEY
  ? new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: XAI_BASE_URL })
  : null;
const openRouterApiKey = (
  process.env.OPENROUTER_API_KEY ||
  process.env.CLAWDROUTER_OPENROUTER_API_KEY ||
  ""
).trim();
const openRouterFreeClient = openRouterApiKey
  ? new OpenAI({
      apiKey: openRouterApiKey,
      baseURL: OPENROUTER_API_BASE_URL,
      defaultHeaders: getOpenRouterAttributionHeaders(),
    })
  : null;

const router = Router();
const strategyLimiter = rateLimit({
  namespace: "phoenix:strategy",
  windowMs: 60_000,
  max: 12,
  message: "Too many Phoenix strategy refreshes. Please wait a moment.",
});

// ─── Cache ────────────────────────────────────────────────────────────────────

type CacheEntry = { data: unknown; expiresAt: number; staleUntil: number };
const cache = new Map<string, CacheEntry>();
type StrategyAiCacheEntry = {
  analyses: StrategyAnalysis[];
  errors: Array<{ provider: "deepseek" | "xai" | "openrouter"; model: string; message: string }>;
  expiresAt: number;
};
const strategyAiCache = new Map<string, StrategyAiCacheEntry>();

async function cachedGet(
  path: string,
  ttlMs: number,
  staleMs: number,
  headers: Record<string, string> = {},
): Promise<{ data: unknown; stale: boolean }> {
  const now = Date.now();
  const entry = cache.get(path);
  if (entry && entry.expiresAt > now) return { data: entry.data, stale: false };

  try {
    const r = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`Phoenix ${r.status}: ${path}`);
    const data: unknown = await r.json();
    cache.set(path, { data, expiresAt: now + ttlMs, staleUntil: now + staleMs });
    return { data, stale: false };
  } catch (err) {
    const stale = cache.get(path);
    if (stale && stale.staleUntil > now) return { data: stale.data, stale: true };
    throw err;
  }
}

async function proxyPost(path: string, body: unknown, authHeader?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { error: text };
    }
  }
  return { ok: r.ok, status: r.status, data };
}

function cacheHeaders(res: Response, ttlMs: number, staleMs: number, stale = false) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(staleMs / 1000)}`,
  );
  if (stale) res.setHeader("X-Cache-Stale", "1");
}

type StrategyBias = "long" | "short" | "neutral" | "reduce-risk";

type StrategyAnalysis = {
  provider: "deepseek" | "xai" | "openrouter" | "heuristic";
  model: string;
  bias: StrategyBias;
  confidence: number;
  timeframe: string;
  summary: string;
  thesis: string[];
  tradePlan: {
    entry: string;
    stop: string;
    target: string;
    size: string;
  };
  riskFlags: string[];
  watchList: string[];
};

function modelCandidates(
  multiValue: string | undefined,
  singleValue: string | undefined,
  defaults: string[],
) {
  const raw = [
    ...(multiValue ?? "").split(","),
    singleValue ?? "",
    ...defaults,
  ];
  return [...new Set(raw.map((value) => value.trim()).filter(Boolean))];
}

const DEEPSEEK_STRATEGY_MODELS = modelCandidates(
  process.env.PHOENIX_DEEPSEEK_MODELS,
  process.env.PHOENIX_DEEPSEEK_MODEL ?? process.env.DEEPSEEK_MODEL,
  [DEFAULT_DEEPSEEK_MODEL, "deepseek-chat"],
);
const XAI_STRATEGY_MODELS = modelCandidates(
  process.env.PHOENIX_XAI_MODELS,
  process.env.PHOENIX_XAI_MODEL ?? process.env.XAI_MODEL,
  [DEFAULT_XAI_MODEL, "grok-4-latest", "grok-4"],
);
const OPENROUTER_FREE_STRATEGY_MODELS = modelCandidates(
  process.env.PHOENIX_OPENROUTER_FREE_MODELS ?? process.env.PHOENIX_OPENROUTER_MODELS,
  process.env.PHOENIX_OPENROUTER_FREE_MODEL ?? process.env.PHOENIX_OPENROUTER_MODEL ?? process.env.OPENROUTER_FREE_MODEL ?? process.env.FREE_TERMINAL_MODEL,
  [DEFAULT_OPENROUTER_FREE_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free", "nex-agi/nex-n2-pro:free"],
);

type NormalizedLevel = {
  price: number;
  size: number;
};

type StrategyOrderbookSummary = {
  bestBid: number | null;
  bestAsk: number | null;
  spreadUsd: number | null;
  spreadBps: number | null;
  bidDepth: number;
  askDepth: number;
  imbalance: number | null;
  bids: NormalizedLevel[];
  asks: NormalizedLevel[];
};

let riseHealthCache: { ok: boolean; detail: string | null; checkedAt: number } | null = null;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function normalizeTextArray(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function clampConfidence(value: unknown, fallback: number) {
  const number = toFiniteNumber(value);
  if (number == null) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeBias(value: unknown, fallback: StrategyBias): StrategyBias {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "long" || normalized === "short" || normalized === "neutral" || normalized === "reduce-risk") {
    return normalized;
  }
  return fallback;
}

function round(value: number | null, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pct(value: number | null, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return round(value * 100, decimals);
}

function toPctString(value: number | null, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${round(value, decimals)}%`;
}

function normalizeOrderbookLevels(value: unknown, limit = 5): NormalizedLevel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((level) => {
      if (!Array.isArray(level) || level.length < 2) return null;
      const price = toFiniteNumber(level[0]);
      const size = toFiniteNumber(level[1]);
      if (price == null || size == null) return null;
      return { price, size };
    })
    .filter((level): level is NormalizedLevel => Boolean(level))
    .slice(0, limit);
}

function summarizeOrderbook(snapshot: {
  bids?: unknown;
  asks?: unknown;
  midPrice?: number | null;
}): StrategyOrderbookSummary {
  const bids = normalizeOrderbookLevels(snapshot.bids);
  const asks = normalizeOrderbookLevels(snapshot.asks);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const liveMid =
    snapshot.midPrice ??
    (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk ?? null);
  const spreadUsd =
    bestBid != null && bestAsk != null
      ? Math.max(bestAsk - bestBid, 0)
      : null;
  const spreadBps =
    spreadUsd != null && liveMid != null && liveMid > 0
      ? (spreadUsd / liveMid) * 10_000
      : null;
  const bidDepth = bids.reduce((sum, level) => sum + level.size, 0);
  const askDepth = asks.reduce((sum, level) => sum + level.size, 0);
  const imbalance =
    bidDepth + askDepth > 0
      ? (bidDepth - askDepth) / (bidDepth + askDepth)
      : null;

  return {
    bestBid,
    bestAsk,
    spreadUsd,
    spreadBps,
    bidDepth,
    askDepth,
    imbalance,
    bids,
    asks,
  };
}

function extractCompletionText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return typeof message === "string" ? message : "";
  }

  const record = message as Record<string, unknown>;
  const content = record.content;
  if (typeof content === "string" && content.trim()) return content;
  if (!Array.isArray(content)) return "";

  const parts = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      if (typeof record.value === "string") return record.value;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  return parts;
}

function parseLooseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return {};

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  const tryParse = (value: string): unknown => {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") return parseLooseJsonObject(parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const direct = tryParse(candidate);
  if (direct) return direct;

  const unescaped = candidate
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
  const unescapedParsed = tryParse(unescaped);
  if (unescapedParsed) return unescapedParsed;

  try {
    return JSON.parse(candidate);
  } catch {
    const source = unescaped.includes("{") ? unescaped : candidate;
    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(source.slice(firstBrace, lastBrace + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function parseJsonLikeStrategyText(content: string): unknown {
  const extractString = (key: string, source = content) => {
    const match = source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i"));
    return match?.[1]?.trim() || null;
  };
  const extractNumber = (key: string, source = content) => {
    const match = source.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
    return match?.[1] != null ? Number(match[1]) : null;
  };
  const extractArray = (key: string, source = content) => {
    const match = source.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i"));
    if (!match?.[1]) return [];
    return Array.from(match[1].matchAll(/"([^"]+)"/g))
      .map((entry) => entry[1].trim())
      .filter(Boolean);
  };

  const tradePlanBlock = content.match(/"tradePlan"\s*:\s*\{([\s\S]*?)\}/i)?.[1] ?? "";
  const parsed: Record<string, unknown> = {};

  const bias = extractString("bias");
  const confidence = extractNumber("confidence");
  const timeframe = extractString("timeframe");
  const summary = extractString("summary");
  const thesis = extractArray("thesis");
  const riskFlags = extractArray("riskFlags");
  const watchList = extractArray("watchList");
  const tradePlan = {
    entry: extractString("entry", tradePlanBlock),
    stop: extractString("stop", tradePlanBlock),
    target: extractString("target", tradePlanBlock),
    size: extractString("size", tradePlanBlock),
  };

  if (bias) parsed.bias = bias;
  if (confidence != null) parsed.confidence = confidence;
  if (timeframe) parsed.timeframe = timeframe;
  if (summary) parsed.summary = summary;
  if (thesis.length) parsed.thesis = thesis;
  if (riskFlags.length) parsed.riskFlags = riskFlags;
  if (watchList.length) parsed.watchList = watchList;
  if (Object.values(tradePlan).some(Boolean)) parsed.tradePlan = tradePlan;

  return parsed;
}

function normalizeTextLines(content: string, limit = 8): string[] {
  const jsonKeyLine = /^"?(?:bias|confidence|timeframe|summary|thesis|tradePlan|entry|stop|target|size|riskFlags|watchList)"?\s*:/i;
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[\s>*,-]+/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !jsonKeyLine.test(line.replace(/\\"/g, "\"")))
    .filter((line) => !/^[{}\[\],]+$/.test(line))
    .slice(0, limit);
}

function buildTextDrivenAnalysis(
  provider: StrategyAnalysis["provider"],
  model: string,
  content: string,
  fallback: StrategyAnalysis,
): StrategyAnalysis {
  const lines = normalizeTextLines(content);
  if (!lines.length) return fallback;

  const summary = (lines.find((line) => line.length >= 24) ?? lines[0] ?? fallback.summary).slice(0, 240);
  if (/\bwe are given\b|\bwe need\b|\bthe user asks\b|\bi would\b|\bi should\b|\blet'?s\b/i.test(summary)) {
    return fallback;
  }
  const thesis = lines.slice(1, 4);
  const riskFlags = lines
    .filter((line) => /risk|liquid|stop|volatile|spread|funding|invalid/i.test(line))
    .slice(0, 4);
  const watchList = lines
    .filter((line) => /watch|monitor|wait|look|trigger|confirm/i.test(line))
    .slice(0, 4);

  return {
    ...fallback,
    provider,
    model,
    summary,
    thesis: thesis.length ? thesis : fallback.thesis,
    riskFlags: riskFlags.length ? riskFlags : fallback.riskFlags,
    watchList: watchList.length ? watchList : fallback.watchList,
  };
}

function normalizeStrategyAnalysis(
  provider: StrategyAnalysis["provider"],
  model: string,
  raw: unknown,
  fallback: Omit<StrategyAnalysis, "provider" | "model">,
): StrategyAnalysis {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    provider,
    model,
    bias: normalizeBias(data.bias, fallback.bias),
    confidence: clampConfidence(data.confidence, fallback.confidence),
    timeframe:
      typeof data.timeframe === "string" && data.timeframe.trim()
        ? data.timeframe.trim()
        : fallback.timeframe,
    summary:
      typeof data.summary === "string" && data.summary.trim()
        ? data.summary.trim().slice(0, 240)
        : fallback.summary,
    thesis: normalizeTextArray(data.thesis, 4).length
      ? normalizeTextArray(data.thesis, 4)
      : fallback.thesis,
    tradePlan: {
      entry:
        typeof (data.tradePlan as Record<string, unknown> | undefined)?.entry === "string"
          ? String((data.tradePlan as Record<string, unknown>).entry).trim()
          : fallback.tradePlan.entry,
      stop:
        typeof (data.tradePlan as Record<string, unknown> | undefined)?.stop === "string"
          ? String((data.tradePlan as Record<string, unknown>).stop).trim()
          : fallback.tradePlan.stop,
      target:
        typeof (data.tradePlan as Record<string, unknown> | undefined)?.target === "string"
          ? String((data.tradePlan as Record<string, unknown>).target).trim()
          : fallback.tradePlan.target,
      size:
        typeof (data.tradePlan as Record<string, unknown> | undefined)?.size === "string"
          ? String((data.tradePlan as Record<string, unknown>).size).trim()
          : fallback.tradePlan.size,
    },
    riskFlags: normalizeTextArray(data.riskFlags, 4).length
      ? normalizeTextArray(data.riskFlags, 4)
      : fallback.riskFlags,
    watchList: normalizeTextArray(data.watchList, 4).length
      ? normalizeTextArray(data.watchList, 4)
      : fallback.watchList,
  };
}

function buildHeuristicAnalysis(input: {
  symbol: string;
  focus: string;
  midPrice: number | null;
  orderbook: StrategyOrderbookSummary;
  trader: { riskState: string | null; selectedPositionSide: string | null } | null;
}): StrategyAnalysis {
  const { symbol, focus, midPrice, orderbook, trader } = input;
  const imbalance = orderbook.imbalance ?? 0;
  const spreadBps = orderbook.spreadBps ?? 0;
  const traderRisk = trader?.riskState?.toLowerCase() ?? null;
  const bias: StrategyBias =
    traderRisk && traderRisk !== "ok"
      ? "reduce-risk"
      : imbalance > 0.12
        ? "long"
        : imbalance < -0.12
          ? "short"
          : "neutral";
  const confidenceBase =
    bias === "neutral"
      ? 48
      : 54 + Math.min(26, Math.round(Math.abs(imbalance) * 100));
  const confidencePenalty = spreadBps > 12 ? 8 : spreadBps > 5 ? 4 : 0;
  const confidence = Math.max(35, confidenceBase - confidencePenalty);
  const entry =
    bias === "long"
      ? orderbook.bestAsk != null ? `reclaim ${round(orderbook.bestAsk, 2)}` : "buy only on bid support"
      : bias === "short"
        ? orderbook.bestBid != null ? `reject ${round(orderbook.bestBid, 2)}` : "sell only into failed bounces"
        : midPrice != null
          ? `wait around ${round(midPrice, 2)} for imbalance expansion`
          : "wait for tighter spread and clearer tape";
  const stop =
    bias === "long"
      ? orderbook.bestBid != null ? `lose ${round(orderbook.bestBid * 0.9975, 2)}` : "exit if bids thin further"
      : bias === "short"
        ? orderbook.bestAsk != null ? `reclaim ${round(orderbook.bestAsk * 1.0025, 2)}` : "exit if asks lift"
        : "stay flat if spread widens";
  const target =
    bias === "long"
      ? orderbook.bestAsk != null ? `trim into ${round(orderbook.bestAsk * 1.004, 2)}+` : "take partials into momentum"
      : bias === "short"
        ? orderbook.bestBid != null ? `cover into ${round(orderbook.bestBid * 0.996, 2)}+` : "cover into flushes"
        : "wait for a cleaner break before committing";

  return {
    provider: "heuristic",
    model: "orderbook-heuristic",
    bias,
    confidence,
    timeframe: focus,
    summary:
      bias === "reduce-risk"
        ? `${symbol} risk state is not clean enough for fresh leverage. Prioritize account health over adding exposure.`
        : bias === "long"
          ? `${symbol} top-of-book bids are stronger than asks. Bias is cautiously long while the imbalance persists.`
          : bias === "short"
            ? `${symbol} asks outweigh bids near the touch. Bias is cautiously short until the tape stabilizes.`
            : `${symbol} book is balanced enough that patience beats forcing a trade right now.`,
    thesis: [
      `Top-of-book spread is ${spreadBps ? `${round(spreadBps, 2)} bps` : "not available"}, which sets how aggressive entries can be.`,
      `Bid depth ${round(orderbook.bidDepth, 2) ?? 0} vs ask depth ${round(orderbook.askDepth, 2) ?? 0} yields an imbalance of ${toPctString(pct(imbalance, 1), 1)}.`,
      trader?.selectedPositionSide
        ? `Current wallet exposure is already ${trader.selectedPositionSide}; avoid doubling down without a cleaner invalidation.`
        : "No existing position in the selected market was detected from the public trader snapshot.",
    ],
    tradePlan: {
      entry,
      stop,
      target,
      size:
        bias === "neutral" || bias === "reduce-risk"
          ? "stay light or stay flat"
          : "start 25-35% of usual risk and add only if the tape confirms",
    },
    riskFlags: [
      spreadBps > 8
        ? "Spread is wide enough that market execution can bleed edge quickly."
        : "Even a clean book signal can flip fast around liquidations or macro moves.",
      traderRisk && traderRisk !== "ok"
        ? `Trader risk state is ${traderRisk}; de-risk before seeking fresh leverage.`
        : "Treat this as a microstructure read, not a substitute for a broader trend plan.",
    ],
    watchList: [
      "Funding reset and fee drag versus expected move",
      "Orderbook imbalance flipping through zero",
      "Any sudden expansion in spread or one-sided depth vacuum",
    ],
  };
}

function strategyCacheKey(snapshot: {
  symbol: string;
  focus: string;
  midPrice: number | null;
  imbalance: number | null;
  spreadBps: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  traderRiskState: string | null;
  selectedPositionSide: string | null;
}) {
  return JSON.stringify({
    symbol: snapshot.symbol,
    focus: snapshot.focus,
    midBucket: snapshot.midPrice == null ? null : round(snapshot.midPrice, 2),
    imbalanceBucket: snapshot.imbalance == null ? null : round(snapshot.imbalance, 2),
    spreadBpsBucket: snapshot.spreadBps == null ? null : round(snapshot.spreadBps, 2),
    bestBidBucket: snapshot.bestBid == null ? null : round(snapshot.bestBid, 2),
    bestAskBucket: snapshot.bestAsk == null ? null : round(snapshot.bestAsk, 2),
    traderRiskState: snapshot.traderRiskState,
    selectedPositionSide: snapshot.selectedPositionSide,
  });
}

async function getRiseClientHealth() {
  if (riseHealthCache && Date.now() - riseHealthCache.checkedAt < 60_000) {
    return riseHealthCache;
  }
  try {
    await getRiseClient();
    riseHealthCache = { ok: true, detail: null, checkedAt: Date.now() };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    riseHealthCache = { ok: false, detail, checkedAt: Date.now() };
  }
  return riseHealthCache;
}

async function fetchPhoenixData(path: string, ttlMs: number, staleMs: number) {
  try {
    const { data } = await cachedGet(path, ttlMs, staleMs);
    return { data, error: null as string | null };
  } catch (error: unknown) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runAiStrategyModel(params: {
  client: OpenAI;
  provider: "deepseek" | "xai" | "openrouter";
  model: string;
  prompt: string;
  timeoutMs: number;
  fallback: Omit<StrategyAnalysis, "provider" | "model">;
}) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const completion = await Promise.race([
    params.client.chat.completions.create(
      {
        model: params.model,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Vulcan CLAWD's perps strategist. Use only the supplied snapshot. " +
              "Be conservative, account for liquidation and spread, and never imply certainty. " +
              "If account health is degraded, prefer reduce-risk. Return strict JSON only. " +
              "Do not wrap JSON in markdown. Use exactly these keys: " +
              "bias, confidence, timeframe, summary, thesis, tradePlan, riskFlags, watchList. " +
              "tradePlan must contain exactly: entry, stop, target, size. " +
              "If the snapshot is thin, still fill every field with the best risk-aware answer available.",
          },
          {
            role: "user",
            content: params.prompt,
          },
        ] as any,
      },
      { timeout: params.timeoutMs } as any,
    ),
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`${params.provider} model ${params.model} timed out after ${params.timeoutMs}ms`)),
        params.timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });

  const content = extractCompletionText(completion.choices[0]?.message ?? "{}");
  const parsed = parseLooseJsonObject(content);
  const recovered =
    parsed && typeof parsed === "object" && Object.keys(parsed as Record<string, unknown>).length > 0
      ? parsed
      : parseJsonLikeStrategyText(content);
  const normalized = normalizeStrategyAnalysis(params.provider, params.model, recovered, params.fallback);

  if (normalized.summary === params.fallback.summary) {
    if (content.trim()) {
      const textDriven = buildTextDrivenAnalysis(params.provider, params.model, content, normalized);
      if (textDriven.summary !== params.fallback.summary) return textDriven;
    }
    throw new Error(`${params.provider} model ${params.model} did not return usable strategy JSON`);
  }

  return normalized;
}

async function runAiStrategyCandidates(params: {
  client: OpenAI;
  provider: "deepseek" | "xai" | "openrouter";
  models: string[];
  prompt: string;
  fallback: Omit<StrategyAnalysis, "provider" | "model">;
}) {
  let lastError: unknown = null;
  const deadline = Date.now() + AI_PROVIDER_TIMEOUT_MS;
  for (const model of params.models) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    try {
      return await runAiStrategyModel({
        ...params,
        model,
        timeoutMs: Math.min(AI_MODEL_TIMEOUT_MS, remainingMs),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`${params.provider} strategy model unavailable`);
}

// ─── Exchange ─────────────────────────────────────────────────────────────────

// GET /api/phoenix/markets — active perp market configs
router.get("/markets", async (_req: Request, res: Response) => {
  try {
    const { data, stale } = await cachedGet("/exchange/markets", 10_000, 60_000);
    cacheHeaders(res, 10_000, 60_000, stale);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix API unavailable", detail: msg });
  }
});

// GET /api/phoenix/market/next-commodity-market-transition
router.get("/market/next-commodity-market-transition", async (_req: Request, res: Response) => {
  try {
    const { data, stale } = await cachedGet("/v1/market/next-commodity-market-transition", 30_000, 120_000);
    cacheHeaders(res, 30_000, 120_000, stale);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix commodity transition unavailable", detail: msg });
  }
});

// ─── Trader (public REST) ─────────────────────────────────────────────────────

// GET /api/phoenix/trader/:authority/state
router.get("/trader/:authority/state", async (req: Request, res: Response) => {
  const { authority } = req.params;
  const pdaIndex = req.query.pdaIndex ?? "0";
  const path = `/trader/${encodeURIComponent(authority)}/state?pdaIndex=${pdaIndex}`;
  try {
    const { data, stale } = await cachedGet(path, 3_000, 15_000);
    cacheHeaders(res, 3_000, 15_000, stale);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix trader state unavailable", detail: msg });
  }
});

// GET /api/phoenix/trader/:authority/pnl
router.get("/trader/:authority/pnl", async (req: Request, res: Response) => {
  const { authority } = req.params;
  const qs = new URLSearchParams();
  const fwd = ["resolution", "startTime", "endTime", "limit", "symbols", "includeEarliest", "includeLatest"];
  for (const k of fwd) {
    const v = req.query[k];
    if (v != null) qs.set(k, String(v));
  }
  if (!qs.has("resolution")) qs.set("resolution", "1h");
  const path = `/trader/${encodeURIComponent(authority)}/pnl?${qs}`;
  try {
    const { data, stale } = await cachedGet(path, 30_000, 120_000);
    cacheHeaders(res, 30_000, 120_000, stale);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix PnL unavailable", detail: msg });
  }
});

// GET /api/phoenix/trader/:authority/order-history
router.get("/trader/:authority/order-history", async (req: Request, res: Response) => {
  const { authority } = req.params;
  const qs = new URLSearchParams();
  const fwd = ["traderPdaIndex", "marketSymbol", "limit", "cursor", "orderStatus"];
  for (const k of fwd) {
    const v = req.query[k];
    if (v != null) qs.set(k, String(v));
  }
  if (!qs.has("limit")) qs.set("limit", "25");
  const path = `/trader/${encodeURIComponent(authority)}/order-history?${qs}`;
  try {
    const { data, stale } = await cachedGet(path, 5_000, 30_000);
    cacheHeaders(res, 5_000, 30_000, stale);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix order history unavailable", detail: msg });
  }
});

// GET /api/phoenix/trader/:authority/trades-history
router.get("/trader/:authority/trades-history", async (req: Request, res: Response) => {
  const { authority } = req.params;
  const qs = new URLSearchParams();
  const fwd = ["pdaIndex", "marketSymbol", "limit", "cursor"];
  for (const k of fwd) {
    const v = req.query[k];
    if (v != null) qs.set(k, String(v));
  }
  if (!qs.has("limit")) qs.set("limit", "25");
  const path = `/trader/${encodeURIComponent(authority)}/trades-history?${qs}`;
  try {
    const { data, stale } = await cachedGet(path, 5_000, 30_000);
    cacheHeaders(res, 5_000, 30_000, stale);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix trade history unavailable", detail: msg });
  }
});

// POST /api/phoenix/strategy
// Body: { symbol, focus?, authority?, question?, midPrice?, crossMids?, orderbook? }
router.post("/strategy", strategyLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const symbol = String(body.symbol ?? "SOL").replace(/-PERP$/i, "").trim().toUpperCase();
    const focus =
      typeof body.focus === "string" && body.focus.trim()
        ? body.focus.trim().slice(0, 32)
        : "intraday";
    const question =
      typeof body.question === "string" && body.question.trim()
        ? body.question.trim().slice(0, 280)
        : null;
    const authority =
      typeof body.authority === "string" && body.authority.trim()
        ? body.authority.trim()
        : null;
    const liveMid = toFiniteNumber(body.midPrice);
    const orderbookInput =
      body.orderbook && typeof body.orderbook === "object"
        ? (body.orderbook as Record<string, unknown>)
        : {};
    const crossMidsRaw =
      body.crossMids && typeof body.crossMids === "object"
        ? (body.crossMids as Record<string, unknown>)
        : {};
    const crossMids = Object.fromEntries(
      Object.entries(crossMidsRaw)
        .map(([key, value]) => [key.toUpperCase(), toFiniteNumber(value)])
        .filter((entry): entry is [string, number] => entry[1] != null),
    );
    const orderbook = summarizeOrderbook({
      bids: orderbookInput.bids,
      asks: orderbookInput.asks,
      midPrice: toFiniteNumber(orderbookInput.mid) ?? liveMid,
    });
    const midPrice =
      liveMid ??
      toFiniteNumber(orderbookInput.mid) ??
      (orderbook.bestBid != null && orderbook.bestAsk != null
        ? (orderbook.bestBid + orderbook.bestAsk) / 2
        : orderbook.bestBid ?? orderbook.bestAsk ?? null);

    const { data: marketsRaw } = await cachedGet("/exchange/markets", 10_000, 60_000);
    const markets = Array.isArray(marketsRaw) ? marketsRaw : [];
    const market = (markets as Array<Record<string, unknown>>).find((candidate) => {
      const marketSymbol = String(candidate.symbol ?? candidate.marketSymbol ?? "").toUpperCase();
      return marketSymbol === symbol || marketSymbol === `${symbol}-PERP`;
    }) ?? null;

    if (!market) {
      return res.status(404).json({ error: `Phoenix market ${symbol} not found` });
    }

    const [riseHealth, stateResult, orderHistoryResult, tradeHistoryResult] = await Promise.all([
      getRiseClientHealth(),
      authority
        ? fetchPhoenixData(`/trader/${encodeURIComponent(authority)}/state?pdaIndex=0`, 4_000, 12_000)
        : Promise.resolve({ data: null, error: null }),
      authority
        ? fetchPhoenixData(`/trader/${encodeURIComponent(authority)}/order-history?traderPdaIndex=0&marketSymbol=${encodeURIComponent(symbol)}-PERP&limit=3`, 4_000, 12_000)
        : Promise.resolve({ data: null, error: null }),
      authority
        ? fetchPhoenixData(`/trader/${encodeURIComponent(authority)}/trades-history?pdaIndex=0&marketSymbol=${encodeURIComponent(symbol)}-PERP&limit=3`, 4_000, 12_000)
        : Promise.resolve({ data: null, error: null }),
    ]);

    const traderState =
      stateResult.data && typeof stateResult.data === "object"
        ? (stateResult.data as Record<string, unknown>)
        : null;
    const firstTrader =
      Array.isArray(traderState?.traders) && traderState?.traders[0] && typeof traderState.traders[0] === "object"
        ? (traderState.traders[0] as Record<string, unknown>)
        : null;
    const traderPositions = Array.isArray(firstTrader?.positions)
      ? (firstTrader.positions as Array<Record<string, unknown>>)
      : [];
    const selectedPosition = traderPositions.find(
      (position) => String(position.symbol ?? position.marketSymbol ?? "").toUpperCase() === symbol,
    ) ?? null;
    const recentOrdersRaw =
      orderHistoryResult.data && typeof orderHistoryResult.data === "object"
        ? (orderHistoryResult.data as Record<string, unknown>)
        : null;
    const recentTradesRaw =
      tradeHistoryResult.data && typeof tradeHistoryResult.data === "object"
        ? (tradeHistoryResult.data as Record<string, unknown>)
        : null;

    const traderSummary = authority
      ? {
          authority,
          riskState:
            typeof firstTrader?.riskState === "string" ? firstTrader.riskState : null,
          collateral: toFiniteNumber(firstTrader?.collateralBalance),
          effectiveCollateral: toFiniteNumber(firstTrader?.effectiveCollateral),
          portfolioValue: toFiniteNumber(firstTrader?.portfolioValue),
          unrealizedPnl: toFiniteNumber(firstTrader?.unrealizedPnl),
          positionCount: traderPositions.length,
          selectedPosition: selectedPosition
            ? {
                symbol,
                side:
                  toFiniteNumber(selectedPosition.positionSize) != null &&
                  Number(selectedPosition.positionSize) < 0
                    ? "short"
                    : "long",
                size: toFiniteNumber(selectedPosition.positionSize),
                entryPrice: toFiniteNumber(selectedPosition.entryPrice),
                liquidationPrice: toFiniteNumber(selectedPosition.liquidationPrice),
                unrealizedPnl: toFiniteNumber(selectedPosition.unrealizedPnl),
              }
            : null,
          selectedPositionSide: selectedPosition
            ? (
                toFiniteNumber(selectedPosition.positionSize) != null &&
                Number(selectedPosition.positionSize) < 0
                  ? "short"
                  : "long"
              )
            : null,
          recentOrders: Array.isArray(recentOrdersRaw?.data)
            ? recentOrdersRaw.data
                .slice(0, 3)
                .map((order) => {
                  const row = order as Record<string, unknown>;
                  return {
                    side: row.side,
                    status: row.status,
                    price: toFiniteNumber(row.price),
                    size: toFiniteNumber(row.baseQty ?? row.quantity),
                  };
                })
            : [],
          recentTrades: Array.isArray(recentTradesRaw?.data)
            ? recentTradesRaw.data
                .slice(0, 3)
                .map((trade) => {
                  const row = trade as Record<string, unknown>;
                  return {
                    side: row.side,
                    price: toFiniteNumber(row.price),
                    size: toFiniteNumber(row.baseLotsDelta ?? row.quantity),
                    realizedPnl: toFiniteNumber(row.realizedPnl),
                  };
                })
            : [],
          warnings: [stateResult.error, orderHistoryResult.error, tradeHistoryResult.error].filter(Boolean),
        }
      : null;

    const payload = loadBrowserAgents();
    const agent = getBrowserAgent("solana-vulcan-clawd-autonomous-perps");
    const recommendation = agent
      ? deriveBrowserAgentRecommendation(agent, payload)
      : null;
    const perpsProject = payload.projects.find((project) => project.id === "clawd-agents-perps") ?? null;

    const heuristicBase = buildHeuristicAnalysis({
      symbol,
      focus,
      midPrice,
      orderbook,
      trader: traderSummary
        ? {
            riskState: traderSummary.riskState,
            selectedPositionSide: traderSummary.selectedPositionSide,
          }
        : null,
    });

    const builder = {
      configured: HAS_BUILDER_ENV,
      authority: BUILDER_AUTHORITY || null,
      portfolioIndex: BUILDER_PDA_INDEX,
      pdaIndex: BUILDER_PDA_INDEX,
      subaccountIndex: BUILDER_SUBACCOUNT_INDEX,
      traderAccount: BUILDER_TRADER || null,
      flightFeeBps: FLIGHT_FEE_BPS || null,
      legacyBuilderFeeBps: LEGACY_BUILDER_FEE_BPS || null,
      legacyReferrer: LEGACY_REFERRER || null,
      riseReady: riseHealth.ok,
      riseStatus: riseHealth.ok ? "ready" : "degraded",
      riseDetail: riseHealth.detail,
      usingFallback: !HAS_BUILDER_ENV,
    };

    const marketSummary = {
      symbol,
      marketPubkey: String(market.marketPubkey ?? ""),
      status: String(market.marketStatus ?? market.status ?? "unknown"),
      isolatedOnly: Boolean(market.isolatedOnly),
      tickSize: toFiniteNumber(market.tickSize),
      topLeverage: Array.isArray(market.leverageTiers)
        ? toFiniteNumber((market.leverageTiers[0] as Record<string, unknown> | undefined)?.maxLeverage)
        : null,
      makerFeePct: pct(toFiniteNumber(market.makerFee)),
      takerFeePct: pct(toFiniteNumber(market.takerFee)),
      maintenanceMarginPct: toFiniteNumber((market.riskFactors as Record<string, unknown> | undefined)?.maintenance),
      fundingPeriodHours:
        toFiniteNumber(market.fundingPeriodSeconds) != null
          ? round(Number(market.fundingPeriodSeconds) / 3600, 2)
          : null,
      maxFundingRatePct: toFiniteNumber(market.maxFundingRatePerIntervalPercentage),
      midPrice,
      crossMids,
      orderbook,
    };

    const promptPayload = {
      focus,
      question,
      builder,
      market: marketSummary,
      trader: traderSummary
        ? {
            riskState: traderSummary.riskState,
            collateral: traderSummary.collateral,
            effectiveCollateral: traderSummary.effectiveCollateral,
            portfolioValue: traderSummary.portfolioValue,
            unrealizedPnl: traderSummary.unrealizedPnl,
            selectedPosition: traderSummary.selectedPosition,
            recentOrders: traderSummary.recentOrders,
            recentTrades: traderSummary.recentTrades,
          }
        : null,
      importedAgent: agent
        ? {
            id: agent.id,
            title: agent.title,
            description: agent.description,
            tags: agent.tags.slice(0, 8),
            capabilities: agent.capabilities.slice(0, 8),
            strategyModes: agent.openingQuestions.slice(0, 4),
            vulcanSkills: agent.vulcanSkills.slice(0, 8),
            recommendedRuntime: recommendation?.runtime ?? null,
            recommendedProvider: recommendation?.provider ?? null,
            recommendedModel: recommendation?.model ?? null,
            project: perpsProject
              ? {
                  id: perpsProject.id,
                  title: perpsProject.title,
                  summary: perpsProject.summary.split("\n").slice(0, 4).join("\n"),
                }
              : null,
          }
        : null,
      matchingEngine: {
        view: "combined FIFO + spline order book",
        equalPricePriority: "spline liquidity fills before FIFO at the same price, but never jumps a better FIFO level",
      },
      accountModel: {
        walletAuthority: authority,
        portfolioIndex: 0,
        crossAccount: "subaccount_index = 0",
        isolatedAccount: "subaccount_index > 0",
      },
      heuristics: {
        bias: heuristicBase.bias,
        confidence: heuristicBase.confidence,
        summary: heuristicBase.summary,
      },
    };

    const aiCacheKey = strategyCacheKey({
      symbol,
      focus,
      midPrice,
      imbalance: orderbook.imbalance,
      spreadBps: orderbook.spreadBps,
      bestBid: orderbook.bestBid,
      bestAsk: orderbook.bestAsk,
      traderRiskState: traderSummary?.riskState ?? null,
      selectedPositionSide: traderSummary?.selectedPositionSide ?? null,
    });

    let cachedAi = strategyAiCache.get(aiCacheKey);
    if (cachedAi && cachedAi.expiresAt <= Date.now()) {
      strategyAiCache.delete(aiCacheKey);
      cachedAi = undefined;
    }

    let aiAnalyses = cachedAi?.analyses ?? [];
    let aiErrors = cachedAi?.errors ?? [];

    if (!cachedAi && (deepseekClient || xaiClient || openRouterFreeClient)) {
      const prompt =
        "Generate a concise Phoenix perps playbook from this live snapshot. " +
        "Keep the answer execution-focused, risk-aware, aligned with the imported Vulcan persona, " +
        "and reason about Phoenix as a combined FIFO+spline book with cross-vs-isolated account boundaries.\n" +
        "Return exactly this JSON shape and nothing else:\n" +
        "{\n" +
        '  "bias": "long | short | neutral | reduce-risk",\n' +
        '  "confidence": 0,\n' +
        '  "timeframe": "intraday",\n' +
        '  "summary": "...",\n' +
        '  "thesis": ["...", "...", "..."],\n' +
        '  "tradePlan": {\n' +
        '    "entry": "...",\n' +
        '    "stop": "...",\n' +
        '    "target": "...",\n' +
        '    "size": "..."\n' +
        "  },\n" +
        '  "riskFlags": ["...", "..."],\n' +
        '  "watchList": ["...", "...", "..."]\n' +
        "}\n\n" +
        JSON.stringify(promptPayload, null, 2);

      const jobs: Array<Promise<StrategyAnalysis>> = [];
      const labels: Array<{ provider: "deepseek" | "xai" | "openrouter"; model: string }> = [];

      if (deepseekClient) {
        labels.push({ provider: "deepseek", model: DEEPSEEK_STRATEGY_MODELS.join(" -> ") });
        jobs.push(
          runAiStrategyCandidates({
            client: deepseekClient,
            provider: "deepseek",
            models: DEEPSEEK_STRATEGY_MODELS,
            prompt,
            fallback: {
              ...heuristicBase,
              summary: "DeepSeek fell back to the local heuristic framing for this snapshot.",
            },
          }),
        );
      }
      if (xaiClient) {
        labels.push({ provider: "xai", model: XAI_STRATEGY_MODELS.join(" -> ") });
        jobs.push(
          runAiStrategyCandidates({
            client: xaiClient,
            provider: "xai",
            models: XAI_STRATEGY_MODELS,
            prompt,
            fallback: {
              ...heuristicBase,
              summary: "Grok fell back to the local heuristic framing for this snapshot.",
            },
          }),
        );
      }
      if (openRouterFreeClient) {
        labels.push({ provider: "openrouter", model: OPENROUTER_FREE_STRATEGY_MODELS.join(" -> ") });
        jobs.push(
          runAiStrategyCandidates({
            client: openRouterFreeClient,
            provider: "openrouter",
            models: OPENROUTER_FREE_STRATEGY_MODELS,
            prompt,
            fallback: {
              ...heuristicBase,
              summary: "OpenRouter Free fell back to the local heuristic framing for this snapshot.",
            },
          }),
        );
      }

      const results = await Promise.allSettled(jobs);
      aiAnalyses = [];
      aiErrors = [];

      results.forEach((result, index) => {
        const label = labels[index];
        if (result.status === "fulfilled") {
          aiAnalyses.push(result.value);
          return;
        }
        aiErrors.push({
          provider: label.provider,
          model: label.model,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      });

      strategyAiCache.set(aiCacheKey, {
        analyses: aiAnalyses,
        errors: aiErrors,
        expiresAt: Date.now() + 90_000,
      });
    }

    const analyses = [...aiAnalyses, heuristicBase];

    res.json({
      generatedAt: new Date().toISOString(),
      symbol,
      focus,
      builder,
      market: marketSummary,
      matchingEngine: {
        view: "combined FIFO + spline liquidity",
        note: "At equal prices, spline liquidity fills before FIFO, but only up to the current FIFO boundary.",
      },
      accounts: {
        note: "subaccount_index = 0 is cross margin; subaccount_index > 0 is isolated under the same portfolio.",
        authority,
        portfolioIndex: 0,
      },
      trader: traderSummary
        ? {
            authority: traderSummary.authority,
            riskState: traderSummary.riskState,
            collateral: traderSummary.collateral,
            effectiveCollateral: traderSummary.effectiveCollateral,
            portfolioValue: traderSummary.portfolioValue,
            unrealizedPnl: traderSummary.unrealizedPnl,
            positionCount: traderSummary.positionCount,
            selectedPosition: traderSummary.selectedPosition,
            warnings: traderSummary.warnings,
          }
        : null,
      agent: agent
        ? {
            id: agent.id,
            title: agent.title,
            description: agent.description,
            recommendation: recommendation
              ? {
                  runtime: recommendation.runtime,
                  provider: recommendation.provider,
                  model: recommendation.model,
                }
              : null,
            skills: agent.vulcanSkills.slice(0, 10),
            project: perpsProject
              ? {
                  id: perpsProject.id,
                  title: perpsProject.title,
                  path: perpsProject.path,
                  summary: perpsProject.summary,
                }
              : null,
          }
        : null,
      ai: {
        deepseekConfigured: Boolean(deepseekClient),
        openRouterFreeConfigured: Boolean(openRouterFreeClient),
        xaiConfigured: Boolean(xaiClient),
        errors: aiErrors,
        analyses,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix strategy unavailable", detail: msg });
  }
});

// ─── Order instruction endpoints ──────────────────────────────────────────────
// Limit order instructions use the Rise SDK and server-side Flight config.
// The browser only receives unsigned Solana instructions to sign locally.

const CONFIGURED_BUILDER_AUTHORITY = firstNonEmpty(
  process.env.PHOENIX_BUILDER_AUTHORITY,
  process.env.PHOENIX_FLIGHT_BUILDER_AUTHORITY,
  process.env.PHOENIX_LEGACY_BUILDER_AUTHORITY,
  process.env.VITE_PHOENIX_BUILDER_AUTHORITY,
  process.env.VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY,
  process.env.VITE_PHOENIX_LEGACY_BUILDER_AUTHORITY,
  process.env.CLAWD_PERPS_WALLET,
);
const BUILDER_AUTHORITY = CONFIGURED_BUILDER_AUTHORITY || DEFAULT_BUILDER_AUTHORITY;
const HAS_BUILDER_ENV = Boolean(CONFIGURED_BUILDER_AUTHORITY);
const BUILDER_PDA_INDEX = Number(
  firstNonEmpty(
    process.env.PHOENIX_BUILDER_PDA_INDEX,
    process.env.PHOENIX_FLIGHT_BUILDER_PDA_INDEX,
    process.env.VITE_PHOENIX_BUILDER_PDA_INDEX,
    process.env.VITE_PHOENIX_FLIGHT_BUILDER_PDA_INDEX,
  ) || 0,
);
const BUILDER_SUBACCOUNT_INDEX = Number(
  firstNonEmpty(
    process.env.PHOENIX_BUILDER_SUBACCOUNT_INDEX,
    process.env.PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX,
    process.env.VITE_PHOENIX_BUILDER_SUBACCOUNT_INDEX,
    process.env.VITE_PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX,
  ) || 0,
);
const BUILDER_TRADER = firstNonEmpty(
  process.env.PHOENIX_BUILDER_TRADER_ACCOUNT,
  process.env.PHOENIX_FLIGHT_FEE_COLLECTOR_TRADER,
  process.env.VITE_PHOENIX_BUILDER_TRADER_ACCOUNT,
  process.env.VITE_PHOENIX_FLIGHT_FEE_COLLECTOR_TRADER,
);
const FLIGHT_FEE_BPS = Number(
  firstNonEmpty(process.env.PHOENIX_FLIGHT_FEE_BPS, process.env.VITE_PHOENIX_FLIGHT_FEE_BPS) || 0,
);
const LEGACY_BUILDER_FEE_BPS = Number(
  firstNonEmpty(process.env.PHOENIX_LEGACY_BUILDER_FEE_BPS, process.env.VITE_PHOENIX_LEGACY_BUILDER_FEE_BPS) || 0,
);
const LEGACY_REFERRER = firstNonEmpty(process.env.PHOENIX_LEGACY_REFERRER, process.env.VITE_PHOENIX_LEGACY_REFERRER);

type PhoenixClient = ReturnType<typeof createPhoenixClient>;
type KitInstructionAccount = {
  address?: unknown;
  pubkey?: unknown;
  role?: unknown;
  isSigner?: unknown;
  isWritable?: unknown;
};
type KitInstruction = {
  programAddress?: unknown;
  programId?: unknown;
  accounts?: KitInstructionAccount[];
  keys?: KitInstructionAccount[];
  data?: unknown;
};

let riseClientPromise: Promise<PhoenixClient> | null = null;

function getRiseClient(): Promise<PhoenixClient> {
  if (!riseClientPromise) {
    const client = createPhoenixClient({
      apiUrl: API,
      rpcUrl: RPC_URL,
      exchangeMetadata: { stream: true },
      flight: {
        builderAuthority: BUILDER_AUTHORITY as never,
        builderPdaIndex: BUILDER_PDA_INDEX,
        builderSubaccountIndex: BUILDER_SUBACCOUNT_INDEX,
      },
    });
    riseClientPromise = client.exchange.ready().then(() => client);
  }
  return riseClientPromise;
}

function withFlight(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    ...(BUILDER_AUTHORITY ? { flightBuilderAuthority: BUILDER_AUTHORITY } : {}),
    ...(BUILDER_TRADER ? { flightFeeCollectorTrader: BUILDER_TRADER } : {}),
  };
}

function toRiseSide(value: unknown): Side {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "bid" || normalized === "buy" || normalized === "long") return Side.Bid;
  if (normalized === "ask" || normalized === "sell" || normalized === "short") return Side.Ask;
  throw new Error("Order side must be bid/ask");
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalNumber(body: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = body[key];
    if (value != null && value !== "") return Number(value);
  }
  return fallback;
}

function roleToFlags(role: unknown): { isSigner: boolean; isWritable: boolean } {
  if (role === 1 || role === "WRITABLE") return { isSigner: false, isWritable: true };
  if (role === 2 || role === "READONLY_SIGNER") return { isSigner: true, isWritable: false };
  if (role === 3 || role === "WRITABLE_SIGNER") return { isSigner: true, isWritable: true };
  return { isSigner: false, isWritable: false };
}

function instructionToRaw(ix: KitInstruction) {
  const accounts = ix.accounts ?? ix.keys ?? [];
  return {
    programId: String(ix.programAddress ?? ix.programId ?? ""),
    keys: accounts.map((account) => {
      const flags = roleToFlags(account.role);
      return {
        pubkey: String(account.address ?? account.pubkey ?? ""),
        isSigner: typeof account.isSigner === "boolean" ? account.isSigner : flags.isSigner,
        isWritable: typeof account.isWritable === "boolean" ? account.isWritable : flags.isWritable,
      };
    }),
    data: Array.from(ix.data instanceof Uint8Array ? ix.data : new Uint8Array()),
  };
}

// POST /api/phoenix/ix/place-limit-order-enhanced
// Returns { instructions, estimatedLiquidationPriceUsd }
router.post("/ix/place-limit-order-enhanced", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const symbol = requiredString(body, "symbol");
    const priceUsd = body.priceUsd ?? body.price;
    const baseUnits = body.baseUnits ?? body.quantity;
    if (priceUsd == null || priceUsd === "") throw new Error("priceUsd is required");
    if (baseUnits == null || baseUnits === "") throw new Error("baseUnits is required");

    const orderPacket = await client.orderPackets.buildLimitOrderPacket({
      symbol: symbol as never,
      side: toRiseSide(body.side),
      priceUsd: String(priceUsd),
      baseUnits: String(baseUnits),
    });

    const ix = await client.ixs.buildPlaceLimitOrder({
      authority: requiredString(body, "authority") as never,
      symbol: symbol as never,
      orderPacket,
      traderPdaIndex: optionalNumber(body, ["traderPdaIndex", "pdaIndex"], 0),
      traderSubaccountIndex: optionalNumber(body, ["traderSubaccountIndex", "subaccountIndex"], 0),
    });

    res.json({
      instructions: [instructionToRaw(ix as KitInstruction)],
      estimatedLiquidationPriceUsd: null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix IX unavailable", detail: msg });
  }
});

// POST /api/phoenix/ix/place-market-order-enhanced
router.post("/ix/place-market-order-enhanced", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await proxyPost(
      "/v1/ix/place-isolated-market-order-enhanced",
      withFlight(req.body as Record<string, unknown>),
    );
    res.status(ok ? 200 : status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix IX unavailable", detail: msg });
  }
});

// POST /api/phoenix/ix/place-limit-order (non-enhanced, simple array response)
router.post("/ix/place-limit-order", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const symbol = requiredString(body, "symbol");
    const priceUsd = body.priceUsd ?? body.price;
    const baseUnits = body.baseUnits ?? body.quantity;
    if (priceUsd == null || priceUsd === "") throw new Error("priceUsd is required");
    if (baseUnits == null || baseUnits === "") throw new Error("baseUnits is required");

    const orderPacket = await client.orderPackets.buildLimitOrderPacket({
      symbol: symbol as never,
      side: toRiseSide(body.side),
      priceUsd: String(priceUsd),
      baseUnits: String(baseUnits),
    });
    const ix = await client.ixs.buildPlaceLimitOrder({
      authority: requiredString(body, "authority") as never,
      symbol: symbol as never,
      orderPacket,
      traderPdaIndex: optionalNumber(body, ["traderPdaIndex", "pdaIndex"], 0),
      traderSubaccountIndex: optionalNumber(body, ["traderSubaccountIndex", "subaccountIndex"], 0),
    });

    res.json([instructionToRaw(ix as KitInstruction)]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix IX unavailable", detail: msg });
  }
});

// POST /api/phoenix/ix/place-market-order
router.post("/ix/place-market-order", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await proxyPost(
      "/v1/ix/place-isolated-market-order",
      withFlight(req.body as Record<string, unknown>),
    );
    res.status(ok ? 200 : status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix IX unavailable", detail: msg });
  }
});

// POST /api/phoenix/ix/cancel-conditional-order
router.post("/ix/cancel-conditional-order", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await proxyPost(
      "/v1/ix/cancel-conditional-order",
      req.body as Record<string, unknown>,
    );
    res.status(ok ? 200 : status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phoenix IX unavailable", detail: msg });
  }
});

// ─── Trader existence check ───────────────────────────────────────────────────

// GET /api/phoenix/trader/:authority/exists
router.get("/trader/:authority/exists", async (req: Request, res: Response) => {
  const { authority } = req.params;
  try {
    const r = await fetch(`${API}/trader/${encodeURIComponent(authority)}/state?pdaIndex=0`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (r.status === 404) return res.json({ registered: false });
    if (!r.ok) throw new Error(`Phoenix ${r.status}`);
    const data = (await r.json()) as { traders?: unknown[] };
    const registered = Array.isArray(data.traders) ? data.traders.length > 0 : true;
    return res.json({ registered });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: msg });
  }
});

// ─── Trader registration ──────────────────────────────────────────────────────

// POST /api/phoenix/ix/register-trader
// Body: { authority: string }
router.post("/ix/register-trader", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const authority = requiredString(body, "authority");
    const ix = await client.ixs.buildRegisterTrader({
      authority: authority as never,
      marginType: MarginType.Cross,
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
    });
    res.json({ instructions: [instructionToRaw(ix as KitInstruction)] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Register trader IX failed", detail: msg });
  }
});

// ─── Deposit / Withdraw ───────────────────────────────────────────────────────

// POST /api/phoenix/ix/deposit
// Body: { authority: string, amount: number (whole USDC, e.g. 100) }
router.post("/ix/deposit", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const authority = requiredString(body, "authority");
    const wholeUsdc = Number(body.amount ?? 0);
    if (!Number.isFinite(wholeUsdc) || wholeUsdc <= 0) throw new Error("amount must be positive");
    const nativeAmount = BigInt(Math.round(wholeUsdc * 1_000_000));

    const result = await client.ixs.buildDepositIxs({
      authority: authority as never,
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
      amount: nativeAmount,
    });
    const ixArr = Array.isArray(result) ? result : (result as { instructions?: unknown[] }).instructions ?? [result];
    res.json({ instructions: (ixArr as KitInstruction[]).map(instructionToRaw) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Deposit IX failed", detail: msg });
  }
});

// POST /api/phoenix/ix/withdraw
// Body: { authority: string, amount: number (whole USDC) }
router.post("/ix/withdraw", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const authority = requiredString(body, "authority");
    const wholeUsdc = Number(body.amount ?? 0);
    if (!Number.isFinite(wholeUsdc) || wholeUsdc <= 0) throw new Error("amount must be positive");
    const nativeAmount = BigInt(Math.round(wholeUsdc * 1_000_000));

    const result = await client.ixs.buildWithdrawIxs({
      authority: authority as never,
      traderPdaIndex: 0,
      traderSubaccountIndex: 0,
      amount: nativeAmount,
    });
    const ixArr = Array.isArray(result) ? result : (result as { instructions?: unknown[] }).instructions ?? [result];
    res.json({ instructions: (ixArr as KitInstruction[]).map(instructionToRaw) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Withdraw IX failed", detail: msg });
  }
});

// ─── Cancel orders ────────────────────────────────────────────────────────────

// POST /api/phoenix/ix/cancel-all
// Body: { authority: string, symbol: string }
router.post("/ix/cancel-all", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const authority = requiredString(body, "authority");
    const symbol = requiredString(body, "symbol");
    const ix = await client.ixs.buildCancelAll({
      authority: authority as never,
      symbol: symbol as never,
    });
    res.json({ instructions: [instructionToRaw(ix as KitInstruction)] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Cancel all IX failed", detail: msg });
  }
});

// POST /api/phoenix/ix/cancel-orders
// Body: { authority: string, symbol: string, orders: { price: string, orderSequenceNumber: string }[] }
router.post("/ix/cancel-orders", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const client = await getRiseClient();
    const authority = requiredString(body, "authority");
    const symbol = requiredString(body, "symbol");
    const orders = (body.orders as { price: string; orderSequenceNumber: string }[]) ?? [];
    const mappedOrders = orders.map((o) => ({
      price: BigInt(o.price),
      orderSequenceNumber: o.orderSequenceNumber,
    }));
    const ix = await client.ixs.buildCancelOrdersById({
      authority: authority as never,
      symbol: symbol as never,
      orders: mappedOrders as never,
    });
    res.json({ instructions: [instructionToRaw(ix as KitInstruction)] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Cancel orders IX failed", detail: msg });
  }
});

// ─── Invite / referral activation ────────────────────────────────────────────

// POST /api/phoenix/invite/activate
// Body: { authority: string, code: string }
router.post("/invite/activate", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await proxyPost("/v1/invite/activate", req.body as Record<string, unknown>);
    res.status(ok ? 200 : status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

// ─── Auth passthrough ─────────────────────────────────────────────────────────

// GET /api/phoenix/auth/nonce?wallet_pubkey=...
router.get("/auth/nonce", async (req: Request, res: Response) => {
  const qs = new URLSearchParams({ wallet_pubkey: String(req.query.wallet_pubkey ?? "") });
  try {
    const r = await fetch(`${API}/v1/auth/nonce?${qs}`, { signal: AbortSignal.timeout(8_000) });
    const data: unknown = await r.json();
    res.status(r.status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

// POST /api/phoenix/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await proxyPost("/v1/auth/login/wallet", req.body as Record<string, unknown>);
    res.status(ok ? 200 : status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

// POST /api/phoenix/auth/refresh
router.post("/auth/refresh", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await proxyPost("/v1/auth/refresh", req.body as Record<string, unknown>);
    res.status(ok ? 200 : status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

// POST /api/phoenix/auth/logout
router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const r = await fetch(`${API}/v1/auth/logout`, {
      method: "POST",
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(8_000),
    });
    res.status(r.status).json({});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

export default router;
