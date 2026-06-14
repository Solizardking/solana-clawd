# Clawd Code Jupiter Skill

> Makes your AI agent an expert at building Solana DeFi applications — Jupiter swaps, lending, limit orders, DCA, combined with Helius infrastructure.

## When to Use This Skill

- User wants to build token swaps using Jupiter Swap API V2
- User wants lending/borrowing via Jupiter Lend
- User wants limit orders via Jupiter Trigger
- User wants DCA via Jupiter Recurring
- User wants token and price data

## Key Tools

- Helius MCP — Sender, priority fees, DAS, WebSockets, Wallet API
- Jupiter references — swap, lend, trigger, recurring, tokens-price

## Key Concepts

- Swap V2: `GET /v2/quote` → `POST /v2/swap` → sign and send
- Always include slippage BPS protection
- Use `getPriorityFeeEstimate` for fee optimization
- Combine with Helius Sender for reliable landing