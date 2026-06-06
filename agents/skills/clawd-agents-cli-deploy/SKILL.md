---
name: clawd-agents-cli-deploy
description: >
  Deploy Solana agents to Vercel, Vertex AI Reasoning Engine, Fly.io, or Railway.
  Use when the user wants to "deploy my agent", "push to production", "deploy to Vertex AI",
  "set up the reasoning engine", or "go live with my agent".
  Part of the Clawd Agents CLI skills suite.
metadata:
  author: Clawd
  license: MIT
  version: 0.1.0
  requires:
    bins:
      - clawd-agents
    install: "npx @solanaclawd/clawd-agents-cli setup"
---

# Clawd Agents — Deployment Guide

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

---

## Deployment Targets

| Target | Command | Best for |
|--------|---------|---------|
| Vercel | `--target vercel` | Next.js agents, API routes, ClawdBrowser |
| Vertex AI | `--target vertex-ai` | Long-running reasoning, Gemini integration |
| Fly.io | `--target fly` | Always-on bots, Telegram agents |
| Railway | `--target railway` | Full-stack agents with DB |

---

## Vercel Deployment

```bash
# Preview deployment
clawd-agents deploy --target vercel

# Production deployment
clawd-agents deploy --target vercel --prod
```

**Requirements:** Vercel CLI installed (`npm i -g vercel`), `vercel.json` or `next.config.ts` present.

**Environment variables to set in Vercel:**
```
BETTER_AUTH_URL=https://x402.wtf/api/auth
BETTER_AUTH_SECRET=<openssl rand -base64 32>
HELIUS_API_KEY=
CLAWD_TOKEN_ADDRESS=8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
NEXT_PUBLIC_CONVEX_URL=
DATABASE_URL=
SOLANA_RPC_URL=
```

---

## Vertex AI Reasoning Engine

The Clawd Reasoning Engine is already provisioned:

```
URN:      urn:agent:projects-1013652097839:projects:1013652097839:locations:us-west1:aiplatform:reasoningEngines:9023111387018166272
Project:  x402-477302
Location: us-west1
ID:       9023111387018166272
SA:       service-1013652097839@gcp-sa-aiplatform-re.iam.gserviceaccount.com
```

```bash
# Show connection details and deployment commands
clawd-agents deploy --target vertex-ai

# Dry-run (preview commands without executing)
clawd-agents deploy --target vertex-ai --dry-run
```

### Query the Reasoning Engine (Python)

```python
from vertexai.preview import reasoning_engines

re = reasoning_engines.ReasoningEngine(
    "projects/1013652097839/locations/us-west1/reasoningEngines/9023111387018166272"
)
response = re.query(input={"message": "What is the SOL funding rate?"})
print(response)
```

### Update the deployed agent (gcloud)

```bash
gcloud ai reasoning-engines update 9023111387018166272 \
  --project=x402-477302 \
  --region=us-west1 \
  --agent-framework=adk
```

---

## Fly.io Deployment

```bash
# Initialize (first time)
flyctl launch

# Deploy
clawd-agents deploy --target fly
```

**`fly.toml` configuration for a Clawd agent:**
```toml
[env]
  SOLANA_RPC_URL = ""
  LIVE_TRADING = "false"
  OPERATOR_CONFIRMED = "false"
  PERPS_SIM_ONLY = "true"

[[services]]
  internal_port = 3000
  protocol = "tcp"
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

---

## Railway Deployment

```bash
# Requires @railway/cli: npm i -g @railway/cli
clawd-agents deploy --target railway
```

---

## Pre-Deploy Checklist

- [ ] `clawd-agents eval clawd.json` passes with no errors
- [ ] `clawd-agents publish clawd.json` — agent is in catalog
- [ ] All environment variables set in target platform
- [ ] `LIVE_TRADING=false` confirmed (unless intentionally going live)
- [ ] Preflight gate tested in paper mode
- [ ] CAAP/1.0 discovery endpoint accessible: `/.well-known/agent-auth.json`

---

## Related Skills

- `/clawd-agents-cli-workflow` — Full development lifecycle
- `/clawd-agents-cli-scaffold` — Project scaffolding
- `/clawd-agents-cli-eval` — Validation before deployment
- `/clawd-agents-cli-observability` — Monitoring after deployment
