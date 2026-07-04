import "./mcp-studio.css"
import { FormEvent, useMemo, useState } from "react"

type ChainId = "solana" | "ethereum" | "base" | "arbitrum" | "bsc" | "hyperliquid"
type LaneId = "solana" | "birdeye" | "perps" | "stocks" | "x402"
type Role = "user" | "studio"

type EndpointPlan = {
  lane: LaneId
  label: string
  method: "GET" | "POST" | "WS" | "MCP"
  target: string
  params: Record<string, string | number | boolean>
  headers?: Record<string, string>
  note: string
}

type StudioPlan = {
  title: string
  confidence: number
  mode: "read-only" | "confirmation" | "paid-x402"
  chain: ChainId
  detected: string[]
  response: string
  endpoints: EndpointPlan[]
  followUps: string[]
}

type ChatMessage = {
  id: string
  role: Role
  text: string
  plan?: StudioPlan
}

type NetworkSnapshot = {
  slot: number
  price: number
  latency: number
  status: "live" | "degraded"
}

const SOL_MINT = "So11111111111111111111111111111111111111112"
const SAMPLE_WALLET = "9SeRj4LjgENeKQujfxRNkGbXYPM3X2vr9C37Jg9AARfg"
const SAMPLE_TX = "5Z4VkYcQmP1QsxYq8w8JJwFvA9g4n9DFa73gVw6NQb9r8SoLaNaTxHash"
const SAMPLE_STOCK = "AAPL"

const CHAINS: Array<{ id: ChainId; label: string; hint: string }> = [
  { id: "solana", label: "Solana", hint: "native RPC" },
  { id: "ethereum", label: "Ethereum", hint: "Birdeye x-chain" },
  { id: "base", label: "Base", hint: "Birdeye x-chain" },
  { id: "arbitrum", label: "Arbitrum", hint: "Birdeye x-chain" },
  { id: "bsc", label: "BSC", hint: "Birdeye x-chain" },
  { id: "hyperliquid", label: "Hyperliquid", hint: "perps" },
]

const QUICK_PROMPTS = [
  `Explain wallet ${SAMPLE_WALLET} risk, transfers, tokens, and perps exposure`,
  `Analyze ${SOL_MINT} price, security, holders, swaps, and new pair context`,
  `Trace transaction ${SAMPLE_TX} and summarize counterparties`,
  `Get ${SAMPLE_STOCK} previous close, 30 day bars, news sentiment, and compare with SOL`,
  "Show Hyperliquid open perps positions for this wallet",
]

const STUDIO_LANES: Array<{
  id: LaneId
  title: string
  subtitle: string
  calls: string[]
}> = [
  {
    id: "solana",
    title: "Native Solana",
    subtitle: "Wallets, tokens, txs, DAS, priority fees",
    calls: ["helius_balance", "helius_transactions", "solana_token_info", "solana_wallet_tokens"],
  },
  {
    id: "birdeye",
    title: "Birdeye Data",
    subtitle: "Cross-chain token, wallet, transfer, market data",
    calls: ["/defi/token_overview", "/defi/v3/search", "SUBSCRIBE_WALLET_TXS", "SUBSCRIBE_TRANSFER"],
  },
  {
    id: "perps",
    title: "Birdeye Perps",
    subtitle: "Hyperliquid wallet overview and open positions",
    calls: ["/perps/v1/wallet/overview", "/perps/v1/wallet/open_positions", "/perps/v1/wallet/list"],
  },
  {
    id: "stocks",
    title: "Massive Stocks",
    subtitle: "Aggregates, previous close, news, SQL tables",
    calls: ["stock_aggregates", "stock_previous_close", "stock_ticker_news", "massive_query_data"],
  },
  {
    id: "x402",
    title: "x402 Paid Data",
    subtitle: "Pay-per-request Birdeye routes without API keys",
    calls: ["/x402/defi/token_overview", "/x402/defi/v3/search", "/x402/token/v1/transfer"],
  },
]

const NETWORK_SNAPSHOTS: NetworkSnapshot[] = [
  { slot: 354_881_204, price: 142.18, latency: 86, status: "live" },
  { slot: 354_881_217, price: 142.21, latency: 91, status: "live" },
  { slot: 354_881_229, price: 142.12, latency: 104, status: "live" },
  { slot: 354_881_240, price: 142.33, latency: 117, status: "degraded" },
]

