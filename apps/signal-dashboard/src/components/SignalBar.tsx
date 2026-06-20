import type { Signal } from "../lib/types"

const SIGNAL_LABELS: Record<string, string> = {
  rsi: "RSI",
  macd: "MACD",
  bbands: "BBands",
  atr_vol: "ATR Vol",
  adx_trend: "ADX Trend",
  funding: "Funding",
  ob_imbalance: "OB Imbal",
}

interface Props {
  signal: Signal
  compact?: boolean
}

export function SignalBar({ signal, compact = false }: Props) {
  const pct = Math.round(signal.strength * 100)

  const barColor =
    signal.direction === "long"
      ? "bg-green-500"
      : signal.direction === "short"
      ? "bg-red-500"
      : "bg-gray-700"

  const dirColor =
    signal.direction === "long"
      ? "text-green-400"
      : signal.direction === "short"
      ? "text-red-400"
      : "text-gray-500"

  const label = SIGNAL_LABELS[signal.name] ?? signal.name

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-16 text-gray-400 text-xs">{label}</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden">
          <div
            className={`h-full signal-bar ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`w-8 text-right text-xs ${dirColor}`}>
          {signal.direction === "neutral" ? "–" : signal.direction === "long" ? "▲" : "▼"}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-0.5">
      <span className="w-20 text-gray-400 text-xs shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-800/80 rounded overflow-hidden">
        <div
          className={`h-full signal-bar ${barColor} opacity-90`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-6 text-center text-xs font-medium ${dirColor}`}>
        {signal.direction === "neutral" ? "–" : signal.direction === "long" ? "▲" : "▼"}
      </span>
      <span className="w-32 text-gray-500 text-xs truncate" title={signal.reason}>
        {signal.reason}
      </span>
    </div>
  )
}
