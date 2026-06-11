<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  gateway/ — OpenClawd HTTP + Telegram gateway        ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ▄████  ▄▄▄       ▄▄▄█████▓▓█████  █     █░ ▄▄▄     ▓██   ██▓
 ██▒ ▀█▒▒████▄     ▓  ██▒ ▓▒▓█   ▀ ▓█░ █ ░█░▒████▄    ▒██  ██▒
▒██░▄▄▄░▒██  ▀█▄   ▒ ▓██░ ▒░▒███   ▒█░ █ ░█ ▒██  ▀█▄   ▒██ ██░
░▓█  ██▓░██▄▄▄▄██  ░ ▓██▓ ░ ▒▓█  ▄ ░█░ █ ░█ ░██▄▄▄▄██  ░ ▐██▓░
░▒▓███▀▒ ▓█   ▓██▒   ▒██▒ ░ ░▒████▒░░██▒██▓  ▓█   ▓██▒ ░ ██▒▓░
 ░▒   ▒  ▒▒   ▓▒█░   ▒ ░░   ░░ ▒░ ░░ ▓░▒ ▒   ▒▒   ▓▒█░  ██▒▒▒
  ░   ░   ▒   ▒▒ ░     ░     ░ ░  ░  ▒ ░ ░    ▒   ▒▒ ░▓██ ░▒░
░ ░   ░   ░   ▒      ░         ░     ░   ░    ░   ▒   ▒ ▒ ░░
      ░       ░  ░             ░  ░    ░           ░  ░░ ░
```

**x402.wtf public HTTP + Telegram gateway**

[![Deploy](https://img.shields.io/badge/fly.io-deployable-blue?style=flat-square)](./fly.toml)
[![Telegram](https://img.shields.io/badge/telegram-bot-26A5E4?style=flat-square&logo=telegram)](https://t.me/clawdtoken)
[![x402](https://img.shields.io/badge/x402-payment%20gating-C85C2B?style=flat-square)](https://x402.wtf)

</div>

---

## What it does

The gateway is the public-facing HTTP API and Telegram bot for the OpenClawd ecosystem. It bridges:

| Route | Description |
|---|---|
| `POST /telegram/webhook` | Telegram bot handler — 60+ commands, Helius/Birdeye/Solana |
| `GET /api/agents` | Live agent catalog from `agents/` |
| `GET /api/skills` | Skill catalog with per-skill metadata |
| `GET /api/track/install` | Install event tracking (Neon Auth protected) |
| `GET /.well-known/ai-plugin.json` | Discovery for AI agents |
| `GET /api/x402/*` | x402 payment-gated endpoints |

## Quick start

```bash
npm start --prefix gateway
# or from root:
npm run gateway:dev
```

## Environment

Copy `gateway/.env.example` → `gateway/.env.local` and fill in:

- `HELIUS_RPC_URL` — Helius RPC endpoint
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `XAI_API_KEY` — Grok/xAI for chat
- `NEON_AUTH_JWKS` — (optional) JWT validation for protected reads

## Deploy

```bash
flyctl deploy --config gateway/fly.toml
```

---

> Part of [OpenClawd](https://x402.wtf) · MIT