function chainHeader(chain: ChainId): Record<string, string> {
  if (chain === "hyperliquid") return { "x-perp": "hyperliquid" }
  return { "x-chain": chain }
}

function short(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function detectedEntities(input: string) {
  const entities = new Set<string>()
  const words = input.match(/[A-Za-z0-9_$.-]{2,90}/g) ?? []

  for (const word of words) {
    const clean = word.replace(/[.,:;)]$/, "")
    if (/^0x[a-fA-F0-9]{40,64}$/.test(clean)) entities.add(clean)
    if (/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(clean)) entities.add(clean)
    if (/^\$?[A-Z]{1,6}$/.test(clean) && !["GET", "POST", "MCP", "API", "USD"].includes(clean.replace("$", ""))) {
      entities.add(clean.replace("$", ""))
    }
  }

  return Array.from(entities).slice(0, 7)
}

function pickTicker(input: string) {
  const explicit = input.match(/\b(?:stock|ticker|equity|shares?)\s+([A-Z]{1,6})\b/i)?.[1]
  if (explicit) return explicit.toUpperCase()
  const tickers = input.match(/\b[A-Z]{2,5}\b/g)?.filter((item) => !["SOL", "USDC", "MCP", "API", "NFT", "DEX"].includes(item))
  return tickers?.[0] ?? SAMPLE_STOCK
}

function pickAddress(input: string) {
  return input.match(/\b[1-9A-HJ-NP-Za-km-z]{32,88}\b/)?.[0] ?? SAMPLE_WALLET
}

function pickToken(input: string) {
  const address = input.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/)?.[0]
  if (address) return address
  const symbol = input.match(/\$?([A-Z]{2,8})\b/)?.[1]
  if (symbol === "SOL") return SOL_MINT
  return symbol ?? SOL_MINT
}

function pickTransaction(input: string) {
  const evmTx = input.match(/\b0x[a-fA-F0-9]{64}\b/)?.[0]
  if (evmTx) return evmTx
  return input.match(/\b[1-9A-HJ-NP-Za-km-z]{70,100}\b/)?.[0] ?? SAMPLE_TX
}

function buildPlan(input: string, chain: ChainId): StudioPlan {
  const lower = input.toLowerCase()
  const detected = detectedEntities(input)
  const asksStocks = /\b(stock|stocks|ticker|equity|earnings|aapl|nvda|tsla|spy)\b/i.test(input)
  const asksPerps = /\b(perp|perps|futures|hyperliquid|position|open positions|funding)\b/i.test(input) || chain === "hyperliquid"
  const asksTx = /\b(tx|transaction|signature|hash|trace)\b/i.test(input)
  const asksWallet = /\b(wallet|holder|portfolio|net ?worth|pnl|transfer|balance|counterparty)\b/i.test(input)
  const asksToken = /\b(token|mint|price|ohlcv|swap|pair|security|holders|meme|liquidity)\b/i.test(input)

  if (asksStocks) return stockPlan(input, chain, detected)
  if (asksPerps) return perpsPlan(input, chain, detected)
  if (asksTx) return transactionPlan(input, chain, detected)
  if (asksWallet) return walletPlan(input, chain, detected)
  if (asksToken) return tokenPlan(input, chain, detected)
  return marketPlan(input, chain, detected)
}

function walletPlan(input: string, chain: ChainId, detected: string[]): StudioPlan {
  const wallet = pickAddress(input)
  const endpoints: EndpointPlan[] = [
    {
      lane: "solana",
      label: "Native wallet balance",
      method: "MCP",
      target: "helius_balance",
      params: { wallet },
      note: "Native Solana balance via Helius RPC.",
    },
    {
      lane: "solana",
      label: "Native wallet token accounts",
      method: "MCP",
      target: "solana_wallet_tokens",
      params: { wallet },
      note: "SPL token accounts from native Solana RPC.",
    },
    {
      lane: "solana",
      label: "Enhanced transaction history",
      method: "MCP",
      target: "helius_transactions",
      params: { address: wallet, limit: 25 },
      note: "Human-readable Solana transaction feed.",
    },
    {
      lane: "birdeye",
      label: "Birdeye wallet stream",
      method: "WS",
      target: "SUBSCRIBE_WALLET_TXS",
      params: { address: wallet },
      headers: chainHeader(chain),
      note: "Cross-chain wallet transaction stream; Solana addresses are validated natively.",
    },
    {
      lane: "birdeye",
      label: "Birdeye transfer stream",
      method: "WS",
      target: "SUBSCRIBE_TRANSFER",
      params: { wallet_addresses: wallet, flow: "all", min_value: 1000 },
      headers: { "x-chain": "solana" },
      note: "Transfer monitor with wallet and token filters.",
    },
  ]

  return {
    title: "Wallet Intelligence Route",
    confidence: 94,
    mode: "read-only",
    chain,
    detected,
    response: `I will treat ${short(wallet)} as the primary wallet, resolve native Solana balances and SPL token accounts first, then enrich the same address with Birdeye wallet and transfer streams across the selected chain.`,
    endpoints,
    followUps: ["Add perps overview", "Filter transfers above $10k", "Compare wallet PnL with SOL beta"],
  }
}

