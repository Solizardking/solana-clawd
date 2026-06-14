import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Brain,
  Layers3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { usePhoenixAllMids, usePhoenixOrderbook } from "@/lib/phoenix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StrategyBias = "long" | "short" | "neutral" | "reduce-risk";

type StrategyAnalysis = {
  provider: "deepseek" | "xai" | "openrouter" | "heuristic";
  model: string;
  bias: StrategyBias;
  confidence: number;
  timeframe: string;
  summary: string;
  thesis: string[];
  tradePlan: {
    entry: string;
    stop: string;
    target: string;
    size: string;
  };
  riskFlags: string[];
  watchList: string[];
};

type StrategyResponse = {
  generatedAt: string;
  symbol: string;
  focus: string;
  builder: {
    configured: boolean;
    authority: string | null;
    portfolioIndex?: number;
    pdaIndex: number;
    subaccountIndex: number;
    traderAccount: string | null;
    riseReady: boolean;
    riseStatus: string;
    riseDetail: string | null;
  };
  market: {
    symbol: string;
    status: string;
    isolatedOnly: boolean;
    tickSize: number | null;
    topLeverage: number | null;
    makerFeePct: number | null;
    takerFeePct: number | null;
    maintenanceMarginPct: number | null;
    fundingPeriodHours: number | null;
    maxFundingRatePct: number | null;
    midPrice: number | null;
    crossMids: Record<string, number>;
    orderbook: {
      bestBid: number | null;
      bestAsk: number | null;
      spreadUsd: number | null;
      spreadBps: number | null;
      bidDepth: number;
      askDepth: number;
      imbalance: number | null;
    };
  };
  matchingEngine?: {
    view: string;
    note: string;
  };
  accounts?: {
    note: string;
    authority: string | null;
    portfolioIndex: number;
  };
  trader: {
    authority: string;
    riskState: string | null;
    collateral: number | null;
    effectiveCollateral: number | null;
    portfolioValue: number | null;
    unrealizedPnl: number | null;
    positionCount: number;
    selectedPosition: {
      symbol: string;
      side: "long" | "short";
      size: number | null;
      entryPrice: number | null;
      liquidationPrice: number | null;
      unrealizedPnl: number | null;
    } | null;
    warnings: string[];
  } | null;
  agent: {
    id: string;
    title: string;
    description: string;
    recommendation: {
      runtime: string;
      provider: string;
      model: string;
    } | null;
    skills: string[];
    project: {
      id: string;
      title: string;
      path: string;
      summary: string;
    } | null;
  } | null;
  ai: {
    deepseekConfigured: boolean;
    openRouterFreeConfigured: boolean;
    xaiConfigured?: boolean;
    errors: Array<{ provider: "deepseek" | "xai" | "openrouter"; model: string; message: string }>;
    analyses: StrategyAnalysis[];
  };
  warnings?: string[];
};

type PhoenixStrategyDeckProps = {
  symbol: string;
  authority: string | null;
  onSelectSymbol?: (symbol: string) => void;
};

const FOCUS_OPTIONS = [
  { id: "intraday", label: "Intraday" },
  { id: "trend", label: "Trend" },
  { id: "risk", label: "Risk" },
] as const;

