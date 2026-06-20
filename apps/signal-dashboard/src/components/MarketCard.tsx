import { useState } from "react"
import type { MarketScan } from "../lib/types"
import { SignalBar } from "./SignalBar"
import { RegimeBadge } from "./RegimeBadge"
import { api } from "../lib/api"

interface Props {
  scan: MarketScan
  onStrategyChange?: () => void
}

const VERDICT_STYLE: Record<string, string> = {
  enter:  "text-green-400 border-green-700",
  hold:   "text-gray-400 border-gray-700",
  exit:   "text-red-400 border-red-700",
  refuse: "text-yellow-400 border-yellow-700",
}

const DIR_COLOR = {
  long:    "text-green-400",
  short:   "text-red-400",
  neutral: "text-gray-500",
}

export function MarketCard({ scan, onStrategyChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const hasStrategy = !!scan.active_strategy
  const verdict = scan.verdict ?? "hold"
  const verdictStyle = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.hold

  const activeSignals = scan.signals.filter(
    (s) => s.direction !== "neutral" || s.strength > 0
  )
  const longCount  = scan.signals.filter((s) => s.direction === "long").length
  const shortCount = scan.signals.filter((s) => s.direction === "short").length

  async function launch() {
    setLaunching(true)
    try {
      await api.launchStrategy(
        scan.market,
        scan.composite_direction === "neutral" ? "long" : scan.composite_direction,
        200,
        "paper"
      )
      onStrategyChange?.()
    } catch (e) {
      console.error(e)
    } finally {
      setLaunching(false)
    }
  }

  async function finalize() {
    setFinalizing(true)
    try {
      await api.finalizeStrategy(scan.market)
      onStrategyChange?.()
    } catch (e) {
      console.error(e)
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div
      className={`bg-panel border rounded-lg overflow-hidden transition-all ${
        verdict === "enter" ? "border-green-800/60" : "border-border"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Market + regime */}
        <div className="flex flex-col gap-1 min-w-[72px]">
          <span className="text-white font-semibold tracking-wide">{scan.market}</span>
          <RegimeBadge regime={scan.regime} />
        </div>

        {/* Composite strength bar */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-medium ${
                DIR_COLOR[scan.composite_direction as keyof typeof DIR_COLOR]
              }`}
            >
              {scan.composite_direction.toUpperCase()}
            </span>
            <span className="text-gray-500 text-xs">
              {(scan.composite_strength * 100).toFixed(0)}%
            </span>
            <span className="text-gray-600 text-xs ml-auto">
              {longCount}▲ {shortCount}▼
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
            <div
              className={`h-full signal-bar ${
                scan.composite_direction === "long"
                  ? "bg-green-500"
                  : scan.composite_direction === "short"
                  ? "bg-red-500"
                  : "bg-gray-600"
              }`}
              style={{ width: `${Math.round(scan.composite_strength * 100)}%` }}
            />
          </div>
        </div>

        {/* Verdict badge */}
        <span
          className={`text-xs px-2 py-0.5 border rounded uppercase tracking-wider ${verdictStyle}`}
        >
          {verdict}
        </span>

        {/* Strategy indicator */}
        {hasStrategy && (
          <span className="text-xs text-violet-400 border border-violet-800 px-2 py-0.5 rounded">
            ⚙ strategy
          </span>
        )}

        {/* Expand toggle */}
        <span className="text-gray-600 text-xs ml-1">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded signal list */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {/* Stats row */}
          <div className="flex gap-4 py-2 text-xs text-gray-500">
            <span>ATR <span className="text-gray-300">{scan.regime_atr_pct?.toFixed(2)}%</span></span>
            <span>ADX <span className="text-gray-300">{scan.regime_adx?.toFixed(1)}</span></span>
            <span>conf <span className="text-gray-300">{((scan.confidence ?? 0) * 100).toFixed(0)}%</span></span>
            <span className="text-gray-600 ml-auto">
              {new Date(scan.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Signal bars */}
          <div className="flex flex-col gap-1.5 mt-1">
            {scan.signals.map((s) => (
              <SignalBar key={s.name} signal={s} />
            ))}
          </div>

          {/* Strategy controls */}
          <div className="flex gap-2 mt-4">
            {!hasStrategy ? (
              <button
                onClick={launch}
                disabled={launching || scan.composite_direction === "neutral"}
                className="px-3 py-1 text-xs bg-violet-900/50 hover:bg-violet-800/60 border border-violet-700 text-violet-200 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {launching ? "launching…" : "⚙ Launch Strategy (paper)"}
              </button>
            ) : (
              <button
                onClick={finalize}
                disabled={finalizing}
                className="px-3 py-1 text-xs bg-red-900/30 hover:bg-red-800/40 border border-red-800 text-red-300 rounded disabled:opacity-40 transition-colors"
              >
                {finalizing ? "finalizing…" : "✕ Finalize Strategy"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {scan.error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-950/30 border-t border-red-900">
          {scan.error}
        </div>
      )}
    </div>
  )
}
