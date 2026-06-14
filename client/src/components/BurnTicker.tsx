import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Flame, TrendingDown, Wallet } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

type Stats = {
  totalPayments: number;
  totalSolCollected: number;
  totalClawdBurned: number;
  totalUsdValue: number;
};

type Payment = {
  id: string | number;
  clawdBurned: number;
  solPaid: number;
  feature: string;
  createdAt: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toLocaleString();
}

export function BurnTicker() {
  const { publicKey, connected } = useWallet();
  const { isAuthenticated } = useAuth();
  const wallet = publicKey?.toString();

  const { data: stats } = useQuery<Stats | null>({
    queryKey: ["/api/treasury/stats"],
    queryFn: async () => {
      const response = await fetch("/api/treasury/stats", { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 20_000,
  });

  const { data: myPayments } = useQuery<Payment[]>({
    queryKey: ["/api/treasury/payments", wallet],
    queryFn: async () => {
      const r = await fetch(`/api/treasury/payments/${wallet}`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && !!wallet && connected,
    refetchInterval: isAuthenticated ? 30_000 : false,
  });

  const payments = Array.isArray(myPayments) ? myPayments : [];
  const myBurned = payments.reduce((s, p) => s + (Number(p.clawdBurned) || 0), 0);
  const myCount = payments.length;
  const totalBurned = stats?.totalClawdBurned ?? 0;

  return (
    <Link
      href="/treasury"
      className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-mono border-b border-orange-500/20 bg-gradient-to-r from-black/60 via-orange-950/20 to-black/60 hover:bg-orange-500/5 transition-colors overflow-hidden whitespace-nowrap"
      title="Click for full treasury stats"
    >
      <span className="flex items-center gap-1 text-orange-400 shrink-0">
        <Flame className="w-3 h-3 animate-pulse" />
        <span className="font-black tracking-wider">LIVE BURN</span>
      </span>

      <span className="flex items-center gap-1 text-orange-300/90 shrink-0">
        <TrendingDown className="w-3 h-3" />
        <span className="text-orange-400 font-bold">{fmt(totalBurned)}</span>
        <span className="text-orange-300/60">$CLAWD destroyed</span>
        <span className="text-orange-300/40">·</span>
        <span className="text-orange-300/60">{stats?.totalPayments ?? 0} txs</span>
      </span>

      <span className="text-purple-300/40 shrink-0">|</span>

      {connected && wallet ? (
        <span className="flex items-center gap-1 text-purple-300/90 shrink-0">
          <Wallet className="w-3 h-3" />
          <span className="text-purple-300/60">YOU burned</span>
          <span className="text-orange-300 font-bold">
            {myBurned > 0 ? fmt(myBurned) : "0"}
          </span>
          <span className="text-purple-300/60">$CLAWD across {myCount} actions</span>
        </span>
      ) : (
        <span className="text-purple-300/60 shrink-0">
          Connect wallet to track <span className="text-orange-300 font-bold">your $CLAWD burns</span>
        </span>
      )}

      <span className="ml-auto text-purple-300/40 shrink-0 hidden md:inline">
        Every AI call burns $CLAWD forever — deflationary by design →
      </span>
    </Link>
  );
}
