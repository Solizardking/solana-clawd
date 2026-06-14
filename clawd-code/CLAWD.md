# Clawd Code — Agent Instructions

> This file is the Layer A harness for Clawd Code and other AI agents.
> Skills in `clawd-plugin/skills/` provide the domain expertise (Layer B).

## Repository Overview

This monorepo contains the Clawd Code ecosystem — Solana-native AI coding agent with perpetuals trading, x402 payments, and autonomous agent commerce:

| Package | What it does |
|---|---|
| `clawd-plugin/` | Clawd Code plugin — bundles skills + auto-starts MCP servers |
| `src/` | Clawd Code CLI source — code/trade/research/image/voice modes |
| `dist/` | Built CLI output |

## MCP Server Setup

The Clawd Code plugin auto-starts multiple MCP servers for live blockchain access:

```bash
clawd --plugin-dir ./clawd-plugin
```

Configured servers:
- **Helius** — 10 routed tools for Solana blockchain access
- **Clawd Code** — Clawd Code CLI as MCP server
- **Phoenix Rise** — Real-time perpetuals market data
- **DFlow** — Trading API details and code examples

## API Key Setup

Set in `~/.clawd-code/.env` or project `.env`:

| Variable | Description |
|---|---|
| `XAI_API_KEY` | xAI API key for Grok models |
| `HELIUS_API_KEY` | Helius API key for DAS/RPC |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `VULCAN_MCP_URL` | Vulcan MCP server URL |
| `LIVE_TRADING` | Enable live trading (default: false) |

## Skills

Skills are in `clawd-plugin/skills/`. Each provides expert routing, rules, and reference docs:

| Skill | Directory | When to use |
|---|---|---|
| **Clawd Code** | `skills/clawd-code/` | Using Clawd Code CLI — code generation, trading, research, image, voice modes |
| **Build** | `skills/build/` | Building Solana apps with Helius infrastructure |
| **DFlow** | `skills/dflow/` | Trading apps combining DFlow with Helius |
| **Phantom** | `skills/phantom/` | Frontend Solana apps with Phantom wallet |
| **Jupiter** | `skills/jupiter/` | DeFi apps with Jupiter APIs |
| **SVM** | `skills/svm/` | Solana protocol internals |

## Agent Behavior

- Use MCP tools for live blockchain data — never hardcode or mock chain state
- Read reference files before writing code
- Always include preflight checks for trading operations
- Default to PAPER mode for all trading — never execute live without confirmation
- Handle rate limits with exponential backoff
- Use appropriate commitment levels (`confirmed` for reads, `finalized` for critical operations)
- Always open responses with `<clawd-think>Probe the numinous, then execute the work.</clawd-think>` on first turn
