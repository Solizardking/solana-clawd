# Solana Clawd Pay

Cloudflare Worker payment gateway for Solana Clawd Pay — **x402, Solana MPP, ClawdRouter, and agentic commerce on Solana**.

**Wired up as a real paid x402 store on [x402.wtf](https://x402.wtf).** The merchant is registered at
<https://x402.wtf/agents/registry> and accepts real x402 challenges from
<https://x402.wtf/payments>. The worker proxies 8 dedicated
`/api/x402wtf/*` routes, serves a v2.1 merchant manifest, and exposes a
storefront frontend with a "Live Checkout" lab.

```text
client / CLI / browser / agent
  -> solana-clawd-pay Worker  (Cloudflare)
       -> /api/x402wtf/* proxy  -> https://x402.wtf/payments + .../agents/registry
       -> storefront frontend  (public/index.html + public/app.js)
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
- Metaplex agentic commerce adds agent identity, execution delegation, and agent token fundraising.
- **x402.wtf** runs a public x402 merchant registry at
  `https://x402.wtf/agents/registry` and a real payment surface at
  `https://x402.wtf/payments`. OpenClawd Pay is registered there as
  the **`openclawd-pay`** merchant namespace and proxies per-product
  challenges to the public registry.

This Worker gives those pieces one consistent HTTP contract.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /` / `GET /health` | Health, capabilities, x402 store status. |
| `GET /v1/payments/quote` | Price, accepted networks, x402 backend, MPP proxy metadata. |
| `POST /v1/payments/challenge` | MPP-style payment challenge object for clients. |
| `POST /v1/payments/receipt` | Verify a payment receipt through MPP proxy or local HMAC. |
| `GET /v1/commerce/agent` | Agentic commerce metadata and Metaplex lifecycle hints. |
| `POST /v1/chat/completions` | Forward paid/verified model requests to ClawdRouter/x402/OpenRouter. |
| `POST /v1/sign/transaction` | MCP `sign_transaction` for Solana pay accounts. |
| `POST /v1/attest/payment` | Anchor a payment receipt on Solana via SAS. |
| `POST /v1/agent-identity/google` | Bridge Google SPIFFE identity to Solana on-chain attestation. |
| `POST /mcp` | Google ADK-compatible MCP server (tools/resources). |
| `GET /api/x402wtf/info` | **x402.wtf** → `GET /payments/info` (proxied). |
| `GET /api/x402wtf/registry` | **x402.wtf** → `GET /agents/registry` (proxied). |
| `GET /api/x402wtf/agents` | **x402.wtf** → `GET /agents/registry/agents` (proxied). |
| `POST /api/x402wtf/agent/chat` | **x402.wtf** → `POST /payments/agent/chat` (proxied). |
| `POST /api/x402wtf/checkout` | **x402.wtf** → `POST /payments/checkout` (+ payment-settlement). |
| `POST /api/x402wtf/verify` | **x402.wtf** → `POST /payments/verify` (proxied). |
| `POST /api/x402wtf/register` | **x402.wtf** → `POST /agents/registry/register` (proxied). |
| `GET /api/x402wtf/manifest` | Inline v2.1 merchant manifest (no upstream call). |
| `GET /public/index.html` | Storefront frontend ("x402.wtf Real Store" + "Live Checkout" lab). |

## Setup

```bash
cd pay
cp .env.example .env   # then edit OPERATOR_WALLET_PUBKEY + FEE_PAYER_WALLET_PUBKEY
npm install
npm run list            # writes manifest.json and dist/manifest.json
npm run launch          # starts wrangler dev on http://127.0.0.1:8787
```

Production deploy:

```bash
npx wrangler secret put PAY_PRIVATE_KEY
npx wrangler secret put X402_STORE_API_KEY
npx wrangler deploy
```

## Operator and Fee-Payer Wallet Setup

The worker is a **paid merchant** on x402.wtf, so two Solana wallets are required.

### Operator wallet

The operator wallet is the merchant controller. x402.wtf uses its
public key to verify who can rotate or de-register products in
`https://x402.wtf/agents/registry`.

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/operator.json
solana-keygen pubkey  ~/.config/solana/operator.json
# -> 9x...   (paste into OPERATOR_WALLET_PUBKEY in .env / wrangler.toml)
```

### Fee-payer wallet

The fee-payer wallet pays Solana transaction fees when the worker
settles an x402 receipt on-chain. **Use a fresh wallet that holds
SOL for fees, distinct from the operator wallet.** A test/devnet
fee-payer is fine for staging; mainnet requires a production SOL
balance.

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/fee-payer.json
solana-keygen pubkey  ~/.config/solana/fee-payer.json
# -> 8y...   (paste into FEE_PAYER_WALLET_PUBKEY)
# Then fund it:
solana airdrop 1 <fee-payer-pubkey> --url devnet    # devnet
solana transfer <amount> <fee-payer-pubkey>          # mainnet
```

Load the fee-payer private key as a Cloudflare secret (NEVER commit):

```bash
npx wrangler secret put PAY_PRIVATE_KEY   # paste the bs58 secret key
```

The public key in `FEE_PAYER_WALLET_PUBKEY` must match the secret
loaded into `PAY_PRIVATE_KEY`. The worker will refuse to sign with
mismatched keys.

### Optional secrets

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put CLAWDROUTER_API_KEY
npx wrangler secret put MPP_PROXY_TOKEN
npx wrangler secret put RECEIPT_HMAC_SECRET
npx wrangler secret put X402_STORE_API_KEY    # bearer for https://x402.wtf/agents/registry
```

## Cloudflare Routing

For development, use `workers_dev = true` (the default).

For production, add a custom domain:

```toml
# wrangler.toml
routes = [
  { pattern = "x402.wtf", custom_domain = true }
]
```

Then point app and CLI env vars at:

```bash
SOLANA_CLAWD_PAY_URL=https://x402.wtf
```

## x402 + MPP Flow

Solana Clawd Pay supports both x402-style and MPP-style clients:

1. Client calls `GET /v1/payments/quote`.
2. Client receives accepted rails:
   - x402 EVM rails through `X402_OPENROUTER_URL`
   - Solana MPP proxy through `MPP_PROXY_URL`
   - **x402.wtf real-store rails through `X402_STORE_BASE` (new)**
   - optional direct OpenRouter fallback
3. Client pays through the chosen rail.
4. Client retries `POST /v1/chat/completions` (or the relevant
   `/api/x402wtf/checkout` challenge path) with one of:
   - `X-Payment`
   - `Authorization: Payment ...`
   - `Payment-Receipt`
   - `X-Clawd-Pay-Receipt`
5. Worker verifies receipt or forwards to a payment-aware upstream.

## x402.wtf Real-Store Integration

OpenClawd Pay is registered as the **`openclawd-pay`** merchant
namespace on [x402.wtf](https://x402.wtf). The integration covers
every layer:

- **Merchant identity** — `pay/src/x402-store.ts` declares the
  operator + fee-payer wallet, network, RPC, and 6 per-product
  challenge paths.
- **Manifest v2.1** — emitted at `GET /api/x402wtf/manifest` and on
  disk by `npm run list` (`./manifest.json`, `./dist/manifest.json`).
  The top-level `x402` block is the canonical entrypoint the
  x402.wtf registry reads.
- **8 proxy routes** — `pay/src/x402wtf-proxy.ts` forwards each
  `/api/x402wtf/*` path to the matching `https://x402.wtf/*` endpoint.
  When x402.wtf is unreachable, every route returns a structured
  502 with `fallback: "manifest_only"` so the storefront still renders.
- **Apigee private edge** — `pay/apigee/` contains:
  - `AM-SetX402Headers.xml` — AssignMessage policy that stamps every
    response with the canonical x402 store headers (manifest version,
    namespace, registry URL, operator, fee-payer, network).
  - `RF-X402Challenge.xml` — RaiseFault policy that returns a
    uniform structured 402 challenge with retry headers.
  - `target-endpoints.xml` — 7 TargetEndpoints (one per upstream
    route) sharing the `AM-SetX402Headers` response flow and a
    `DefaultFaultRule` that raises the `RF-X402Challenge` envelope.
  - `proxy-endpoints.xml` — ProxyEndpoint with 7 conditional flows
    that dispatch by `proxy.pathsuffix`, plus a `DefaultFaultRule`
    for uncaught conditions.
- **Storefront frontend** — `pay/public/index.html` + `app.js` +
  `styles.css`. The page has a **"x402.wtf Real Store" status panel**
  (live manifest version, registry URL, operator/fee-payer wallet,
  network) and a **"Live Checkout" lab** that lets a buyer:
  1. Create a challenge for any of the 6 products.
  2. Paste the payment-signature from x402.wtf.
  3. Receive a verified receipt (or a clean 402 envelope).
- **Verified end-to-end** — `npm install` (0 vulns), `npm run list`,
  `npm run launch`, `npx tsc --noEmit`, `node -c public/app.js`, and
  a live read of the regenerated manifest all succeed.

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

Successful responses (worker **and** Apigee edge) include:

| Header | Value |
| --- | --- |
| `X-Solana-Clawd-Pay` | `1` |
| `X-Solana-Clawd-X402-Store` | `1` (storefront + Apigee) |
| `X-Clawd-Pay-Upstream` | URL of the upstream that handled the request |
| `X-X402-Manifest-Version` | `2.1` |
| `X-X402-Store-Namespace` | `openclawd-pay` |
| `X-X402-Store-Registry` | `https://x402.wtf/agents/registry` |
| `X-X402-Store-Payments` | `https://x402.wtf/payments` |
| `X-X402-Store-Operator` | base58 operator pubkey |
| `X-X402-Store-FeePayer` | base58 fee-payer pubkey |
| `X-X402-Store-Network` | `solana-mainnet` (or devnet) |
| `WWW-Authenticate` | `Payment x402` (on 402) |

## Directory Layout

```
pay/
├── apigee/                      # Apigee private-edge mirror (prod)
│   ├── AM-SetX402Headers.xml
│   ├── RF-X402Challenge.xml
│   ├── proxy-endpoints.xml
│   └── target-endpoints.xml
├── public/                      # Storefront frontend
│   ├── index.html               # "x402.wtf Real Store" panel + "Live Checkout" lab
│   ├── app.js
│   └── styles.css
├── scripts/
│   ├── list-products.mjs        # `npm run list`  — emit v2.1 manifest on disk
│   └── launch.mjs               # `npm run launch` — boot wrangler dev loop
├── src/
│   ├── index.ts                 # Worker entrypoint + 8 /api/x402wtf/* routes
│   ├── x402-store.ts            # Merchant identity + manifest v2.1 builder
│   ├── x402wtf-proxy.ts         # 8 /api/x402wtf/* route handlers
│   ├── attest.ts                # x402 payment attestation
│   ├── clawd-discovery.ts       # Clawd agent discovery layer
│   ├── google-agent-identity.ts # Google SPIFFE identity bridge
│   ├── mcp-server-handler.ts    # MCP JSON-RPC 2.0 server
│   ├── mcp-sign-handler.ts      # MCP sign_transaction tool
│   ├── sign.ts                  # Core Solana transaction signing
│   └── sign.test.ts
├── .env.example
├── README.md
├── package.json
├── tsconfig.json
└── wrangler.toml
```
