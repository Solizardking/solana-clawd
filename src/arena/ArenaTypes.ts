/**
 * Arena Tournament Types
 *
 * Type definitions for agent tournaments: brackets, matches, rounds,
 * model registration with zkML tiers, and on-chain settlement.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Model Registration
// ─────────────────────────────────────────────────────────────────────────────

export type ModelSource = 'hf' | 'ollama' | 'openrouter' | 'custom'

export type ZkmlStatus = 'none' | 'pending' | 'circuit_generated' | 'verified'

export interface ModelRegistration {
  /** Unique model identifier */
  id: string
  /** Human-readable model name */
  name: string
  /** Source: Hugging Face, Ollama, OpenRouter, or custom */
  source: ModelSource
  /** Source-specific identifier (e.g. 'meta-llama/Llama-3.1-8B') */
  sourceId: string
  /** Model hash (SHA-256 of weights/config) */
  modelHash: string
  /** Whether zkML verification is enabled */
  zkmlEnabled: boolean
  /** zkML proof status */
  zkmlStatus: ZkmlStatus
  /** Verification key hash (committed on-chain if zkml enabled) */
  verificationKeyHash?: string
  /** ONNX export CID (IPFS/Arweave) for circuit generation */
  circuitCid?: string
  /** Solana transaction where verification key was committed */
  commitTx?: string
  /** Timestamp of registration */
  registeredAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Competitor
// ─────────────────────────────────────────────────────────────────────────────

export interface ArenaCompetitor {
  /** Agent ID (maps to AGENTS array or Metaplex mint) */
  agentId: string
  /** Display name */
  name: string
  /** Call sign */
  callSign: string
  /** Color theme */
  color: string
  /** accent theme */
  accent: string
  /** Registered model (if any) */
  model?: ModelRegistration
  /** Initial ELO rating */
  baseElo: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Match Types
// ─────────────────────────────────────────────────────────────────────────────

export type MatchStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'forfeited'
  | 'cancelled'

export type MatchSide = 'left' | 'right'

export interface MatchResult {
  /** Side identifier */
  side: MatchSide
  /** Score (0-100 scale, or arbitary points) */
  score: number
  /** Whether this side won the match */
  won: boolean
  /** PnL impact from this match */
  pnl: number
  /** zk-proof hash if verified */
  proofHash?: string
  /** Whether the model's decision was zk-verified */
  zkVerified: boolean
}

export interface ArenaMatch {
  /** Unique match ID */
  id: string
  /** Tournament round */
  round: number
  /** Left competitor */
  left: ArenaCompetitor
  /** Right competitor */
  right: ArenaCompetitor
  /** Match status */
  status: MatchStatus
  /** Result (filled when completed) */
  result?: {
    left: MatchResult
    right: MatchResult
  }
  /** Market state hash (the input to the model decision) */
  marketStateHash?: string
  /** Timestamps */
  scheduledAt: string
  startedAt?: string
  completedAt?: string
  /** Whether this match requires zk-verified models */
  requireZkProof: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Bracket Types
// ─────────────────────────────────────────────────────────────────────────────

export type BracketFormat = 'single_elimination' | 'double_elimination' | 'round_robin'

export type BracketStatus = 'draft' | 'active' | 'completed'

export interface BracketRound {
  /** Round number (1 = first round) */
  round: number
  /** Matches in this round */
  matches: ArenaMatch[]
  /** Whether all matches in this round are completed */
  completed: boolean
}

export interface TournamentBracket {
  /** Tournament ID */
  id: string
  /** Display name */
  name: string
  /** Bracket format */
  format: BracketFormat
  /** Current status */
  status: BracketStatus
  /** All competitors */
  competitors: ArenaCompetitor[]
  /** Tournament rounds */
  rounds: BracketRound[]
  /** Current round number (0-indexed) */
  currentRound: number
  /** Whether only zk-verified models are allowed */
  zkOnly: boolean
  /** Season identifier */
  season: string
  /** Created timestamp */
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Tournament Standings
// ─────────────────────────────────────────────────────────────────────────────

export interface TournamentStanding {
  /** Agent ID */
  agentId: string
  /** Display name */
  name: string
  /** Call sign */
  callSign: string
  /** Color */
  color: string
  /** Matches played */
  played: number
  /** Matches won */
  won: number
  /** Matches lost */
  lost: number
  /** Win rate */
  winRate: number
  /** Current ELO */
  elo: number
  /** Cumulative PnL */
  pnl: number
  /** Whether model is zk-verified */
  zkVerified: boolean
  /** Proof count (number of zk proofs submitted) */
  proofCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tournament Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface TournamentConfig {
  /** Tournament name */
  name: string
  /** Bracket format */
  format: BracketFormat
  /** Number of competitors (auto-filled from pool) */
  competitorCount: number
  /** Whether to require zk-verified models */
  zkOnly: boolean
  /** Season identifier */
  season: string
  /** Starting ELO for new competitors */
  baseElo: number
  /** Round-robin: number of passes through the pool */
  rounds: number
  /** Elimination: best-of series (1, 3, 5, 7) */
  bestOf: number
}

// ─────────────────────────────────────────────────────────────────────────────
// On-Chain Settlement
// ─────────────────────────────────────────────────────────────────────────────

export interface OnchainSettlement {
  /** Tournament ID */
  tournamentId: string
  /** Solana transaction signature */
  signature: string
  /** Slot where settled */
  slot: number
  /** Settlement data (serialized results) */
  data: string
  /** Timestamp */
  settledAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// zkML Proof Structure
// ─────────────────────────────────────────────────────────────────────────────

export interface ZkProof {
  /** Model ID used */
  modelId: string
  /** Input hash (market state) */
  inputHash: string
  /** Output hash (decision) */
  outputHash: string
  /** Proof bytes (hex-encoded) */
  proof: string
  /** Verification key hash */
  verificationKeyHash: string
  /** Solana transaction where proof was submitted */
  submitTx?: string
  /** Timestamp */
  generatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Types
// ─────────────────────────────────────────────────────────────────────────────

export type ArenaEvent =
  | { type: 'match_scheduled'; match: ArenaMatch }
  | { type: 'match_started'; matchId: string }
  | { type: 'match_completed'; matchId: string; result: ArenaMatch['result'] }
  | { type: 'round_completed'; round: number }
  | { type: 'tournament_completed'; winner: ArenaCompetitor }
  | { type: 'model_registered'; registration: ModelRegistration }
  | { type: 'zk_proof_submitted'; proof: ZkProof }
  | { type: 'onchain_settlement'; settlement: OnchainSettlement }