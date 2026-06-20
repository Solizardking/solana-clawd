import { useState, useEffect, useCallback, useRef } from "react"

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  immediate = true,
): { data: T | null; error: string | null; loading: boolean; refetch: () => void; lastUpdated: Date | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const result = await fetcher()
      setData(result)
      setError(null)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    if (immediate) fetch_()
    timerRef.current = setInterval(fetch_, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetch_, intervalMs, immediate])

  return { data, error, loading, refetch: fetch_, lastUpdated }
}
