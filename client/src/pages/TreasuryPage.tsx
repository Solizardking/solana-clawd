import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Flame, Coins, TrendingDown, DollarSign, Zap, RefreshCw,
  ExternalLink, Copy, Shield, Activity, Clock, CheckCircle2,
  Wallet, ArrowRight, Lock, Loader2, BarChart3, Sparkles,
} from "lucide-react";

const TREASURY_WALLET = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const SOL_SCAN = "https://solscan.io";

type PriceData = {
  solUsd: number;
  clawdUsd: number;
  feeSol: number;
  feeUsd: string;
  clawdToBurn: number;
  updatedAt: string;
};

type TreasuryStats = {
  totalPayments: number;
  totalSolCollected: number;
  totalClawdBurned: number;
  totalUsdValue: number;
  recent: any[];
};

type TreasuryBalance = {
  solBalance: number;
  solUsd: number;
  solUsdValue: number;
  clawdBalance: number;
  clawdUsd: number;
  clawdUsdValue: number;
  wallet: string;
};

type ClawdSupplyData = {
  supply: {
    current: number;
    floating: number;
    locked: number;
    burned: number;
    burnedPct: number;
    effectiveBurned?: number;
    effectiveBurnedPct?: number;
    incineratorBalance: number;
    lockedBreakdown: { owner: string; amount: number; label: string }[];
  };
  generatedAt: string;
};

