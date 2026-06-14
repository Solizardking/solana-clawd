# ⛏ Bitaxe Orelane

```
 ██████╗ ██████╗ ███████╗██╗      █████╗ ███╗   ██╗███████╗
██╔═══██╗██╔══██╗██╔════╝██║     ██╔══██╗████╗  ██║██╔════╝
██║   ██║██████╔╝█████╗  ██║     ███████║██╔██╗ ██║█████╗  
██║   ██║██╔══██╗██╔══╝  ██║     ██╔══██║██║╚██╗██║██╔══╝  
╚██████╔╝██║  ██║███████╗███████╗██║  ██║██║ ╚████║███████╗
 ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝
```

> **Dual-yield Bitcoin + ORE mining controller with Phoenix perp trading — all from Telegram.**

[![Tests](https://img.shields.io/badge/tests-46%20passing-brightgreen)](#testing)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#quick-start)
[![Bitaxe](https://img.shields.io/badge/Bitaxe-Gamma%20602-orange)](#live-rig)
[![ORE](https://img.shields.io/badge/ORE-Solana-purple)](#ore-strategy)
[![Vulcan](https://img.shields.io/badge/Phoenix-Vulcan%20CLI-blue)](#phoenix-perps)
[![Helius](https://img.shields.io/badge/RPC-Helius%20DAS-red)](#helius-das-api)

---

## What This Is

```
┌─────────────────────────────────────────────────────────────┐
│                     BITAXE ORELANE                          │
│                                                             │
│  🟠 BM1370 ASIC          ⛏ Bitcoin SHA-256 @ ~820 GH/s    │
│  🟣 ORE Controller        💎 Deploy / Checkpoint / Claim   │
│  🔵 Phoenix Vulcan        📈 Paper + Live Perp Trading      │
│  🔴 Helius DAS API        👛 Wallet Asset Lookup            │
│  🤖 Telegram Bot          🗣 Natural Language Interface     │
│  🧠 DeepSeek              🔀 Intent Routing                  │
└─────────────────────────────────────────────────────────────┘
```

**The design principle:** The BM1370 ASIC never stops hashing Bitcoin. The controller plane handles ORE strategy and Phoenix perp trading *around* the ASIC using the same device's idle headroom. Safety gates block any ORE or trading action that would degrade miner uptime.

---

## Live Rig

| Metric | Value |
|--------|-------|
| Device | Bitaxe Gamma board `602` |
| Firmware | AxeOS `v2.10.1` |
| ASIC | BM1370 |
| Hashrate | ~820 GH/s |
| Power | ~16.5 W |
| Efficiency | ~0.020 W/GH |
| Temp | ~54°C |
| WiFi | ~-52 dBm |
| Pool | public-pool.io |

---

## Features

### ⚡ Speed Optimizations
- **Parallel snapshot collection** — Bitaxe telemetry, Solana board, slot, miner account, and wallet balance all fetched simultaneously (was sequential)
- **10s timeout** on all Bitaxe HTTP calls — no more hanging on network issues
- **Retry with exponential backoff** on Telegram `getUpdates` — bot never crashes on transient failures

### 🎛 Bitaxe Controls
- Live hashrate trend (1m / 10m / 1h averages)
- Efficiency metric (W/GH)
- Frequency control (`/freq 500`)
- Pause, resume, and reboot via Telegram (gated)
- Full safety gate evaluation (temp, CPU, heap, WiFi, pause state)

### 💎 ORE Strategy
- **Policy engine:** `deploy → checkpoint → claim → hold` decision loop
- **Board analysis:** identifies empty squares and underbet squares for optimal deploy
- **Safety gating:** ORE never executes when Bitaxe health fails
- **Sequential deploys** across multiple squares from a single budget
- **ORE v3 timing discipline:** aim for the 5-55 second safe window inside each round

### 📈 Phoenix Perp Trading (Vulcan CLI)
- **Live market ticker** — real-time price, 24h change, open interest
- **Technical analysis** — RSI, MACD, Bollinger Bands, ATR, ADX via `vulcan ta report`
- **Candles + indicators** — OHLCV with computed indicators
- **Paper trading** — paper long/short with no real funds
- **Live trading** — gated behind `LIVE_TRADING=true`, `OPERATOR_CONFIRMED=true`, `PERPS_SIM_ONLY=false`
- **Position management** — list, portfolio snapshot, margin health

### 👛 Helius DAS API
- Wallet asset lookup via Helius `getAssetsByOwner`
- Shows SOL balance, fungible tokens with USD values, NFT count
- Powered by your configured Helius API key

### 🤖 Telegram Bot
- **Natural language routing** via DeepSeek `deepseek-v4-pro` with tool-call structured output
- **OpenRouter fallback** via `openrouter/free` when DeepSeek is unavailable
- **Keyword fallback** when neither DeepSeek nor OpenRouter is available
- **Chunked message delivery** — handles responses > 4096 chars
- **Graceful shutdown** on SIGINT/SIGTERM
- **Chat allowlist** via `TELEGRAM_ALLOWED_CHATS`

---

## Telegram Commands

### Mining & Status
```
/status         — Full rig snapshot: Bitaxe, ORE, wallet, policy decision
/hashrate       — Hashrate trend: current, 1m, 10m, 1h averages
/efficiency     — W/GH efficiency metric + voltage/current/temp
/optimize       — BTC lottery/latency plan + ORE round analysis
/freq           — Get current Bitaxe frequency
/freq 500       — Set frequency to 500 MHz (gated)
/led red        — Set base LED color (gated, firmware overlay required)
/led #00ff80    — Set base LED by hex color
/led_cycle      — Cycle base LED colors on-device
/pause          — Pause Bitaxe mining (gated)
/resume         — Resume Bitaxe mining (gated)
/reboot         — Restart Bitaxe (gated)
```

### ORE
```
/ore_checkpoint — Submit ORE checkpoint (gated)
/ore_claim      — Claim ORE rewards (gated)
/ore_deploy 0.05 3,7,12  — Preview deploy: 0.05 SOL across squares 3,7,12
```

### Phoenix Perps (Vulcan)
```
/ticker SOL              — Live SOL price ticker
/ta SOL                  — TA report: RSI, MACD, BBands, ATR, ADX
/ta SOL 4h               — TA on 4-hour timeframe
/candles SOL             — OHLCV + indicators
/portfolio               — Full portfolio snapshot
/positions               — Open positions list
/margin                  — Cross-margin health, equity, available balance
/paper_buy SOL 100       — Paper market buy $100 SOL
/paper_sell SOL 100      — Paper market sell $100 SOL
/perps_live_long SOL 100 — Live market buy (gated)
/perps_live_short SOL 100— Live market sell (gated)
```

### Wallet & Info
```
/wallet    — DAS wallet assets via Helius (SOL, tokens, NFTs)
/payments  — x402 payment surfaces
/agents    — Clawd agent surfaces
/dashboard — AxeOS + firmware API endpoints
/help      — Full command list
```

### Natural Language Examples
```
"what's the hashrate trending?"
"show me RSI and MACD on SOL"
"paper long SOL $200"
"what's my portfolio equity?"
"am I too close to liquidation?"
"optimize my ore deploy strategy"
"pause the miner"
"set frequency to 520 MHz"
"show my wallet tokens"
```

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env .env.local
# Edit .env — fill in Helius API key and Telegram token
```

### 3. Build
```bash
npm run build
```

### 4. Run Tests (46 passing)
```bash
npm test
```

### 5. Status Check (dry run, reads live Bitaxe + ORE chain)
```bash
npm run status
```

### 6. Change Base LED Color
Requires the firmware overlay endpoint and live rig-control gates:

```bash
npm run led -- red
npm run led -- "#00ff80"
npm run led -- cycle
```

### 7. Test Telegram Bot (no Telegram connection needed)
```bash
npm run bot:test -- /help
npm run bot:test -- /ticker SOL
npm run bot:test -- "show me RSI on SOL"
npm run bot:test -- "what's the hashrate?"
npm run bot:test -- "/led purple"
```

### 8. Run the Bot
```bash
npm run bot
```

### 9. Run Full Control Loop
```bash
npm start
```

---

## Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `RPC` or `HELIUS_RPC_URL` | Solana RPC endpoint (Helius pre-configured) |
| `HELIUS_API_KEY` | Helius API key for DAS wallet lookups |

### Keypair (required for live ORE execution)
| Variable | Description |
|----------|-------------|
| `KEYPAIR` | Path to Solana JSON keypair file |
| `KEYPAIR_BASE58` | Base58 secret key alternative |

### Bitaxe
| Variable | Default | Description |
|----------|---------|-------------|
| `BITAXE_URL` | `http://192.168.1.100/` | AxeOS base URL |
| `BITAXE_MAX_TEMP_C` | `72` | Safety gate: max chip temp |
| `BITAXE_MAX_CPU` | `75` | Safety gate: max CPU usage % |
| `BITAXE_MIN_FREE_HEAP` | `150000` | Safety gate: min free heap bytes |
| `BITAXE_MIN_RSSI` | `-75` | Safety gate: min WiFi RSSI |

### Live Execution Gates
| Variable | Default | Description |
|----------|---------|-------------|
| `DRY_RUN` | `true` | Master dry-run switch |
| `LIVE_EXECUTION` | `false` | Gate for ORE live execution |
| `OPERATOR_CONFIRMED` | `false` | Human confirmation gate |
| `RIG_CONTROL_LIVE` | `false` | Gate for Bitaxe pause/resume/reboot |

### ORE Policy
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_DEPLOY_SOL` | `0.05` | Max SOL to deploy per round |
| `MIN_RESERVE_SOL` | `0.05` | Min SOL wallet reserve |
| `MAX_SQUARES_PER_ROUND` | `3` | Max squares to deploy across |
| `CLAIM_SOL_THRESHOLD` | `0.01` | Auto-claim SOL rewards threshold |
| `CLAIM_ORE_THRESHOLD` | `0.50` | Auto-claim ORE rewards threshold |

### Telegram & AI
| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | — | BotFather token |
| `TELEGRAM_ALLOWED_CHATS` | `""` | Comma-separated chat ID allowlist (empty = any) |
| `DEEPSEEK_API_KEY` | — | Primary AI router for NLP routing |
| `DEEPSEEK_MODEL` | `deepseek-v4-pro` | DeepSeek model |
| `OPENROUTER_API_KEY` | — | Fallback AI router when DeepSeek fails or is unset |
| `OPENROUTER_MODEL` | `openrouter/free` | OpenRouter fallback model |

### Phoenix Perps (Vulcan)
| Variable | Default | Description |
|----------|---------|-------------|
| `VULCAN_BIN` | `vulcan` | Vulcan CLI binary name or path |
| `VULCAN_WALLET_NAME` | — | Vulcan wallet name |
| `VULCAN_WALLET_PASSWORD` | — | Vulcan wallet password (for non-interactive MCP) |
| `LIVE_TRADING` | `false` | Gate for live perp execution |
| `PERPS_SIM_ONLY` | `true` | Force paper-only mode |

### ORE CLI
| Variable | Default | Description |
|----------|---------|-------------|
| `ORE_ROOT` | `~/Downloads/ClawdBrowser/ore-master` | ORE CLI source root |
| `ORE_CLI_PATH` | `$ORE_ROOT/target/release/ore-cli` | Explicit CLI path |

---

## Architecture

```
                     Telegram Message
                           │
                    ┌──────▼───────┐
                    │ parseCommand │ ── slash command?
                    └──────┬───────┘
                           │ no
                    ┌──────▼───────┐
                    │   DeepSeek   │ ── tool-call NLP routing
                    │  (fallback:  │
                    │  keywords)   │
                    └──────┬───────┘
                           │ BotIntent
                    ┌──────▼───────┐
                    │ executeIntent│
                    └──┬───┬───┬───┘
                       │   │   │
             ┌─────────┘   │   └──────────────┐
             │             │                  │
    ┌────────▼──────┐  ┌───▼────────┐  ┌─────▼──────────┐
    │ Bitaxe AxeOS  │  │ ORE Engine │  │   Vulcan CLI   │
    │ (parallel     │  │ (policy +  │  │ (ticker, TA,   │
    │  snapshot)    │  │  ore-cli)  │  │  paper/live    │
    └───────────────┘  └────────────┘  │  trades,       │
                                       │  positions)    │
                                       └────────────────┘
```

### Snapshot Collection (Parallelized)
```
Phase 1 (parallel):
  ├── fetchBitaxeSystemInfo()    ← AxeOS HTTP
  ├── getBoard()                 ← Solana RPC
  ├── getCurrentSlot()           ← Solana RPC
  ├── getMiner()                 ← Solana RPC
  └── getSolBalance()            ← Solana RPC

Phase 2 (depends on board.roundId):
  └── getRound()                 ← Solana RPC

Phase 3 (sync):
  └── analyzeBoard()
```

---

## Testing

```bash
npm test
```

```
 ✓ src/tests/deepseek.test.ts   (18 tests)
 ✓ src/tests/constants.test.ts  (11 tests)
 ✓ src/tests/policy.test.ts      (7 tests)
 ✓ src/tests/strategy.test.ts   (10 tests)

 Test Files  4 passed (4)
      Tests  46 passed (46)
   Duration  386ms
```

Tests cover:
- `solAmount`, `oreAmount`, `solToLamports` formatting
- `analyzeBoard` — mining window detection, empty square identification, claim hours
- `chooseSquares` — empty-first priority, deduplication, maxSquares limit
- `decide` — all policy branches: safety gate, checkpoint, claim, reserve, deploy
- `routeWithKeywords` — 18 routing cases for all intent types

---

## Safety Model

```
Live ORE execution requires ALL of:
  ✓ DRY_RUN=false
  ✓ LIVE_EXECUTION=true
  ✓ OPERATOR_CONFIRMED=true
  ✓ Bitaxe safety gates pass (temp, CPU, heap, WiFi, pause state)

Bitaxe rig control (pause/resume/reboot/freq) requires ALL of:
  ✓ DRY_RUN=false
  ✓ RIG_CONTROL_LIVE=true
  ✓ OPERATOR_CONFIRMED=true

Live perp trading requires ALL of:
  ✓ LIVE_TRADING=true
  ✓ OPERATOR_CONFIRMED=true
  ✓ PERPS_SIM_ONLY=false
```

**Default mode is fully paper/observe.** Nothing moves without explicit gate arming.

---

## Installing Vulcan CLI

```bash
curl -fsSL https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh | sh
vulcan setup
vulcan status
```

---

## Files

| Path | Description |
|------|-------------|
| [src/index.ts](src/index.ts) | CLI entrypoint (loop / once / status modes) |
| [src/telegram-bot.ts](src/telegram-bot.ts) | Telegram bot with retry + graceful shutdown |
| [src/controller.ts](src/controller.ts) | Parallelized snapshot collection + execution |
| [src/operator.ts](src/operator.ts) | All bot intent handlers |
| [src/bitaxe.ts](src/bitaxe.ts) | AxeOS API: info, pause, resume, reboot, freq, LED, efficiency |
| [src/led.ts](src/led.ts) | Direct base LED color CLI |
| [src/helius.ts](src/helius.ts) | Helius DAS API: wallet asset lookup |
| [src/perps-bridge.ts](src/perps-bridge.ts) | Vulcan CLI integration: ticker, TA, paper/live trades |
| [src/deepseek.ts](src/deepseek.ts) | DeepSeek NLP routing + keyword fallback |
| [src/policy.ts](src/policy.ts) | ORE decision engine |
| [src/strategy.ts](src/strategy.ts) | Board analysis + square selection |
| [src/ore-rpc.ts](src/ore-rpc.ts) | ORE on-chain state reader (board, round, miner) |
| [src/ore-cli.ts](src/ore-cli.ts) | ore-cli wrapper (deploy, checkpoint, claim) |
| [../ore/ore-v3-smart-mining.md](../ore/ore-v3-smart-mining.md) | ORE v3 timing, probability, and risk guide |
| [src/config.ts](src/config.ts) | Full config loader from env |
| [src/tests/](src/tests/) | 46 vitest tests |
| [clawd.json](clawd.json) | Clawd agent definition (paper-first, CAAP/1.0) |
| [firmware/esp-miner-overlay/](firmware/esp-miner-overlay/) | ESP-Miner orelane firmware overlay |
| [docs/architecture.md](docs/architecture.md) | Architecture deep-dive |
| [docs/telegram-bot.md](docs/telegram-bot.md) | Bot reference |
