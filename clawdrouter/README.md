# ClawdRouter

OpenAI-compatible LLM router for x402.wtf agents.

ClawdRouter runs as its own Fly.io service at:

- Router service: `https://clawdrouter.fly.dev`
- x402 control plane: `https://x402.wtf`
- x402 router docs/app page: `https://x402.wtf/router`

Legacy static-agent domains are not part of the production router path. Use `x402.wtf` for app, API-key, and public API references.

## What It Does

- Routes `clawdrouter/auto` requests through the local 15-dimension scorer.
- Forwards model calls to OpenRouter with `x402.wtf/router` attribution.
- Requires `clawd_sk_...` platform API keys for hosted `/v1/chat/completions`.
- Validates those keys against `https://x402.wtf/api/auth/validate-key`.
- Keeps public service metadata open: health, models, local stats, CLAWD status, and relay snapshots.
- Exposes an x402 API relay status block that checks the production public APIs used by the app.

## Hosted Endpoints

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /health` | Public | Router health, auth mode, OpenRouter config status |
| `GET /v1/models` | Public | OpenAI-compatible model list with CLAWD tier metadata |
| `POST /v1/chat/completions` | `clawd_sk_...` | OpenAI-compatible chat completion endpoint |
| `GET /v1/stats` | Public | Router process-local usage counters |
| `GET /v1/clawd/status` | Public | Router wallet CLAWD status |
| `GET /v1/clawd/access` | Public wallet header | Check a wallet's model-tier access |
| `GET /v1/relay` | Public | Combined Solana, perps, and x402 public API snapshot |
| `GET /v1/relay/solana` | Public | Solana RPC relay status |
| `GET /v1/relay/perps` | Public | Imperial/Phoenix perps relay status |
| `GET /v1/relay/x402` | Public | x402.wtf public API relay status |

## Usage

Create an API key from `https://x402.wtf/profile/api`, then call the router:

```bash
curl https://clawdrouter.fly.dev/v1/chat/completions \
  -H "Authorization: Bearer clawd_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "clawdrouter/auto",
    "messages": [{ "role": "user", "content": "Explain Phoenix perps risk in 5 bullets." }]
  }'
```

OpenAI-compatible clients:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://clawdrouter.fly.dev/v1",
    api_key="clawd_sk_..."
)

response = client.chat.completions.create(
    model="clawdrouter/auto",
    messages=[{"role": "user", "content": "Write a Solana agent plan"}],
)
```

## Local Development

```bash
cd clawdrouter
npm install
npm run build
npm test
npm run dev
```

Local mode can still run without the x402.wtf control plane:

```bash
CLAWDROUTER_AUTH_MODE=local npm run dev
```

Hosted-compatible local mode:

```bash
CLAWDROUTER_AUTH_MODE=platform \
CLAWDROUTER_VALIDATION_URL=https://x402.wtf \
CLAWDROUTER_INTERNAL_SECRET=... \
OPENROUTER_API_KEY=... \
npm run dev
```

## Fly.io Deployment

The Fly app is `clawdrouter` in `ewr`.

```bash
cd clawdrouter
npm run build
fly deploy --config fly.toml --remote-only
```

Required Fly secrets:

```bash
fly secrets set --app clawdrouter \
  OPENROUTER_API_KEY=... \
  HELIUS_API_KEY=... \
  HELIUS_RPC_URL=... \
  CLAWDROUTER_INTERNAL_SECRET=...
```

The same `CLAWDROUTER_INTERNAL_SECRET` must exist on the x402.wtf app deployment because the router validates API keys through:

```text
POST https://x402.wtf/api/auth/validate-key
```

The validation endpoint accepts the router secret via `X-ClawdRouter-Internal-Secret` and never exposes user API-key hashes or server secrets.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CLAWDROUTER_PORT` | No | `8402` | Local service port; Fly maps this internally |
| `CLAWDROUTER_AUTH_MODE` | Hosted yes | `local` or `platform` when validation URL is set | `platform` requires `clawd_sk_...` keys |
| `CLAWDROUTER_VALIDATION_URL` | Hosted yes | none | x402 control-plane URL, normally `https://x402.wtf` |
| `CLAWDROUTER_INTERNAL_SECRET` | Hosted yes | none | Shared server-to-server validation secret |
| `CLAWDROUTER_X402_API_URL` | No | `https://x402.wtf` | Base URL used by relay checks |
| `CLAWDROUTER_PUBLIC_URL` | No | `https://clawdrouter.fly.dev` | Router's public service URL |
| `OPENROUTER_API_KEY` | Yes | none | Upstream OpenRouter key |
| `CLAWDROUTER_OPENROUTER_SITE_URL` | No | `https://x402.wtf/router` in Fly | OpenRouter attribution URL |
| `HELIUS_API_KEY` | Recommended | none | Faster CLAWD SPL holder checks |
| `HELIUS_RPC_URL` | Recommended | Solana public RPC | Dedicated Solana RPC endpoint |
| `CLAWDROUTER_CLAWD_TOKEN_MINT` | No | CLAWD mint | SPL mint used for holder checks |
| `CLAWDROUTER_PERPS_API_URL` | No | Imperial API | Perps relay source |
| `CLAWDROUTER_PERPS_SOURCES` | No | none | Optional comma-separated app/perps status sources |

## Security Model

- Browsers and agents use user-owned `clawd_sk_...` keys only.
- The Fly router never receives database credentials.
- The router validates API keys through x402.wtf using a scoped internal secret.
- x402.wtf checks key revocation, expiration, scopes, and recorded CLAWD holder/service access.
- OpenRouter and Helius secrets stay in Fly secrets, not client code.
- `CLAWDROUTER_INTERNAL_SECRET` is server-to-server only and must not be exposed in public env vars.

## Production Checks

```bash
curl https://clawdrouter.fly.dev/health | jq .
curl https://clawdrouter.fly.dev/v1/models | jq '.data[0:5]'
curl https://clawdrouter.fly.dev/v1/relay/x402 | jq .
```

Unauthenticated chat calls should fail:

```bash
curl -i https://clawdrouter.fly.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"clawdrouter/auto","messages":[{"role":"user","content":"hello"}]}'
```

Expected: `401 authentication_required`.

Authenticated calls should reach OpenRouter and include `x_clawdrouter` metadata.
