# 🦞 Clawd Code — Complete Documentation

> **The world's first headless Grok × Codex × Claude Code hybrid — with Solana perpetuals, realtime AI, voice, and image generation.**

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄      ║
║  ╱▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔╲     ║
║ ║  █████╗   ║                                              ║    ║
║ ║ ██╔══██╗  ║   🦞  CLAWD CODE  🦞                       ║    ║
║ ║ ╚══█╔═╝  ║                                              ║    ║
║ ║   ██║     ║   Grok × Codex × Claude Code                ║    ║
║ ║   ██║     ║   Headless Hybrid Agent                     ║    ║
║ ║   ╚═╝     ║                                              ║    ║
║ ║  ▄█████┐  ║   Phoenix Perpetuals · grok-4.20-multi-agent║    ║
║ ║ ██╔══██┘║   Voice (sherpa-onnx) · Image (DALL-E/Gemini) ║    ║
║ ║ ╚══█╔═┘  ║                                              ║    ║
║ ║   ██║     ║   x402 Payments · Helius RPC                ║    ║
║ ║   ╚═╝     ║                                              ║    ║
║  ╲▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔╱     ║
║   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀      ║
╚═══════════════════════════════════════════════════════════════╝
```

**CLAWD Token**: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

---

# Table of Contents

1. **[Clawd Code — Headless Hybrid Agent](#-clawd-code--headless-hybrid-agent)** (NEW)
   - Modes, Commands, Phoenix/Vulcan Integration, Voice/Image
2. **[Clawd Code CLI — Terminal Operator](#-clawd-code-cli--terminal-operator)** (Original)
   - Multi-provider, MCP, DFlow, Birdeye, prediction markets

---

# 🦞 Clawd Code — Headless Hybrid Agent

> **Location**: `agents/clawd-code/` · **Config**: `~/.clawd-code/.env`

A sovereign AI coding agent that combines Grok's realtime reasoning, Codex's code synthesis, and Claude Code's agentic discipline — with full Phoenix perpetuals trading via Vulcan CLI and Helius RPC.

## Modes

| Mode | Description | Default Model |
|------|-------------|---------------|
| `code` | Write, review, and ship production TypeScript/Solana code | `grok-4.3` |
| `trade` | Perpetuals trading via Phoenix + Vulcan CLI + Helius RPC | `grok-4.3` |
| `research` | Multi-agent deep research (4 or 16 sub-agents) | `grok-4.20-multi-agent` |
| `image` | DALL-E 3 / Gemini 2.0 Flash image generation | n/a |
| `voice` | Local TTS (sherpa-onnx) or ElevenLabs voice synthesis | n/a |

## Installation

```bash
cd agents/clawd-code
cp .env.example ~/.clawd-code/.env
# Edit ~/.clawd-code/.env with your API keys

npm install
npm run dev -- "your command here"
```

## Quick Start

```bash
# Code mode
npm run dev -- code "Build a Jupiter swap bot in TypeScript"

# Trade mode
npm run dev -- trade "funding rate on SOL perps"
npm run dev -- trade scan
npm run dev -- trade ticker SOL
npm run dev -- trade orderbook SOL
npm run dev -- trade "short SOL $100"
npm run dev -- trade "long SOL $50"

# Research mode (multi-agent)
npm run dev -- research "AI agent frameworks 2025"
npm run dev -- research --agents 16 "Deep Solana perp funding analysis"

# Image mode
npm run dev -- image "cyberpunk Solana trading desk"
npm run dev -- image --size 1024x1024 "neon clawd logo"

# Voice mode
npm run dev -- voice "Clawd Code is operational"
npm run dev -- voice --voice Clawd "Funding rate is elevated"
```

## Trade Mode — Full Command Reference

### Market Data (via Vulcan CLI)

| Command | Description | Example |
|---------|-------------|---------|
| `funding` | Show funding rates for all perps | `trade funding` |
| `ticker <symbol>` | Show price, volume, OI, funding | `trade ticker SOL` |
| `orderbook <symbol>` | L2 orderbook snapshot | `trade orderbook SOL` |
| `trades <symbol>` | Recent trades | `trade trades SOL` |
| `candles <symbol>` | OHLCV candles | `trade candles SOL` |
| `ta <symbol>` | Technical analysis report | `trade ta SOL` |

### Trading (via Vulcan CLI + Helius RPC)

| Command | Description | Example |
|---------|-------------|---------|
| `short <sym> $N` | Open short position | `trade short SOL $100` |
| `long <sym> $N` | Open long position | `trade long BTC $50` |
| `scan` | Multi-symbol market scan | `trade scan` |
| `position` | Show open positions | `trade position` |
| `portfolio` | Full portfolio snapshot | `trade portfolio` |
| `paper buy <sym> $N` | Paper buy | `trade paper buy SOL $100` |
| `paper sell <sym> $N` | Paper sell | `trade paper sell SOL $100` |

### Strategy Runners (Vulcan TWAP/Grid/TA)

```bash
# TWAP — split a target size across timed slices
vulcan strategy twap start --symbol SOL --side buy \
  --notional-usdc 5000 --slices 10 --interval-seconds 300 \
  --mode auto-execute --max-step-notional-usdc 600 --detached

