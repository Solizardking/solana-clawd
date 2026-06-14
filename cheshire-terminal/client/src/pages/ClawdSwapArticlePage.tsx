import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Info,
  Landmark,
  Shield,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClawdSwapWidget } from "@/components/ClawdSwapWidget";
import { meteoraSwap, type PoolDataResponse, type PoolInfo } from "@/lib/meteoraSwap";

const POOL_ADDRESS = "2A5txW8LRjV1gmnz57ckGRhtQz7zmTbeZB82CzeyH7ZW";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

function formatAmount(value: string | number, digits = 4) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatUsd(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function MetricCard({
  label,
  value,
  note,
  tone = "amber",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "amber" | "green" | "blue" | "zinc";
}) {
  const tones = {
    amber: "border-amber-500/25 text-amber-300",
    green: "border-emerald-500/25 text-emerald-300",
    blue: "border-sky-500/25 text-sky-300",
    zinc: "border-zinc-700 text-zinc-200",
  };

  return (
    <div className={`rounded-2xl border bg-zinc-950/70 p-4 ${tones[tone]}`}>
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-zinc-500">{note}</div>
    </div>
  );
}

function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Icon className="h-4 w-4 text-amber-300" />
        {title}
      </div>
      <p className="text-sm leading-relaxed text-zinc-500">{body}</p>
    </div>
  );
}

