# ClawdRouter Architecture

## Overview

ClawdRouter is a local-first LLM routing proxy designed for the Solana-native agent ecosystem. Every routing decision happens locally in <1ms — zero external API calls for classification.

## System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                       Client Layer                            │
│  continue.dev │ Cursor │ VS Code │ OpenAI SDK │ Custom Agent │
└──────────────────────┬───────────────────────────────────────┘
                       │ POST /v1/chat/completions
                       │ Authorization: Bearer clawd_sk_...
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   ClawdRouter Proxy (:8402)                    │
│                                                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  15-Dimension    │  │  Tier Mapping    │  │  Profile      │ │
│  │  Scorer (<1ms)   │──│  SIMPLE/MED/     │──│  ECO/AUTO/    │ │
│  │                  │  │  COMPLEX/REASON  │  │  PREMIUM      │ │
│  └─────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ x402.wtf API     │  │  x402 Payment    │  │  Model       │ │
│  │ key validation   │  │  USDC on Solana  │  │  Registry    │ │
│  │                  │  │                  │  │  55+ models  │ │
│  └─────────────────┘  └──────────────────┘  └──────────────┘ │
└──────────────────────┬───────────────────────────────────────┘
                       │ OpenRouter attribution: https://x402.wtf/router
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    OpenRouter upstream                         │
│                                                                │
│  OpenAI │ Anthropic │ Google │ xAI │ DeepSeek │ NVIDIA │ etc  │
└──────────────────────────────────────────────────────────────┘
```

## Request Flow

1. **Client sends request** to `https://clawdrouter.fly.dev/v1/chat/completions`.
2. **Hosted auth validates** the `clawd_sk_...` key with `https://x402.wtf/api/auth/validate-key`.
3. **x402.wtf checks** key revocation, scopes, and recorded CLAWD holder/service access.
4. **Scorer analyzes** the request across 15 dimensions in <1ms.
5. **Tier determination**: SIMPLE (score <0.20) -> MEDIUM -> COMPLEX -> REASONING (score >0.70).
6. **Profile applies**: ECO (cheapest), AUTO (balanced), PREMIUM (best quality).
7. **Model selected** from `TIER_MAPPING` based on tier + profile.
8. **OpenRouter forwards** the request with `x402.wtf/router` attribution.
9. **Response returned** with `x_clawdrouter` metadata and routing headers.

## 15-Dimension Scoring

| # | Dimension | Weight | What it detects |
|---|-----------|--------|-----------------|
| 1 | tokenCount | 8% | Input length → model capacity needed |
| 2 | complexity | 10% | Vocabulary diversity, sentence structure |
| 3 | technicalDepth | 10% | Domain-specific terminology density |
| 4 | codeGeneration | 12% | Code blocks, programming keywords |
| 5 | reasoning | 12% | "explain", "prove", logical patterns |
| 6 | creativity | 5% | "write", "compose", creative keywords |
| 7 | multiStep | 8% | "step by step", sequential markers |
| 8 | contextLength | 5% | How much context window is needed |
| 9 | toolUse | 6% | Function calling, tool invocation |
| 10 | vision | 4% | Image content or vision keywords |
| 11 | mathScience | 6% | Mathematical operations, algorithms |
| 12 | solanaSpecific | 4% | Solana/blockchain domain terms |
| 13 | agentAutonomy | 4% | Agent/pipeline/workflow patterns |
| 14 | structuredOutput | 3% | JSON/schema/format requirements |
| 15 | latencySensitivity | 3% | Short queries = more latency-sensitive |

## Directory Structure

```
clawdrouter/
├── src/
│   ├── index.ts              # CLI entry point & server startup
│   ├── types.ts              # All TypeScript interfaces
│   ├── router/
│   │   ├── scorer.ts         # 15-dimension request classifier
│   │   ├── profiles.ts       # ECO/AUTO/PREMIUM routing logic
│   │   └── tiers.ts          # Tier definitions & cost analysis
│   ├── models/
│   │   └── registry.ts       # 55+ model registry with pricing
│   ├── proxy/
│   │   └── server.ts         # OpenAI-compatible HTTP proxy
│   ├── wallet/
│   │   └── solana.ts         # Solana Ed25519 wallet management
│   ├── x402/
│   │   └── payment.ts        # x402 USDC payment protocol
│   └── commands/
│       └── slash.ts          # Slash command engine
├── tests/
│   ├── scorer.test.ts        # Scoring engine tests
│   └── router.test.ts        # Routing & registry tests
├── docs/
│   ├── architecture.md       # This file
│   ├── configuration.md      # Environment variables
│   └── routing-profiles.md   # Profile deep dive
├── package.json
├── tsconfig.json
└── README.md
```

## Integration with x402.wtf

ClawdRouter integrates with the production x402.wtf app:

- **API keys**: `clawd_sk_...` keys created at `https://x402.wtf/profile/api`
- **Validation**: server-to-server validation through `/api/auth/validate-key`
- **Public API relay**: `/v1/relay/x402` checks health, router catalog, DEX, DexScreener, perps, and Vulcan public endpoints
- **Attribution**: OpenRouter requests use `https://x402.wtf/router`
- **Holder gate**: x402.wtf enforces recorded CLAWD holder/service access before the Fly router spends upstream tokens

## Security Model

- **No database URL in Fly router**: API-key lookup stays inside x402.wtf.
- **Shared internal secret**: only the Fly router can call the validation endpoint.
- **User keys stay scoped**: x402.wtf checks `inference:write` before chat completion calls.
- **Server secrets stay server-side**: OpenRouter and Helius keys are Fly secrets.
- **Public relay only reads public APIs**: no private user/session data is exposed by relay endpoints.
