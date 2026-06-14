# Bitaxe Orelane — Integration

This package lives at `bitaxe-orelane/` in the `solana-clawd` monorepo root. It is a standalone Node-native package (uses `tsx`, `tsc`, `vitest`) that can be run directly or embedded into other builds.

---

## How to run

```bash
cd /Users/8bit/Downloads/solana-clawd/bitaxe-orelane
cp .env.example .env
npm install
npm test                   # vitest suite
npm run status             # dry-run live snapshot
npm run bot                # start the Telegram bot
npm start                  # full control loop
```

## Monorepo integration

The root `package.json` at `solana-clawd/` can proxy bitaxe commands with:

```json
"bitaxe:install":       "npm install --prefix bitaxe-orelane",
"bitaxe:test":          "npm test --prefix bitaxe-orelane",
"bitaxe:build":         "npm run build --prefix bitaxe-orelane",
"bitaxe:status":        "npm run status --prefix bitaxe-orelane",
"bitaxe:bot":           "npm run bot --prefix bitaxe-orelane",
"bitaxe:dashboard:dev":   "npm run dev --prefix bitaxe-orelane/dashboard",
"bitaxe:dashboard:build": "npm run build --prefix bitaxe-orelane/dashboard"
```

## Toolchain

- Controller + bot: Node ≥ 20, `tsx` for dev, `tsc` for build
- Dashboard: Next.js (see `dashboard/package.json`)
- Firmware overlay: C patch for ESP-Miner (`firmware/esp-miner-overlay/`)

## See also

- `ore/ore-v3-smart-mining.md` — ORE v3 timing, probability, and risk guide
- `docs/architecture.md` — Full system architecture
- `docs/telegram-bot.md` — Telegram bot command reference
- `clawd.json` — Clawd agent manifest
