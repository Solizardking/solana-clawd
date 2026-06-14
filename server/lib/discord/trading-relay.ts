import type { NextFunction, Request, Response } from "express";
import { clawdBus } from "../clawd/bus";
import type { ArenaEvent, Fill, GateDecision, StrategySignal } from "../clawd/types";

type RelayField = {
  name: string;
  value: string;
  inline?: boolean;
};

type RelayEvent = {
  source: string;
  title: string;
  description?: string;
  severity?: "info" | "success" | "warn" | "error";
  fields?: RelayField[];
  url?: string;
  dedupeKey?: string;
  minIntervalMs?: number;
  raw?: unknown;
};

const COLORS = {
  info: 0x38bdf8,
  success: 0x22c55e,
  warn: 0xf59e0b,
  error: 0xef4444,
} as const;

const relayDedupe = new Map<string, number>();
let clawdRelayStarted = false;

export function getDiscordTradingConfig() {
  const serverIdRaw = process.env.DISCORD_SERVER_ID || process.env.GUILD_ID || "";
  const serverId = serverIdRaw.match(/\/icons\/(\d+)\//)?.[1] || serverIdRaw.match(/^\d+$/)?.[0] || process.env.GUILD_ID || "";
  return {
    configured: Boolean(process.env.DISCORD_TRADING_URL || process.env.DISCORD_WEBHOOK),
    webhookUrl: process.env.DISCORD_TRADING_URL || process.env.DISCORD_WEBHOOK || "",
    channelId: process.env.DISCORD_CHANNEL_ID || "",
    serverId,
    appUrl: (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://cheshireterminal.ai").replace(/\/$/, ""),
  };
}

function truncate(value: string, max = 950) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function compactJson(value: unknown, max = 1400) {
  try {
    return truncate(JSON.stringify(redact(value), null, 2), max);
  } catch {
    return truncate(String(value), max);
  }
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 8).map(redact);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (/(secret|token|key|signature|authorization|password|private)/.test(lowered)) {
      out[key] = "[redacted]";
    } else if (typeof raw === "object" && raw !== null) {
      out[key] = redact(raw);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

function field(name: string, value: unknown, inline = true): RelayField {
  return { name, value: truncate(String(value ?? "n/a"), 1024), inline };
}

async function postWebhook(body: Record<string, unknown>) {
  const { webhookUrl } = getDiscordTradingConfig();
  if (!webhookUrl) return { ok: false, status: 503, data: { error: "DISCORD_TRADING_URL not configured" } };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { ok: response.ok, status: response.status, data };
}

export async function relayTradingEvent(event: RelayEvent) {
  const { configured, appUrl } = getDiscordTradingConfig();
  if (!configured) return { ok: false, status: 503, data: { error: "Discord trading relay not configured" } };

  const minIntervalMs = event.minIntervalMs ?? 10_000;
  const dedupeKey = event.dedupeKey || `${event.source}:${event.title}`;
  const lastSent = relayDedupe.get(dedupeKey) || 0;
  if (Date.now() - lastSent < minIntervalMs) {
    return { ok: true, status: 204, data: { skipped: "deduped" } };
  }
  relayDedupe.set(dedupeKey, Date.now());

  const severity = event.severity || "info";
  const embed = {
    title: truncate(event.title, 256),
    description: event.description ? truncate(event.description, 4000) : undefined,
    color: COLORS[severity],
    url: event.url,
    fields: [
      field("source", event.source),
      ...(event.fields || []),
      ...(event.raw ? [{ name: "payload", value: `\`\`\`json\n${compactJson(event.raw, 950)}\n\`\`\``, inline: false }] : []),
    ].slice(0, 20),
    timestamp: new Date().toISOString(),
    footer: { text: "Cheshire Terminal trading relay" },
  };

  return postWebhook({
    username: "Cheshire Trading Relay",
    avatar_url: `${appUrl}/8bit_logo.png`,
    allowed_mentions: { parse: [] },
    embeds: [embed],
  });
}

function isTradingApiPath(path: string) {
  return [
    "/api/dflow",
    "/api/jupiter-ultra",
    "/api/jupiter-prediction",
    "/api/meteora-swap",
    "/api/dbc",
    "/api/clawd",
    "/api/treasury",
    "/api/wallet-ops",
    "/api/streamflow",
    "/api/telegram",
  ].some((prefix) => path.startsWith(prefix));
}

function shouldRelayApiRequest(req: Request, statusCode: number) {
  if (!isTradingApiPath(req.path)) return false;
  if (req.path.startsWith("/api/telegram/status")) return false;
  if (req.path.startsWith("/api/telegram/config")) return false;
  if (req.method !== "GET") return true;
  if (statusCode >= 400) return true;
  return req.path.includes("/stream") || req.path.includes("/status") || req.path.includes("/webhook");
}

export function discordTradingApiMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (!shouldRelayApiRequest(req, res.statusCode)) return;
    const severity = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    const body = req.method === "GET" ? undefined : redact(req.body);
    void relayTradingEvent({
      source: "api",
      title: `${req.method} ${req.path}`,
      severity,
      description: `Trading/API endpoint completed with HTTP ${res.statusCode}.`,
      fields: [
        field("status", res.statusCode),
        field("duration", `${Date.now() - startedAt}ms`),
        field("ip", req.ip || "unknown"),
      ],
      raw: body,
      dedupeKey: `api:${req.method}:${req.path}:${res.statusCode}`,
      minIntervalMs: severity === "info" ? 60_000 : 15_000,
    });
  });
  next();
}

