import { useCallback } from "react"
import { usePolling } from "../hooks/usePolling"
import { api } from "../lib/api"

export function TrainingCard() {
  const fetcher = useCallback(() => api.training(), [])
  const { data, loading } = usePolling(fetcher, 30_000)

  if (loading) return <Skeleton />

  const d = data?.data
  const ckpt = data?.checkpoints
  const evalData = data?.eval as Record<string, unknown> | undefined

  function Bar({ value, max, label }: { value: number; max: number; label: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 text-gray-500 text-xs">{label}</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden">
          <div className="h-full bg-violet-600 signal-bar" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-20 text-right text-gray-300 text-xs">{value.toLocaleString()}</span>
      </div>
    )
  }

  function CkptBadge({ done, label }: { done: boolean; label: string }) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border rounded ${
          done
            ? "bg-green-900/30 text-green-300 border-green-800"
            : "bg-gray-800 text-gray-500 border-gray-700"
        }`}
      >
        {done ? "✓" : "○"} {label}
      </span>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-white font-semibold mb-4">Training Pipeline</h2>

      <div className="flex flex-col gap-2 mb-4">
        <Bar value={d?.cpt_records ?? 0} max={25_000} label="CPT records" />
        <Bar value={d?.sft_records ?? 0} max={35_000} label="SFT records" />
        <Bar value={d?.jupiter_records ?? 0} max={2_000} label="Jupiter txns" />
      </div>

      <div className="text-xs text-gray-500 mb-3">
        CPT corpus: <span className="text-gray-300">{d?.cpt_data_mb?.toFixed(1)} MB</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <CkptBadge done={ckpt?.cpt_done ?? false} label="CPT checkpoint" />
        <CkptBadge done={ckpt?.sft_done ?? false} label="SFT checkpoint" />
      </div>

      {evalData && typeof evalData.avg_score === "number" && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-xs text-gray-500 mb-1">Latest eval</div>
          <div className="text-green-400 text-sm font-medium">
            avg_score: {(evalData.avg_score as number).toFixed(3)}
          </div>
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="bg-panel border border-border rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-40 mb-4" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-3 bg-gray-800 rounded mb-2" />
      ))}
    </div>
  )
}