function truncate(s: string, n = 10) {
  return s?.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-6)}` : s;
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ title: "Copied!" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-gray-300 transition-colors"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
    </span>
  );
}

// Real-time price ticker
function PriceTicker() {
  const { data: prices, isLoading } = useQuery<PriceData>({
    queryKey: ["/api/treasury/prices"],
    refetchInterval: 15_000,
  });

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-black/40 border border-purple-500/15 rounded-2xl">
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Live Prices</span>
      </div>

      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-600" />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-gray-500">SOL</span>
            <span className="font-mono font-bold text-white text-sm">
              ${prices?.solUsd?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}
            </span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-gray-500">$CLAWD</span>
            <span className="font-mono font-bold text-orange-300 text-sm">
              ${prices?.clawdUsd?.toFixed(8) ?? "—"}
            </span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-[11px] font-mono text-gray-500">Per use</span>
            <span className="font-mono font-bold text-purple-300 text-sm">
              {prices?.feeSol} SOL ≈ ${prices?.feeUsd}
            </span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[11px] font-mono text-gray-500">Burns</span>
            <span className="font-mono font-bold text-red-300 text-sm">
              {(prices?.clawdToBurn ?? 0).toLocaleString()} CLAWD/use
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function RecentPayment({ p }: { p: any }) {
  const feature = p.feature || "general";
  const featureColors: Record<string, string> = {
    chat: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    image: "bg-pink-500/15 text-pink-400 border-pink-500/30",
    video: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    general: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  };

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <Flame className="h-3.5 w-3.5 text-orange-400 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-gray-300">{truncate(p.walletAddress)}</span>
            <Badge className={`text-[9px] font-mono ${featureColors[feature] ?? featureColors.general}`}>
              {feature}
            </Badge>
          </div>
          <span className="text-[10px] font-mono text-gray-600">
            {new Date(p.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-[11px] font-mono text-white">{(p.clawdBurned ?? 0).toLocaleString()} CLAWD</p>
          <p className="text-[10px] font-mono text-gray-600">burned</p>
        </div>
        {p.burnSignature && (
          <a
            href={`${SOL_SCAN}/tx/${p.burnSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function TreasuryPage() {
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuth();
  const wallet = publicKey?.toBase58() ?? "";
  const { toast } = useToast();

  const { data: prices, isLoading: pricesLoading, refetch: refetchPrices } = useQuery<PriceData>({
    queryKey: ["/api/treasury/prices"],
    refetchInterval: 15_000,
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<TreasuryStats>({
    queryKey: ["/api/treasury/stats"],
    refetchInterval: 30_000,
  });

  const { data: balance, isLoading: balLoading, refetch: refetchBalance } = useQuery<TreasuryBalance>({
    queryKey: ["/api/treasury/balance"],
    refetchInterval: 60_000,
  });

  const { data: clawdPortfolio, isLoading: supplyLoading, refetch: refetchSupply } = useQuery<ClawdSupplyData>({
    queryKey: ["/api/clawd-portfolio"],
    refetchInterval: 30_000,
  });

  const { data: myPayments, isLoading: myLoading } = useQuery<any[]>({
    queryKey: ["/api/treasury/payments", wallet],
    enabled: isAuthenticated && !!wallet,
  });

  const refetchAll = () => {
    refetchPrices();
    refetchStats();
    refetchBalance();
    refetchSupply();
  };

  const supply = clawdPortfolio?.supply;
  const effectiveBurned = supply?.effectiveBurned ?? supply?.burned ?? 0;
  const effectiveBurnedPct = supply?.effectiveBurnedPct ?? supply?.burnedPct ?? 0;
  const statCards = [
    {
      label: "Total Uses",
      value: (stats?.totalPayments ?? 0).toLocaleString(),
      icon: Activity,
      color: "text-purple-400",
      sub: "all time",
      loading: statsLoading,
    },
    {
      label: "SOL Collected",
      value: `◎ ${(stats?.totalSolCollected ?? 0).toFixed(4)}`,
      icon: Coins,
      color: "text-yellow-400",
      sub: `≈ $${(stats?.totalUsdValue ?? 0).toFixed(2)}`,
      loading: statsLoading,
    },
    {
      label: "Supply Burned",
      value: effectiveBurned.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      icon: Flame,
      color: "text-orange-400",
      sub: `${effectiveBurnedPct.toFixed(2)}% of initial supply`,
      loading: supplyLoading,
    },
    {
      label: "Locked Supply",
      value: (supply?.locked ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
      icon: Lock,
      color: "text-blue-400",
      sub: `${supply?.lockedBreakdown?.length ?? 0} locked wallet${(supply?.lockedBreakdown?.length ?? 0) === 1 ? "" : "s"}`,
      loading: supplyLoading,
    },
    {
      label: "Treasury SOL",
      value: `◎ ${(balance?.solBalance ?? 0).toFixed(4)}`,
      icon: Shield,
      color: "text-green-400",
      sub: `$${(balance?.solUsdValue ?? 0).toFixed(2)}`,
      loading: balLoading,
    },
  ];

  const features = [
    { id: "chat", label: "Chat with CLAWD", icon: "🦞", desc: "AI-powered chat via DeepSeek V4 + xAI Grok" },
    { id: "image", label: "Image Generate", icon: "🎨", desc: "FAL.ai image generation" },
    { id: "video", label: "Video Generate", icon: "🎬", desc: "AI video synthesis" },
    { id: "search", label: "AI Search", icon: "🔍", desc: "Exa + AI research" },
    { id: "staking", label: "Agent Staking", icon: "🤖", desc: "Stake & earn CLAWD rewards" },
    { id: "nft", label: "NFT Studio", icon: "🖼", desc: "Mint Metaplex Core assets" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a14] text-gray-200 p-4 md:p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black font-mono text-white flex items-center gap-3">
            <Flame className="h-7 w-7 text-orange-400" />
            CLAWD Treasury
          </h1>
          <p className="text-sm text-gray-500 font-mono mt-1">
            Every use burns $CLAWD · {(0.00069420).toFixed(5)} SOL per action · Real-time pricing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-purple-500/30 text-purple-400 font-mono text-xs gap-1.5"
            onClick={refetchAll}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <a
            href={`${SOL_SCAN}/account/${TREASURY_WALLET}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              size="sm"
              variant="outline"
              className="border-purple-500/30 text-purple-400 font-mono text-xs gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Solscan
            </Button>
          </a>
        </div>
      </div>

      {/* ── Live Ticker ── */}
      <PriceTicker />

      {/* ── Treasury wallet info ── */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-[#0f0f1e] border border-green-500/15 rounded-2xl">
        <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
          <Wallet className="h-5 w-5 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Treasury Wallet</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-white">{truncate(TREASURY_WALLET, 16)}</span>
            <CopyBtn value={TREASURY_WALLET} label="copy" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-mono text-gray-500">SOL Balance</p>
            <p className="font-mono font-bold text-yellow-400">
              {balLoading ? "…" : `◎ ${(balance?.solBalance ?? 0).toFixed(4)}`}
            </p>
            <p className="text-[10px] font-mono text-gray-600">
              ${(balance?.solUsdValue ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="w-px h-10 bg-white/5" />
          <div className="text-right">
            <p className="text-[10px] font-mono text-gray-500">CLAWD Pool</p>
            <p className="font-mono font-bold text-orange-400">
              {balLoading ? "…" : (balance?.clawdBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] font-mono text-gray-600">
              ${(balance?.clawdUsdValue ?? 0).toFixed(4)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, sub, loading }) => (
          <Card key={label} className="bg-[#0f0f1e] border-purple-500/15">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-black/40 flex items-center justify-center">
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <p className="text-[10px] text-gray-500 font-mono">{label}</p>
              </div>
              <p className={`text-lg font-black font-mono ${color}`}>{loading ? "…" : value}</p>
              <p className="text-[10px] font-mono text-gray-600 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* ── Payable features ── */}
        <Card className="bg-[#0f0f1e] border-purple-500/15">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm text-purple-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Gated Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {features.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between p-3 bg-black/30 rounded-xl border border-white/5 hover:border-purple-500/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{f.icon}</span>
                  <div>
                    <p className="font-mono text-sm text-white">{f.label}</p>
                    <p className="text-[10px] font-mono text-gray-500">{f.desc}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono text-xs text-yellow-400">
                    {pricesLoading ? "…" : `◎ ${(0.00069420).toFixed(5)}`}
                  </p>
                  <p className="text-[10px] font-mono text-gray-600">
                    ≈ ${prices?.feeUsd ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Recent burns ── */}
        <Card className="bg-[#0f0f1e] border-purple-500/15">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm text-orange-300 flex items-center gap-2">
              <Flame className="h-4 w-4" /> Recent Burns
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {statsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
              </div>
            ) : (stats?.recent ?? []).length === 0 ? (
              <div className="text-center py-8">
                <Flame className="h-8 w-8 text-orange-400/20 mx-auto mb-2" />
                <p className="text-[11px] font-mono text-gray-600">No burns yet — be the first!</p>
              </div>
            ) : (
              <div>
                {(stats?.recent ?? []).map((p: any) => (
                  <RecentPayment key={p.id} p={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── My payments ── */}
      {wallet && (
        <Card className="bg-[#0f0f1e] border-purple-500/15">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm text-purple-300 flex items-center gap-2">
              <Clock className="h-4 w-4" /> My Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {myLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                <span className="text-xs font-mono text-gray-600">Loading…</span>
              </div>
            ) : (myPayments ?? []).length === 0 ? (
              <p className="text-xs font-mono text-gray-600 py-4">No payments from this wallet yet.</p>
            ) : (
              <div>
                {(myPayments ?? []).map((p: any) => <RecentPayment key={p.id} p={p} />)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── How it works ── */}
      <Card className="bg-[#0f0f1e] border-purple-500/15">
        <CardContent className="p-5 space-y-4">
          <p className="font-mono text-xs font-bold text-purple-300 uppercase tracking-widest">How it works</p>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              ["1. Pay SOL", `User sends ${(0.00069420).toFixed(5)} SOL to treasury`, "◎"],
              ["2. Verify", "Server confirms the tx on Solana mainnet", "✓"],
              ["3. Burn CLAWD", "Equivalent USD value of CLAWD burned from pool", "🔥"],
              ["4. Access", "Feature unlocked for this session", "🔓"],
            ].map(([title, desc, emoji]) => (
              <div key={title as string} className="space-y-2">
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-lg">
                  {emoji}
                </div>
                <p className="font-mono text-sm font-bold text-white">{title as string}</p>
                <p className="text-[11px] font-mono text-gray-500 leading-relaxed">{desc as string}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href={`${SOL_SCAN}/account/${TREASURY_WALLET}`} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 text-[11px] font-mono text-purple-400 hover:text-purple-300">
              <ExternalLink className="h-3 w-3" /> Treasury on Solscan
            </a>
            <a href={`${SOL_SCAN}/token/${CLAWD_MINT}`} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 text-[11px] font-mono text-orange-400 hover:text-orange-300">
              <ExternalLink className="h-3 w-3" /> $CLAWD Token
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