function tokenPlan(input: string, chain: ChainId, detected: string[]): StudioPlan {
  const token = pickToken(input)
  const endpoints: EndpointPlan[] = [
    {
      lane: "solana",
      label: "Native token metadata",
      method: "MCP",
      target: "solana_token_info",
      params: { mint: token },
      note: "Native Solana metadata, security, and price fallbacks.",
    },
    {
      lane: "birdeye",
      label: "Birdeye token overview",
      method: "GET",
      target: "/defi/token_overview",
      params: { address: token },
      headers: chainHeader(chain),
      note: "Token price, liquidity, volume, and market summary.",
    },
    {
      lane: "birdeye",
      label: "Birdeye security",
      method: "GET",
      target: "/defi/token_security",
      params: { address: token },
      headers: chainHeader(chain),
      note: "Risk and safety checks for token contracts.",
    },
    {
      lane: "birdeye",
      label: "Recent token transactions",
      method: "GET",
      target: "/defi/txs/token",
      params: { address: token, limit: 25 },
      headers: chainHeader(chain),
      note: "Recent swaps and token-level activity.",
    },
    {
      lane: "x402",
      label: "x402 token overview",
      method: "GET",
      target: "/x402/defi/token_overview",
      params: { address: token },
      note: "Pay-per-request route for API-keyless agents.",
    },
  ]

  return {
    title: "Token Intelligence Route",
    confidence: 91,
    mode: "read-only",
    chain,
    detected,
    response: `I will resolve ${short(token)} as a token or mint, ask Solana-native tools first when the chain is Solana, then enrich price, security, swaps, and x402 availability through Birdeye.`,
    endpoints,
    followUps: ["Open OHLCV chart plan", "Find top traders", "Watch new pairs for this base token"],
  }
}

function transactionPlan(input: string, chain: ChainId, detected: string[]): StudioPlan {
  const tx = pickTransaction(input)
  const endpoints: EndpointPlan[] = [
    {
      lane: "solana",
      label: "Native transaction trace",
      method: "MCP",
      target: "helius_transactions",
      params: { address: tx, limit: 1 },
      note: "Enhanced transaction decoding for Solana signatures when address context is present.",
    },
    {
      lane: "birdeye",
      label: "Wallet transaction subscription",
      method: "WS",
      target: "SUBSCRIBE_WALLET_TXS",
      params: { txHash: tx },
      headers: chainHeader(chain),
      note: "Transaction stream fields include txHash, owner, source, base, quote, volumeUSD, and network.",
    },
    {
      lane: "birdeye",
      label: "Transfer subscription",
      method: "WS",
      target: "SUBSCRIBE_TRANSFER",
      params: { tx_hash: tx },
      headers: { "x-chain": "solana" },
      note: "Solana transfer payloads include from, to, token account, amount, price, and value.",
    },
  ]

  return {
    title: "Transaction Trace Route",
    confidence: 87,
    mode: "read-only",
    chain,
    detected,
    response: `I will trace ${short(tx)} as a transaction, prioritize Solana-native decoding for Solana signatures, and map Birdeye stream fields to counterparties, token legs, USD value, and network.`,
    endpoints,
    followUps: ["Add wallet clustering", "Extract token transfer legs", "Flag large counterparty movement"],
  }
}

