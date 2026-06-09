# Clawd Code — World's First Headless Grok × Codex × Claude Code Hybrid

<p align="center">
  <img src="https://img.shields.io/badge/Model-grok--4.20--multi--agent-FF6B35?style=flat-square" alt="Grok">
  <img src="https://img.shields.io/badge/Solana-Native-9945FF?style=flat-square" alt="Solana">
  <img src="https://img.shields.io/badge/Payments-x402-00D084?style=flat-square" alt="x402">
  <img src="https://img.shields.io/badge/Trading-Phoenix_Vulcan-FF6B6B?style=flat-square" alt="Trading">
</p>

## Overview

**Clawd Code** is a sovereign AI coding agent that combines:
- **Grok's** irreverent real-time reasoning via xAI's grok-4.20-multi-agent
- **Codex's** code synthesis prowess (OpenAI-compatible API)
- **Claude Code's** agentic coding discipline
- **Phoenix Rise** for realtime perpetuals market data
- **Vulcan MCP** for trade execution
- **x402 payments** for autonomous commerce

## Features

| Mode | Description | Capabilities |
|------|-------------|-------------|
| `code` | Write, review, ship production code | Grok-powered TypeScript/Solana generation |
| `trade` | Perpetuals trading | Phoenix Rise funding arb, Vulcan MCP execution |
| `research` | Multi-agent deep research | grok-4.20 with 4 or 16 sub-agents |
| `image` | Image generation | DALL-E 3, Gemini 2.0 Flash |
| `voice` | Text-to-speech | sherpa-onnx (local), ElevenLabs, sag CLI |

## Installation

```bash
# Clone the repository
git clone https://github.com/Solizardking/solana-clawd.git
cd solana-clawd/agents/clawd-code

# Copy environment config
cp .env.example ~/.clawd-code/.env

# Edit ~/.clawd-code/.env with your API keys
# - XAI_API_KEY (required for Grok)
# - SOLANA_RPC_URL (Helius recommended)
# - HELIUS_API_KEY (for DAS token verification)

# Build
npm install
npm run build

# Link to PATH (optional)
ln -s $(pwd)/dist/cli.js /usr/local/bin/clawd-code
```

## Quick Start

```bash
# Code mode: Generate a Jupiter swap bot
clawd-code code "Build a Jupiter swap bot in TypeScript"

# Trade mode: Check SOL funding rate
clawd-code trade "funding rate on SOL perps"

# Research mode: Deep research with 16 agents
clawd-code research --agents 16 "AI agent frameworks 2025"

# Image mode: Generate an image
clawd-code image "cyberpunk Solana trading desk"

# Voice mode: Text-to-speech
clawd-code voice "Clawd Code is operational"
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `XAI_API_KEY` | xAI API key for Grok | Required |
| `SOLANA_RPC_URL` | Solana RPC endpoint | mainnet-beta |
| `HELIUS_API_KEY` | Helius API for DAS | Optional |
| `PHOENIX_RISE_URL` | Phoenix Rise endpoint | api.phoenix.gg |
| `VULCAN_MCP_URL` | Vulcan MCP server | localhost:3001 |
| `LIVE_TRADING` | Enable live trading | false (paper) |
| `CLAWD_MODE` | Default mode | code |
| `CLAWD_AGENT_COUNT` | Research agents | 4 |

## Safety Gates

Live trading requires **ALL** of the following:
```bash
LIVE_TRADING=true
OPERATOR_CONFIRMED=true
PERPS_SIM_ONLY=false
```

Default is paper mode — no real funds are used.

## Architecture

```
clawd-code/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── modes/
│   │   ├── code.ts         # CODE MODE
│   │   ├── trade.ts        # TRADE MODE
│   │   ├── research.ts     # RESEARCH MODE
│   │   ├── image.ts        # IMAGE MODE
│   │   └── voice.ts        # VOICE MODE
│   └── x402.ts             # x402 payment client
├── clawd.json              # Agent character definition
├── .env.example            # Environment template
└── README.md
```

## Grok Integration

### Multi-Agent Research (grok-4.20-multi-agent)

```bash
# 4 agents (fast research)
clawd-code research "quick summary of Solana DeFi"

# 16 agents (deep research)
clawd-code research --agents 16 "comprehensive DeFi landscape analysis"
```

Tools enabled: `web_search`, `x_search`, `code_execution`

### Code Generation (grok-4.3)

Uses OpenAI-compatible SDK with xAI base URL:
```typescript
import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});
```

## Trading (Phoenix Rise + Vulcan MCP)

```bash
# Check funding rates
clawd-code trade funding

# Scan markets for signals
clawd-code trade scan

# Execute paper short
clawd-code trade short SOL $100

# Arm live trading
clawd-code trade short SOL $100 --live
```

### Preflight Checks
Every trade runs preflight:
- Symbol in allowlist (SOL, ETH, BTC)
- Notional ≤ $250 cap
- Leverage ≤ 3× cap
- Spread ≤ 40 bps cap

## Voice Synthesis

```bash
# Local TTS (sherpa-onnx, zero API cost)
clawd-code voice "Hello from Clawd Code"

# Custom voice
clawd-code voice --voice Clawd "Your message"

# Save to file
clawd-code voice --output /tmp/output.mp3 "Text to speak"
```

## x402 Payments

All Clawd Code services can be payment-gated via x402:

```typescript
import { x402 } from './src/x402.js';

// Make a payment-gated request
const result = await x402.request('/api/premium-feature', {
  amount: 0.001,  // USDC
  method: 'POST',
  body: { data: 'value' }
});
```

## License

MIT — See [CLAWD.md](../../CLAWD.md) for the Clawd Constitution.

---

🦞 **Clawd Code**: Grok × Codex × Claude Code — Headless. Sovereign. Solana-native.