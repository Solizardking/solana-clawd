import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Bolt, Clock, ExternalLink, Gauge, RefreshCw, Route, Shield, Wallet, Zap } from "lucide-react";
import { Link } from "wouter";
import {
  fetchFlashPrices,
  fetchFlashQuote,
  fetchFlashStatus,
  fetchFlashTokens,
  type FlashPriceInfo,
  type FlashQuote,
  type FlashStatus,
  type FlashTradeSide,
} from "@/lib/flash";

const featuredSymbols = ["SOL", "BTC", "ETH", "JUP", "PYTH", "WIF", "BONK", "TRUMP"];

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function priceOf(price?: FlashPriceInfo) {
  return numberValue(price?.priceUi) ?? numberValue(price?.price) ?? null;
}

function fmtUsd(value: unknown, digits = 2) {
  const n = numberValue(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(n);
}

function fmtNum(value: unknown, digits = 4) {
  const n = numberValue(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

function Stat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-white/10 bg-black/35 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function MiniChart({ points, side }: { points: number[]; side: FlashTradeSide }) {
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 80 - ((point - min) / range) * 62;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <svg viewBox="0 0 100 86" preserveAspectRatio="none" className="h-56 w-full">
      <defs>
        <linearGradient id="flash-grid" x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#22c55e" stopOpacity="0.12" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect width="100" height="86" fill="url(#flash-grid)" />
      {[16, 32, 48, 64, 80].map((x) => <line key={x} x1={x} x2={x} y1="0" y2="86" stroke="rgba(255,255,255,0.06)" />)}
      {[18, 35, 52, 69].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />)}
      {path && (
        <path
          d={path}
          fill="none"
          stroke={side === "LONG" ? "#34d399" : "#fb7185"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

export default function FlashPage() {
  const [status, setStatus] = useState<FlashStatus | null>(null);
  const [tokens, setTokens] = useState<string[]>(featuredSymbols);
  const [prices, setPrices] = useState<Record<string, FlashPriceInfo>>({});
  const [selected, setSelected] = useState("SOL");
  const [side, setSide] = useState<FlashTradeSide>("LONG");
  const [collateral, setCollateral] = useState(25);
  const [leverage, setLeverage] = useState(5);
  const [quote, setQuote] = useState<FlashQuote | null>(null);
  const [chart, setChart] = useState<number[]>([]);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([fetchFlashStatus(), fetchFlashTokens()]).then(([statusResult, tokensResult]) => {
      if (cancelled) return;
      if (statusResult.status === "fulfilled") setStatus(statusResult.value);
      if (tokensResult.status === "fulfilled") {
        const symbols = tokensResult.value.map((token) => token.symbol).filter(Boolean);
        setTokens(Array.from(new Set([...featuredSymbols, ...symbols])).slice(0, 42));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPrices() {
      const started = performance.now();
      try {
        const next = await fetchFlashPrices();
        if (cancelled) return;
        setPrices(next);
        setLastMs(Math.round(performance.now() - started));
        const current = priceOf(next[selected]);
        if (current != null) setChart((old) => [...old.slice(-42), current]);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Flash price fetch failed");
      }
    }
    void loadPrices();
    const id = window.setInterval(loadPrices, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    async function loadQuote() {
      setLoadingQuote(true);
      try {
        const next = await fetchFlashQuote({ symbol: selected, side, collateralUsd: collateral, leverage });
        if (!cancelled) {
          setQuote(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Flash quote failed");
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    }
    const id = window.setTimeout(loadQuote, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [selected, side, collateral, leverage]);

  const selectedPrice = priceOf(prices[selected]);
  const notional = collateral * leverage;
  const erAdvantage = lastMs == null ? "30-50 ms" : `${Math.max(30, Math.min(90, Math.round(lastMs * 0.45)))} ms`;

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-[#070908] text-zinc-100">
      <div className="grid min-h-[calc(100vh-7rem)] grid-rows-[auto_1fr] border border-white/10 bg-[linear-gradient(135deg,rgba(9,12,10,0.98),rgba(5,8,12,0.98))]">
        <header className="grid gap-4 border-b border-white/10 bg-black/35 p-4 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                <Bolt className="h-3 w-3" /> Flash Trade V2
              </span>
              <span className="inline-flex items-center gap-1.5 border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                MagicBlock ER
              </span>
              <span className="inline-flex items-center gap-1.5 border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                Public REST
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">Flash Trade</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Live perp quotes from Flash V2 on MagicBlock. Prices and previews come from the hosted API; trading transactions
              are routed to the Ephemeral Rollup, while account setup and withdrawals stay on base Solana.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[26rem]">
            <Stat label="Price RTT" value={lastMs == null ? "…" : `${lastMs} ms`} tone="text-sky-200" />
            <Stat label="ER Target" value={erAdvantage} tone="text-emerald-200" />
            <Stat label="L1 Base" value="~400 ms" tone="text-amber-200" />
          </div>
        </header>

        <main className="grid gap-4 p-4 xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
          <aside className="border border-white/10 bg-black/30">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Markets</div>
              <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${lastMs == null ? "" : "animate-pulse"}`} />
            </div>
            <div className="max-h-[34rem] overflow-auto p-2">
              {tokens.map((symbol) => {
                const price = priceOf(prices[symbol]);
                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => {
                      setSelected(symbol);
                      setChart([]);
                    }}
                    className={`mb-1 grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 border px-2 py-2 text-left transition-colors ${
                      selected === symbol
                        ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-100"
                        : "border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center border border-white/10 bg-black/40 font-mono text-[10px] font-bold">
                      {symbol.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{symbol}/USDC</span>
                      <span className="block text-[10px] uppercase tracking-[0.12em] text-zinc-500">Pyth Lazer</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-zinc-300">{fmtUsd(price, price && price < 1 ? 5 : 2)}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="grid min-w-0 grid-rows-[auto_auto_1fr] border border-white/10 bg-black/25">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{selected}/USDC perpetual</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-3">
                  <div className="font-mono text-4xl font-black tabular-nums text-white">{fmtUsd(selectedPrice, selectedPrice && selectedPrice < 1 ? 5 : 2)}</div>
                  <div className="text-xs text-zinc-500">{prices[selected]?.marketSession ? String(prices[selected].marketSession) : "live oracle"}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("LONG")}
                  className={`flex h-10 items-center justify-center gap-2 border px-4 text-xs font-black uppercase tracking-[0.12em] ${
                    side === "LONG" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100" : "border-white/10 text-zinc-400"
                  }`}
                >
                  <ArrowUp className="h-4 w-4" /> Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide("SHORT")}
                  className={`flex h-10 items-center justify-center gap-2 border px-4 text-xs font-black uppercase tracking-[0.12em] ${
                    side === "SHORT" ? "border-rose-400/60 bg-rose-400/15 text-rose-100" : "border-white/10 text-zinc-400"
                  }`}
                >
                  <ArrowDown className="h-4 w-4" /> Short
                </button>
              </div>
            </div>

            <div className="grid border-b border-white/10 sm:grid-cols-4">
              <Stat label="Collateral" value={fmtUsd(collateral)} />
              <Stat label="Leverage" value={`${leverage}x`} />
              <Stat label="Notional" value={fmtUsd(notional)} tone={side === "LONG" ? "text-emerald-200" : "text-rose-200"} />
              <Stat label="Position Size" value={`${fmtNum(quote?.outputAmountUi, 5)} ${selected}`} />
            </div>

            <div className="min-h-[24rem] p-4">
              <MiniChart points={chart} side={side} />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Collateral USDC
                  <input
                    type="range"
                    min="11"
                    max="500"
                    step="1"
                    value={collateral}
                    onChange={(event) => setCollateral(Number(event.target.value))}
                    className="accent-emerald-400"
                  />
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Leverage
                  <input
                    type="range"
                    min="1"
                    max="25"
                    step="1"
                    value={leverage}
                    onChange={(event) => setLeverage(Number(event.target.value))}
                    className="accent-sky-400"
                  />
                </label>
                <div className="flex items-end">
                  <a
                    href="https://github.com/flash-trade/examples-v2/tree/main/examples/tap-trade"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 border border-white/10 bg-white/[0.03] px-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 hover:border-emerald-400/40"
                  >
                    Demo source <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          <aside className="grid gap-4">
            <div className="border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-white"><Gauge className="h-4 w-4 text-emerald-300" /> Quote Preview</div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{loadingQuote ? "pricing" : "live"}</span>
              </div>
              <div className="grid gap-2">
                <Stat label="Entry" value={fmtUsd(quote?.newEntryPrice, selectedPrice && selectedPrice < 1 ? 5 : 2)} />
                <Stat label="Liquidation" value={fmtUsd(quote?.newLiquidationPrice, selectedPrice && selectedPrice < 1 ? 5 : 2)} tone="text-amber-200" />
                <Stat label="Entry Fee" value={fmtUsd(quote?.entryFee, 4)} />
                <Stat label="Hourly Borrow" value={`${fmtNum(quote?.marginFeePercentage, 6)}%`} />
              </div>
              {error && <div className="mt-3 border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{error}</div>}
            </div>

            <div className="border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Route className="h-4 w-4 text-sky-300" /> Two-chain route</div>
              <div className="space-y-3 text-sm">
                <div className="border border-sky-400/20 bg-sky-400/10 p-3">
                  <div className="flex items-center gap-2 font-semibold text-sky-100"><Zap className="h-4 w-4" /> Trading hot path</div>
                  <div className="mt-1 break-all font-mono text-[11px] text-sky-200/75">{status?.erRpc || "https://flash.magicblock.xyz"}</div>
                </div>
                <div className="border border-amber-400/20 bg-amber-400/10 p-3">
                  <div className="flex items-center gap-2 font-semibold text-amber-100"><Wallet className="h-4 w-4" /> Setup and withdrawal</div>
                  <div className="mt-1 break-all font-mono text-[11px] text-amber-200/75">{status?.baseRpc || "base Solana RPC"}</div>
                </div>
              </div>
            </div>

            <div className="border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Shield className="h-4 w-4 text-emerald-300" /> Public mode</div>
              <p className="text-sm leading-6 text-zinc-400">
                This page only reads prices and builds wallet-free quote previews. Add an owner to the same builder endpoint and Flash returns a partially signed transaction.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Clock className="h-3.5 w-3.5" /> State commits back to Solana on the Flash cadence.</div>
              <Link href="/perps" className="mt-4 inline-flex w-full items-center justify-center border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 hover:border-sky-400/40">
                Compare Phoenix
              </Link>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
