---
name: clawd-agents-cli-scaffold
description: >
  Create, enhance, and upgrade Solana agent projects using the Clawd Agents CLI.
  Use when the user wants to "create a new Solana agent", "scaffold a perps agent",
  "add auth to my agent", "add Telegram to my agent", or "upgrade my agent project".
  Uses clawd-perps-agent as the starter template.
  Do NOT use for writing agent logic (use clawd-agents-cli-agent-code) or
  deploying (use clawd-agents-cli-deploy).
  Part of the Clawd Agents CLI skills suite.
metadata:
  author: Clawd Labs
  license: MIT
  version: 0.1.0
  requires:
    bins:
      - clawd-agents
    install: "npx @solanaclawd/clawd-agents-cli setup"
---

# Clawd Agents — Scaffolding Guide

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

---

## Prerequisite: Clarify Requirements (MANDATORY)

**Before scaffolding, load `/clawd-agents-cli-workflow` and complete Phase 0** — clarify what the agent does, what tools it needs, and whether it needs live execution before running `scaffold create`.

---

## Step 1: Choose Template

| User wants | CLI flag |
|-----------|----------|
| Perps trading agent (recommended) | `--agent perps` |
| Base agent (minimal scaffold) | `--agent base` |
| Add CAAP/1.0 authentication | `--auth` |
| Add x402 payment gating | `--payments` |
| Add Telegram bot surface | `--telegram` |
| Add Agent Registry integration | `--registry` |

**The `perps` template (default) ships with:**
- Full `clawd.json` character (Eliza format) with `agentAuth` CAAP/1.0 block
- `src/cli.ts` — observe/paper/live execution CLI
- `src/marketMaker.ts` — Phoenix perps runtime
- `src/imperialAgent.ts` — Imperial Trading API client
- `src/telegram.ts` — Telegram bot command surface
- `src/config.ts` — env parsing + preflight safety gates
- `src/frontend.ts` — status/dashboard payload builder

---

## Step 2: Create a New Project

```bash
clawd-agents scaffold create <project-name> [--agent <template>] [--auth] [--payments]
```

**Constraints:**
- Project name: ≤40 chars, lowercase, letters/numbers/hyphens only
- Do NOT `mkdir` first — the CLI creates the directory
- Default template is `perps` (based on `clawd-perps-agent`)

### Example

```bash
# Perps trading agent (default)
clawd-agents scaffold create sol-perps-bot

# With explicit template and auth
clawd-agents scaffold create my-defi-agent --agent perps --auth

# Base agent for custom logic
clawd-agents scaffold create oracle-agent --agent base
```

After creation:
```bash
cd sol-perps-bot
npm install
npm run build
clawd-agents eval clawd.json
```

---

## Step 3: Enhance an Existing Project

Add features to an already-created project:

```bash
# Add CAAP/1.0 agent auth
clawd-agents scaffold enhance . --auth

# Add Telegram bot surface
clawd-agents scaffold enhance . --telegram

# Add x402 payment middleware
clawd-agents scaffold enhance . --payments

# Register with Google Agent Registry
clawd-agents scaffold enhance . --registry
```

---

## Step 4: Upgrade a Project

Upgrade templates and dependencies to latest:

```bash
clawd-agents scaffold upgrade              # current directory
clawd-agents scaffold upgrade ./my-agent   # specific path
clawd-agents scaffold upgrade --dry-run    # preview changes
clawd-agents scaffold upgrade --auto-approve
```

---

## The `clawd.json` Character File

This is the agent's identity (Eliza character format). Key fields to customize:

```json
{
  "name": "My Agent",
  "bio": ["One-line bio sentences..."],
  "lore": ["Background lore bullets..."],
  "system": "You are... [full system prompt and operational contract]",
  "messageExamples": [[...], [...]],
  "style": {
    "all": ["Lead with data, not opinion."],
    "chat": ["Ask one sharp clarifying question if ambiguous."],
    "post": ["Open with the verdict and confidence score."]
  },
  "agentAuth": {
    "protocol": "CAAP/1.0",
    "discovery": "https://x402.wtf/.well-known/agent-auth.json",
    "registrationEndpoint": "https://x402.wtf/api/auth/agent/register",
    "modes": ["delegated", "autonomous"],
    "keyAlgorithms": ["Ed25519"],
    "capabilities": [
      { "name": "attest_agent", "required": true, "location": "https://x402.wtf/api/agents/attest" },
      { "name": "get_peer_card", "required": false, "location": "https://x402.wtf/api/agents/peer-card" }
    ]
  }
}
```

**Files to customize:** `clawd.json`, `src/config.ts` (env vars), `src/marketMaker.ts` (strategy logic)
**Files to preserve:** `src/cli.ts` (entry point pattern), `package.json` (bin field)

---

## Scaffold as Reference

When you need specific files without scaffolding the current project:

```bash
# Create a temp reference project
clawd-agents scaffold create /tmp/ref-perps --agent perps
# Inspect and copy what you need
cp /tmp/ref-perps/src/imperialAgent.ts ./src/
rm -rf /tmp/ref-perps
```

---

## Critical Rules

- **NEVER skip Phase 0** requirements clarification before `scaffold create`
- **NEVER `mkdir` before `create`** — the CLI creates the directory
- **NEVER commit `.env.local`** — it's gitignored and contains secrets
- **NEVER change the live execution gates** (`LIVE_TRADING`, `OPERATOR_CONFIRMED`) without understanding preflight
- **Start paper/observe** — add live execution only when the agent logic is validated

---

## Related Skills

- `/clawd-agents-cli-workflow` — Development workflow and repo structure
- `/clawd-agents-cli-agent-code` — TypeScript patterns for agent logic
- `/clawd-agents-cli-deploy` — Deployment to Vercel and Vertex AI
- `/clawd-agents-cli-eval` — Validating agent JSON definitions
