<!-- ╔══════════════════════════════════════════════════════════════════════════╗ -->
<!-- ║   OpenClawd Knowledge Base  ·  internal agent memory + conventions     ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ╔═══════════════════════════════════════════════════════════════════╗
  ║   O P E N C L A W D   K N O W L E D G E   B A S E               ║
  ║   anti-patterns · decisions · facts · gotchas · patterns         ║
  ╠═══════════════════════════════════════════════════════════════════╣
  ║  Curated learnings extracted from the agent swarm                ║
  ║  x402.wtf  ·  internal use  ·  not for deployment         ║
  ╚═══════════════════════════════════════════════════════════════════╝
```

</div>

---

# BEADS Knowledge Base

This directory contains curated learnings from the agent swarm. Knowledge is extracted from:

- CodeRabbit PR reviews
- Human code reviews
- Agent discoveries during implementation
- Production incidents and debugging
- External documentation

## Directory Structure

```text
knowledge/
  README.md                    # This file (index + agent query guide)
  facts.jsonl                  # 13 entries — General domain facts (CLI, auth, registry, tokenomics)
  codebase-facts.jsonl        # 11 entries — How the code works under the hood
  api-behaviors.jsonl         # 11 entries — External API quirks, rate limits, concurrency
  patterns.jsonl              # 11 entries — Reusable patterns and best practices
  anti-patterns.jsonl         # 11 entries — Things to avoid (installer, bash, npm, security)
  gotchas.jsonl               # 10 entries — Common pitfalls and surprises
  decisions.jsonl             # 9 entries — Architectural decisions with context
  ── Markdown reference docs ──
  architecture-pieces.md      # How the 4 core framework pieces fit together
  clawd-character.md          # Clawd personality + lore + observable facts
  clawd-code-cli.md           # @openclawdsolana/clawd-code-cli v0.2.3 reference
  clawd-tui.md                # @openclawdsolana/clawd-tui v0.2.1 reference
  clawdrouter.md              # ClawdRouter LLM proxy architecture
  openclawd-hermes-memory.md  # Hermes memory model (OODA + tiers)
  openclawd.md                # Full OpenClawd v0.3.1 release notes
  SOVEREIGN_RESEARCH.md       # Sovereign research methodology
  wiki.md                     # AutoResearch Wiki architecture + agent queries
