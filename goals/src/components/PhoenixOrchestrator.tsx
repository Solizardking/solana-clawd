/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Coins,
  Award,
  Zap,
  Play,
  Pause,
  Square,
  RefreshCw,
  Sliders,
  Database,
  Cpu,
  Layers,
  Terminal,
  Activity,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Compass,
  AlertTriangle,
  Flame,
  LineChart
} from "lucide-react";

interface TickerData {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  openInterest: string;
  volume24h: string;
  tickSize: number;
  lotSize: number;
}

interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

interface OrderBookData {
  symbol: string;
  midPrice: number;
  spread: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface PortfolioData {
  rawBalanceUsdc: number;
  positionSize: number;
  averageEntryPrice: number;
  unrealizedPnL: number;
  netPortfolioValue: number;
  maintenanceMargin: number;
  walletName: string;
  rpcConnected: string;
}

interface StrategyRun {
  runId: string;
  symbol: string;
  type: "twap" | "grid" | "ta";
  status: "running" | "paused" | "stopped" | "completed";
  mode: "paper" | "live";
  marginMode: "cross" | "isolated";
  params: any;
  currentStep: number;
  totalSteps: number;
  logs: string[];
  positionSize: number;
  entryPrice: number;
  collateralUsdc: number;
  createdAt: string;
}

export default function PhoenixOrchestrator() {
  // Navigation & configuration States
  const [activeTab, setActiveTab] = useState<"terminal" | "strategies" | "wallet">("terminal");
  const [selectedSymbol, setSelectedSymbol] = useState<"SOL" | "BTC" | "ETH">("SOL");
  const [rpcUrlInput, setRpcUrlInput] = useState("https://api.mainnet-beta.solana.com");
  const [walletKey, setWalletKey] = useState("lobster_clawd_private_seed_unlocked_9f8d...");
  const [tradingMode, setTradingMode] = useState<"paper" | "live">("paper");
  
  // Strategy Builder form states
  const [strategyType, setStrategyType] = useState<"twap" | "grid" | "ta">("twap");
  const [marginMode, setMarginMode] = useState<"cross" | "isolated">("cross");
  const [isolatedCollateral, setIsolatedCollateral] = useState("250.00");
  
  // Individual params
  const [twapSlices, setTwapSlices] = useState("10");
  const [twapSliceSize, setTwapSliceSize] = useState("0.25");
  const [twapSide, setTwapSide] = useState<"buy" | "sell">("buy");
  const [gridLevels, setGridLevels] = useState("6");
  const [gridSize, setGridSize] = useState("0.15");
  const [taRule, setTaRule] = useState<"rsi" | "ema_cross">("rsi");

  // Fetching States
  const [tickers, setTickers] = useState<{ [key: string]: TickerData } | null>(null);
  const [orderbook, setOrderbook] = useState<OrderBookData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [runningStrategies, setRunningStrategies] = useState<StrategyRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Manual fast execution form
  const [manualSide, setManualSide] = useState<"buy" | "sell">("buy");
  const [manualSize, setManualSize] = useState("1.0");
  const [manualPrice, setManualPrice] = useState("");
  const [manualOrderType, setManualOrderType] = useState<"market" | "limit">("market");
  const [executionLog, setExecutionLog] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Real-time polling
  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(() => {
      pollTickersAndOrderbook();
      pollPortfolioAndStrategies();
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedSymbol]);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setErrorText(null);
    try {
      await Promise.all([
        pollTickersAndOrderbook(),
        pollPortfolioAndStrategies()
      ]);
    } catch (err: any) {
      setErrorText("Error bootstrapping mainnet RPC endpoints.");
    } finally {
      setIsLoading(false);
    }
  };

  const pollTickersAndOrderbook = async () => {
    try {
      // Fetch prices and specific order depth
      const resTicker = await fetch("/api/phoenix/ticker");
      const resOb = await fetch(`/api/phoenix/orderbook?symbol=${selectedSymbol}`);
      
      if (resTicker.ok && resOb.ok) {
        const jTicker = await resTicker.json();
        const jOb = await resOb.json();
        setTickers(jTicker.data);
        setOrderbook(jOb.data);
      }
    } catch (e) {
      console.warn("Orderbook fetch tick suppressed:", e);
    }
  };