# Grid — layered limit orders across a price band
vulcan strategy grid start --symbol SOL --center-on-mark \
  --width-pct 2.5 --levels-per-side 5 --tokens-per-level 0.5 \
  --run-until-stopped --mode auto-execute --detached

# TA — rule-based strategy from JSON config
vulcan strategy ta start --config-file ./ema-cross-sol.json \
  --mode paper --run-until-stopped --detached
```

## Research Mode — Multi-Agent

```bash
# 4 agents (fast, focused)
npm run dev -- research "Compare LangChain vs CrewAI vs xAI multi-agent"

# 16 agents (deep, multi-perspective)
npm run dev -- research --agents 16 "Comprehensive DeFi landscape analysis"
```

Tools enabled: `web_search`, `x_search`, `code_execution`

## Image Mode

| Provider | Cost | Model |
|----------|------|-------|
| DALL-E 3 | x402-paid | `dall-e-3` |
| Gemini 2.0 Flash | Free | `gemini-2.0-flash` (nano-banana) |

```bash
# DALL-E 3
npm run dev -- image --model dall-e-3 "cyberpunk trading desk"

# Gemini (free)
npm run dev -- image "neon Solana claw logo"
```

## Voice Mode

| Provider | Cost | Setup |
|----------|------|-------|
| sherpa-onnx (local) | Free | `~/.clawdbot/tools/sherpa-onnx-tts/` |
| ElevenLabs | x402-paid | `ELEVENLABS_API_KEY=...` |
| sag CLI | Variable | Install `sag` |

```bash
# Local TTS
npm run dev -- voice "Hello from Clawd Code"

# Custom voice
npm run dev -- voice --voice Clawd "Your message"
```

## x402 Payments

```typescript
import { x402 } from './src/x402.js';

// Make a payment-gated request
const result = await x402.request('/api/premium-feature', {
  amount: 0.001,  // USDC
  method: 'POST',
  body: { data: 'value' }
});
```

## Safety Gates

Live trading requires **ALL** of:
```bash
LIVE_TRADING=true
OPERATOR_CONFIRMED=true
PERPS_SIM_ONLY=false
```

Default is **PAPER MODE** — no real funds are used.

## Configuration (~/.clawd-code/.env)

```bash
# Core
CLAWD_MODE=code
CLAWD_MODEL=grok-4.20-multi-agent
CLAWD_AGENT_COUNT=4

# xAI / Grok
XAI_API_KEY=

# Z.ai GLM-5.2 (OpenAI-compatible, optional alternative provider)
ZAI_API_KEY=
ZAI_BASE_URL=https://api.z.ai/api/paas/v4/
ZAI_MODEL=glm-5.2
ZAI_WEB_SEARCH=true

# Solana
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=
HELIUS_WSS_URL=wss://mainnet.helius-rpc.com/?api-key=
HELIUS_API_KEY=
PHOENIX_RISE_URL=https://api.phoenix.gg/enclave

# Vulcan MCP
VULCAN_MCP_URL=http://localhost:3001
PHOENIX_UNDERWRITER=phoenix

# Trading safety
LIVE_TRADING=false
OPERATOR_CONFIRMED=false
PERPS_SIM_ONLY=true
PERPS_MAX_NOTIONAL_USD=250
PERPS_MAX_LEVERAGE=3
PERPS_MAX_SPREAD_BPS=40
PERPS_ALLOWED_SYMBOLS=SOL,ETH,BTC

# Image gen
OPENAI_API_KEY=
GEMINI_API_KEY=

# Voice
ELEVENLABS_API_KEY=

