<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  clawd-bot/ — Bot infrastructure                    ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ____ _        ___        ____   ___ _____
 / ___| |      / \ \      / |  \ / _ \_   _|
| |   | |     / _ \ \ /\ / /|   | |_| || |
| |___| |___ / ___ \ V  V / | |\ \  _  || |
 \____|_____/_/   \_\_/\_/  |_| \_|_| |_||_|
```

**CLAWD bot infrastructure and configuration**

</div>

---

## What it does

The `clawd-bot/` directory contains bot infrastructure configuration. The primary bot logic lives in the `gateway/` package — this directory holds supplementary bot config.

## Bot surfaces

| Bot | Where |
|---|---|
| Telegram bot | `gateway/src/` — 60+ commands |
| Discord (planned) | TBD |
| X/Twitter | Via `social/` integrations |

## Quick start

```bash
# Start the full bot stack via gateway:
npm start --prefix gateway

# Or from root:
npm run gateway:dev
```

---

> Full bot logic at [gateway/](../gateway/) · [telegram/](../telegram/) · MIT
