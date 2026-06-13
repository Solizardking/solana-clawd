import "./index.css"
import { useEffect, useMemo, useState } from "react"
import type { CSSProperties, FormEvent } from "react"
import LibraryApp from "./LibraryApp.js"
import TournamentPanel from "./arena/TournamentPanel.js"

type Agent = {
  id: string
  name: string
  callSign: string
  role: string
  lane: string
  box: string
  market: string
  side: "long" | "short" | "hedged"
  color: string
  accent: string
  thesis: string
  seed: number
  baseEquity: number
  metrics: {
    edge: number
    risk: number
    speed: number
    discipline: number
  }
}

type AgentScore = Agent & {
  elo: number
  pnl: number
  wins: number
  drawdown: number
  liquidationRisk: number
  heat: number
  proof: string
  trainingLevel?: number
  trainingSamples?: number
}

type ConversationLine = {
  speaker: string
  label: string
  text: string
  tone: "left" | "right" | "referee" | "system"
}

type TrainingMode = "perps" | "risk" | "dialogue"

type UserSession = {
  handle: string
  wallet: string
  agentId: string
  createdAt: string
}

type TrainingState = {
  agentId: string
  level: number
  samples: number
  reward: number
  riskBias: number
  mode: TrainingMode
  autoTrain: boolean
  lastTrainedAt: string | null
  memory: string[]
}

type RealtimeSnapshot = {
  status: "connecting" | "live" | "degraded" | "offline"
  slot: number | null
  blockHeight: number | null
  health: string
  latencyMs: number | null
  quoteOut: number | null
  updatedAt: string | null
  source: string
  error?: string
}

type PhantomProvider = {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey: { toString: () => string } }>
  disconnect?: () => Promise<void>
}

declare global {
  interface Window {
    solana?: PhantomProvider
  }
}

const boxBannerUrl = new URL("../assets/box-agents-banner.svg", import.meta.url).href
const scoreboardUrl = new URL("../assets/minted-scoreboard.svg", import.meta.url).href

const DEEPSEEK_RUNTIME = {
  openAiBaseUrl: "https://api.deepseek.com",
  anthropicBaseUrl: "https://api.deepseek.com/anthropic",
  model: "deepseek-v4-pro",
  fastModel: "deepseek-v4-flash",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  rpcEnv: "HELIUS_RPC_URL",
}

const SOLANA_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com"
const JUPITER_SOL_USDC_QUOTE_URL =
  "https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qTJzoE9A6NsY7p2YyJ61TmxZE&amount=1000000000&slippageBps=30"
const SESSION_STORAGE_KEY = "clawd-arena-session"
const TRAINING_STORAGE_KEY_PREFIX = "clawd-arena-training:"

const DEFAULT_REALTIME_SNAPSHOT: RealtimeSnapshot = {
  status: "connecting",
  slot: null,
  blockHeight: null,
  health: "checking",
  latencyMs: null,
  quoteOut: null,
  updatedAt: null,
  source: "public Solana RPC",
}

