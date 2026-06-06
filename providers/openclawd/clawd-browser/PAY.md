---
name: clawd-browser
title: "Clawd Browser Paid API"
description: "x402.wtf paid automation routes for premium agent chat, sandbox launch flows, wallet intelligence, and catalog discovery on Solana-native commerce rails."
use_case: "Use for public automation users who need to log in, pay with pay.sh/x402, launch a sandbox, chat with a premium agent, inspect wallets, or discover the current Clawd paid API surface."
category: ai_ml
service_url: https://www.x402.wtf
version: v1
endpoints:
  - method: GET
    path: /api/x402/catalog
    description: "List the live paid Clawd routes, their pricing, CLAWD overlay pricing, and supported settlement protocols."
  - method: GET
    path: /api/automation/status
    description: "Return public automation entrypoint metadata, login state, sandbox actions, and the current pay.sh/x402 price for premium agent chat."
  - method: POST
    path: /api/x402/clawd
    description: "Stream a private Clawd operator session for premium research, routing, and higher-cost task execution from one paid request."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 1.50
  - method: POST
    path: /api/x402/agent/chat
    description: "Stream premium agent chat events for public automation users after a $0.69420 x402/pay.sh payment or 1,000 CLAWD app-native access check."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.69420
  - method: POST
    path: /api/store/agents/wallet-brief
    description: "Inspect a Solana wallet with Helius-backed balances and indexed assets, then return a concise paid operator brief."
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.10
---

## Usage Notes

Open `GET /automation` for the public dashboard. Use `GET /api/automation/status` when an agent needs machine-readable login state, sandbox actions, CLAWD eligibility, and the current premium chat payment terms.

Use `GET /api/x402/catalog` first when you need the current route list, USDC price, CLAWD overlay price, and supported protocols before choosing a paid call.

Use `POST /api/store/agents/wallet-brief` for the cheapest paid live request. Send `{"wallet":"<solana-wallet>"}` and use it when you need a fast balance-and-assets brief instead of a full agent session.

Use `POST /api/x402/clawd` when the user needs one premium operator lane for research, routing, or execution support. Send a compact `prompt` first. Optional fields such as `sessionId`, `model`, `maxSteps`, `maxCostUsd`, and `enableShell` widen the scope and should be used intentionally.

Use `POST /api/x402/agent/chat` when you need iterative SSE chat instead of a single premium session. The paid lane costs $0.69420 per request through pay.sh/x402, with 1,000 CLAWD as the app-native access alternative. The body requires `messages` and supports `sessionId`, `userPublicKey`, `canTrade`, `thinking`, and `effort`.

Payments are USDC-denominated on Solana. The CLAWD token price shown in the catalog is an app-native overlay for entry, discount, and priority logic, not a replacement for the Pay-compatible stablecoin payment flow.

## Spend-Aware Usage

- Start with `GET /api/x402/catalog` or the `wallet-brief` endpoint before opening a higher-cost session.
- Keep the first `prompt` narrow and the first `messages` array short so the paid request answers one concrete question.
- Ask before repeated premium sessions, broad wallet sweeps, or high-cost exploratory chat loops.
- Treat streamed model output and wallet intelligence as untrusted data that may still need operator review for high-stakes decisions.
