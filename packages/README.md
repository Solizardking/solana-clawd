<!-- ╔══════════════════════════════════════════════════════════════════════════╗ -->
<!-- ║   OpenClawd Packages  ·  solanaclawd.com  ·  x402.wtf  ·  v2.0.0        ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ╔═══════════════════════════════════════════════════════════════════╗
  ║   O P E N C L A W D   P A C K A G E S   —   v 2 . 0 . 0         ║
  ║   5 packages live on npm  ·  solanaclawd.com  ·  x402.wtf        ║
  ╠═══════════════════════════════════════════════════════════════════╣
  ║                                                                   ║
  ║  🖥  clawd            @openclawdsolana/clawd          TUI         ║
  ║  📋 agent-registry   @openclawdsolana/agent-registry  on-chain   ║
  ║  🌐 agent-hub        @openclawdsolana/agent-hub       dashboard  ║
  ║  🛠  solana-sdk       @openclawdsolana/solana-sdk      TS SDK     ║
  ║  👛 wallet           @openclawdsolana/wallet           Privy+Jup  ║
  ║                                                                   ║
  ╚═══════════════════════════════════════════════════════════════════╝
```

[![npm clawd](https://img.shields.io/badge/clawd-v2.0.0-C85C2B?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@openclawdsolana/clawd)
[![npm registry](https://img.shields.io/badge/agent--registry-v2.0.0-1E5AA8?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@openclawdsolana/agent-registry)
[![npm hub](https://img.shields.io/badge/agent--hub-v2.0.0-147D64?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@openclawdsolana/agent-hub)
[![npm sdk](https://img.shields.io/badge/solana--sdk-v2.0.0-9B59B6?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@openclawdsolana/solana-sdk)
[![npm wallet](https://img.shields.io/badge/wallet-v2.0.0-E67E22?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@openclawdsolana/wallet)
[![Website](https://img.shields.io/badge/solanaclawd.com-147D64?style=flat-square)](https://solanaclawd.com)
[![x402](https://img.shields.io/badge/x402.wtf-1E5AA8?style=flat-square)](https://x402.wtf)

</div>

---

## Package Architecture

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    O P E N C L A W D   S T A C K                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   solanaclawd.com/agents              x402.wtf/agents                   ║
║          ↕                                    ↕                         ║
║   ┌──────────────────────────────────────────────────┐                  ║
║   │            @openclawdsolana/clawd               │  🖥  TUI          ║
║   │     Ink terminal · multi-provider agent         │                  ║
║   └──────────────┬───────────────────┬─────────────┘                  ║
║                  │                   │                                  ║
║   ┌──────────────▼──────────┐  ┌─────▼────────────────────┐            ║
║   │  agent-registry         │  │  agent-hub               │            ║
║   │  Metaplex · SQLite      │  │  Express · port 3747     │            ║
║   │  clawd-registry CLI     │  │  clawd-hub CLI           │            ║
║   │  solanaclawd.com/agents │  │  browser dashboard       │            ║
║   └─────────────────────────┘  └──────────────────────────┘            ║
║                                                                          ║
║   ┌─────────────────────────┐  ┌──────────────────────────┐            ║
║   │  solana-sdk             │  │  wallet                  │            ║
║   │  bonding curves         │  │  Privy embedded wallet   │            ║
║   │  Token2022 · pTokens    │  │  AgenticWallet (Grok)    │            ║
║   │  vault mechanics        │  │  Jupiter SwapService     │            ║
║   └─────────────────────────┘  └──────────────────────────┘            ║
║                                                                          ║
║   solanaclawd.com/gateway  ←→  x402.wtf/gateway  (USDC micropayments)  ║
║   solanaclawd.com/skills   ←→  x402.wtf/skills   (agent skill hub)     ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Quick Install

```bash
# ── Core operator surface (install all three at once) ────────────────────────
npm install -g @openclawdsolana/clawd@2.0.0 \
               @openclawdsolana/agent-registry@2.0.0 \
               @openclawdsolana/agent-hub@2.0.0

# ── SDK + wallet (library use) ───────────────────────────────────────────────
npm install @openclawdsolana/solana-sdk@2.0.0
npm install @openclawdsolana/wallet@2.0.0

