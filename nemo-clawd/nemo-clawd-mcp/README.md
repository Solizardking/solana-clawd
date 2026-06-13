# nemoClawd MCP Server

xAI Grok powered Solana agentic tools with 31 MCP tools.

## Features

- **xAI Grok Integration** — Chat, vision, image generation, X search, multi-agent research
- **31 MCP Tools** — Solana market data, Helius RPC/DAS, Pump.fun trading, agent fleet
- **Multi-Transport** — STDIO (for Clawd Desktop, Cursor, VS Code) and HTTP (for Fly.io)

## Installation

```bash
cd nemo-clawd/nemo-clawd-mcp
npm install
npm run build
```

## Usage

### STDIO Mode (recommended for desktop)

Add to your MCP config:

```json
{
  "nemoclawd": {
    "command": "node",
    "args": ["/path/to/solana-clawd/nemo-clawd/nemo-clawd-mcp/dist/index.js"]
  }
}
```

Or with environment variables:

```bash
XAI_API_KEY=your_key HELIUS_API_KEY=your_key node dist/index.js
```

### HTTP Mode (for remote access)

```bash
npm run start:http
# Or with npx
npx nemoclawd-mcp --http
```

Connect via:
```json
{
  "type": "http",
  "url": "https://your-app.fly.dev/mcp"
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | Yes | xAI Grok API key |
| `HELIUS_API_KEY` | Yes | Helius RPC API key |
| `HELIUS_RPC_URL` | No | Custom RPC URL |
| `BIRDEYE_API_KEY` | No | BirdEye API key |
| `SOLANA_TRACKER_API_KEY` | No | Solana Tracker API key |

## Tools

### Solana Market Data (8 tools)
- `solana_price` — Live token price
- `solana_trending` — Top trending tokens
- `solana_token_info` — Token metadata + security score
- `solana_wallet_pnl` — Wallet P&L analysis
- `solana_search` — Token search
- `solana_top_traders` — Smart money wallets
- `solana_wallet_tokens` — Token balances
- `sol_price` — Quick SOL/USD

### Helius Onchain (6 tools)
- `helius_account_info` — Full account data
- `helius_balance` — SOL balance
- `helius_transactions` — Transaction history
- `helius_priority_fee` — Priority fee estimates
- `helius_das_asset` — DAS metadata
- `helius_webhook_create` — Webhook management

### Agent Fleet (3 tools)
- `agent_spawn` — Spawn agents (explorer/scanner/ooda/dream/analyst/monitor)
- `agent_list` — List active agents
- `agent_stop` — Stop agents

### Memory (2 tools)
- `memory_recall` — Query memory by tier
- `memory_write` — Write to memory

### Pump.fun (7 tools)
- `pump_token_scan` — Token bonding curve scan
- `pump_buy_quote` — Buy quote
- `pump_sell_quote` — Sell quote
- `pump_graduation` — Graduation check
- `pump_market_cap` — Market cap
- `pump_top_tokens` — Top tokens
- `pump_new_tokens` — New tokens

### xAI Grok (6 tools)
- `grok_chat` — Chat with Grok 4.20
- `grok_vision` — Image analysis
- `grok_image` — Image generation
- `grok_x_search` — X/Twitter search
- `grok_web_search` — Web search
- `grok_deep_research` — Multi-agent research (4-16 agents)

## Deploy to Fly.io

```bash
cd nemo-clawd/nemo-clawd-mcp
fly launch --config fly.toml
fly secrets set XAI_API_KEY=your-key HELIUS_API_KEY=your-key
fly volumes extend vol_xxx -s 1
fly deploy
```

## Architecture

```
┌────────────────────────────────────────────────────┐
│                   Entry Point                      │
│  index.ts (stdio) ←→ http.ts (http)                │
└─────────────┬────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────┐
│              MCP Server (SDK)                       │
│  ListTools → TOOL_DEFINITIONS                      │
│  CallTool  → handleToolCall()                      │
└─────────────┬────────────────────────────────────┘
              │
    ┌────────┴────────┬─────────────┐
    ▼                 ▼             ▼
┌────────┐      ┌──────────┐   ┌────────┐
│ Helius  │      │ xAI Grok │   │ External│
│  RPC    │      │   API    │   │   APIs  │
└────────┘      └──────────┘   └────────┘
```

## License

MIT
