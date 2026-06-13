import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  generateBracket,
  calculateStandings,
} from './TournamentEngine'
import type {
  TournamentConfig,
  TournamentBracket,
  TournamentStanding,
  ArenaCompetitor,
  BracketFormat,
  ZkmlStatus,
} from './ArenaTypes'

// ── Default agents from App.tsx — import pattern ────────────────────────────

interface TournamentPanelProps {
  agents: Array<{
    id: string
    name: string
    callSign: string
    color: string
    accent: string
    seed: number
    baseEquity: number
    metrics: {
      edge: number
      risk: number
      speed: number
      discipline: number
    }
  }>
  round: number
  running: boolean
}

function formatWinRate(value: number) {
  return `${value}%`
}

function signedPercent(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatElo(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function zkStatusLabel(status: ZkmlStatus): string {
  switch (status) {
    case 'verified': return '✓ zk'
    case 'circuit_generated': return 'circuit'
    case 'pending': return 'pending'
    case 'none': return ''
  }
}

export default function TournamentPanel({ agents, round, running }: TournamentPanelProps) {
  const [format, setFormat] = useState<BracketFormat>('round_robin')
  const [zkOnly, setZkOnly] = useState(false)
  const [rounds, setRounds] = useState(1)

  // Build competitors from agents with model stubs
  const competitors: ArenaCompetitor[] = useMemo(() => {
    return agents.map((agent, index) => ({
      agentId: agent.id,
      name: agent.name,
      callSign: agent.callSign,
      color: agent.color,
      accent: agent.accent,
      baseElo: 800 + agent.metrics.edge * 4 + agent.metrics.discipline * 2,
      model: index < 3 ? {
        id: `model-${agent.id}`,
        name: `${agent.name} Model`,
        source: 'hf' as const,
        sourceId: `solana/${agent.callSign.toLowerCase()}-trader`,
        modelHash: `sha256:${agent.seed?.toString(16).padStart(8, '0') ?? '00000000'}`,
        zkmlEnabled: index < 2,
        zkmlStatus: (index === 0 ? 'verified' : index === 1 ? 'pending' : 'none') as ZkmlStatus,
        registeredAt: new Date().toISOString(),
      } : undefined,
    }))
  }, [agents])

  // Generate bracket
  const config: TournamentConfig = {
    name: `Arena Season 01 — Round ${round}`,
    format,
    competitorCount: competitors.length,
    zkOnly,
    season: '01',
    baseElo: 800,
    rounds,
    bestOf: 1,
  }

  const bracket: TournamentBracket = useMemo(
    () => generateBracket(config, competitors),
    [config, competitors, format, zkOnly, rounds],
  )

  const standings: TournamentStanding[] = useMemo(
    () => calculateStandings(bracket),
    [bracket],
  )

  return (
    <section className="bracketPanel" id="tournament">
      <div className="sectionTitle">
        <span>Tournament Arena</span>
        <strong>bracket {format.replace('_', ' ')} · season {bracket.season}</strong>
      </div>

      {/* Controls */}
      <div className="bracketControls">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as BracketFormat)}
        >
          <option value="round_robin">Round Robin</option>
          <option value="single_elimination">Single Elimination</option>
          <option value="double_elimination">Double Elimination</option>
        </select>

        <button
          type="button"
          className={zkOnly ? 'active' : ''}
          onClick={() => setZkOnly((v) => !v)}
        >
          {zkOnly ? 'zk-Only ON' : 'zk-Only OFF'}
        </button>

        <button
          type="button"
          disabled={format !== 'round_robin'}
          style={{ opacity: format !== 'round_robin' ? 0.4 : 1 }}
          onClick={() => setRounds((r) => Math.min(r + 1, 5))}
        >
          Rounds: {rounds}
        </button>

        <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 'auto' }}>
          {competitors.length} agents · {bracket.rounds.length} rounds
          {zkOnly && ' · zk-verified only'}
        </span>
      </div>

      {/* Bracket Display */}
      <div className="bracketGrid">
        {bracket.rounds.slice(0, 8).map((bracketRound) => (
          <div key={bracketRound.round}>
            <div className="bracketRoundLabel">
              <span>Round {bracketRound.round}</span>
              <code>{bracketRound.matches.length} match{bracketRound.matches.length !== 1 ? 'es' : ''}</code>
              {bracketRound.completed && <code style={{ color: 'var(--green)' }}>complete</code>}
            </div>

            <div className="elimBracket">
              {bracketRound.matches.slice(0, 4).map((match) => {
                const isCompleted = match.status === 'completed'
                const zkActive = match.requireZkProof
                const leftResult = match.result?.left
                const rightResult = match.result?.right

                return (
                  <div
                    key={match.id}
                    className={`bracketMatch ${isCompleted ? 'completed' : ''} ${zkActive ? 'zklive' : ''}`}
                  >
                    <div className={`bracketSide ${leftResult?.won ? 'winner' : ''}`}>
                      <span>{match.left.name}</span>
                      <span>
                        {leftResult?.score ?? '—'}
                        {match.left.model?.zkmlStatus === 'verified' && (
                          <span className="zkBadge">zk</span>
                        )}
                      </span>
                    </div>
                    <div className={`bracketSide ${rightResult?.won ? 'winner' : ''}`}>
                      <span>{match.right.name}</span>
                      <span>
                        {rightResult?.score ?? '—'}
                        {match.right.model?.zkmlStatus === 'verified' && (
                          <span className="zkBadge">zk</span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
              {bracketRound.matches.length > 4 && (
                <div className="bracketEmpty" style={{ padding: 12, fontSize: 11 }}>
                  +{bracketRound.matches.length - 4} more matches
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Standings */}
      <div style={{ marginTop: 18 }}>
        <div className="sectionTitle">
          <span>Standings</span>
          <strong>{standings.length} competitors</strong>
        </div>
        <table className="standingsTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>Played</th>
              <th>W/L</th>
              <th>Win Rate</th>
              <th>Elo</th>
              <th>PnL</th>
              <th>Proofs</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => (
              <tr key={standing.agentId}>
                <td>{index + 1}</td>
                <td>
                  <span className="nameCell">
                    <span className="colorDot" style={{ background: standing.color }} />
                    {standing.name}
                    {standing.zkVerified && (
                      <span className="zkBadge" style={{ marginLeft: 4 }}>zk</span>
                    )}
                  </span>
                </td>
                <td>{standing.played}</td>
                <td>{standing.won}/{standing.lost}</td>
                <td>{formatWinRate(standing.winRate)}</td>
                <td>{formatElo(standing.elo)}</td>
                <td className={standing.pnl >= 0 ? 'positive' : 'negative'}>
                  {signedPercent(standing.pnl)}
                </td>
                <td>{standing.proofCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}