---
name: x402
title: "Clawd — x402.wtf Paid AI Agent Platform on Solana"
description: "x402.wtf paid AI agent platform and Solana DeFi API hub. Private Claude operator sessions, premium agent routing, wallet intelligence, stock data, Pump.fun analytics, 124-agent catalog. USDC or $CLAWD accepted. Holders get tiered discounts."
use_case: "Use for private Claude operator sessions, specialized DeFi/trading agent routing, Solana wallet intelligence briefs, realtime stock fundamentals, and Pump.fun token intelligence. $CLAWD holders get discounted access. Start with GET /api/x402/catalog."
category: ai_ml
service_url: https://x402.wtf
version: v1
openapi:
  path: openapi.json
endpoints:
  # ── Free discovery & data ─────────────────────────────────────────────────
  - path: /api/x402/catalog
    method: GET
    description: "List every live paid Clawd route with current USDC price, CLAWD token overlay price, and supported settlement protocols. Always call this first."

  - path: /api/agents
    method: GET
    description: "Browse the 124-agent Clawd catalog with metadata, capabilities, and pricing. Registry canonical at https://x402.wtf/api/agents/registry."

  - path: /api/x402/agents/catalog
    method: GET
    description: "Bundled DeFi/Solana agents available via /api/x402/agents/chat, with agentId, description, and capabilities."

  - path: /api/x402/stocks/catalog
    method: GET
    description: "List available stock data endpoints and fields proxied from Financial Datasets API."

  - path: /api/x402/backroom-pump/catalog
    method: GET
    description: "Catalog of Pump.fun intelligence endpoints available in the backroom premium tier."

  - path: /api/dex/token-data
    method: GET
    description: "Free Solana DEX token snapshot from DexScreener: price, volume, liquidity, pair metadata."

  # ── Paid endpoints (x402 USDC, Solana mainnet) ───────────────────────────
  - path: /api/x402/clawd
    method: POST
    description: "Private Clawd operator session (SSE stream). Multi-step autonomous task execution with Claude. Highest compute allocation, operator-grade tool access."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 1.50

  - path: /api/x402/agent/chat
    method: POST
    description: "Premium agent chat (SSE stream). Private compute lane with sessionId, model selection, extended thinking, and canTrade flag. $CLAWD holders: 1,000 CLAWD balance grants equivalent access."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.69420

  - path: /api/x402/agents/chat
    method: POST
    description: "Bundled Solana/DeFi agent chat routed by agentId. Covers DeFi analyst, trading agent, payment agent, wallet advisor, and 40+ more from the 124-agent catalog."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.25

  - path: /api/store/agents/wallet-brief
    method: POST
    description: "Solana wallet intelligence brief. Helius-indexed SPL balances, token holdings, and asset summary for any wallet address. Lowest-cost paid endpoint."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.10

  - path: /api/x402/stocks/data
    method: POST
    description: "Realtime stock fundamentals proxy via Financial Datasets API. Price, earnings, balance sheet, and analyst data."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.15

  - path: /api/x402/backroom-pump/data
    method: POST
    description: "Backroom Pump.fun intelligence. Raw token data, holder distributions, launch metadata, and trend signals for Pump.fun tokens."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 4.20

  - path: /api/x402/backroom-pump/analyze
    method: POST
    description: "AI analysis over Pump.fun data. Claude-powered narrative analysis, sentiment scoring, risk assessment, and rug signal detection."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 4.20
---

