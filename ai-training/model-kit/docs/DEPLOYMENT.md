# Model Kit Site Deployment

This folder ships two deployable surfaces:

- `models.x402.wtf` - static Vercel frontend from `frontend/index.html`.
- `register.x402.wtf` - host-routed Vercel page from `frontend/register.html`.
- Render API - Dockerized FastAPI service from `backend/main.py`.

The frontend is static. It never stores registry tokens. Live registration is
proxied through the Render API only when the page sends an explicit live request.

## Render API

Use the blueprint in this folder:

```bash
cd /Users/8bit/Downloads/solana-clawd
render blueprint launch ai-training/model-kit/render.yaml
```

If using the Render dashboard, import the GitHub repo and point the blueprint to:

```text
ai-training/model-kit/render.yaml
```

The service root is:

```text
ai-training/model-kit/backend
```

Required public env:

| Name | Value |
| --- | --- |
| `ONCHAIN_REGISTRY_HOME` | `https://onchain.x402.wtf` |
| `ONCHAIN_REGISTRY_URL` | `https://onchain.x402.wtf/api/register` |
| `X402_HOME` | `https://x402.wtf` |
| `MODELS_HOME` | `https://models.x402.wtf` |
| `REGISTER_HOME` | `https://register.x402.wtf` |
| `MODEL_KIT_CORS_ORIGINS` | `https://models.x402.wtf,https://register.x402.wtf` |

Optional secret env:

| Name | Use |
| --- | --- |
| `ONCHAIN_REGISTRY_TOKEN` | Server-side bearer token for registry writes when users do not pass a request token. |

Smoke checks:

```bash
curl -sS https://x402-model-kit-docker-api.onrender.com/api/health
curl -sS https://x402-model-kit-docker-api.onrender.com/api/model-kit/status
curl -sS https://x402-model-kit-docker-api.onrender.com/.well-known/clawd-model-kit.json
```

## Vercel Frontend

Set the Vercel project root directory to:

```text
ai-training/model-kit
```

Build settings:

| Setting | Value |
| --- | --- |
| Framework | Other |
| Build command | `npm run build` |
| Output directory | `frontend` |

Before deploy, set `frontend/config.js` to the Render URL:

```js
window.MODEL_KIT_CONFIG = {
  apiBaseUrl: "https://x402-model-kit-docker-api.onrender.com",
  x402Home: "https://x402.wtf",
  modelsHome: "https://models.x402.wtf",
  registerHome: "https://register.x402.wtf",
  onchainHome: "https://onchain.x402.wtf",
  githubRepo: "https://github.com/solizardking/solana-clawd-ai-training",
};
```

Deploy:

```bash
cd /Users/8bit/Downloads/solana-clawd/ai-training/model-kit
npm run build
vercel deploy --prod
```

Attach both domains to the same Vercel project:

| Domain | Served page |
| --- | --- |
| `models.x402.wtf` | `/index.html` |
| `register.x402.wtf` | `/register.html` via host rewrite |

## Registration Flow

The register page calls:

| Route | Method | Use |
| --- | --- | --- |
| `/api/register/preview` | `POST` | Build a dry-run CAAP/1.0 payload. |
| `/api/register` | `POST` | Dry-run unless the request has `live: true`. |

Live requests require a real `model_hash` by default. Provisional generated
hashes are allowed only when `allow_generated_hash: true` is sent.
