import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  CandlestickChart,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Terminal,
  TrendingUp,
  Wallet,
  Wifi,
} from "lucide-react";
import {
  buildDFlowStreamUrl,
  getDFlowBootstrap,
  getDFlowLiveDataByEvent,
  getDFlowMarketCandlesticks,
  listDFlowOnchainTradesByMarket,
  type DFlowBootstrap,
} from "@/lib/dflow";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CASH_MINT = "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH";

type StreamSnapshot = {
  orderbook?: any;
  trades?: any;
};

type Rail = "USDC" | "CASH";
type TradeSide = "yes" | "no";

function readInitialPredictionParams() {
  const fallback = {
    query: "",
    ticker: null as string | null,
    side: "yes" as TradeSide,
    rail: "USDC" as Rail,
    amount: "5.00",
  };
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const side = (params.get("side") || "").toLowerCase() === "no" ? "no" : fallback.side;
  const rail = (params.get("rail") || "").toUpperCase() === "CASH" ? "CASH" : fallback.rail;

  return {
    query: params.get("q") || params.get("query") || fallback.query,
    ticker: params.get("marketTicker") || params.get("ticker") || fallback.ticker,
    side,
    rail,
    amount: params.get("amount") || fallback.amount,
  };
}

function priceLabel(value: unknown, digits = 4) {
  if (value == null || value === "") return "n/a";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(digits)}`;
}

function centsLabel(value: unknown) {
  if (value == null || value === "") return "n/a";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${Math.round(num * 100)}c`;
}

function compactMoney(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(num);
}

function formatEpoch(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "n/a";
  return new Date(num < 1_000_000_000_000 ? num * 1000 : num).toLocaleString();
}

