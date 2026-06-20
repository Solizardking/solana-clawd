import { useCallback } from "react"
import { api } from "../lib/api"
import { usePolling } from "../hooks/usePolling"

export function StrategyPanel() {
  const fetcher = useCallback(() => api.strategies(), [])
  const { data, loading, refetch } = usePolling(fetcher, 10_000)

  if (loading) return <PanelSkeleton />

  const strategies = data?.active ?? []

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">Active Strategies</h2>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">{strategies.length} running</span>
          <button
            onClick={refetch}
            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 border border-gray-700 rounded"
          >
            ↻
          </button>
        </div>
      </div>

      {strategies.length === 0 ? (
        <div className="text-gray-600 text-xs py-4 text-center">
          No active strategies. Expand a market card below to launch one.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {strategies.map((s) => (
            <div
              key={s.run_id}
              className="flex items-center gap-3 px-3 py-2 bg-surface border border-border rounded text-xs"
            >
              <span className="text-violet-300 font-semibold w-12">{s.market}</span>
              <span className="text-gray-500 font-mono truncate flex-1">{s.run_id}</span>
              <StatusDot status={String(s.status?.status ?? "unknown")} />
              <button
                onClick={async () => {
                  await api.finalizeStrategy(s.market)
                  refetch()
                }}
                className="text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-2 py-0.5 rounded transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running" || status === "active"
      ? "bg-green-500"
      : status === "paused"
      ? "bg-yellow-500"
      : "bg-gray-600"
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={status} />
  )
}

function PanelSkeleton() {
  return (
    <div className="bg-panel border border-border rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-40 mb-4" />
      <div className="h-8 bg-gray-800 rounded" />
    </div>
  )
}
