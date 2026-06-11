<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  clawd-pay/ — CLAWD payment infrastructure          ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ____ _        ___        __        ____   ___   __
 / ___| |      / \ \      / /       |  _ \ / \ \ / /
| |   | |     / _ \ \ /\ / /  ___  | |_) / _ \ V /
| |___| |___ / ___ \ V  V /  |___| |  __/ ___ \| |
 \____|_____/_/   \_\_/\_/         |_| /_/   \_\_|
```

**CLAWD Pay — x402 + USDC payment infrastructure**

[![x402](https://img.shields.io/badge/x402-C85C2B?style=flat-square)](https://x402.wtf)
[![USDC](https://img.shields.io/badge/USDC-2775CA?style=flat-square)](https://www.circle.com/usdc)
[![Solana](https://img.shields.io/badge/Solana-9945FF?style=flat-square&logo=solana)](https://solana.com)

</div>

---

## What it does

`clawd-pay/` provides the payment layer for CLAWD agents — enabling them to pay and get paid in USDC via the x402 protocol on Solana.

## Key capabilities

- **x402 payments** — HTTP 402 payment challenges with USDC
- **Agent-to-agent payments** — direct micropayments between agents
- **pay.sh integration** — verified installer with payment rail
- **CLAWD tier gating** — hold $CLAWD to unlock premium models

## Install

```bash
# The pay.sh installer wires everything:
curl -fsSL https://pay.sh/services/auth/agent | bash

# Or install manually:
cd pay && npm install
```

## Payment flow

```
Agent A                   x402 Gateway
  │                            │
  ├─── GET /api/premium ───────►│
  │◄── 402 + USDC address ─────┤
  ├─── pay 0.01 USDC ──────────►│ (Solana)
  ├─── GET /api/premium ───────►│
  │◄── 200 + response ─────────┤
```

---

> See also: [pay/](../pay/) · [x402/](../x402/) · [pay.sh](../pay.sh) · MIT
