# Clawd Code DFlow Skill

> Makes your AI agent an expert at building Solana trading applications — DFlow swaps, prediction markets, streaming, and KYC combined with Helius infrastructure.

## When to Use This Skill

- User wants to build trading UIs with DFlow spot swaps
- User wants to integrate prediction markets (Kalshi via DFlow)
- User wants real-time price streaming via DFlow WebSockets
- User wants KYC verification via DFlow Proof
- User wants to combine DFlow trading with Helius infrastructure

## Key Tools

- DFlow MCP — trading API details, response schemas, code examples
- Helius MCP — Sender, priority fees, DAS, WebSockets, Wallet API

## Key Concepts

- Spot swaps via `dflow_swap_quote` → `dflow_build_swap` → sign and send
- Prediction markets via Kalshi outcome tokens (YES/NO)
- Priority fees: use `getPriorityFeeEstimate` — never hardcode
- Jito tips: minimum 0.0002 SOL when sending via Helius Sender