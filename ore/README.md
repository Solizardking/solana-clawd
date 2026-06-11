<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  ore/ — ORE mining + clawd infrastructure           ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ___  ____  _____
 / _ \|  _ \| ____|
| | | | |_) |  _|
| |_| |  _ <| |___
 \___/|_| \_\_____|

⛏  ORE · Proof of Work · Solana
```

**ORE mining infrastructure for CLAWD agents**

[![ORE](https://img.shields.io/badge/ORE-v3-orange?style=flat-square)](https://ore.supply)
[![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?style=flat-square&logo=solana)](https://solana.com)

</div>

---

## What it does

The `ore/` directory contains infrastructure for running ORE v3 smart mining alongside CLAWD's agent ecosystem:

| Directory | Description |
|---|---|
| `clawd-computer/` | CLAWD computer agent — browser + code execution via HuggingFace |
| `clawd-gateway/` | Gateway config for ORE-adjacent services |
| `homebase/` | HuggingFace Spaces homebase configuration |
| `org-readme/` | Organization-level README assets |
| `programs/` | On-chain program references |
| `x402-api-routes.json` | x402 payment-gated API route definitions |

## ORE strategy

See [ooda/ore-v3-smart-mining.md](../ooda/ore-v3-smart-mining.md) for the OODA-driven smart mining strategy.

## HuggingFace Spaces

- [solanaclawd/homebase](https://huggingface.co/spaces/solanaclawd/homebase) — main homebase
- [solanaclawd/clawd-computer](https://huggingface.co/spaces/solanaclawd/clawd-computer) — browser + code agent

---

> Part of [OpenClawd](https://x402.wtf) · MIT
