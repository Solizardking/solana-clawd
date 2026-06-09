# Telegram Operator Bot

The Telegram bot is the natural-language operator for Bitaxe Orelane. It exposes the same Bitaxe and ORE policy engine already used by the CLI, plus extension surfaces for Clawd agents, perps, x402 payments, and dashboards.

## Safety Model

Read-only and preview actions are default.

Live rig control requires:

- `DRY_RUN=false`
- `OPERATOR_CONFIRMED=true`
- `RIG_CONTROL_LIVE=true`

Live ORE execution requires:

- `DRY_RUN=false`
- `OPERATOR_CONFIRMED=true`
- `LIVE_EXECUTION=true`

Live perps execution remains in preview mode through this bot. The perps bridge follows the referenced `clawd-agents-perps` safety gates:

- `LIVE_TRADING=true`
- `OPERATOR_CONFIRMED=true`
- `PERPS_SIM_ONLY=false`

Payments are surfaced as x402 status and planning. Telegram payment execution is not wired to move funds.

## DeepSeek

Natural-language routing uses the DeepSeek OpenAI-compatible chat endpoint:

- base URL: `https://api.deepseek.com`
- endpoint: `/chat/completions`
- env key: `DEEPSEEK_API_KEY`
- default model: `deepseek-v4-pro`

## OpenRouter Fallback

If DeepSeek is unavailable or not configured, the bot can route through OpenRouter:

- base URL: `https://openrouter.ai/api/v1`
- endpoint: `/chat/completions`
- env key: `OPENROUTER_API_KEY`
- default model: `openrouter/free`

Routing order is:

1. `DEEPSEEK_API_KEY`
2. `OPENROUTER_API_KEY`
3. deterministic keyword routing

## Commands

```bash
npm run bot:test -- /help
npm run bot:test -- /status
npm run bot:test -- "optimize bitcoin lottery chances and ore latency"
npm run bot:test -- "/perps_paper_long SOL 100"
```

Run the real bot:

```bash
npm run bot
```

## Telegram Commands

- `/status`: Bitaxe, ORE, wallet, miner, and policy decision.
- `/optimize`: BTC lottery-chance, stale-share, pool-latency, and ORE deploy strategy.
- `/ore_checkpoint`: gated ORE checkpoint.
- `/ore_claim`: gated ORE claim.
- `/ore_deploy <SOL> <square,square>`: ORE deploy preview.
- `/pause`: gated Bitaxe pause.
- `/resume`: gated Bitaxe resume.
- `/perps`: perps bridge status.
- `/perps_paper_long SOL 100`: paper long preview.
- `/perps_paper_short SOL 100`: paper short preview.
- `/perps_live_long SOL 100`: live preview path, still gated.
- `/perps_live_short SOL 100`: live preview path, still gated.
- `/payments`: x402/payment surfaces.
- `/agents`: Clawd agent surfaces.
- `/dashboard`: Bitaxe, ORE, perps, and firmware API surfaces.

## Perps Bridge

The bot expects the referenced perps CLI at:

```text
/Users/8bit/solana-os-go/solana-clawd/perps/clawd-agents-perps/dist/cli.js
```

Build it with:

```bash
npm --prefix /Users/8bit/solana-os-go/solana-clawd/perps/clawd-agents-perps run build
```

Until that file exists, the bot reports that the perps bridge is configured but missing its built CLI.