function solscan(signature?: string) {
  return signature ? `https://solscan.io/tx/${signature}` : undefined;
}

function relayClawdEvent(event: ArenaEvent) {
  if (event.type === "fill") {
    const fillPayload = event.payload as Fill;
    void relayTradingEvent({
      source: "clawd",
      title: `${fillPayload.mode.toUpperCase()} ${fillPayload.side.toUpperCase()} ${fillPayload.symbol}`,
      severity: fillPayload.mode === "paper" ? "info" : "success",
      description: `Fill on ${fillPayload.venue}.`,
      url: solscan(fillPayload.txSignature),
      fields: [
        field("notional", `$${Number(fillPayload.notionalUsd || 0).toFixed(2)}`),
        field("size", fillPayload.size),
        field("price", fillPayload.price),
        field("pnl", fillPayload.pnlUsd == null ? "n/a" : `$${Number(fillPayload.pnlUsd).toFixed(2)}`),
      ],
      raw: fillPayload,
      dedupeKey: `clawd:fill:${fillPayload.id || fillPayload.txSignature || event.ts}`,
      minIntervalMs: 1,
    });
    return;
  }

  if (event.type === "signal") {
    const sig = event.payload as StrategySignal;
    void relayTradingEvent({
      source: "clawd",
      title: `${sig.direction} signal: ${sig.symbol}`,
      severity: sig.direction === "HOLD" ? "info" : "warn",
      description: truncate((sig.reasons || []).join("\n"), 1200),
      fields: [
        field("score", sig.score),
        field("suggested", `$${Number(sig.suggestedNotionalUsd || 0).toFixed(2)}`),
        field("mint", sig.mint, false),
      ],
      raw: sig,
      dedupeKey: `clawd:signal:${sig.symbol}:${sig.direction}`,
      minIntervalMs: 120_000,
    });
    return;
  }

  if (event.type === "gate_decision") {
    const decision = event.payload?.decision as GateDecision | undefined;
    const sig = event.payload?.signal as StrategySignal | undefined;
    if (!decision || !sig) return;
    void relayTradingEvent({
      source: "clawd",
      title: `Gate ${decision.action}: ${sig.symbol}`,
      severity: decision.action === "APPROVE" ? "success" : decision.action === "VETO" ? "error" : "warn",
      description: truncate(decision.reasoning || "No reasoning supplied.", 1500),
      fields: [field("direction", sig.direction), field("score", sig.score), field("notional", `$${Number(sig.suggestedNotionalUsd || 0).toFixed(2)}`)],
      dedupeKey: `clawd:gate:${sig.symbol}:${decision.action}`,
      minIntervalMs: 120_000,
    });
    return;
  }

  if (event.type === "error") {
    void relayTradingEvent({
      source: "clawd",
      title: "CLAWD trading error",
      severity: "error",
      description: String(event.payload?.msg || event.payload?.error || "Unknown trading error"),
      raw: event.payload,
      dedupeKey: `clawd:error:${event.payload?.msg || "unknown"}`,
      minIntervalMs: 60_000,
    });
    return;
  }

  if (event.type === "pump_stream") {
    const payload = event.payload || {};
    const mint = payload.mint || payload.tokenMint || payload.baseMint || "unknown";
    const signature = payload.signature || payload.txSignature || payload.transactionSignature;
    void relayTradingEvent({
      source: "helius-pump-stream",
      title: `Pump stream: ${payload.symbol || payload.name || mint}`,
      severity: "info",
      description: payload.description ? String(payload.description) : "Helius pump stream event received.",
      url: solscan(signature),
      fields: [
        field("mint", mint, false),
        field("event", payload.type || payload.event || "pump_stream"),
      ],
      raw: payload,
      dedupeKey: `pump:${signature || mint}:${payload.type || payload.event || event.ts}`,
      minIntervalMs: 60_000,
    });
  }
}