function timeUntil(value: unknown) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return "n/a";
  const ts = raw < 1_000_000_000_000 ? raw * 1000 : raw;
  const diff = ts - Date.now();
  if (diff <= 0) return "closed";
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, Math.floor(diff / 60_000))}m`;
}

function orderbookEntries(book: Record<string, number> | undefined) {
  return Object.entries(book ?? {}).slice(0, 8);
}

function tradesList(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.trades)) return payload.trades;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function yesProbabilityFromMarket(market: any) {
  const yesBid = Number(market?.yesBid);
  const yesAsk = Number(market?.yesAsk);
  if (Number.isFinite(yesBid) && Number.isFinite(yesAsk)) return (yesBid + yesAsk) / 2;
  if (Number.isFinite(yesAsk)) return yesAsk;
  if (Number.isFinite(yesBid)) return yesBid;
  return null;
}

function statusTone(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "border-emerald-500/50 text-emerald-300";
    case "determined":
    case "finalized":
      return "border-sky-500/50 text-sky-300";
    case "closed":
    case "inactive":
      return "border-orange-500/50 text-orange-300";
    default:
      return "border-zinc-600 text-zinc-300";
  }
}

function getSettlementAccount(market: any, rail: Rail) {
  const key = rail === "CASH" ? CASH_MINT : USDC_MINT;
  return market?.accounts?.[key] ?? null;
}

function buildTradeCommands(market: any, rail: Rail, side: TradeSide, usdAmount: string) {
  const settlement = getSettlementAccount(market, rail);
  const marketLedger = settlement?.marketLedger ?? "<market-ledger>";
  const outcomeMint = side === "yes" ? settlement?.yesMint : settlement?.noMint;
  const atomicAmount = Math.max(0, Math.round((Number(usdAmount) || 0) * 1_000_000));
  const sellAmount = Math.max(1, Math.round((Number(usdAmount) || 1) * 1_000_000));

  return {
    atomicAmount,
    marketLedger,
    outcomeMint,
    quote: `dflow quote ${atomicAmount} ${rail} --market ${marketLedger} --side ${side}`,
    trade: `dflow trade ${atomicAmount} ${rail} --market ${marketLedger} --side ${side}`,
    status: "dflow status <order-address> --poll",
    positions: "dflow positions",
    sell: outcomeMint
      ? `dflow trade ${sellAmount} ${outcomeMint}`
      : "dflow trade <atomic-outcome-amount> <outcome-mint>",
  };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-zinc-400 hover:text-white"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      <Copy className="w-3.5 h-3.5 mr-1" />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function CommandCard({ title, command, note }: { title: string; command: string; note?: string }) {
  return (
    <div className="rounded-xl border border-cyan-500/15 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">{title}</div>
        <CopyButton text={command} />
      </div>
      <code className="block text-sm text-cyan-100 break-all">{command}</code>
      {note && <div className="mt-2 text-xs text-zinc-500">{note}</div>}
    </div>
  );
}

export default function PredictionMarketsPage() {
  const wallet = useWallet();
  const initialParams = useRef(readInitialPredictionParams()).current;
  const [searchQuery, setSearchQuery] = useState(initialParams.query);
  const [activeSearch, setActiveSearch] = useState(initialParams.query);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(initialParams.ticker);
  const [streamState, setStreamState] = useState<Record<string, StreamSnapshot>>({});
  const [streamConnected, setStreamConnected] = useState(false);
  const [tradeSide, setTradeSide] = useState<TradeSide>(initialParams.side);
  const [tradeRail, setTradeRail] = useState<Rail>(initialParams.rail);
  const [tradeAmount, setTradeAmount] = useState(initialParams.amount);

  const bootstrap = useQuery({
    queryKey: ["dflow-bootstrap", activeSearch, wallet.publicKey?.toBase58(), selectedTicker],
    queryFn: () => getDFlowBootstrap({
      q: activeSearch || undefined,
      status: "active",
      sort: "volume24h",
      order: "desc",
      marketLimit: 14,
      hydrateTickers: 4,
      tradeLimit: 20,
      orderbookDepth: 20,
      marketTicker: selectedTicker || undefined,
      walletAddress: wallet.publicKey?.toBase58(),
    }),
    staleTime: 10_000,
  });

  const data = bootstrap.data as DFlowBootstrap | undefined;
  const featuredMarkets = useMemo(() => data?.featuredMarkets ?? [], [data]);

  useEffect(() => {
    if (!selectedTicker && featuredMarkets[0]?.ticker) {
      setSelectedTicker(featuredMarkets[0].ticker);
    }
  }, [featuredMarkets, selectedTicker]);

  useEffect(() => {
    if (!data?.marketDetails) return;
    const next: Record<string, StreamSnapshot> = {};
    for (const [ticker, detail] of Object.entries(data.marketDetails as Record<string, any>)) {
      next[ticker] = {
        orderbook: detail.orderbook,
        trades: detail.trades,
      };
    }
    setStreamState(next);
  }, [data]);

  useEffect(() => {
    if (!selectedTicker) return;
    const es = new EventSource(buildDFlowStreamUrl({
      tickers: [selectedTicker],
      channels: ["orderbook", "trades"],
      walletAddress: wallet.publicKey?.toBase58() ?? null,
    }));

    es.addEventListener("hello", () => setStreamConnected(true));
    es.addEventListener("heartbeat", () => setStreamConnected(true));
    es.addEventListener("orderbook", (event) => {
      const message = JSON.parse((event as MessageEvent).data);
      setStreamConnected(true);
      setStreamState((current) => ({
        ...current,
        [message.ticker]: {
          ...current[message.ticker],
          orderbook: message.payload,
        },
      }));
    });
    es.addEventListener("trades", (event) => {
      const message = JSON.parse((event as MessageEvent).data);
      setStreamConnected(true);
      setStreamState((current) => ({
        ...current,
        [message.ticker]: {
          ...current[message.ticker],
          trades: message.payload,
        },
      }));
    });

    es.onerror = () => setStreamConnected(false);

    return () => {
      es.close();
      setStreamConnected(false);
    };
  }, [selectedTicker, wallet.publicKey]);

  const selectedMarket = useMemo(() => {
    if (!selectedTicker) return null;
    return data?.marketDetails?.[selectedTicker]?.market
      ?? featuredMarkets.find((market: any) => market?.ticker === selectedTicker)
      ?? null;
  }, [data, featuredMarkets, selectedTicker]);

  const selectedLive = selectedTicker ? streamState[selectedTicker] : undefined;
  const selectedTrades = tradesList(selectedLive?.trades);
  const yesBids = orderbookEntries(selectedLive?.orderbook?.yes_bids);
  const noBids = orderbookEntries(selectedLive?.orderbook?.no_bids);

  const onchainTradesQuery = useQuery({
    queryKey: ["dflow-onchain-trades-by-market", selectedTicker],
    queryFn: () => listDFlowOnchainTradesByMarket(selectedTicker!, { limit: 12 }),
    enabled: !!selectedTicker,
    staleTime: 10_000,
  });

  const candlesQuery = useQuery({
    queryKey: ["dflow-candles-market", selectedTicker],
    queryFn: () => getDFlowMarketCandlesticks(selectedTicker!, { periodInterval: 60, startTs: Math.floor(Date.now() / 1000) - (60 * 60 * 24 * 2), endTs: Math.floor(Date.now() / 1000) }),
    enabled: !!selectedTicker,
    staleTime: 30_000,
  });

  const liveDataQuery = useQuery({
    queryKey: ["dflow-live-data-event", selectedMarket?.eventTicker],
    queryFn: () => getDFlowLiveDataByEvent(selectedMarket?.eventTicker),
    enabled: !!selectedMarket?.eventTicker,
    staleTime: 10_000,
  });

  const selectedProb = yesProbabilityFromMarket(selectedMarket);
  const selectedSettlement = getSettlementAccount(selectedMarket, tradeRail);
  const commands = buildTradeCommands(selectedMarket, tradeRail, tradeSide, tradeAmount);
  const selectedOnchainTrades = Array.isArray((onchainTradesQuery.data as any)?.trades)
    ? (onchainTradesQuery.data as any).trades
    : Array.isArray((onchainTradesQuery.data as any)?.data)
      ? (onchainTradesQuery.data as any).data
      : [];
  const candles = Array.isArray(candlesQuery.data) ? candlesQuery.data : Array.isArray((candlesQuery.data as any)?.candlesticks) ? (candlesQuery.data as any).candlesticks : [];
  const latestCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const candleChange = latestCandle && firstCandle
    ? (((Number(latestCandle.close) - Number(firstCandle.open)) / Math.max(Number(firstCandle.open), 0.0001)) * 100)
    : null;
  const liveRows = Array.isArray(liveDataQuery.data) ? liveDataQuery.data : [];
  const settlementStatus = selectedSettlement?.redemptionStatus ?? "n/a";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300 bg-clip-text text-transparent flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-cyan-400" />
              DFlow Prediction Agents
            </h1>
            <p className="text-sm text-cyan-100/70 mt-1 max-w-3xl">
              Live market snapshots, streamed orderbooks and trades, lifecycle gating, onchain fill analysis, and CLI instructions for agents trading DFlow prediction markets.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={data?.configured ? "border-green-500/60 text-green-400" : "border-yellow-500/60 text-yellow-300"}>
              {data?.configured ? "DFlow configured" : "No DFlow API key"}
            </Badge>
            <Badge variant="outline" className={data?.sharedCache ? "border-blue-500/60 text-blue-300" : "border-zinc-600 text-zinc-300"}>
              shared cache {data?.sharedCache ? "on" : "off"}
            </Badge>
            <Badge variant="outline" className={streamConnected ? "border-emerald-500/60 text-emerald-300" : "border-orange-500/60 text-orange-300"}>
              <Wifi className="w-3 h-3 mr-1" />
              {streamConnected ? "live fanout" : "reconnecting"}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => bootstrap.refetch()} disabled={bootstrap.isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${bootstrap.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(data?.predictionAgents ?? []).map((agent) => (
            <Card
              key={agent.id}
              className="bg-gradient-to-br from-cyan-950/60 via-slate-950 to-emerald-950/60 border-cyan-500/20 cursor-pointer hover:border-cyan-400/50 transition"
              onClick={() => setSelectedTicker(agent.marketTicker)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-cyan-300" />
                    {agent.name}
                  </span>
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-200">
                    {agent.confidence}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-cyan-100 font-medium">{agent.headline}</div>
                <div className="text-zinc-300">{agent.rationale}</div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{agent.signal}</span>
                  <span>{agent.marketTicker}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-gray-900 border-cyan-500/20">
          <CardContent className="p-4 flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Search DFlow events and markets…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setActiveSearch(searchQuery.trim());
              }}
              className="w-full md:w-80 bg-gray-950 border-cyan-500/30"
            />
            <Button size="sm" variant="outline" onClick={() => setActiveSearch(searchQuery.trim())}>
              <Search className="w-3.5 h-3.5 mr-2" />
              Search
            </Button>
            {activeSearch && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setActiveSearch("");
                }}
              >
                Clear
              </Button>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="markets" className="w-full">
          <TabsList className="bg-gray-900 border border-cyan-500/20 flex-wrap h-auto">
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="orderbook">Orderbook</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="trade-cli">Trade CLI</TabsTrigger>
            <TabsTrigger value="agents">Agent Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="markets" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
              <div className="space-y-3">
                {bootstrap.isLoading && (
                  <Card className="bg-gray-900 border-cyan-500/20">
                    <CardContent className="p-6 flex items-center gap-3 text-cyan-300">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading DFlow bootstrap…
                    </CardContent>
                  </Card>
                )}
                {!bootstrap.isLoading && featuredMarkets.map((market: any) => {
                  const prob = yesProbabilityFromMarket(market);
                  return (
                    <Card
                      key={market.ticker}
                      className={`bg-gray-900 border-cyan-500/20 hover:border-cyan-400/40 transition cursor-pointer ${selectedTicker === market.ticker ? "border-cyan-400 bg-cyan-950/20" : ""}`}
                      onClick={() => setSelectedTicker(market.ticker)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-semibold text-white">{market.title || market.ticker}</div>
                            <div className="text-xs text-zinc-400">{market.ticker}</div>
                          </div>
                          <Badge variant="outline" className={statusTone(market.status)}>
                            {market.status || "active"}
                          </Badge>
                        </div>
                        {prob != null && (
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                              <span>YES probability</span>
                              <span>{Math.round(prob * 100)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                                style={{ width: `${Math.max(0, Math.min(prob * 100, 100))}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                          <div>
                            <div className="text-zinc-500">YES ask</div>
                            <div className="text-emerald-300">{centsLabel(market.yesAsk)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">NO ask</div>
                            <div className="text-orange-300">{centsLabel(market.noAsk)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">24h volume</div>
                            <div>{compactMoney(market.volume24hFp ?? market.volume24h ?? market.volumeFp ?? market.volume)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Closes</div>
                            <div>{timeUntil(market.closeTime)}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="bg-gray-900 border-cyan-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-300" />
                    Selected Market
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedMarket && (
                    <div className="text-zinc-400 text-sm">Select a market to inspect live orderbook, recent trades, and DFlow execution rails.</div>
                  )}
                  {selectedMarket && (
                    <>
                      <div>
                        <div className="text-lg font-semibold">{selectedMarket.title || selectedTicker}</div>
                        <div className="text-xs text-zinc-400 mt-1">{selectedTicker}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                          <div className="text-zinc-400">YES bid / ask</div>
                          <div className="mt-1 text-emerald-300">
                            {centsLabel(selectedMarket.yesBid)} / {centsLabel(selectedMarket.yesAsk)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-orange-500/20 bg-orange-950/20 p-3">
                          <div className="text-zinc-400">NO bid / ask</div>
                          <div className="mt-1 text-orange-300">
                            {centsLabel(selectedMarket.noBid)} / {centsLabel(selectedMarket.noAsk)}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-zinc-500">Status</div>
                          <div>{selectedMarket.status || "n/a"}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Redemption</div>
                          <div>{settlementStatus}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Close time</div>
                          <div>{formatEpoch(selectedMarket.closeTime)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Time remaining</div>
                          <div>{timeUntil(selectedMarket.closeTime)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Volume</div>
                          <div>{compactMoney(selectedMarket.volumeFp ?? selectedMarket.volume)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Open interest</div>
                          <div>{compactMoney(selectedMarket.openInterestFp ?? selectedMarket.openInterest)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="rounded-lg border border-cyan-500/10 bg-black/20 p-3 text-sm">
                          <div className="text-zinc-500 mb-1">USDC market ledger</div>
                          <div className="font-mono text-xs text-cyan-200 break-all">{selectedMarket?.accounts?.[USDC_MINT]?.marketLedger || "n/a"}</div>
                        </div>
                        <div className="rounded-lg border border-cyan-500/10 bg-black/20 p-3 text-sm">
                          <div className="text-zinc-500 mb-1">CASH market ledger</div>
                          <div className="font-mono text-xs text-cyan-200 break-all">{selectedMarket?.accounts?.[CASH_MINT]?.marketLedger || "n/a"}</div>
                        </div>
                      </div>
                      {selectedMarket.rulesPrimary && (
                        <div className="rounded-lg border border-cyan-500/10 bg-black/20 p-3 text-sm text-zinc-300">
                          {selectedMarket.rulesPrimary}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orderbook" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-gray-900 border-emerald-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-300">
                    <BookOpen className="w-4 h-4" />
                    YES Bids
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {yesBids.length === 0 && <div className="text-zinc-400">No YES bids loaded yet.</div>}
                  {yesBids.map(([price, size]) => (
                    <div key={`yes-${price}`} className="flex items-center justify-between rounded-md bg-emerald-950/20 border border-emerald-500/10 px-3 py-2">
                      <span className="text-emerald-300">${price}</span>
                      <span>{compactMoney(size)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-gray-900 border-orange-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-300">
                    <BookOpen className="w-4 h-4" />
                    NO Bids
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {noBids.length === 0 && <div className="text-zinc-400">No NO bids loaded yet.</div>}
                  {noBids.map(([price, size]) => (
                    <div key={`no-${price}`} className="flex items-center justify-between rounded-md bg-orange-950/20 border border-orange-500/10 px-3 py-2">
                      <span className="text-orange-300">${price}</span>
                      <span>{compactMoney(size)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trades" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card className="bg-gray-900 border-cyan-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-300" />
                    Live Trade Tape
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedTrades.length === 0 && (
                    <div className="text-sm text-zinc-400">No recent trades loaded for this market.</div>
                  )}
                  {selectedTrades.map((trade: any, idx: number) => (
                    <div key={trade.trade_id || trade.signature || `${trade.market_ticker}-${idx}`} className="flex items-center justify-between rounded-lg border border-cyan-500/10 bg-black/20 px-3 py-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={trade.taker_side === "yes" ? "border-emerald-500/40 text-emerald-300" : "border-orange-500/40 text-orange-300"}>
                            {trade.taker_side || trade.side || "trade"}
                          </Badge>
                          <span className="text-zinc-300">{trade.market_ticker || selectedTicker}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {trade.created_time ? new Date(Number(trade.created_time)).toLocaleString() : trade.timestamp || "n/a"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div>{trade.yes_price_dollars || trade.no_price_dollars || priceLabel(trade.price)}</div>
                        <div className="text-xs text-zinc-500">{compactMoney(trade.count ?? trade.size)}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-sky-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-sky-300" />
                    DFlow Onchain Fills
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {onchainTradesQuery.isLoading && (
                    <div className="text-sm text-zinc-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading onchain fills…
                    </div>
                  )}
                  {!onchainTradesQuery.isLoading && selectedOnchainTrades.length === 0 && (
                    <div className="text-sm text-zinc-400">No onchain fills returned for this market.</div>
                  )}
                  {selectedOnchainTrades.map((trade: any) => (
                    <div key={trade.id || trade.transactionSignature} className="rounded-lg border border-sky-500/10 bg-black/20 px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={trade.side === "yes" ? "border-emerald-500/40 text-emerald-300" : "border-orange-500/40 text-orange-300"}>
                            {trade.side || "fill"}
                          </Badge>
                          <span className="text-zinc-300">{trade.marketTicker || selectedTicker}</span>
                        </div>
                        <div className="text-sky-300">{trade.usdPricePerContract ? `$${Number(trade.usdPricePerContract).toFixed(4)}` : "n/a"}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                        <div>Contracts: {trade.contracts ?? "n/a"}</div>
                        <div>Input: {compactMoney(trade.inputAmount)}</div>
                        <div>Wallet: {trade.wallet ? `${trade.wallet.slice(0, 6)}...${trade.wallet.slice(-4)}` : "n/a"}</div>
                        <div>When: {formatEpoch(trade.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="bg-gray-900 border-cyan-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4 text-cyan-300" />
                    Lifecycle Gate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Market status</span>
                    <Badge variant="outline" className={statusTone(selectedMarket?.status)}>
                      {selectedMarket?.status || "n/a"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Trading allowed</span>
                    <span className={selectedMarket?.status === "active" ? "text-emerald-300" : "text-orange-300"}>
                      {selectedMarket?.status === "active" ? "yes" : "no"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Redemption status</span>
                    <span className={settlementStatus === "open" ? "text-sky-300" : "text-zinc-300"}>
                      {settlementStatus}
                    </span>
                  </div>
                  <div className="rounded-lg border border-cyan-500/10 bg-black/20 p-3 text-zinc-300">
                    Trade when status is <span className="text-emerald-300">active</span>. Redeem when status is <span className="text-sky-300">determined/finalized</span> and redemption is <span className="text-sky-300">open</span>.
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-violet-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CandlestickChart className="w-4 h-4 text-violet-300" />
                    Candle Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {candlesQuery.isLoading && (
                    <div className="text-zinc-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading 1h candles…
                    </div>
                  )}
                  {!candlesQuery.isLoading && !latestCandle && (
                    <div className="text-zinc-400">No candles returned for this market.</div>
                  )}
                  {latestCandle && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-zinc-500">Latest close</div>
                          <div className="text-violet-200">{priceLabel(latestCandle.close)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Range change</div>
                          <div className={candleChange != null && candleChange >= 0 ? "text-emerald-300" : "text-orange-300"}>
                            {candleChange != null ? `${candleChange.toFixed(2)}%` : "n/a"}
                          </div>
                        </div>
                        <div>
                          <div className="text-zinc-500">High / low</div>
                          <div>{priceLabel(latestCandle.high)} / {priceLabel(latestCandle.low)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Last candle</div>
                          <div>{formatEpoch(latestCandle.end_period_ts ?? latestCandle.timestamp)}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-violet-500/10 bg-black/20 p-3 text-zinc-300">
                        48h window using the DFlow market candlesticks endpoint with `periodInterval=60`.
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-emerald-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-300" />
                    Event Live Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {liveDataQuery.isLoading && (
                    <div className="text-zinc-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading event live data…
                    </div>
                  )}
                  {!liveDataQuery.isLoading && liveRows.length === 0 && (
                    <div className="text-zinc-400">No event live-data payload returned.</div>
                  )}
                  {liveRows.slice(0, 4).map((row: any, idx: number) => (
                    <div key={`${row.market_ticker || row.event_ticker || "live"}-${idx}`} className="rounded-lg border border-emerald-500/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-zinc-200">{row.market_ticker || row.event_ticker || "event"}</div>
                        <div className="text-emerald-300">{row.status || row.details?.status || "live"}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                        <div>updated: {row.updated_at || "n/a"}</div>
                        <div>type: {row.type || row.details?.type || "n/a"}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trade-cli" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
              <Card className="bg-gray-900 border-cyan-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-300" />
                    Trade Builder
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-lg border border-cyan-500/10 bg-black/20 p-3">
                    <div className="text-zinc-500 mb-1">Selected market</div>
                    <div className="text-zinc-100">{selectedMarket?.title || selectedTicker || "none"}</div>
                    <div className="text-xs text-zinc-500 mt-1">{selectedTicker || "select a market"}</div>
                  </div>

                  <div>
                    <div className="text-zinc-500 mb-2">Settlement rail</div>
                    <div className="flex gap-2">
                      {(["USDC", "CASH"] as Rail[]).map((rail) => (
                        <Button
                          key={rail}
                          variant={tradeRail === rail ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTradeRail(rail)}
                        >
                          {rail}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-zinc-500 mb-2">Side</div>
                    <div className="flex gap-2">
                      {(["yes", "no"] as TradeSide[]).map((side) => (
                        <Button
                          key={side}
                          variant={tradeSide === side ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTradeSide(side)}
                        >
                          {side.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-zinc-500 mb-2">USD amount</div>
                    <Input
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="bg-gray-950 border-cyan-500/30"
                    />
                    <div className="mt-2 text-xs text-zinc-500">
                      Atomic amount: {commands.atomicAmount.toLocaleString()} (all Kalshi rails use 6 decimals).
                    </div>
                  </div>

                  <div className="rounded-lg border border-cyan-500/10 bg-black/20 p-3">
                    <div className="text-zinc-500 mb-1">Market ledger</div>
                    <div className="font-mono text-xs text-cyan-200 break-all">{commands.marketLedger}</div>
                    <div className="text-zinc-500 mt-3 mb-1">Outcome mint for sell / reduce</div>
                    <div className="font-mono text-xs text-cyan-200 break-all">{commands.outcomeMint || "n/a"}</div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <CommandCard title="Preview quote" command={commands.quote} />
                <CommandCard title="Submit trade" command={commands.trade} note="Prediction-market orders are async. Poll to terminal status after submission." />
                <CommandCard title="Poll status" command={commands.status} note="Replace <order-address> with the order account returned by the trade flow." />
                <CommandCard title="Inspect balances" command={commands.positions} note="Use this before reduce / redeem to find your held outcome mints." />
                <CommandCard title="Reduce or redeem" command={commands.sell} note="Selling outcome tokens back to settlement uses the outcome mint as the input token." />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="agents" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-4">
              <Card className="bg-gray-900 border-cyan-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-300" />
                    Agent Setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-xl border border-cyan-500/15 bg-gradient-to-br from-cyan-950/30 to-slate-950 p-4">
                    <div className="text-lg font-semibold text-cyan-100">Give every agent the DFlow market stack</div>
                    <div className="text-zinc-400 mt-1">
                      Install the CLI, configure the vault, register the model, and add the skills layer so agents can quote, trade, reduce, and monitor markets from the terminal.
                    </div>
                  </div>

                  <CommandCard title="1. Install CLI" command="curl -fsS https://cli.dflow.net | sh" />
                  <CommandCard title="2. Setup vault + API key" command="dflow setup" note="Stores wallet, RPC, and DFlow key locally. Keys never touch the browser." />
                  <CommandCard title="3. Register model" command="dflow agent --model claude-sonnet-4-6" />
                  <CommandCard title="4. Verify wallet" command="dflow whoami" />
                  <CommandCard title="5. Install agent skills" command="dflow skills install" note="Recommended so coding agents learn the CLI surface and market workflows." />
                  <CommandCard title="6. Update skills" command="dflow skills update" />
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-emerald-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    Operational Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-lg border border-emerald-500/10 bg-black/20 p-4">
                    <div className="font-medium text-white mb-2">Prediction market workflow</div>
                    <ul className="space-y-2 text-zinc-300">
                      <li>Use `/order` or `dflow trade` for Kalshi YES/NO trades. `/quote` is legacy for new integrations.</li>
                      <li>Buys use settlement input (`USDC` or `CASH`) plus `--market &lt;market-ledger&gt; --side yes|no`.</li>
                      <li>Sells and redeems use the outcome mint as input: `dflow trade &lt;atomic-outcome-amount&gt; &lt;outcome-mint&gt;`.</li>
                      <li>Prediction-market orders are async; always poll status after submit.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-sky-500/10 bg-black/20 p-4">
                    <div className="font-medium text-white mb-2">Guardrails</div>
                    <div className="space-y-2">
                      <CommandCard title="Single-trade cap" command="dflow guardrails set max_trade_size_usd 5000000" note="Example: $5 cap in 6-decimal atomic USD units." />
                      <CommandCard title="Daily volume cap" command="dflow guardrails set max_daily_volume_usd 50000000" note="Example: $50 daily cap." />
                      <CommandCard title="Review guardrails" command="dflow guardrails show" />
                    </div>
                  </div>

                  <div className="rounded-lg border border-orange-500/10 bg-black/20 p-4">
                    <div className="font-medium text-white mb-2 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-orange-300" />
                      Key handling
                    </div>
                    <div className="text-zinc-300">
                      Private keys stay local in the DFlow vault. This page only builds commands and shows market metadata; execution remains terminal-side.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {selectedTicker && (
          <div className="flex items-center justify-end">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTicker(featuredMarkets[0]?.ticker ?? null)}>
              Reset focus
              <ArrowUpRight className="w-3.5 h-3.5 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
