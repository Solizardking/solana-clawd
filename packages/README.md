<!-- ╔══════════════════════════════════════════════════════════════════════════╗ -->
<!-- ║   OpenClawd Packages  ·  solanaclawd.com  ·  x402.wtf  ·  v2.0.0        ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

```
╔══════════════════════════════════════════════════════════════════════════════╗
║          O P E N C L A W D   P A C K A G E S   —   v 2 . 0 . 0            ║
║     11 packages · 6 npm live · 2 Anchor programs · solanaclawd.com          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  🖥  clawd-code-cli     @openclawdsolana/clawd          TUI operator         ║
║  📋 agent-registry     @openclawdsolana/agent-registry  Metaplex index      ║
║  🌐 agent-hub          @openclawdsolana/agent-hub       local dashboard     ║
║  🛠  clawd-sdk          @openclawdsolana/solana-sdk      TypeScript SDK      ║
║  👛 clawd-wallet        @openclawd/wallet                Privy + Jupiter     ║
║  🔐 agentwallet         agentwallet-vault                keypair vault       ║
║  💸 agents-x402-solana  @openclawd/agents-x402           x402 monetisation  ║
║  📦 cli-standalone      @openclawdsolana/clawd-standalone zero-compile CLI  ║
║  🌀 percolator          @openclawd/percolator            perps CLI           ║
║  ⚓ clawd-protocol      Rust/Anchor                      bonding curves      ║
║  ⚓ AI Inference         @clawd/solana-ai-inference-client on-chain AI       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
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
║   │            @openclawdsolana/clawd                │  🖥  TUI          ║
║   │     Ink terminal · multi-provider agent          │                  ║
║   └──────────────┬───────────────────┬──────────────┘                  ║
║                  │                   │                                  ║
║   ┌──────────────▼──────────┐  ┌─────▼────────────────────┐            ║
║   │  agent-registry         │  │  agent-hub               │            ║
║   │  Metaplex · SQLite      │  │  Express · port 3747     │            ║
║   │  clawd-registry CLI     │  │  clawd-hub CLI           │            ║
║   └─────────────────────────┘  └──────────────────────────┘            ║
║                                                                          ║
║   ┌─────────────────────────┐  ┌──────────────────────────┐            ║
║   │  clawd-sdk              │  │  clawd-wallet             │            ║
║   │  bonding curves         │  │  Privy embedded wallet   │            ║
║   │  Token2022 · pTokens    │  │  AgenticWallet (AI-gate) │            ║
║   │  vault mechanics        │  │  Jupiter SwapService     │            ║
║   └─────────────────────────┘  └──────────────────────────┘            ║
║                                                                          ║
║   ┌─────────────────────────┐  ┌──────────────────────────┐            ║
║   │  agents-x402-solana     │  │  agentwallet-vault       │            ║
║   │  one-line x402 tolls    │  │  AES-256-GCM keypairs    │            ║
║   │  MCP · HTTP · tools     │  │  E2B · Cloudflare REST   │            ║
║   └─────────────────────────┘  └──────────────────────────┘            ║
║                                                                          ║
║   ┌─────────────────────────┐  ┌──────────────────────────┐            ║
║   │  AI Inference client    │  │  percolator              │            ║
║   │  on-chain model reg.    │  │  perpetuals CLI          │            ║
║   │  inference escrow       │  │  Solana perps trading    │            ║
║   │  staking · validators   │  │  strategy management     │            ║
║   └─────────────────────────┘  └──────────────────────────┘            ║
║                                                                          ║
║   ┌──────────────────────────────────────────────────────────┐          ║
║   │  ON-CHAIN PROGRAMS                                       │          ║
║   │  clawd-protocol (Anchor) · AI Inference (Anchor)         │          ║
║   │  bonding curves · pTokens · vault · model registry       │          ║
║   └──────────────────────────────────────────────────────────┘          ║
║                                                                          ║
║   solanaclawd.com/gateway  ←→  x402.wtf/gateway  (USDC micropayments)  ║
║   solanaclawd.com/skills   ←→  x402.wtf/skills   (agent skill hub)     ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## One-Shot Test (all 10 packages)

```bash
# Run from repo root — tests every package in order
bash packages/test-all.sh
```

**Expected output (10/10):**

```
✓ clawd-sdk          (@openclawdsolana/solana-sdk)
✓ agent-registry     (@openclawdsolana/agent-registry)
✓ agentwallet        (agentwallet-vault)
✓ agent-hub          (@openclawdsolana/agent-hub)
✓ clawd-wallet       (@openclawd/wallet)
✓ agents-x402-solana (@openclawd/agents-x402, source-only)
✓ percolator         (@openclawd/percolator)
✓ cli-standalone     (@openclawdsolana/clawd-standalone)
✓ AI Inference client (@clawd/solana-ai-inference-client)
✓ Anchor .so         (solana_ai_inference.so)

