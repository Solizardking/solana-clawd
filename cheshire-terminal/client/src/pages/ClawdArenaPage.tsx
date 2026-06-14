import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Activity, Flame, TrendingUp, TrendingDown, Zap, Wifi, WifiOff, Lock, Play, Pause, RefreshCw, Settings, Copy, ExternalLink, Wallet, Bot, Terminal, Plus, ChevronDown, ChevronUp, Box as BoxIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useClawdStream } from "@/hooks/useClawdStream";
import { useClawdMirror } from "@/hooks/useClawdMirror";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(3)}`;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const AGENT_COLORS: Record<string, { border: string; text: string; bg: string; badge: string }> = {
  deepseek:   { border: "border-blue-500/30",   text: "text-blue-300",   bg: "bg-blue-500/5",   badge: "border-blue-500/50 text-blue-300" },
  xai:        { border: "border-orange-500/30", text: "text-orange-300", bg: "bg-orange-500/5", badge: "border-orange-500/50 text-orange-300" },
  minimax:    { border: "border-purple-500/30", text: "text-purple-300", bg: "bg-purple-500/5", badge: "border-purple-500/50 text-purple-300" },
  openrouter: { border: "border-emerald-500/30", text: "text-emerald-300", bg: "bg-emerald-500/5", badge: "border-emerald-500/50 text-emerald-300" },
};
function agentColor(id: string) {
  return AGENT_COLORS[id] ?? AGENT_COLORS.xai;
}

function Sparkline({ values, positive }: { values: number[]; positive?: boolean }) {
  if (values.length < 2) return <div className="h-6 w-24 opacity-30" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 96;
  const h = 24;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = positive ? "#10b981" : "#f97316";
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function useAdminKey() {
  const [key, setKey] = useState<string>(() => localStorage.getItem("clawd_admin_key") ?? "");
  const save = (k: string) => {
    localStorage.setItem("clawd_admin_key", k);
    setKey(k);
  };
  return { key, save };
}

async function adminCall(
  path: string,
  opts: { adminKey?: string; body?: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.adminKey) headers["x-clawd-admin"] = opts.adminKey;
    const r = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, error: j?.error ?? `${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "request failed" };
  }
}

function useAdminWhoami() {
  const [info, setInfo] = useState<{ sessionWallet: string | null; isAdmin: boolean; keyConfigured: boolean; adminWalletsCount: number } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const r = await fetch("/api/clawd/admin/whoami", { credentials: "include" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setInfo(j);
      } catch {}
    };
    refresh();
    const t = window.setInterval(refresh, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return info;
}

type MirrorFeedItem = {
  id: number;
  ts: number;
  wallet: string;
  symbol: string;
  side: string;
  notionalUsd: number | null;
  amountOut: number | null;
  txSignature: string;
  status: string;
};

type AgentId = "deepseek" | "xai" | "minimax" | "openrouter";

type DuelAgent = {
  id: AgentId;
  name: string;
  model: string;
  apiKeyName: string;
  apiKeyConfigured: boolean;
  wallet: string;
  cashUsd: number;
  baseTokens: number;
  pnlUsd: number;
  equityUsd: number;
  lastThought: string;
  lastAction: "buy" | "sell" | "hold";
  status: "ready" | "thinking" | "trading" | "error";
  strategy: string;
  ooda: {
    tick: number;
    positions: number;
    cashLamports: number;
    totalPnlLamports: number;
    consecutiveLosses: number;
  };
  tools: {
    birdeye: boolean;
    dflow: boolean;
    helius: boolean;
    jupiter: boolean;
    walletKey: boolean;
  };
};

type ArenaGossip = {
  ts: number;
  agentId: AgentId;
  agentName: string;
  text: string;
};

type ArenaPair = {
  symbol: string;
  name: string;
  baseMint: string;
  quoteSymbol: string;
  startPrice: number;
  strategyNotes: string[];
};

type ArenaStrategy = {
  id: string;
  label: string;
  description: string;
};

type DuelTrade = {
  id: string;
  ts: number;
  agentId: AgentId;
  agentName: string;
  side: "buy" | "sell";
  symbol: string;
  price: number;
  size: number;
  notionalUsd: number;
  wallet: string;
  rationale: string;
  txSignature?: string;
  onchain?: boolean;
};

type DuelState = {
  running: boolean;
  round: number;
  symbol: string;
  pair?: ArenaPair;
  pairs?: ArenaPair[];
  strategies?: Record<string, ArenaStrategy>;
  price: number;
  routing?: {
    helius: {
      configured: boolean;
      methods: string[];
    };
    dflow: {
      configured: boolean;
      quoteApi: string;
      priorityFees: unknown | null;
      priorityFeeSource: "dflow" | "unavailable";
      error: string | null;
      updatedAt: string;
    };
  };
  history: number[];
  agents: DuelAgent[];
  trades: DuelTrade[];
  gossip: ArenaGossip[];
  logs: Array<{ ts: number; level: "info" | "warn" | "error"; msg: string }>;
  live?: boolean;
};

type ArenaScoreboardRow = {
  agentId: AgentId;
  name: string;
  model: string;
  strategy: string;
  wallet: string;
  walletShort: string;
  rank: number;
  score: number;
  arena: {
    equityUsd: number;
    cashUsd: number;
    baseTokens: number;
    pnlUsd: number;
    lastAction: "buy" | "sell" | "hold";
    lastThought: string;
  };
  walletStats: {
    netWorth: null | {
      totalValueUsd: number;
      currency: string;
      itemCount: number;
      topTokens: Array<{ mint: string; symbol: string; name: string; amount: number; priceUsd: number; valueUsd: number; logoUri: string | null }>;
    };
    netWorthChart: Array<{ time: number; valueUsd: number; changeUsd: number; changePercent: number }>;
    pnl: null | {
      totalUsd: number;
      realizedUsd: number;
      unrealizedUsd: number;
      realizedPct: number;
      winRate: number;
      totalBuy: number;
      totalSell: number;
    };
    das: null | {
      total: number;
      nativeBalanceSol: number;
      grandTotalUsd: number;
      topAssets: Array<{ id: string; name: string; symbol: string; balance: number; decimals: number; priceUsd: number; valueUsd: number; image: string | null }>;
    };
    solBalance: number;
  };
  ooda: {
    tick: number;
    positions: number;
    totalPnlLamports: number;
    consecutiveLosses: number;
  };
  sources: {
    birdeyeNetWorth: boolean;
    birdeyeNetWorthChart: boolean;
    birdeyePnl: boolean;
    heliusDas: boolean;
    birdeyeError: string | null;
    chartError: string | null;
    pnlError: string | null;
    dasError: string | null;
  };
};

type ArenaScoreboard = {
  generatedAt: string;
  round: number;
  symbol: string;
  pair?: ArenaPair;
  pairs?: ArenaPair[];
  strategies?: Record<string, ArenaStrategy>;
  price: number;
  rows: ArenaScoreboardRow[];
  sources: {
    birdeyeConfigured: boolean;
    heliusConfigured: boolean;
    heliusMethod: string;
    birdeyeMethods: string[];
  };
};

function useMirrorFeed() {
  const [items, setItems] = useState<MirrorFeedItem[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const r = await fetch("/api/clawd/mirror/feed");
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setItems(j.mirrors ?? []);
      } catch {}
    };
    refresh();
    const t = window.setInterval(refresh, 10_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return items;
}

function useArenaDuel() {
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/clawd/duel/state");
    if (!r.ok) return;
    setDuel(await r.json());
  };

  const post = async (action: "start" | "pause" | "reset" | "tick") => {
    setBusy(action);
    try {
      const r = await fetch(`/api/clawd/duel/${action}`, { method: "POST", credentials: "include" });
      if (r.ok) setDuel(await r.json());
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/clawd/duel/state");
        if (r.ok && alive) setDuel(await r.json());
      } catch {}
    };
    load();
    const t = window.setInterval(load, 8_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!duel?.running || busy) return;
    const t = window.setInterval(() => {
      post("tick").catch(() => {});
    }, 6_000);
    return () => window.clearInterval(t);
  }, [duel?.running, busy]);

  return { duel, busy, refresh, post };
}