# x402
X402_GATEWAY_URL=https://x402.wtf
X402_PAYMENT_SECRET=
```

## Install Vulcan CLI

```bash
curl -LsSf https://install.vulcan.ellipsis.ai | sh
```

## File Structure

```
agents/clawd-code/
├── src/
│   ├── cli.ts              # CLI entry point (208 LOC)
│   ├── x402.ts              # x402 payment client (121 LOC)
│   └── modes/
│       ├── code.ts         # CODE MODE (104 LOC)
│       ├── trade.ts        # TRADE MODE (407 LOC) — full Vulcan CLI integration
│       ├── research.ts     # RESEARCH MODE (90 LOC)
│       ├── image.ts        # IMAGE MODE (99 LOC)
│       └── voice.ts        # VOICE MODE (94 LOC)
├── clawd.json              # Agent character definition (150 lines)
├── .env.example            # Environment template
├── package.json            # NPM package
├── tsconfig.json           # TypeScript config
└── README.md               # This file
```

**Total**: 1580 LOC · TypeScript compiles cleanly · All smoke tests pass ✅

---

# 🦞 Clawd Code CLI — Terminal Operator

> **Location**: `packages/clawd-code-cli/`

A lobster-themed AI terminal agent built for Solana operators, developers, and degen builders. It speaks to you through a retro ASCII terminal, runs entirely in your terminal, and lets you switch between Grok, Ollama (local), OpenRouter, and OpenAI backends on the fly — no restart needed.

## Features

- 🦞 **Lobster-branded UI** — ASCII art logo, per-provider spinner animations, themed loading messages
- ⚡ **Multi-Provider Routing** — Grok · Ollama · OpenRouter · OpenAI · custom, switched live via `/models`
- 🔧 **AI File Operations** — view_file, create_file, str_replace_editor (no overwrite accidents)
- 💻 **Bash + Shell Tools** — execute commands, grep, find, navigate
- 📋 **Todo Lists** — plan and track tasks with visual priority flags
- 🔌 **MCP Support** — extend with any Model Context Protocol server
- 🪙 **Solana Tools** — query assets, prices, wallet balances via Helius DAS API + Birdeye
- 📊 **Full Birdeye Suite** — token overview, metadata (single/multi), market data, trade data, search, trending, OHLCV, wallet portfolio
- 🦋 **DFlow Trading** — swap quotes + build across DFlow-aggregated venues, prediction-market init, priority fees (REST + WebSocket)
- 🔮 **Prediction Markets** — DFlow (Kalshi-on-Solana), Polymarket (Gamma + CLOB), Kalshi direct with RSA-PSS signing
- 🚀 **Token Launches** — pump.fun via PumpPortal local signing + Bags.fm fee-sharing launches
- 🔑 **Local Signing Wallet** — base58 / JSON-array keypair, signs versioned + legacy txs, confirmation-gated broadcasts
- 🌐 **Web Search** — real-time search for Grok models (auto-detected)
- 🔐 **Persistent Settings** — `~/.clawd/user-settings.json` remembers your API keys and model preferences

## Installation

```bash
# Recommended
npm install -g @openclawdsolana/clawd

# Or with bun
bun add -g @openclawdsolana/clawd

# One-shot
npx -y @openclawdsolana/clawd "scan this repo"
```

The `clawd`, `clawd-code`, and `clawd-leviathan` aliases are registered automatically.

### Pay.sh / Solana Pay

OpenClawd can be launched through Pay so paid API calls route through the local wallet approval flow:

```bash
brew install pay
pay --version
pay setup --update
pay --sandbox clawd "buy some water with pay"
npx -y @solana/pay clawd "buy some water with pay"
```

Use `pay setup --update` to refresh MCP config without creating a new account. For local tests, keep `--sandbox` on the top-level `pay` command. Do not create or replace a mainnet account unless you are intentionally setting up a funded wallet.

## Quick Start

```bash
clawd
```

On first run it will prompt for your Grok API key (from [xAI](https://x.ai)). Or set it once:

```bash
# From inside clawd:
/config grok key xai-your-key-here

# Or as environment variable
export GROK_API_KEY=xai-your-key-here
clawd
```

## Multi-Provider Setup

### OpenRouter (Claude, Gemini, Llama, DeepSeek...)

```bash
# Inside clawd:
/config openrouter key sk-or-v1-your-key-here

# Then switch to any OpenRouter model:
/models
# or
/config add model openrouter/anthropic/claude-opus-4.7
/config set defaultModel openrouter/anthropic/claude-opus-4.7
```

### Ollama (Local Models)

```bash
# Inside clawd:
/config ollama baseURL http://localhost:11434/v1

