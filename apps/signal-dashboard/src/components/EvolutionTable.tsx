import { useCallback } from "react"
import { usePolling } from "../hooks/usePolling"
import { api } from "../lib/api"
import type { EvolutionRow } from "../lib/types"

const VERDICT_COLOR: Record<string, string> = {
  enter:  "text-green-400",
  hold:   "text-gray-400",
  exit:   "text-red-400",
  refuse: "text-yellow-400",
}

export function EvolutionTable() {
  const fetcher = useCallback(() => api.evolution(30), [])
  const { data, loading } = usePolling(fetcher, 15_000)

  if (loading) return <Skeleton />

  const rows = [...(data?.rows ?? [])].reverse()

  if (rows.length === 0) {
    return (
      <div className="bg-panel border border-border rounded-lg p-4">
        <h2 className="text-white font-semibold mb-2">Strategy Evolution Log</h2>
        <div className="text-gray-600 text-xs py-4 text-center">
          No evolution data yet. Run: <code className="text-violet-400">python3 quantitative_signal_agent.py --mode evolve</code>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">Strategy Evolution Log</h2>
        <span className="text-gray-500 text-xs">{data?.total} rows</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-border">
              <th className="text-left pb-2 pr-3">tick</th>
              <th className="text-left pb-2 pr-3">market</th>
              <th className="text-left pb-2 pr-3">regime</th>
              <th className="text-left pb-2 pr-3">verdict</th>
              <th className="text-right pb-2 pr-3">strength</th>
              <th className="text-right pb-2 pr-3">min_str</th>
              <th className="text-left pb-2">time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <EvolutionRowTr key={i} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EvolutionRowTr({ row }: { row: EvolutionRow }) {
  const time = new Date(row.timestamp).toLocaleTimeString()
  return (
    <tr className="border-b border-border/50 hover:bg-white/[0.02]">
      <td className="py-1.5 pr-3 text-gray-500">{row.tick}</td>
      <td className="py-1.5 pr-3 text-white font-medium">{row.market}</td>
      <td className="py-1.5 pr-3 text-gray-400">{row.regime}</td>
      <td className={`py-1.5 pr-3 font-medium ${VERDICT_COLOR[row.verdict] ?? "text-gray-400"}`}>
        {row.verdict}
      </td>
      <td className="py-1.5 pr-3 text-right text-gray-300">
        {(row.strength * 100).toFixed(0)}%
      </td>
      <td className="py-1.5 pr-3 text-right text-gray-500">
        {((row.thresholds?.min_strength ?? 0.4) * 100).toFixed(0)}%
      </td>
      <td className="py-1.5 text-gray-600">{time}</td>
    </tr>
  )
}

function Skeleton() {
  return (
    <div className="bg-panel border border-border rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-48 mb-4" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-8 bg-gray-800 rounded mb-1" />
      ))}
    </div>
  )
}