export default function ClawdSwapArticlePage() {
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [poolData, setPoolData] = useState<PoolDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadPool() {
      try {
        const [info, data] = await Promise.all([
          meteoraSwap.poolInfo(),
          meteoraSwap.poolData().catch(() => null),
        ]);
        if (!alive) return;
        setPool(info);
        setPoolData(data);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Unable to load pool info");
      }
    }

    loadPool();
    const timer = window.setInterval(loadPool, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const poolReady = pool?.liquidityReady ?? false;
  const clawdReserve = pool?.tokenAAmount ?? "0";
  const solReserve = pool?.tokenBAmount ?? "0";
  const price = pool?.livePrice?.clawdPerSol ?? pool?.clawdPerSol ?? 0;
  const indexedSummary = poolData?.indexed.summary;

  return (
    <div className="min-h-screen overflow-hidden bg-[#070805] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,rgba(24,24,27,0.85),rgba(7,8,5,1))]" />

      <main className="relative mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        <section className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="order-2 space-y-4 lg:order-1 lg:space-y-6">
            <div className="rounded-xl border border-amber-500/20 bg-zinc-950/65 p-4 shadow-2xl shadow-amber-950/20 backdrop-blur md:p-8">
              <Badge className="mb-5 border-amber-400/30 bg-amber-400/10 text-amber-200">
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                CLAWD/SOL Meteora DAMM v2
              </Badge>

              <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">
                Swap through the
                <span className="block bg-gradient-to-r from-amber-200 via-yellow-400 to-emerald-300 bg-clip-text text-transparent">
                  native CLAWD pool.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400">
                This route sends holder flow directly through the seeded CLAWD/SOL Meteora pool
                instead of defaulting every trade to generic aggregator paths. The quote panel still
                compares Jupiter, so use the native pool when the output, price impact, and slippage
                are acceptable.
              </p>

              <div className="mt-5 grid gap-2 sm:mt-6 sm:flex sm:flex-wrap sm:gap-3">
                <a
                  href={`https://app.meteora.ag/pools/${POOL_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/15 sm:rounded-full"
                >
                  Open Meteora Pool <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`https://solscan.io/account/${POOL_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/70 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 sm:rounded-full"
                >
                  View On Solscan <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
              <MetricCard
                label="Pool Status"
                value={poolReady ? "Live" : "Paused"}
                note={poolReady ? "Seeded and quote-ready" : "Waiting for active liquidity"}
                tone={poolReady ? "green" : "amber"}
              />
              <MetricCard
                label="CLAWD Reserve"
                value={formatAmount(clawdReserve, 2)}
                note="Vault balance from the DAMM v2 pool"
              />
              <MetricCard
                label="SOL Reserve"
                value={formatAmount(solReserve, 6)}
                note="Quote-side pool liquidity"
                tone="blue"
              />
              <MetricCard
                label="Fee Mode"
                value={pool?.collectFeeModeName ?? "OnlyB"}
                note={`Fees accrue in ${pool?.feeCollectionToken ?? "SOL"} for this pool`}
                tone="zinc"
              />
              <MetricCard
                label="TVL"
                value={formatUsd(indexedSummary?.tvl)}
                note="Indexed by Meteora DAMM v2 data API"
                tone="green"
              />
              <MetricCard
                label="24h Volume"
                value={formatUsd(indexedSummary?.volume24h)}
                note="Pool volume over the latest indexed window"
                tone="blue"
              />
              <MetricCard
                label="24h Fees"
                value={formatUsd(indexedSummary?.fees24h)}
                note="LP + protocol fees from indexed pool history"
                tone="amber"
              />
            </div>
          </div>

          <div className="order-1 rounded-xl border border-zinc-800 bg-black/40 p-2 shadow-2xl shadow-black/40 backdrop-blur lg:order-2 lg:sticky lg:top-4 lg:p-3">
            <ClawdSwapWidget />
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-950/30 p-4 text-sm text-red-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        )}

        <section className="mt-8 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-zinc-800 bg-zinc-950/70 text-zinc-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-5 w-5 text-emerald-300" />
                Live Pool Readout
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Current Pool Price</div>
                <div className="mt-2 text-3xl font-black text-emerald-300">
                  {formatAmount(price, 0)} CLAWD
                </div>
                <div className="mt-1 text-zinc-500">per 1 SOL, refreshed from the Meteora pool account.</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <div className="text-zinc-500">Program</div>
                  <div className="mt-1 font-mono text-xs text-zinc-200">cpamdpZCG...En1sGG</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <div className="text-zinc-500">Base Fee</div>
                  <div className="mt-1 font-semibold text-zinc-200">0.25% on current quotes</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <div className="text-zinc-500">CLAWD Token Program</div>
                  <div className="mt-1 font-semibold text-zinc-200">Token-2022</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <div className="text-zinc-500">Pool Address</div>
                  <div className="mt-1 truncate font-mono text-xs text-zinc-200">{POOL_ADDRESS}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950/70 text-zinc-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="h-5 w-5 text-amber-300" />
                How To Use This Route
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Step
                icon={Wallet}
                title="Connect a Solana wallet"
                body="Use Phantom, Solflare, Backpack, or another wallet adapter-compatible Solana wallet."
              />
              <Step
                icon={BarChart3}
                title="Check the comparison"
                body="The panel shows Meteora output beside Jupiter. If Jupiter is better, the UI says so directly."
              />
              <Step
                icon={Gauge}
                title="Watch price impact"
                body="Meteora recommends checking pool liquidity, pool price, fee, slippage, and swap info before confirming."
              />
              <Step
                icon={CheckCircle2}
                title="Sign and verify"
                body="After signing, the transaction is submitted on Solana and linked to Solscan for verification."
              />
            </CardContent>
          </Card>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="border-emerald-500/20 bg-emerald-950/10 text-zinc-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-emerald-200">
                <Landmark className="h-4 w-4" />
                Why Route Here
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-zinc-400">
              Native swaps route volume through the treasury-backed CLAWD/SOL pool, which helps
              establish a canonical holder route and keeps LP fee flow tied to the CLAWD ecosystem.
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-950/10 text-zinc-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-amber-200">
                <ArrowRight className="h-4 w-4" />
                Direct Pool, Not Blind Routing
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-zinc-400">
              Meteora supports swapping directly inside DAMM v2 pools. This page uses that model,
              then compares Jupiter so users can choose the route that actually gives better output.
            </CardContent>
          </Card>

          <Card className="border-sky-500/20 bg-sky-950/10 text-zinc-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-sky-200">
                <Shield className="h-4 w-4" />
                Safety Checks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>CLAWD is Token-2022, so swaps use the correct Token-2022 program path.</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://rugcheck.xyz/tokens/${CLAWD_MINT}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  RugCheck
                </a>
                <a
                  href={`https://jup.ag/swap/SOL-${CLAWD_MINT}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Jupiter fallback
                </a>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
