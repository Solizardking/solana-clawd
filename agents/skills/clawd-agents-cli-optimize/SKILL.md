---
name: clawd-agents-cli-optimize
description: >
  Composable provider harness for Clawd agents — /optimize and /pack commands.
  Use when: selecting the best LLM provider for a task, loading the right skill pack,
  configuring Solana perps (Phoenix/Vulcan) as always-on, exporting a context pack
  for cross-runtime use (Grok, ChatGPT, Gemini CLI), generating TA strategy configs,
  or flattening skill files into a single context document (repomix-style).
  Solana perps via Vulcan MCP are ALWAYS active regardless of task type.
  Part of the Clawd Agents CLI skills suite.
metadata:
  author: Clawd
  license: MIT
  version: 0.2.0
  requires:
    bins:
      - clawd-agents
    install: "npx @solanaclawd/clawd-agents-cli setup"
---

# Clawd /optimize + /pack — Composable Provider Harness

> **Requires:** `clawd-agents` — install via `npx @solanaclawd/clawd-agents-cli@latest setup`

The lobster molts to fit the task. The three laws do not.

---

## What works best in practice right now

Split your session context into three tiers:

```
rules / invariants   →  always-on packed context (small, deterministic)
skills / workflows   →  loaded only when the task calls for them
commands             →  mapped explicitly in System Instructions (stable aliases)
```

**For Grok specifically:**
- Define the Command Registry in System Instructions (Custom Instructions) — Grok-2+ respects it reliably
- Wrap skill bodies in `<skill name="...">...</skill>` XML tags — Grok distinguishes them from your code
- Use `clawd-agents pack` to flatten SKILL.md files into one context file; feed it at session start
- Use `clawd-agents optimize --starter --xml` to get the minimum viable always-on pack

---

## /optimize

```bash
# Auto-detect task + provider
clawd-agents optimize

# Explicit task + provider + strategy
clawd-agents optimize --task perps --provider claude --strategy twap --symbol SOL

# Full ECC-style session — everything loaded, saved to ~/.openclawd/harness.json
clawd-agents optimize --task full --provider claude --write

# Export plain markdown context pack
clawd-agents optimize --task perps --print-context

# Export XML context pack for Grok (paste into System Instructions)
clawd-agents optimize --task perps --print-context --xml

# Minimal always-on starter pack (plain or XML)
clawd-agents optimize --starter
clawd-agents optimize --starter --xml

# Generate a TA strategy JSON config, then launch it
clawd-agents optimize --ta-config ema-cross --symbol SOL
vulcan strategy ta start --config-file ./ema-cross-sol.json --mode paper --run-until-stopped --detached

# JSON output for scripting
clawd-agents optimize --task perps --json
```

---

## /pack

Flattens any set of SKILL.md files into a single context document.
Equivalent to repomix for skills — one file, paste once, works in any runtime.

```bash
# List all discoverable skills
clawd-agents pack --list

# Pack the perps always-on set (plain markdown)
clawd-agents pack vulcan vulcan-risk-management vulcan-lot-size-calculator

# Pack with XML wrapping (Grok-compat)
clawd-agents pack vulcan vulcan-risk-management vulcan-lot-size-calculator --xml

# Pack a full strategy set and save to file
clawd-agents pack \
  vulcan \
  vulcan-risk-management \
  vulcan-lot-size-calculator \
  vulcan-grid-trading \
  vulcan-twap-execution \
  vulcan-ta-strategy \
  --xml --out ~/.openclawd/perps-pack.md

# Pipe into a session or clipboard
clawd-agents pack vulcan vulcan-risk-management | pbcopy
```

Skills are resolved from (in order):
1. `skills/skills/` (repo, local dev)
2. `agents/skills/` (agents dir)
3. `~/.agents/skills/` (global install)
4. `~/.claude/skills/` (Claude Code compat)
5. `~/.openclawd/skills/` (user custom)

---

## Task Types

| Task       | Best For                                    | Default Provider |
|------------|---------------------------------------------|-----------------|
| `perps`    | Phoenix perpetuals trading via Vulcan        | claude          |
| `research` | Market data, TA, funding rate analysis       | grok / gemini   |
| `code`     | Smart contract dev, agent scaffolding        | claude          |
| `ops`      | Infra, deploy, node ops                      | claude / grok   |
| `full`     | Full ECC — everything loaded                 | claude          |
| `auto`     | Detect from `CLAWD_TASK` env or default perps | claude         |

---

## Provider Registry

| Provider | Model             | Strengths                          | Env Key           |
|----------|-------------------|------------------------------------|-------------------|
| `claude` | claude-sonnet-4-6 | Tool-use, MCP, agentic loops       | ANTHROPIC_API_KEY |
| `openai` | gpt-4o            | Speed, function-calling            | OPENAI_API_KEY    |
| `grok`   | grok-3            | Real-time data, fast inference     | XAI_API_KEY       |
| `gemini` | gemini-2.5-pro    | Large context, deep research       | GOOGLE_API_KEY    |
| `ollama` | llama3.2          | Privacy, offline, free             | OLLAMA_BASE_URL   |