──────────────────────────────────────────
  10 passed  |  0 failed
──────────────────────────────────────────
  ALL SYSTEMS GO 🦞
```

**Live curl tests against running services:**

```bash
# 1. Start agent-hub (port 3747)
clawd-hub start &
sleep 2

# 2. Health check
curl -s http://localhost:3747/api/v1/hub/status | jq .

# 3. Search on-chain agents
curl -s "http://localhost:3747/api/v1/agents?q=arbitrage" | jq '.agents[].name'

# 4. Jupiter swap quote (clawd-wallet SwapService under the hood)
curl -s "https://api.jup.ag/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50" | jq '{outAmount,priceImpactPct}'

# 5. Solana RPC — verify AI Inference program is deployed
curl -s https://api.mainnet-beta.solana.com \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT",{"encoding":"base64"}]}' \
  | jq '.result.value.executable'   # → true

# 6. x402 gateway health
curl -s https://x402.wtf/health | jq .

# 7. CAAP well-known discovery
curl -s https://solanaclawd.com/.well-known/agent-auth | jq '.caapVersion'
```

**One-liner: install + smoke-test clawd-wallet CLI**

```bash
npm i -g @openclawdsolana/clawd && \
clawd-registry list | head -5 && \
node -e "const {CLAWD_MINT_MAINNET}=require('@openclawdsolana/solana-sdk'); console.log('$CLAWD mint:', CLAWD_MINT_MAINNET)"
```

---

## Quick Install

```bash
# ── Core operator surface ─────────────────────────────────────────────────────
npm install -g @openclawdsolana/clawd@2.0.0 \
               @openclawdsolana/agent-registry@2.0.0 \
               @openclawdsolana/agent-hub@2.0.0

# ── SDK + wallet (library use) ───────────────────────────────────────────────
npm install @openclawdsolana/solana-sdk@2.0.0
npm install @openclawd/wallet

# ── x402 monetisation + perps ────────────────────────────────────────────────
npm install @openclawd/agents-x402
npm install @openclawd/percolator

# ── AI Inference client (workspace) ──────────────────────────────────────────
pnpm add @clawd/solana-ai-inference-client   # resolves workspace:*

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

## 🖥 clawd-code-cli — Terminal Operator

**Package:** `@openclawdsolana/clawd@2.0.0`  
**Install:** `npm install -g @openclawdsolana/clawd`  
**Bin:** `clawd`

```
clawd-code-cli/
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
clawd --character alice         # TUI as a persona
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

curl http://localhost:3747/api/v1/agents?q=arbitrage
curl http://localhost:3747/api/v1/hub/status
```

---

## 🛠 clawd-sdk — TypeScript SDK

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
import { CLAWD_MINT_MAINNET, AgentCapability } from "@openclawdsolana/solana-sdk";

AgentCapability.TRADING      // 0x01 — live trade execution
AgentCapability.SPAWNING     // 0x02 — can mint spawnlings
AgentCapability.PAYMENTS     // 0x04 — x402 micropayments
AgentCapability.RESEARCH     // 0x08 — web + chain research
AgentCapability.GOVERNANCE   // 0x10 — DAO voting
AgentCapability.BURN_TRIGGER // 0x20 — entropy burn triggers
```

---

## 👛 clawd-wallet — Privy + AgenticWallet + Jupiter

**Package:** `@openclawd/wallet@0.1.0`  
**Install:** `npm install @openclawd/wallet`

```
clawd-wallet/
├── ClawdWallet      Privy-embedded Solana wallet wrapper
├── AgenticWallet    AI-gated trading (deny / ask / allow)
├── SwapService      Jupiter aggregator integration
└── DEFAULT_PERMISSIONS  maxSwapUsd: $50 · transfer: "ask"
```

```typescript
import { AgenticWallet } from "@openclawd/wallet";