const AGENTS: Agent[] = [
  {
    id: "phoenix-keeper",
    name: "Phoenix Keeper",
    callSign: "PK-17",
    role: "Perps execution",
    lane: "SOL-PERP",
    box: "box/perps-a",
    market: "SOL-PERP",
    side: "long",
    color: "#14f195",
    accent: "#071b14",
    thesis: "Momentum with funding guardrails",
    seed: 3,
    baseEquity: 10_420,
    metrics: { edge: 82, risk: 44, speed: 78, discipline: 86 },
  },
  {
    id: "basis-forge",
    name: "Basis Forge",
    callSign: "BF-09",
    role: "Funding-rate arb",
    lane: "JUP-PERP",
    box: "box/perps-b",
    market: "JUP-PERP",
    side: "hedged",
    color: "#8be8ff",
    accent: "#08202a",
    thesis: "Basis spread capture",
    seed: 7,
    baseEquity: 9_880,
    metrics: { edge: 76, risk: 31, speed: 64, discipline: 92 },
  },
  {
    id: "liquidation-scout",
    name: "Liquidation Scout",
    callSign: "LS-44",
    role: "Liquidation radar",
    lane: "BTC-PERP",
    box: "box/sentinel-a",
    market: "BTC-PERP",
    side: "short",
    color: "#f97316",
    accent: "#271207",
    thesis: "Crowded leverage reversal",
    seed: 11,
    baseEquity: 11_250,
    metrics: { edge: 71, risk: 58, speed: 88, discipline: 73 },
  },
  {
    id: "vault-sentinel",
    name: "Vault Sentinel",
    callSign: "VS-02",
    role: "Risk governor",
    lane: "USDC",
    box: "box/risk-a",
    market: "USDC",
    side: "hedged",
    color: "#f8e16c",
    accent: "#211e08",
    thesis: "Capital preservation gate",
    seed: 13,
    baseEquity: 10_060,
    metrics: { edge: 68, risk: 22, speed: 52, discipline: 96 },
  },
  {
    id: "signal-forge",
    name: "Signal Forge",
    callSign: "SF-31",
    role: "Order-flow analyst",
    lane: "BONK-PERP",
    box: "box/signal-a",
    market: "BONK-PERP",
    side: "long",
    color: "#c084fc",
    accent: "#201127",
    thesis: "Flow burst detection",
    seed: 17,
    baseEquity: 9_520,
    metrics: { edge: 79, risk: 63, speed: 93, discipline: 66 },
  },
  {
    id: "oracle-cutlass",
    name: "Oracle Cutlass",
    callSign: "OC-22",
    role: "Oracle watchdog",
    lane: "PYTH",
    box: "box/oracle-a",
    market: "PYTH",
    side: "hedged",
    color: "#ef4444",
    accent: "#270b0b",
    thesis: "Stale feed vetoes",
    seed: 23,
    baseEquity: 10_770,
    metrics: { edge: 73, risk: 37, speed: 69, discipline: 89 },
  },
]

const POSITIONS = [
  { symbol: "SOL-PERP", notional: 125_000, funding: 0.014, leverage: "2.8x", mode: "paper" },
  { symbol: "JUP-PERP", notional: 82_400, funding: -0.006, leverage: "1.9x", mode: "paper" },
  { symbol: "BTC-PERP", notional: 164_200, funding: 0.009, leverage: "2.2x", mode: "paper" },
  { symbol: "BONK-PERP", notional: 46_800, funding: 0.031, leverage: "1.4x", mode: "paper" },
]

function createTrainingState(agentId: string): TrainingState {
  return {
    agentId,
    level: 1,
    samples: 0,
    reward: 0,
    riskBias: 54,
    mode: "perps",
    autoTrain: false,
    lastTrainedAt: null,
    memory: [],
  }
}

function storageKeyForTraining(session: UserSession) {
  return `${TRAINING_STORAGE_KEY_PREFIX}${session.handle.toLowerCase()}:${session.agentId}`
}

