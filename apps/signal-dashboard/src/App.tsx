import { useState, useCallback } from "react"
import { api } from "./lib/api"
import { usePolling } from "./hooks/usePolling"
import { MarketCard } from "./components/MarketCard"
import { StrategyPanel } from "./components/StrategyPanel"
import { TrainingCard } from "./components/TrainingCard"
import { EvolutionTable } from "./components/EvolutionTable"
import type { ScanResult } from "./lib/types"

const DEFAULT_MARKETS = ["SOL", "BTC", "ETH", "JUP", "JTO"]
const TIMEFRAMES = ["1h", "4h", "1d"]
const REFRESH_INTERVALS = [
  { label: "30s", ms: 30_000 },
  { label: "60s", ms: 60_000 },
  { label: "5m",  ms: 300_000 },
  { label: "off", ms: 0 },
]

type Tab = "scanner" | "strategies" | "training" | "evolution"

export default function App() {
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS)
  const [marketInput, setMarketInput] = useState(DEFAULT_MARKETS.join(", "))
  const [timeframe, setTimeframe] = useState("1h")
  const [refreshIdx, setRefreshIdx] = useState(0)
  const [tab, setTab] = useState<Tab>("scanner")
  const [serverError, setServerError] = useState(false)
  const [strategyKey, setStrategyKey] = useState(0)

  const interval = REFRESH_INTERVALS[refreshIdx].ms

  const scanFetcher = useCallback(
    () => api.scan(markets, timeframe),
    [markets, timeframe]
  )

  const { data, loading, error, refetch, lastUpdated } = usePolling<ScanResult>(
    scanFetcher,
    interval || 999_999_999,
    true
  )

  // Detect server offline
  const isOffline = !!error && error.includes("fetch")

  function applyMarkets() {
    const parsed = marketInput
      .split(/[,\s]+/)
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean)
    setMarkets(parsed)
  }

  const enterCount  = data?.markets?.filter((m) => m.verdict === "enter").length ?? 0
  const holdCount   = data?.markets?.filter((m) => m.verdict === "hold").length ?? 0

  return (
    <div className="min-h-screen bg-surface text-white font-mono">
      {/* Nav */}
      <header className="border-b border-border px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-violet-400 font-semibold">◈ CLAWD</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-300 text-xs">Signal Discovery Agent</span>
        </div>

        {/* Server status */}
        <span
          className={`text-xs px-2 py-0.5 border rounded ${
            isOffline
              ? "text-red-400 border-red-800 bg-red-950/30"
              : "text-green-400 border-green-900 bg-green-950/20"
          }`}
        >
          {isOffline ? "⚡ API offline" : "● live"}
        </span>

        {/* Verdict summary */}
        {data && (
          <div className="flex gap-2 ml-2">
            <span className="text-xs text-green-400">{enterCount} enter</span>
            <span className="text-xs text-gray-500">{holdCount} hold</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Timeframe */}
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`text-xs px-2 py-0.5 border rounded transition-colors ${
                  timeframe === tf
                    ? "border-violet-600 text-violet-300 bg-violet-900/30"
                    : "border-gray-700 text-gray-500 hover:border-gray-600"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Refresh interval */}
          <select
            value={refreshIdx}
            onChange={(e) => setRefreshIdx(Number(e.target.value))}
            className="text-xs bg-surface border border-gray-700 text-gray-400 px-2 py-0.5 rounded"
          >
            {REFRESH_INTERVALS.map((r, i) => (
              <option key={r.label} value={i}>
                ↻ {r.label}
              </option>
            ))}
          </select>

          {/* Manual refresh */}
          <button
            onClick={refetch}
            disabled={loading}
            className="text-xs px-3 py-1 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded disabled:opacity-40 transition-colors"
          >
            {loading ? "…" : "↻ scan"}
          </button>
        </div>
      </header>

      {/* Market input bar */}
      <div className="border-b border-border px-6 py-2 flex items-center gap-3">
        <span className="text-gray-600 text-xs">markets:</span>
        <input
          type="text"
          value={marketInput}
          onChange={(e) => setMarketInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyMarkets()}
          className="flex-1 bg-transparent border border-gray-800 focus:border-violet-700 rounded px-2 py-0.5 text-xs text-gray-300 outline-none"
          placeholder="SOL, BTC, ETH, JUP, JTO"
        />
        <button
          onClick={applyMarkets}
          className="text-xs px-2 py-0.5 border border-gray-700 text-gray-500 hover:text-white rounded"
        >
          apply
        </button>
        {lastUpdated && (
          <span className="text-gray-600 text-xs ml-2">
            updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6 flex gap-1 pt-1">
        {(["scanner", "strategies", "training", "evolution"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs px-4 py-2 border-b-2 transition-colors ${
              tab === t
                ? "border-violet-500 text-violet-300"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="px-6 py-4 max-w-6xl mx-auto">
        {/* Offline banner */}
        {isOffline && (
          <div className="mb-4 px-4 py-3 bg-red-950/40 border border-red-900 rounded-lg text-red-300 text-xs">
            <strong>API server offline.</strong> Start it with:
            <br />
            <code className="text-red-200">
              cd ai-training/nvidia/blueprints/signal-discovery && uvicorn server:app --reload --port 8765
            </code>
          </div>
        )}

        {tab === "scanner" && (
          <div className="flex flex-col gap-3">
            {loading && !data && (
              <div className="text-gray-600 text-xs py-8 text-center animate-pulse">
                scanning {markets.join(", ")}…
              </div>
            )}
            {data?.markets?.map((scan) => (
              <MarketCard
                key={scan.market}
                scan={scan}
                onStrategyChange={() => setStrategyKey((k) => k + 1)}
              />
            ))}
          </div>
        )}

        {tab === "strategies" && (
          <div className="max-w-2xl">
            <StrategyPanel key={strategyKey} />
          </div>
        )}

        {tab === "training" && (
          <div className="max-w-xl">
            <TrainingCard />
          </div>
        )}

        {tab === "evolution" && (
          <EvolutionTable />
        )}
      </main>
    </div>
  )
}
