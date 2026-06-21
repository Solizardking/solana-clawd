# ClawdRouter Configuration

Production is hosted at `https://clawdrouter.fly.dev` and uses `https://x402.wtf` as the control plane.

## Hosted Fly Variables

| Variable | Default | Description |
| --- | --- | --- |
| `CLAWDROUTER_PORT` | `8402` | Internal proxy port |
| `CLAWDROUTER_AUTH_MODE` | `platform` in `fly.toml` | Requires x402 platform API-key validation |
| `CLAWDROUTER_VALIDATION_URL` | `https://x402.wtf` | Control plane used for `clawd_sk_...` validation |
| `CLAWDROUTER_INTERNAL_SECRET` | none | Shared secret sent to `x402.wtf/api/auth/validate-key` |
| `CLAWDROUTER_X402_API_URL` | `https://x402.wtf` | Base URL for public API relay checks |
| `CLAWDROUTER_PUBLIC_URL` | `https://clawdrouter.fly.dev` | Public router URL |
| `CLAWDROUTER_PROFILE` | `auto` | Routing profile: `eco`, `auto`, `premium` |
| `CLAWDROUTER_SOLANA_RPC_URL` | `HELIUS_RPC_URL` or Solana public RPC | Solana RPC endpoint |
| `CLAWDROUTER_NETWORK` | `solana-mainnet` | `solana-mainnet` or `solana-devnet` |
| `OPENROUTER_API_KEY` | none | OpenRouter upstream API key |
| `CLAWDROUTER_OLLAMA_ENABLED` | `true` | Enable direct Ollama-compatible model routing |
| `CLAWDROUTER_OLLAMA_HOST` | `https://clawd-inference-mesh.fly.dev` on Fly, `http://127.0.0.1:11434` locally | Ollama-compatible API URL for local model IDs |
| `CLAWDROUTER_OPENROUTER_SITE_TITLE` | `ClawdRouter` | OpenRouter attribution title |
| `CLAWDROUTER_OPENROUTER_SITE_URL` | `https://x402.wtf/router` | OpenRouter attribution URL |
| `CLAWDROUTER_OPENROUTER_CATEGORIES` | `cli-agent,cloud-agent` | OpenRouter app categories |
| `HELIUS_API_KEY` | none | Helius API key for holder checks |
| `HELIUS_RPC_URL` | none | Dedicated Solana RPC URL |
| `CLAWDROUTER_CLAWD_TOKEN_MINT` | CLAWD mint | Token used for holder tier checks |
| `CLAWDROUTER_PERPS_API_URL` | `https://api.imperial.space/api/v1` | Perps relay source |
| `CLAWDROUTER_PERPS_SOURCES` | none | Optional comma-separated app status sources |
| `CLAWDROUTER_RELAY_TIMEOUT_MS` | `5000` | Timeout for relay probes |

## Required Secrets

Set these on Fly:

```bash
fly secrets set --app clawdrouter \
  OPENROUTER_API_KEY=... \
  HELIUS_API_KEY=... \
  HELIUS_RPC_URL=... \
  CLAWDROUTER_INTERNAL_SECRET=...
```

Set the same internal secret on the x402.wtf app deployment:

```bash
vercel env add CLAWDROUTER_INTERNAL_SECRET production --sensitive --force --value "..."
```

Then redeploy x402.wtf so `/api/auth/validate-key` can authorize router validation requests.

## Local Modes

Local wallet/x402 mode:

```bash
CLAWDROUTER_AUTH_MODE=local npm run dev
```

Local Ollama-backed mode:

```bash
ollama serve
CLAWDROUTER_AUTH_MODE=local \
CLAWDROUTER_OLLAMA_HOST=http://127.0.0.1:11434 \
npm run dev
```

The static router registry includes these local Ollama IDs:

- `8bit/solana-trading-factory:8b-lora-20260620`
- `8bit/solana-trading-factory:latest`
- `8bit/solana-trading-factory:preview`
- `8bit/solana-clawd-core-ai:1.5b-merged-20260620`
- `8bit/solana-clawd-core-ai:latest`
- `8bit/solana-clawd-core-ai:preview`
- `8bit/solana-clawd:preview`
- `8bit/DeepSolana:latest`
- `hermes3:8b`
- `qwen2.5:1.5b`
- `nemotron3:33b`

Hosted-compatible mode:

```bash
CLAWDROUTER_AUTH_MODE=platform \
CLAWDROUTER_VALIDATION_URL=https://x402.wtf \
CLAWDROUTER_INTERNAL_SECRET=... \
OPENROUTER_API_KEY=... \
npm run dev
```

## File Locations

| File | Path | Description |
| --- | --- | --- |
| Wallet | `~/.clawd/clawdrouter/wallet.json` locally, `/data/wallet.json` on Fly | Solana keypair |
| Exclusions | `~/.clawd/clawdrouter/exclude-models.json` | Blocked models list |