const agent = new AgenticWallet(wallet, {
  privyAppId: process.env.PRIVY_APP_ID!,
  grokApiKey: process.env.XAI_API_KEY,
  permissions: { swap: "allow", maxSwapUsd: 200 },
  onPendingTransaction: async (tx) => {
    console.log(tx.description);
    return userApproved;
  },
});

const result = await agent.agentSwap({
  inputToken: "SOL",
  outputToken: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  amount: "100000000",   // 0.1 SOL in lamports
  slippageBps: 50,
});
```

---

## 🔐 agentwallet — Encrypted Keypair Vault

**Package:** `agentwallet-vault@0.1.0`  
**Install:** `npm install -g agentwallet-vault`  
**Bin:** `agentwallet`

AES-256-GCM encrypted keypair vault for Solana and EVM keys. Exposes a REST API server agents can query for signing material, and deploys to E2B sandboxes or Cloudflare Workers.

```
agentwallet/
├── vault.ts      AES-256-GCM encrypted keypair store
├── server.ts     Express REST API: GET/POST /api/wallets · /api/vault
├── keygen.ts     Solana Ed25519 + EVM secp256k1 generation
├── cli.ts        serve · wallet · vault · deploy
└── deploy/
    ├── e2b.ts    Deploy vault into E2B cloud sandbox
    └── cloudflare.ts  Deploy as Cloudflare Worker
```

```bash
agentwallet serve                          # port 9099
agentwallet wallet create "trader"         # new Solana keypair
agentwallet wallet create "eth" --chain evm
agentwallet wallet list
agentwallet deploy e2b --api-key $E2B_API_KEY
```

```typescript
import { Vault, generateSolanaKeypair } from "agentwallet-vault";

const vault = await Vault.create({ passphrase: process.env.VAULT_PASSPHRASE! });
const kp    = await generateSolanaKeypair();
await vault.addWallet(undefined, "agent", "solana", 0, kp.address, kp.privateKey);
```

---

## 💸 agents-x402-solana — One-Line x402 Monetisation

**Package:** `@openclawd/agents-x402@0.1.0`  
**Install:** `npm install @openclawd/agents-x402`

One-line x402 Solana payment gating for MCP servers, HTTP handlers, and agent tool calls. Settles through the Clawd multi-tenant facilitator on Solana USDC.

```typescript
import { withX402, gateToolCall } from "@openclawd/agents-x402";

// Gate an MCP tool call — auto-charges on use
const result = await gateToolCall(toolFn, {
  price: "0.001",           // $0.001 USDC per call
  wallet: signerKeypair,
  network: "solana-mainnet",
});