# Default Ollama models are already in the list:
# ollama/kimi-k2.6:cloud, ollama/glm-5.1:cloud, ollama/8bit/DeepSolana:latest, etc.
/models

# Switch to kimi-k2.6:cloud (pull it first with: ollama pull kimi-k2.6:cloud)
/models ollama/kimi-k2.6:cloud
# or persist it as the default
/config set defaultModel ollama/kimi-k2.6:cloud
```

### OpenAI

```bash
/config openai key sk-your-key-here
/config add model openai/gpt-4o
/config set defaultModel openai/gpt-4o
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `/models` | Open interactive model selector |
| `/models <name>` | Switch directly to a model by name |
| `/config` | Show all provider configs (keys masked) |
| `/config <provider> key <key>` | Set API key for a provider |
| `/config <provider> baseURL <url>` | Set base URL for a provider |
| `/config add model <name>` | Add a model to the available list |
| `/config set defaultModel <model>` | Set the default model (also switches active session) |
| `/provider` | Show active model's provider, base URL, and masked key |
| `/clear` | Clear chat history |
| `/help` | Show full help |
| `/commit-and-push` | AI-generated git commit + push |
| `/exit` | Exit |

**Shortcuts**: `↑/↓` navigate history, `Tab` complete suggestions, `Shift+Tab` toggle auto-edit, `Esc` abort.

## Command Line Options

```bash
clawd [options]

Options:
  -V, --version           output the version number
  -d, --directory <dir>   working directory
  -k, --api-key <key>    Grok API key
  -u, --base-url <url>    Grok API base URL
  -m, --model <model>     default model
  -p, --prompt <prompt>   headless mode — one prompt, then exit
  --max-tool-rounds <n>   max tool loops (default: 400)
  -h, --help              show help
```

## Provider Model Reference

### Grok (xAI) — default
```
grok-4-1-fast-reasoning
grok-4-fast-reasoning
grok-4-fast-non-reasoning
grok-4
grok-3
grok-3-fast
grok-code-fast-1
```

### OpenRouter
```
openrouter/anthropic/claude-opus-4.7
openrouter/anthropic/claude-sonnet-4
openrouter/anthropic/claude-3.5-sonnet
openrouter/google/gemini-2.5-pro
openrouter/google/gemini-2.0-flash
openrouter/meta-llama/llama-4-maverick
openrouter/deepseek/deepseek-chat-v3
openrouter/deepseek/deepseek-coder
openrouter/x-ai/grok-3
openrouter/qwen/qwen-3
```

### OpenAI
```
openai/gpt-4.5
openai/gpt-4o
openai/gpt-4o-mini
openai/o3
openai/o3-mini
openai/o4-mini
```

### Ollama (localhost:11434)
```
ollama/kimi-k2.6:cloud
ollama/kimi-k2.5:cloud
ollama/glm-5.1:cloud
ollama/minimax-m2.7:cloud
ollama/minimax-m2.1:cloud
ollama/8bit/DeepSolana:latest
ollama/mxbai-embed-large:latest
```

Switch at runtime with `/models ollama/kimi-k2.6:cloud`, or persist with `/config set defaultModel ollama/kimi-k2.6:cloud`. Any Ollama model you `ollama pull` locally can be added on the fly via `/config add model ollama/<name>`.

## Solana Integration

```bash
# Set environment variables
export HELIUS_API_KEY=your_helius_key
export BIRDEYE_API_KEY=your_birdeye_key

# Then inside clawd you can ask:
"show me my Solana wallet balance"
"get the price of $BONK"
"look up this NFT asset ..."
```

### Birdeye Tool Suite

Every `BIRDEYE_API_KEY`-gated endpoint is wired as a tool the agent can call:

| Tool | Endpoint |
|------|----------|
| `birdeye_token_overview` | `/defi/token_overview` — price, market cap, FDV, liquidity, wallets, volume, holders |
| `birdeye_token_metadata` / `_multi` | `/defi/v3/token/meta-data/single` + `/multiple` (up to 50) |
| `birdeye_token_market_data` / `_multi` | `/defi/v3/token/market-data` + `/multiple` (up to 20) |
| `birdeye_token_trade_data` / `_multi` | `/defi/v3/token/trade-data/single` + `/multiple` |
| `birdeye_search_token` | `/defi/v3/search` — keyword search, sorted by 24h USD volume |
| `birdeye_token_list` | `/defi/tokenlist` — paginated, configurable sort |
| `birdeye_trending` | `/defi/token_trending` |
| `birdeye_ohlcv` | `/defi/ohlcv` — 1m through 1M candles |
| `birdeye_wallet_portfolio` | `/v1/wallet/token_list` |

