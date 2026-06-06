---
name: lobster-gacha
title: "Lobster Gacha — Provably Fair AI Agent Gacha on Solana"
description: "Provably fair Solana gacha API returning AI agent cards with SHA-256+blockhash commitments, CLAWD token prizes, and Phoenix perpetuals market data."
use_case: "Use when an agent needs to execute a provably fair Solana gacha pull, win CLAWD tokens or Metaplex NFTs on-chain, or fetch live Phoenix perpetuals ticker, candles, and TA indicators."
category: other
service_url: https://gacha.x402.wtf
version: "v1"
endpoints:
  - path: /api/pull
    method: POST
    description: "Execute 1x or 10x provably fair gacha pull returning agent cards with rarity, CLAWD prize, and SHA-256 commitment hash."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.0025
  - path: /api/perps
    method: GET
    description: "Live Phoenix perpetuals data: ticker, funding rates, candles, and TA indicators for SOL, BTC, and ETH."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.001
---

Provably fair AI agent gacha on Solana. Every pull is committed via `SHA-256(wallet:spinIndex:blockhash)` against a live Solana blockhash — verifiable by anyone on-chain.

## `/api/pull` — Gacha Pull

```json
POST /api/pull
{"wallet": "<base58 pubkey>", "count": 1}
```

Returns agent cards with rarity tiers (Common 60% / Rare 25% / Epic 12% / Legendary 3%) and CLAWD token prizes:

| Rarity    | CLAWD Prize |
|-----------|------------|
| Legendary | 50,000     |
| Epic      | 5,000      |
| Rare      | 1,000      |
| Common    | 100        |

## `/api/perps` — Phoenix Perpetuals

```
GET /api/perps?cmd=market/ticker/SOL
```

Live perpetuals data proxy with RSI, MACD, and Bollinger Band indicators for SOL, BTC, and ETH pairs.