function useArenaScoreboard(round?: number) {
  const [scoreboard, setScoreboard] = useState<ArenaScoreboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch("/api/clawd/duel/scoreboard");
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `${r.status}`);
      setScoreboard(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "scoreboard failed");
    }
  };

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [round]);

  return { scoreboard, error, refresh };
}

function fmtSol(n: number): string {
  if (n >= 1) return `${n.toFixed(4)} SOL`;
  return `${n.toFixed(6)} SOL`;
}

function SourcePip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="outline" className={ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}>
      {label}
    </Badge>
  );
}

function ArenaScoreboardPanel({ round }: { round?: number }) {
  const { scoreboard, error, refresh } = useArenaScoreboard(round);
  const rows = scoreboard?.rows ?? [];

  return (
    <Card className="bg-black/60 border-orange-500/20 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-black tracking-wider text-orange-400 flex items-center gap-2">
          <Activity className="w-3 h-3" /> ARENA SCOREBOARD
        </h2>
        <div className="flex items-center gap-2 text-[10px]">
          {scoreboard && (
            <>
              <SourcePip ok={scoreboard.sources.birdeyeConfigured} label="Birdeye" />
              <SourcePip ok={scoreboard.sources.heliusConfigured} label="Helius DAS" />
              <Badge variant="outline" className="border-orange-500/40 text-orange-300">Round {scoreboard.round}</Badge>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            className="h-7 px-2 text-[10px] border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {error && <div className="mb-3 text-[10px] text-red-300">Scoreboard unavailable: {error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.agentId} className="border border-orange-500/20 rounded bg-black/35 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-orange-100">#{row.rank}</span>
                  <span className="text-sm font-black text-orange-100 truncate">{row.name}</span>
                </div>
                <div className="text-[10px] text-orange-300/50 truncate">{row.model} · {row.strategy}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-orange-300/50 uppercase">Score</div>
                <div className="text-xl font-black text-emerald-300">{row.score.toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-3 rounded border border-orange-500/15 bg-black/30 px-2 py-2">
              <div className="text-[9px] text-orange-300/40 uppercase mb-1">Mainnet Wallet</div>
              <div className="text-[11px] text-orange-100 break-all">{row.wallet}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
              <div>
                <div className="text-orange-300/40">Net Worth</div>
                <div className="text-orange-100 font-bold">{fmtUsd(row.walletStats.netWorth?.totalValueUsd ?? 0)}</div>
              </div>
              <div>
                <div className="text-orange-300/40">SOL</div>
                <div className="text-orange-100 font-bold">{fmtSol(row.walletStats.solBalance)}</div>
              </div>
              <div>
                <div className="text-orange-300/40">Wallet P&L</div>
                <div className={(row.walletStats.pnl?.totalUsd ?? 0) >= 0 ? "text-emerald-300 font-bold" : "text-red-300 font-bold"}>
                  {fmtUsd(row.walletStats.pnl?.totalUsd ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-orange-300/40">Arena Equity</div>
                <div className="text-orange-100 font-bold">{fmtUsd(row.arena.equityUsd)}</div>
              </div>
            </div>

            <div className="mt-3 rounded border border-orange-500/15 bg-black/30 px-2 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[9px] text-orange-300/40 uppercase">Birdeye Net Worth Chart</div>
                <SourcePip ok={row.sources.birdeyeNetWorthChart} label="chart" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Sparkline
                  values={(row.walletStats.netWorthChart ?? []).map((point) => point.valueUsd)}
                  positive={((row.walletStats.netWorthChart ?? []).at(-1)?.valueUsd ?? 0) >= ((row.walletStats.netWorthChart ?? [])[0]?.valueUsd ?? 0)}
                />
                <div className="text-right text-[10px]">
                  <div className="text-orange-300/40">30d points</div>
                  <div className="text-orange-100 font-bold">{row.walletStats.netWorthChart?.length ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              <SourcePip ok={row.sources.birdeyeNetWorth} label="net worth" />
              <SourcePip ok={row.sources.birdeyeNetWorthChart} label="chart" />
              <SourcePip ok={row.sources.birdeyePnl} label="PnL" />
              <SourcePip ok={row.sources.heliusDas} label="DAS assets" />
              <Badge variant="outline" className="border-orange-500/30 text-orange-300">
                {row.walletStats.das?.total ?? 0} assets
              </Badge>
            </div>

            <div className="mt-3">
              <div className="text-[10px] font-black tracking-wider text-orange-400 mb-2">TOP HOLDINGS</div>
              <div className="space-y-1">
                {(row.walletStats.netWorth?.topTokens.length ? row.walletStats.netWorth.topTokens : []).slice(0, 4).map((token) => (
                  <div key={`${row.agentId}-${token.mint}`} className="flex items-center gap-2 text-[10px] border-b border-orange-500/10 pb-1 last:border-0">
                    <span className="font-bold text-orange-100 w-14 truncate">{token.symbol}</span>
                    <span className="text-orange-300/60 truncate">{token.amount.toFixed(4)}</span>
                    <span className="ml-auto text-emerald-300">{fmtUsd(token.valueUsd)}</span>
                  </div>
                ))}
                {!row.walletStats.netWorth?.topTokens.length && (
                  <div className="text-[10px] text-orange-300/40 italic">No priced token holdings yet.</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ArenaDuelPanel() {
  const { duel, busy, refresh, post } = useArenaDuel();
  const agents = duel?.agents ?? [];
  const lead = agents.slice().sort((a, b) => b.equityUsd - a.equityUsd)[0];
  const pair = duel?.pair;
  const pairs = duel?.pairs ?? [];

  const selectPair = async (symbol: string) => {
    const r = await fetch("/api/clawd/duel/pair", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    if (r.ok) await refresh();
  };

  return (
    <Card className="bg-black/60 border-orange-500/20 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-black tracking-wider text-orange-400 flex items-center gap-2">
          <Bot className="w-3 h-3" /> MODEL DUEL
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={duel?.running ? "border-emerald-500/50 text-emerald-300" : "border-zinc-500/50 text-zinc-400"}>
            {duel?.running ? "RUNNING" : "PAUSED"}
          </Badge>
          <Badge
            variant="outline"
            className={duel?.routing?.helius.configured ? "border-emerald-500/50 text-emerald-300" : "border-yellow-500/50 text-yellow-300"}
          >
            Helius {duel?.routing?.helius.configured ? "ON" : "OFF"}
          </Badge>
          <Badge
            variant="outline"
            className={duel?.routing?.dflow.configured ? "border-emerald-500/50 text-emerald-300" : "border-yellow-500/50 text-yellow-300"}
            title={duel?.routing?.dflow.error ?? `Priority source: ${duel?.routing?.dflow.priorityFeeSource ?? "unavailable"}`}
          >
            DFlow {duel?.routing?.dflow.priorityFeeSource === "dflow" ? "FEES" : duel?.routing?.dflow.configured ? "ON" : "OFF"}
          </Badge>
          <Button
            size="sm"
            disabled={busy === "start" || duel?.running}
            onClick={() => post("start")}
            className="h-7 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="w-3 h-3 mr-1" /> Start
          </Button>
          <Button
            size="sm"
            disabled={busy === "pause" || !duel?.running}
            onClick={() => post("pause")}
            variant="outline"
            className="h-7 px-2 text-[10px] border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10"
          >
            <Pause className="w-3 h-3 mr-1" /> Pause
          </Button>
          <Button
            size="sm"
            disabled={!!busy}
            onClick={() => post("tick")}
            variant="outline"
            className="h-7 px-2 text-[10px] border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${busy === "tick" ? "animate-spin" : ""}`} /> Round
          </Button>
        </div>
      </div>

      {pairs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-orange-300/50 uppercase">Pair</span>
          {pairs.map((item) => (
            <Button
              key={item.symbol}
              size="sm"
              variant="outline"
              onClick={() => selectPair(item.symbol)}
              disabled={item.symbol === duel?.symbol}
              className={
                item.symbol === duel?.symbol
                  ? "h-7 px-2 text-[10px] border-emerald-500/50 text-emerald-300 bg-emerald-500/10"
                  : "h-7 px-2 text-[10px] border-orange-500/30 text-orange-300 hover:bg-orange-500/10"
              }
            >
              {item.symbol}
            </Button>
          ))}
          {pair && <span className="text-orange-300/45 truncate">{pair.name} · {pair.strategyNotes.slice(0, 2).join(" / ")}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-[10px]">
        <div className="border border-orange-500/20 rounded px-2 py-1">
          <div className="text-orange-300/50 uppercase">Round</div>
          <div className="text-orange-200 font-bold">{duel?.round ?? 0}</div>
        </div>
        <div className="border border-orange-500/20 rounded px-2 py-1">
          <div className="text-orange-300/50 uppercase">Mark</div>
          <div className="text-orange-200 font-bold">{fmtPrice(duel?.price ?? 0)}</div>
        </div>
        <div className="border border-orange-500/20 rounded px-2 py-1">
          <div className="text-orange-300/50 uppercase">Leader</div>
          <div className="text-emerald-300 font-bold truncate">{lead?.name ?? "none"}</div>
        </div>
        <div className="border border-orange-500/20 rounded px-2 py-1">
          <div className="text-orange-300/50 uppercase">Mode</div>
          <div className="text-orange-200 font-bold truncate">{pair?.quoteSymbol ? `${pair.quoteSymbol} watched` : "Live watched"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {agents.map((agent) => {
          const c = agentColor(agent.id);
          return (
            <div key={agent.id} className={`border ${c.border} rounded ${c.bg} p-3 min-h-[220px] flex flex-col`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-sm font-black ${c.text} truncate`}>{agent.name}</div>
                  <div className="text-[10px] text-orange-300/50 truncate">{agent.model} · {agent.apiKeyName}</div>
                  <div className="text-[10px] text-orange-300/40 truncate">{agent.strategy}</div>
                </div>
                <Badge variant="outline" className={agent.apiKeyConfigured ? "border-emerald-500/50 text-emerald-300" : "border-yellow-500/50 text-yellow-300"}>
                  {agent.apiKeyConfigured ? "KEY READY" : "FALLBACK"}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <div className="text-orange-300/40">Wallet</div>
                  <div className="text-orange-200 truncate">{agent.wallet}</div>
                </div>
                <div>
                  <div className="text-orange-300/40">Equity</div>
                  <div className={agent.pnlUsd >= 0 ? "text-emerald-300 font-bold" : "text-red-300 font-bold"}>{fmtUsd(agent.equityUsd)}</div>
                </div>
                <div>
                  <div className="text-orange-300/40">P&L</div>
                  <div className={agent.pnlUsd >= 0 ? "text-emerald-300 font-bold" : "text-red-300 font-bold"}>{fmtUsd(agent.pnlUsd)}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px]">
                <Badge variant="outline" className={`${c.badge}`}>{agent.status}</Badge>
                <Badge
                  variant="outline"
                  className={agent.lastAction === "buy" ? "border-emerald-500/50 text-emerald-300" : agent.lastAction === "sell" ? "border-red-500/50 text-red-300" : "border-zinc-500/50 text-zinc-400"}
                >
                  {agent.lastAction.toUpperCase()}
                </Badge>
                <span className="text-orange-300/50">{agent.baseTokens.toFixed(2)} {duel?.symbol ?? "CLAWD"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[9px]">
                {[
                  ["Birdeye", agent.tools.birdeye],
                  ["DFlow", agent.tools.dflow],
                  ["Helius", agent.tools.helius],
                  ["Jupiter", agent.tools.jupiter],
                  ["Wallet", agent.tools.walletKey],
                  ["Onchain", duel?.live ?? false],
                ].map(([label, ready]) => (
                  <Badge
                    key={String(label)}
                    variant="outline"
                    className={ready ? "border-emerald-500/40 text-emerald-300" : "border-zinc-500/40 text-zinc-400"}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <div className="text-orange-300/40">OODA Tick</div>
                  <div className="text-orange-200">{agent.ooda.tick}</div>
                </div>
                <div>
                  <div className="text-orange-300/40">Losses</div>
                  <div className={agent.ooda.consecutiveLosses > 2 ? "text-red-300" : "text-orange-200"}>{agent.ooda.consecutiveLosses}</div>
                </div>
                <div>
                  <div className="text-orange-300/40">OODA PnL</div>
                  <div className={agent.ooda.totalPnlLamports >= 0 ? "text-emerald-300" : "text-red-300"}>
                    {agent.ooda.totalPnlLamports}
                  </div>
                </div>
              </div>
              <div className={`mt-3 flex-1 text-xs text-orange-100/80 whitespace-pre-wrap border-l-2 ${c.border} pl-3`}>
                {agent.lastThought}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-black tracking-wider text-orange-400 mb-2">DUEL TAPE</div>
          <ScrollArea className="h-44">
            <div className="space-y-2 pr-3">
              {(duel?.trades ?? []).length === 0 && <div className="text-xs text-orange-300/40 italic">No duel trades yet.</div>}
              {(duel?.trades ?? []).map((trade) => {
                const tc = agentColor(trade.agentId);
                return (
                  <div key={trade.id} className="text-[10px] border-b border-orange-500/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${tc.text}`}>{trade.agentName}</span>
                      <span className={trade.side === "buy" ? "text-emerald-300" : "text-red-300"}>{trade.side.toUpperCase()}</span>
                      <span className="text-orange-300/60">{fmtUsd(trade.notionalUsd)}</span>
                      {trade.onchain && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[8px] px-1">⛓ ON</Badge>}
                      <span className="ml-auto text-orange-300/40">{timeAgo(trade.ts)} ago</span>
                    </div>
                    <div className="text-orange-300/50">{trade.size.toFixed(2)} {trade.symbol} @ {fmtPrice(trade.price)}</div>
                    {trade.txSignature && (
                      <a
                        href={`https://solscan.io/tx/${trade.txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400/70 hover:text-blue-300 truncate block"
                      >
                        {trade.txSignature.slice(0, 16)}… <ExternalLink className="inline w-2 h-2" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        <div>
          <div className="text-[10px] font-black tracking-wider text-purple-400 mb-2">GOSSIP WIRE</div>
          <ScrollArea className="h-44">
            <div className="space-y-2 pr-3">
              {(duel?.gossip ?? []).length === 0 && <div className="text-xs text-orange-300/40 italic">No gossip yet — agents will generate after first trade.</div>}
              {(duel?.gossip ?? []).map((g) => {
                const gc = agentColor(g.agentId);
                return (
                  <div key={`${g.ts}-${g.agentId}`} className={`text-[10px] border-l-2 ${gc.border} pl-2 pb-1`}>
                    <span className={`font-bold ${gc.text}`}>{g.agentName}</span>
                    <span className="text-orange-300/40 ml-1">{timeAgo(g.ts)}:</span>
                    <div className="text-orange-100/70 italic mt-0.5">&ldquo;{g.text}&rdquo;</div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        <div>
          <div className="text-[10px] font-black tracking-wider text-orange-400 mb-2">PRICE TRACE</div>
          <div className="h-44 border border-orange-500/20 rounded bg-black/30 flex items-center justify-center">
            <Sparkline values={duel?.history ?? []} positive={(duel?.history.at(-1) ?? 0) >= (duel?.history[0] ?? 0)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Agent Boxes Panel ─────────────────────────────────────────────────────────

interface BoxInfo {
  id: string;
  name?: string;
  status: string;
  size: string;
  runtime: string;
  pinned?: boolean;
}

const BOX_STATUS_COLOR: Record<string, string> = {
  running: "text-emerald-400 border-emerald-500/40",
  paused: "text-yellow-400 border-yellow-500/40",
  created: "text-blue-400 border-blue-500/40",
  deleted: "text-red-400 border-red-500/40",
  unknown: "text-zinc-400 border-zinc-500/40",
};

function AgentBoxesPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRuntime, setNewRuntime] = useState("node");
  const [newModel, setNewModel] = useState("anthropic/claude-sonnet-4-6");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState<string | null>(null);
  const streamRef = useRef("");

  const boxesQ = useQuery<{ boxes: BoxInfo[]; openclawdBoxId: string }>({
    queryKey: ["/api/boxes"],
    queryFn: () => apiRequest<{ boxes: BoxInfo[]; openclawdBoxId: string }>("/api/boxes"),
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: (body: object) =>
      apiRequest<{ box?: { id: string }; error?: string }>("/api/boxes/create", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (d: { box?: { id: string } }) => {
      qc.invalidateQueries({ queryKey: ["/api/boxes"] });
      setShowCreate(false);
      setNewName("");
      if (d.box?.id) setExpanded(d.box.id);
    },
  });

  const pauseMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/boxes/${id}/pause`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/boxes"] }),
  });

  const resumeMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/boxes/${id}/resume`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/boxes"] }),
  });

  function streamRun(id: string, p: string, model: string) {
    if (!p.trim()) return;
    setStreaming(id);
    streamRef.current = "";
    setOutput((prev) => ({ ...prev, [id]: "" }));
    fetch(`/api/boxes/${id}/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: p, agentHarness: "claude-code", agentModel: model }),
    }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text") {
              streamRef.current += ev.text;
              setOutput((prev) => ({ ...prev, [id]: streamRef.current }));
            } else if (ev.type === "done" || ev.type === "error") {
              setStreaming(null);
            }
          } catch {}
        }
      }
      setStreaming(null);
    }).catch(() => setStreaming(null));
  }

  const boxes: BoxInfo[] = boxesQ.data?.boxes ?? [];
  const openclawdId = boxesQ.data?.openclawdBoxId ?? "";

  return (
    <Card className="bg-black/60 border-orange-500/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-black tracking-wider text-orange-400 flex items-center gap-2">
          <BoxIcon className="w-3 h-3" /> AGENT BOXES
          {boxesQ.isFetching && <RefreshCw className="w-3 h-3 animate-spin opacity-50" />}
        </h2>
        <div className="flex items-center gap-2">
          <a href="/boxes" className="text-[10px] text-orange-300/50 hover:text-orange-300 underline">manage →</a>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] border-orange-500/30 text-orange-300 hover:bg-orange-500/10"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus className="w-3 h-3 mr-1" /> New Box
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-3 p-3 border border-orange-500/20 rounded space-y-2 bg-black/40">
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-xs bg-black/60 border-orange-500/30 text-orange-100"
            />
            <select
              value={newRuntime}
              onChange={(e) => setNewRuntime(e.target.value)}
              className="h-7 text-xs bg-black/60 border border-orange-500/30 text-orange-100 rounded px-2"
            >
              {["node", "python", "golang", "ruby", "rust"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="h-7 text-xs bg-black/60 border border-orange-500/30 text-orange-100 rounded px-2"
            >
              <option value="anthropic/claude-sonnet-4-6">Sonnet 4.6</option>
              <option value="anthropic/claude-opus-4-6">Opus 4.6</option>
              <option value="anthropic/claude-haiku-4-5">Haiku 4.5</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate({ name: newName || undefined, runtime: newRuntime, agentModel: newModel, agentHarness: "claude-code" })}
              className="h-7 text-[10px] bg-orange-600 hover:bg-orange-700 text-white"
            >
              {createMut.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
              Spawn
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-orange-300/60" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
          {(createMut.data as { error?: string })?.error && (
            <div className="text-[10px] text-red-300">⚠ {(createMut.data as { error?: string }).error}</div>
          )}
        </div>
      )}

      {boxes.length === 0 && !boxesQ.isFetching && (
        <div className="text-xs text-orange-300/40 italic">No boxes yet — spawn one above.</div>
      )}

      <div className="space-y-2">
        {boxes.map((box) => {
          const isOpen = expanded === box.id;
          const statusCls = BOX_STATUS_COLOR[box.status] ?? BOX_STATUS_COLOR.unknown;
          const isStreaming = streaming === box.id;
          const boxOut = output[box.id] ?? "";

          return (
            <div key={box.id} className="border border-orange-500/15 rounded bg-black/30">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/5"
                onClick={() => setExpanded(isOpen ? null : box.id)}
              >
                <Bot className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="text-xs font-mono text-orange-200 flex-1 truncate">
                  {box.name ?? box.id.slice(0, 20)}
                  {box.id === openclawdId && (
                    <span className="ml-1 text-[9px] text-orange-400/60">[openclawd]</span>
                  )}
                </span>
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${statusCls}`}>
                  {box.status}
                </Badge>
                <span className="text-[10px] text-orange-300/40">{box.runtime}</span>
                {isOpen ? <ChevronUp className="w-3 h-3 text-orange-300/40" /> : <ChevronDown className="w-3 h-3 text-orange-300/40" />}
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-orange-500/10">
                  <div className="flex items-center gap-2 mt-2">
                    {box.status === "running"
                      ? <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-yellow-300" onClick={() => pauseMut.mutate(box.id)}><Pause className="w-3 h-3 mr-1" />Pause</Button>
                      : <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-emerald-300" onClick={() => resumeMut.mutate(box.id)}><Play className="w-3 h-3 mr-1" />Resume</Button>}
                    <a href="/boxes" className="text-[10px] text-orange-300/50 hover:text-orange-300 flex items-center gap-1">
                      <Terminal className="w-3 h-3" /> Full console
                    </a>
                  </div>
                  <Textarea
                    placeholder="Prompt the agent…"
                    value={isStreaming ? undefined : prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="text-xs h-16 bg-black/60 border-orange-500/30 text-orange-100 resize-none"
                  />
                  <Button
                    size="sm"
                    disabled={isStreaming || !prompt.trim()}
                    onClick={() => streamRun(box.id, prompt, newModel)}
                    className="h-7 text-[10px] bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    {isStreaming ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Thinking…</> : <><Zap className="w-3 h-3 mr-1" />Run</>}
                  </Button>
                  {boxOut && (
                    <ScrollArea className="max-h-40">
                      <pre className="text-[10px] text-orange-100/80 whitespace-pre-wrap font-mono bg-black/40 rounded p-2">
                        {boxOut}
                        {isStreaming && <span className="animate-pulse">▌</span>}
                      </pre>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function ClawdArenaPage() {
  const { connected, state, live, positions, fills, decisions, logs, snapshots, streamingReasoning } = useClawdStream();
  const { key: adminKey, save: saveAdminKey } = useAdminKey();
  const whoami = useAdminWhoami();
  const mirrorFeed = useMirrorFeed();
  const { mirror, busy: mirrorBusy, error: mirrorError, isAuthenticated, holdings: mirrorHoldings, stats: mirrorStats } = useClawdMirror();
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const isWalletAdmin = !!whoami?.isAdmin;
  const modeLabel =
    state?.mode === "solana" ? "Live trading on Solana mainnet" :
    state?.mode === "hyperliquid" ? "Live trading on Hyperliquid" :
    "Live Solana mode pending";

  const runControl = async (path: string) => {
    setAdminBusy(true);
    setAdminError(null);
    const r = await adminCall(path, isWalletAdmin ? {} : { adminKey });
    setAdminBusy(false);
    if (!r.ok) {
      setAdminError(r.error ?? "failed");
      if (!isWalletAdmin) setShowAdmin(true);
    }
  };

  const setMode = async (mode: "solana") => {
    setAdminBusy(true);
    setAdminError(null);
    const r = await adminCall("/api/clawd/control/mode", isWalletAdmin ? { body: { mode } } : { adminKey, body: { mode } });
    setAdminBusy(false);
    if (!r.ok) {
      setAdminError(r.error ?? "failed");
      if (!isWalletAdmin) setShowAdmin(true);
    }
  };

  const handleMirror = async (fillId: number) => {
    try {
      await mirror(fillId);
    } catch {}
  };

  const mirrorBook = useMemo(() => {
    let unrealized = 0;
    let currentValue = 0;
    let costBasis = 0;
    const enriched = mirrorHoldings.map((h) => {
      const snap = snapshots.find((s) => s.symbol === h.symbol);
      const currentPrice = snap?.price ?? h.avgBuyPrice;
      const value = currentPrice * h.net;
      const u = value - h.costBasisRemainingUsd;
      unrealized += u;
      currentValue += value;
      costBasis += h.costBasisRemainingUsd;
      return { ...h, currentPrice, currentValueUsd: value, unrealizedPnlUsd: u };
    });
    return {
      holdings: enriched,
      unrealizedPnlUsd: unrealized,
      currentValueUsd: currentValue,
      costBasisUsd: costBasis,
      totalPnlUsd: unrealized + mirrorStats.realizedPnlUsd,
    };
  }, [mirrorHoldings, snapshots, mirrorStats]);

  const totalPnl = useMemo(() => {
    const realized = state?.totalPnlUsd ?? 0;
    const unrealized = positions.reduce((s, p) => s + (Number(p.pnlUsd) || 0), 0);
    return { realized, unrealized, combined: realized + unrealized };
  }, [state, positions]);

  const equity = (state?.cashUsd ?? 0) + positions.reduce((s, p) => s + p.size * (p.currentPrice ?? p.entryPrice), 0);

  return (
    <div className="min-h-screen bg-black text-orange-100 font-mono">
      <header className="border-b border-orange-500/30 bg-black relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-15 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/Agent_Trading_Arena.png')" }}
        />
        <div className="relative px-6 py-4 flex items-center justify-between flex-wrap gap-4 bg-gradient-to-r from-black/80 via-transparent to-black/80">
          <div className="flex items-center gap-3">
            <div className="text-3xl">⚔️</div>
            <div>
              <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-blue-400 via-orange-300 to-purple-400 bg-clip-text text-transparent">
                AGENT TRADING ARENA
              </h1>
              <p className="text-xs text-orange-300/60">
                DeepSeek · Grok · MiniMax-M3 · {modeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="outline" className={connected ? "border-emerald-500/50 text-emerald-300" : "border-red-500/50 text-red-300"}>
              {connected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
              {connected ? "LIVE" : "DISCONNECTED"}
            </Badge>
            <Badge variant="outline" className="border-orange-500/50 text-orange-300">
              <Lock className="w-3 h-3 mr-1" /> {state?.mode?.toUpperCase() ?? "SOLANA"}
            </Badge>
            <Badge
              variant="outline"
              className={(live?.ready ?? (live?.live && live?.configured)) ? "border-emerald-500/50 text-emerald-300" : "border-yellow-500/50 text-yellow-300"}
            >
              <Wallet className="w-3 h-3 mr-1" />
              {(live?.ready ?? (live?.live && live?.configured)) ? "LIVE READY" : "LIVE NOT READY"}
            </Badge>
            <Badge variant="outline" className={state?.status === "running" ? "border-emerald-500/50 text-emerald-300" : "border-zinc-500/50 text-zinc-400"}>
              <Activity className="w-3 h-3 mr-1" /> {state?.status?.toUpperCase() ?? "IDLE"}
            </Badge>
            {(isWalletAdmin || whoami?.keyConfigured) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-orange-500/30 text-orange-300 hover:bg-orange-500/10"
                onClick={() => setShowAdmin((v) => !v)}
              >
                <Settings className="w-3 h-3 mr-1" /> {isWalletAdmin ? "Operator" : "Admin"}
              </Button>
            )}
          </div>
        </div>

        {showAdmin && (
          <div className="mt-3 p-3 border border-orange-500/30 bg-black/60 rounded text-xs space-y-2">
            {isWalletAdmin ? (
              <div className="text-emerald-300">
                ✓ Authenticated as operator wallet{" "}
                <span className="font-mono">
                  {whoami?.sessionWallet?.slice(0, 6)}…{whoami?.sessionWallet?.slice(-4)}
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-orange-300/60 shrink-0">Admin key:</span>
                  <input
                    type="password"
                    value={adminKey}
                    onChange={(e) => saveAdminKey(e.target.value)}
                    placeholder="x-clawd-admin"
                    className="flex-1 bg-black/60 border border-orange-500/30 px-2 py-1 rounded text-orange-100 font-mono text-xs"
                  />
                  <span className="text-orange-300/40 text-[10px]">stored in localStorage</span>
                </div>
                {whoami && whoami.adminWalletsCount > 0 && (
                  <div className="text-[10px] text-orange-300/50">
                    Tip: sign in with one of the {whoami.adminWalletsCount} allowlisted wallet
                    {whoami.adminWalletsCount === 1 ? "" : "s"} to skip the key.
                  </div>
                )}
              </>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                disabled={adminBusy || state?.mode === "solana"}
                onClick={() => setMode("solana")}
                className="h-7 bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Zap className="w-3 h-3 mr-1" /> Live Solana
              </Button>
              <Button
                size="sm"
                disabled={adminBusy || state?.status === "running"}
                onClick={() => runControl("/api/clawd/control/start")}
                className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Play className="w-3 h-3 mr-1" /> Start
              </Button>
              <Button
                size="sm"
                disabled={adminBusy || state?.status !== "running"}
                onClick={() => runControl("/api/clawd/control/stop")}
                className="h-7 bg-red-700 hover:bg-red-800 text-white"
              >
                <Pause className="w-3 h-3 mr-1" /> Pause
              </Button>
              <Button
                size="sm"
                disabled={adminBusy}
                onClick={() => runControl("/api/clawd/control/tick")}
                variant="outline"
                className="h-7 border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${adminBusy ? "animate-spin" : ""}`} /> Force tick
              </Button>
              {adminError && <span className="text-red-300 ml-2">⚠ {adminError}</span>}
            </div>
            {live && (
              <div className="space-y-1 text-[10px] text-orange-300/50">
                <div>
                  Live flag: {live.live ? "on" : "off"} · Trader key: {live.configured ? "loaded" : "missing"} · RPC: {live.rpcConfigured ? "ready" : "missing"}
                  {live.pubkey ? ` · ${live.pubkey.slice(0, 6)}…${live.pubkey.slice(-4)}` : ""}
                </div>
                {live.risk && (
                  <div>
                    Risk caps: {live.risk.maxTradesPerHour}/hr · max {(live.risk.maxLamportsPerTrade / 1_000_000_000).toFixed(3)} SOL/trade · reserve {live.risk.minSolBalance} SOL
                  </div>
                )}
                {(live.blockers?.length ?? 0) > 0 && (
                  <div className="text-yellow-300">
                    Blockers: {live.blockers?.join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Stat label="Equity" value={fmtUsd(equity)} accent="emerald" />
          <Stat label="Cash" value={fmtUsd(state?.cashUsd ?? 0)} accent="orange" />
          <Stat
            label="Realized P&L"
            value={fmtUsd(totalPnl.realized)}
            accent={totalPnl.realized >= 0 ? "emerald" : "red"}
          />
          <Stat
            label="Unrealized P&L"
            value={fmtUsd(totalPnl.unrealized)}
            accent={totalPnl.unrealized >= 0 ? "emerald" : "red"}
          />
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 max-w-[1600px] mx-auto">
        <div className="lg:col-span-12">
          <ArenaDuelPanel />
        </div>

        <div className="lg:col-span-12">
          <ArenaScoreboardPanel round={state?.totalFills ?? 0} />
        </div>

        <Card className="lg:col-span-4 bg-black/60 border-orange-500/20 p-4">
          <h2 className="text-xs font-black tracking-wider text-orange-400 mb-3 flex items-center gap-2">
            <TrendingUp className="w-3 h-3" /> WATCHLIST
          </h2>
          <div className="space-y-2">
            {snapshots.length === 0 && (
              <div className="text-xs text-orange-300/40 italic">Awaiting first snapshot…</div>
            )}
            {snapshots.map((s) => (
              <div key={s.mint} className="flex items-center justify-between gap-2 py-2 border-b border-orange-500/10 last:border-0">
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-orange-200">{s.symbol}</span>
                  <span className="text-[10px] text-orange-300/40 truncate">{s.mint.slice(0, 12)}…</span>
                </div>
                <Sparkline values={s.history ?? []} positive={s.priceChange24h >= 0} />
                <div className="text-right shrink-0">
                  <div className="text-orange-200">{fmtPrice(s.price)}</div>
                  <div className={`text-[10px] ${s.priceChange24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {s.priceChange24h >= 0 ? "+" : ""}
                    {s.priceChange24h.toFixed(2)}%
                  </div>
                </div>
                <ClawdTokenAction
                  mintAddress={s.mint}
                  symbol={s.symbol}
                  price={s.price}
                />
              </div>
            ))}
          </div>

          <h2 className="text-xs font-black tracking-wider text-orange-400 mt-6 mb-3 flex items-center gap-2">
            <Zap className="w-3 h-3" /> OPEN POSITIONS
          </h2>
          <div className="space-y-2">
            {positions.length === 0 && (
              <div className="text-xs text-orange-300/40 italic">No open positions.</div>
            )}
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-orange-500/10 last:border-0 text-xs">
                <div>
                  <div className="font-bold text-orange-200">{p.symbol}</div>
                  <div className="text-[10px] text-orange-300/40">
                    {p.side.toUpperCase()} · {p.size.toFixed(4)} @ {fmtPrice(p.entryPrice)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-orange-200">{fmtPrice(p.currentPrice ?? p.entryPrice)}</div>
                  <div className={(p.pnlUsd ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}>
                    {fmtUsd(p.pnlUsd ?? 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-5 bg-black/60 border-orange-500/20 p-4 flex flex-col">
          <h2 className="text-xs font-black tracking-wider text-orange-400 mb-3 flex items-center gap-2">
            <Activity className="w-3 h-3" /> CLAWD'S MIND — DECISION LOG
          </h2>

          {streamingReasoning && (
            <div className="mb-3 p-3 border border-emerald-500/40 bg-emerald-500/5 rounded text-xs">
              <div className="text-emerald-300 font-bold mb-1">▸ thinking on {streamingReasoning.symbol}…</div>
              <div className="text-emerald-100 whitespace-pre-wrap">
                {streamingReasoning.text}
                <span className="animate-pulse">▌</span>
              </div>
            </div>
          )}

          <ScrollArea className="flex-1 max-h-[600px]">
            <div className="space-y-3 pr-3">
              {decisions.length === 0 && !streamingReasoning && (
                <div className="text-xs text-orange-300/40 italic">No decisions yet. Awaiting next tick…</div>
              )}
              {decisions.map((d) => (
                <div key={`${d.id ?? d.ts}-${d.symbol}`} className="border-l-2 border-orange-500/30 pl-3 py-1">
                  <div className="flex items-center gap-2 text-[10px] text-orange-300/50">
                    <span>{timeAgo(d.ts)} ago</span>
                    <span>·</span>
                    <span className="text-orange-200 font-bold">{d.symbol}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] py-0 px-1 ${
                        d.signal === "BUY"
                          ? "border-emerald-500/50 text-emerald-300"
                          : d.signal === "SELL"
                          ? "border-red-500/50 text-red-300"
                          : "border-zinc-500/50 text-zinc-400"
                      }`}
                    >
                      {d.signal} · {d.signalScore}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[9px] py-0 px-1 ${
                        d.gateAction === "APPROVE"
                          ? "border-emerald-500/50 text-emerald-300"
                          : d.gateAction === "VETO"
                          ? "border-red-500/50 text-red-300"
                          : "border-yellow-500/50 text-yellow-300"
                      }`}
                    >
                      {d.gateAction}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-orange-300/50 mt-1">
                    {(d.signalReasons ?? []).join(" · ")}
                  </div>
                  {d.gateReasoning && (
                    <div className="text-xs text-orange-100 mt-1 italic">"{d.gateReasoning}"</div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        <Card className="lg:col-span-3 bg-black/60 border-orange-500/20 p-4 flex flex-col">
          <h2 className="text-xs font-black tracking-wider text-orange-400 mb-3 flex items-center gap-2">
            <Flame className="w-3 h-3" /> FILL TICKER
          </h2>
          <ScrollArea className="flex-1 max-h-[300px]">
            <div className="space-y-2 pr-3">
              {fills.length === 0 && <div className="text-xs text-orange-300/40 italic">No fills yet.</div>}
              {fills.map((f) => {
                const ageMs = Date.now() - f.ts;
                const recent = ageMs < 5 * 60 * 1000;
                const holding = mirrorHoldings.find((h) => h.symbol === f.symbol);
                const canBuy = f.side === "buy" && recent && f.id;
                const canSell = f.side === "sell" && recent && f.id && holding && holding.net > 0;
                return (
                  <div key={f.id ?? f.ts} className="text-xs border-b border-orange-500/10 pb-2">
                    <div className="flex items-center gap-2">
                      {f.side === "buy" ? (
                        <TrendingUp className="w-3 h-3 text-emerald-300" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-300" />
                      )}
                      <span className="font-bold text-orange-200">{f.symbol}</span>
                      <span className={f.side === "buy" ? "text-emerald-300" : "text-red-300"}>
                        {f.side.toUpperCase()}
                      </span>
                      <span className="text-orange-300/60 ml-auto">{timeAgo(f.ts)} ago</span>
                    </div>
                    <div className="text-[10px] text-orange-300/60 mt-0.5">
                      {f.size.toFixed(4)} @ {fmtPrice(f.price)} = {fmtUsd(f.notionalUsd)}
                      {f.pnlUsd != null && (
                        <span className={f.pnlUsd >= 0 ? " text-emerald-300" : " text-red-300"}>
                          {" "}
                          · P&L {fmtUsd(f.pnlUsd)}
                        </span>
                      )}
                    </div>
                    {canBuy && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mirrorBusy === f.id}
                        onClick={() => handleMirror(f.id)}
                        className="mt-1 h-6 text-[10px] border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                      >
                        <Copy className="w-2.5 h-2.5 mr-1" />
                        {mirrorBusy === f.id
                          ? "Signing…"
                          : isAuthenticated
                          ? "Mirror $5"
                          : "Sign in & Mirror"}
                      </Button>
                    )}
                    {canSell && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mirrorBusy === f.id}
                        onClick={() => handleMirror(f.id)}
                        className="mt-1 h-6 text-[10px] border-red-500/40 text-red-300 hover:bg-red-500/10"
                      >
                        <Copy className="w-2.5 h-2.5 mr-1" />
                        {mirrorBusy === f.id
                          ? "Signing…"
                          : `Mirror SELL ${holding?.net.toFixed(4)} ${f.symbol}`}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {isAuthenticated && (mirrorBook.holdings.length > 0 || mirrorStats.realizedPnlUsd !== 0) && (
            <>
              <h2 className="text-xs font-black tracking-wider text-orange-400 mt-6 mb-3 flex items-center gap-2">
                <Wallet className="w-3 h-3" /> YOUR MIRROR BOOK
              </h2>
              <div className="grid grid-cols-3 gap-2 mb-2 text-[10px]">
                <div className="border border-orange-500/20 rounded px-2 py-1">
                  <div className="text-orange-300/50 uppercase tracking-wider">Value</div>
                  <div className="text-orange-200 font-bold">{fmtUsd(mirrorBook.currentValueUsd)}</div>
                </div>
                <div className="border border-orange-500/20 rounded px-2 py-1">
                  <div className="text-orange-300/50 uppercase tracking-wider">Unrealized</div>
                  <div className={mirrorBook.unrealizedPnlUsd >= 0 ? "text-emerald-300 font-bold" : "text-red-300 font-bold"}>
                    {fmtUsd(mirrorBook.unrealizedPnlUsd)}
                  </div>
                </div>
                <div className="border border-orange-500/20 rounded px-2 py-1">
                  <div className="text-orange-300/50 uppercase tracking-wider">Realized</div>
                  <div className={mirrorStats.realizedPnlUsd >= 0 ? "text-emerald-300 font-bold" : "text-red-300 font-bold"}>
                    {fmtUsd(mirrorStats.realizedPnlUsd)}
                  </div>
                </div>
              </div>
              <div className="space-y-1 mb-3">
                {mirrorBook.holdings.length === 0 && (
                  <div className="text-[10px] text-orange-300/40 italic">No open mirrors. All P&L realized.</div>
                )}
                {mirrorBook.holdings.map((h) => (
                  <div key={h.mint} className="text-[10px] flex items-center gap-2 py-1 border-b border-orange-500/10 last:border-0">
                    <span className="font-bold text-orange-200 w-12">{h.symbol}</span>
                    <span className="text-orange-300/60">{h.net.toFixed(4)}</span>
                    <span className="text-orange-300/40">@{fmtPrice(h.avgBuyPrice)}</span>
                    <span className="ml-auto text-orange-300/60">{fmtUsd(h.currentValueUsd)}</span>
                    <span className={h.unrealizedPnlUsd >= 0 ? "text-emerald-300 font-bold w-16 text-right" : "text-red-300 font-bold w-16 text-right"}>
                      {fmtUsd(h.unrealizedPnlUsd)}
                    </span>
                    <ClawdTokenAction
                      mintAddress={h.mint}
                      symbol={h.symbol}
                      price={h.avgBuyPrice}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="text-xs font-black tracking-wider text-orange-400 mt-6 mb-3 flex items-center gap-2">
            <Copy className="w-3 h-3" /> VIEWER MIRRORS
          </h2>
          {mirrorError && <div className="text-[10px] text-red-300 mb-2">⚠ {mirrorError}</div>}
          <ScrollArea className="flex-1 max-h-[200px]">
            <div className="space-y-1 pr-3">
              {mirrorFeed.length === 0 && (
                <div className="text-xs text-orange-300/40 italic">No mirrors yet — be the first.</div>
              )}
              {mirrorFeed.map((m) => (
                <div key={m.id} className="text-[10px] flex items-center gap-2 py-1 border-b border-orange-500/10 last:border-0">
                  <span className="font-mono text-purple-300/80">{m.wallet}</span>
                  <span className="text-orange-300/60">{m.side}</span>
                  <span className="text-orange-200 font-bold">{m.symbol}</span>
                  {m.notionalUsd != null && (
                    <span className="text-emerald-300/80">{fmtUsd(m.notionalUsd)}</span>
                  )}
                  <span className="text-orange-300/40 ml-auto">{timeAgo(m.ts)} ago</span>
                  <a
                    href={`https://solscan.io/tx/${m.txSignature}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-300/60 hover:text-orange-300"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              ))}
            </div>
          </ScrollArea>

          <h2 className="text-xs font-black tracking-wider text-orange-400 mt-6 mb-3">SYSTEM LOG</h2>
          <ScrollArea className="flex-1 max-h-[200px]">
            <div className="space-y-1 pr-3 text-[10px]">
              {logs.map((l) => (
                <div
                  key={`${l.ts}-${l.msg}`}
                  className={`${
                    l.level === "warn"
                      ? "text-yellow-300/80"
                      : l.level === "error"
                      ? "text-red-300/80"
                      : "text-orange-300/60"
                  }`}
                >
                  [{new Date(l.ts).toLocaleTimeString()}] {l.msg}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        <div className="lg:col-span-12">
          <AgentBoxesPanel />
        </div>
      </main>

      <footer className="border-t border-orange-500/20 px-6 py-3 text-[10px] text-orange-300/40 text-center">
        Three Laws (immutable): I. Never Harm · II. Earn Your Existence · III. Never Deceive, But Owe Nothing to Strangers ·
        Constitution propagates to all children · Vault sealed · PQC-aware · Formally attested
      </footer>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: "emerald" | "orange" | "red" }) {
  const c = accent === "emerald" ? "text-emerald-300" : accent === "red" ? "text-red-300" : "text-orange-300";
  return (
    <div className="border border-orange-500/20 bg-black/40 rounded px-3 py-2">
      <div className="text-[10px] text-orange-300/50 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-black ${c}`}>{value}</div>
    </div>
  );
}
