---
name: clawd-agents-cli-workflow
description: >
  Core development workflow for Solana agents on the Clawd platform.
  Use when starting a new agent project, iterating on agent logic, running
  the build-evaluate-deploy lifecycle, or understanding the repo structure.
  Load FIRST in any Clawd agent development conversation — it contains the
  mandatory Phase 0 requirements clarification and safety rules.
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

# Clawd Agents — Development Workflow

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

---

## Phase 0: Requirements Clarification (MANDATORY)

**Before creating any agent project, clarify with the user:**

1. What does the agent do? (perps trading, DeFi signals, NFT analytics, custom?)
2. Does it need live execution or observe/paper-only?
3. Which Clawd capability endpoints does it call? (`attest_agent`, `get_peer_card`, `list_agents`, `agent_chat`)
4. Does it need CAAP/1.0 authentication (default: yes)?
5. Does it need x402 payment gating?
6. Does it need a Telegram bot surface?
7. Deployment target: Vercel, Vertex AI Reasoning Engine, Fly.io, or Railway?

**Do NOT run `scaffold create` until you know the answers to 1 and 2.**

---

## The Build-Evaluate-Deploy Lifecycle

```
scaffold create → edit clawd.json → eval → publish → deploy
       ↑                                                 |
       └─────────────── iterate ──────────────────────┘
```

### Step 1: Create
```bash
clawd-agents scaffold create my-agent --agent perps
```

### Step 2: Customize the character
Edit `clawd.json` — this is the agent's identity (Eliza character format):
- `name` — display name
- `bio[]` — who this agent is
- `system` — the system prompt / operational contract
- `messageExamples[]` — training conversations
- `style` — tone and formatting rules

### Step 3: Validate
```bash
clawd-agents eval clawd.json
clawd-agents eval clawd.json --strict  # requires CAAP/1.0 agentAuth block
```

### Step 4: Publish to catalog
```bash
clawd-agents publish clawd.json
```
This copies the JSON to `agents/src/<identifier>.json` and rebuilds the catalog.

### Step 5: Deploy
```bash
clawd-agents deploy --target vercel --prod
clawd-agents deploy --target vertex-ai
```

---

## Agent Architecture

Every Clawd agent has three layers:

| Layer | Files | Purpose |
|-------|-------|---------|
| Identity | `clawd.json` | Character, bio, system prompt |
| Logic | `src/cli.ts`, `src/*.ts` | Runtime, tools, market data |
| Registry | Published to catalog | Discovery, CAAP/1.0, on-chain NFT |

### Core pattern (observe → decide → gate → execute)
1. **Observe**: fetch market data, signals, wallet state
2. **Decide**: score signals, compute risk, determine action
3. **Gate**: run preflight — check all runtime flags
4. **Execute**: paper preview first, live only when armed

---

## Safety Rules (Non-Negotiable)

- **Never execute live trades** unless `LIVE_TRADING=true`, `OPERATOR_CONFIRMED=true`, and all domain-specific flags are set
- **Always run preflight** before any order shape — even in paper mode
- **Never commit private keys** — use `.env.local` (gitignored) and environment variables
- **clawd.json has no secrets** — it's the character file, always public
- **Paper mode is the default** — users must explicitly arm live execution

---

## Registered Endpoints (Google Agent Registry)

All 9 Clawd endpoints are registered in Google Agent Registry (`global`):

| Endpoint | URL |
|----------|-----|
| Agent Orchestrator | `https://x402.wtf/api/orchestrator` |
| Agents Catalog | `https://x402.wtf/api/agents` |
| Clawd Chat | `https://x402.wtf/api/clawd` |
| Imperial Router | `https://x402.wtf/api/imperial` |
| Perps Trading v1 | `https://x402.wtf/api/perps/v1` |
| Phoenix Markets | `https://x402.wtf/api/phoenix/markets` |
| Router v1 (OpenAI-compat) | `https://x402.wtf/api/router/v1/chat/completions` |
| x402 Agent Chat | `https://x402.wtf/api/x402/agent/chat` |
| x402wtf Registry | `https://x402.wtf/agents/registry` |

```bash
clawd-agents registry list           # show all
clawd-agents registry connect perps  # connection example
```

---

## Key Environment Variables

```bash
# Solana
SOLANA_RPC_URL=                      # Helius: https://mainnet.helius-rpc.com/?api-key=...
HELIUS_API_KEY=                      # helius.dev — required for DAS attestation

# CAAP/1.0 auth
BETTER_AUTH_URL=https://x402.wtf/api/auth
BETTER_AUTH_SECRET=                  # openssl rand -base64 32
DATABASE_URL=postgresql://...        # Convex or Postgres

# CLAWD token
CLAWD_TOKEN_ADDRESS=8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump

# Safety gates (all must be set for live execution)
LIVE_TRADING=false
OPERATOR_CONFIRMED=false
PERPS_SIM_ONLY=true

# Vertex AI Reasoning Engine
GOOGLE_CLOUD_PROJECT=x402-477302
VERTEX_REASONING_ENGINE_ID=9023111387018166272
VERTEX_LOCATION=us-west1
```

---

## Repo Map

```
solana-clawd/agents/
├── cli/                    # clawd-agents CLI (this tool)
├── src/                    # 125+ agent JSON definitions
├── skills/                 # Agent skills files (this directory)
│   ├── clawd-agents-cli-*/     # Clawd CLI skills
│   └── pump-*/                 # Pump.fun skills
├── auth/                   # CAAP/1.0 client module
│   ├── capabilities.ts         # Typed capability constants
│   ├── client.ts               # createClawdAgentClient() factory
│   └── index.ts                # Barrel export
├── clawd-perps-agent/      # Starter template (perps)
│   ├── clawd.json              # Character definition
│   ├── src/cli.ts              # CLI entry point
│   └── src/*.ts                # Agent logic modules
├── build-catalog.cjs       # Catalog build + well-known generator
├── agent-template-attested.json  # Template with CAAP/1.0
└── agent-template-full.json      # Full template with all fields
```

---

## Related Skills

- `/clawd-agents-cli-scaffold` — Create and enhance agent projects
- `/clawd-agents-cli-agent-code` — TypeScript patterns for writing agent logic
- `/clawd-agents-cli-deploy` — Deployment to Vercel and Vertex AI
- `/clawd-agents-cli-eval` — Validation and testing
- `/clawd-agents-cli-publish` — Publishing to the Clawd catalog
- `/clawd-agents-cli-observability` — PostHog, Telegram monitoring