```

## Knowledge Fact Format

Each JSONL file contains one fact per line:

```json
{
  "id": "fact-abc123",
  "type": "api_behavior|code_quirk|pattern|gotcha|decision|dependency|performance|security",
  "fact": "Clear description of the knowledge",
  "recommendation": "What to do about it",
  "confidence": "high|medium|low",
  "provenance": [
    {
      "source": "coderabbit|human|agent|documentation|test|production",
      "reference": "PR #123",
      "date": "2026-01-09"
    }
  ],
  "tags": ["api", "rate-limiting"],
  "affectedFiles": ["src/lib/services/example.ts"],
  "affectedServices": ["ExampleService"],
  "createdAt": "2026-01-09T12:00:00Z",
  "updatedAt": "2026-01-09T12:00:00Z",
  "usageCount": 0,
  "helpfulCount": 0,
  "outdatedReports": 0
}
```

## Knowledge Types

| Type           | Description                       | Example                                        |
| -------------- | --------------------------------- | ---------------------------------------------- |
| `api_behavior` | How external APIs actually behave | "API returns 429 after ~100 req/min"           |
| `code_quirk`   | Unexpected behavior in our code   | "Thread model stores drafts only, not threads" |
| `pattern`      | Reusable approach                 | "Use exponential backoff for rate limits"      |
| `gotcha`       | Common mistake                    | "Don't forget userId filter on queries"        |
| `decision`     | Why we chose X over Y             | "Chose Zustand over Redux for simplicity"      |
| `dependency`   | External dependency behavior      | "PostHog batches events, 30s delay"            |
| `performance`  | Performance characteristics       | "Contact search is O(n) - needs index"         |
| `security`     | Security-related knowledge        | "Never log OAuth tokens"                       |

## Confidence Levels

| Level    | Meaning                  | When to Use                   |
| -------- | ------------------------ | ----------------------------- |
| `high`   | Verified multiple times  | CodeRabbit + human confirmed  |
| `medium` | Observed once reliably   | Single source, clear evidence |
| `low`    | Suspected but unverified | Inference, needs confirmation |

## Usage by Agents

Agents query knowledge before starting work:

```bash
# Find relevant facts
grep -l "<keyword>" .beads/knowledge/*.jsonl

# Query specific file patterns
cat .beads/knowledge/api-behaviors.jsonl | jq 'select(.affectedServices | contains(["ExampleService"]))'
```

## Contributing Knowledge

Knowledge is added by:

1. **Knowledge Curator Agent** - Automated extraction from PRs
2. **Human developers** - Manual additions
3. **Other agents** - Discoveries during work

To add knowledge manually:

```bash
# Append to appropriate file
echo '{"id": "...", ...}' >> .beads/knowledge/gotchas.jsonl
```

## Maintenance

- **Weekly**: Knowledge Curator reviews for staleness
- **On PR merge**: Extract learnings from CodeRabbit
- **On incident**: Add post-mortem learnings

---

## Agent Knowledge Summary

> Quick-lookup index for agents loading this knowledge base. This README is the entry point — read it first, then query the specific JSONL files and markdown docs relevant to your task.

### JSONL Files — Machine-Queryable Facts

| File | Entry Count | Primary Topics |
| ---- | ----------- | -------------- |
| `facts.jsonl` | 13 | CLI arch, CAAP auth, agent registry, trading, goals, ClawdRouter, pay-kit harness, USDC/SAS constants, env vars |
| `anti-patterns.jsonl` | 11 | npm pipe-to-tail, bash SC2015 `&&\|\|`, printf SC2059, wrong repo name, npm-in-pnpm, unbuilt @solana/mpp, public PR exposure, bare cd, hardcoded RPC, missing pipefail |
| `api-behaviors.jsonl` | 11 | mpp no-dist, x402 CORS headers, USDC micro-units, mppx peer dep, install telemetry, Solana RPC rate limits, Convex idempotency, ClawdRouter key format, CAAP discovery, Phoenix perps |
| `codebase-facts.jsonl` | 11 | Port 4402, ClawdBrowser 493 routes, pay-kit workspace, binary names, ESM-only, ClawdRouter vs x402.wtf, git branches, SAS attestation, $CLAWD tiers, ephemeral fee payer |
| `decisions.jsonl` | 9 | CAAP/1.0, MPP+x402 dual protocol, pnpm workspaces, fee-payer mode, MPL Core for NFTs, Fly.io for ClawdRouter, Convex for gateway, `set -euo pipefail` |
| `gotchas.jsonl` | 10 | @solana/mpp no dist, main branch missing, wrong directory, vitest upstream TS error, FEE_PAYER_KEY format, --full missing perplexity, _env_add grep crash, PATH with nvm, Vite build-time env |
| `patterns.jsonl` | 11 | Mppx 5-step pattern, _env_add backfill, fire-and-forget curl, proxyWithReceipt, module registration, cross-platform browser open, CAAP client init, goal-driven trading, toWebRequest adapter, step/ok/warn/die |

### Markdown Files — Narrative Context

| File | Description | Key cross-refs |
| ---- | ----------- | -------------- |
| `architecture-pieces.md` | How the 4 core OpenClawd pieces fit together (leviathan, gateway, plugin-sdk, chat-gateway) | `codebase-facts.jsonl` cbfact-003, `decisions.jsonl` decision-003 |
| `clawd-character.md` | Clawd's identity, voice, Three Laws, Mayhem Mode, CDP browser | `codebase-facts.jsonl` cbfact-009, `openclawd-hermes-memory.md` |
| `clawd-code-cli.md` | clawd-code-cli: multi-provider (Grok/OpenRouter/Ollama/OpenAI), Birdeye, DFlow, voice | `facts.jsonl` fact-cli-001, `codebase-facts.jsonl` cbfact-004 |
| `clawd-tui.md` | OpenClawd TUI: OpenRouter OAuth, Solana on-paste analysis, slash commands | `codebase-facts.jsonl` cbfact-006, `api-behaviors.jsonl` api-006 |
| `clawdrouter.md` | ClawdRouter: multi-protocol payment gateway (x402/MPP/AP2/A2A), Anchor vault, revenue split | `codebase-facts.jsonl` cbfact-006, `facts.jsonl` fact-cli-006, `decisions.jsonl` decision-006 |
| `openclawd-hermes-memory.md` | HERMES x402 mega-story: Leviathan, ClawdRouter, Clawd Memory SOTA architecture | `clawd-character.md`, `SOVEREIGN_RESEARCH.md`, `codebase-facts.jsonl` cbfact-007 |
| `openclawd.md` | Full OpenClawd readme: v0.3.1 attestation agent, Leviathan lifecycle, 66 skills | `codebase-facts.jsonl` cbfact-008, `facts.jsonl` fact-pay-004 |
| `SOVEREIGN_RESEARCH.md` | Karpathy loop on Solana: autoloop, research orchestrator, Birdeye+Helius data plane | `wiki.md`, `api-behaviors.jsonl` api-006, `patterns.jsonl` pattern-008 |
| `wiki.md` | AutoResearch Wiki: 49 lobster agents, $CLAWD-gated API, research endpoints, MCP integration | `SOVEREIGN_RESEARCH.md`, `codebase-facts.jsonl` cbfact-009 |

### Query patterns for agents

```bash
# Find all gotchas related to mpp
grep '"mpp"' knowledge/gotchas.jsonl | jq .fact

# Find all high-confidence patterns
grep '^{' knowledge/patterns.jsonl | jq 'select(.confidence=="high") | .id + ": " + .fact[:80]'

# Find entries affecting a specific file
grep '^{' knowledge/*.jsonl | jq 'select(.affectedFiles[]? | contains("pay.sh")) | .id + " [" + .type + "]"'

# Full-text search across all knowledge
grep -h '^{' knowledge/*.jsonl | jq 'select(.fact | contains("USDC")) | .id'
```
