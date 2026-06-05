---
name: clawd-agents-cli-eval
description: >
  Validate Solana agent JSON definitions and run smoke tests.
  Use when the user wants to "validate my agent", "check my clawd.json",
  "run the eval", "test my agent definition", or "make sure CAAP is wired correctly".
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

# Clawd Agents — Evaluation Guide

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

---

## Validate an Agent JSON

```bash
# Basic validation
clawd-agents eval clawd.json

# Strict mode — requires CAAP/1.0 agentAuth block
clawd-agents eval clawd.json --strict

# JSON output (for CI/scripting)
clawd-agents eval clawd.json --json
```

### What it checks

| Check | Required | Notes |
|-------|---------|-------|
| `identifier` | ✓ | Unique slug, used as filename |
| `meta.title` | ✓ | Display name |
| `meta.description` | warning | Shown in catalog |
| `config.systemRole` | warning | Agent persona / system prompt |
| `schemaVersion` | warning | Expected: 1 |
| `agentAuth.protocol` | `--strict` | Must be "CAAP/1.0" |
| `agentAuth.discovery` | `--strict` | Must be a valid URL |
| `agentAuth.capabilities` | `--strict` | Array of capability objects |

---

## Required Agent JSON Structure

```json
{
  "identifier": "my-agent-id",
  "schemaVersion": 1,
  "meta": {
    "title": "My Agent",
    "description": "What this agent does",
    "tags": ["solana", "defi"],
    "avatar": "🤖",
    "category": "defi"
  },
  "config": {
    "systemRole": "You are... [full system prompt]"
  }
}
```

---

## CAAP/1.0 `agentAuth` Block (required for --strict)

```json
{
  "agentAuth": {
    "protocol": "CAAP/1.0",
    "discovery": "https://x402.wtf/.well-known/agent-auth.json",
    "registrationEndpoint": "https://x402.wtf/api/auth/agent/register",
    "modes": ["delegated", "autonomous"],
    "keyAlgorithms": ["Ed25519"],
    "capabilities": [
      {
        "name": "attest_agent",
        "required": true,
        "description": "Attest agent identity against Solana wallet and on-chain NFT",
        "location": "https://x402.wtf/api/agents/attest"
      },
      {
        "name": "get_peer_card",
        "required": false,
        "description": "Retrieve verified peer card with wallet balances and tier",
        "location": "https://x402.wtf/api/agents/peer-card"
      },
      {
        "name": "list_agents",
        "required": false,
        "description": "Browse the Clawd agent catalog",
        "location": "https://x402.wtf/api/agents/catalog"
      },
      {
        "name": "agent_chat",
        "required": false,
        "description": "Send messages to specialized agents",
        "location": "https://x402.wtf/api/agents/chat",
        "input": {
          "type": "object",
          "properties": { "agentId": { "type": "string" }, "message": { "type": "string" } },
          "required": ["agentId", "message"]
        }
      }
    ]
  }
}
```

---

## Smoke Test Checklist (manual)

After deployment, verify:

- [ ] `GET /.well-known/agent-auth.json` returns `{"protocol":"CAAP/1.0",...}`
- [ ] `GET /api/agents/catalog` includes `agentAuth.discovery` in response
- [ ] `POST /api/agents/attest` with SIWS signature returns `{"verified":true,...}`
- [ ] `POST /api/agents/peer-card` with CAAP JWT returns attestation + tier
- [ ] `POST /api/agents/peer-card` without JWT returns 401 with `WWW-Authenticate` header
- [ ] Agent appears in catalog: `https://x402.wtf/api/agents/catalog`

---

## CI/CD Integration

```yaml
# .github/workflows/validate.yml
- name: Validate agents
  run: |
    npx @solanaclawd/clawd-agents-cli eval agents/src/*.json --json
    node agents/scripts/validate-catalog.cjs
```

---

## Related Skills

- `/clawd-agents-cli-workflow` — Full development lifecycle
- `/clawd-agents-cli-agent-code` — Writing the agentAuth block correctly
- `/clawd-agents-cli-publish` — Publishing after validation passes
