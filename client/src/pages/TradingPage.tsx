import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Copy,
  ExternalLink,
  Flame,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { normalizeChartResponse, type NormalizedChartPoint } from "@/lib/tokenChartData";
import { useTradingActivityStream } from "@/hooks/useTradingActivityStream";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

type TradingWindowKey = "1H" | "4H" | "24H" | "7D";

const TRADING_WINDOWS: Record<TradingWindowKey, {
  priceType: string;
  priceSeconds: number;
  priceLimit: number;
  ownershipType: string;
}> = {
  "1H": { priceType: "1m", priceSeconds: 60 * 60, priceLimit: 60, ownershipType: "1m" },
  "4H": { priceType: "5m", priceSeconds: 4 * 60 * 60, priceLimit: 48, ownershipType: "5m" },
  "24H": { priceType: "15m", priceSeconds: 24 * 60 * 60, priceLimit: 96, ownershipType: "15m" },
  "7D": { priceType: "4h", priceSeconds: 7 * 24 * 60 * 60, priceLimit: 42, ownershipType: "1h" },
};

type SearchToken = {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  price?: number;
  priceChange24hPercent?: number | null;
  liquidity?: number | null;
  marketCap?: number | null;
  volume24hUSD?: number | null;
};

type TokenPool = {
  poolId: string;
  market?: string;
  quoteToken?: string;
  bundleId?: string;
  deployer?: string | null;
  createdAt?: number;
  liquidity?: { usd?: number; quote?: number };
  price?: { usd?: number; quote?: number };
  marketCap?: { usd?: number; quote?: number };
  txns?: {
    buys?: number;
    sells?: number;
    total?: number;
    volume?: number;
    volume24h?: number;
  };
};

type RiskWallet = string | {
  wallet?: string;
  address?: string;
  balance?: number;
  percentage?: number;
};

type BundlerWallet = {
  wallet: string;
  initialBalance: number;
  initialPercentage: number;
  balance: number;
  percentage: number;
  bundleTime: number;
};

type RiskEntry = string | {
  name?: string;
  description?: string;
  value?: string;
  level?: string;
  score?: number;
};

type TradingTokenInfo = {
  token: {
    name: string;
    symbol: string;
    mint: string;
    uri?: string;
    image?: string;
    description?: string;
    hasFileMetaData?: boolean;
    strictSocials?: Record<string, string>;
    creation?: {
      creator?: string;
      created_tx?: string;
      created_time?: number;
    };
  };
  pools: TokenPool[];
  events?: Record<string, { priceChangePercentage?: number }>;
  risk?: {
    snipers?: {
      count?: number;
      totalBalance?: number;
      totalPercentage?: number;
      wallets?: RiskWallet[];
    };
    bundlers?: {
      count?: number;
      totalBalance?: number;
      totalPercentage?: number;
      totalInitialBalance?: number;
      totalInitialPercentage?: number;
      wallets?: BundlerWallet[];
    };
    insiders?: {
      count?: number;
      totalBalance?: number;
      totalPercentage?: number;
      wallets?: RiskWallet[];
    };
    top10?: number;
    dev?: {
      percentage?: number;
      amount?: number;
    };
    fees?: Record<string, number>;
    rugged?: boolean;
    risks?: RiskEntry[];
    score?: number;
    jupiterVerified?: boolean;
  };
  buys?: number;
  sells?: number;
  txns?: number;
  holders?: number;
};

type BundlersSnapshot = {
  total: number;
  balance: number;
  percentage: number;
  initialBalance: number;
  initialPercentage: number;
  wallets: BundlerWallet[];
};