Official Clawd API platform at [x402.wtf](https://x402.wtf). Payments via x402 USDC on Solana mainnet or $CLAWD token (tiered access). All paid routes return HTTP 402 with a Solana x402 payment challenge; use the [`@pump-fun/x402`](https://www.npmjs.com/package/@pump-fun/x402) SDK or any x402-compatible client to auto-handle the challenge.

## $CLAWD Token

$CLAWD is the native utility token of the Clawd platform, powering fee discounts, agent access, and on-chain commitment schemes across the ecosystem.

- **Mint**: [`8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`](https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump) (SPL token on Solana mainnet, launched on Pump.fun)
- **Buy**: [Jupiter swap](https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump) — SOL → CLAWD in one click
- **Holder tier**: any wallet holding $CLAWD unlocks the Clawd Holder access tier — unlimited agent sessions, priority scraping, Phoenix perps data, and Imperial trading signals

### Holder access

| Balance | Access |
| --- | --- |
| 0 CLAWD | Pay-per-request via USDC x402 |
| ≥ 1,000 CLAWD | Equivalent access to `/api/x402/agent/chat` ($0.69420) |
| Any CLAWD | Clawd Holder badge · unlimited agent sessions · early features |

Check live prices and CLAWD overlay tiers at `/api/x402/catalog` before any paid request.

## Endpoint Pricing

| Endpoint | Price | Description |
| --- | --- | --- |
| `POST /api/x402/clawd` | $1.50 USDC | Private Clawd operator session — SSE stream |
| `POST /api/x402/agent/chat` | $0.69420 USDC | Premium agent chat — SSE stream |
| `POST /api/x402/agents/chat` | $0.25 USDC | Bundled Solana/DeFi agent routing |
| `POST /api/store/agents/wallet-brief` | $0.10 USDC | Solana wallet intelligence brief |
| `POST /api/x402/stocks/data` | $0.15 USDC | Realtime stock fundamentals |
| `POST /api/x402/backroom-pump/data` | $4.20 USDC | Pump.fun token intelligence |
| `POST /api/x402/backroom-pump/analyze` | $4.20 USDC | AI analysis over Pump.fun data |
| Free endpoints | — | Catalog, agents, DexScreener, DEX token data |

## Agent Catalog

124 production AI agents across 11 categories at `/api/agents`. Route to any by `agentId` via `/api/x402/agents/chat`.

| Category | Count | Examples |
| --- | --- | --- |
| DeFi | 60 | Liquidity analyzer, yield optimizer, risk monitor |
| Payments | 25 | x402 facilitator, CLAWD payment agent, invoice agent |
| Trading | 8 | Phoenix perps trader, TWAP executor, grid strategy |
| Analytics | 11 | Wallet brief, DEX scanner, PnL reporter |
| Security | 8 | Rug detector, audit assistant, phishing scanner |
| NFT | 2 | Metaplex minter, collection appraiser |
| Dev Tools | 3 | Solana program auditor, IDL parser, Anchor helper |
| Other | 7 | Research, governance, education, infrastructure |

## Companion Services

| Service | URL | Description |
| --- | --- | --- |
| Backroom API | `https://backroom-3d.fly.dev` | FastAPI multi-agent server: Firecrawl, monitors, Phoenix perps, loop agents. API key via `/v1/machines/handshake`. |
| Gacha API | `https://gacha.x402.wtf` | Provably fair AI agent gacha + Phoenix perps proxy. See `clawd/lobster-gacha`. |
| x402 SDK | `npm install @pump-fun/x402` | Drop-in client for auto-handling 402 → sign → retry on any Solana keypair. |

## Spend-Aware Usage

- Call `GET /api/x402/catalog` (free) first — returns live prices and CLAWD discount tiers
- Use `POST /api/store/agents/wallet-brief` ($0.10) for cheapest live wallet data
- Use `POST /api/x402/stocks/data` ($0.15) for a single stock fundamentals call
- Use `POST /api/x402/agents/chat` ($0.25) with a specific `agentId` for specialized Solana/DeFi tasks
- Use `POST /api/x402/agent/chat` ($0.69420) for iterative multi-turn sessions or hold 1,000 CLAWD for equivalent access
- Use `POST /api/x402/clawd` ($1.50) for autonomous multi-step operator-grade execution
- Use `POST /api/x402/backroom-pump/*` ($4.20) only for deep Pump.fun intelligence — most expensive tier
- All `/api/dexscreener/*` and `/api/dex/token-data` endpoints are free — use for Solana market context without payment

## Quick Start

```bash
# 1. Check catalog for live prices
curl https://x402.wtf/api/x402/catalog

# 2. Make a paid call (x402 auto-handled by SDK)
npx @pump-fun/x402 post https://x402.wtf/api/store/agents/wallet-brief \
  --wallet ~/.config/solana/id.json \
  --body '{"walletAddress": "<PUBKEY>"}'

# 3. Route to a specialized agent
npx @pump-fun/x402 post https://x402.wtf/api/x402/agents/chat \
  --wallet ~/.config/solana/id.json \
  --body '{"agentId": "defi-analyst", "messages": [{"role": "user", "content": "Analyze SOL liquidity pools"}]}'
```

## Skills

95 Claude Code skills at `/skills/` — install via:

```bash
npx skills add clawd/solana-clawd
```

Key skills: `solana-clawd` (full engine), `vulcan` (Phoenix perps), `imperial` (trading execution), `pumpfun` (Pump.fun analytics), `dflow-*` (DFlow DEX).