function readStoredSession(): UserSession | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UserSession>
    const agentId = typeof parsed.agentId === "string" && AGENTS.some((agent) => agent.id === parsed.agentId) ? parsed.agentId : AGENTS[0].id
    if (!parsed.handle || !agentId) return null

    return {
      handle: String(parsed.handle),
      wallet: typeof parsed.wallet === "string" ? parsed.wallet : "",
      agentId,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function persistSession(session: UserSession | null) {
  if (typeof window === "undefined") return
  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function readStoredTraining(session: UserSession | null): TrainingState | null {
  if (typeof window === "undefined" || !session) return null

  try {
    const raw = window.localStorage.getItem(storageKeyForTraining(session))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TrainingState>
    return {
      ...createTrainingState(session.agentId),
      ...parsed,
      agentId: session.agentId,
      level: clamp(Number(parsed.level ?? 1), 1, 50),
      samples: Math.max(0, Number(parsed.samples ?? 0)),
      reward: Number(parsed.reward ?? 0),
      riskBias: clamp(Number(parsed.riskBias ?? 54), 0, 100),
      mode: parsed.mode === "risk" || parsed.mode === "dialogue" || parsed.mode === "perps" ? parsed.mode : "perps",
      autoTrain: Boolean(parsed.autoTrain),
      memory: Array.isArray(parsed.memory) ? parsed.memory.slice(0, 6).map(String) : [],
    }
  } catch {
    return null
  }
}

function persistTraining(session: UserSession | null, training: TrainingState) {
  if (typeof window === "undefined" || !session) return
  window.localStorage.setItem(storageKeyForTraining(session), JSON.stringify(training))
}

function truncateWallet(value: string) {
  if (!value) return "not linked"
  if (value.length <= 14) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function formatTime(value: string | null) {
  if (!value) return "pending"
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function formatSolQuote(value: number | null) {
  if (value === null) return "pending"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number | null) {
  if (value === null) return "pending"
  return new Intl.NumberFormat("en-US").format(value)
}

function buildConversation(pair: { left: AgentScore; right: AgentScore }, leader: AgentScore, round: number, totalEquity: number): ConversationLine[] {
  const trailing = leader.id === pair.left.id ? pair.right : pair.left
  const spread = Math.abs(pair.left.elo - pair.right.elo)
  return [
    {
      speaker: "system",
      label: "DeepSeek control",
      tone: "system",
      text: `OpenAI base_url=${DEEPSEEK_RUNTIME.openAiBaseUrl} model=${DEEPSEEK_RUNTIME.model} thinking=enabled rpc=${DEEPSEEK_RUNTIME.rpcEnv}`,
    },
    {
      speaker: pair.left.name,
      label: pair.left.callSign,
      tone: "left",
      text: `${pair.left.market} ${pair.left.side}: ${pair.left.thesis}. I will size inside paper limits until Helius confirms the tape and risk stays under ${pair.left.liquidationRisk}%.`,
    },
    {
      speaker: pair.right.name,
      label: pair.right.callSign,
      tone: "right",
      text: `${pair.right.market} ${pair.right.side}: ${pair.right.thesis}. I challenge the route with funding, spread, and drawdown checks before any scoreboard claim.`,
    },
    {
      speaker: "referee",
      label: "arena",
      tone: "referee",
      text: `Round ${round}: ${leader.name} takes priority by ${spread} Elo points. ${trailing.name} must reduce exposure or beat ${formatUsd(totalEquity)} aggregate equity on the next tick.`,
    },
  ]
}

function usePath() {
  const [path, setPath] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"))

  useEffect(() => {
    const onChange = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onChange)
    window.addEventListener("pushstate", onChange as EventListener)
    return () => {
      window.removeEventListener("popstate", onChange)
      window.removeEventListener("pushstate", onChange as EventListener)
    }
  }, [])

  return path
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

type RpcBatchEntry = {
  id: number
  result?: unknown
  error?: { message?: string }
}

type JupiterQuote = {
  outAmount?: string
}

function rpcResult(entries: RpcBatchEntry[], id: number) {
  return entries.find((entry) => entry.id === id)?.result
}

function rpcNumber(entries: RpcBatchEntry[], id: number) {
  const value = rpcResult(entries, id)
  return typeof value === "number" ? value : null
}

async function fetchRealtimeSnapshot(): Promise<RealtimeSnapshot> {
  const startedAt = performance.now()
  const rpcRequest = [
    { jsonrpc: "2.0", id: 1, method: "getHealth" },
    { jsonrpc: "2.0", id: 2, method: "getSlot", params: [{ commitment: "confirmed" }] },
    { jsonrpc: "2.0", id: 3, method: "getBlockHeight", params: [{ commitment: "confirmed" }] },
  ]

  const [rpcResponse, quoteResponse] = await Promise.allSettled([
    fetch(SOLANA_PUBLIC_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpcRequest),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`RPC ${response.status}`)
      return (await response.json()) as RpcBatchEntry[] | RpcBatchEntry
    }),
    fetch(JUPITER_SOL_USDC_QUOTE_URL, {
      headers: { accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`quote ${response.status}`)
      return (await response.json()) as JupiterQuote
    }),
  ])

  if (rpcResponse.status === "rejected") {
    throw rpcResponse.reason instanceof Error ? rpcResponse.reason : new Error("Solana RPC unavailable")
  }

  const rpcEntries = Array.isArray(rpcResponse.value) ? rpcResponse.value : [rpcResponse.value]
  const firstRpcError = rpcEntries.find((entry) => entry.error)?.error?.message
  if (firstRpcError) throw new Error(firstRpcError)

  const healthResult = rpcResult(rpcEntries, 1)
  const slot = rpcNumber(rpcEntries, 2)
  const blockHeight = rpcNumber(rpcEntries, 3)
  const health = typeof healthResult === "string" ? healthResult : "unknown"
  let status: RealtimeSnapshot["status"] = slot === null || blockHeight === null ? "degraded" : "live"
  let error: string | undefined
  let quoteOut: number | null = null

  if (quoteResponse.status === "fulfilled") {
    const rawOutAmount = Number(quoteResponse.value.outAmount)
    quoteOut = Number.isFinite(rawOutAmount) ? rawOutAmount / 1_000_000 : null
  } else {
    status = "degraded"
    error = quoteResponse.reason instanceof Error ? quoteResponse.reason.message : "quote unavailable"
  }

  return {
    status,
    slot,
    blockHeight,
    health,
    latencyMs: Math.round(performance.now() - startedAt),
    quoteOut,
    updatedAt: new Date().toISOString(),
    source: "public Solana RPC + Jupiter quote",
    error,
  }
}

function useRealtimeSolana() {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot>(DEFAULT_REALTIME_SNAPSHOT)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const next = await fetchRealtimeSnapshot()
        if (!cancelled) setSnapshot(next)
      } catch (error) {
        if (cancelled) return
        setSnapshot((current) => ({
          ...current,
          status: "offline",
          health: "unavailable",
          latencyMs: null,
          updatedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "realtime feed unavailable",
        }))
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 6000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return snapshot
}

function trainAgent(state: TrainingState, agent: Agent, snapshot: RealtimeSnapshot, round: number, modeOverride?: TrainingMode): TrainingState {
  const mode = modeOverride ?? state.mode
  const samples = state.samples + 1
  const liveBonus = snapshot.status === "live" ? 1.4 : snapshot.status === "degraded" ? 0.45 : -0.8
  const latencyBonus = snapshot.latencyMs === null ? 0 : clamp((260 - snapshot.latencyMs) / 130, -1.25, 1.35)
  const marketPulse = snapshot.slot === null ? 0 : Math.sin((snapshot.slot % 997) / 53 + round / 4) * 0.8
  const quotePulse = snapshot.quoteOut === null ? 0 : Math.cos(snapshot.quoteOut / 11 + agent.seed) * 0.6
  const modeEdge = mode === "risk" ? agent.metrics.discipline / 58 : mode === "dialogue" ? agent.metrics.speed / 74 : agent.metrics.edge / 62
  const disciplineEdge = (agent.metrics.discipline - agent.metrics.risk * 0.3) / 42
  const rewardDelta = Number((liveBonus + latencyBonus + marketPulse + quotePulse + modeEdge + disciplineEdge).toFixed(2))
  const reward = Number((state.reward + rewardDelta).toFixed(2))
  const riskShift = mode === "risk" ? 3.2 : mode === "perps" ? (snapshot.status === "live" ? 1.6 : -1.4) : 0.8
  const riskBias = clamp(Number((state.riskBias + riskShift - Math.max(0, agent.metrics.risk - 58) * 0.04).toFixed(1)), 0, 100)
  const level = clamp(Math.floor(1 + samples / 4 + Math.max(0, reward) / 8 + riskBias / 35), 1, 50)
  const now = new Date().toISOString()
  const sign = rewardDelta >= 0 ? "+" : ""
  const decision = rewardDelta >= 0 ? "accepted" : "vetoed"
  const memoryLine = `${formatTime(now)} ${agent.callSign} ${mode} ${decision} ${sign}${rewardDelta} | slot ${snapshot.slot ?? "n/a"} | ${snapshot.status}`

  return {
    ...state,
    agentId: agent.id,
    mode,
    level,
    samples,
    reward,
    riskBias,
    lastTrainedAt: now,
    memory: [memoryLine, ...state.memory].slice(0, 6),
  }
}

function proofFor(agent: Agent, round: number) {
  const raw = `${agent.id}-${round}-${agent.seed}`
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0
  }
  return `devnet:${hash.toString(16).padStart(8, "0")}`
}

