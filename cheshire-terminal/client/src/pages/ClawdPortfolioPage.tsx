import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTokenGate, type WalletNetWorthPoint } from "@/contexts/TokenGateContext";
import {
  Flame,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Droplets,
  Activity,
  Lock,
  Coins,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  LineChart,
  Wallet as WalletIcon,
} from "lucide-react";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

type PortfolioData = {
  success: boolean;
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  decimals: number;
  authorities: {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    renounced: boolean;
  };
  supply: {
    initial: number;
    current: number;
    floating: number;
    locked: number;
    burned: number;
    burnedPct: number;
    incineratorBalance: number;
    deflationary: boolean;
    lockedBreakdown: { owner: string; amount: number; label: string }[];
  };
  market: {
    price: number;
    priceChange24h: number;
    marketCap: number;
    fdv: number;
    liquidity: number;
    volume24h: number;
    trades24h: number;
  };
  topHolders: { address: string; amount: number; pctOfSupply: number }[];
  priceHistory24h: { time: number; value: number }[];
  generatedAt: string;
};

function fmtUsd(n: number, max = 2) {
  if (!isFinite(n) || n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(8)}`;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: max,
  });
}

function fmtNum(n: number) {
  if (!isFinite(n)) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtSignedUsd(n: number, max = 2) {
  const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${prefix}${fmtUsd(Math.abs(n), max)}`;
}

