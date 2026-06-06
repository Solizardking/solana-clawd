---
category: ai_ml
description: x402.wtf paid automation routes for premium agent chat, sandbox launch flows, wallet intelligence, and catalog discovery.
endpoints:
- description: List the live paid Clawd routes, their pricing, CLAWD overlay pricing, and supported settlement protocols.
  method: GET
  path: api/x402/catalog
  resource: catalog
- description: Return public automation entrypoint metadata, login state, sandbox actions, and the current pay.sh/x402 price for premium agent chat.
  method: GET
  path: api/automation/status
  resource: automation-status
- description: Stream a private Clawd operator session for premium research, routing, and higher-cost task execution.
  method: POST
  path: api/x402/clawd
  pricing:
    dimensions:
    - direction: usage
      scale: 1
      tiers:
      - price_usd: 1.5
      unit: requests
  resource: private-agent-session
- description: Stream premium agent chat events for public automation users after a $0.69420 x402/pay.sh payment or 1,000 CLAWD app-native access check.
  method: POST
  path: api/x402/agent/chat
  pricing:
    dimensions:
    - direction: usage
      scale: 1
      tiers:
      - price_usd: 0.6942
      unit: requests
  resource: premium-agent-chat
- description: Inspect a Solana wallet with Helius-backed balances and indexed assets, then return a concise operator brief.
  method: POST
  path: api/store/agents/wallet-brief
  pricing:
    dimensions:
    - direction: usage
      scale: 1
      tiers:
      - price_usd: 0.1
      unit: requests
  resource: wallet-brief
name: clawd-browser
sandbox_service_url: http://127.0.0.1:1402
service_url: https://www.x402.wtf
title: Clawd Browser Paid API
version: v1
---