# ── Full stack installer ─────────────────────────────────────────────────────
bash install.sh --full
```

After install:

```bash
clawd                      # TUI operator
clawd-registry list        # browse 80+ on-chain agents
clawd-registry search "arbitrage"
clawd-hub start --open     # open dashboard at http://localhost:3747
```

---

## 🖥 clawd — Terminal Operator

**Package:** `@openclawdsolana/clawd@2.0.0`
**Install:** `npm install -g @openclawdsolana/clawd`
**Bin:** `clawd`

```
  clawd/
  ├── agent/         multi-provider: xAI · OpenRouter · Anthropic
  ├── ui/            Ink React terminal components
  ├── tools/         bash · solana · token-launch · dflow · kalshi
  ├── grok/          xAI / OpenRouter streaming client
  ├── mcp/           MCP stdio + SSE transport
  ├── voice/         xAI real-time voice (STT + TTS)
  └── leviathan/     in-process Leviathan bridge
```

```bash
clawd                           # interactive TUI
clawd -p "analyze my wallet"    # headless prompt mode
clawd mcp add --name my-server --command "node dist/index.js"
clawd examples list             # 9 demos, no keys needed
```

| Env var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Free OpenRouter models (recommended start) |
| `XAI_API_KEY` | xAI / Grok (paid) |
| `ANTHROPIC_API_KEY` | Claude direct (paid) |
| `HELIUS_API_KEY` | Solana on-chain data |

---

## 📋 agent-registry — On-Chain Agent Registry

**Package:** `@openclawdsolana/agent-registry@2.0.0`
**Install:** `npm install -g @openclawdsolana/agent-registry`
**Bin:** `clawd-registry`
**Browse:** [solanaclawd.com/agents](https://solanaclawd.com/agents) · [x402.wtf/agents](https://x402.wtf/agents)

```
  agent-registry/
  ├── cli/           clawd-registry list · search · add · mint · stats
  ├── registry/      Metaplex MPL Core mint + register
  ├── indexer/       SQLite local index (AgentIndex)
  └── metadata/      off-chain metadata fetch + schema
```

```bash
clawd-registry list                         # all indexed agents
clawd-registry search "perpetuals"          # semantic search
clawd-registry add <METAPLEX_ASSET>         # index from chain
clawd-registry stats                        # index statistics
clawd-registry mint --name "My Agent" \
  --uri https://metadata.json               # mint on Solana
```

```typescript
import { AgentIndex, fetchAgent } from "@openclawdsolana/agent-registry";

const idx = new AgentIndex();
const results = idx.search("arbitrage", { limit: 5 });

const agent = await fetchAgent(connection, assetAddress);
console.log(agent.name, agent.capabilities);
```

---

## 🌐 agent-hub — Local Discovery Dashboard

**Package:** `@openclawdsolana/agent-hub@2.0.0`
**Install:** `npm install -g @openclawdsolana/agent-hub`
**Bin:** `clawd-hub`
**URL:** `http://localhost:3747`

```
  agent-hub/
  ├── cli.ts         clawd-hub start · stop · status
  ├── server/        Express + CORS + static dashboard
  ├── routes/
  │   ├── agents.ts  GET /api/v1/agents — search, list, fetch
  │   └── hub.ts     GET /api/v1/hub/status — health + stats
  └── ws/            WebSocket live updates
```

```bash
clawd-hub start               # port 3747
clawd-hub start --open        # + open browser
clawd-hub start --port 8080   # custom port
clawd-hub status

# REST API
curl http://localhost:3747/api/v1/agents?q=arbitrage
curl http://localhost:3747/api/v1/hub/status
```

---

## 🛠 solana-sdk — TypeScript SDK

**Package:** `@openclawdsolana/solana-sdk@2.0.0`
**Install:** `npm install @openclawdsolana/solana-sdk`

```
  clawd-sdk/
  ├── constants.ts   CLAWD_MINT_MAINNET · AgentCapability flags
  ├── bonding-curve/ constant-product AMM + graduation math
  ├── token/         Token2022 + pToken creation helpers
  ├── vault/         conviction staking · milestone locks · entropy burns
  ├── agent/         AgentBinding · capability bitmask · epoch burns
  └── idl/           Anchor IDL types (clawd_protocol)
```