function truncate(s: string, n = 6) {
  if (!s) return "";
  return s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

function Sparkline({ data }: { data: { time: number; value: number }[] }) {
  if (!data?.length) return null;
  const w = 600;
  const h = 80;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  const stroke = up ? "#10b981" : "#ef4444";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-20"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

function NetWorthChart({ data }: { data: WalletNetWorthPoint[] }) {
  const points = data.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value));
  if (!points.length) return null;

  const w = 800;
  const h = 180;
  const pad = 12;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? w / 2 : (index / (points.length - 1)) * w;
    const y = max === min
      ? h / 2
      : h - pad - ((point.value - min) / range) * (h - pad * 2);
    return { x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = [
    `M ${coords[0].x},${h}`,
    ...coords.map((point) => `L ${point.x},${point.y}`),
    `L ${coords[coords.length - 1].x},${h}`,
    "Z",
  ].join(" ");
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  const change = last - first;
  const pct = first ? (change / first) * 100 : 0;
  const up = change >= 0;

  return (
    <div className="space-y-3">
      <div className="h-48 rounded-md border border-border bg-black/20 p-3">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="portfolio-net-worth-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={up ? "#10b981" : "#ef4444"} stopOpacity="0.28" />
              <stop offset="100%" stopColor={up ? "#10b981" : "#ef4444"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#portfolio-net-worth-area)" />
          <polyline
            fill="none"
            stroke={up ? "#10b981" : "#ef4444"}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            points={line}
          />
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {new Date(points[0].time).toLocaleDateString(undefined, { month: "short", day: "numeric" })} -{" "}
          {new Date(points[points.length - 1].time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <span className={up ? "text-emerald-400" : "text-red-400"}>
          {fmtSignedUsd(change, 0)} ({pct.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}

function WalletNetWorthPanel({
  connected,
  wallet,
  points,
  totalValue,
  pnlTotal,
  assetCount,
  source,
  error,
  loading,
  refreshing,
  onRefresh,
}: {
  connected: boolean;
  wallet: string | null;
  points: WalletNetWorthPoint[];
  totalValue: number;
  pnlTotal: number;
  assetCount: number;
  source?: string;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const hasChart = points.length > 0;
  const sourceLabel = !connected
    ? "Birdeye net worth"
    : source === "birdeye-wallet-v2-net-worth"
    ? "Birdeye 30d net worth"
    : "Estimated net worth";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-emerald-500" />
            Wallet Net Worth
          </CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">
            {wallet ? truncate(wallet, 8) : "Connect wallet"} · {sourceLabel}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={!connected || refreshing}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed border-border p-6 text-center">
            <WalletIcon className="mb-2 h-7 w-7 text-muted-foreground" />
            <div className="text-sm font-medium">Connect a wallet to load net worth history.</div>
            <div className="text-xs text-muted-foreground">The public CLAWD portfolio remains visible.</div>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-48 animate-pulse rounded bg-muted" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SupplyCell label="Current Net Worth" value={fmtUsd(totalValue, 0)} />
              <SupplyCell
                label="Total PnL"
                value={fmtSignedUsd(pnlTotal, 0)}
                sub={pnlTotal >= 0 ? "realized + unrealized" : "drawdown"}
              />
              <SupplyCell label="Tracked Assets" value={fmtNum(assetCount)} sub="wallet holdings" />
            </div>
            {hasChart ? (
              <NetWorthChart data={points} />
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Net worth chart data is not available for this wallet yet.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CopyBtn({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast({ title: "Copied" });
      }}
      className="inline-flex items-center hover:text-primary transition-colors"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export default function ClawdPortfolioPage() {
  const { connected, publicKey } = useWallet();
  const {
    walletIntel,
    netWorthChart,
    assets: walletAssets,
    error: walletIntelError,
    isVerifying,
    refresh: refreshWalletIntel,
  } = useTokenGate();
  const { data, isLoading, refetch, isFetching } = useQuery<PortfolioData>({
    queryKey: ["/api/clawd-portfolio"],
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card>
          <CardContent className="p-6">
            Failed to load CLAWD portfolio data.
          </CardContent>
        </Card>
      </div>
    );
  }

  const up = data.market.priceChange24h >= 0;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {data.image && (
              <img
                src={data.image}
                alt="CLAWD"
                className="w-20 h-20 rounded-full border-2 border-primary"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold">${data.symbol}</h1>
                <Badge variant="secondary">{data.name}</Badge>
                {data.authorities.renounced && (
                  <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-700">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Mint Renounced
                  </Badge>
                )}
                {data.supply.deflationary && (
                  <Badge className="bg-orange-600/20 text-orange-400 border-orange-700">
                    <Flame className="h-3 w-3 mr-1" />
                    Deflationary
                  </Badge>
                )}
                <ClawdTokenAction
                  mintAddress={data.mint}
                  symbol={data.symbol}
                  name={data.name}
                  logoURI={data.image ?? undefined}
                  decimals={data.decimals}
                  price={data.market.price}
                  variant="badge"
                />
              </div>
              <div className="text-xs font-mono text-muted-foreground mt-1 flex items-center gap-2">
                {data.mint} <CopyBtn value={data.mint} />
                <a
                  href={`https://solscan.io/token/${data.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{fmtUsd(data.market.price, 8)}</div>
              <div
                className={`flex items-center justify-end text-sm font-medium ${
                  up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {up ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-1" />
                )}
                {data.market.priceChange24h.toFixed(2)}% (24h)
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
          {data.priceHistory24h?.length > 1 && (
            <div className="mt-6">
              <Sparkline data={data.priceHistory24h} />
              <div className="text-xs text-muted-foreground text-center">
                Price · Last 24 hours
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Market stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Market Cap (Floating)"
          value={fmtUsd(data.market.marketCap, 0)}
          sub={`FDV ${fmtUsd(data.market.fdv, 0)}`}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="24h Volume"
          value={fmtUsd(data.market.volume24h, 0)}
          sub={`${fmtNum(data.market.trades24h)} trades`}
        />
        <StatCard
          icon={<Droplets className="h-4 w-4" />}
          label="Liquidity"
          value={fmtUsd(data.market.liquidity, 0)}
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Floating Supply"
          value={fmtNum(data.supply.floating)}
          sub={`of ${fmtNum(data.supply.current)} circulating`}
        />
      </div>

      <WalletNetWorthPanel
        connected={connected}
        wallet={publicKey?.toString() ?? walletIntel?.wallet ?? null}
        points={netWorthChart}
        totalValue={walletIntel?.netWorth?.totalValue ?? 0}
        pnlTotal={walletIntel?.pnl?.totalUsd ?? 0}
        assetCount={walletAssets.length || walletIntel?.netWorth?.items.length || 0}
        source={walletIntel?.netWorthChart?.source}
        error={walletIntelError}
        loading={connected && !walletIntel && !walletIntelError}
        refreshing={isVerifying}
        onRefresh={() => void refreshWalletIntel()}
      />

      {/* Deflationary / supply breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Supply &amp; Burns
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                Burned vs initial supply
              </span>
              <span className="font-mono text-orange-400">
                {data.supply.burnedPct.toFixed(4)}%
              </span>
            </div>
            <Progress value={Math.min(100, data.supply.burnedPct)} />
            <div className="text-xs text-muted-foreground mt-1">
              {fmtNum(data.supply.burned)} ${data.symbol} burned out of{" "}
              {fmtNum(data.supply.initial)} initial
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
            <SupplyCell label="Initial Supply" value={fmtNum(data.supply.initial)} />
            <SupplyCell
              label="Current Supply"
              value={fmtNum(data.supply.current)}
              sub="on-chain"
            />
            <SupplyCell
              label="Locked / Treasury"
              value={fmtNum(data.supply.locked)}
              sub={`${data.supply.lockedBreakdown.length} address(es)`}
            />
            <SupplyCell
              label="Floating Supply"
              value={fmtNum(data.supply.floating)}
              sub="market available"
            />
          </div>

          {data.supply.lockedBreakdown.length > 0 && (
            <div className="pt-4 border-t border-border space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" /> Locked addresses
              </div>
              {data.supply.lockedBreakdown.map((l) => (
                <div
                  key={l.owner}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{l.label}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {truncate(l.owner, 8)}
                    </span>
                    <CopyBtn value={l.owner} />
                  </div>
                  <span className="font-mono">{fmtNum(l.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top holders */}
      <Card>
        <CardHeader>
          <CardTitle>Top Holders (Largest Accounts)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {data.topHolders.map((h, i) => (
              <div
                key={h.address}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-muted-foreground w-6">
                    #{i + 1}
                  </span>
                  <span className="font-mono text-xs">
                    {truncate(h.address, 8)}
                  </span>
                  <CopyBtn value={h.address} />
                  <a
                    href={`https://solscan.io/account/${h.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-right">
                  <div className="font-mono">{fmtNum(h.amount)}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.pctOfSupply.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-right">
        Data via Birdeye + Helius DAS · Updated{" "}
        {new Date(data.generatedAt).toLocaleTimeString()} · Auto-refresh 30s
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SupplyCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
