<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  telegram/ — Telegram bot configuration              ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
████████╗███████╗██╗     ███████╗ ██████╗ ██████╗  █████╗ ███╗   ███╗
╚══██╔══╝██╔════╝██║     ██╔════╝██╔════╝ ██╔══██╗██╔══██╗████╗ ████║
   ██║   █████╗  ██║     █████╗  ██║  ███╗██████╔╝███████║██╔████╔██║
   ██║   ██╔══╝  ██║     ██╔══╝  ██║   ██║██╔══██╗██╔══██║██║╚██╔╝██║
   ██║   ███████╗███████╗███████╗╚██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║
   ╚═╝   ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
```

**Telegram bot configuration and webhook setup**

[![Telegram](https://img.shields.io/badge/t.me/clawdtoken-26A5E4?style=flat-square&logo=telegram)](https://t.me/clawdtoken)
[![Commands](https://img.shields.io/badge/60%2B-commands-26A5E4?style=flat-square)](../gateway/src/)

</div>

---

## What it does

The `telegram/` folder holds configuration and webhook setup for the CLAWD Telegram bot. The bot logic lives in `gateway/src/` — 60+ commands covering:

| Category | Commands |
|---|---|
| 💰 Solana | `/price`, `/balance`, `/wallet`, `/airdrop` |
| 🤖 Agents | `/spawn`, `/list`, `/status`, `/kill` |
| 📊 DeFi | `/quote`, `/swap`, `/lp`, `/perps` |
| 🦞 CLAWD | `/clawd`, `/mint`, `/stake`, `/unstake` |
| 🧠 AI | `/chat`, `/research`, `/image`, `/voice` |

## Setup

```bash
# Set your bot token in .env
TELEGRAM_BOT_TOKEN=your-bot-token-here

# Register the webhook (gateway handles this automatically)
npm start --prefix gateway
```

## Webhook URL

```
https://x402.wtf/telegram/webhook
```

---

> Full bot logic at [gateway/src/](../gateway/src/) · [t.me/clawdtoken](https://t.me/clawdtoken) · MIT
