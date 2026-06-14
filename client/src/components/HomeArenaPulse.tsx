import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowRight, Bot, CircleDollarSign, Radio, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type ArenaScoreboardRow = {
  agentId: string;
  name: string;
  model: string;
  walletShort: string;
  rank: number;
  score: number;
  arena: {
    equityUsd: number;
    cashUsd: number;
    baseTokens: number;
    pnlUsd: number;
    lastAction: "buy" | "sell" | "hold";
  };
  walletStats: {
    netWorth: null | { totalValueUsd: number };
    solBalance: number;
  };
};

type ArenaScoreboard = {
  generatedAt: string;
  round: number;
  symbol: string;
  price: number;
  rows: ArenaScoreboardRow[];
  sources: {
    birdeyeConfigured: boolean;
    heliusConfigured: boolean;
  };
};

type DuelState = {
  running: boolean;
  round: number;
  symbol: string;
  price: number;
  history: number[];
  live?: boolean;
};

function formatUsd(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPrice(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "$0.0000";
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(3)}`;
}

function formatSol(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n >= 1 ? n.toFixed(3) : n.toFixed(5)} SOL`;
}

function MiniSparkline({ values }: { values: number[] }) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) {
    return <div className="h-10 w-full rounded-md border border-white/5 bg-black/20" />;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const points = clean
    .map((value, index) => {
      const x = (index / (clean.length - 1)) * 180;
      const y = 40 - ((value - min) / span) * 34 - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const positive = clean.at(-1)! >= clean[0]!;

  return (
    <svg viewBox="0 0 180 40" className="h-10 w-full overflow-visible" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#34d399" : "#fb7185"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeArenaPulse() {
  const [scoreboard, setScoreboard] = useState<ArenaScoreboard | null>(null);
  const [duel, setDuel] = useState<DuelState | null>(null);

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      const [scoreboardResult, duelResult] = await Promise.allSettled([
        fetch("/api/clawd/duel/scoreboard", { credentials: "include" }),
        fetch("/api/clawd/duel/state", { credentials: "include" }),
      ]);

      if (!alive) return;

      if (scoreboardResult.status === "fulfilled" && scoreboardResult.value.ok) {
        const json = await scoreboardResult.value.json().catch(() => null);
        if (json) setScoreboard(json);
      }

      if (duelResult.status === "fulfilled" && duelResult.value.ok) {
        const json = await duelResult.value.json().catch(() => null);
        if (json) setDuel(json);
      }
    };

    refresh().catch(() => {});
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 12_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const rows = useMemo(() => {
    return [...(scoreboard?.rows ?? [])]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3);
  }, [scoreboard?.rows]);

  const livePrice = duel?.price || scoreboard?.price || 0;
  const history = duel?.history ?? [];
  const leader = rows[0];
  const dataReady = Boolean(scoreboard || duel);

  return (
    <section className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-black/50 to-cyan-500/10 p-4 shadow-lg shadow-black/30">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/80">
              Arena live tape
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <div className="text-3xl font-black tracking-tight text-white">{formatPrice(livePrice)}</div>
            <div className="pb-1 text-xs font-mono text-cyan-200/70">$CLAWD realtime mark</div>
          </div>
          <div className="mt-2">
            <MiniSparkline values={history} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {rows.length ? (
            rows.map((row) => {
              const netWorth = row.walletStats.netWorth?.totalValueUsd ?? row.arena.equityUsd;
              const pnlPositive = row.arena.pnlUsd >= 0;
              return (
                <div key={row.agentId} className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      <span className="truncate text-xs font-bold text-white">{row.name}</span>
                    </div>
                    <span className="rounded-full border border-cyan-400/30 px-1.5 py-0.5 text-[10px] font-mono text-cyan-200">
                      #{row.rank}
                    </span>
                  </div>
                  <div className="text-lg font-black text-emerald-100">{formatUsd(netWorth)}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/45">
                    <span className="font-mono">{row.walletShort}</span>
                    <span>{formatSol(row.walletStats.solBalance)}</span>
                  </div>
                  <div className={pnlPositive ? "mt-2 text-[11px] font-bold text-emerald-300" : "mt-2 text-[11px] font-bold text-rose-300"}>
                    {pnlPositive ? "+" : ""}
                    {formatUsd(row.arena.pnlUsd)} arena PnL
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sm:col-span-3 rounded-lg border border-white/10 bg-black/35 p-4 text-sm text-white/45">
              {dataReady ? "Arena wallets are warming up." : "Loading arena wallet balances..."}
            </div>
          )}
        </div>

        <div className="flex flex-row items-center justify-between gap-3 lg:flex-col lg:items-stretch">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              <Activity className="mb-1 h-3.5 w-3.5 text-emerald-300" />
              <div className="text-[10px] uppercase tracking-wide text-white/35">Round</div>
              <div className="text-sm font-black text-white">{duel?.round ?? scoreboard?.round ?? 0}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              <Wallet className="mb-1 h-3.5 w-3.5 text-cyan-300" />
              <div className="text-[10px] uppercase tracking-wide text-white/35">Leader</div>
              <div className="truncate text-sm font-black text-white">{leader?.walletShort ?? "..."}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              <Radio className="mb-1 h-3.5 w-3.5 text-orange-300" />
              <div className="text-[10px] uppercase tracking-wide text-white/35">Status</div>
              <div className={duel?.running ? "text-sm font-black text-emerald-300" : "text-sm font-black text-orange-300"}>
                {duel?.running ? "Live" : "Idle"}
              </div>
            </div>
          </div>
          <Link href="/arena">
            <Button className="h-9 w-full gap-2 bg-emerald-500 text-black hover:bg-emerald-400">
              <CircleDollarSign className="h-4 w-4" />
              Arena
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
