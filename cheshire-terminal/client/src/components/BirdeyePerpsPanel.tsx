import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  fetchPerpsLiquidationMap,
  fetchPerpsOpenPositions,
  fetchPerpsStatus,
  fetchPerpsTokenList,
  fetchPerpsTokenOverview,
  fetchPerpsWalletOverview,
  fetchPerpsWalletOpenPositions,
  type BirdeyePerpsLiquidationBucket,
  type BirdeyePerpsOpenPosition,
  type BirdeyePerpsTokenEntry,
  type BirdeyePerpsTokenOverview,
  type BirdeyePerpsWalletOverview,
  type BirdeyePerpsWalletPosition,
} from "@/lib/birdeyePerps";

const BIRDEYE_DOCS = "https://docs.birdeye.so/reference/get-perps-v1-token-list.md";
const HYPERLIQUID_WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function finiteNumber(n: unknown): number | null {
  const value = Number(n);
  return Number.isFinite(value) ? value : null;
}

function fmtCompact(n: unknown): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function fmtUsd(n: unknown): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  if (Math.abs(value) >= 1_000_000) return `$${fmtCompact(value)}`;
  if (Math.abs(value) >= 1) {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

function fmtSignedUsd(n: unknown): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${fmtUsd(value)}`;
}

function fmtSignedPct(n?: number | null): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  const pct = value * 100;
  const prefix = pct > 0 ? "+" : "";
  return `${prefix}${pct.toFixed(2)}%`;
}

function fmtPct(n?: number | null): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}

function fmtTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "n/a";
  return new Date(seconds * 1000).toLocaleString();
}

function fmtFixed(n: unknown, digits = 1, suffix = ""): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  return `${value.toFixed(digits)}${suffix}`;
}

function fmtInteger(n: unknown): string {
  const value = finiteNumber(n);
  if (value == null) return "n/a";
  return Math.round(value).toLocaleString();
}

function fmtPriceRange(low: unknown, high: unknown): string {
  const lowValue = finiteNumber(low);
  const highValue = finiteNumber(high);
  if (lowValue == null || highValue == null) return "n/a";
  return `$${lowValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} - $${highValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function isPositive(n: unknown): boolean {
  const value = finiteNumber(n);
  return value != null && value > 0;
}

function isNonNegative(n: unknown): boolean {
  const value = finiteNumber(n);
  return value != null && value >= 0;
}

function queryErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function biasBadgeColor(biasText: string): string {
  switch (biasText) {
    case "Very Bullish":
      return "bg-emerald-900/40 text-emerald-300 border-emerald-500/40";
    case "Bullish":
      return "bg-emerald-900/20 text-emerald-400 border-emerald-500/30";
    case "Slightly Bullish":
      return "bg-emerald-900/10 text-emerald-500 border-emerald-500/20";
    case "Very Bearish":
      return "bg-red-900/40 text-red-300 border-red-500/40";
    case "Bearish":
      return "bg-red-900/20 text-red-400 border-red-500/30";
    case "Slightly Bearish":
      return "bg-red-900/10 text-red-500 border-red-500/20";
    default:
      return "bg-zinc-800/30 text-zinc-400 border-zinc-700/30";
  }
}

function biasPrefix(text: string): string {
  switch (text) {
    case "Very Bullish":
      return "++";
    case "Bullish":
      return "+";
    case "Slightly Bullish":
      return "+/-";
    case "Very Bearish":
      return "--";
    case "Bearish":
      return "-";
    case "Slightly Bearish":
      return "-/+";
    default:
      return "..";
  }
}

function BiasBadge({ entry }: { entry: BirdeyePerpsTokenEntry }) {
  const biasText = entry.bias_text || "Neutral";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono border ${biasBadgeColor(biasText)}`}
      title={`Bias score ${fmtFixed(entry.bias, 4)}`}
    >
      <span>{biasPrefix(biasText)}</span>
      <span>{biasText}</span>
    </span>
  );
}

function TokenOverviewCard({
  token,
  overview,
}: {
  token: string;
  overview: BirdeyePerpsTokenOverview;
}) {
  const liqRows = [
    { label: "1h", long: overview.long_liquidation_1h, short: overview.short_liquidation_1h },
    { label: "4h", long: overview.long_liquidation_4h, short: overview.short_liquidation_4h },
    { label: "1d", long: overview.long_liquidation_1d, short: overview.short_liquidation_1d },
    { label: "7d", long: overview.long_liquidation_7d, short: overview.short_liquidation_7d },
  ];

  return (
    <Card className="bg-black/40 border-purple-500/20">
      <CardHeader className="pb-2 pt-2 px-3">
        <CardTitle className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          <Info className="h-3 w-3" />
          {token} overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-[9px] font-mono text-zinc-500">Price</div>
            <div className="text-xs font-mono font-semibold text-cyan-300">{fmtUsd(overview.price)}</div>
          </div>
          <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-[9px] font-mono text-zinc-500">Open Interest</div>
            <div className="text-xs font-mono font-semibold text-zinc-200">{fmtCompact(overview.open_interest)}</div>
          </div>
          <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
            <div className="text-[9px] font-mono text-zinc-500">Positions</div>
            <div className="text-xs font-mono font-semibold text-zinc-200">
              {fmtInteger(overview.position_count)}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
            Liquidations
          </div>
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="text-zinc-600">
                <th className="text-left pb-1">Window</th>
                <th className="text-left pb-1 text-emerald-500/70">Long</th>
                <th className="text-left pb-1 text-red-500/70">Short</th>
              </tr>
            </thead>
            <tbody>
              {liqRows.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="py-0.5 text-zinc-500">{row.label}</td>
                  <td className={isPositive(row.long) ? "py-0.5 text-emerald-400" : "py-0.5 text-zinc-600"}>
                    {isPositive(row.long) ? fmtCompact(row.long) : "n/a"}
                  </td>
                  <td className={isPositive(row.short) ? "py-0.5 text-red-400" : "py-0.5 text-zinc-600"}>
                    {isPositive(row.short) ? fmtCompact(row.short) : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PositionsTable({
  title,
  subtitle,
  positions,
  isLoading,
  errorMessage,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  positions: Array<BirdeyePerpsOpenPosition | BirdeyePerpsWalletPosition>;
  isLoading: boolean;
  errorMessage?: string | null;
  emptyMessage: string;
}) {
  if (isLoading) {
    return (
      <Card className="bg-black/40 border-zinc-700/40">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading {title.toLowerCase()}...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="bg-black/40 border-red-500/30">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-red-300">
            <AlertTriangle className="h-3 w-3" />
            {title}
          </CardTitle>
          <div className="text-[10px] font-mono text-red-300/80">{errorMessage}</div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-cyan-500/20">
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          {title}
        </CardTitle>
        <div className="text-[10px] font-mono text-zinc-600">{subtitle}</div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {positions.length === 0 ? (
          <div className="py-4 text-xs font-mono text-zinc-600">{emptyMessage}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[10px] font-mono">
              <thead>
                <tr className="text-zinc-600">
                  <th className="text-left pb-1">Token</th>
                  <th className="text-left pb-1">Lev.</th>
                  <th className="text-left pb-1">Entry</th>
                  <th className="text-left pb-1">Mark</th>
                  <th className="text-left pb-1">ROE</th>
                  <th className="text-left pb-1">uPnL</th>
                  <th className="text-left pb-1">Opened</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr
                    key={`${"wallet" in position ? position.wallet : "wallet"}-${position.token}-${position.open_time}-${position.entry_price}`}
                    className="border-t border-white/5"
                  >
                    <td className="py-1.5 text-zinc-200">{position.token}</td>
                    <td className="py-1.5 text-zinc-400">
                      {fmtFixed(position.leverage_value, 1, "x")} {position.leverage_type ?? "n/a"}
                    </td>
                    <td className="py-1.5 text-zinc-300">{fmtUsd(position.entry_price)}</td>
                    <td className="py-1.5 text-zinc-300">{fmtUsd(position.mark_price)}</td>
                    <td className={isNonNegative(position.roe) ? "py-1.5 text-emerald-400" : "py-1.5 text-red-400"}>
                      {fmtSignedPct(position.roe)}
                    </td>
                    <td className={isNonNegative(position.unrealized_pnl) ? "py-1.5 text-emerald-400" : "py-1.5 text-red-400"}>
                      {fmtSignedUsd(position.unrealized_pnl)}
                    </td>
                    <td className="py-1.5 text-zinc-500">{fmtTimestamp(position.open_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WalletPositionsCard({
  draftWallet,
  onDraftWalletChange,
  onLoadWallet,
  walletAddress,
  overview,
  positions,
  isLoading,
  errorMessage,
}: {
  draftWallet: string;
  onDraftWalletChange: (value: string) => void;
  onLoadWallet: () => void;
  walletAddress: string | null;
  overview: BirdeyePerpsWalletOverview | null;
  positions: BirdeyePerpsWalletPosition[];
  isLoading: boolean;
  errorMessage: string | null;
}) {
  const totalValue = positions.reduce((sum, position) => sum + (finiteNumber(position.position_value) ?? 0), 0);
  const totalMargin = positions.reduce((sum, position) => sum + (finiteNumber(position.margin_used) ?? 0), 0);
  const totalPnl = positions.reduce((sum, position) => sum + (finiteNumber(position.unrealized_pnl) ?? 0), 0);
  const trimmedWallet = draftWallet.trim().toLowerCase();
  const canLoadWallet = HYPERLIQUID_WALLET_PATTERN.test(trimmedWallet);
  const showWalletHint = draftWallet.trim().length > 0 && !canLoadWallet;

  return (
    <Card className="bg-black/40 border-emerald-500/20">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-mono text-zinc-400">Hyperliquid wallet lookup</CardTitle>
        <div className="text-[10px] font-mono text-zinc-600">
          Enter a Hyperliquid/EVM wallet to load Birdeye wallet overview and open positions.
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="flex gap-2">
          <Input
            value={draftWallet}
            onChange={(event) => onDraftWalletChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canLoadWallet) onLoadWallet();
            }}
            placeholder="0x..."
            className="h-8 flex-1 border-cyan-500/20 bg-black/60 font-mono text-xs text-white"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 bg-cyan-700 text-xs hover:bg-cyan-600"
            disabled={!canLoadWallet}
            onClick={onLoadWallet}
          >
            Load
          </Button>
        </div>
        {showWalletHint && (
          <div className="text-[10px] font-mono text-yellow-400/80">
            Enter a 0x Hyperliquid/EVM wallet address.
          </div>
        )}

        {walletAddress && (
          <div className="truncate rounded border border-white/5 bg-black/30 px-2 py-1.5 text-[10px] font-mono text-zinc-500">
            {walletAddress}
          </div>
        )}

        {!walletAddress ? (
          <div className="py-2 text-xs font-mono text-zinc-600">
            No Hyperliquid wallet loaded yet.
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs font-mono text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading Birdeye wallet overview...
          </div>
        ) : errorMessage ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-300">
            {errorMessage}
          </div>
        ) : walletAddress && overview === null && positions.length === 0 ? (
          <div className="py-2 text-xs font-mono text-zinc-600">
            No Birdeye wallet data returned for this wallet.
          </div>
        ) : walletAddress ? (
          <>
            {overview && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                  <div className="text-[9px] font-mono text-zinc-500">Perp equity</div>
                  <div className="text-xs font-mono font-semibold text-zinc-200">{fmtUsd(overview.perp_equity)}</div>
                </div>
                <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                  <div className="text-[9px] font-mono text-zinc-500">Open value</div>
                  <div className="text-xs font-mono font-semibold text-zinc-200">{fmtUsd(overview.open_value)}</div>
                </div>
                <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                  <div className="text-[9px] font-mono text-zinc-500">Total PnL</div>
                  <div className={isNonNegative(overview.total_pnl) ? "text-xs font-mono font-semibold text-emerald-400" : "text-xs font-mono font-semibold text-red-400"}>
                    {fmtSignedUsd(overview.total_pnl)}
                  </div>
                </div>
                <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                  <div className="text-[9px] font-mono text-zinc-500">Win rate</div>
                  <div className="text-xs font-mono font-semibold text-zinc-200">
                    {fmtPct(overview.win_rate)}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                <div className="text-[9px] font-mono text-zinc-500">Open positions</div>
                <div className="text-xs font-mono font-semibold text-zinc-200">{positions.length}</div>
              </div>
              <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                <div className="text-[9px] font-mono text-zinc-500">Gross value</div>
                <div className="text-xs font-mono font-semibold text-zinc-200">{fmtUsd(totalValue)}</div>
              </div>
              <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                <div className="text-[9px] font-mono text-zinc-500">Margin used</div>
                <div className="text-xs font-mono font-semibold text-zinc-200">{fmtUsd(totalMargin)}</div>
              </div>
              <div className="rounded border border-white/5 bg-black/30 px-2 py-1.5">
                <div className="text-[9px] font-mono text-zinc-500">Unrealized PnL</div>
                <div className={isNonNegative(totalPnl) ? "text-xs font-mono font-semibold text-emerald-400" : "text-xs font-mono font-semibold text-red-400"}>
                  {fmtSignedUsd(totalPnl)}
                </div>
              </div>
            </div>
            <PositionsTable
              title="Wallet open positions"
              subtitle="Open positions from Birdeye perps wallet/open_positions."
              positions={positions.slice(0, 8)}
              isLoading={false}
              errorMessage={null}
              emptyMessage="No wallet positions returned."
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LiquidationMapCard({
  buckets,
  isLoading,
  errorMessage,
}: {
  buckets: BirdeyePerpsLiquidationBucket[];
  isLoading: boolean;
  errorMessage?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? buckets : buckets.slice(0, 5);

  if (isLoading) {
    return (
      <Card className="bg-black/40 border-zinc-700/40">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading liquidation map...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="bg-black/40 border-red-500/30">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-red-300">
            <AlertTriangle className="h-3 w-3" />
            Liquidation map unavailable
          </CardTitle>
          <div className="text-[10px] font-mono text-red-300/80">{errorMessage}</div>
        </CardHeader>
      </Card>
    );
  }

  if (buckets.length === 0) return null;

  return (
    <Card className="bg-black/40 border-orange-500/20">
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          <AlertTriangle className="h-3 w-3 text-orange-400" />
          Liquidation clusters ({buckets.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[10px] font-mono">
            <thead>
              <tr className="text-zinc-600">
                <th className="text-left pb-1">Price range</th>
                <th className="text-left pb-1">Positions</th>
                <th className="text-left pb-1 text-emerald-500/70">Long liq.</th>
                <th className="text-left pb-1 text-red-500/70">Short liq.</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((bucket, index) => (
                <tr key={`${bucket.low_price}-${bucket.high_price}-${index}`} className="border-t border-white/5">
                  <td className="py-0.5 text-zinc-300">{fmtPriceRange(bucket.low_price, bucket.high_price)}</td>
                  <td className="py-0.5 text-zinc-400">{fmtInteger(bucket.position_count)}</td>
                  <td className={isPositive(bucket.long_liq_value) ? "py-0.5 text-emerald-400" : "py-0.5 text-zinc-600"}>
                    {isPositive(bucket.long_liq_value) ? fmtCompact(bucket.long_liq_value) : "n/a"}
                  </td>
                  <td className={isPositive(bucket.short_liq_value) ? "py-0.5 text-red-400" : "py-0.5 text-zinc-600"}>
                    {isPositive(bucket.short_liq_value) ? fmtCompact(bucket.short_liq_value) : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {buckets.length > 5 && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="mt-1 flex items-center gap-1 text-[10px] text-cyan-400 transition-colors hover:text-cyan-300"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Show fewer" : `Show all ${buckets.length} buckets`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export function BirdeyePerpsPanel() {
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"open_interest" | "long_io" | "short_io">("open_interest");
  const [walletDraft, setWalletDraft] = useState("");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ["birdeye-perps-status"],
    queryFn: fetchPerpsStatus,
    staleTime: 60_000,
  });

  const birdeyeConfigured = statusQ.data?.configured ?? false;

  const tokenListQ = useQuery({
    queryKey: ["birdeye-perps-token-list", sortBy],
    queryFn: () =>
      fetchPerpsTokenList({
        sort_by: sortBy,
        sort_type: "desc",
        limit: 20,
      }),
    enabled: birdeyeConfigured,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const tokens = tokenListQ.data ?? [];

  useEffect(() => {
    if (!selectedToken && tokens.length > 0) {
      setSelectedToken(tokens[0].token);
      return;
    }
    if (selectedToken && tokens.length > 0 && !tokens.some((token) => token.token === selectedToken)) {
      setSelectedToken(tokens[0].token);
    }
  }, [tokens, selectedToken]);

  const activeToken = selectedToken ?? tokens[0]?.token ?? null;

  const overviewQ = useQuery({
    queryKey: ["birdeye-perps-overview", activeToken],
    queryFn: () => fetchPerpsTokenOverview(activeToken!),
    enabled: birdeyeConfigured && Boolean(activeToken),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const tokenPositionsQ = useQuery({
    queryKey: ["birdeye-perps-token-open-positions", activeToken],
    queryFn: () =>
      fetchPerpsOpenPositions({
        token: activeToken!,
        sort_by: "position_value",
        sort_type: "desc",
        limit: 8,
      }),
    enabled: birdeyeConfigured && Boolean(activeToken),
    staleTime: 15_000,
    refetchInterval: 45_000,
  });

  const liqMapQ = useQuery({
    queryKey: ["birdeye-perps-liquidation-map", activeToken],
    queryFn: () => fetchPerpsLiquidationMap(activeToken!),
    enabled: birdeyeConfigured && Boolean(activeToken),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const walletPositionsQ = useQuery({
    queryKey: ["birdeye-perps-wallet-open-positions", walletAddress],
    queryFn: () => fetchPerpsWalletOpenPositions(walletAddress!),
    enabled: birdeyeConfigured && Boolean(walletAddress),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const walletOverviewQ = useQuery({
    queryKey: ["birdeye-perps-wallet-overview", walletAddress],
    queryFn: () => fetchPerpsWalletOverview(walletAddress!),
    enabled: birdeyeConfigured && Boolean(walletAddress),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const tokenError = tokenListQ.isError ? queryErrorMessage(tokenListQ.error) : null;
  const overviewError = overviewQ.isError ? queryErrorMessage(overviewQ.error) : null;
  const tokenPositionsError = tokenPositionsQ.isError ? queryErrorMessage(tokenPositionsQ.error) : null;
  const liqMapError = liqMapQ.isError ? queryErrorMessage(liqMapQ.error) : null;
  const walletError =
    walletOverviewQ.isError
      ? queryErrorMessage(walletOverviewQ.error)
      : walletPositionsQ.isError
        ? queryErrorMessage(walletPositionsQ.error)
        : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-mono font-semibold text-cyan-300">Birdeye Perps Data</span>
        <Badge variant="outline" className="ml-auto text-[10px] border-cyan-500/30 text-cyan-400">
          {statusQ.data?.exchange ?? "hyperliquid"}
        </Badge>
        <Badge
          variant="outline"
          className={birdeyeConfigured
            ? "text-[10px] border-emerald-500/30 text-emerald-400"
            : "text-[10px] border-yellow-500/30 text-yellow-300"}
        >
          {birdeyeConfigured ? "server key active" : "server key missing"}
        </Badge>
        <button
          type="button"
          onClick={() => {
            statusQ.refetch();
            tokenListQ.refetch();
            overviewQ.refetch();
            tokenPositionsQ.refetch();
            liqMapQ.refetch();
            walletOverviewQ.refetch();
            walletPositionsQ.refetch();
          }}
          className="text-zinc-500 transition-colors hover:text-zinc-300"
          title="Refresh Birdeye data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {statusQ.isLoading && (
        <div className="flex items-center gap-2 py-2 text-xs font-mono text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking Birdeye perps server configuration...
        </div>
      )}

      {!statusQ.isLoading && !birdeyeConfigured && (
        <div className="flex items-center gap-2 rounded border border-yellow-500/30 bg-yellow-950/20 px-3 py-2 text-[11px] font-mono text-yellow-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Set <code className="text-cyan-300">BIRDEYE_API_KEY</code> on the server to load Birdeye perps data.
          <a
            href={BIRDEYE_DOCS}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-0.5 text-cyan-400 hover:text-cyan-300"
          >
            Docs <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}

      {tokenListQ.isLoading && birdeyeConfigured && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs font-mono text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading Birdeye perps token list...
        </div>
      )}

      {tokenError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-300">
          {tokenError}
        </div>
      )}

      {tokens.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.45fr_1fr]">
          <Card className="bg-black/40 border-cyan-500/20">
            <CardHeader className="pb-1 pt-2 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Per-token stats
                </CardTitle>
                <div className="flex gap-1">
                  {(["open_interest", "long_io", "short_io"] as const).map((sort) => (
                    <button
                      key={sort}
                      type="button"
                      onClick={() => setSortBy(sort)}
                      className={sortBy === sort
                        ? "rounded border border-cyan-500/30 bg-cyan-900/30 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300 transition-colors"
                        : "rounded px-1.5 py-0.5 text-[9px] font-mono text-zinc-600 transition-colors hover:text-zinc-400"}
                    >
                      {sort === "open_interest" ? "OI" : sort === "long_io" ? "Long" : "Short"}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                      <th className="text-left pb-1">Token</th>
                      <th className="text-left pb-1">Bias</th>
                      <th className="text-left pb-1">OI</th>
                      <th className="text-left pb-1">Long / Short</th>
                      <th className="text-left pb-1">Leverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((entry) => (
                      <tr
                        key={entry.token}
                        className={activeToken === entry.token
                          ? "cursor-pointer border-t border-white/5 bg-cyan-900/10 text-[10px] font-mono transition-colors hover:bg-white/5"
                          : "cursor-pointer border-t border-white/5 text-[10px] font-mono transition-colors hover:bg-white/5"}
                        onClick={() => setSelectedToken(entry.token)}
                      >
                        <td className="py-1.5 font-semibold text-zinc-200">{entry.token}</td>
                        <td className="py-1.5">
                          <BiasBadge entry={entry} />
                        </td>
                        <td className="py-1.5 text-zinc-300">{fmtCompact(entry.open_interest)}</td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-emerald-400/80">{fmtCompact(entry.long_io)}</span>
                            <span className="text-zinc-600">/</span>
                            <span className="text-red-400/80">{fmtCompact(entry.short_io)}</span>
                          </div>
                        </td>
                        <td className="py-1.5 text-zinc-400">{fmtFixed(entry.leverage, 1, "x")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-right text-[9px] font-mono text-zinc-600">
                Server-backed proxy using BIRDEYE_API_KEY
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {activeToken && overviewQ.data && (
              <TokenOverviewCard token={activeToken} overview={overviewQ.data} />
            )}

            {activeToken && overviewQ.isLoading && (
              <Card className="bg-black/40 border-purple-500/20">
                <CardHeader className="pb-1 pt-2 px-3">
                  <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading {activeToken} overview...
                  </CardTitle>
                </CardHeader>
              </Card>
            )}

            {activeToken && overviewError && (
              <Card className="bg-black/40 border-red-500/30">
                <CardHeader className="pb-1 pt-2 px-3">
                  <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-red-300">
                    <AlertTriangle className="h-3 w-3" />
                    {activeToken} overview unavailable
                  </CardTitle>
                  <div className="text-[10px] font-mono text-red-300/80">{overviewError}</div>
                </CardHeader>
              </Card>
            )}

            <PositionsTable
              title="Top token positions"
              subtitle={activeToken ? `Largest live ${activeToken} open positions on Hyperliquid.` : "Select a token."}
              positions={tokenPositionsQ.data ?? []}
              isLoading={tokenPositionsQ.isLoading}
              errorMessage={tokenPositionsError}
              emptyMessage="No token open positions returned."
            />

            <WalletPositionsCard
              draftWallet={walletDraft}
              onDraftWalletChange={setWalletDraft}
              onLoadWallet={() => setWalletAddress(walletDraft.trim().toLowerCase() || null)}
              walletAddress={walletAddress}
              overview={walletOverviewQ.data ?? null}
              positions={walletPositionsQ.data ?? []}
              isLoading={walletOverviewQ.isLoading || walletPositionsQ.isLoading}
              errorMessage={walletError}
            />

            <LiquidationMapCard
              buckets={liqMapQ.data ?? []}
              isLoading={liqMapQ.isLoading}
              errorMessage={liqMapError}
            />
          </div>
        </div>
      )}

      {!tokenListQ.isLoading && !tokenError && birdeyeConfigured && tokens.length === 0 && (
        <div className="py-8 text-center text-xs font-mono text-zinc-600">
          No Birdeye perps token data returned.
        </div>
      )}
    </div>
  );
}