function perpsPlan(input: string, chain: ChainId, detected: string[]): StudioPlan {
  const wallet = pickAddress(input)
  const endpoints: EndpointPlan[] = [
    {
      lane: "perps",
      label: "Perps wallet overview",
      method: "GET",
      target: "/perps/v1/wallet/overview",
      params: { wallet },
      headers: { "x-perp": "hyperliquid" },
      note: "Birdeye perps wallet overview with equity, long/short value, PnL, funding, and win rate.",
    },
    {
      lane: "perps",
      label: "Perps open positions",
      method: "GET",
      target: "/perps/v1/wallet/open_positions",
      params: { wallet },
      headers: { "x-perp": "hyperliquid" },
      note: "Open positions with token, side, entry, mark, liquidation, and position value fields.",
    },
    {
      lane: "perps",
      label: "Perps wallet list",
      method: "GET",
      target: "/perps/v1/wallet/list",
      params: { limit: 50 },
      headers: { "x-perp": "hyperliquid" },
      note: "Discovery list for high-signal perps wallets.",
    },
  ]

  return {
    title: "Perps Route",
    confidence: 96,
    mode: "read-only",
    chain: "hyperliquid",
    detected,
    response: `I will route ${short(wallet)} to Birdeye Perps with the Hyperliquid header, summarize equity, open value, realized and unrealized PnL, funding fee, win rate, and liquidation exposure.`,
    endpoints,
    followUps: ["Rank positions by liquidation risk", "Compare 90d PnL and volume", "Add SOL spot hedge context"],
  }
}

function stockPlan(input: string, chain: ChainId, detected: string[]): StudioPlan {
  const ticker = pickTicker(input)
  const tableName = `${ticker.toLowerCase()}_daily`
  const endpoints: EndpointPlan[] = [
    {
      lane: "stocks",
      label: "Previous close",
      method: "MCP",
      target: "stock_previous_close",
      params: { ticker },
      note: "Massive previous close aggregate bar.",
    },
    {
      lane: "stocks",
      label: "Thirty day OHLCV",
      method: "MCP",
      target: "stock_aggregates",
      params: { ticker, timespan: "day", store_as: tableName, apply: "sma(close, 20)" },
      note: "Stores rows for SQL-style table analysis.",
    },
    {
      lane: "stocks",
      label: "Ticker news and insights",
      method: "MCP",
      target: "stock_ticker_news",
      params: { ticker, limit: 25 },
      note: "News articles with Massive insights and sentiment fields when available.",
    },
    {
      lane: "stocks",
      label: "Stored data query",
      method: "MCP",
      target: "massive_query_data",
      params: { sql: `SELECT date, close, close - LAG(close) OVER (ORDER BY date) AS daily_change FROM ${tableName} ORDER BY date DESC LIMIT 10` },
      note: "SQL-style query against stored aggregate rows.",
    },
  ]

  return {
    title: "Stock Research Route",
    confidence: 93,
    mode: "read-only",
    chain,
    detected,
    response: `I will route ${ticker} through Massive stock tools, store daily bars as ${tableName}, query the stored table for daily changes, and pair market data with recent ticker news.`,
    endpoints,
    followUps: ["Compare against SOL", "Add moving average crossover", "Summarize negative news only"],
  }
}

function marketPlan(input: string, chain: ChainId, detected: string[]): StudioPlan {
  const endpoints: EndpointPlan[] = [
    {
      lane: "solana",
      label: "Solana market signal",
      method: "MCP",
      target: "market_signal",
      params: {},
      note: "Composite Solana signal from local MCP market tools.",
    },
    {
      lane: "birdeye",
      label: "Trending tokens",
      method: "GET",
      target: "/defi/token_trending",
      params: { sort_by: "volume", limit: 20 },
      headers: chainHeader(chain),
      note: "Birdeye token trend surface for the selected chain.",
    },
    {
      lane: "birdeye",
      label: "New token listing stream",
      method: "WS",
      target: "SUBSCRIBE_TOKEN_NEW_LISTING",
      params: { meme_platform_enabled: true, sources: "pump.fun" },
      headers: { "x-chain": "solana" },
      note: "Realtime new listing subscription for Solana meme token discovery.",
    },
    {
      lane: "x402",
      label: "x402 search",
      method: "GET",
      target: "/x402/defi/v3/search",
      params: { keyword: input.slice(0, 48) || "SOL" },
      note: "API-keyless paid discovery for token and market data.",
    },
  ]

  return {
    title: "Market Copilot Route",
    confidence: 82,
    mode: "read-only",
    chain,
    detected,
    response: "I will start with a broad market route, combine native Solana signals with Birdeye trend and listing streams, then narrow once a wallet, token, transaction, perps wallet, or stock ticker is specified.",
    endpoints,
    followUps: ["Focus on wallets", "Focus on new pairs", "Add stock context"],
  }
}

