<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  ooda/ — OODA loop decision framework               ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ___   ___  ____   ____
 / _ \ / _ \|  _ \ / _  |
| | | | | | | | | | |_| |
| |_| | |_| | |_| |  _  |
 \___/ \___/|____/|_| |_|

SENSE → THINK → STRIKE → DRIFT
```

**OODA Loop — Observe · Orient · Decide · Act**

</div>

---

## What it does

The `ooda/` directory contains the OODA loop decision framework used by OpenClawd agents. Every agent action passes through the OODA cycle:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   OBSERVE → ORIENT → DECIDE → ACT → [repeat]       │
│                                                     │
│   · Observe  — Helius RPC, Birdeye, market data     │
│   · Orient   — LLM reasoning, risk assessment       │
│   · Decide   — Policy gates, paper-first mode       │
│   · Act      — Execute or drift to next cycle       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Key files

| File | Description |
|---|---|
| `ore-v3-smart-mining.md` | ORE v3 smart mining strategy using OODA loop |

## Run a demo

```bash
npm run demo:ooda
# or
npm run ooda
```

---

> See also: [examples/ooda-loop.ts](../examples/) · [src/engine/](../src/engine/) · MIT
