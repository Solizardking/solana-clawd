import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getFeaturedStocks, getSpaceXIpoWatch, getStockAsset, getStocksStatus, searchStocks, type StockRange } from "@/lib/stocks";
import {
  Activity,
  BarChart3,
  Building2,
  CandlestickChart,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileSearch,
  Newspaper,
  RadioTower,
  RefreshCw,
  Rocket,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wifi,
} from "lucide-react";

function readInitialSymbol() {
  if (typeof window === "undefined") return "AAPL";
  return new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase() || "AAPL";
}

function fmtUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 2 : 4,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

function fmtPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmtCompactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function latestValue<T extends { value: number }>(items: T[] | undefined) {
  return items?.length ? items[items.length - 1]?.value : null;
}

function readinessClasses(status: string) {
  switch (status) {
    case "live":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "ready":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
    case "configure":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-200";
  }
}

function pctTextClasses(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "text-cyan-50/55";
  return value >= 0 ? "text-emerald-300" : "text-red-300";
}

function shortFeedId(feedId: string) {
  return `${feedId.slice(0, 10)}…${feedId.slice(-8)}`;
}

function formatPublishTime(timestamp: number | null | undefined) {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAge(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

function formatNyClock(now: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
}

function sessionLabel(session: string) {
  switch (session) {
    case "pre":
      return "Pre-market";
    case "post":
      return "Post-market";
    case "overnight":
      return "Overnight";
    default:
      return "Regular";
  }
}

function sessionClasses(session: string, active = false) {
  const activeGlow = active ? " ring-1 ring-offset-0" : "";
  switch (session) {
    case "pre":
      return `border-sky-500/30 bg-sky-500/10 text-sky-200${activeGlow} ring-sky-400/60`;
    case "post":
      return `border-violet-500/30 bg-violet-500/10 text-violet-200${activeGlow} ring-violet-400/60`;
    case "overnight":
      return `border-amber-500/30 bg-amber-500/10 text-amber-200${activeGlow} ring-amber-400/60`;
    default:
      return `border-emerald-500/30 bg-emerald-500/10 text-emerald-200${activeGlow} ring-emerald-400/60`;
  }
}

function buildSparklinePath(values: number[]) {
  if (values.length < 2) return "";
  const width = 120;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / spread) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

function MiniSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const path = buildSparklinePath(values);
  if (!path) {
    return <div className="h-9 rounded-md bg-white/[0.04]" />;
  }
  return (
    <svg viewBox="0 0 120 36" className="h-9 w-full overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={positive ? "#34d399" : "#f87171"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FeedCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-zinc-300 hover:bg-white/10 hover:text-white"
      onClick={async () => {
        await copyText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function StocksPage() {
  const [selectedSymbol, setSelectedSymbol] = useState(readInitialSymbol);
  const [range, setRange] = useState<StockRange>("1D");
  const [searchInput, setSearchInput] = useState("");
  const [ipoNewsLimit, setIpoNewsLimit] = useState(10);
  const [nyNow, setNyNow] = useState(Date.now());
  const deferredSearch = useDeferredValue(searchInput.trim());

  const statusQuery = useQuery({
    queryKey: ["stocks-status"],
    queryFn: getStocksStatus,
    staleTime: 5 * 60_000,
  });

  const featuredQuery = useQuery({
    queryKey: ["stocks-featured"],
    queryFn: getFeaturedStocks,
    staleTime: 30_000,
  });

  const assetQuery = useQuery({
    queryKey: ["stocks-asset", selectedSymbol, range],
    queryFn: () => getStockAsset(selectedSymbol, range),
    enabled: Boolean(selectedSymbol),
    staleTime: 15_000,
  });

  const spacexIpoQuery = useQuery({
    queryKey: ["stocks-spacex-ipo", ipoNewsLimit],
    queryFn: () => getSpaceXIpoWatch(ipoNewsLimit),
    staleTime: 60_000,
  });

  const searchQuery = useQuery({
    queryKey: ["stocks-search", deferredSearch],
    queryFn: () => searchStocks(deferredSearch),
    enabled: deferredSearch.length >= 1,
    staleTime: 60_000,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNyNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedSymbol && featuredQuery.data?.items?.[0]?.symbol) {
      setSelectedSymbol(featuredQuery.data.items[0].symbol);
    }
  }, [featuredQuery.data?.items, selectedSymbol]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedSymbol) return;
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", selectedSymbol);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedSymbol]);

  const massive = assetQuery.data?.massive;
  const indicatorMaps = {
    sma20: new Map((massive?.indicators.values.sma20 || []).map((point) => [point.time, point.value])),
    sma50: new Map((massive?.indicators.values.sma50 || []).map((point) => [point.time, point.value])),
    ema20: new Map((massive?.indicators.values.ema20 || []).map((point) => [point.time, point.value])),
  };
  const chartRows = (assetQuery.data?.history.points || []).map((point) => ({
    time: point.time,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume ?? null,
    vwap: point.vwap ?? null,
    sma20: indicatorMaps.sma20.get(point.time) ?? null,
    sma50: indicatorMaps.sma50.get(point.time) ?? null,
    ema20: indicatorMaps.ema20.get(point.time) ?? null,
    fullLabel: new Date(point.time * 1000).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: range === "1M" || range === "3M" || range === "1Y" ? undefined : "numeric",
      minute: range === "1M" || range === "3M" || range === "1Y" ? undefined : "2-digit",
    }),
    label:
      range === "1M" || range === "3M" || range === "1Y"
        ? new Date(point.time * 1000).toLocaleDateString([], { month: "short", day: "numeric" })
        : new Date(point.time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  }));

  const selectedActive = assetQuery.data?.active;
  const selectedQuote = selectedActive?.quote;
  const displayPrice = selectedQuote?.price ?? massive?.snapshot?.latestPrice ?? massive?.lastTrade?.price ?? chartRows.at(-1)?.close ?? null;
  const selectedPositive = (assetQuery.data?.changePercent ?? 0) >= 0;
  const searchItems = searchQuery.data?.items || [];
  const spacexIpo = spacexIpoQuery.data;
  const pythSpacexQuote = spacexIpo?.pyth.candidate?.active?.quote;
  const companyNews = spacexIpo?.news.company || [];
  const marketNews = spacexIpo?.news.market || [];
  const filings = spacexIpo?.filings || [];
  const financialDatasetsIssue = spacexIpo?.accessIssues.some((issue) => /401|403|invalid api key|unauthorized/i.test(issue)) || false;
  const latestRsi = latestValue(massive?.indicators.values.rsi14);
  const latestSma20 = latestValue(massive?.indicators.values.sma20);
  const latestSma50 = latestValue(massive?.indicators.values.sma50);

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-6">
      <Card className="overflow-hidden border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(135deg,_rgba(5,10,24,0.96),_rgba(4,8,18,0.88))] text-white">
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">
                  <CandlestickChart className="mr-1 h-3.5 w-3.5" />
                  /stocks
                </Badge>
                <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">
                  <Database className="mr-1 h-3.5 w-3.5" />
                  Pyth Core equities
                </Badge>
                <Badge className="border-sky-400/30 bg-sky-400/10 text-sky-100">
                  <BarChart3 className="mr-1 h-3.5 w-3.5" />
                  Massive OHLC + snapshots
                </Badge>
                <Badge className="border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Feed IDs + indicators
                </Badge>
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                  Stocks
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-cyan-50/75 sm:text-base">
                  A US equities surface combining Pyth session-aware quotes with Massive ticker metadata, snapshots, OHLCV candles,
                  technical indicators, news, and copyable Price Feed IDs for each market phase.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-cyan-50/70">
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-cyan-300" />
                  New York clock: {formatNyClock(nyNow)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5 text-emerald-300" />
                  {statusQuery.data?.usingAuthenticatedHermes ? "Authenticated Hermes" : "Public Hermes fallback"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-sky-300" />
                  {statusQuery.data?.massive?.configured ? "Massive configured" : "Massive key needed"}
                </span>
              </div>
            </div>

            <div className="w-full max-w-xl space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/50" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search AAPL, NVDA, SPY, Apple, Tesla…"
                  className="h-11 border-cyan-400/20 bg-black/30 pl-10 text-white placeholder:text-cyan-50/35"
                />
              </div>

              {deferredSearch.length >= 1 && (
                <div className="rounded-2xl border border-cyan-400/15 bg-black/35 p-2">
                  {searchQuery.isLoading && (
                    <div className="px-3 py-4 text-sm text-cyan-50/60">Searching Pyth equity feeds…</div>
                  )}
                  {!searchQuery.isLoading && searchItems.length === 0 && (
                    <div className="px-3 py-4 text-sm text-cyan-50/60">No matching Pyth equity feeds.</div>
                  )}
                  {!searchQuery.isLoading && searchItems.length > 0 && (
                    <div className="space-y-1">
                      {searchItems.slice(0, 6).map((item) => (
                        <button
                          type="button"
                          key={item.symbol}
                          onClick={() => {
                            startTransition(() => {
                              setSelectedSymbol(item.symbol);
                              setSearchInput("");
                            });
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-white/5"
                        >
                          <div>
                            <div className="font-semibold text-white">{item.symbol}</div>
                            <div className="text-xs text-cyan-50/55">{item.name}</div>
                          </div>
                          <div className="text-right text-[11px] text-cyan-100/55">
                            {item.sessions.map((session) => sessionLabel(session.session)).join(" · ")}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(featuredQuery.data?.items || []).slice(0, 6).map((item) => (
                  <Button
                    key={item.symbol}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-cyan-400/15 bg-black/20 text-cyan-100 hover:bg-cyan-400/10 hover:text-white"
                    onClick={() => startTransition(() => setSelectedSymbol(item.symbol))}
                  >
                    {item.symbol}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-cyan-50/70 hover:bg-white/5 hover:text-white"
                  onClick={() => {
                    featuredQuery.refetch();
                    assetQuery.refetch();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {!statusQuery.data?.apiKeyConfigured && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div>
                  <div className="font-semibold"><code>PYTH_API_KEY</code> is not configured.</div>
                  <div className="mt-1 text-amber-50/75">
                    The page is using <code>https://hermes.pyth.network</code> for now. Pyth’s official cutover date for authenticated Hermes
                    is {statusQuery.data?.upgradeCutoverDate || "2026-07-31"}.
                  </div>
                </div>
              </div>
            </div>
          )}

          {statusQuery.data && !statusQuery.data.massive.configured && (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <div>
                  <div className="font-semibold"><code>MASSIVE_API_KEY</code> is not configured.</div>
                  <div className="mt-1 text-sky-50/75">
                    Pyth quotes still work, but Massive ticker overviews, snapshots, aggregate bars, indicators, and news stay in fallback mode.
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-black/35 text-white">
        <CardHeader className="flex flex-col gap-4 border-b border-white/8 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-sky-400/30 bg-sky-400/10 text-sky-100">
                <Rocket className="mr-1 h-3.5 w-3.5" />
                SpaceX IPO desk
              </Badge>
              <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">
                <FileSearch className="mr-1 h-3.5 w-3.5" />
                SEC + market data ready
              </Badge>
              <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-100">
                <RadioTower className="mr-1 h-3.5 w-3.5" />
                SPCX watch symbol
              </Badge>
            </div>
            <div>
              <CardDescription className="text-cyan-100/55">IPO activation surface</CardDescription>
              <CardTitle className="mt-1 text-2xl font-black sm:text-3xl">
                SpaceX readiness console
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm text-cyan-50/65">
                Tracks the primary watch symbol, Financial Datasets coverage, SEC filings, market news, and public space
                comparables without exposing provider keys in the browser.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[5, 10].map((limit) => (
              <Button
                key={limit}
                type="button"
                size="sm"
                variant={ipoNewsLimit === limit ? "default" : "outline"}
                className={
                  ipoNewsLimit === limit
                    ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
                    : "border-white/10 bg-white/[0.03] text-cyan-50 hover:bg-white/10"
                }
                onClick={() => setIpoNewsLimit(limit)}
              >
                <Newspaper className="h-3.5 w-3.5" />
                {limit} news
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/10 bg-white/[0.03] text-cyan-50 hover:bg-white/10"
              onClick={() => spacexIpoQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh IPO
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-6">
          {spacexIpoQuery.isLoading && (
            <div className="text-sm text-cyan-50/60">Loading SpaceX IPO watch data...</div>
          )}

          {spacexIpoQuery.isError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {(spacexIpoQuery.error as Error)?.message || "Failed to load SpaceX IPO watch."}
            </div>
          )}

          {spacexIpo && (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(320px,0.75fr)]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-50/45">Primary watch</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="text-4xl font-black text-white">{spacexIpo.company.primaryWatchSymbol}</div>
                        <Badge className={readinessClasses(pythSpacexQuote ? "live" : "watching")}>
                          {pythSpacexQuote ? "Pyth live" : "watching"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-cyan-50/65">{spacexIpo.company.statusNote}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-white/10 bg-white/[0.03] text-cyan-50 hover:bg-white/10"
                      onClick={() => startTransition(() => setSelectedSymbol(spacexIpo.company.primaryWatchSymbol))}
                    >
                      <CandlestickChart className="h-3.5 w-3.5" />
                      Probe
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-50/40">Quote</div>
                      <div className="mt-1 text-xl font-bold text-white">{fmtUsd(pythSpacexQuote?.price)}</div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-50/40">FD API</div>
                      <div
                        className={
                          financialDatasetsIssue
                            ? "mt-1 text-xl font-bold text-red-300"
                            : spacexIpo.financialDatasets.configured
                              ? "mt-1 text-xl font-bold text-emerald-300"
                              : "mt-1 text-xl font-bold text-amber-300"
                        }
                      >
                        {financialDatasetsIssue ? "Key issue" : spacexIpo.financialDatasets.configured ? "Ready" : "Key needed"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-50/40">Filings</div>
                      <div className="mt-1 text-xl font-bold text-white">{filings.length}</div>
                    </div>
                  </div>

                  {spacexIpo.accessIssues.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                      <div className="font-semibold">Provider notes</div>
                      <div className="mt-1 space-y-1">
                        {spacexIpo.accessIssues.slice(0, 3).map((issue) => (
                          <div key={issue}>{issue}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-50/45">Readiness</div>
                      <div className="mt-1 text-lg font-bold text-white">Launch checklist</div>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {spacexIpo.readiness.map((item) => (
                      <div key={item.key} className="rounded-xl border border-white/8 bg-black/25 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-white">{item.label}</div>
                          <Badge className={readinessClasses(item.status)}>{item.status}</Badge>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-cyan-50/60">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-50/45">Documentation</div>
                      <div className="mt-1 text-lg font-bold text-white">Financial Datasets index</div>
                    </div>
                    <Database className="h-5 w-5 text-sky-300" />
                  </div>
                  <div className="mt-4 space-y-2">
                    {spacexIpo.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-white/8 bg-black/25 p-3 transition hover:bg-white/[0.05]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-white">{source.label}</div>
                          <ExternalLink className="h-3.5 w-3.5 text-cyan-200/70" />
                        </div>
                        <div className="mt-1 text-xs leading-5 text-cyan-50/55">{source.use}</div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-50/45">News</div>
                      <div className="mt-1 text-lg font-bold text-white">SpaceX and market feed</div>
                    </div>
                    <Newspaper className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/55">Company</div>
                      {(companyNews.length > 0 ? companyNews : marketNews).slice(0, 4).map((item) => (
                        <a
                          key={`${item.title}-${item.publishedAt || item.url || "company"}`}
                          href={item.url || "#"}
                          target={item.url ? "_blank" : undefined}
                          rel={item.url ? "noreferrer" : undefined}
                          className="block rounded-xl border border-white/8 bg-black/25 p-3 transition hover:bg-white/[0.05]"
                        >
                          <div className="line-clamp-2 text-sm font-semibold text-white">{item.title}</div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-cyan-50/50">
                            <span>{item.source || item.ticker || "Financial Datasets"}</span>
                            <span>{formatDateTime(item.publishedAt)}</span>
                          </div>
                        </a>
                      ))}
                      {companyNews.length === 0 && marketNews.length === 0 && (
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-sm text-cyan-50/55">
                          Configure <code>FINANCIAL_DATASETS_API_KEY</code> to activate company and market news.
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/55">Market</div>
                      {marketNews.slice(0, 4).map((item) => (
                        <a
                          key={`${item.title}-${item.publishedAt || item.url || "market"}`}
                          href={item.url || "#"}
                          target={item.url ? "_blank" : undefined}
                          rel={item.url ? "noreferrer" : undefined}
                          className="block rounded-xl border border-white/8 bg-black/25 p-3 transition hover:bg-white/[0.05]"
                        >
                          <div className="line-clamp-2 text-sm font-semibold text-white">{item.title}</div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-cyan-50/50">
                            <span>{item.source || "Market news"}</span>
                            <span>{formatDateTime(item.publishedAt)}</span>
                          </div>
                        </a>
                      ))}
                      {marketNews.length === 0 && companyNews.length > 0 && (
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-sm text-cyan-50/55">
                          Market-wide news returned no rows for this refresh.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-50/45">Comps + filings</div>
                      <div className="mt-1 text-lg font-bold text-white">IPO context board</div>
                    </div>
                    <Building2 className="h-5 w-5 text-emerald-300" />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {spacexIpo.comparables.map((item) => (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => startTransition(() => setSelectedSymbol(item.symbol))}
                        className="rounded-xl border border-white/8 bg-black/25 p-3 text-left transition hover:bg-white/[0.05]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-white">{item.symbol}</div>
                            <div className="mt-0.5 text-xs text-cyan-50/55">{item.name}</div>
                          </div>
                          <div className={`text-xs font-semibold ${pctTextClasses(item.price?.dayChangePercent)}`}>
                            {fmtPct(item.price?.dayChangePercent)}
                          </div>
                        </div>
                        <div className="mt-3 text-lg font-bold text-white">{fmtUsd(item.price?.price)}</div>
                        <div className="mt-1 text-xs text-cyan-50/45">{item.lane}</div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">Latest filings</div>
                      <Clock3 className="h-4 w-4 text-cyan-300" />
                    </div>
                    <div className="mt-3 space-y-2">
                      {filings.slice(0, 3).map((filing) => (
                        <a
                          key={filing.accessionNumber || `${filing.type}-${filing.filingDate}`}
                          href={filing.url || "#"}
                          target={filing.url ? "_blank" : undefined}
                          rel={filing.url ? "noreferrer" : undefined}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm transition hover:bg-white/[0.06]"
                        >
                          <span className="font-semibold text-white">{filing.type || "Filing"}</span>
                          <span className="text-xs text-cyan-50/55">{filing.filingDate || filing.reportDate || "pending"}</span>
                        </a>
                      ))}
                      {filings.length === 0 && (
                        <div className="text-sm text-cyan-50/55">
                          Filing monitor is ready. Records appear here when Financial Datasets returns SEC filings for the watch symbol.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <Card className="border-white/10 bg-black/35 text-white">
          <CardHeader className="flex flex-col gap-3 border-b border-white/8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardDescription className="text-cyan-100/55">Selected equity</CardDescription>
              <CardTitle className="mt-1 flex items-center gap-3 text-3xl font-black">
                {assetQuery.data?.symbol || selectedSymbol}
                {selectedActive && (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${sessionClasses(selectedActive.session, true)}`}>
                    {sessionLabel(selectedActive.session)}
                  </span>
                )}
              </CardTitle>
              <div className="mt-2 text-sm text-cyan-50/65">
                {assetQuery.data?.name || "Loading…"}
                {assetQuery.data?.description && assetQuery.data.description !== assetQuery.data.name ? ` · ${assetQuery.data.description}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["1D", "5D", "1M", "3M", "1Y"] as StockRange[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={range === value ? "default" : "outline"}
                  size="sm"
                  className={
                    range === value
                      ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                      : "border-white/10 bg-white/[0.03] text-cyan-50 hover:bg-white/10"
                  }
                  onClick={() => setRange(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-6">
            {assetQuery.isLoading && <div className="text-sm text-cyan-50/60">Loading Pyth quote, Massive snapshot, and chart…</div>}
            {assetQuery.isError && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {(assetQuery.error as Error)?.message || "Failed to load stock data."}
              </div>
            )}

            {!assetQuery.isLoading && assetQuery.data && (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:col-span-2">
                    <div className="text-xs uppercase tracking-[0.24em] text-cyan-50/45">Live price</div>
                    <div className="mt-2 text-4xl font-black text-white">{fmtUsd(displayPrice)}</div>
                    <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedPositive ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-200"}`}>
                      {fmtPct(assetQuery.data.changePercent)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-cyan-50/45">Confidence</div>
                    <div className="mt-2 text-xl font-bold text-white">{fmtUsd(selectedQuote?.confidence)}</div>
                    <div className="mt-1 text-xs text-cyan-50/55">
                      {selectedQuote?.confidencePercent != null ? `${selectedQuote.confidencePercent.toFixed(3)}% of price` : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-cyan-50/45">Chart source</div>
                    <div className="mt-2 text-xl font-bold text-white">{assetQuery.data.history.source || "pyth"}</div>
                    <div className="mt-1 text-xs text-cyan-50/55">
                      {assetQuery.data.history.resolution} · {assetQuery.data.history.points.length} bars
                    </div>
                  </div>
                </div>

                <div className="h-[340px] rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4">
                  {chartRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartRows} margin={{ left: 0, right: 10, top: 16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="stocksChartFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor={selectedPositive ? "#22d3ee" : "#fb7185"} stopOpacity={0.45} />
                            <stop offset="95%" stopColor={selectedPositive ? "#22d3ee" : "#fb7185"} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={28}
                        />
                        <YAxis
                          yAxisId="price"
                          tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={80}
                          domain={["auto", "auto"]}
                          tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
                        />
                        <YAxis
                          yAxisId="volume"
                          orientation="right"
                          hide
                          domain={[0, "dataMax"]}
                        />
                        <Tooltip
                          cursor={{ stroke: "rgba(255,255,255,0.18)" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload as {
                              fullLabel: string;
                              open: number;
                              high: number;
                              low: number;
                              close: number;
                              volume: number | null;
                              vwap: number | null;
                              sma20: number | null;
                              ema20: number | null;
                            };
                            return (
                              <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-sm text-white shadow-2xl">
                                <div className="font-semibold">{fmtUsd(row.close)}</div>
                                <div className="text-xs text-cyan-50/55">{row.fullLabel}</div>
                                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-cyan-50/70">
                                  <span>O {fmtUsd(row.open)}</span>
                                  <span>H {fmtUsd(row.high)}</span>
                                  <span>L {fmtUsd(row.low)}</span>
                                  <span>V {fmtCompactNumber(row.volume)}</span>
                                  {row.vwap != null && <span>VWAP {fmtUsd(row.vwap)}</span>}
                                  {row.sma20 != null && <span>SMA20 {fmtUsd(row.sma20)}</span>}
                                  {row.ema20 != null && <span>EMA20 {fmtUsd(row.ema20)}</span>}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          yAxisId="volume"
                          dataKey="volume"
                          fill="rgba(148,163,184,0.22)"
                          radius={[2, 2, 0, 0]}
                          barSize={range === "1Y" ? 5 : 3}
                        />
                        <Area
                          yAxisId="price"
                          type="monotone"
                          dataKey="close"
                          stroke={selectedPositive ? "#22d3ee" : "#fb7185"}
                          fill="url(#stocksChartFill)"
                          strokeWidth={2.5}
                          dot={false}
                        />
                        {chartRows.some((row) => row.sma20 != null) && (
                          <Line yAxisId="price" type="monotone" dataKey="sma20" stroke="#facc15" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                        )}
                        {chartRows.some((row) => row.ema20 != null) && (
                          <Line yAxisId="price" type="monotone" dataKey="ema20" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="2 5" />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-cyan-50/55">
                      No Pyth or Massive candles were returned for this range.
                    </div>
                  )}
                </div>

                {massive && (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/45">Massive profile</div>
                          <div className="mt-2 text-xl font-black text-white">{massive.details?.name || assetQuery.data.name}</div>
                          <div className="mt-2 line-clamp-4 text-sm leading-6 text-cyan-50/60">
                            {massive.details?.description || "Massive ticker overview did not return a company description for this symbol."}
                          </div>
                        </div>
                        <Badge className={massive.configured ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}>
                          {massive.configured ? "Massive live" : "Massive fallback"}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Market cap</div>
                          <div className="mt-1 font-bold text-white">{fmtCompactUsd(massive.details?.marketCap)}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Exchange</div>
                          <div className="mt-1 font-bold text-white">{massive.details?.primaryExchange || "—"}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Type</div>
                          <div className="mt-1 font-bold text-white">{massive.details?.type || "—"}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Employees</div>
                          <div className="mt-1 font-bold text-white">{fmtCompactNumber(massive.details?.totalEmployees)}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Day range</div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {fmtUsd(massive.snapshot?.day?.low)} - {fmtUsd(massive.snapshot?.day?.high)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Volume</div>
                          <div className="mt-1 text-sm font-semibold text-white">{fmtCompactNumber(massive.snapshot?.volume)}</div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Last trade</div>
                          <div className="mt-1 text-sm font-semibold text-white">{formatDateTime(massive.snapshot?.lastTrade?.timestamp || massive.lastTrade?.timestamp)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/45">Indicators</div>
                            <div className="mt-1 text-lg font-bold text-white">Massive overlays</div>
                          </div>
                          <Activity className="h-5 w-5 text-cyan-300" />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">SMA 20</div>
                            <div className="mt-1 font-bold text-white">{fmtUsd(latestSma20)}</div>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">SMA 50</div>
                            <div className="mt-1 font-bold text-white">{fmtUsd(latestSma50)}</div>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">RSI 14</div>
                            <div className="mt-1 font-bold text-white">{latestRsi == null ? "—" : latestRsi.toFixed(2)}</div>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-50/40">Ticker types</div>
                            <div className="mt-1 font-bold text-white">{fmtCompactNumber(massive.tickerTypes?.count)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/45">Massive news</div>
                            <div className="mt-1 text-lg font-bold text-white">Ticker context</div>
                          </div>
                          <Newspaper className="h-5 w-5 text-sky-300" />
                        </div>
                        <div className="mt-4 space-y-2">
                          {massive.news.slice(0, 3).map((item) => (
                            <a
                              key={`${item.title}-${item.publishedAt || item.url || "massive"}`}
                              href={item.url || "#"}
                              target={item.url ? "_blank" : undefined}
                              rel={item.url ? "noreferrer" : undefined}
                              className="block rounded-xl border border-white/8 bg-black/25 p-3 transition hover:bg-white/[0.05]"
                            >
                              <div className="line-clamp-2 text-sm font-semibold text-white">{item.title}</div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-cyan-50/50">
                                <span>{item.source || "Massive"}</span>
                                <span>{formatDateTime(item.publishedAt)}</span>
                              </div>
                            </a>
                          ))}
                          {massive.news.length === 0 && (
                            <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-sm text-cyan-50/55">
                              Massive news returned no rows for this ticker/range refresh.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {(massive.accessIssues.length > 0 || massive.docs.length > 0) && (
                      <div className="xl:col-span-2 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                          <div className="font-semibold">Provider notes</div>
                          <div className="mt-2 space-y-1 text-xs leading-5 text-amber-50/75">
                            {(massive.accessIssues.length ? massive.accessIssues : ["Massive calls completed without provider issues."]).slice(0, 5).map((issue) => (
                              <div key={issue}>{issue}</div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/45">Massive docs</div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {massive.docs.slice(0, 6).map((doc) => (
                              <a
                                key={doc.url}
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-white/8 bg-black/25 p-3 transition hover:bg-white/[0.05]"
                              >
                                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
                                  <span>{doc.label}</span>
                                  <ExternalLink className="h-3.5 w-3.5 text-cyan-200/70" />
                                </div>
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-cyan-50/55">{doc.use}</div>
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/35 text-white">
          <CardHeader className="border-b border-white/8">
            <CardDescription className="text-cyan-100/55">Pyth Price Feed IDs</CardDescription>
            <CardTitle className="text-2xl font-black">Session feeds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {assetQuery.data?.sessions?.map((session) => {
              const isActive = session.session === selectedActive?.session;
              return (
                <div
                  key={`${session.session}-${session.feedId}`}
                  className={`rounded-2xl border p-4 ${isActive ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sessionClasses(session.session, isActive)}`}>
                        {sessionLabel(session.session)}
                      </div>
                      <div className="mt-3 font-semibold text-white">{session.displaySymbol}</div>
                      <div className="mt-1 text-xs text-cyan-50/55">{session.ticker}</div>
                    </div>
                    <FeedCopyButton value={session.feedId} />
                  </div>
                  <div className="mt-4 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs text-cyan-100/90">
                    {shortFeedId(session.feedId)}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-cyan-50/55">
                    <span>{session.quote ? fmtUsd(session.quote.price) : "No live quote"}</span>
                    <span>{session.quote ? formatAge(session.quote.ageSeconds) : "—"}</span>
                  </div>
                </div>
              );
            })}

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-cyan-50/65">
              <div className="font-semibold text-white">Routing details</div>
              <div className="mt-2 space-y-2">
                <div>Hermes: <code className="text-cyan-200">{statusQuery.data?.hermesBase || "…"}</code></div>
                <div>Benchmarks: <code className="text-cyan-200">{statusQuery.data?.benchmarksBase || "…"}</code></div>
                <div>Massive: <code className="text-cyan-200">{statusQuery.data?.massive?.base || "…"}</code></div>
                <div>Massive endpoints: <span className="text-cyan-200">{statusQuery.data?.massive?.endpoints?.length ?? 0}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-black/35 text-white">
        <CardHeader className="border-b border-white/8">
          <CardDescription className="text-cyan-100/55">Featured watchlist</CardDescription>
          <CardTitle className="text-2xl font-black">Pyth equity board</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {featuredQuery.isLoading && <div className="text-sm text-cyan-50/60">Loading featured equities…</div>}
          {featuredQuery.data && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {featuredQuery.data.items.map((item) => {
                const positive = (item.changePercent ?? 0) >= 0;
                const active = item.symbol === selectedSymbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => startTransition(() => setSelectedSymbol(item.symbol))}
                    className={`rounded-3xl border p-4 text-left transition ${active ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-2xl font-black text-white">{item.symbol}</div>
                        <div className="mt-1 text-xs text-cyan-50/55">{item.name}</div>
                      </div>
                      {item.active && (
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${sessionClasses(item.active.session)}`}>
                          {sessionLabel(item.active.session)}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 text-2xl font-bold text-white">{fmtUsd(item.active?.quote?.price)}</div>
                    <div className={`mt-1 text-sm font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>
                      {fmtPct(item.changePercent)}
                    </div>
                    <div className="mt-4">
                      <MiniSparkline values={item.sparkline} positive={positive} />
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-cyan-50/50">
                      <span>{item.active?.feedId ? shortFeedId(item.active.feedId) : "No feed id"}</span>
                      <span>{formatAge(item.active?.quote?.ageSeconds)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
