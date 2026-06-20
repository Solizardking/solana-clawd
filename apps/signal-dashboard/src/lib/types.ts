export type Direction = "long" | "short" | "neutral"
export type Regime = "trending" | "ranging" | "volatile" | "quiet" | "unknown"
export type Verdict = "enter" | "hold" | "exit" | "refuse"

export interface Signal {
  name: string
  direction: Direction
  strength: number
  reason: string
}

export interface MarketScan {
  timestamp: string
  market: string
  timeframe: string
  signals: Signal[]
  composite_direction: Direction
  composite_strength: number
  regime: Regime
  regime_atr_pct: number
  regime_adx: number
  verdict?: Verdict
  confidence?: number
  active_strategy?: string | null
  error?: string
}

export interface ScanResult {
  timestamp: string
  markets: MarketScan[]
  n_markets: number
  active_strategies: string[]
}

export interface ActiveStrategy {
  market: string
  run_id: string
  status: Record<string, unknown>
}

export interface StrategyList {
  timestamp: string
  active: ActiveStrategy[]
  count: number
}

export interface TrainingStatus {
  timestamp: string
  data: {
    cpt_records: number
    sft_records: number
    jupiter_records: number
    cpt_data_mb: number
  }
  checkpoints: {
    cpt_done: boolean
    sft_done: boolean
    cpt_path: string | null
    sft_path: string | null
  }
  eval: Record<string, unknown>
}

export interface EvolutionRow {
  tick: number
  timestamp: string
  market: string
  regime: Regime
  verdict: string
  strength: number
  confidence: number
  thresholds: Record<string, number>
  active_strategy?: string
}

export interface EvolutionLog {
  rows: EvolutionRow[]
  total: number
  timestamp: string
}