export function startClawdDiscordRelay() {
  if (clawdRelayStarted) return;
  clawdRelayStarted = true;
  clawdBus.subscribe(relayClawdEvent);
}

export function relayDflowTrades(ticker: string, payload: unknown, stale = false) {
  const trades = Array.isArray((payload as any)?.trades)
    ? (payload as any).trades
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : Array.isArray(payload)
        ? payload
        : [];
  const latest = trades[0];
  void relayTradingEvent({
    source: "dflow-stream",
    title: `DFlow trades: ${ticker}`,
    severity: stale ? "warn" : "info",
    description: latest
      ? `Latest trade ${latest.taker_side || latest.side || "trade"} at ${latest.yes_price_dollars || latest.no_price_dollars || latest.price || "n/a"}.`
      : "Trade stream updated.",
    fields: [
      field("ticker", ticker),
      field("trades", trades.length),
      field("stale", stale),
    ],
    raw: latest || payload,
    dedupeKey: `dflow:trades:${ticker}:${latest?.trade_id || latest?.signature || latest?.created_time || Date.now()}`,
    minIntervalMs: 30_000,
  });
}

export function relayDflowOrderbook(ticker: string, payload: unknown, stale = false) {
  const data = (payload as any)?.orderbook || (payload as any)?.data || payload;
  const yesBids = (data as any)?.yes || (data as any)?.yes_bids || (data as any)?.bids || [];
  const noBids = (data as any)?.no || (data as any)?.no_bids || (data as any)?.asks || [];
  const bestYes = Array.isArray(yesBids) ? yesBids[0] : undefined;
  const bestNo = Array.isArray(noBids) ? noBids[0] : undefined;
  void relayTradingEvent({
    source: "dflow-stream",
    title: `DFlow orderbook: ${ticker}`,
    severity: stale ? "warn" : "info",
    description: "Top-of-book update received.",
    fields: [
      field("ticker", ticker),
      field("best yes", bestYes?.price || bestYes?.yes_price_dollars || bestYes?.[0] || "n/a"),
      field("best no", bestNo?.price || bestNo?.no_price_dollars || bestNo?.[0] || "n/a"),
      field("stale", stale),
    ],
    raw: { bestYes, bestNo },
    dedupeKey: `dflow:orderbook:${ticker}:${bestYes?.price || bestYes?.[0] || "na"}:${bestNo?.price || bestNo?.[0] || "na"}`,
    minIntervalMs: 60_000,
  });
}
