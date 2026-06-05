# Solana Clawd Pay

Cloudflare Worker payment gateway for Solana Clawd Pay — x402, Solana MPP, ClawdRouter, and agentic commerce on Solana.

It sits between clients, agents, and paid model or commerce services:

```text
client / CLI / browser / agent
  -> solana-clawd-pay Worker
    -> Solana MPP proxy for receipt verification
    -> x402 OpenRouter backend for paid OpenRouter calls
    -> local/hosted ClawdRouter for smart routing
    -> OpenRouter direct fallback
    -> Metaplex agent-commerce metadata endpoints
```

## Why This Exists

Solana Clawd has multiple payment-aware pieces:

- `x402/x402-openrouter-main/backend` handles x402 payment-gated OpenRouter.
- `clawdrouter` handles local/cloud model routing and Solana-aware policies.
- `workers/*` run Cloudflare edge bots and MCP servers.
- Metaplex agentic commerce adds agent identity, execution delegation, and
  agent token fundraising.

This Worker gives those pieces one consistent HTTP contract.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Gateway health and configured upstreams. |
| `GET /v1/payments/quote` | Price, accepted networks, x402 backend, MPP proxy metadata. |
| `POST /v1/payments/challenge` | MPP-style payment challenge object for clients. |
| `POST /v1/payments/receipt` | Verify a payment receipt through MPP proxy or local HMAC. |
| `GET /v1/commerce/agent` | Agentic commerce metadata and Metaplex lifecycle hints. |
| `POST /v1/chat/completions` | Forward paid/verified model requests to ClawdRouter/x402/OpenRouter. |

## Setup

```bash
cd pay
npm install
npx wrangler dev
```

Deploy to Cloudflare:

```bash
npx wrangler deploy
```

Set secrets only when needed:

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put CLAWDROUTER_API_KEY
npx wrangler secret put MPP_PROXY_TOKEN
npx wrangler secret put RECEIPT_HMAC_SECRET
```

## Cloudflare Routing

For development, use `workers_dev = true`.

For production, add a custom domain:

```toml
routes = [
  { pattern = "pay.solanaclawd.com", custom_domain = true }
]
```

Then point app and CLI env vars at:

```bash
SOLANA_CLAWD_PAY_URL=https://pay.solanaclawd.com
```

## x402 + MPP Flow

Solana Clawd Pay supports both x402-style and MPP-style clients:

1. Client calls `GET /v1/payments/quote`.
2. Client receives accepted rails:
   - x402 EVM rails through `X402_OPENROUTER_URL`
   - Solana MPP proxy through `MPP_PROXY_URL`
   - optional direct OpenRouter fallback
3. Client pays through the chosen rail.
4. Client retries `POST /v1/chat/completions` with one of:
   - `X-Payment`
   - `Authorization: Payment ...`
   - `Payment-Receipt`
   - `X-Clawd-Pay-Receipt`
5. Worker verifies receipt or forwards to a payment-aware upstream.

## Agentic Commerce

`GET /v1/commerce/agent` returns the standard Solana Clawd commerce surface:

- Metaplex Agent Registry identity
- executive profile and delegation status hints
- Genesis bonding curve token-launch capability
- creator-fee and treasury notes
- payment routes for compute, inference, MCP, and agent services

The endpoint is metadata only. Token creation, executive delegation, and
Genesis launch operations should happen in the Metaplex-aware CLI/app layer.

## Upstream Selection

`POST /v1/chat/completions` routes in this order:

1. `CLAWDROUTER_URL` if configured.
2. `X402_OPENROUTER_URL` if configured.
3. direct OpenRouter if `OPENROUTER_API_KEY` is present.

Set `model: "auto"` to let ClawdRouter choose the cheapest sensible route.

## Response Headers

Successful forwarded responses include:

| Header | Value |
| --- | --- |
| `X-Solana-Clawd-Pay` | `1` |
| `X-Clawd-Pay-Upstream` | URL of the upstream that handled the request |
