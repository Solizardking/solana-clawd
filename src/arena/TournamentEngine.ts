/**
 * Tournament Engine
 *
 * Core logic for bracket generation, match pairing, ELO calculation,
 * and standings tracking. Supports single-elimination, double-elimination,
 * and round-robin formats.
 */

import type {
  TournamentConfig,
  TournamentBracket,
  TournamentStanding,
  ArenaCompetitor,
  ArenaMatch,
  BracketRound,
  MatchResult,
  MatchSide,
} from './ArenaTypes'

// ─────────────────────────────────────────────────────────────────────────────
// ELO Constants
// ─────────────────────────────────────────────────────────────────────────────

const K_FACTOR = 32
const EXPECTED_SCALE = 400

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${ts}-${rand}`
}

// ─────────────────────────────────────────────────────────────────────────────
// ELO Rating
// ─────────────────────────────────────────────────────────────────────────────

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / EXPECTED_SCALE))
}

export function updateElo(
  winnerElo: number,
  loserElo: number,
  isDraw = false,
): { winnerNew: number; loserNew: number } {
  const eW = expectedScore(winnerElo, loserElo)
  const eL = expectedScore(loserElo, winnerElo)

  if (isDraw) {
    return {
      winnerNew: Math.round(winnerElo + K_FACTOR * (0.5 - eW)),
      loserNew: Math.round(loserElo + K_FACTOR * (0.5 - eL)),
    }
  }

  return {
    winnerNew: Math.round(winnerElo + K_FACTOR * (1 - eW)),
    loserNew: Math.round(loserElo + K_FACTOR * (0 - eL)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bracket Generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateRoundRobin(
  config: TournamentConfig,
  competitors: ArenaCompetitor[],
): TournamentBracket {
  const id = generateId()
  const now = new Date().toISOString()
  const rounds: BracketRound[] = []
  let matchIndex = 0

  // Each competitor plays every other competitor `config.rounds` times
  for (let pass = 0; pass < config.rounds; pass++) {
    const shuffled = shuffleArray(competitors)
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        const left = shuffled[i]
        const right = shuffled[j]
        const roundNum = pass * (shuffled.length - 1) + j

        const match: ArenaMatch = {
          id: `${id}-m${matchIndex++}`,
          round: roundNum,
          left,
          right,
          status: 'scheduled',
          scheduledAt: now,
          requireZkProof: config.zkOnly && left.model?.zkmlEnabled === true && right.model?.zkmlEnabled === true,
        }

        let round = rounds.find((r) => r.round === roundNum)
        if (!round) {
          round = { round: roundNum, matches: [], completed: false }
          rounds.push(round)
        }
        round.matches.push(match)
      }
    }
  }

  return {
    id,
    name: config.name,
    format: 'round_robin',
    status: 'draft',
    competitors,
    rounds,
    currentRound: 0,
    zkOnly: config.zkOnly,
    season: config.season,
    createdAt: now,
  }
}

export function generateSingleElimination(
  config: TournamentConfig,
  competitors: ArenaCompetitor[],
): TournamentBracket {
  const id = generateId()
  const now = new Date().toISOString()

  // Pad to next power of 2 with byes
  const size = Math.pow(2, Math.ceil(Math.log2(competitors.length)))
  const seeded = shuffleArray(competitors)

  // Create first-round pairings (1v2, 3v4, etc.)
  const firstRound: ArenaMatch[] = []
  for (let i = 0; i < size / 2; i++) {
    const left = seeded[i * 2] ?? null
    const right = seeded[i * 2 + 1] ?? null
    if (!left || !right) continue

    firstRound.push({
      id: `${id}-r1-m${i}`,
      round: 1,
      left,
      right,
      status: 'scheduled',
      scheduledAt: now,
      requireZkProof: config.zkOnly && left.model?.zkmlEnabled === true && right.model?.zkmlEnabled === true,
    })
  }

  const totalRounds = Math.log2(size)
  const rounds: BracketRound[] = [
    { round: 1, matches: firstRound, completed: false },
  ]

  // Create empty slots for subsequent rounds
  for (let r = 2; r <= totalRounds; r++) {
    const matchCount = size / Math.pow(2, r)
    const matches: ArenaMatch[] = []
    for (let i = 0; i < matchCount; i++) {
      matches.push({
        id: `${id}-r${r}-m${i}`,
        round: r,
        left: { agentId: 'bye', name: 'TBD', callSign: '???', color: '#666', accent: '#333', baseElo: 0 },
        right: { agentId: 'bye', name: 'TBD', callSign: '???', color: '#666', accent: '#333', baseElo: 0 },
        status: 'scheduled',
        scheduledAt: now,
        requireZkProof: config.zkOnly,
      })
    }
    rounds.push({ round: r, matches, completed: false })
  }

  return {
    id,
    name: config.name,
    format: 'single_elimination',
    status: 'draft',
    competitors,
    rounds,
    currentRound: 0,
    zkOnly: config.zkOnly,
    season: config.season,
    createdAt: now,
  }
}

export function generateBracket(
  config: TournamentConfig,
  competitors: ArenaCompetitor[],
): TournamentBracket {
  switch (config.format) {
    case 'round_robin':
      return generateRoundRobin(config, competitors)
    case 'single_elimination':
      return generateSingleElimination(config, competitors)
    case 'double_elimination':
      // Future: implement double-elimination bracket
      return generateSingleElimination(config, competitors)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Match Resolution
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchResolutionInput {
  leftScore: number
  rightScore: number
  zkVerified: boolean
  leftProofHash?: string
  rightProofHash?: string
}

export function resolveMatch(
  match: ArenaMatch,
  input: MatchResolutionInput,
): { match: ArenaMatch; leftNewElo: number; rightNewElo: number } {
  const leftWon = input.leftScore > input.rightScore
  const isDraw = input.leftScore === input.rightScore
  const now = new Date().toISOString()

  const eloUpdate = updateElo(match.left.baseElo, match.right.baseElo, isDraw)

  const leftResult: MatchResult = {
    side: 'left',
    score: input.leftScore,
    won: leftWon || isDraw,
    pnl: leftWon ? Math.round(input.leftScore * 1.2) : Math.round(-input.rightScore * 0.8),
    proofHash: input.leftProofHash,
    zkVerified: input.zkVerified,
  }

  const rightResult: MatchResult = {
    side: 'right',
    score: input.rightScore,
    won: !leftWon || isDraw,
    pnl: !leftWon ? Math.round(input.rightScore * 1.2) : Math.round(-input.leftScore * 0.8),
    proofHash: input.rightProofHash,
    zkVerified: input.zkVerified,
  }

  return {
    match: {
      ...match,
      status: 'completed',
      result: { left: leftResult, right: rightResult },
      completedAt: now,
    },
    leftNewElo: eloUpdate.winnerNew,
    rightNewElo: eloUpdate.loserNew,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standings Calculation
// ─────────────────────────────────────────────────────────────────────────────

export function calculateStandings(
  bracket: TournamentBracket,
): TournamentStanding[] {
  const standingsMap = new Map<string, TournamentStanding>()

  for (const competitor of bracket.competitors) {
    standingsMap.set(competitor.agentId, {
      agentId: competitor.agentId,
      name: competitor.name,
      callSign: competitor.callSign,
      color: competitor.color,
      played: 0,
      won: 0,
      lost: 0,
      winRate: 0,
      elo: competitor.baseElo,
      pnl: 0,
      zkVerified: competitor.model?.zkmlStatus === 'verified',
      proofCount: 0,
    })
  }

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.status !== 'completed' || !match.result) continue

      const leftStanding = standingsMap.get(match.left.agentId)
      const rightStanding = standingsMap.get(match.right.agentId)

      if (leftStanding) {
        leftStanding.played++
        if (match.result.left.won) leftStanding.won++
        else leftStanding.lost++
        leftStanding.pnl += match.result.left.pnl
        if (match.result.left.zkVerified) leftStanding.proofCount++
      }

      if (rightStanding) {
        rightStanding.played++
        if (match.result.right.won) rightStanding.won++
        else rightStanding.lost++
        rightStanding.pnl += match.result.right.pnl
        if (match.result.right.zkVerified) rightStanding.proofCount++
      }
    }
  }

  const standings = Array.from(standingsMap.values())
  for (const standing of standings) {
    standing.winRate = standing.played > 0
      ? Math.round((standing.won / standing.played) * 100)
      : 0
    standing.elo += standing.won * 16 - standing.lost * 8
  }

  return standings.sort((a, b) => b.won - a.won || b.pnl - a.pnl || b.elo - a.elo)
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Generation Helpers (for scripts/CLI)
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelRegistrationScriptParams {
  modelName: string
  source: 'hf' | 'ollama' | 'openrouter'
  sourceId: string
  modelHash: string
  zkmlEnabled: boolean
}

export function buildRegisterModelCommand(params: ModelRegistrationScriptParams): string {
  const flags = [
    `--name "${params.modelName}"`,
    `--source ${params.source}`,
    `--source-id "${params.sourceId}"`,
    `--hash "${params.modelHash}"`,
  ]
  if (params.zkmlEnabled) {
    flags.push('--zkml')
  }
  return `bash scripts/register-model.sh ${flags.join(' ')}`
}

export function buildVerifyModelCommand(modelId: string, inputHash: string, outputHash: string): string {
  return `bash scripts/verify-model.sh ${modelId} ${inputHash} ${outputHash}`
}