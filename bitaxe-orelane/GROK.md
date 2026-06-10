# Grok Handoff — bitaxe-orelane

Bitaxe Orelane is embedded here as the Grok-side copy of the Bitaxe Gamma + ORE + Telegram control plane. It mirrors the Claude-side package at `packages/clawd-code-cli/bitaxe-orelane` and keeps the same paper-first safety defaults.

## What lives here

- `src/` — TypeScript controller, Telegram bot, ORE policy engine, Helius client, Vulcan wrapper, and tests.
- `dashboard/` — Next.js rig UI for local monitoring.
- `firmware/esp-miner-overlay/` — ESP-Miner overlay for Bitaxe telemetry/control.
- `article.md` — Public narrative article about the monorepo move.
- `OPEN_SOURCE.md` — Release checklist for publishing safely.
- `INTEGRATION.md` — How this copy fits into `clawd-grok`.

## Commands from repo root

```bash
npm run bitaxe:install
npm run bitaxe:test
npm run bitaxe:build
npm run bitaxe:status
npm run bitaxe:bot
npm run bitaxe:dashboard:dev
npm run bitaxe:dashboard:build
```

## Safety defaults

Live ORE execution, rig control, and live perps stay gated by env flags and operator confirmation. Keep `.env`, `.env.local`, keypair files, logs, `node_modules`, `.next`, and `dist` out of git and npm packages unless a release process explicitly requires generated assets.

## Location

This package is at `/Users/8bit/Downloads/solana-clawd/bitaxe-orelane/` — the monorepo root. Use the vitest suite as the source of truth before publishing.
