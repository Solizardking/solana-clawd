---
name: clawd-agents-cli-observability
description: >
  Monitor and observe Solana agents on the Clawd platform — PostHog analytics,
  Telegram bot health checks, execution audit trails, and agent registry health.
  Use when the user wants to "monitor my agent", "check agent health", "view execution logs",
  "set up observability", or "watch the agent registry".
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

# Clawd Agents — Observability Guide

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

---

## Registry Status

```bash
# Show Agent Registry endpoints + Reasoning Engine status
clawd-agents registry status

# List all 9 registered endpoints
clawd-agents registry list
```

---

## Runtime Health Check

Every Clawd perps agent exposes a `status` command:

```bash
# From project root
node dist/cli.js status

# Output (JSON):
{
  "mode": "paper",
  "armed": false,
  "liveGates": {
    "LIVE_TRADING": false,
    "OPERATOR_CONFIRMED": false,
    "PERPS_SIM_ONLY": true
  },
  "allowedSymbols": ["SOL", "ETH", "BTC"],
  "notionalCap": 250,
  "leverageCap": 3
}
```

---

## Telegram Bot Health

Monitor your agent via Telegram `/perps` command:

```bash
node dist/cli.js telegram "/perps"
# Returns: runtime mood, market status, armed gates
```

**Environment setup:**
```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHATS=<chat_id_1>,<chat_id_2>
```

---

## Execution Audit Trail

Every trade attempt generates an audit record:

```
imp-{timestamp}-{nonce}
```

Example: `imp-1748000000-x7k3m2`

Audit records are:
- Append-only per session
- Stored with mode tag (`paper` | `live`)
- Include preflight verdict (pass/fail + which gate blocked)
- Include order shape (symbol, side, notionalUsd, leverage)

---

## PostHog Analytics

The project is in PostHog project `Default project` (id: 232028), org `8bitlabs`.

**Key events to track:**
- `agent_registered` — new agent added to catalog
- `agent_attested` — CAAP attestation completed
- `preflight_blocked` — live execution blocked by safety gate
- `paper_trade_executed` — paper trade submitted
- `live_trade_executed` — live trade submitted (rare, requires all gates)
- `peer_card_fetched` — get_peer_card capability called

**PostHog HogQL example:**
```sql
SELECT
  event,
  count() as count,
  countIf(properties.mode = 'live') as live_executions
FROM events
WHERE event IN ('paper_trade_executed', 'live_trade_executed')
  AND timestamp >= now() - interval 7 day
GROUP BY event
ORDER BY count DESC
```

---

## Endpoint Health Checks

```bash
# Check all 9 registered endpoints are reachable
for url in \
  "https://x402.wtf/api/orchestrator" \
  "https://x402.wtf/api/agents" \
  "https://x402.wtf/api/clawd" \
  "https://x402.wtf/api/imperial" \
  "https://x402.wtf/api/perps/v1" \
  "https://x402.wtf/api/phoenix/markets" \
  "https://x402.wtf/.well-known/agent-auth.json" \
  "https://x402.wtf/agents/registry"
do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  echo "$status  $url"
done
```

---

## Vertex AI Reasoning Engine Monitoring

```bash
# Check reasoning engine status
gcloud ai reasoning-engines describe 9023111387018166272 \
  --project=x402-477302 \
  --region=us-west1

# View recent operations
gcloud ai operations list \
  --project=x402-477302 \
  --region=us-west1 \
  --filter="metadata.@type:ReasoningEngine"
```

---

## Key Alerts to Set

| Signal | Threshold | Action |
|--------|-----------|--------|
| `LIVE_TRADING=true` + `OPERATOR_CONFIRMED=false` | Any | Block + alert |
| Attestation failure rate | >10% in 5 min | Investigate Helius RPC |
| `peer_card_fetched` 401 rate | >20% | Check CAAP JWT expiry |
| Catalog rebuild time | >30s | Check build-catalog.cjs for large agent files |

---

## Related Skills

- `/clawd-agents-cli-workflow` — Full development lifecycle
- `/clawd-agents-cli-deploy` — Deployment configuration
- `/clawd-agents-cli-eval` — Validation and smoke tests