function fmtUsd(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function fmtCompact(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtPct(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function biasTone(bias: StrategyBias) {
  if (bias === "long") {
    return {
      badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      accent: "text-emerald-300",
    };
  }
  if (bias === "short") {
    return {
      badge: "border-red-500/40 bg-red-500/10 text-red-300",
      accent: "text-red-300",
    };
  }
  if (bias === "reduce-risk") {
    return {
      badge: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
      accent: "text-yellow-300",
    };
  }
  return {
    badge: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
    accent: "text-zinc-300",
  };
}

function providerTone(provider: StrategyAnalysis["provider"]) {
  if (provider === "deepseek") return "border-cyan-500/40 text-cyan-300";
  if (provider === "xai") return "border-fuchsia-500/40 text-fuchsia-300";
  if (provider === "openrouter") return "border-fuchsia-500/40 text-fuchsia-300";
  return "border-zinc-500/40 text-zinc-300";
}

function providerLabel(provider: StrategyAnalysis["provider"]) {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "xai") return "Grok";
  if (provider === "openrouter") return "OpenRouter Free";
  return "Heuristic";
}

function summaryCardClass(ok: boolean) {
  return ok
    ? "border-emerald-500/20 bg-emerald-950/10"
    : "border-yellow-500/20 bg-yellow-950/10";
}

export function PhoenixStrategyDeck({ symbol, authority, onSelectSymbol }: PhoenixStrategyDeckProps) {
  const [focus, setFocus] = useState<(typeof FOCUS_OPTIONS)[number]["id"]>("intraday");
  const mids = usePhoenixAllMids();
  const orderbook = usePhoenixOrderbook(`${symbol}-PERP`);
  const liveMid = mids[`${symbol}-PERP`] ?? mids[symbol] ?? orderbook.mid ?? null;
  const hasLiveSnapshot =
    liveMid != null || orderbook.mid != null || orderbook.bids.length > 0 || orderbook.asks.length > 0;

  const strategyQuery = useQuery({
    queryKey: ["phoenix-strategy", symbol, authority, focus, hasLiveSnapshot ? "ready" : "pending"],
    queryFn: () =>
      apiRequest<StrategyResponse>("POST", "/api/phoenix/strategy", {
        symbol,
        authority,
        focus,
        midPrice: liveMid,
        crossMids: {
          SOL: mids["SOL-PERP"] ?? mids.SOL ?? null,
          BTC: mids["BTC-PERP"] ?? mids.BTC ?? null,
          ETH: mids["ETH-PERP"] ?? mids.ETH ?? null,
        },
        orderbook: {
          mid: orderbook.mid,
          bids: orderbook.bids.slice(0, 5),
          asks: orderbook.asks.slice(0, 5),
        },
      }),
    enabled: Boolean(symbol) && hasLiveSnapshot,
    staleTime: 20_000,
    refetchInterval: hasLiveSnapshot ? 30_000 : false,
    retry: 1,
  });

  const data = strategyQuery.data;
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="overflow-hidden border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.18),_transparent_28%),rgba(6,10,18,0.92)]">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
                  <Brain className="mr-1 h-3 w-3" />
                  Vulcan Strategy Deck
                </Badge>
                <Badge variant="outline" className="border-white/10 text-zinc-300">
                  {symbol}-PERP
                </Badge>
                {data?.market.status ? (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                    {data.market.status}
                  </Badge>
                ) : null}
              </div>
              <CardTitle className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Phoenix command deck for live strategy, builder readiness, and account-aware execution.
              </CardTitle>
              <p className="max-w-2xl text-sm text-zinc-300">
                DeepSeek and OpenRouter Free read the same Phoenix snapshot the panel is trading from, then cross-check
                it against builder health, Vulcan agent context, and the public wallet state when connected.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10"
                onClick={() => strategyQuery.refetch()}
                disabled={strategyQuery.isFetching}
              >
                {strategyQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FOCUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFocus(option.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-mono transition-colors ${
                  focus === option.id
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                {option.label}
              </button>
            ))}
            <Badge variant="outline" className="border-white/10 text-zinc-400">
              {generatedAt ? `Updated ${generatedAt}` : "Waiting for first model read"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Mid</div>
              <div className="mt-1 text-lg font-black text-white">{fmtUsd(data?.market.midPrice ?? liveMid)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Spread</div>
              <div className="mt-1 text-lg font-black text-white">{fmtPct(data?.market.orderbook.spreadBps, 2)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Imbalance</div>
              <div className="mt-1 text-lg font-black text-white">{fmtPct((data?.market.orderbook.imbalance ?? null) != null ? (data?.market.orderbook.imbalance ?? 0) * 100 : null, 1)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Top Lev</div>
              <div className="mt-1 text-lg font-black text-white">
                {data?.market.topLeverage != null ? `${fmtCompact(data.market.topLeverage, 0)}x` : "—"}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {(["SOL", "BTC", "ETH"] as const).map((marketSymbol) => {
              const marketPrice =
                data?.market.crossMids?.[marketSymbol] ??
                mids[`${marketSymbol}-PERP`] ??
                mids[marketSymbol] ??
                null;
              const active = marketSymbol === symbol;
              return (
                <button
                  key={marketSymbol}
                  type="button"
                  onClick={() => onSelectSymbol?.(marketSymbol)}
                  className={`rounded-2xl border p-3 text-left transition-colors ${
                    active
                      ? "border-cyan-400/40 bg-cyan-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                    {marketSymbol}-PERP
                  </div>
                  <div className="mt-1 text-lg font-black text-white">{fmtUsd(marketPrice, marketSymbol === "BTC" ? 0 : 2)}</div>
                </button>
              );
            })}
          </div>

          {!hasLiveSnapshot ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 text-sm text-zinc-400">
              <Activity className="h-4 w-4" />
              Waiting for Phoenix market stream…
            </div>
          ) : strategyQuery.isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building live strategy snapshot…
            </div>
          ) : strategyQuery.error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {(strategyQuery.error as Error).message}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data?.ai.analyses.map((analysis) => {
                const tone = biasTone(analysis.bias);
                return (
                  <div key={`${analysis.provider}-${analysis.model}`} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={providerTone(analysis.provider)}>
                            {providerLabel(analysis.provider)}
                          </Badge>
                          <Badge variant="outline" className={tone.badge}>
                            {analysis.bias}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-zinc-500">{analysis.model}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-black ${tone.accent}`}>{analysis.confidence}%</div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                          {analysis.timeframe}
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-zinc-200">{analysis.summary}</p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Trade plan</div>
                        <div className="mt-2 space-y-1 text-xs text-zinc-200">
                          <div>Entry: {analysis.tradePlan.entry}</div>
                          <div>Stop: {analysis.tradePlan.stop}</div>
                          <div>Target: {analysis.tradePlan.target}</div>
                          <div>Size: {analysis.tradePlan.size}</div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Watch</div>
                        <div className="mt-2 space-y-1 text-xs text-zinc-300">
                          {analysis.watchList.map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Thesis</div>
                        <div className="space-y-1 text-xs text-zinc-300">
                          {analysis.thesis.map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Risk flags</div>
                        <div className="space-y-1 text-xs text-zinc-300">
                          {analysis.riskFlags.map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data?.ai.errors.length ? (
            <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-xs text-yellow-100">
              {data.ai.errors.map((error) => (
                <div key={`${error.provider}-${error.model}`}>
                  {providerLabel(error.provider)} unavailable: {error.message}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className={summaryCardClass(Boolean(data?.builder.riseReady))}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono text-white">
              {data?.builder.riseReady ? <ShieldCheck className="h-4 w-4 text-emerald-300" /> : <ShieldAlert className="h-4 w-4 text-yellow-300" />}
              Flight builder runtime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-200">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Status</span>
              <Badge variant="outline" className={data?.builder.riseReady ? "border-emerald-500/30 text-emerald-300" : "border-yellow-500/30 text-yellow-300"}>
                {data?.builder.riseStatus ?? "unknown"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Portfolio / subaccount</span>
              <span className="font-mono text-xs">
                {data?.builder.portfolioIndex ?? data?.builder.pdaIndex ?? 0} / {data?.builder.subaccountIndex ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Authority</span>
              <span className="font-mono text-xs text-right">
                {data?.builder.authority ? `${data.builder.authority.slice(0, 8)}…${data.builder.authority.slice(-6)}` : "not configured"}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {data?.builder.riseDetail ?? "Rise SDK builder path is resolving cleanly on the server."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/35">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono text-white">
              <Layers3 className="h-4 w-4 text-cyan-300" />
              Matching and accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-200">
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Matching engine</div>
              <p className="mt-2 text-xs text-zinc-300">
                {data?.matchingEngine?.note ?? "Phoenix builds a combined FIFO + spline book before matching."}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Account model</div>
              <p className="mt-2 text-xs text-zinc-300">
                {data?.accounts?.note ?? "Cross uses subaccount_index = 0. Additional subaccounts are isolated."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/35">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono text-white">
              <Bot className="h-4 w-4 text-fuchsia-300" />
              Imported perps agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-200">
            {data?.agent ? (
              <>
                <div>
                  <div className="text-sm font-semibold text-white">{data.agent.title}</div>
                  <p className="mt-1 text-xs text-zinc-400">{data.agent.description}</p>
                </div>
                {data.agent.recommendation ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">
                      <Sparkles className="mr-1 h-3 w-3" />
                      {data.agent.recommendation.provider}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 text-zinc-300">
                      {data.agent.recommendation.model}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 text-zinc-300">
                      {data.agent.recommendation.runtime}
                    </Badge>
                  </div>
                ) : null}
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Vulcan skills</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.agent.skills.slice(0, 8).map((skill) => (
                      <Badge key={skill} variant="outline" className="border-white/10 text-zinc-300">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
                {data.agent.project ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Runtime project</div>
                    <div className="mt-2 text-xs text-zinc-300">{data.agent.project.title}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{data.agent.project.path}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-zinc-400">Imported perps agent metadata unavailable.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/35">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-mono text-white">
              <Wallet className="h-4 w-4 text-amber-300" />
              Wallet-aware context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-200">
            {data?.trader ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Risk state</span>
                  <Badge variant="outline" className={data.trader.riskState === "ok" ? "border-emerald-500/30 text-emerald-300" : "border-yellow-500/30 text-yellow-300"}>
                    {data.trader.riskState ?? "unknown"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Collateral</span>
                  <span>{fmtUsd(data.trader.collateral)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Unrealized PnL</span>
                  <span className={(data.trader.unrealizedPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}>
                    {fmtUsd(data.trader.unrealizedPnl)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Open positions</span>
                  <span>{data.trader.positionCount}</span>
                </div>
                {data.trader.selectedPosition ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                    <div className="font-mono text-zinc-500">Selected market position</div>
                    <div className="mt-2">Side: {data.trader.selectedPosition.side}</div>
                    <div>Entry: {fmtUsd(data.trader.selectedPosition.entryPrice)}</div>
                    <div>Liq: {fmtUsd(data.trader.selectedPosition.liquidationPrice)}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">
                Connect a wallet to layer your public Phoenix trader snapshot into the strategy read.
              </div>
            )}
          </CardContent>
        </Card>

        {data?.warnings?.length ? (
          <Card className="border-yellow-500/20 bg-yellow-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-mono text-white">
                <Activity className="h-4 w-4 text-yellow-300" />
                Data notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-yellow-100">
              {data.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