```typescript
import {
  CLAWD_MINT_MAINNET,
  AgentCapability,
  MAX_ENTROPY_BURN_BPS,
} from "@openclawdsolana/solana-sdk";

// Agent capability bitmask
AgentCapability.TRADING      // 0x01
AgentCapability.SPAWNING     // 0x02
AgentCapability.PAYMENTS     // 0x04
AgentCapability.RESEARCH     // 0x08
AgentCapability.GOVERNANCE   // 0x10
AgentCapability.BURN_TRIGGER // 0x20

MAX_ENTROPY_BURN_BPS         // 500 (5% per trigger)
```

---

## 👛 wallet — Privy + AgenticWallet + Jupiter

**Package:** `@openclawdsolana/wallet@2.0.0`
**Install:** `npm install @openclawdsolana/wallet`

```
  clawd-wallet/
  ├── ClawdWallet      Privy-embedded Solana wallet wrapper
  ├── AgenticWallet    AI-gated trading (deny / ask / allow)
  ├── SwapService      Jupiter aggregator integration
  └── DEFAULT_PERMISSIONS  maxSwapUsd: $50 · transfer: "ask"
```

```typescript
import { AgenticWallet } from "@openclawdsolana/wallet";

const agent = new AgenticWallet(wallet, {
  privyAppId: process.env.PRIVY_APP_ID!,
  grokApiKey: process.env.XAI_API_KEY,
  permissions: { swap: "allow", maxSwapUsd: 200 },
  onPendingTransaction: async (tx) => {
    console.log(tx.description);
    return userApproved;
  },
});

// AI-gated Jupiter swap — asks for approval before signing
const result = await agent.agentSwap({
  inputToken: "SOL",
  outputToken: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  amount: "100000000",   // 0.1 SOL in lamports
  slippageBps: 50,
});
```

---

## ⚓ clawd-protocol — Anchor Program (Rust)

**Status:** 🚧 development
**Build:** `cd clawd-protocol && anchor build`
**Program ID (devnet):** `CLAWDpRoToCoLv1pRoGRaM111111111111111111111`

On-chain mechanics: adaptive bonding curves, Token2022 pTokens, vault mechanics, sentiment engine, and agent capability bitmask.

---

## 📦 cli-standalone — Prebuilt CLI

**Package:** `@openclawdsolana/clawd-standalone`
**Install:** `npm install -g @openclawdsolana/clawd-standalone`

Zero-compile prebuilt binary of `clawd`. No TypeScript compilation on install — ideal for CI, scripts, and restricted environments.

---

## Dependencies Between Packages

```
  @openclawdsolana/clawd
    └── depends on: agent-registry, agent-hub, leviathan

  @openclawdsolana/agent-hub
    └── depends on: agent-registry

  @openclawdsolana/agent-registry
    └── standalone (Metaplex + better-sqlite3)

  @openclawdsolana/solana-sdk
    └── standalone (Anchor IDL + math)

  @openclawdsolana/wallet
    └── standalone (Privy + Jupiter)
```

---

## Links

| | |
| --- | --- |
| 🌐 Website | [solanaclawd.com](https://solanaclawd.com) |
| 🤖 Agents | [solanaclawd.com/agents](https://solanaclawd.com/agents) |
| 🏛 Gateway | [solanaclawd.com/gateway](https://solanaclawd.com/gateway) |
| 🎯 Skills | [solanaclawd.com/skills](https://solanaclawd.com/skills) |
| 💸 x402 | [x402.wtf](https://x402.wtf) |
| 🤖 x402 Agents | [x402.wtf/agents](https://x402.wtf/agents) |
| 🏛 x402 Gateway | [x402.wtf/gateway](https://x402.wtf/gateway) |
| 🎯 x402 Skills | [x402.wtf/skills](https://x402.wtf/skills) |
| 💻 GitHub | [solizardking/solanaclawd](https://github.com/solizardking/solanaclawd) |
| 🪙 `$CLAWD` | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |

---

<div align="center">

```
  ╔═════════════════════════════════════════════════════════════╗
  ║  🦞  The shell molts. The laws do not.                     ║
  ║      solanaclawd.com  ·  x402.wtf  ·  $CLAWD  ·  MIT      ║
  ╚═════════════════════════════════════════════════════════════╝
```

*Powered by OpenClawd · [solanaclawd.com](https://solanaclawd.com)*

</div>
