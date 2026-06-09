# Clawd — Bitaxe Orelane

This is the **bitaxe-orelane** subpackage, nested inside `packages/clawd-code-cli/`
of the [solana-clawd](https://github.com/solizardking/solanaclawd) monorepo.

## Quick reference

| Command | What it does |
|---|---|
| `cd packages/clawd-code-cli/bitaxe-orelane` | Enter this subpackage |
| `cp .env.example .env` | First-time env setup |
| `npm install` | Install deps (~3 s with cache) |
| `npm test` | Run the 46 vitest tests |
| `npm run build` | tsc → `dist/` |
| `npm run status` | Dry-run status snapshot (live Bitaxe + ORE) |
| `npm run bot:test -- /help` | Exercise the bot intent router locally |
| `npm run bot` | Start the Telegram bot |
| `npm start` | Run the full control loop |

## From the monorepo root

The root `package.json` has convenience scripts:

```bash
npm run bitaxe:status          # → cd packages/clawd-code-cli/bitaxe-orelane && npm run status
npm run bitaxe:test            # → run the 46 vitest tests
npm run bitaxe:build           # → tsc → dist/
npm run bitaxe:bot:test -- /help
npm run bitaxe:bot
npm run bitaxe:start
npm run bitaxe:dashboard:dev   # → cd dashboard && npm run dev
```

## What this is

A paper-first Clawd agent that runs a safety-gated control loop for a
**Bitaxe Gamma 602** ASIC (BM1370) and an **ORE** miner on Solana. Telegram
operator bot, ORE policy engine, Bitaxe HTTP bridge, Phoenix perp bridge via
the `vulcan` CLI, Helius DAS wallet lookup, Next.js dashboard, and an
ESP-Miner firmware overlay.

## See also

- `README.md` — full documentation, Telegram command reference, env vars
- `INTEGRATION.md` — how this fits into the solana-clawd monorepo
- `clawd.json` — Clawd agent definition (CAAP/1.0)
- `docs/architecture.md` — architecture deep-dive
