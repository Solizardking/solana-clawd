<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  programs/ — Solana on-chain programs               ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
 ____  ____  ___   ____ ____      _    __  __ ____
|  _ \|  _ \/ _ \ / ___|  _ \    / \  |  \/  / ___|
| |_) | |_) | | | | |  _| |_) |  / _ \ | |\/| \___ \
|  __/|  _ <| |_| | |_| |  _ <  / ___ \| |  | |___) |
|_|   |_| \_\\___/ \____|_| \_\/_/   \_\_|  |_|____/
```

**Solana on-chain programs — Anchor smart contracts**

[![Anchor](https://img.shields.io/badge/Anchor-0.29-512BD4?style=flat-square)](https://anchor-lang.com)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF?style=flat-square&logo=solana)](https://solana.com)

</div>

---

## What it does

The `programs/` directory contains Solana Anchor programs for the OpenClawd protocol:

| Program | Description |
|---|---|
| `client/` | TypeScript client for on-chain program interaction |
| `programs/` | Anchor Rust programs |

## Build and deploy

```bash
# Build the Anchor program
npm run protocol:build

# Or directly via Anchor:
cd packages/clawd-protocol
anchor build
anchor deploy --provider.cluster devnet
```

## Formal verification

All programs are verified with the Kani Rust Verifier. See [formal_verification/](../formal_verification/) for proofs.

---

> See also: [staking/](../staking/) · [packages/clawd-protocol/](../packages/clawd-protocol/) · MIT
