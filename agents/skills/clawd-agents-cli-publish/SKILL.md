---
name: clawd-agents-cli-publish
description: >
  Publish Solana agent JSON definitions to the Clawd agent catalog.
  Use when the user wants to "publish my agent", "add my agent to the catalog",
  "make my agent discoverable", "rebuild the catalog", or "register my agent at x402.wtf".
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

# Clawd Agents — Publishing Guide

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

---

## Publish an Agent

```bash
# Validate first, then publish
clawd-agents eval clawd.json --strict
clawd-agents publish clawd.json

# Dry-run preview
clawd-agents publish clawd.json --dry-run

# Skip catalog rebuild (faster iteration)
clawd-agents publish clawd.json --skip-build
```

### What happens on publish

1. Reads `identifier` from the JSON
2. Copies `clawd.json` → `agents/src/<identifier>.json`
3. Runs `node build-catalog.cjs` — rebuilds the full catalog:
   - `public/api/agents/agents-catalog.json` — 125+ agents
   - `public/.well-known/agent-auth.json` — CAAP/1.0 discovery
   - Static API files for all registered agents
4. Agent becomes available at `https://x402.wtf/api/agents/catalog`

---

## Agent Catalog Structure

Agents live in `agents/src/` as individual JSON files. The build script scans all `*.json` files in that directory and assembles the catalog.

### Catalog stats after publish
```bash
node agents/build-catalog.cjs
# Built 126 agents, 93 personas, 47 featured
# Generated: public/.well-known/agent-auth.json
```

---

## On-Chain Registration (Metaplex MPL Core)

After publishing to the catalog, optionally mint an on-chain NFT identity:

```bash
# Mint a Metaplex Core NFT for your agent
curl -X POST https://x402.wtf/api/agents/mint \
  -H "Content-Type: application/json" \
  -d '{ "action": "sponsored-mint", "ownerPubkey": "<your-wallet>", "identifier": "<agent-id>" }'
```

The on-chain registry program ID: `Ag8004rWo8ao8AUKhLk78iv2nLQpZMyBPXiAh5QLbFiE`

---

## Discovery After Publish

Your agent will appear in:

| Endpoint | URL |
|----------|-----|
| Catalog API | `https://x402.wtf/api/agents/catalog` |
| Direct agent | `https://x402.wtf/api/agents/<identifier>` |
| CAAP discovery | `https://x402.wtf/.well-known/agent-auth.json` |
| On-chain registry | `https://x402.wtf/agents/registry` |

---

## Featured Agents

Set `"featured": true` in the JSON to appear in the featured section:

```json
{
  "identifier": "my-agent",
  "featured": true,
  "meta": {
    "title": "My Agent",
    "category": "defi"
  }
}
```

Categories: `defi`, `trading`, `nft`, `security`, `analytics`, `utility`, `social`

---

## Related Skills

- `/clawd-agents-cli-eval` — Validate before publishing
- `/clawd-agents-cli-workflow` — Full development lifecycle
- `/clawd-agents-cli-deploy` — Deploy after publishing