type OwnershipChartResponse = {
  items: Array<{
    time: number;
    timestamp: number;
    value: number;
    metric: string;
  }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed: ${response.status}`);
  }
  return data as T;
}

function formatPrice(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  if (value < 0.000001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toPrecision(4)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCompact(value?: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value?: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function formatAddress(value?: string | null, prefix = 6, suffix = 4) {
  if (!value) return "—";
  if (value.length <= prefix + suffix) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}

function formatTimestamp(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "—";
  const millis = value > 10_000_000_000 ? value : value * 1000;
  return new Date(millis).toLocaleString();
}

function normalizeToken(token: any): SearchToken {
  return {
    address: token.address || token.tokenAddress || token.mint || "",
    symbol: token.symbol || "UNKNOWN",
    name: token.name || token.symbol || "Unknown Token",
    logoURI: token.logoURI || token.logo_uri || token.logo || "",
    price: Number(token.price || 0),
    priceChange24hPercent: token.priceChange24hPercent ?? token.price24hChangePercent ?? token.price_change_24h_percent ?? null,
    liquidity: token.liquidity ?? null,
    marketCap: token.marketCap ?? token.marketcap ?? token.market_cap ?? null,
    volume24hUSD: token.volume24hUSD ?? token.v24hUSD ?? null,
  };
}

function buildPriceQuery(windowKey: TradingWindowKey) {
  const window = TRADING_WINDOWS[windowKey];
  const now = Math.floor(Date.now() / 1000);
  return new URLSearchParams({
    type: window.priceType,
    time_from: String(now - window.priceSeconds),
    time_to: String(now),
    limit: String(window.priceLimit),
  }).toString();
}

function buildOwnershipQuery(windowKey: TradingWindowKey) {
  const window = TRADING_WINDOWS[windowKey];
  const now = Math.floor(Date.now() / 1000);
  return new URLSearchParams({
    type: window.ownershipType,
    time_from: String(now - window.priceSeconds),
    time_to: String(now),
  }).toString();
}

function chartLabel(timestamp: number, windowKey: TradingWindowKey) {
  const date = new Date(timestamp);
  if (windowKey === "7D") {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function mergeOwnershipSeries(
  windowKey: TradingWindowKey,
  series: Partial<Record<"snipers" | "bundlers" | "insiders", OwnershipChartResponse | undefined>>,
) {
  const rows = new Map<number, {
    timestamp: number;
    label: string;
    snipers?: number;
    bundlers?: number;
    insiders?: number;
  }>();

  (Object.entries(series) as Array<["snipers" | "bundlers" | "insiders", OwnershipChartResponse | undefined]>)
    .forEach(([metric, response]) => {
      response?.items?.forEach((item) => {
        const timestamp = Number(item.timestamp);
        if (!Number.isFinite(timestamp)) return;
        const current = rows.get(timestamp) ?? {
          timestamp,
          label: chartLabel(timestamp, windowKey),
        };
        current[metric] = item.value;
        rows.set(timestamp, current);
      });
    });

  return Array.from(rows.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function normalizeRiskEntries(entries?: RiskEntry[]) {
  return (entries ?? []).map((entry) => {
    if (typeof entry === "string") {
      return {
        name: entry,
        description: entry,
        level: "warning",
        score: undefined,
      };
    }
    return {
      name: entry.name || "Risk",
      description: entry.description || entry.name || "Risk signal",
      value: entry.value,
      level: entry.level || "warning",
      score: entry.score,
    };
  });
}

function riskTone(level?: string) {
  switch ((level || "").toLowerCase()) {
    case "danger":
    case "critical":
      return "border-red-500/30 bg-red-950/30 text-red-100";
    case "warning":
      return "border-amber-500/30 bg-amber-950/30 text-amber-100";
    default:
      return "border-emerald-500/30 bg-emerald-950/30 text-emerald-100";
  }
}

function TokenListItem({
  token,
  active,
  onSelect,
}: {
  token: SearchToken;
  active: boolean;
  onSelect: (token: SearchToken) => void;
}) {
  const change = token.priceChange24hPercent ?? 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(token)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(token);
      }}
      className={`flex w-full items-center gap-3 border-b border-white/5 px-3 py-3 text-left transition hover:bg-white/5 ${
        active ? "bg-cyan-500/10" : ""
      }`}
    >
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
        {token.logoURI ? (
          <img src={token.logoURI} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-black text-cyan-200">{token.symbol.slice(0, 2)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{token.symbol}</div>
        <div className="truncate text-xs text-zinc-500">{token.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm text-white">{formatPrice(token.price)}</div>
        <div className={`text-xs ${change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </div>
      </div>
      <div onClick={(event) => event.stopPropagation()}>
        <ClawdTokenAction
          mintAddress={token.address}
          symbol={token.symbol}
          name={token.name}
          logoURI={token.logoURI}
          price={token.price}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  helper,
}: {
  label: string;
  value: string;
  accent: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accent}`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-zinc-500">{helper}</div> : null}
    </div>
  );
}

export default function TradingPage() {
  const [selectedToken, setSelectedToken] = useState<SearchToken | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [windowKey, setWindowKey] = useState<TradingWindowKey>("24H");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    setSelectedToken({
      address: token,
      symbol: formatAddress(token, 4, 4),
      name: "Loading token",
    });
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const tokenAddress = selectedToken?.address ?? null;

  const trendingQuery = useQuery({
    queryKey: ["/api/birdeye/trending"],
    queryFn: () => fetchJson<any>("/api/birdeye/trending"),
    refetchInterval: 30_000,
  });

  const searchQueryResult = useQuery({
    queryKey: ["/api/birdeye/search-tokens", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return null;
      return fetchJson<any>(`/api/birdeye/search-tokens?q=${encodeURIComponent(debouncedQuery)}`);
    },
    enabled: debouncedQuery.length > 0,
  });

  const tokenQuery = useQuery({
    queryKey: ["/api/solana-tracker/token", tokenAddress],
    queryFn: async (): Promise<TradingTokenInfo | null> => {
      if (!tokenAddress) return null;
      return fetchJson<TradingTokenInfo>(`/api/solana-tracker/token/${tokenAddress}`);
    },
    enabled: !!tokenAddress,
    refetchInterval: 15_000,
  });

  const bundlersQuery = useQuery({
    queryKey: ["/api/solana-tracker/bundlers", tokenAddress],
    queryFn: async (): Promise<BundlersSnapshot | null> => {
      if (!tokenAddress) return null;
      return fetchJson<BundlersSnapshot>(`/api/solana-tracker/bundlers/${tokenAddress}`);
    },
    enabled: !!tokenAddress,
    refetchInterval: 30_000,
  });

  const priceChartQuery = useQuery({
    queryKey: ["/api/birdeye/ohlcv", tokenAddress, windowKey],
    queryFn: async (): Promise<NormalizedChartPoint[]> => {
      if (!tokenAddress) return [];
      const response = await fetchJson<any>(`/api/birdeye/ohlcv/${tokenAddress}?${buildPriceQuery(windowKey)}`);
      return normalizeChartResponse(response);
    },
    enabled: !!tokenAddress,
    refetchInterval: 20_000,
  });

  const snipersChartQuery = useQuery({
    queryKey: ["/api/solana-tracker/ownership-chart", "snipers", tokenAddress, windowKey],
    queryFn: async (): Promise<OwnershipChartResponse | undefined> => {
      if (!tokenAddress) return undefined;
      return fetchJson<OwnershipChartResponse>(
        `/api/solana-tracker/ownership-chart/snipers/${tokenAddress}?${buildOwnershipQuery(windowKey)}`,
      );
    },
    enabled: !!tokenAddress,
    refetchInterval: 30_000,
  });

  const bundlersChartQuery = useQuery({
    queryKey: ["/api/solana-tracker/ownership-chart", "bundlers", tokenAddress, windowKey],
    queryFn: async (): Promise<OwnershipChartResponse | undefined> => {
      if (!tokenAddress) return undefined;
      return fetchJson<OwnershipChartResponse>(
        `/api/solana-tracker/ownership-chart/bundlers/${tokenAddress}?${buildOwnershipQuery(windowKey)}`,
      );
    },
    enabled: !!tokenAddress,
    refetchInterval: 30_000,
  });

  const insidersChartQuery = useQuery({
    queryKey: ["/api/solana-tracker/ownership-chart", "insiders", tokenAddress, windowKey],
    queryFn: async (): Promise<OwnershipChartResponse | undefined> => {
      if (!tokenAddress) return undefined;
      return fetchJson<OwnershipChartResponse>(
        `/api/solana-tracker/ownership-chart/insiders/${tokenAddress}?${buildOwnershipQuery(windowKey)}`,
      );
    },
    enabled: !!tokenAddress,
    refetchInterval: 30_000,
  });

  const holdersChartQuery = useQuery({
    queryKey: ["/api/solana-tracker/ownership-chart", "holders", tokenAddress, windowKey],
    queryFn: async (): Promise<OwnershipChartResponse | undefined> => {
      if (!tokenAddress) return undefined;
      return fetchJson<OwnershipChartResponse>(
        `/api/solana-tracker/ownership-chart/holders/${tokenAddress}?${buildOwnershipQuery(windowKey)}`,
      );
    },
    enabled: !!tokenAddress,
    refetchInterval: 30_000,
  });

  const { events: liveEvents, status: liveStatus, lastError: liveError } = useTradingActivityStream(tokenAddress);

  const trendingTokens = useMemo(() => {
    const items = (trendingQuery.data as any)?.data?.tokens || (trendingQuery.data as any)?.data?.items || [];
    return items.slice(0, 20).map(normalizeToken).filter((token: SearchToken) => token.address);
  }, [trendingQuery.data]);

  const searchResults = useMemo(() => {
    const raw = searchQueryResult.data as any;
    const groupedItems = Array.isArray(raw?.data?.items) ? raw.data.items : [];
    const flattened = groupedItems.flatMap((item: any) => Array.isArray(item?.result) ? item.result : item);
    const items = raw?.data?.tokens || raw?.data?.result?.tokens || flattened || [];
    return items.map(normalizeToken).filter((token: SearchToken) => token.address).slice(0, 20);
  }, [searchQueryResult.data]);

  const listTokens = debouncedQuery ? searchResults : trendingTokens;
  const token = tokenQuery.data;
  const primaryPool = useMemo(() => {
    return [...(token?.pools ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;
  }, [token?.pools]);

  const priceSeries = useMemo(() => {
    return (priceChartQuery.data ?? []).map((point) => ({
      timestamp: point.timestamp,
      label: chartLabel(point.timestamp, windowKey),
      price: point.price,
      volume: point.volume,
    }));
  }, [priceChartQuery.data, windowKey]);

  const ownershipSeries = useMemo(() => {
    return mergeOwnershipSeries(windowKey, {
      snipers: snipersChartQuery.data,
      bundlers: bundlersChartQuery.data,
      insiders: insidersChartQuery.data,
    });
  }, [bundlersChartQuery.data, insidersChartQuery.data, snipersChartQuery.data, windowKey]);

  const holdersSeries = useMemo(() => {
    return (holdersChartQuery.data?.items ?? []).map((item) => ({
      timestamp: item.timestamp,
      label: chartLabel(item.timestamp, windowKey),
      holders: item.value,
    }));
  }, [holdersChartQuery.data, windowKey]);

  const bundlersSnapshot = bundlersQuery.data ?? null;
  const riskEntries = useMemo(() => normalizeRiskEntries(token?.risk?.risks), [token?.risk?.risks]);
  const poolRows = useMemo(() => {
    return [...(token?.pools ?? [])]
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      .slice(0, 8);
  }, [token?.pools]);
  const feeRows = useMemo(() => {
    return Object.entries(token?.risk?.fees ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [token?.risk?.fees]);

  const displayedPrice = primaryPool?.price?.usd ?? selectedToken?.price ?? null;
  const priceChange24h = token?.events?.["24h"]?.priceChangePercentage ?? selectedToken?.priceChange24hPercent ?? null;

  const handleSelectToken = (nextToken: SearchToken) => {
    setSelectedToken(nextToken);
    const nextUrl = `${window.location.pathname}?token=${encodeURIComponent(nextToken.address)}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const handleRefresh = async () => {
    await Promise.all([
      trendingQuery.refetch(),
      tokenQuery.refetch(),
      bundlersQuery.refetch(),
      priceChartQuery.refetch(),
      snipersChartQuery.refetch(),
      bundlersChartQuery.refetch(),
      insidersChartQuery.refetch(),
      holdersChartQuery.refetch(),
    ]);
  };

  const copyAddress = async () => {
    if (!tokenAddress) return;
    await navigator.clipboard.writeText(tokenAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#15344a_0%,#081017_28%,#04070c_100%)] text-zinc-100">
      <div className="mx-auto flex max-w-[1580px] flex-col gap-4 px-3 py-4 sm:px-4 lg:py-5">
        <div className="overflow-hidden rounded-[28px] border border-cyan-500/15 bg-black/35 shadow-[0_35px_120px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="border-b border-white/8 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="border-cyan-400/25 bg-cyan-400/10 text-cyan-100">Solana Tracker</Badge>
                  <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-100">Snipers + Bundlers</Badge>
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Trading Intel</h1>
                <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                  Token risk, bundler concentration, sniper flow, insider ownership, holder trend, and live activity on one page.
                </p>
              </div>

              <div className="flex w-full max-w-2xl flex-col gap-3 lg:w-[620px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    placeholder="Search token, symbol, or paste a mint address"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-11 border-white/10 bg-black/35 pl-9 text-white placeholder:text-zinc-500"
                  />
                  {searchQueryResult.isFetching ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-300" />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["1H", "4H", "24H", "7D"] as TradingWindowKey[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setWindowKey(option)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold tracking-[0.2em] transition ${
                        windowKey === option
                          ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                          : "border-white/10 bg-black/20 text-zinc-400 hover:border-cyan-500/20 hover:text-zinc-200"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRefresh()}
                    className="ml-auto border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-[24px] border border-white/8 bg-black/30">
              <div className="border-b border-white/8 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                  {debouncedQuery ? `Search Results${searchResults.length ? ` · ${searchResults.length}` : ""}` : "Trending Tokens"}
                </div>
              </div>
              <div className="max-h-[72vh] overflow-y-auto">
                {trendingQuery.isLoading && !listTokens.length ? (
                  <div className="flex items-center justify-center px-4 py-10 text-sm text-zinc-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading tokens…
                  </div>
                ) : listTokens.length ? (
                  listTokens.map((row: SearchToken) => (
                    <TokenListItem
                      key={row.address}
                      token={row}
                      active={row.address === tokenAddress}
                      onSelect={handleSelectToken}
                    />
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-zinc-500">
                    {debouncedQuery ? `No results for "${debouncedQuery}"` : "No trending tokens right now."}
                  </div>
                )}
              </div>
            </aside>

            <main className="min-w-0">
              {!tokenAddress ? (
                <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[28px] border border-dashed border-cyan-500/20 bg-black/20 px-6 text-center">
                  <BarChart3 className="mb-4 h-16 w-16 text-cyan-400/70" />
                  <h2 className="text-2xl font-black text-white">Pick a token to start</h2>
                  <p className="mt-2 max-w-xl text-sm text-zinc-500">
                    The new trading surface blends Solana Tracker market data with sniper and bundler concentration data, live event flow, and risk context.
                  </p>
                </div>
              ) : tokenQuery.isLoading && !token ? (
                <div className="flex min-h-[60vh] items-center justify-center rounded-[28px] border border-white/8 bg-black/25 text-zinc-400">
                  <Loader2 className="mr-3 h-5 w-5 animate-spin text-cyan-300" />
                  Loading trading intel…
                </div>
              ) : token ? (
                <div className="flex flex-col gap-4">
                  <section className="rounded-[28px] border border-white/8 bg-black/35 p-4 shadow-[0_35px_120px_rgba(0,0,0,0.26)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                          {token.token.image ? (
                            <img src={token.token.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xl font-black text-cyan-200">{token.token.symbol.slice(0, 2)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-2xl font-black text-white">{token.token.name}</h2>
                            <Badge className="border-white/10 bg-white/5 text-zinc-200">{token.token.symbol}</Badge>
                            {token.risk?.jupiterVerified ? (
                              <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-100">Jupiter Verified</Badge>
                            ) : null}
                            {token.risk?.rugged ? (
                              <Badge className="border-red-500/25 bg-red-500/10 text-red-100">Rugged</Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <button
                              type="button"
                              onClick={() => void copyAddress()}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-zinc-300 transition hover:border-cyan-400/20 hover:text-white"
                            >
                              {formatAddress(tokenAddress, 8, 6)}
                              {copied ? <span className="text-emerald-300">✓</span> : <Copy className="h-3 w-3" />}
                            </button>
                            <span>creator {formatAddress(token.token.creation?.creator, 6, 4)}</span>
                            <span>created {formatTimestamp(token.token.creation?.created_time)}</span>
                          </div>
                          {token.token.description ? (
                            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">{token.token.description}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <ClawdTokenAction
                          mintAddress={tokenAddress}
                          symbol={token.token.symbol}
                          name={token.token.name}
                          logoURI={token.token.image}
                          price={displayedPrice}
                          variant="inline"
                        />
                        <a href={`https://solscan.io/token/${tokenAddress}`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm" className="border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Solscan
                          </Button>
                        </a>
                        <a href={`https://birdeye.so/token/${tokenAddress}?chain=solana`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm" className="border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5">
                            <TrendingUp className="mr-2 h-4 w-4" />
                            Birdeye
                          </Button>
                        </a>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard label="Price" value={formatPrice(displayedPrice)} accent="text-cyan-200" />
                      <StatCard
                        label="24H Change"
                        value={priceChange24h == null ? "—" : `${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`}
                        accent={priceChange24h != null && priceChange24h < 0 ? "text-red-300" : "text-emerald-300"}
                      />
                      <StatCard label="Liquidity" value={`$${formatCompact(primaryPool?.liquidity?.usd)}`} accent="text-white" />
                      <StatCard label="Market Cap" value={`$${formatCompact(primaryPool?.marketCap?.usd)}`} accent="text-white" />
                      <StatCard label="Risk Score" value={token.risk?.score != null ? String(token.risk.score) : "—"} accent="text-amber-200" />
                      <StatCard label="Sniper %" value={formatPercent(token.risk?.snipers?.totalPercentage)} accent="text-orange-200" helper={`${token.risk?.snipers?.count ?? 0} wallets`} />
                      <StatCard label="Bundler %" value={formatPercent(bundlersSnapshot?.percentage ?? token.risk?.bundlers?.totalPercentage)} accent="text-fuchsia-200" helper={`${bundlersSnapshot?.total ?? token.risk?.bundlers?.count ?? 0} wallets`} />
                      <StatCard label="Insider %" value={formatPercent(token.risk?.insiders?.totalPercentage)} accent="text-red-200" helper={`${token.risk?.insiders?.count ?? 0} wallets`} />
                    </div>
                  </section>

                  <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Price Action</div>
                          <div className="mt-1 text-lg font-bold text-white">Window {windowKey}</div>
                        </div>
                        <Badge className="border-cyan-400/25 bg-cyan-400/10 text-cyan-100">
                          {TRADING_WINDOWS[windowKey].priceType}
                        </Badge>
                      </div>
                      {priceSeries.length > 1 ? (
                        <ChartContainer
                          config={{ price: { label: "Price", color: "#34d399" } }}
                          className="h-[280px] w-full aspect-auto"
                        >
                          <AreaChart data={priceSeries}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis
                              tickLine={false}
                              axisLine={false}
                              width={90}
                              tickFormatter={(value) => formatPrice(Number(value))}
                            />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(_, payload) => {
                                    const point = payload?.[0]?.payload as { timestamp?: number } | undefined;
                                    return point?.timestamp ? new Date(point.timestamp).toLocaleString() : "";
                                  }}
                                  formatter={(value) => (
                                    <div className="font-mono text-white">{formatPrice(Number(value))}</div>
                                  )}
                                />
                              }
                            />
                            <Area
                              type="monotone"
                              dataKey="price"
                              stroke="var(--color-price)"
                              fill="var(--color-price)"
                              fillOpacity={0.16}
                              strokeWidth={2}
                              dot={false}
                            />
                          </AreaChart>
                        </ChartContainer>
                      ) : (
                        <div className="flex h-[280px] items-center justify-center text-sm text-zinc-500">Not enough price data for this window.</div>
                      )}
                    </div>

                    <div className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Concentration Drift</div>
                          <div className="mt-1 text-lg font-bold text-white">Snipers vs bundlers vs insiders</div>
                        </div>
                        <div className="flex gap-2 text-[11px] text-zinc-500">
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-300" />Snipers</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-fuchsia-300" />Bundlers</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-300" />Insiders</span>
                        </div>
                      </div>
                      {ownershipSeries.length > 1 ? (
                        <ChartContainer
                          config={{
                            snipers: { label: "Snipers", color: "#fbbf24" },
                            bundlers: { label: "Bundlers", color: "#e879f9" },
                            insiders: { label: "Insiders", color: "#f87171" },
                          }}
                          className="h-[280px] w-full aspect-auto"
                        >
                          <LineChart data={ownershipSeries}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis tickLine={false} axisLine={false} width={70} tickFormatter={(value) => `${Number(value).toFixed(1)}%`} />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(_, payload) => {
                                    const point = payload?.[0]?.payload as { timestamp?: number } | undefined;
                                    return point?.timestamp ? new Date(point.timestamp).toLocaleString() : "";
                                  }}
                                />
                              }
                            />
                            <Line type="monotone" dataKey="snipers" stroke="var(--color-snipers)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="bundlers" stroke="var(--color-bundlers)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="insiders" stroke="var(--color-insiders)" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ChartContainer>
                      ) : (
                        <div className="flex h-[280px] items-center justify-center text-sm text-zinc-500">Concentration history is still sparse for this token.</div>
                      )}
                    </div>
                  </section>

                  <section className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Holder Trend</div>
                          <div className="mt-1 text-lg font-bold text-white">Wallet growth</div>
                        </div>
                        <Badge className="border-white/10 bg-white/5 text-zinc-300">
                          {formatCompact(token.holders)} holders
                        </Badge>
                      </div>
                      {holdersSeries.length > 1 ? (
                        <ChartContainer
                          config={{ holders: { label: "Holders", color: "#60a5fa" } }}
                          className="h-[260px] w-full aspect-auto"
                        >
                          <LineChart data={holdersSeries}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis tickLine={false} axisLine={false} width={80} tickFormatter={(value) => formatCompact(Number(value), 1)} />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(_, payload) => {
                                    const point = payload?.[0]?.payload as { timestamp?: number } | undefined;
                                    return point?.timestamp ? new Date(point.timestamp).toLocaleString() : "";
                                  }}
                                />
                              }
                            />
                            <Line type="monotone" dataKey="holders" stroke="var(--color-holders)" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ChartContainer>
                      ) : (
                        <div className="flex h-[260px] items-center justify-center text-sm text-zinc-500">Holder history is unavailable for this window.</div>
                      )}
                    </div>

                    <div className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Live Activity</div>
                          <div className="mt-1 text-lg font-bold text-white">Sniper and bundler stream</div>
                        </div>
                        <Badge
                          className={
                            liveStatus === "live"
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                              : liveStatus === "connecting"
                                ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
                                : "border-red-400/25 bg-red-400/10 text-red-100"
                          }
                        >
                          {liveStatus}
                        </Badge>
                      </div>
                      {liveError ? <div className="mb-3 text-xs text-amber-200">{liveError}</div> : null}
                      <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                        {liveEvents.length ? liveEvents.map((event) => (
                          <div key={event.id} className="rounded-2xl border border-white/8 bg-black/30 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Badge className={event.channel === "sniper" ? "border-amber-400/25 bg-amber-400/10 text-amber-100" : "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100"}>
                                  {event.channel}
                                </Badge>
                                {event.action ? (
                                  <Badge className={event.action === "buy" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-red-400/25 bg-red-400/10 text-red-100"}>
                                    {event.action}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-zinc-500">{formatTimestamp(event.timestamp ?? event.receivedAt)}</div>
                            </div>
                            <div className="mt-2 text-sm font-semibold text-white">{formatAddress(event.wallet, 7, 5)}</div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                              <span>held {formatPercent(event.percentage)}</span>
                              {event.totalSniperPercentage != null ? <span>total snipers {formatPercent(event.totalSniperPercentage)}</span> : null}
                              {event.totalBundlerPercentage != null ? <span>total bundlers {formatPercent(event.totalBundlerPercentage)}</span> : null}
                              {event.boughtPercentage != null ? <span>bought {formatPercent(event.boughtPercentage)}</span> : null}
                            </div>
                          </div>
                        )) : (
                          <div className="flex h-[220px] items-center justify-center text-sm text-zinc-500">
                            Waiting for sniper or bundler flow…
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Bundler Snapshot</div>
                          <div className="mt-1 text-lg font-bold text-white">Top bundled wallets</div>
                        </div>
                        <Badge className="border-white/10 bg-white/5 text-zinc-300">
                          {bundlersSnapshot?.total ?? token.risk?.bundlers?.count ?? 0} wallets
                        </Badge>
                      </div>

                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Current %</div>
                          <div className="mt-2 text-xl font-black text-fuchsia-200">{formatPercent(bundlersSnapshot?.percentage ?? token.risk?.bundlers?.totalPercentage)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Initial %</div>
                          <div className="mt-2 text-xl font-black text-zinc-100">{formatPercent(bundlersSnapshot?.initialPercentage ?? token.risk?.bundlers?.totalInitialPercentage)}</div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/8">
                        <div className="grid grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr] gap-2 border-b border-white/8 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                          <span>Wallet</span>
                          <span className="text-right">Current %</span>
                          <span className="text-right">Bundle Time</span>
                        </div>
                        <div className="max-h-[320px] overflow-y-auto">
                          {(bundlersSnapshot?.wallets ?? []).slice(0, 12).map((wallet) => (
                            <div key={`${wallet.wallet}-${wallet.bundleTime}`} className="grid grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr] gap-2 border-b border-white/5 px-3 py-2 text-sm">
                              <span className="truncate font-medium text-white">{formatAddress(wallet.wallet, 8, 6)}</span>
                              <span className="text-right text-fuchsia-200">{formatPercent(wallet.percentage, 3)}</span>
                              <span className="text-right text-zinc-500">{new Date(wallet.bundleTime).toLocaleDateString()}</span>
                            </div>
                          ))}
                          {!bundlersSnapshot?.wallets?.length ? (
                            <div className="px-4 py-10 text-center text-sm text-zinc-500">No bundler wallets reported for this token.</div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Risk Surface</div>
                          <div className="mt-1 text-lg font-bold text-white">Concentration, dev, and fees</div>
                        </div>
                        <Badge className={token.risk?.rugged ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"}>
                          {token.risk?.rugged ? "High danger" : "Live"}
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <ShieldCheck className="h-4 w-4 text-emerald-300" />
                            Top 10 holders
                          </div>
                          <div className="mt-2 text-2xl font-black text-zinc-100">{formatPercent(token.risk?.top10)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Wallet className="h-4 w-4 text-cyan-300" />
                            Dev holdings
                          </div>
                          <div className="mt-2 text-2xl font-black text-zinc-100">{formatPercent(token.risk?.dev?.percentage)}</div>
                        </div>
                      </div>

                      {riskEntries.length ? (
                        <div className="mt-4 space-y-2">
                          {riskEntries.slice(0, 6).map((risk, index) => (
                            <div key={`${risk.name}-${index}`} className={`rounded-2xl border p-3 ${riskTone(risk.level)}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold">{risk.name}</div>
                                {risk.score != null ? <div className="text-xs uppercase tracking-[0.18em] opacity-80">score {risk.score}</div> : null}
                              </div>
                              <div className="mt-1 text-sm opacity-90">{risk.description}</div>
                              {risk.value ? <div className="mt-2 text-xs uppercase tracking-[0.2em] opacity-80">{risk.value}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                          No explicit risk flags are currently attached to this token.
                        </div>
                      )}

                      {feeRows.length ? (
                        <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                            <Flame className="h-4 w-4 text-orange-300" />
                            Fee sources
                          </div>
                          <div className="space-y-2">
                            {feeRows.map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between text-sm">
                                <span className="text-zinc-400">{label}</span>
                                <span className="font-mono text-zinc-100">{value.toFixed(3)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-white/8 bg-black/35 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Liquidity Map</div>
                        <div className="mt-1 text-lg font-bold text-white">Top pools and bundle fingerprints</div>
                      </div>
                      <Badge className="border-white/10 bg-white/5 text-zinc-300">{poolRows.length} pools</Badge>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/8">
                      <div className="grid grid-cols-[minmax(0,1fr)_0.8fr_0.8fr_0.8fr] gap-2 border-b border-white/8 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        <span>Pool</span>
                        <span className="text-right">Liquidity</span>
                        <span className="text-right">Market</span>
                        <span className="text-right">Bundle</span>
                      </div>
                      <div className="max-h-[320px] overflow-y-auto">
                        {poolRows.map((pool) => (
                          <div key={pool.poolId} className="grid grid-cols-[minmax(0,1fr)_0.8fr_0.8fr_0.8fr] gap-2 border-b border-white/5 px-3 py-3 text-sm">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-white">{formatAddress(pool.poolId, 8, 6)}</div>
                              <div className="truncate text-xs text-zinc-500">deployer {formatAddress(pool.deployer, 6, 4)}</div>
                            </div>
                            <div className="text-right text-zinc-100">${formatCompact(pool.liquidity?.usd)}</div>
                            <div className="text-right text-zinc-400">{pool.market || "—"}</div>
                            <div className="text-right text-xs text-fuchsia-200">{pool.bundleId ? formatAddress(pool.bundleId, 7, 5) : "—"}</div>
                          </div>
                        ))}
                        {!poolRows.length ? (
                          <div className="px-4 py-10 text-center text-sm text-zinc-500">No pools available.</div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="rounded-[28px] border border-red-500/15 bg-red-950/20 p-6 text-sm text-red-100">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Failed to load token intelligence
                  </div>
                  <div className="mt-2 text-red-100/80">{tokenQuery.error instanceof Error ? tokenQuery.error.message : "Unknown error"}</div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
