import { useQuery } from "@tanstack/react-query";
import { Flame, TrendingDown, Zap } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

type Stats = {
  totalPayments: number;
  totalSolCollected: number;
  totalClawdBurned: number;
  totalUsdValue: number;
};

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toLocaleString();
}

export function BurnHero() {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery<Stats | null>({
    queryKey: ["/api/treasury/stats"],
    queryFn: async () => {
      const response = await fetch("/api/treasury/stats", { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 20_000,
  });

  const burned = data?.totalClawdBurned ?? 0;
  const txs = data?.totalPayments ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-black via-orange-950/20 to-purple-950/20 p-5 my-4">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
            <span className="text-[10px] font-mono tracking-widest text-orange-400 font-black">
              POWERED BY $CLAWD
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">
            Every AI call <span className="text-orange-400">burns $CLAWD</span> forever.
          </h2>
          <p className="text-xs font-mono text-purple-300/70 mt-2 leading-relaxed">
            Cheshire Terminal is the first AI terminal where compute is a deflationary force.
            Holders get access. Usage destroys supply. Math wins.
          </p>
        </div>

        <div className="md:col-span-2 grid grid-cols-3 gap-3">
          <Stat
            icon={<TrendingDown className="w-4 h-4 text-orange-400" />}
            label="$CLAWD DESTROYED"
            value={fmt(burned)}
            tone="orange"
          />
          <Stat
            icon={<Zap className="w-4 h-4 text-cyan-400" />}
            label="AI ACTIONS"
            value={txs.toLocaleString()}
            tone="cyan"
          />
          <Stat
            icon={<Flame className="w-4 h-4 text-purple-400" />}
            label="SUPPLY REMOVED"
            value="∞ FOREVER"
            tone="purple"
          />
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px] font-mono">
        <Link
          href="/my-burns"
          className="px-3 py-1.5 rounded-md bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 transition"
        >
          🔥 View MY burns →
        </Link>
        <Link
          href="/treasury"
          className="px-3 py-1.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-200 hover:bg-purple-500/30 transition"
        >
          📊 Full treasury stats
        </Link>
        <a
          href="https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-md bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold hover:opacity-90 transition"
        >
          Buy $CLAWD on Jupiter ↗
        </a>
        <span className="ml-auto text-purple-300/40 hidden md:inline">
          cheshireterminal.ai · powered by $CLAWD
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: "orange" | "purple" | "cyan";
}) {
  const ring = {
    orange: "border-orange-500/30 bg-black/40",
    purple: "border-purple-500/30 bg-black/40",
    cyan: "border-cyan-500/30 bg-black/40",
  }[tone];
  return (
    <div className={`rounded-xl border ${ring} p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[9px] font-mono text-white/50 tracking-wider">{label}</span>
      </div>
      <div className="text-lg md:text-xl font-mono font-black text-white">{value}</div>
    </div>
  );
}