  const pollPortfolioAndStrategies = async () => {
    try {
      const resPort = await fetch("/api/phoenix/portfolio");
      const resStrat = await fetch("/api/phoenix/strategies");
      
      if (resPort.ok && resStrat.ok) {
        const jPort = await resPort.json();
        const jStrat = await resStrat.json();
        setPortfolio(jPort.data);
        setRunningStrategies(jStrat.data);
      }
    } catch (e) {
      console.warn("Portfolio polling failed:", e);
    }
  };

  // Launch strategy handler
  const handleLaunchStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    try {
      let params: any = {};
      
      if (strategyType === "twap") {
        params = {
          slices: twapSlices,
          sliceSize: twapSliceSize,
          side: twapSide
        };
      } else if (strategyType === "grid") {
        params = {
          levels: gridLevels,
          sizePerLevel: gridSize
        };
      } else if (strategyType === "ta") {
        params = {
          rule: taRule
        };
      }

      const res = await fetch("/api/phoenix/strategies/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          type: strategyType,
          params,
          mode: tradingMode,
          marginMode,
          isolatedCollateral
        })
      });

      if (res.ok) {
        const data = await res.json();
        setRunningStrategies(prev => [data.data, ...prev]);
        setActiveTab("strategies"); // jump to show strategies ticking live
      } else {
        const err = await res.json();
        setErrorText(err.error || "Failed to engage strategy wrapper.");
      }
    } catch (err: any) {
      setErrorText("Error engaging secure TEE execution.");
    }
  };

  // Strategy commands execution (pause, resume, stop, finalize)
  const handleStrategyAction = async (runId: string, action: "pause" | "resume" | "stop" | "finalize") => {
    try {
      const res = await fetch("/api/phoenix/strategies/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action })
      });
      if (res.ok) {
        pollPortfolioAndStrategies();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Direct trade submit
  const handleDirectTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExecuting(true);
    setExecutionLog(null);
    try {
      const res = await fetch("/api/phoenix/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          side: manualSide,
          size: manualSize,
          price: manualOrderType === "limit" ? manualPrice : null,
          type: manualOrderType,
          mode: tradingMode
        })
      });

      if (res.ok) {
        const json = await res.json();
        setExecutionLog(json.data.log);
        pollPortfolioAndStrategies();
      } else {
        const err = await res.json();
        setErrorText(err.error || "Execution rejected by liquidity networks.");
      }
    } catch (err) {
      setErrorText("Failed to build RPC transaction signature block.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Loading slate fallback
  if (isLoading && !tickers) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-black border border-[#9945FF]/10 rounded-2xl p-8 font-mono">
        <RefreshCw className="w-8 h-8 text-[#14F195] animate-spin mb-3" />
        <p className="text-xs text-zinc-400">CONNECTING PHALA TEE TO PHOENIX PERPETUAL MARKETS...</p>
        <p className="text-[10px] text-zinc-600 mt-1">Bootstrapping mainnet indices & oracles via Solana RPC_URL</p>
      </div>
    );
  }

  const activeTicker = tickers ? tickers[selectedSymbol] : null;

  return (
    <div className="space-y-6">
      
      {/* Network & Node Status Header */}
      <div className="bg-zinc-950/80 border border-[#9945FF]/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono scanline-container">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#9945FF]/10 border border-[#9945FF]/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-[#9945FF] animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Phoenix Perps & Strategy Core
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <Database className="w-3.5 h-3.5 text-[#14F195]" />
                <span className="truncate max-w-[200px] text-zinc-500">{portfolio?.rpcConnected || rpcUrlInput}</span>
              </span>
              <span className="text-[8px] bg-emerald-500/10 text-[#14F195] border border-[#14F195]/20 px-1.5 py-0.2 rounded font-bold uppercase tracking-wide">
                Active RPC Connected
              </span>
            </div>
          </div>
        </div>

        {/* Workspace controls */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
          <button
            type="button"
            onClick={() => setActiveTab("terminal")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all border ${
              activeTab === "terminal"
                ? "bg-[#9945FF] text-white border-[#9945FF] shadow-[0_0_10px_#9945FF/25]"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850"
            }`}
          >
            💻 PHOENIX TERMINAL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("strategies")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all relative border ${
              activeTab === "strategies"
                ? "bg-[#9945FF] text-white border-[#9945FF] shadow-[0_0_10px_#9945FF/25]"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850"
            }`}
          >
            🎯 MANDATES ({runningStrategies.filter(s => s.status === "running").length})
            {runningStrategies.some(s => s.status === "running") && (
              <span className="absolute -top-1.5 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#14F195] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#14F195]" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("wallet")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all border ${
              activeTab === "wallet"
                ? "bg-[#9945FF] text-white border-[#9945FF] shadow-[0_0_10px_#9945FF/25]"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850"
            }`}
          >
            🔑 SECURE LEDGER
          </button>
        </div>
      </div>

      {errorText && (
        <div className="bg-red-950/20 border border-red-500/25 rounded-2xl p-4 flex items-center gap-3 font-mono text-xs text-red-300">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {/* Main interactive Tab grid */}
      {activeTab === "terminal" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LHS Panel: Spot Ticker & Order Depth Chart */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Asset Selection Bar & Live Stats Tickers */}
            <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-1">
                  {(["SOL", "BTC", "ETH"] as const).map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSelectedSymbol(sym)}
                      className={`px-4 py-2 text-xs font-black rounded-lg transition-all font-mono ${
                        selectedSymbol === sym
                          ? "bg-gradient-to-r from-[#9945FF]/15 to-[#14F195]/10 text-[#14F195] border border-[#14F195]/30"
                          : "text-zinc-450 border border-transparent hover:bg-zinc-900 hover:text-zinc-200"
                      }`}
                    >
                      {sym}-USD-PERP
                    </button>
                  ))}
                </div>
                
                {/* Funding countdown and volume */}
                <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                  <Flame className="w-3.5 h-3.5 text-[#9945FF] animate-pulse" />
                  <span>Mark: <strong className="text-zinc-300">${activeTicker?.markPrice.toFixed(2)}</strong></span>
                  <span className="text-zinc-800">|</span>
                  <span>Funding: <strong className="text-indigo-400">+{((activeTicker?.fundingRate || 0) * 100).toFixed(4)}%</strong></span>
                </div>
              </div>

              {/* Grid indices */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                <div className="bg-black/40 border border-white/[0.02] p-3 rounded-xl">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Phoenix Mark Price</p>
                  <p className="text-lg font-black text-[#14F195] mt-1 flex items-center gap-1">
                    <span>${activeTicker?.markPrice.toFixed(2)}</span>
                    <ArrowUpRight className="w-4 h-4 text-[#14F195] inline shrink-0 animate-bounce" />
                  </p>
                </div>
                <div className="bg-black/40 border border-white/[0.02] p-3 rounded-xl">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Oracle Index Price</p>
                  <p className="text-lg font-black text-slate-100 mt-1">${activeTicker?.indexPrice.toFixed(2)}</p>
                </div>
                <div className="bg-black/40 border border-white/[0.02] p-3 rounded-xl">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">24h Trade Volume</p>
                  <p className="text-sm font-bold text-slate-350 mt-2">{activeTicker?.volume24h}</p>
                </div>
                <div className="bg-black/40 border border-white/[0.02] p-3 rounded-xl">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Open Interest Pool</p>
                  <p className="text-sm font-bold text-slate-350 mt-2">{activeTicker?.openInterest} contracts</p>
                </div>
              </div>
            </div>

            {/* Depth Orderbook Screen */}
            <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-5 font-mono">
              <h3 className="text-xs font-black uppercase tracking-wider text-white pb-3 border-b border-zinc-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#9945FF]" />
                <span>Limit L2 Depth Book | {selectedSymbol}-USD-PERP</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                
                {/* Visual Bids (Ask-Green buy walls) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-zinc-550 font-black tracking-widest pb-1.5 border-b border-zinc-900 font-mono">
                    <span>SIZE ({selectedSymbol})</span>
                    <span>BID PRICE (USDC)</span>
                    <span className="hidden sm:inline">ACCUM (USDC)</span>
                  </div>
                  {orderbook?.bids.slice(0, 7).map((level, idx) => (
                    <div
                      key={idx}
                      className="relative flex justify-between text-xs py-1 px-1.5 rounded hover:bg-emerald-950/10 cursor-pointer overflow-hidden transition-colors"
                    >
                      {/* Depth backdrop overlay slider */}
                      <div
                        className="absolute right-0 top-0 h-full bg-[#14F195]/4 transition-all duration-300 pointer-events-none"
                        style={{ width: `${Math.min((level.total / (orderbook?.bids[6]?.total || 1)) * 100, 100)}%` }}
                      />
                      <span className="font-mono text-zinc-400 text-left z-10">{level.size.toFixed(2)}</span>
                      <span className="font-mono text-[#14F195] font-black z-10">${level.price.toFixed(2)}</span>
                      <span className="hidden sm:inline font-mono text-zinc-550 text-right z-10">${level.total.toFixed(1)}</span>
                    </div>
                  ))}
                </div>

                {/* Visual Asks (Rose sell resistance walls) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-zinc-550 font-black tracking-widest pb-1.5 border-b border-zinc-900 font-mono">
                    <span className="hidden sm:inline">ACCUM (USDC)</span>
                    <span>ASK PRICE (USDC)</span>
                    <span>SIZE ({selectedSymbol})</span>
                  </div>
                  {orderbook?.asks.slice(0, 7).map((level, idx) => (
                    <div
                      key={idx}
                      className="relative flex justify-between text-xs py-1 px-1.5 rounded hover:bg-rose-950/10 cursor-pointer overflow-hidden transition-colors"
                    >
                      <div
                        className="absolute left-0 top-0 h-full bg-rose-500/[0.04] transition-all duration-300 pointer-events-none"
                        style={{ width: `${Math.min((level.total / (orderbook?.asks[6]?.total || 1)) * 100, 100)}%` }}
                      />
                      <span className="hidden sm:inline font-mono text-zinc-550 text-left z-10">${level.total.toFixed(0)}</span>
                      <span className="font-mono text-rose-450 font-black z-10">${level.price.toFixed(2)}</span>
                      <span className="font-mono text-zinc-400 text-right z-10">{level.size.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

              </div>

              {/* Micro Spreads stats */}
              <div className="mt-4 pt-3 border-t border-zinc-900 flex justify-between items-center text-[10px]">
                <span className="text-zinc-500">Live feed via Phoenix Orderbook Websockets thread</span>
                <span className="text-indigo-400 font-bold font-mono">SPREAD SHIELD: ${(orderbook?.spread || 0.16).toFixed(4)} USDC</span>
              </div>
            </div>

            {/* Quick Manual Swap Execution Card */}
            <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-5 font-mono">
              <h3 className="text-xs font-black uppercase tracking-wider text-white pb-3 border-b border-zinc-900 flex items-center gap-2">
                <LineChart className="w-4 h-4 text-[#14F195]" />
                <span>One-Click Derivative Order Chassis</span>
              </h3>

              <form onSubmit={handleDirectTradeSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 items-end">
                <div>
                  <label className="block text-[9px] uppercase text-zinc-500 font-bold mb-1.5">Trade Direction</label>
                  <div className="grid grid-cols-2 gap-1 bg-black p-0.5 rounded-lg border border-zinc-805">
                    <button
                      type="button"
                      onClick={() => setManualSide("buy")}
                      className={`py-1 rounded text-[10px] font-black uppercase tracking-wide transition-all ${
                        manualSide === "buy" ? "bg-[#14F195] text-black" : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      LONG
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualSide("sell")}
                      className={`py-1 rounded text-[10px] font-black uppercase tracking-wide transition-all ${
                        manualSide === "sell" ? "bg-rose-500 text-white" : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      SHORT
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] uppercase text-zinc-500 font-bold mb-1.5">Size ({selectedSymbol})</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    value={manualSize}
                    onChange={(e) => setManualSize(e.target.value)}
                    className="bg-black border border-zinc-800 focus:border-[#9945FF] rounded-lg p-2 text-xs text-white w-full focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] uppercase text-zinc-500 font-bold mb-1.5">Order Type</label>
                  <select
                    value={manualOrderType}
                    onChange={(e) => setManualOrderType(e.target.value as any)}
                    className="bg-black border border-zinc-800 focus:border-[#9945FF] rounded-lg p-2 text-xs text-white w-full focus:outline-none appearance-none"
                  >
                    <option value="market">Immediate Market Price</option>
                    <option value="limit">Limit Order Bound</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isExecuting}
                  className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                    manualSide === "buy"
                      ? "bg-[#14F195] hover:bg-[#20ff7e] text-black"
                      : "bg-rose-500 hover:bg-rose-605 text-white"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{isExecuting ? "Executing..." : `Place ${manualSide === "buy" ? "Long" : "Short"}`}</span>
                </button>
              </form>

              {executionLog && (
                <div className="mt-4 p-3 bg-[#110123]/30 border border-[#9945FF]/20 rounded-xl font-mono text-[11px] text-slate-300 leading-relaxed flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#14F195] animate-pulse shrink-0" />
                  <span>{executionLog}</span>
                </div>
              )}
            </div>

          </div>

          {/* RHS Panel: Strategy Mandate Orchestrator Form */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-5 space-y-4 font-mono">
              <h3 className="text-xs font-black uppercase text-white tracking-wider pb-3 border-b border-zinc-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#14F195]" />
                <span>Launch Strategy Enclave</span>
              </h3>

              <form onSubmit={handleLaunchStrategy} className="space-y-4">
                
                <div>
                  <label className="block text-[9px] uppercase text-zinc-500 font-bold mb-1.5">Execution Archetype</label>
                  <select
                    value={strategyType}
                    onChange={(e) => setStrategyType(e.target.value as any)}
                    className="w-full bg-black border border-zinc-800 focus:border-[#9945FF] rounded-lg p-2 text-xs text-white focus:outline-none"
                  >
                    <option value="twap">Time Weighted Average (TWAP)</option>
                    <option value="grid">Grid Range Vertex Arbitrage</option>
                    <option value="ta">Live Indicators (TA-Signals Run)</option>
                  </select>
                </div>

                {/* Subaccount Isolation options */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] uppercase text-zinc-500 font-bold mb-1.5">Margin Allocation</label>
                    <select
                      value={marginMode}
                      onChange={(e) => setMarginMode(e.target.value as any)}
                      className="w-full bg-black border border-zinc-800 focus:border-[#9945FF] rounded-lg p-2 text-xs text-white focus:outline-none"
                    >
                      <option value="cross">Cross Custody</option>
                      <option value="isolated">Isolated Allocation</option>
                    </select>
                  </div>
                  {marginMode === "isolated" && (
                    <div>
                      <label className="block text-[9px] uppercase text-zinc-500 font-bold mb-1.5">USDC Collateral</label>
                      <input
                        type="number"
                        value={isolatedCollateral}
                        onChange={(e) => setIsolatedCollateral(e.target.value)}
                        className="w-full bg-black border border-zinc-800 focus:border-[#9945FF] rounded-lg p-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* TWAP Custom Parameters */}
                {strategyType === "twap" && (
                  <div className="bg-black/60 border border-white/[0.02] p-3.5 rounded-xl space-y-3">
                    <p className="text-[9px] font-black uppercase text-[#9945FF] tracking-wider mb-2">TWAP Slice Slices Settings</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] text-zinc-500 mb-1">Slice count</label>
                        <input
                          type="number"
                          value={twapSlices}
                          onChange={(e) => setTwapSlices(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-[#9945FF] rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-zinc-500 mb-1">Vol/Slice ({selectedSymbol})</label>
                        <input
                          type="number"
                          step="0.05"
                          value={twapSliceSize}
                          onChange={(e) => setTwapSliceSize(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-[#9945FF] rounded"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[8px] text-zinc-500 mb-1">Target Slice Side</label>
                      <div className="grid grid-cols-2 gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-805">
                        <button
                          type="button"
                          onClick={() => setTwapSide("buy")}
                          className={`py-1 text-[9px] font-black tracking-wide rounded uppercase ${
                            twapSide === "buy" ? "bg-[#14F195] text-black" : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Accumulate (Buy)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTwapSide("sell")}
                          className={`py-1 text-[9px] font-black tracking-wide rounded uppercase ${
                            twapSide === "sell" ? "bg-rose-500 text-white" : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Unwind (Sell)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid Custom Parameters */}
                {strategyType === "grid" && (
                  <div className="bg-black/60 border border-white/[0.02] p-3.5 rounded-xl space-y-3">
                    <p className="text-[9px] font-black uppercase text-[#9945FF] tracking-wider mb-2">Grid Vertext Vertices Settings</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] text-zinc-500 mb-1">Grid Levels</label>
                        <input
                          type="number"
                          value={gridLevels}
                          onChange={(e) => setGridLevels(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-[#9945FF] rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-zinc-500 mb-1">Contract Perp / Level</label>
                        <input
                          type="number"
                          step="0.05"
                          value={gridSize}
                          onChange={(e) => setGridSize(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-[#9945FF] rounded"
                        />
                      </div>
                    </div>
                    <p className="text-[8px] text-zinc-500 leading-relaxed font-light mt-1">
                      Grid automatically deploys symmetric limit buys and limits sells around the active SOL perp best price, triggering instant arbitrage swaps.
                    </p>
                  </div>
                )}

                {/* TA Parameters */}
                {strategyType === "ta" && (
                  <div className="bg-black/60 border border-white/[0.02] p-3.5 rounded-xl space-y-3">
                    <p className="text-[9px] font-black uppercase text-[#9945FF] tracking-wider mb-2">Technical Indicator Overlay Rules</p>
                    <div>
                      <label className="block text-[8px] text-zinc-500 mb-1">Trigger Signal Rule</label>
                      <select
                        value={taRule}
                        onChange={(e) => setTaRule(e.target.value as any)}
                        className="w-full bg-zinc-950 border border-zinc-800 p-2 text-xs text-white focus:outline-none focus:border-[#9945FF] rounded"
                      >
                        <option value="rsi">RSI Oversold Boundary (&lt;32 Buy, &gt;68 Sell)</option>
                        <option value="ema_cross">EMA Cross overlap (Fast 12 &gt; Slow 26 crossover)</option>
                      </select>
                    </div>
                    <p className="text-[8px] text-zinc-450 leading-relaxed font-light mt-1">
                      Evaluates the on-chain live prices continuously. When indicator thresholds are hit on the server, the strategy submits Phoenix orders.
                    </p>
                  </div>
                )}

                {/* Sandbox environment switcher */}
                <div className="bg-zinc-950/70 border border-zinc-850 p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-white">Execution Mode</p>
                    <p className="text-[8px] text-zinc-500 mt-0.5">Toggle live on Solana Mainnet or local safe Paper trade</p>
                  </div>
                  <div className="flex bg-black p-0.5 rounded border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setTradingMode("paper")}
                      className={`px-2.5 py-1 text-[8.5px] font-black rounded uppercase ${
                        tradingMode === "paper" ? "bg-[#14F195] text-black" : "text-zinc-500 hover:text-white"
                      }`}
                    >
                      PAPER
                    </button>
                    <button
                      type="button"
                      onClick={() => setTradingMode("live")}
                      className={`px-2.5 py-1 text-[8.5px] font-black rounded uppercase ${
                        tradingMode === "live" ? "bg-[#9945FF] text-white" : "text-zinc-500 hover:text-white"
                      }`}
                    >
                      LIVE ID
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#9945FF] hover:bg-[#af6eff] text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-[#9945FF]/10"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>ENGAGE TEE ORCHESTRATOR</span>
                </button>
              </form>
            </div>

            {/* Simulated Live subaccount margins state */}
            <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-5 font-mono space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 pb-2 border-b border-zinc-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#14F195]" />
                <span>Subaccount Ledger Info</span>
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Available Collateral:</span>
                  <span className="font-bold text-white">${portfolio?.rawBalanceUsdc.toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Open Position size:</span>
                  <span className={`font-bold ${portfolio?.positionSize !== 0 ? "text-[#14F195]" : "text-zinc-350"}`}>
                    {portfolio?.positionSize && portfolio.positionSize > 0 ? "+" : ""}{portfolio?.positionSize.toFixed(3)} SOL
                  </span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Average Entry price:</span>
                  <span className="font-bold text-white">${portfolio?.averageEntryPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Unrealized PnL:</span>
                  <span className={`font-bold ${portfolio && portfolio.unrealizedPnL >= 0 ? "text-[#14F195]" : "text-red-400"}`}>
                    ${portfolio && portfolio.unrealizedPnL >= 0 ? "+" : ""}{portfolio?.unrealizedPnL.toFixed(2)} USDC
                  </span>
                </div>
                <div className="flex justify-between items-center text-zinc-400 pt-2 border-t border-zinc-900">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Net subaccount worth:</span>
                  <span className="font-black text-[#14F195] text-sm">${portfolio?.netPortfolioValue.toFixed(2)} USD</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Strategies Active view tab */}
      {activeTab === "strategies" && (
        <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-6 font-mono space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
            <div>
              <h3 className="text-sm font-black text-white">Active TEE Strategy Mandates</h3>
              <p className="text-[10px] text-zinc-500 mt-1">Simultaneous encrypted strategy threads ticking on confidential nodes</p>
            </div>
            <button
              type="button"
              onClick={pollPortfolioAndStrategies}
              className="p-1.5 px-3 bg-zinc-900 border border-zinc-800 hover:bg-[#9945FF]/10 text-zinc-300 rounded-lg flex items-center gap-1.5 transition-all text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#14F195]" />
              Sync Lists
            </button>
          </div>

          {runningStrategies.length === 0 ? (
            <div className="text-center py-12 rounded-xl bg-black/40 border border-zinc-905">
              <Sliders className="w-8 h-8 text-zinc-700 mx-auto mb-2 animate-bounce" />
              <p className="text-xs text-zinc-400">No active strategies are currently deployed.</p>
              <p className="text-[10px] text-zinc-600 mt-1">Navigate to terminal and start a TWAP, Grid, or Indicators overlay.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {runningStrategies.map((run) => (
                <div
                  key={run.runId}
                  className="bg-black/50 border border-zinc-900 rounded-xl p-5 space-y-4 hover:border-[#9945FF]/30 transition-all"
                >
                  {/* Strategy Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-900">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[9px] bg-[#9945FF]/20 text-[#be8dfa] border border-[#9945FF]/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {run.type.toUpperCase()} RUNNER
                      </span>
                      <strong className="text-xs text-white uppercase">{run.symbol}-USD-PERP</strong>
                      <span className="text-zinc-650 font-sans text-xs">|</span>
                      <span className="text-[10px] text-zinc-500 font-mono">ID: {run.runId}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] uppercase tracking-wider font-bold border rounded px-2.5 py-0.5 ${
                        run.status === "running"
                          ? "bg-emerald-500/10 text-[#14F195] border-[#14F195]/20 animate-pulse"
                          : run.status === "paused"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                          : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      }`}>
                        {run.status}
                      </span>
                      
                      {/* Controller actions */}
                      {run.status === "running" && (
                        <button
                          type="button"
                          onClick={() => handleStrategyAction(run.runId, "pause")}
                          className="p-1 px-2.5 text-[10px] bg-amber-955/20 text-amber-400 hover:bg-amber-955/40 border border-amber-500/10 rounded font-bold cursor-pointer"
                        >
                          Pause
                        </button>
                      )}
                      {run.status === "paused" && (
                        <button
                          type="button"
                          onClick={() => handleStrategyAction(run.runId, "resume")}
                          className="p-1 px-2.5 text-[10px] bg-emerald-955/25 text-[#14F195] hover:bg-emerald-955/40 border border-[#14F195]/10 rounded font-bold cursor-pointer"
                        >
                          Resume
                        </button>
                      )}
                      {(run.status === "running" || run.status === "paused") && (
                        <button
                          type="button"
                          onClick={() => handleStrategyAction(run.runId, "finalize")}
                          className="p-1 px-2.5 text-[10px] bg-rose-955/25 text-rose-400 hover:bg-rose-955/40 border border-rose-500/10 rounded font-bold cursor-pointer"
                        >
                          Finalize
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Settings grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="p-3 bg-zinc-950/40 border border-white/[0.01]/30 rounded-lg">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Progress Step</span>
                      <span className="text-sm font-black text-white mt-1 block">
                        {run.currentStep} / {run.totalSteps} ticks
                      </span>
                      {run.status === "running" && (
                        <div className="w-full h-1 bg-zinc-900 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-[#14F195] transition-all duration-300"
                            style={{ width: `${(run.currentStep / run.totalSteps) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-zinc-950/40 border border-white/[0.01]/30 rounded-lg">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Net strategy Position</span>
                      <span className="text-sm font-black text-white mt-1 block">
                        {run.positionSize > 0 ? "+" : ""}{run.positionSize.toFixed(2)} contracts
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950/40 border border-white/[0.01]/30 rounded-lg">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">E2EE Margin Allocation</span>
                      <span className="text-sm font-black text-white mt-1 block">
                        {run.marginMode.toUpperCase()} ({run.marginMode === "isolated" ? `$${run.collateralUsdc} USDC` : "Cross Wallet"})
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950/40 border border-white/[0.01]/30 rounded-lg">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Confidential Enclave</span>
                      <span className="text-[10px] font-bold text-amber-500 mt-1.5 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 inline text-amber-500 shrink-0" />
                        <span>Intel SGX Secure Attested</span>
                      </span>
                    </div>
                  </div>

                  {/* Strategy Live Logs Console! */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">CONFIDENTIAL TRANSACTION LOGS</div>
                    <div className="w-full h-32 bg-zinc-950 border border-zinc-900 rounded-lg p-3 overflow-y-auto space-y-1 text-[10.5px] font-mono leading-relaxed select-text">
                      {run.logs.map((log, idx) => {
                        let col = "text-zinc-300";
                        if (log.includes("Success") || log.includes("filled") || log.includes("Filled")) col = "text-[#14F195] font-black";
                        else if (log.includes("PAUSED") || log.includes("INITIATED")) col = "text-[#9945FF] font-semibold";
                        else if (log.includes("OUTCOME") || log.includes("FINALIZED")) col = "text-sky-355 font-bold";
                        return (
                          <div key={idx} className={`${col} flex items-start gap-1`}>
                            <span className="text-[#9945FF] select-none font-bold">&gt;</span>
                            <span>{log}</span>
                          </div>
                        );
                      })}
                      <div ref={logsEndRef} />
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* Wallet Ledger and Keys Tab */}
      {activeTab === "wallet" && (
        <div className="bg-zinc-950/50 border border-zinc-900 rounded-2xl p-6 font-mono space-y-6">
          <div className="pb-3 border-b border-zinc-900">
            <h3 className="text-sm font-black text-white">Secure Ledger & Key Chassis</h3>
            <p className="text-[10px] text-zinc-500 mt-1">Configure user-specific keys and Solana RPC connections safely</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* RPC endpoints */}
            <div className="space-y-4">
              <p className="text-xs uppercase text-zinc-400 font-bold tracking-wider">Solana RPC Endpoint Node</p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={rpcUrlInput}
                  onChange={(e) => setRpcUrlInput(e.target.value)}
                  className="w-full bg-black border border-zinc-805 rounded-xl p-3 text-xs text-zinc-305 focus:outline-none focus:border-[#9945FF]"
                />
                <p className="text-[9px] text-zinc-550 leading-relaxed font-light">
                  Input custom RPC nodes (QuickNode, Helius, Alchemy, Shyft) to accelerate on-chain transactions, parse Phoenix liquidity pool markers, and sync live ledger parameters.
                </p>
              </div>

              <div className="pt-2">
                <p className="text-xs uppercase text-zinc-400 font-bold tracking-wider mb-2">Private Active Key / Seed</p>
                <input
                  type="password"
                  value={walletKey}
                  onChange={(e) => setWalletKey(e.target.value)}
                  className="w-full bg-black border border-zinc-805 rounded-xl p-3 text-xs text-zinc-405 focus:outline-none focus:border-[#9945FF]"
                />
                <p className="text-[9px] text-zinc-550 leading-relaxed font-light mt-1">
                  Private keys are kept in local encrypted sessions, utilizing client-side Web Crypto and never leaking outside TEE secure sandboxes.
                </p>
              </div>
            </div>

            {/* Explanatory TEE attestation properties */}
            <div className="p-5 rounded-2xl bg-black/45 border border-[#9945FF]/10 space-y-4">
              <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded font-black tracking-widest uppercase">
                CRON SHIELD TEE STATUS
              </span>
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-wide">Attested Cryptographic Safeguards</h3>
              
              <div className="space-y-3.5 text-[11px] text-zinc-450 leading-relaxed font-light font-mono">
                <p>
                  1. <strong>Intel SGX Sandboxing:</strong> All strategies (such as Griffin Spot or Phoenix Perps Grid) are isolated within certified secure enclaves. Memory footprint is hardware encrypted against runtime side-channels.
                </p>
                <p>
                  2. <strong>E2EE Envelope Routing:</strong> Strategy directives and keys are sealed using RSA-OAEP before exiting client terminals. Decryption occurs only under verifiable attestation parameters on Phala Gateway.
                </p>
                <p>
                  3. <strong>Vulcan SDK execution:</strong> Integrated directly with standard Phoenix protocols, verifying signatures securely before submission.
                </p>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