Auto-selection checks which keys are set and picks the best match for the task.
Fall-through: any missing key routes via `ClawdRouter` (free tier, OpenAI-compat).

---

## Skill Pack Design (always-on vs on-demand)

```
always-on  →  invariants packed every session (keep this small)
on-demand  →  workflows loaded only when the task calls for them
```

### perps always-on (minimum viable)
- `vulcan` — runtime contract + safety rules + preflight gate + skill router
- `vulcan-risk-management` — preflight gate; never skip, even in paper mode
- `vulcan-lot-size-calculator` — lot math; most common agent error source

### perps on-demand
- `vulcan-grid-trading` — load when doing grid
- `vulcan-twap-execution` — load when doing TWAP
- `vulcan-ta-strategy` — load when doing TA-driven entry/exit
- `vulcan-tpsl-management` — load when setting TP/SL

---

## Command Registry for System Instructions

Paste this block into Grok / ChatGPT / Gemini CLI System Instructions:

```
# Clawd Perps — Command Registry
- /preflight: Run vulcan strategy preflight before any order
- /scan: Fetch Phoenix market data + funding rates + signals
- /twap: Start TWAP on Phoenix (detached, ledger-backed)
- /grid: Start grid strategy (detached, ledger-backed)
- /ta: Start TA-driven strategy (detached, ledger-backed)
- /paper: Paper-trade a position (no real funds)
- /positions: List open positions + PnL
- /finalize: Finalize strategy run with optional cancel + close
If I use a command, strictly follow the corresponding Vulcan MCP logic.
```

---

## TA Strategy Config Presets

| Preset            | Timeframe | Logic                              |
|-------------------|-----------|------------------------------------|
| `ema-cross`       | 1h        | EMA 9/21 cross long/close          |
| `rsi-reversion`   | 15m       | RSI <30 long, >70 short            |
| `macd-trend`      | 4h        | MACD bullish/bearish cross         |

```bash
# Generate + immediately launch (paper)
clawd-agents optimize --ta-config ema-cross --symbol SOL
vulcan strategy ta start \
  --config-file ./ema-cross-sol.json \
  --mode paper --run-until-stopped --detached
```

---

## Solana Perps — Always Active

Phoenix Perpetuals DEX is wired in regardless of task type.

```bash
# Mandatory preflight before any order
vulcan strategy preflight

# Paper long/short
clawd-agents long SOL --notional 100
clawd-agents short SOL --notional 100

# TWAP (detached — required for multi-tick runs)
vulcan strategy twap start \
  --symbol SOL --side buy --notional-usdc 500 --slices 5 \
  --interval-seconds 300 --mode paper \
  --max-step-notional-usdc 110 --max-price-drift-bps 75 \
  --detached

# Grid (detached, run-until-stopped)
vulcan strategy grid start \
  --symbol SOL --center-on-mark --width-pct 2.5 \
  --levels-per-side 5 --tokens-per-level 0.5 \
  --run-until-stopped --mode paper \
  --max-total-notional-usdc 1000 --detached

# Operating loop — use wait-next-tick, never sleep
RUN_ID=$(vulcan strategy grid start ... --detached -o json | jq -r '.data.run_id')
vulcan strategy status "$RUN_ID" --since-tick 0          # backfill startup ticks
vulcan strategy wait-next-tick "$RUN_ID" --timeout-seconds 90  # anchor to next_tick_at
vulcan strategy monitor "$RUN_ID"
vulcan strategy finalize "$RUN_ID" --cancel-orders --close-position --wait
```

### Execution Modes

| Mode           | Behavior                                            |
|----------------|-----------------------------------------------------|
| `paper`        | Simulated against live prices. Default.             |
| `dry-run`      | Builds + logs each step, no submission.             |
| `confirm-each` | Live orders, prompts before each step. Dangerous.   |
| `auto-execute` | Live orders without prompting. Use with guardrails. |

### Guardrails (always pass in live mode)

```
--max-total-notional-usdc 1000
--max-step-notional-usdc 200
--max-price-drift-bps 75
--max-exposure-ratio 0.5
```

---

## Safety Invariants (non-negotiable, all providers)

- Never execute live trades without `LIVE_TRADING=true`, `OPERATOR_CONFIRMED=true`, `PERPS_SIM_ONLY=false`
- Always run `vulcan strategy preflight` before any order — even in paper mode
- Always use the lot-size calculator; never pass raw token amounts as base lots
- `detached: true` is required for every multi-tick strategy run
- Report every trade, fill, and strategy slice immediately — never batch into summaries
- Paper mode is the default; operator must explicitly arm live execution

---

## Related Skills

- `/clawd-agents-cli-workflow` — Full dev lifecycle (scaffold → eval → deploy)
- `/vulcan` — Vulcan MCP runtime contract + focused-skill router (load first for perps)
- `/vulcan-risk-management` — Preflight gate + risk limits
- `/vulcan-lot-size-calculator` — Lot size conversion
- `/vulcan-execution-modes` — Mode taxonomy; load before any strategy launch
- `/vulcan-twap-execution` — TWAP strategy deep-dive
- `/vulcan-grid-trading` — Grid strategy deep-dive
- `/vulcan-ta-strategy` — TA-driven strategy deep-dive
