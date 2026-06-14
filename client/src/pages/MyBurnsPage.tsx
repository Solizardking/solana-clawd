import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Flame, ExternalLink, TrendingDown, Zap, Wallet, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

type Payment = {
  id: string | number;
  walletAddress: string;
  txSignature: string;
  solPaid: number;
  solUsdAtTime: number;
  clawdBurned: number;
  clawdUsdAtTime: number;
  feature: string;
  burnSignature: string | null;
  status: string;
  createdAt: string;
};

type Stats = {
  totalPayments: number;
  totalSolCollected: number;
  totalClawdBurned: number;
  totalUsdValue: number;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toLocaleString();
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function MyBurnsPage() {
  const { publicKey, connected } = useWallet();
  const { isAuthenticated } = useAuth();
  const wallet = publicKey?.toString();

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/treasury/stats"],
    refetchInterval: 30_000,
  });

  const { data: payments, isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/treasury/payments", wallet],
    queryFn: () => fetch(`/api/treasury/payments/${wallet}`).then((r) => r.json()),
    enabled: isAuthenticated && !!wallet && connected,
    refetchInterval: isAuthenticated ? 20_000 : false,
  });

  const myBurned = payments?.reduce((s, p) => s + (Number(p.clawdBurned) || 0), 0) ?? 0;
  const mySol = payments?.reduce((s, p) => s + (Number(p.solPaid) || 0), 0) ?? 0;
  const myCount = payments?.length ?? 0;
  const totalBurned = stats?.totalClawdBurned ?? 0;
  const myShare = totalBurned > 0 ? (myBurned / totalBurned) * 100 : 0;

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-purple-300/60 hover:text-purple-300 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to terminal
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/30 to-red-500/20 border border-orange-500/30 flex items-center justify-center">
          <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-wider text-white">MY $CLAWD BURNS</h1>
          <p className="text-xs text-purple-300/60 font-mono">
            Every AI action you've taken on Cheshire Terminal — and the $CLAWD destroyed forever.
          </p>
        </div>
      </div>

      {!connected ? (
        <div className="mt-8 p-8 rounded-xl border border-purple-500/30 bg-black/40 text-center">
          <Wallet className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <p className="text-purple-200 font-mono">Connect your wallet to view your burn history.</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <StatCard
              icon={<Flame className="w-4 h-4 text-orange-400" />}
              label="YOUR BURNS"
              value={`${fmt(myBurned)} CLAWD`}
              tone="orange"
            />
            <StatCard
              icon={<Zap className="w-4 h-4 text-cyan-400" />}
              label="ACTIONS"
              value={myCount.toLocaleString()}
              tone="cyan"
            />
            <StatCard
              icon={<TrendingDown className="w-4 h-4 text-purple-400" />}
              label="SOL SPENT"
              value={`${mySol.toFixed(5)} SOL`}
              tone="purple"
            />
            <StatCard
              icon={<Flame className="w-4 h-4 text-red-400" />}
              label="% OF ALL BURNS"
              value={`${myShare.toFixed(myShare < 1 ? 3 : 2)}%`}
              tone="red"
            />
          </div>

          {/* Marketing brag */}
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-orange-500/10 via-purple-500/10 to-cyan-500/10 border border-orange-500/20 text-center">
            <p className="text-xs font-mono text-orange-300/90">
              You've personally removed <span className="text-orange-400 font-black">{fmt(myBurned)} $CLAWD</span> from circulation.
              That's <span className="text-cyan-400 font-bold">{fmt(myBurned)} tokens</span> nobody can ever own.
            </p>
          </div>

          {/* History table */}
          <div className="mt-6 rounded-xl border border-purple-500/20 bg-black/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
              <h2 className="text-sm font-mono font-black tracking-wider text-purple-200">BURN HISTORY</h2>
              <span className="text-[10px] font-mono text-purple-300/40">auto-refresh 20s</span>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-purple-300/60 font-mono text-sm">Loading…</div>
            ) : !payments || payments.length === 0 ? (
              <div className="p-8 text-center text-purple-300/60 font-mono text-sm">
                No burns yet. Use any AI feature to start burning $CLAWD.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-left text-purple-300/40 border-b border-purple-500/10">
                      <th className="px-4 py-2">WHEN</th>
                      <th className="px-4 py-2">FEATURE</th>
                      <th className="px-4 py-2 text-right">SOL PAID</th>
                      <th className="px-4 py-2 text-right">$CLAWD BURNED</th>
                      <th className="px-4 py-2">TXs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-purple-500/5 hover:bg-purple-500/5">
                        <td className="px-4 py-2 text-purple-300/80">{timeAgo(p.createdAt)}</td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 text-[10px]">
                            {p.feature}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-cyan-300">{Number(p.solPaid).toFixed(6)}</td>
                        <td className="px-4 py-2 text-right text-orange-400 font-bold">
                          🔥 {fmt(Number(p.clawdBurned) || 0)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <a
                              href={`https://solscan.io/tx/${p.txSignature}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-purple-300/70 hover:text-purple-200 inline-flex items-center gap-1"
                              title="Payment tx"
                            >
                              pay <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            {p.burnSignature && (
                              <a
                                href={`https://solscan.io/tx/${p.burnSignature}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-orange-300/80 hover:text-orange-200 inline-flex items-center gap-1"
                                title="Burn tx"
                              >
                                burn <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: "orange" | "purple" | "cyan" | "red";
}) {
  const ring = {
    orange: "border-orange-500/30 bg-orange-500/5",
    purple: "border-purple-500/30 bg-purple-500/5",
    cyan: "border-cyan-500/30 bg-cyan-500/5",
    red: "border-red-500/30 bg-red-500/5",
  }[tone];
  return (
    <div className={`rounded-xl border ${ring} p-3`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-mono text-white/50 tracking-wider">{label}</span>
      </div>
      <div className="text-base font-mono font-black text-white">{value}</div>
    </div>
  );
}
