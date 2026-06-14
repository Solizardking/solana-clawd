import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CircleDollarSign,
  Clipboard,
  Database,
  Gauge,
  Loader2,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  fetchPerpsTokenList,
  fetchPerpsTokenOverview,
  type BirdeyePerpsTokenEntry,
} from "@/lib/birdeyePerps";
import {
  fetchImperialFundingRates,
  fetchImperialMarkPrices,
  fetchImperialOrders,
  fetchImperialPhoenixDepth,
  fetchImperialPositions,
  fetchImperialRoute,
  fetchImperialStatus,
  getVenueLabel,
  toNumber,
  type ImperialDepthLevel,
  type ImperialFundingEntry,
  type ImperialMarkPrice,
  type ImperialOrder,
  type ImperialPosition,
  type ImperialRouteSide,
} from "@/lib/imperial";
import {
  fetchPhoenixMarkets,
  sortedActiveMarkets,
  usePhoenixAllMids,
  usePhoenixOrderbook,
  usePhoenixTraderStateWs,
} from "@/lib/phoenix";
import { cn } from "@/lib/utils";

const DESK_SYMBOLS = ["SOL", "BTC", "ETH", "XAU"] as const;
const PROFILES = [0, 1, 2, 3, 4, 5] as const;

type DeskSymbol = (typeof DESK_SYMBOLS)[number];
type OrderAction = "increase" | "decrease";
type OrderType = "market" | "limit";
type DeskTab = "routing" | "account" | "risk";

