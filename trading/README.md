<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  trading/ — Trading utilities and AI agents          ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
████████╗██████╗  █████╗ ██████╗ ██╗███╗   ██╗ ██████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝
   ██║   ██████╔╝███████║██║  ██║██║██╔██╗ ██║██║  ███╗
   ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚██╗██║██║   ██║
   ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚████║╚██████╔╝
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝
```

**Solana trading utilities and AI trading agents**

[![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Phoenix](https://img.shields.io/badge/Phoenix-DEX-orange?style=flat-square)](https://ellipsis.finance)

</div>

---

## What it does

The `trading/` folder contains Solana trading AI agent utilities:

| Directory | Description |
|---|---|
| `Solana-Trading-AI-Agent/` | Full AI-driven trading agent with Solana + Jupiter integration |
| `agent-auth/` | Auth integration for trading agents via CAAP/1.0 |

## Trading agent features

- **Jupiter** — swap quotes and routing
- **Helius** — real-time transaction monitoring
- **Phoenix** — perps trading via Rise SDK
- **Paper mode** — simulation without private keys
- **Box isolation** — each run is sandboxed via `box/`

## Quick start

```bash
# Use via box runner:
npm run box:perps -- sol-perp --paper

# Or run the standalone agent:
cd trading/Solana-Trading-AI-Agent
npm install && npm start
```

---

> See also: [box/](../box/) · [clawd-perps-agent/](../clawd-perps-agent/) · [packages/percolator/](../packages/percolator/) · MIT
