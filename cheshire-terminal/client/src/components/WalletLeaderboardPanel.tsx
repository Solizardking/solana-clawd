import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Activity, ArrowRight, BarChart3, Crown, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

type LeaderboardWallet = {
  rank: number;
  wallet: string;
  totalValue: number;
  currency: string;
};

type LeaderboardResponse = {
  success: boolean;
  type: string;
  sort: string;
  source: string;
  wallets: LeaderboardWallet[];
  cached?: boolean;
};

type PerpsMarket = {
  token: string;
  openInterest: number;
  longOi: number;
  shortOi: number;
  unrealizedPnl: number;
  biasText: string;
  leverage: number;
};

type PerpsOverviewResponse = {
  success: boolean;
  exchange: string;
  markets: PerpsMarket[];
  totals: {
    openInterest: number;
    longOi: number;
    shortOi: number;
    unrealizedPnl: number;
  };
  cached?: boolean;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || "Request failed");
  }
  return body as T;
}

function compact(n: number) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function usd(n: number) {
  if (!Number.isFinite(n)) return "$0";
  const prefix = n < 0 ? "-" : "";
  return `${prefix}$${compact(Math.abs(n))}`;
}

function shortWallet(wallet: string) {
  if (!wallet) return "unknown";
  return wallet.length > 12 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
}

function biasClass(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("bull")) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (lower.includes("bear")) return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-zinc-600/30 bg-zinc-700/20 text-zinc-300";
}

export function WalletLeaderboardPanel() {
  const leaderboard = useQuery<LeaderboardResponse>({
    queryKey: ["wallet-intel", "leaderboard", "total-assets"],
    queryFn: () => fetchJson<LeaderboardResponse>("/api/wallet-intel/leaderboard?limit=6"),
    refetchInterval: 30_000,
  });
  const perps = useQuery<PerpsOverviewResponse>({
    queryKey: ["wallet-intel", "perps-overview"],
    queryFn: () => fetchJson<PerpsOverviewResponse>("/api/wallet-intel/perps-overview"),
    refetchInterval: 20_000,
  });

  const wallets = leaderboard.data?.wallets ?? [];
  const markets = perps.data?.markets ?? [];

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3 rounded-xl border border-emerald-500/20 bg-black/45 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-emerald-300" />
            <div>
              <h2 className="text-sm font-bold text-emerald-100">Total asset leaderboard</h2>
              <p className="text-[11px] text-zinc-500">Wallets ranked by total asset value via Birdeye</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => leaderboard.refetch()}
            className="h-7 px-2 text-zinc-500 hover:text-emerald-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${leaderboard.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {leaderboard.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : leaderboard.error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-3 text-xs text-red-300">
            {leaderboard.error instanceof Error ? leaderboard.error.message : "Leaderboard unavailable"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {wallets.map((row) => (
              <div key={`${row.rank}-${row.wallet}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-xs font-black text-emerald-300">
                  {row.rank}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3 w-3 text-zinc-500" />
                    <span className="font-mono text-xs text-zinc-200">{shortWallet(row.wallet)}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">Total asset value rank</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600">Total assets</div>
                  <div className="text-xs font-semibold text-zinc-200">{usd(row.totalValue)}</div>
                </div>
              </div>
            ))}
            {!wallets.length && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-500">
                No wallet rows returned yet.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="lg:col-span-2 rounded-xl border border-purple-500/20 bg-black/45 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-300" />
            <div>
              <h2 className="text-sm font-bold text-purple-100">Open perps overview</h2>
              <p className="text-[11px] text-zinc-500">Hyperliquid market context</p>
            </div>
          </div>
          <Link href="/perps">
            <Button size="sm" className="h-7 bg-purple-600 px-2 text-xs hover:bg-purple-500">
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">Open interest</div>
            <div className="text-sm font-bold text-white">{usd(perps.data?.totals.openInterest ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">Unrealized PnL</div>
            <div className={`text-sm font-bold ${(perps.data?.totals.unrealizedPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {usd(perps.data?.totals.unrealizedPnl ?? 0)}
            </div>
          </div>
        </div>

        {perps.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-8 animate-pulse rounded bg-white/5" />
            ))}
          </div>
        ) : perps.error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-3 text-xs text-red-300">
            {perps.error instanceof Error ? perps.error.message : "Perps unavailable"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {markets.slice(0, 5).map((market) => (
              <div key={market.token} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3 text-purple-300" />
                    <span className="text-xs font-bold text-zinc-200">{market.token || "PERP"}</span>
                    <span className={`rounded border px-1 py-0.5 text-[9px] ${biasClass(market.biasText)}`}>{market.biasText}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">OI {usd(market.openInterest)} · Lev {compact(market.leverage)}x</div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${market.unrealizedPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  <TrendingUp className="h-3 w-3" />
                  {usd(market.unrealizedPnl)}
                </div>
              </div>
            ))}
            {!markets.length && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-500">
                No perps rows returned yet.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default WalletLeaderboardPanel;