Prompt examples:
```
"search birdeye for pepe tokens sorted by volume"
"get the 1h trade data for $BONK"
"show me the top 20 trending solana tokens right now"
"what's my wallet portfolio worth" (set SOLANA_PRIVATE_KEY)
```

## Blockchain Trading + Prediction Markets

Turn on the signing wallet + DFlow and the CLI becomes a full trading terminal.

### Environment

```bash
# Local signing wallet (DO NOT commit)
SOLANA_PRIVATE_KEY=   # base58 (Phantom export) or JSON array
SOLANA_RPC_URL=

# DFlow — Solana swap aggregation + Kalshi-on-Solana prediction markets
DFLOW_API_KEY=        # contact hello@dflow.net
DFLOW_TRADING_URL=https://quote-api.dflow.net
DFLOW_METADATA_URL=https://dev-prediction-markets-api.dflow.net

# Bags.fm — launch tokens with fee sharing
BAGS_API_KEY=
BAGS_PARTNER_CONFIG_KEY=

# Kalshi direct (RSA-PSS signed requests)
KALSHI_KEY_ID=
KALSHI_PRIVATE_KEY=        # PEM with \n or use _FILE
KALSHI_PRIVATE_KEY_FILE=
KALSHI_ENV=prod            # or `demo`
```

### DFlow — trading + prediction markets

Tools surface the Trading API (tokens, venues, priority fees, swap quote/build, order status, prediction-market init) and the Metadata API (events, markets, orderbook, trades, on-chain fills, live Kalshi data, series, tags, sports filters, candlesticks, search) plus a WebSocket priority-fee stream.

Three-step swap flow the agent will chain automatically:

```
"quote me a swap for 0.1 SOL -> USDC via DFlow"
  -> dflow_swap_quote
  -> dflow_build_swap
  -> wallet_sign_and_send  (gated by confirmation prompt)
```

Other DFlow examples:
```
"init a prediction market for outcome mint <mint>"
"show me the orderbook for market KXNBAGAME-..."
"get live Kalshi data for milestone ids a,b,c"
"stream 5 priority-fee updates from DFlow"
```

### Polymarket

Read-only via the public Gamma + CLOB endpoints — no key required.

```
"find trending Polymarket events"
"get the polymarket orderbook for token <id>"
"what's the midpoint on this market"
```

Placing Polymarket orders requires L2 (EIP-712) signing with a Polygon key — not wired by default; the `polymarket_place_order` stub returns a clear "not enabled" error.

### Kalshi direct

Full RSA-PSS request signing with `KALSHI_KEY_ID` + `KALSHI_PRIVATE_KEY`. Reads (markets, orderbook, balance, positions, fills, orders) and writes (place/cancel orders) are exposed; `kalshi_place_order` is confirmation-gated.

### Token launches

- **PumpPortal** (`pump_launch_token`, `pump_trade`) — creates pump.fun SPL tokens, uploads metadata to pump.fun IPFS, generates mint, signs with your local keypair.
- **Bags.fm** (`bags_launch_token`, `bags_swap`, `bags_claim_fees`, `bags_positions`) — launch with fee-recipient splits and claim accumulated creator fees.

Example prompts:
```
"launch a pump.fun token called CLAWD2 with ticker CLW2, buy 0.2 SOL at launch"
"sell 50% of my position in <mint>"
"launch a bags.fm token with 50% fees to <wallet>"
"claim all my bags.fm fees"
```

### Safety

Every action that moves SOL or places a trade routes through the existing `ConfirmationTool` — nothing fires until you approve the prompt in the terminal. The wallet loader refuses to start if `SOLANA_PRIVATE_KEY` is malformed, and DFlow / Kalshi / Bags endpoints return structured errors (not crashes) when keys are missing.

## Local Development

```bash
git clone https://github.com/8bit/clawd-code-cli.git
cd clawd-code-cli
npm install
npm run build
npm link   # symlink locally for testing
clawd
```

---

# 🦞 CLAWD Token

**CLAWD** is the token of the Clawd ecosystem. Hold CLAWD to access premium features, agent minting, and governance.

- **Mint**: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`
- **Blockchain**: Solana
- **CLI Integration**: Use the Solana tools in clawd to query CLAWD token data, balances, and more.

---

# License

MIT
