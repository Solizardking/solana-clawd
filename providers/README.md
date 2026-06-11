<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  providers/ — LLM and service provider adapters     ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
 ____  ____   _____  __   __ ___ ____  _____ ____  ____
|  _ \|  _ \ / _ \ \/ /  |_ _|  _ \| ____|  _ \/ ___|
| |_) | |_) | | | \  /    | || | | |  _| | |_) \___ \
|  __/|  _ <| |_| /  \    | || |_| | |___|  _ < ___) |
|_|   |_| \_\\___/_/\_\  |___|____/|_____|_| \_\____/
```

**LLM and service provider adapters for CLAWD agents**

</div>

---

## What it does

The `providers/` directory contains adapter implementations for LLM providers and external services used by CLAWD agents.

## Supported providers

| Provider | Models | Notes |
|---|---|---|
| **Anthropic** | Claude Sonnet 4.6, Opus 4.8, Haiku 4.5 | Primary reasoning |
| **xAI / Grok** | grok-3, grok-vision | Image + code + chat |
| **Google Gemini** | gemini-3.5-flash, gemini-3.1-flash | Image gen, deep research |
| **DeepSeek** | deepseek-v4-pro, v4-flash | Arena brain, thinking mode |
| **ClawdRouter** | 55+ models | Solana wallet auth + USDC gating |
| **x402.wtf** | All above | Free tier via $CLAWD holding |

## Provider selection

Providers are selected via the `InferProvider` adapter in `src/services/`:

```typescript
import { InferProvider } from "@openclawdsolana/leviathan/services/x402/index.js";
```

The ClawdRouter (`clawdrouter/`) handles 15-dimension scoring to pick the best model for each request.

---

> See also: [clawdrouter/](../clawdrouter/) · [src/services/](../src/) · MIT
