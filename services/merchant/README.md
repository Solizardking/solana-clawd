<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  merchant/ — x402 merchant integration              ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
 __  __ _____ ____   ____ _   _    _    _   _ _____
|  \/  | ____|  _ \ / ___| | | |  / \  | \ | |_   _|
| |\/| |  _| | |_) | |   | |_| | / _ \ |  \| | | |
| |  | | |___|  _ <| |___|  _  |/ ___ \| |\  | | |
|_|  |_|_____|_| \_\\____|_| |_/_/   \_\_| \_| |_|
```

**x402 Merchant — payment-gated API endpoints**

[![x402](https://img.shields.io/badge/x402-payment%20gating-C85C2B?style=flat-square)](https://x402.wtf)
[![USDC](https://img.shields.io/badge/USDC-Solana-2775CA?style=flat-square)](https://www.circle.com/usdc)

</div>

---

## What it does

The `merchant/` directory contains x402 merchant configuration — turning any HTTP endpoint into a paid API that accepts USDC on Solana.

With x402 merchants:

```
Client                    Merchant
  │                          │
  ├─── GET /api/data ────────►│
  │                          │◄─── 402 Payment Required
  │◄── 402 + payment info ───┤    (price + wallet + network)
  │                          │
  ├─── pay USDC ─────────────►│ (Solana)
  ├─── GET /api/data + proof ►│
  │◄── 200 + data ───────────┤
```

## Setup

```bash
# Install the x402 library
npm install @openclawd/agents-x402

# Register your endpoint
import { x402Gate } from "@openclawd/agents-x402";
app.use("/api/premium", x402Gate({ price: "0.01", currency: "USDC" }));
```

---

> See also: [x402/](../x402/) · [pay/](../pay/) · [packages/agents-x402-solana/](../packages/agents-x402-solana/) · MIT