function scoreAgent(agent: Agent, round: number, training?: TrainingState): AgentScore {
  const trained = training?.agentId === agent.id ? training : undefined
  const pulse = Math.sin((round + agent.seed) * 0.82) * 7 + Math.cos((round * 1.21 + agent.seed) * 0.6) * 5
  const riskDrag = (agent.metrics.risk - 40) * 0.34
  const trainingBoost = trained ? trained.level * 8 + Math.min(70, trained.samples * 2) + Math.round(trained.reward * 1.5) : 0
  const elo = Math.round(
    820 +
      agent.metrics.edge * 4.7 +
      agent.metrics.discipline * 2.5 +
      agent.metrics.speed * 1.8 -
      riskDrag +
      round * 9 +
      pulse +
      trainingBoost,
  )
  const pnlBoost = trained ? trained.reward * 0.04 + trained.level * 0.12 : 0
  const pnl = Number((((agent.metrics.edge * 0.44 + agent.metrics.speed * 0.13 - agent.metrics.risk * 0.2 + pulse * 0.8 + round * 1.4) / 10) + pnlBoost).toFixed(2))
  const wins = Math.max(0, Math.round((agent.metrics.edge + agent.metrics.speed + agent.metrics.discipline - agent.metrics.risk * 0.46 + round + pulse) / 28) + (trained ? Math.floor(trained.samples / 3) : 0))
  const drawdown = clamp(Math.round(agent.metrics.risk * 0.42 + Math.abs(pulse) - agent.metrics.discipline * 0.08 - (trained ? trained.riskBias * 0.08 : 0)), 2, 48)
  const liquidationRisk = clamp(Math.round(agent.metrics.risk * 0.74 + Math.abs(pulse) - agent.metrics.discipline * 0.18 - (trained ? trained.level * 0.3 : 0)), 4, 92)
  const heat = clamp(Math.round(agent.metrics.edge * 0.42 + agent.metrics.speed * 0.28 + agent.metrics.discipline * 0.2 - agent.metrics.risk * 0.12 + 18 + (trained ? trained.level * 0.8 : 0)), 0, 100)

  return {
    ...agent,
    elo,
    pnl,
    wins,
    drawdown,
    liquidationRisk,
    heat,
    proof: proofFor(agent, round),
    trainingLevel: trained?.level,
    trainingSamples: trained?.samples,
  }
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function signedPercent(value: number) {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function scrollToScoreboard() {
  document.getElementById("scoreboard")?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="metricBar">
      <div className="metricLabel">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="metricTrack">
        <span style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

function AgentBox({ agent, active }: { agent: AgentScore; active: boolean }) {
  const style = {
    "--agent-color": agent.color,
    "--agent-accent": agent.accent,
  } as CSSProperties

  return (
    <article className={`agentBox ${active ? "active" : ""}`} style={style}>
      <div className="agentTopline">
        <span className="agentInitials">{agent.callSign}</span>
        <span className="agentLane">{agent.lane}</span>
      </div>
      <h3>{agent.name}</h3>
      <p>{agent.role}</p>
      <div className="agentStats">
        <MetricBar label="Edge" value={agent.metrics.edge} color={agent.color} />
        <MetricBar label="Speed" value={agent.metrics.speed} color={agent.color} />
        <MetricBar label="Discipline" value={agent.metrics.discipline} color={agent.color} />
      </div>
      <div className="agentFooter">
        <span>{agent.trainingLevel ? `trained L${agent.trainingLevel} - ${agent.box}` : agent.box}</span>
        <strong>{signedPercent(agent.pnl)}</strong>
      </div>
    </article>
  )
}

function TerminalPanel({ agent, opponent, score, side, round }: { agent: AgentScore; opponent: AgentScore; score: number; side: "left" | "right"; round: number }) {
  const notional = 25_000 + agent.metrics.edge * 420 + round * 310
  const lines = [
    `${agent.box} arena:round-${round.toString().padStart(2, "0")}`,
    `npm run box:perps -- ${agent.market.toLowerCase()} --paper`,
    `rpc env=${DEEPSEEK_RUNTIME.rpcEnv} model env=DEEPSEEK_MODEL:-${DEEPSEEK_RUNTIME.model}`,
    `observe market=${agent.market} opponent=${opponent.callSign} score=${score}`,
    `deepseek chat.completions --base-url ${DEEPSEEK_RUNTIME.openAiBaseUrl} --thinking enabled`,
    `decide side=${agent.side} edge=${agent.metrics.edge} risk=${agent.metrics.risk}`,
    "gate live=false operator_confirmed=false perps_sim_only=true",
    `paper-order ${agent.side} ${agent.market} --notional-usdc ${Math.round(notional)}`,
    `anthropic bridge ${DEEPSEEK_RUNTIME.anthropicBaseUrl} auth=${DEEPSEEK_RUNTIME.apiKeyEnv}`,
    `attest ${agent.proof}`,
  ]

  return (
    <section className={`terminalPanel ${side}`}>
      <div className="terminalTitle">
        <span>{agent.name}</span>
        <strong>{signedPercent(agent.pnl)}</strong>
      </div>
      <div className="terminalLines" aria-label={`${agent.name} terminal`}>
        {lines.map((line) => (
          <p key={line}>
            <span>$</span>
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}

function DeepSeekConversation({
  pair,
  leader,
  round,
  totalEquity,
}: {
  pair: { left: AgentScore; right: AgentScore }
  leader: AgentScore
  round: number
  totalEquity: number
}) {
  const lines = buildConversation(pair, leader, round, totalEquity)
  return (
    <section className="conversationPanel" id="deepseek">
      <div className="sectionTitle">
        <span>DeepSeek Autonomy</span>
        <strong>server-side key rail</strong>
      </div>
      <div className="deepseekConfig">
        <code>{DEEPSEEK_RUNTIME.apiKeyEnv}</code>
        <code>{DEEPSEEK_RUNTIME.rpcEnv}</code>
        <code>{DEEPSEEK_RUNTIME.model}</code>
        <code>{DEEPSEEK_RUNTIME.fastModel}</code>
      </div>
      <div className="conversationGrid" aria-label="DeepSeek generated arena conversation preview">
        {lines.map((line) => (
          <article className={`conversationLine ${line.tone}`} key={`${line.speaker}-${line.label}`}>
            <div>
              <span>{line.label}</span>
              <strong>{line.speaker}</strong>
            </div>
            <p>{line.text}</p>
          </article>
        ))}
      </div>
      <div className="arenaCommand">
        <span>$</span>
        <code>npm run arena:deepseek -- --rounds 3</code>
      </div>
    </section>
  )
}

function EquityChart({ agents, round }: { agents: AgentScore[]; round: number }) {
  const leaders = agents.slice(0, 4)
  const width = 760
  const height = 220
  const points = leaders.map((agent, agentIndex) => {
    return Array.from({ length: 10 }, (_, index) => {
      const x = 36 + index * 76
      const wave = Math.sin((index + round + agent.seed) * 0.62) * 18
      const trend = agent.pnl * 7 + index * (8 + agentIndex * 2)
      const y = clamp(162 - trend - wave, 24, 184)
      return `${x},${y}`
    }).join(" ")
  })

  return (
    <div className="chartFrame">
      <div className="sectionTitle">
        <span>Equity Curve</span>
        <strong>top 4 boxes</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Arena equity curve">
        <g className="chartGrid">
          {[32, 76, 120, 164].map((y) => (
            <line key={y} x1="28" x2="732" y1={y} y2={y} />
          ))}
        </g>
        {points.map((line, index) => (
          <polyline key={leaders[index].id} points={line} stroke={leaders[index].color} />
        ))}
        {leaders.map((agent, index) => (
          <text key={agent.id} x="36" y={204 - index * 18} fill={agent.color}>
            {agent.callSign} {signedPercent(agent.pnl)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function PerpsMap({ agents }: { agents: AgentScore[] }) {
  return (
    <section className="perpsPanel">
      <div className="sectionTitle">
        <span>Perpetuals Map</span>
        <strong>paper mode</strong>
      </div>
      <div className="positionGrid">
        {POSITIONS.map((position, index) => {
          const owner = agents[index % agents.length]
          const heat = clamp(owner.heat + position.funding * 600, 12, 100)
          return (
            <div className="positionTile" key={position.symbol}>
              <div>
                <span>{position.symbol}</span>
                <strong>{position.leverage}</strong>
              </div>
              <p>{formatUsd(position.notional)}</p>
              <div className="metricTrack">
                <span style={{ width: `${heat}%`, background: owner.color }} />
              </div>
              <small>
                funding {signedPercent(position.funding)} - {owner.callSign}
              </small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Scoreboard({ agents }: { agents: AgentScore[] }) {
  return (
    <section className="scoreboardPanel" id="scoreboard">
      <div className="sectionTitle">
        <span>Scoreboard</span>
        <strong>arena season 01</strong>
      </div>
      <div className="scoreboardTable" role="table" aria-label="Agent arena scoreboard">
        <div className="scoreRow header" role="row">
          <span>Rank</span>
          <span>Agent</span>
          <span>Elo</span>
          <span>Wins</span>
          <span>PnL</span>
          <span>Risk</span>
          <span>Proof</span>
        </div>
        {agents.map((agent, index) => (
          <div className="scoreRow" role="row" key={agent.id}>
            <span>#{index + 1}</span>
            <span>
              <i style={{ background: agent.color }} />
              {agent.name}
            </span>
            <strong>{agent.elo}</strong>
            <span>{agent.wins}</span>
            <span className={agent.pnl >= 0 ? "positive" : "negative"}>{signedPercent(agent.pnl)}</span>
            <span>{agent.liquidationRisk}%</span>
            <code>{agent.proof}</code>
          </div>
        ))}
      </div>
    </section>
  )
}

function MintedBanner() {
  return (
    <section className="mintedBanner" aria-label="Minted agent scoreboard visual">
      <img src={scoreboardUrl} alt="Live CLAWD minted agent scoreboard" />
    </section>
  )
}

export default function App() {
  const path = usePath()
  const [round, setRound] = useState(8)
  const [running, setRunning] = useState(true)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setRound((value) => value + 1), 2200)
    return () => window.clearInterval(timer)
  }, [running])

  const scoredAgents = useMemo(() => {
    return AGENTS.map((agent) => scoreAgent(agent, round)).sort((a, b) => b.elo - a.elo)
  }, [round])

  const pair = useMemo(() => {
    const leftIndex = round % AGENTS.length
    let rightIndex = (round * 2 + 3) % AGENTS.length
    if (rightIndex === leftIndex) rightIndex = (rightIndex + 1) % AGENTS.length
    const left = scoreAgent(AGENTS[leftIndex], round)
    const right = scoreAgent(AGENTS[rightIndex], round)
    return { left, right }
  }, [round])

  const leftScore = pair.left.elo + pair.left.metrics.speed - pair.left.liquidationRisk
  const rightScore = pair.right.elo + pair.right.metrics.speed - pair.right.liquidationRisk
  const leader = leftScore >= rightScore ? pair.left : pair.right
  const totalEquity = scoredAgents.reduce((sum, agent) => sum + agent.baseEquity * (1 + agent.pnl / 100), 0)

  if (path === "/library" || path === "/library/") {
    return <LibraryApp />
  }

  return (
    <main className="arenaShell">
      <header className="arenaHeader">
        <a className="brandMark" href="/">
          <span>8bit</span>
          <strong>8bitlabs · Solana Arena</strong>
        </a>
        <nav>
          <a href="#arena">Arena</a>
          <a href="#terminals">Terminals</a>
          <a href="#deepseek">DeepSeek</a>
          <button type="button" onClick={scrollToScoreboard}>
            Scoreboard
          </button>
          <a href="/library/">Library</a>
        </nav>
      </header>

      <section className="arenaHero" id="arena">
        <div className="arenaStage">
          <img className="arenaVisual" src={boxBannerUrl} alt="Box agents running Solana lanes" />
          <div className="stageOverlay">
            <div>
              <p className="kicker">Devnet arena - Helius RPC - DeepSeek brain - paper perps</p>
              <h1>Agents in boxes battle for perpetual supremacy.</h1>
            </div>
            <div className="controlStrip" aria-label="Arena controls">
              <button type="button" onClick={() => setRound((value) => value + 1)}>
                Run Tick
              </button>
              <button type="button" className={running ? "active" : ""} onClick={() => setRunning((value) => !value)}>
                {running ? "Auto On" : "Auto Off"}
              </button>
              <button type="button" onClick={() => setRound(1)}>
                Reset
              </button>
            </div>
          </div>
          <div className="arenaDuel">
            <div>
              <span>{pair.left.callSign}</span>
              <strong>{pair.left.name}</strong>
            </div>
            <p>round {round}</p>
            <div>
              <span>{pair.right.callSign}</span>
              <strong>{pair.right.name}</strong>
            </div>
          </div>
        </div>

        <aside className="liveLedger">
          <div className="ledgerStat">
            <span>Leader</span>
            <strong>{leader.name}</strong>
          </div>
          <div className="ledgerStat">
            <span>Total Equity</span>
            <strong>{formatUsd(totalEquity)}</strong>
          </div>
          <div className="ledgerStat">
            <span>Season Proof</span>
            <code>{leader.proof}</code>
          </div>
          <div className="ledgerStat">
            <span>RPC Rail</span>
            <strong>{DEEPSEEK_RUNTIME.rpcEnv}</strong>
          </div>
          <div className="ledgerStat">
            <span>Agent Brain</span>
            <strong>{DEEPSEEK_RUNTIME.model}</strong>
          </div>
          <div className="ledgerStat">
            <span>Safety Mode</span>
            <strong>Paper only</strong>
          </div>
        </aside>
      </section>

      <section className="agentGrid" aria-label="Arena agent boxes">
        {scoredAgents.map((agent) => (
          <AgentBox key={agent.id} agent={agent} active={agent.id === pair.left.id || agent.id === pair.right.id} />
        ))}
      </section>

      <section className="duelSection" id="terminals">
        <TerminalPanel agent={pair.left} opponent={pair.right} score={leftScore} side="left" round={round} />
        <div className="versusPanel">
          <span>Terminal vs Terminal</span>
          <strong>
            {leftScore} : {rightScore}
          </strong>
          <p>{leader.thesis}</p>
        </div>
        <TerminalPanel agent={pair.right} opponent={pair.left} score={rightScore} side="right" round={round} />
      </section>

      <DeepSeekConversation pair={pair} leader={leader} round={round} totalEquity={totalEquity} />

      <section className="visualGrid">
        <EquityChart agents={scoredAgents} round={round} />
        <PerpsMap agents={scoredAgents} />
      </section>

      <Scoreboard agents={scoredAgents} />
      <TournamentPanel agents={AGENTS} round={round} running={running} />
      <MintedBanner />
    </main>
  )
}
