import type {
  ScanResult, MarketScan, StrategyList, TrainingStatus, EvolutionLog,
} from "./types"

const BASE = "/api"

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

export const api = {
  health: ()                              => get<{ ok: boolean }>("/health"),
  signals: (market: string, tf = "1h")   => get<MarketScan>(`/signals/${market}?timeframe=${tf}`),
  scan: (markets: string[], tf = "1h")   => post<ScanResult>("/scan", { markets, timeframe: tf }),
  strategies: ()                         => get<StrategyList>("/strategy/active"),
  training: ()                           => get<TrainingStatus>("/training/status"),
  evolution: (limit = 100)               => get<EvolutionLog>(`/evolution?limit=${limit}`),
  launchStrategy: (market: string, direction: string, budget: number, mode: string) =>
    post<{ run_id: string; config: unknown }>("/strategy/launch", { market, direction, budget, mode }),
  finalizeStrategy: (market: string) =>
    post<{ ok: boolean }>("/strategy/finalize", { market }),
}