function routeColor(lane: LaneId) {
  return {
    solana: "#14f195",
    birdeye: "#3b82f6",
    perps: "#f97316",
    stocks: "#9333ea",
    x402: "#d97706",
  }[lane]
}

function planJson(plan: StudioPlan) {
  return JSON.stringify(
    {
      title: plan.title,
      mode: plan.mode,
      chain: plan.chain,
      endpoints: plan.endpoints.map((endpoint) => ({
        lane: endpoint.lane,
        method: endpoint.method,
        target: endpoint.target,
        params: endpoint.params,
        headers: endpoint.headers,
      })),
    },
    null,
    2,
  )
}

function Sparkline({ snapshot }: { snapshot: NetworkSnapshot }) {
  const points = Array.from({ length: 18 }, (_, index) => {
    const x = 8 + index * 12
    const y = 46 - Math.sin(index * 0.7 + snapshot.price / 11) * 15 - (index % 5)
    return `${x},${Math.max(10, Math.min(52, y))}`
  }).join(" ")

  return (
    <svg className="studioSpark" viewBox="0 0 220 64" role="img" aria-label="SOL market sparkline">
      <path d="M8 54 H212" />
      <polyline points={points} />
    </svg>
  )
}

function EndpointRow({ endpoint }: { endpoint: EndpointPlan }) {
  return (
    <article className="endpointRow" style={{ borderLeftColor: routeColor(endpoint.lane) }}>
      <div>
        <span>{endpoint.method}</span>
        <strong>{endpoint.label}</strong>
      </div>
      <code>{endpoint.target}</code>
      <p>{endpoint.note}</p>
      <div className="paramLine">
        {Object.entries(endpoint.params).map(([key, value]) => (
          <span key={key}>
            {key}: {String(value)}
          </span>
        ))}
      </div>
    </article>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <article className="messageBubble userBubble">
        <span>You</span>
        <p>{message.text}</p>
      </article>
    )
  }

  return (
    <article className="messageBubble studioBubble">
      <div className="studioBubbleHead">
        <span>MCP Studio</span>
        {message.plan ? <strong>{message.plan.confidence}% route confidence</strong> : null}
      </div>
      <p>{message.text}</p>
      {message.plan ? (
        <div className="inlinePlan">
          {message.plan.endpoints.slice(0, 4).map((endpoint) => (
            <span key={`${endpoint.lane}-${endpoint.target}`} style={{ borderColor: routeColor(endpoint.lane) }}>
              {endpoint.lane} / {endpoint.method}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export default function McpStudioApp() {
  const [chain, setChain] = useState<ChainId>("solana")
  const [riskMode, setRiskMode] = useState<"read-only" | "confirm">("read-only")
  const [query, setQuery] = useState("Show me SOL wallet risk, recent transfers, perps exposure, and AAPL context")
  const [snapshotIndex, setSnapshotIndex] = useState(1)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial = buildPlan("Route Solana wallets, Birdeye perps, transactions, and stocks from natural language", "solana")
    return [
      {
        id: "studio-init",
        role: "studio",
        text: initial.response,
        plan: initial,
      },
    ]
  })

  const latestPlan = useMemo(() => {
    return [...messages].reverse().find((message) => message.plan)?.plan ?? buildPlan(query, chain)
  }, [chain, messages, query])

  const entities = useMemo(() => detectedEntities(query), [query])
  const snapshot = NETWORK_SNAPSHOTS[snapshotIndex % NETWORK_SNAPSHOTS.length]

  function submit(nextQuery = query) {
    const trimmed = nextQuery.trim()
    if (!trimmed) return
    const plan = buildPlan(trimmed, chain)
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: trimmed },
      { id: `studio-${Date.now()}`, role: "studio", text: plan.response, plan },
    ])
    setQuery("")
    setSnapshotIndex((value) => value + 1)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit()
  }

  function copyPlan() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    void navigator.clipboard.writeText(planJson(latestPlan))
  }

  return (
    <main className="studioShell">
      <header className="studioTopbar">
        <a className="studioBrand" href="/studio">
          <span>MCP</span>
          <div>
            <strong>Finance Studio</strong>
            <small>Solana native, Birdeye, perps, stocks</small>
          </div>
        </a>
        <nav className="studioNav">
          <a href="/studio">Studio</a>
          <a href="/arena">Arena</a>
          <a href="/library/">Library</a>
          <a href="/pet">Pet</a>
        </nav>
      </header>

      <section className="studioGrid">
        <aside className="scopeRail" aria-label="Studio scope">
          <section className="studioPanel">
            <div className="panelTitle">
              <span>Scope</span>
              <strong>{chain}</strong>
            </div>
            <div className="chainList">
              {CHAINS.map((item) => (
                <button
                  key={item.id}
                  className={chain === item.id ? "active" : ""}
                  type="button"
                  onClick={() => setChain(item.id)}
                >
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="studioPanel">
            <div className="panelTitle">
              <span>Mode</span>
              <strong>{riskMode}</strong>
            </div>
            <div className="segmentedControl">
              <button className={riskMode === "read-only" ? "active" : ""} type="button" onClick={() => setRiskMode("read-only")}>
                Read
              </button>
              <button className={riskMode === "confirm" ? "active" : ""} type="button" onClick={() => setRiskMode("confirm")}>
                Confirm
              </button>
            </div>
            <div className="guardrailList">
              <span>No browser secrets</span>
              <span>Server-side API keys</span>
              <span>x402 only when selected</span>
              <span>Trading requires confirmation</span>
            </div>
          </section>

          <section className="studioPanel">
            <div className="panelTitle">
              <span>Entities</span>
              <strong>{entities.length || latestPlan.detected.length}</strong>
            </div>
            <div className="entityStack">
              {(entities.length ? entities : latestPlan.detected.length ? latestPlan.detected : ["SOL", "AAPL", SAMPLE_WALLET]).map((entity) => (
                <button key={entity} type="button" onClick={() => setQuery((current) => `${current} ${entity}`.trim())}>
                  {short(entity)}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="chatSurface">
          <div className="chatHeader">
            <div>
              <span>Natural language router</span>
              <strong>{latestPlan.title}</strong>
            </div>
            <div className="statusPills">
              <span>{snapshot.status}</span>
              <span>{snapshot.latency} ms</span>
              <span>slot {snapshot.slot.toLocaleString("en-US")}</span>
            </div>
          </div>

          <div className="quickPromptRow" aria-label="Suggested finance requests">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => submit(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="messageList" aria-live="polite">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={3}
              placeholder="Message MCP Studio..."
            />
            <div className="composerActions">
              <button type="button" onClick={() => setQuery("")}>
                Clear
              </button>
              <button type="submit">Route</button>
            </div>
          </form>
        </section>

        <aside className="inspectorRail">
          <section className="studioPanel pulsePanel">
            <div className="panelTitle">
              <span>Market Pulse</span>
              <strong>${snapshot.price.toFixed(2)}</strong>
            </div>
            <Sparkline snapshot={snapshot} />
            <div className="pulseStats">
              <span>Solana native RPC</span>
              <span>Jupiter quote rail</span>
              <span>Birdeye x-chain ready</span>
            </div>
          </section>

          <section className="studioPanel">
            <div className="panelTitle">
              <span>Active Plan</span>
              <strong>{latestPlan.mode}</strong>
            </div>
            <div className="planMeta">
              <span>confidence {latestPlan.confidence}%</span>
              <span>chain {latestPlan.chain}</span>
              <span>{latestPlan.endpoints.length} calls</span>
            </div>
            <pre className="planPreview">{planJson(latestPlan)}</pre>
            <button className="copyButton" type="button" onClick={copyPlan}>
              Copy plan
            </button>
          </section>
        </aside>
      </section>

      <section className="endpointDeck" aria-label="MCP endpoint route">
        <div className="deckHeader">
          <div>
            <span>Endpoint route</span>
            <strong>{latestPlan.title}</strong>
          </div>
          <div className="followUps">
            {latestPlan.followUps.map((followUp) => (
              <button key={followUp} type="button" onClick={() => submit(followUp)}>
                {followUp}
              </button>
            ))}
          </div>
        </div>
        <div className="endpointGrid">
          {latestPlan.endpoints.map((endpoint) => (
            <EndpointRow key={`${endpoint.lane}-${endpoint.target}-${endpoint.label}`} endpoint={endpoint} />
          ))}
        </div>
      </section>

      <section className="laneDeck" aria-label="Finance data lanes">
        {STUDIO_LANES.map((lane) => (
          <article className="laneCard" key={lane.id} style={{ borderTopColor: routeColor(lane.id) }}>
            <div>
              <span>{lane.id}</span>
              <strong>{lane.title}</strong>
            </div>
            <p>{lane.subtitle}</p>
            <div>
              {lane.calls.map((call) => (
                <code key={call}>{call}</code>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
