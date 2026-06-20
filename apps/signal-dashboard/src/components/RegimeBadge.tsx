import type { Regime } from "../lib/types"

const REGIME_STYLES: Record<Regime, string> = {
  trending:  "bg-blue-900/50 text-blue-300 border-blue-800",
  ranging:   "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  volatile:  "bg-red-900/40 text-red-300 border-red-800",
  quiet:     "bg-gray-800 text-gray-400 border-gray-700",
  unknown:   "bg-gray-800 text-gray-500 border-gray-700",
}

const REGIME_ICON: Record<Regime, string> = {
  trending:  "→",
  ranging:   "↔",
  volatile:  "⚡",
  quiet:     "◌",
  unknown:   "?",
}

export function RegimeBadge({ regime }: { regime: Regime }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border rounded ${REGIME_STYLES[regime]}`}
    >
      <span>{REGIME_ICON[regime]}</span>
      {regime}
    </span>
  )
}