// Gate an HTTP endpoint
app.use("/api/premium", withX402({ price: "0.01" }));
```

```
╔══════════════════════════════════════════════════════════╗
║  x402 Payment Flow                                       ║
║                                                          ║
║  Agent ──fetch()──▶  Paid endpoint                       ║
║                           │                              ║
║                        ◀─ 402 Payment Required           ║
║                           │                              ║
║  Agent signs USDC tx ─────┘   (handled automatically)   ║
║                           │                              ║
║  Agent ──retry + X-Payment──▶  200 OK ✅                 ║
╚══════════════════════════════════════════════════════════╝
```

---

## 📦 cli-standalone — Prebuilt CLI Binary

**Package:** `@openclawdsolana/clawd-standalone@1.3.0`  
**Install:** `npm install -g @openclawdsolana/clawd-standalone`

Zero-compile prebuilt binary of `clawd`. No TypeScript compilation on install — ideal for CI, scripts, and restricted environments where building from source is not feasible.

---

## 🌀 percolator — Perpetuals CLI

**Package:** `@openclawd/percolator@1.0.0`  
**Install:** `npm install @openclawd/percolator`

Perpetuals trading CLI for Solana — strategy management, position tracking, and order execution on Solana perp markets.

```bash
percolator status          # account + position overview
percolator market SOL      # market data for SOL-PERP
percolator buy SOL --size 100 --leverage 5x
percolator positions       # open positions
percolator close SOL       # close position
```

---

## ⚓ clawd-protocol — Anchor Program (Rust)

**Status:** 🚧 development  
**Build:** `cd clawd-protocol && anchor build`

On-chain mechanics: adaptive bonding curves, Token2022 pTokens, conviction vault, sentiment engine, and agent capability bitmask.

```
clawd-protocol/programs/clawd-protocol/
├── bonding_curve.rs   constant-product AMM + graduation gate
├── vault.rs           conviction staking · milestone locks · entropy burns
├── token.rs           Token2022 + pToken creation
└── agent.rs           capability bitmask · epoch burns
```

---

## ⚓ AI Inference — On-Chain Protocol + Client

**Package:** `@clawd/solana-ai-inference-client` (workspace)  
**Program ID:** `Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT` · Mainnet  
**Docs:** [`programs/programs/README.md`](../programs/programs/README.md)

Decentralized AI model registry, inference requests with escrow, token staking, and validator slashing — all on-chain via Anchor. Includes `OreMinerClient` for ORE v2 mining.

```
programs/programs/
├── solana-ai-inference/src/lib.rs   Anchor program — 20 instructions
└── client/src/
    ├── client.ts    SolanaAiInferenceClient — all instructions + reads
    ├── ore.ts       OreMinerClient — ORE v2 deploy/claim/stats
    ├── idl.ts       PDA seeds · account types · event interfaces
    └── config.ts    RPC endpoints · program IDs · API routes
```

```typescript
import { SolanaAiInferenceClient, createModelType, OreMinerClient } from "@clawd/solana-ai-inference-client";

// Register + run inference
const client = new SolanaAiInferenceClient(connection, wallet);
await client.initializeModel(authority, "QmCID", createModelType("textGeneration"), "https://api.example.com", BigInt(1_000_000), BigInt(0));
await client.finalizeTraining(authority, modelPda, BigInt(9_500));
await client.requestInference(requester, requesterAta, escrowAta, modelPda, "Analyse SOL sentiment", BigInt(5_000), BigInt(0));

// ORE mining stats
const ore = new OreMinerClient();
const stats = await ore.getMiningStats(walletPubkey);
console.log(`ORE: ${stats.oreBalance}, pending: ${stats.pendingOreRewards}`);
```

```bash
cd programs/programs
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
anchor build --skip-lint      # → target/deploy/solana_ai_inference.so
cd client && npm run build    # → dist/
```

---

## Dependencies Between Packages

```
@openclawdsolana/clawd
  └── depends on: agent-registry, agent-hub, leviathan runtime

@openclawdsolana/agent-hub
  └── depends on: agent-registry

@openclawdsolana/agent-registry
  └── standalone (Metaplex + better-sqlite3)

@openclawdsolana/solana-sdk
  └── standalone (Anchor IDL + math)

@openclawd/wallet
  └── standalone (Privy + Jupiter)

agentwallet-vault
  └── standalone (AES-256-GCM + Express)

@openclawd/agents-x402
  └── standalone (x402 facilitator client)

@openclawd/percolator
  └── standalone (Solana perp market client)

@clawd/solana-ai-inference-client
  └── workspace: programs/programs/client
  └── peer: @coral-xyz/anchor · @solana/web3.js
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
| ⚓ AI Inference | [programs/programs/README.md](../programs/programs/README.md) |
| 💻 GitHub | [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd) |
| 🪙 `$CLAWD` | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |

---

<div align="center">

```
╔═════════════════════════════════════════════════════════════╗
║  🦞  The shell molts. The laws do not.                      ║
║      solanaclawd.com  ·  x402.wtf  ·  $CLAWD  ·  MIT       ║
╚═════════════════════════════════════════════════════════════╝
```

*Powered by OpenClawd · [solanaclawd.com](https://solanaclawd.com)*

</div>