function formatUsd(value: unknown, digits = 2) {
  const numberValue = toNumber(value);
  if (numberValue == null) return "—";
  return `$${numberValue.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatCompactUsd(value: unknown) {
  const numberValue = toNumber(value);
  if (numberValue == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(numberValue);
}

function formatNumber(value: unknown, digits = 2) {
  const numberValue = toNumber(value);
  if (numberValue == null) return "—";
  return numberValue.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatPct(value: unknown, digits = 4) {
  const numberValue = toNumber(value);
  if (numberValue == null) return "—";
  return `${numberValue >= 0 ? "+" : ""}${numberValue.toFixed(digits)}%`;
}

function shorten(value: string | null | undefined) {
  if (!value) return "No wallet";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function symbolFromRow(row: Record<string, unknown>) {
  return String(row.symbol ?? row.asset ?? row.marketSymbol ?? row.market ?? "").replace(/-PERP$/i, "").toUpperCase();
}

function priceFromMark(row: ImperialMarkPrice) {
  return toNumber(row.price ?? row.markPrice ?? row.marketPrice ?? row.indexPrice);
}

function getSelectedMark(marks: ImperialMarkPrice[], symbol: DeskSymbol) {
  return marks.find((row) => symbolFromRow(row).includes(symbol) && String(row.venue ?? "phoenix").toLowerCase().includes("phoenix"))
    ?? marks.find((row) => symbolFromRow(row).includes(symbol))
    ?? null;
}

function getFundingValue(row: ImperialFundingEntry) {
  return toNumber(row.longFundingRatePerHourPercent ?? row.longBorrowRatePerHourPercent);
}

function getSelectedFunding(rows: ImperialFundingEntry[], symbol: DeskSymbol) {
  return rows
    .filter((row) => symbolFromRow(row).includes(symbol))
    .sort((a, b) => getVenueLabel(a.venue).localeCompare(getVenueLabel(b.venue)));
}

function findBirdeyeToken(rows: BirdeyePerpsTokenEntry[] | undefined, symbol: DeskSymbol) {
  return rows?.find((row) => row.token?.toUpperCase() === symbol) ?? null;
}

function levelPrice(level: ImperialDepthLevel | undefined) {
  if (!level) return null;
  if (Array.isArray(level)) return toNumber(level[0]);
  return toNumber(level.price);
}

function levelSize(level: ImperialDepthLevel | undefined) {
  if (!level) return null;
  if (Array.isArray(level)) return toNumber(level[1]);
  return toNumber(level.size ?? level.quantity);
}

function readQuoteValue(quote: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!quote) return null;
  for (const key of keys) {
    const value = quote[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        ok ? "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.8)]" : "bg-rose-400",
      )}
    />
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "text-zinc-100",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-h-[72px] rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.08em] text-zinc-500">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-2 truncate text-lg font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-2 border-b-2 px-2 text-[11px] font-mono transition-colors",
        active ? "border-emerald-400 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MarketTile({
  symbol,
  active,
  mark,
  funding,
  crowd,
  onClick,
}: {
  symbol: DeskSymbol;
  active: boolean;
  mark: ImperialMarkPrice | null;
  funding: ImperialFundingEntry | null;
  crowd: BirdeyePerpsTokenEntry | null;
  onClick: () => void;
}) {
  const fundingValue = getFundingValue(funding ?? {});
  const bias = crowd?.bias_text ?? "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[108px] rounded-md border p-3 text-left transition-colors",
        active
          ? "border-emerald-400/70 bg-emerald-400/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">{symbol}-PERP</span>
        <Badge
          variant="outline"
          className={cn(
            "h-5 border-white/10 px-1.5 text-[9px]",
            active ? "text-emerald-200" : "text-zinc-500",
          )}
        >
          Phoenix
        </Badge>
      </div>
      <div className="mt-3 text-xl font-semibold tabular-nums text-zinc-50">{formatUsd(priceFromMark(mark ?? {}), 2)}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="min-w-0">
          <div className="text-zinc-600">Funding</div>
          <div className={cn("truncate", (fundingValue ?? 0) >= 0 ? "text-amber-200" : "text-cyan-200")}>
            {fundingValue == null ? "—" : formatPct(fundingValue)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-zinc-600">Crowd</div>
          <div className="truncate text-zinc-300">{bias}</div>
        </div>
      </div>
    </button>
  );
}

function MiniOrderbook({
  bids,
  asks,
}: {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}) {
  const topBids = bids.slice(0, 6);
  const topAsks = asks.slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.08em] text-emerald-300">
          <ArrowUp className="h-3.5 w-3.5" />
          Bids
        </div>
        <div className="space-y-1">
          {topBids.length ? topBids.map((level, index) => (
            <div key={`bid-${index}`} className="grid grid-cols-2 rounded bg-emerald-500/[0.06] px-2 py-1 text-[11px] font-mono">
              <span className="truncate text-emerald-200">{formatUsd(level[0], 2)}</span>
              <span className="truncate text-right text-zinc-400">{formatNumber(level[1], 4)}</span>
            </div>
          )) : (
            <div className="rounded border border-dashed border-white/10 px-2 py-5 text-center text-[11px] text-zinc-500">No bids</div>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.08em] text-rose-300">
          <ArrowDown className="h-3.5 w-3.5" />
          Asks
        </div>
        <div className="space-y-1">
          {topAsks.length ? topAsks.map((level, index) => (
            <div key={`ask-${index}`} className="grid grid-cols-2 rounded bg-rose-500/[0.06] px-2 py-1 text-[11px] font-mono">
              <span className="truncate text-rose-200">{formatUsd(level[0], 2)}</span>
              <span className="truncate text-right text-zinc-400">{formatNumber(level[1], 4)}</span>
            </div>
          )) : (
            <div className="rounded border border-dashed border-white/10 px-2 py-5 text-center text-[11px] text-zinc-500">No asks</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PositionRows({ positions }: { positions: ImperialPosition[] }) {
  if (!positions.length) {
    return (
      <div className="rounded-md border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-500">
        No Imperial positions returned for this wallet/profile.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-[11px] font-mono">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-2 font-medium">Market</th>
            <th className="py-2 font-medium">Side</th>
            <th className="py-2 font-medium">Size</th>
            <th className="py-2 font-medium">Entry</th>
            <th className="py-2 font-medium">Mark</th>
            <th className="py-2 text-right font-medium">PnL</th>
          </tr>
        </thead>
        <tbody>
          {positions.slice(0, 10).map((position, index) => (
            <tr key={`${position.symbol ?? "position"}-${index}`} className="border-t border-white/5">
              <td className="py-2 text-white">{String(position.symbol ?? position.market ?? "—")}</td>
              <td className="py-2 text-zinc-300">{String(position.side ?? "—")}</td>
              <td className="py-2 text-zinc-300">{formatCompactUsd(position.sizeUsd ?? position.positionValue)}</td>
              <td className="py-2 text-zinc-400">{formatUsd(position.entryPrice, 2)}</td>
              <td className="py-2 text-zinc-400">{formatUsd(position.markPrice, 2)}</td>
              <td className="py-2 text-right text-zinc-200">{formatUsd(position.unrealizedPnl, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderRows({ orders }: { orders: ImperialOrder[] }) {
  if (!orders.length) {
    return (
      <div className="rounded-md border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-500">
        No open Imperial orders returned.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-[11px] font-mono">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-2 font-medium">Market</th>
            <th className="py-2 font-medium">Venue</th>
            <th className="py-2 font-medium">Side</th>
            <th className="py-2 font-medium">Type</th>
            <th className="py-2 font-medium">Size</th>
            <th className="py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.slice(0, 10).map((order, index) => (
            <tr key={`${order.symbol ?? "order"}-${index}`} className="border-t border-white/5">
              <td className="py-2 text-white">{String(order.symbol ?? order.market ?? "—")}</td>
              <td className="py-2 text-zinc-300">{getVenueLabel(order.underwriter)}</td>
              <td className="py-2 text-zinc-300">{String(order.side ?? "—")}</td>
              <td className="py-2 text-zinc-400">{String(order.orderType ?? "—")}</td>
              <td className="py-2 text-zinc-400">{formatCompactUsd(order.sizeUsd)}</td>
              <td className="py-2 text-right text-zinc-200">{String(order.status ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImperialDeskPage() {
  const { connected, publicKey } = useWallet();
  const authority = publicKey?.toBase58() ?? null;
  const [symbol, setSymbol] = useState<DeskSymbol>("SOL");
  const [side, setSide] = useState<ImperialRouteSide>("long");
  const [action, setAction] = useState<OrderAction>("increase");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [notional, setNotional] = useState("1000");
  const [leverage, setLeverage] = useState("3");
  const [limitPrice, setLimitPrice] = useState("");
  const [profileIndex, setProfileIndex] = useState(0);
  const [phoenixNative, setPhoenixNative] = useState(false);
  const [activeTab, setActiveTab] = useState<DeskTab>("routing");
  const [copied, setCopied] = useState(false);

  const notionalNumber = Number(notional);
  const effectiveNotional = Number.isFinite(notionalNumber) && notionalNumber > 0 ? notionalNumber : 0;
  const leverageNumber = Number(leverage);
  const effectiveLeverage = Number.isFinite(leverageNumber) && leverageNumber > 0 ? leverageNumber : 1;
  const phoenixWsSymbol = symbol === "XAU" ? "GOLD-PERP" : `${symbol}-PERP`;

  const statusQuery = useQuery({
    queryKey: ["imperial-status"],
    queryFn: fetchImperialStatus,
    refetchInterval: 15_000,
  });
  const fundingQuery = useQuery({
    queryKey: ["imperial-funding-rates"],
    queryFn: fetchImperialFundingRates,
    refetchInterval: 12_000,
  });
  const marksQuery = useQuery({
    queryKey: ["imperial-mark-prices"],
    queryFn: fetchImperialMarkPrices,
    refetchInterval: 8_000,
  });
  const routeQuery = useQuery({
    queryKey: ["imperial-route", symbol, side, effectiveNotional, effectiveLeverage],
    queryFn: () => fetchImperialRoute({ asset: symbol, side, notional: effectiveNotional, desiredLeverage: effectiveLeverage }),
    enabled: effectiveNotional > 0,
    refetchInterval: 7_500,
  });
  const imperialDepthQuery = useQuery({
    queryKey: ["imperial-phoenix-depth", symbol],
    queryFn: () => fetchImperialPhoenixDepth(symbol === "XAU" ? "GOLD" : symbol),
    refetchInterval: 5_000,
  });
  const phoenixMarketsQuery = useQuery({
    queryKey: ["desk-phoenix-markets"],
    queryFn: fetchPhoenixMarkets,
    refetchInterval: 30_000,
  });
  const birdeyeTokensQuery = useQuery({
    queryKey: ["desk-birdeye-perps-token-list"],
    queryFn: () => fetchPerpsTokenList({ limit: 20, sort_by: "open_interest", sort_type: "desc" }),
    refetchInterval: 30_000,
  });
  const birdeyeOverviewQuery = useQuery({
    queryKey: ["desk-birdeye-perps-overview", symbol],
    queryFn: () => fetchPerpsTokenOverview(symbol),
    refetchInterval: 30_000,
    retry: 1,
  });
  const positionsQuery = useQuery({
    queryKey: ["imperial-positions", authority, profileIndex],
    queryFn: () => fetchImperialPositions({ wallet: authority, profileIndex }),
    enabled: Boolean(authority),
    refetchInterval: 10_000,
    retry: 1,
  });
  const ordersQuery = useQuery({
    queryKey: ["imperial-orders", authority, profileIndex],
    queryFn: () => fetchImperialOrders({ wallet: authority, profileIndex }),
    enabled: Boolean(authority),
    refetchInterval: 10_000,
    retry: 1,
  });

  const mids = usePhoenixAllMids();
  const phoenixBook = usePhoenixOrderbook(phoenixWsSymbol);
  const phoenixTrader = usePhoenixTraderStateWs(authority, 0);

  const marks = marksQuery.data ?? [];
  const fundingRows = fundingQuery.data ?? [];
  const birdeyeTokens = birdeyeTokensQuery.data ?? [];
  const selectedMark = getSelectedMark(marks, symbol);
  const selectedPrice =
    priceFromMark(selectedMark ?? {}) ??
    toNumber(mids[phoenixWsSymbol] ?? mids[symbol]) ??
    phoenixBook.mid ??
    null;
  const selectedFunding = getSelectedFunding(fundingRows, symbol);
  const phoenixFunding = selectedFunding.find((row) => getVenueLabel(row.venue).toLowerCase() === "phoenix")
    ?? selectedFunding[0]
    ?? null;
  const crowd = findBirdeyeToken(birdeyeTokens, symbol);
  const phoenixMarkets = phoenixMarketsQuery.data ? sortedActiveMarkets(phoenixMarketsQuery.data) : [];
  const phoenixMarket = phoenixMarkets.find((market) => market.symbol === symbol) ?? null;
  const imperialDepth = imperialDepthQuery.data?.[0] ?? null;
  const imperialBestBid = levelPrice(imperialDepth?.bids?.[0]);
  const imperialBestAsk = levelPrice(imperialDepth?.asks?.[0]);
  const imperialDepthSize = levelSize(imperialDepth?.bids?.[0]) ?? levelSize(imperialDepth?.asks?.[0]);
  const routeQuote = routeQuery.data;
  const routeVenue = getVenueLabel(
    readQuoteValue(routeQuote, ["underwriter", "recommendedUnderwriter", "venue", "bestVenue"]) ?? 2,
  );
  const routeCost = readQuoteValue(routeQuote, ["expectedCostUsd", "estimatedCost", "costUsd", "feeUsd", "totalFeeUsd", "fee"]);
  const routeSlippage = readQuoteValue(routeQuote, ["slippageBps", "estimatedSlippageBps", "priceImpactBps", "priceImpact"]);
  const status = statusQuery.data;
  const rpcOk = Boolean(status?.rpc.ok);
  const upstreamOk = Boolean(status?.upstream.ok);
  const hasServerTradingCredential = Boolean(status?.imperialTradingConfigured);

  const orderPayload = useMemo(() => {
    const price = selectedPrice ?? 0;
    return {
      wallet: authority ?? "<connected-wallet>",
      profileIndex,
      symbol,
      underwriter: 2,
      orderType: orderType === "market" ? 0 : 1,
      side: side === "long" ? 0 : 1,
      action: action === "increase" ? 0 : 1,
      desiredLeverage: effectiveLeverage,
      sizeUsd: Math.round(effectiveNotional * 1_000_000),
      marketPrice: orderType === "market" ? Math.round(price * 1_000_000) : 0,
      triggerPrice: orderType === "limit" && Number(limitPrice) > 0 ? Math.round(Number(limitPrice) * 1_000_000_000) : undefined,
      phoenixNative: orderType === "limit" && phoenixNative ? true : undefined,
    };
  }, [action, authority, effectiveLeverage, effectiveNotional, limitPrice, orderType, phoenixNative, profileIndex, selectedPrice, side, symbol]);

  const copyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(orderPayload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] w-full text-zinc-100">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#080b10] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <div className="border-b border-white/10 bg-[#0d1118] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">Imperial Desk</h1>
                <Badge variant="outline" className="border-emerald-400/30 text-emerald-200">Phoenix default</Badge>
                <Badge variant="outline" className="border-cyan-400/25 text-cyan-200">Birdeye</Badge>
                <Badge variant="outline" className="border-amber-400/25 text-amber-200">RPC routed</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot ok={upstreamOk} />
                  Imperial {statusQuery.isLoading ? "checking" : upstreamOk ? "online" : "degraded"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot ok={rpcOk} />
                  RPC {status?.rpc.provider ?? "checking"} {status?.rpc.slot ? `slot ${status.rpc.slot.toLocaleString()}` : ""}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot ok={connected} />
                  {shorten(authority)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-white/10 bg-white/[0.03] px-2 text-[11px] text-zinc-300 hover:bg-white/10"
                onClick={() => {
                  void statusQuery.refetch();
                  void fundingQuery.refetch();
                  void marksQuery.refetch();
                  void routeQuery.refetch();
                  void imperialDepthQuery.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
              <WalletMultiButton className="!h-8 !rounded-md !bg-emerald-600 !px-3 !text-xs hover:!bg-emerald-500" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1.35fr)_390px]">
          <main className="min-w-0 space-y-3">
            <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {DESK_SYMBOLS.map((marketSymbol) => (
                <MarketTile
                  key={marketSymbol}
                  symbol={marketSymbol}
                  active={symbol === marketSymbol}
                  mark={getSelectedMark(marks, marketSymbol)}
                  funding={getSelectedFunding(fundingRows, marketSymbol)[0] ?? null}
                  crowd={findBirdeyeToken(birdeyeTokens, marketSymbol)}
                  onClick={() => setSymbol(marketSymbol)}
                />
              ))}
            </section>

            <section className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <RouteIcon className="h-4 w-4 text-emerald-300" />
                    Route
                  </div>
                  {routeQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Metric icon={<Zap className="h-3.5 w-3.5" />} label="Venue" value={routeVenue} tone={routeVenue === "Phoenix" ? "text-emerald-200" : "text-amber-200"} />
                  <Metric icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Cost" value={formatUsd(routeCost, 4)} />
                  <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="Slippage" value={routeSlippage == null ? "—" : `${formatNumber(routeSlippage, 2)} bps`} />
                </div>
                <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-3">
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono sm:grid-cols-5">
                    <div>
                      <div className="text-zinc-600">Asset</div>
                      <div className="mt-1 text-white">{symbol}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600">Side</div>
                      <div className={cn("mt-1", side === "long" ? "text-emerald-200" : "text-rose-200")}>{side.toUpperCase()}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600">Notional</div>
                      <div className="mt-1 text-white">{formatUsd(effectiveNotional, 0)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600">Leverage</div>
                      <div className="mt-1 text-white">{formatNumber(effectiveLeverage, 1)}x</div>
                    </div>
                    <div>
                      <div className="text-zinc-600">Underwriter</div>
                      <div className="mt-1 text-white">2 · Phoenix</div>
                    </div>
                  </div>
                  {routeQuery.isError ? (
                    <div className="mt-3 flex items-start gap-2 rounded border border-amber-400/20 bg-amber-400/10 p-2 text-[11px] text-amber-100">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">Route preview unavailable from Imperial.</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Radio className="h-4 w-4 text-cyan-300" />
                    Phoenix Book
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">{phoenixWsSymbol}</div>
                </div>
                <div className="mb-3 grid gap-2 sm:grid-cols-4">
                  <Metric icon={<BarChart3 className="h-3.5 w-3.5" />} label="Mark" value={formatUsd(selectedPrice, 2)} />
                  <Metric icon={<ArrowUp className="h-3.5 w-3.5" />} label="Imp Bid" value={formatUsd(imperialBestBid, 2)} tone="text-emerald-200" />
                  <Metric icon={<ArrowDown className="h-3.5 w-3.5" />} label="Imp Ask" value={formatUsd(imperialBestAsk, 2)} tone="text-rose-200" />
                  <Metric icon={<Database className="h-3.5 w-3.5" />} label="Imp Size" value={formatNumber(imperialDepthSize, 4)} />
                </div>
                <MiniOrderbook bids={phoenixBook.bids} asks={phoenixBook.asks} />
              </div>
            </section>

            <section className="rounded-md border border-white/10 bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <div className="flex gap-1">
                  <TabButton active={activeTab === "routing"} icon={<RouteIcon className="h-3.5 w-3.5" />} label="Routing" onClick={() => setActiveTab("routing")} />
                  <TabButton active={activeTab === "account"} icon={<Wallet className="h-3.5 w-3.5" />} label="Account" onClick={() => setActiveTab("account")} />
                  <TabButton active={activeTab === "risk"} icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Risk" onClick={() => setActiveTab("risk")} />
                </div>
                <div className="text-[11px] font-mono text-zinc-500">Profile {profileIndex}</div>
              </div>

              {activeTab === "routing" ? (
                <div className="grid gap-3 p-3 lg:grid-cols-2">
                  <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                      <TrendingUp className="h-4 w-4 text-amber-300" />
                      Funding
                    </div>
                    <div className="space-y-2">
                      {selectedFunding.length ? selectedFunding.slice(0, 5).map((row, index) => {
                        const value = getFundingValue(row);
                        return (
                          <div key={`${getVenueLabel(row.venue)}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 rounded border border-white/10 px-3 py-2 text-[11px] font-mono">
                            <span className="truncate text-zinc-300">{getVenueLabel(row.venue)}</span>
                            <span className={cn((value ?? 0) >= 0 ? "text-amber-200" : "text-cyan-200")}>{formatPct(value)}</span>
                          </div>
                        );
                      }) : (
                        <div className="rounded border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-500">No Imperial funding rows for {symbol}.</div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                      <Activity className="h-4 w-4 text-cyan-300" />
                      Birdeye
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Metric icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Open Interest" value={formatCompactUsd(crowd?.open_interest)} />
                      <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="Leverage" value={`${formatNumber(crowd?.leverage, 2)}x`} />
                      <Metric icon={<TrendingUp className="h-3.5 w-3.5" />} label="Long OI" value={formatCompactUsd(crowd?.long_io)} tone="text-emerald-200" />
                      <Metric icon={<TrendingDown className="h-3.5 w-3.5" />} label="Short OI" value={formatCompactUsd(crowd?.short_io)} tone="text-rose-200" />
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "account" ? (
                <div className="grid gap-3 p-3 xl:grid-cols-2">
                  <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Wallet className="h-4 w-4 text-emerald-300" />
                        Positions
                      </div>
                      {positionsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : null}
                    </div>
                    {authority ? <PositionRows positions={positionsQuery.data ?? []} /> : (
                      <div className="rounded-md border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-500">Connect wallet to read Imperial positions.</div>
                    )}
                  </div>
                  <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Activity className="h-4 w-4 text-cyan-300" />
                        Orders
                      </div>
                      {ordersQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : null}
                    </div>
                    {authority ? <OrderRows orders={ordersQuery.data ?? []} /> : (
                      <div className="rounded-md border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-500">Connect wallet to read Imperial orders.</div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === "risk" ? (
                <div className="grid gap-3 p-3 lg:grid-cols-3">
                  <Metric icon={<Wallet className="h-3.5 w-3.5" />} label="Phoenix Collateral" value={formatUsd(phoenixTrader?.collateral, 2)} />
                  <Metric icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Portfolio Value" value={formatUsd(phoenixTrader?.portfolioValue, 2)} />
                  <Metric icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Risk State" value={phoenixTrader?.riskState ?? "—"} />
                  <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Market Status" value={phoenixMarket?.marketStatus ?? "—"} />
                  <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="Max Leverage" value={phoenixMarket?.leverageTiers?.[0]?.maxLeverage ? `${phoenixMarket.leverageTiers[0].maxLeverage}x` : "—"} />
                  <Metric icon={<AlertTriangle className="h-3.5 w-3.5" />} label="1h Liq Bias" value={`${formatCompactUsd(birdeyeOverviewQuery.data?.long_liquidation_1h)} / ${formatCompactUsd(birdeyeOverviewQuery.data?.short_liquidation_1h)}`} />
                </div>
              ) : null}
            </section>
          </main>

          <aside className="min-w-0 space-y-3">
            <section className="rounded-md border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Zap className="h-4 w-4 text-emerald-300" />
                  Order Ticket
                </div>
                <Badge variant="outline" className={cn("border-white/10 text-[10px]", hasServerTradingCredential ? "text-amber-200" : "text-zinc-500")}>
                  {hasServerTradingCredential ? "Credential" : "Preview"}
                </Badge>
              </div>

              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Market</Label>
                    <Select value={symbol} onValueChange={(value) => setSymbol(value as DeskSymbol)}>
                      <SelectTrigger className="h-9 border-white/10 bg-black/40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DESK_SYMBOLS.map((item) => (
                          <SelectItem key={item} value={item}>{item}-PERP</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Profile</Label>
                    <Select value={String(profileIndex)} onValueChange={(value) => setProfileIndex(Number(value))}>
                      <SelectTrigger className="h-9 border-white/10 bg-black/40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROFILES.map((item) => (
                          <SelectItem key={item} value={String(item)}>Profile {item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className={cn("h-9 text-xs", side === "long" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-white/5 hover:bg-white/10")}
                    onClick={() => setSide("long")}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Long
                  </Button>
                  <Button
                    type="button"
                    className={cn("h-9 text-xs", side === "short" ? "bg-rose-600 hover:bg-rose-500" : "bg-white/5 hover:bg-white/10")}
                    onClick={() => setSide("short")}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Short
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Action</Label>
                    <Select value={action} onValueChange={(value) => setAction(value as OrderAction)}>
                      <SelectTrigger className="h-9 border-white/10 bg-black/40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="increase">Increase</SelectItem>
                        <SelectItem value="decrease">Decrease</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Type</Label>
                    <Select value={orderType} onValueChange={(value) => setOrderType(value as OrderType)}>
                      <SelectTrigger className="h-9 border-white/10 bg-black/40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="limit">Limit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Notional USD</Label>
                    <Input
                      value={notional}
                      inputMode="decimal"
                      onChange={(event) => setNotional(event.target.value)}
                      className="h-9 border-white/10 bg-black/40 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Leverage</Label>
                    <Input
                      value={leverage}
                      inputMode="decimal"
                      onChange={(event) => setLeverage(event.target.value)}
                      className="h-9 border-white/10 bg-black/40 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">Limit Price</Label>
                    <Input
                      value={limitPrice}
                      inputMode="decimal"
                      disabled={orderType === "market"}
                      onChange={(event) => setLimitPrice(event.target.value)}
                      placeholder={selectedPrice ? String(selectedPrice.toFixed(2)) : "0.00"}
                      className="h-9 border-white/10 bg-black/40 text-xs disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-zinc-400">Phoenix native maker</div>
                    <div className="truncate text-[10px] font-mono text-zinc-600">Post-only limit path</div>
                  </div>
                  <Switch
                    checked={phoenixNative}
                    disabled={orderType !== "limit" || action !== "increase"}
                    onCheckedChange={setPhoenixNative}
                  />
                </div>

                <div className="rounded-md border border-white/10 bg-black/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-zinc-500">Payload</div>
                    <button
                      type="button"
                      onClick={() => void copyPayload()}
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-200 hover:text-white"
                    >
                      <Clipboard className="h-3.5 w-3.5" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] font-mono">
                    <span className="text-zinc-600">orderType</span><span className="truncate text-right text-zinc-300">{orderPayload.orderType}</span>
                    <span className="text-zinc-600">side</span><span className="truncate text-right text-zinc-300">{orderPayload.side}</span>
                    <span className="text-zinc-600">action</span><span className="truncate text-right text-zinc-300">{orderPayload.action}</span>
                    <span className="text-zinc-600">leverage</span><span className="truncate text-right text-zinc-300">{formatNumber(orderPayload.desiredLeverage, 1)}x</span>
                    <span className="text-zinc-600">sizeUsd</span><span className="truncate text-right text-zinc-300">{orderPayload.sizeUsd.toLocaleString()}</span>
                    <span className="text-zinc-600">marketPrice</span><span className="truncate text-right text-zinc-300">{orderPayload.marketPrice.toLocaleString()}</span>
                    <span className="text-zinc-600">triggerPrice</span><span className="truncate text-right text-zinc-300">{orderPayload.triggerPrice?.toLocaleString() ?? "—"}</span>
                  </div>
                </div>

                <Button
                  type="button"
                  disabled
                  className={cn(
                    "h-10 text-sm",
                    side === "long" ? "bg-emerald-600 disabled:bg-emerald-900/60" : "bg-rose-600 disabled:bg-rose-900/60",
                  )}
                >
                  {hasServerTradingCredential && connected ? "Operator handoff required" : "Imperial JWT exchange required"}
                </Button>

                {!status?.imperialTradingConfigured ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 p-2 text-[11px] text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Server trading credential is not configured. Reads and payload staging stay active.</span>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
