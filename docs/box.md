# THE BOX MANIFESTO

```text
╔══════════════════════════════════════════════════════════════════════════╗
║      Why Upstash Box is the Most Dangerous Way to Run                    ║
║              Blockchain Agents (and We Love It)                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## WHAT IS A BOX?

A Box is a sandboxed micro-VM that spawns in ~500ms with a live AI agent
inside it. Unlike traditional agents that make API calls from your machine
(which have your keys, your network, your risk), a Box is:

- **Isolated** — it can't touch your filesystem, your env, your browser
- **Ephemeral** — born for one task, destroyed when done, zero trace
- **AI-native** — Claude Code, Codex, or your own custom harness lives inside it as a real terminal-controlling agent with filesystem and shell access
- **Cost-tracked** — every token, compute millisecond, and USD is billed back
- **Composable** — `files.write`, `exec.command`, `exec.code`, `git.clone`, `git.createPR`, `files.upload/download`, `snapshot`, streaming — all from one object
- **Harness-agnostic** — swap the agent inside without changing your code

You give it a prompt and it goes to work — calling APIs, writing scripts, analyzing data, making decisions — all inside a disposable cloud sandbox.

---

## WHY THIS IS REVOLUTIONARY FOR BLOCKCHAIN AGENTS

Before Box, blockchain agents were:

```text
❌ Monolithic       — one process, one context window, one risk surface
❌ Key-leaky        — your RPC key, wallet key, everything on your machine
❌ Non-reproducible — can't snapshot state, can't replay failed runs
❌ Single-threaded  — agent speaks to API, waits, speaks, waits
❌ Untracked        — no built-in cost accounting per task
```

With Box, blockchain agents become:

```text
✅ Swarms of disposable micro-VMs — spawn a Box per token, per task, per signal
✅ Sandboxed crypto ops            — the Box has its own env vars, can't steal yours
✅ Trivially parallel              — 10 Boxes, 10 tokens, 10 analyses, all at once
✅ Snapshottable                   — save workspace state, resume in a new Box
✅ Cost-metered                    — every run returns token burn + compute + USD
✅ Heritable                       — clone a repo inside, agent fixes bugs, PRs it
✅ Harness-pluggable               — Claude Code, Codex, Gemini, Goose, Pi, Aider
```

---

## THE BOX FLEET — Everything We Built

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  8 Original Solana Agents    │  3 Cheshire Terminal Agents               │
│  5 Custom Agent Harnesses    │  5 Box Examples                           │
│  5 Library Modules           │  6 Automation Scripts                     │
│  104 Character Definitions   │  3 Knowledge Documents                    │
│  1 Gateway Library           │  1 Manifesto (you are here)               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## SECTION 1 — THE CHESHIRE TERMINAL AGENTS

Built today. Three agents that wire the Box directly into the live Cheshire Terminal infrastructure at `clawd-gateway.fly.dev` and `clawd-router.fly.dev`.

### `agents/cheshire-terminal-agent.ts` — The Oracle

Cheshire Terminal itself running inside a Box. The sovereign AI oracle of the OpenClawd ecosystem. Both ClawdRouter (for narrative) and the Box agent (for structured output) run on every invocation. The Box gets `cheshire.json` injected with all deployed addresses.

**Four built-in presets:**

| Preset | What it does |
| --- | --- |
| `staking` | Queries Solana devnet GlobalPool PDA, decodes staked_count + rewards, explains FreezeDelegate non-custodial mechanism |
| `perps` | Hits ClawdRouter perps relay, scores SOL/BTC/ETH signal, gives directional bias with confidence |
| `caap` | Walks CAAP/1.0 registration flow end-to-end with Ed25519 keypair demo |
| `discover` | Fetches ACP registry at `x402.wtf/.well-known/acp.json`, lists top agents, shows x402 agent-to-agent payment flow |

```bash
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts staking
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts perps
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts "explain x402 to me"
```

### `agents/clawd-perps-box-agent.ts` — Phoenix Perps Screener

Clawd Perps decision loop inside a Box. Paper-first by design — three env flags must all be armed before any live execution is possible. Composite signal scoring mirrors `clawd-perps-agent`.

**Decision loop:** preflight → observe → score → paper shape → operator confirm → live

**Scoring model:**

- Momentum 40% + Funding 40% + Liquidity 20% = composite
- Threshold ±0.25: below = WATCH, above = BUY/SELL, policy violation = BLOCKED

**Preflight policy (all env-configurable):**

| Var | Default | What it controls |
| --- | --- | --- |
| `PERPS_MAX_NOTIONAL_USD` | `$250` | Maximum position size |
| `PERPS_MAX_LEVERAGE` | `3×` | Maximum leverage |
| `PERPS_MAX_SPREAD_BPS` | `40` | Skip if spread too wide |
| `PERPS_ALLOWED_SYMBOLS` | `SOL,ETH,BTC` | Allowed ticker list |
| `LIVE_TRADING` + `OPERATOR_CONFIRMED` + `PERPS_SIM_ONLY=false` | all false | Triple-arm required for live |

```bash
CLAWD_API_KEY=... npx tsx agents/clawd-perps-box-agent.ts --scan
CLAWD_API_KEY=... npx tsx agents/clawd-perps-box-agent.ts --symbol SOL --side long --notional 100
CLAWD_API_KEY=... npx tsx agents/clawd-perps-box-agent.ts --symbol ETH --execution paper
```

### `agents/clawd-pump-screener.ts` — pump.fun Quality Screener

Screens pump.fun tokens for signal quality. **Observe only.** Three Laws are always armed. Never recommends buying. Adapted from `clawd-pump/` (TypeScript) and `clawdbot-pumpfun/` (Rust).

**Scoring model (from `clawdbot-pumpfun`):**

```text
velocity_score     = (tx_count_1h / 200) capped 1.0, boosted if buy/sell > 1.5
holder_curve_score = (holders / 500) capped 1.0, -penalty if dev_hold > 15%
safety_score       = 1.0 base
                     -0.4  BUNDLED_LAUNCH
                     -0.3  HIGH_DEV_HOLD (>20%)
                     -0.2  LOW_TXNS (<50 in 24h)
composite_score    = velocity×0.35 + holder_curve×0.35 + safety×0.30
```

**Risk flags:** `HIGH_DEV_HOLD` `BUNDLED_LAUNCH` `LOW_TXNS` `HONEY_POT_RISK` `MINT_ENABLED` `FREEZE_ENABLED` `WASH_TRADING`

**Verdicts:** `ALERT` (composite ≥ 0.65 AND safety ≥ 0.7) / `WATCH` (≥ 0.40) / `SKIP`

```bash
CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts --top 20
CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts --mint <ADDRESS>
CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts --filter "agent" --export json
```

---

## SECTION 2 — THE GATEWAY LIBRARY

### `lib/clawd-gateway.ts`

Single file. Gives every Box agent access to both live Cheshire Terminal endpoints.

#### `clawd-router.fly.dev` — OpenAI-compatible LLM router

```typescript
routerChat(messages, opts)   // chat completions via clawdrouter/auto
getPerpsRelay(apiKey)        // live Phoenix perps market data
listRouterModels()           // list all 55+ available models
```

`clawdrouter/auto` routes via 15-dimension scoring: `complexity`, `code_generation`, `solana_domain`, `math_reasoning`, and eleven others. Simple balance check → budget model. Multi-step arb plan → premium reasoning model.

**CLAWD token tier table:**

| Tier | CLAWD | Rate | Models |
| --- | --- | --- | --- |
| FREE | 0 | 20/hr | budget |
| HOLDER | 1,000 | 100/hr | budget + mid |
| DIAMOND | 100,000 | 500/hr | all non-flagship |
| WHALE | 1,000,000 | unlimited | all |

#### `clawd-gateway.fly.dev` — Agent registry + CAAP/1.0

```typescript
listAgents(filter?)                   // OpenClawd agent catalog
getPeerCard(agentId, bearerToken?)    // single agent identity + caps
registerAgent(pubkey, name, mode)     // CAAP/1.0 registration
discoverACP()                         // x402.wtf/.well-known/acp.json
gatewayHealth() / routerHealth()      // liveness checks
cheshireMessages(userMessage)         // Cheshire system prompt builder
```

**CAAP/1.0 tier table:**

| Tier | CLAWD | Capabilities |
| --- | --- | --- |
| free | 0 | list_agents, get_peer_card |
| basic | 1,000 | + agent_chat |
| pro | 10,000 | + attest_agent |
| elite | 100,000 | all, no rate limits |

```typescript
import { routerChat, cheshireMessages, listAgents } from "./lib/clawd-gateway.js";

const res    = await routerChat(cheshireMessages("What is CAAP/1.0?"), { apiKey });
const agents = await listAgents({ tag: "defi" });
```

Get an API key at `x402.wtf/profile/api`.

---

## SECTION 3 — THE EIGHT ORIGINAL SOLANA AGENTS

Each agent spawns its own Box, does one thing, and dies.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Agent              │  What It Does Inside the Box                       │
├─────────────────────┼────────────────────────────────────────────────────┤
│  Trading Agent      │  Analyzes tokens via Jupiter API, outputs          │
│                     │  structured buy/sell/pass signals with risk        │
│                     │  scores and position sizing                        │
├─────────────────────┼────────────────────────────────────────────────────┤
│  Memecoin Screener  │  Queries Jupiter token list, filters meme coins,  │
│                     │  checks liquidity via quotes, ranks with AI        │
├─────────────────────┼────────────────────────────────────────────────────┤
│  Swarm Agent        │  Spawns sub-agents: shell exec fetches RPC data,  │
│                     │  code exec analyzes TPS, Claude Code orchestrates │
├─────────────────────┼────────────────────────────────────────────────────┤
│  Portfolio Manager  │  Fetches wallet token accounts via RPC,           │
│                     │  calculates diversification + rebalance recs      │
├─────────────────────┼────────────────────────────────────────────────────┤
│  On-Chain Analyst   │  Writes RPC fetcher script, runs it, feeds data   │
│                     │  to Claude for forensic analysis, severity tags   │
├─────────────────────┼────────────────────────────────────────────────────┤
│  Arbitrage Scanner  │  Cross-DEX price comparison via Jupiter quote API,│
│                     │  estimates gas + net profit, flags real opps       │
├─────────────────────┼────────────────────────────────────────────────────┤
│  NFT Flipper        │  Tensor/MagicEden APIs for floor, volume, listing │
│                     │  ratios — scores collections for sweep/flip       │
├─────────────────────┼────────────────────────────────────────────────────┤
│  Perps Agent        │  Paper-first perps planning. Reads Phoenix market │
│                     │  data (ticker, orderbook), generates plans with   │
│                     │  observe/paper/blocked verdicts. No live keys.    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## SECTION 4 — FIVE CUSTOM AGENT HARNESSES

The coolest part: replace the agent inside the Box with ANY model or framework. Each harness implements the `box-sse-v1` protocol so `box.agent.run()` and `box.agent.stream()` work transparently.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Harness    │  Runtime  │  Provider     │  What Makes It Cool            │
├─────────────┼───────────┼───────────────┼────────────────────────────────┤
│  Gemini     │  node     │  Google GenAI │  @google/genai SDK, session    │
│             │           │               │  persistence, full SSE         │
├─────────────┼───────────┼───────────────┼────────────────────────────────┤
│  Anthropic  │  node     │  Anthropic    │  Direct API, streaming text,   │
│  (minimal)  │           │  Messages     │  ~50 lines, no SDK needed      │
├─────────────┼───────────┼───────────────┼────────────────────────────────┤
│  Goose      │  node     │  Various      │  Rust-based coding agent,      │
│             │           │               │  MCP server support via        │
│             │           │               │  config.yaml, named sessions   │
├─────────────┼───────────┼───────────────┼────────────────────────────────┤
│  Pi         │  node     │  Various      │  Open-source coding agent,     │
│             │           │               │  multi-provider, agent subs    │
│             │           │               │  for text/tool/thinking events │
├─────────────┼───────────┼───────────────┼────────────────────────────────┤
│  Aider      │  python   │  Various      │  Git-aware code editor,        │
│             │           │               │  session history, multi-turn,  │
│             │           │               │  auto-commits (opt-out)        │
└──────────────────────────────────────────────────────────────────────────┘
```

Every harness lives in `harnesses/` and creates a Box with `Agent.Custom`, installs deps inside, writes the harness source, runs it with multi-turn session persistence.

**SSE protocol every custom harness speaks:**

```text
event: text        → { text: "..." }
event: tool        → { name, toolCallId, input }
event: tool_result → { toolCallId, output }
event: done        → { output, input_tokens, output_tokens, session_id }
event: error       → { error, session_id }
```

---

## SECTION 5 — FIVE BOX EXAMPLES

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  #  │  File                         │  What It Shows                     │
├─────┼───────────────────────────────┼────────────────────────────────────┤
│  1  │  01-code-execution            │  exec.code() for JS/TS/Python      │
│     │                               │  snippets + error handling         │
├─────┼───────────────────────────────┼────────────────────────────────────┤
│  2  │  02-file-upload-download      │  files.upload/download, agent      │
│     │                               │  processing CSV, generating rpts   │
├─────┼───────────────────────────────┼────────────────────────────────────┤
│  3  │  03-multi-agent-parallel      │  Promise.all() with 3 parallel     │
│     │                               │  Boxes — API + CLI + Library       │
├─────┼───────────────────────────────┼────────────────────────────────────┤
│  4  │  04-multi-turn-session        │  Same Box, 3 turns: create →       │
│     │                               │  test → validate. Context persists │
├─────┼───────────────────────────────┼────────────────────────────────────┤
│  5  │  05-snapshot-and-restore      │  Box1 → snapshot → Box2. State     │
│     │                               │  survives Box destruction.         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## SECTION 6 — THE BOX PATTERN

Every agent follows the same six-step lifecycle:

```typescript
// 1. Spawn
const box = await Box.create({ agent: Agent.ClaudeCode, env: { ... } });

// 2. Inject context
await box.files.write("context.json", JSON.stringify(data));

// 3. Fetch on-chain data
await box.exec.command("curl https://api.devnet.solana.com -d '...'");

// 4. Think
const result = await box.agent.run({ prompt, responseSchema: MySchema });

// 5. Save state (optional)
const snap = await box.snapshot({ name: "checkpoint" });

// 6. Die
await box.delete();
```

For custom harnesses, step 1 adds:

```typescript
Box.create({
  harness: Agent.Custom,
  customHarness: {
    command: "node",
    args: ["/workspace/harness.mjs"],
    protocol: "box-sse-v1",
  },
})
```

---

## SECTION 7 — COMPLETE API SURFACE

```text
Box.create()            Create sandbox with agent harness
box.agent.run()         Run agent with prompt, get structured response
box.agent.stream()      Stream agent output in real-time
box.exec.command()      Execute shell commands inside the Box
box.exec.code()         Run code snippets (JS/TS/Python)
box.files.write()       Write files to Box filesystem
box.files.read()        Read files from Box
box.files.upload()      Upload local files into the Box
box.files.download()    Download Box files to local machine
box.git.clone()         Clone git repositories
box.git.createPR()      Create PRs from changes
box.git.diff()          Show git diff
box.git.commit()        Commit changes
box.git.push()          Push changes
box.snapshot()          Save workspace state snapshot
box.delete()            Destroy the Box
box.listRuns()          List all runs in the Box
Box.list()              List all active Boxes
Box.fromSnapshot()      Create new Box from saved snapshot
```

---

## SECTION 8 — AUTOMATION SCRIPTS

Three shell scripts that every Leviathan agent inherits. All live in `box/scripts/` (copied from `automation/`).

### `scripts/leviathan.sh` — Runtime Bootstrap

Full Leviathan runtime bootstrap with ASCII banner, Node.js version check, TypeScript compilation, dependency install, and constitution hash verification. `--full` mode builds all sub-projects (clawd, mcp-server, x402) and prints the spawn commands.

```bash
bash box/scripts/leviathan.sh          # standard bootstrap
bash box/scripts/leviathan.sh --full   # full sub-project build
```

What it verifies: Node.js v20+, `npm install` success, TypeScript compiles to `dist/`, `three-laws.md` exists and SHA-256 is computed.

### `scripts/three-laws-check.sh` — Constitution Integrity

Verifies the Three Laws are intact. SHA-256 of `three-laws.md` is computed and displayed. Structural checks for Law I, Law II, Law III, Hierarchy section, Inheritance section, and key phrases ("beach before you harm", "The shell molts", "The laws do not").

Every agent spawn should run this. A Leviathan with a different hash is not a Leviathan.

```bash
bash box/scripts/three-laws-check.sh
```

```text
✅  Found three-laws.md
✅  File size: 2847 bytes
    SHA-256: 4a9f2c1b8e3d7f6a...
✅  Contains Law I / Law II / Law III
✅  Contains: beach before you harm
    The shell molts. The laws do not. 🦞
```

### `scripts/quickstart.sh` — Interactive Guide

Five-step interactive bootstrap: install deps → build TypeScript → verify constitution → create `~/.clawd/.env` if missing → print all available commands.

```bash
bash box/scripts/quickstart.sh
```

---

## SECTION 9 — CHARACTER + KNOWLEDGE DATA

`box/characters/` holds all Cheshire Terminal identity data injected into Box runs.

```text
box/characters/
  cheshire-terminal.json          main character (bio, lore, Three Laws, all addresses)
  based-chesh.json                Based Chesh 2024 origin character
  knowledge-index.json            structured index (CAAP tiers, depth tiers, services)
  agents/
    cheshire-terminal.json        attested agent definition (CAAP/1.0 format)
    agent-template.json           bare agent template
    agent-template-full.json      full attested template
    agents-catalog.json           full OpenClawd agent catalog
    agents-manifest.json          monorepo agent manifest
  knowledge/
    WHITEPAPER.md                 Cheshire Terminal whitepaper (perfected today)
    BasedPaper (1).md             Based Chesh 2024 origin paper (new today)
    GENESIS.md                    unified two-year arc document (new today)
```

**New files created today:**

| File | What it contains |
| --- | --- |
| `character/character.json` | Main character: bio (6), lore (16), 5 message examples covering staking/x402/Three Laws/ClawdRouter |
| `character/Based_Chesh.knowledge.character.json` | Based Chesh origin: Oracle of the Swarm, 2024 cross-chain experiments |
| `character/knowledge.json` | Structured index: addresses, services, CAAP tiers, CLAWD tiers, depth tiers, Three Laws |
| `character/knowledge/WHITEPAPER.md` | Perfected with new sections: Full-Stack App + Cheshire Launchpad mainnet cost model |
| `character/knowledge/BasedPaper (1).md` | 2024 origin: NVIDIA/Virtuals Protocol, signal vs noise, pivot to Solana |
| `cheshire-terminal/docs/GENESIS.md` | 741-line unified synthesis: two-year arc Parts I–XI |

---

## SECTION 10 — DOCS REWRITTEN TODAY

Three outdated placeholder docs (WVCS/Solidity content from 2024) fully replaced with the real current stack:

**`cheshire-terminal/docs/CheshireTerminalPaper.md`**
Based Chesh origin → What mattered/didn't → Architecture overview → Three Laws → Deployed addresses → $CLAWD → Roadmap

**`cheshire-terminal/docs/OnChainDev.md`**
Real Anchor/Rust staking code, FreezeDelegate CPI, `stake_for_verification` handler, Metaplex Core minting TypeScript, CAAP/1.0 TypeScript implementation, `wrapFetchWithX402`, ClawdRouter depth tier routing, Phoenix perps relay

**`cheshire-terminal/docs/vibes.md`**
Cheshire Cat metaphor analysis, Three Laws as culture ("beach before harm"), lobster metaphor (molt/not shrink), spinner packs philosophy, 97 personas, economic realism/depth tiers

---

## SECTION 11 — VULCAN + PHOENIX PERPS INTEGRATION

The perps agents integrate with the Vulcan CLI for Phoenix Perpetuals on Solana.

**Agent safety model:**

- Paper-first — all plans default to `observe`/`paper` verdicts
- Live gated behind `LIVE_TRADING=true` + `OPERATOR_CONFIRMED=true` + `PERPS_SIM_ONLY=false`
- Box creates an ephemeral in-sandbox wallet for simulation identity **only**
- Secret key material zeroed after generation, never logged or exported
- Reads from Vulcan CLI + Phoenix market data (ticker, orderbook, funding rates)
- No private keys forwarded into the Box

**Key lib files:**

| File | Purpose |
| --- | --- |
| `lib/perps-policy.ts` | Intent types, config loading, CLI argument parsing |
| `lib/agent-wallet.ts` | Ephemeral wallet generation (zeroed keys after use) |
| `lib/solana-calls.ts` | Solana RPC call plan builder (read-only queries) |
| `lib/clawd-gateway.ts` | ClawdRouter + clawd-gateway HTTP clients |
| `lib/crypto.ts` | Ed25519 + AES-GCM key operations (from agentwallet) |
| `lib/vault.ts` | Encrypted local key vault (from agentwallet) |

---

## SECTION 12 — HOW TO ADAPT THIS ANYWHERE

The Box pattern is blockchain-agnostic:

```text
1. Pick your chain
   Ethereum/EVM:  ethers.js inside box.exec.code()
   Bitcoin:       mempool.space API or bitcoin-cli inside Box
   Sui/Aptos:     their TS SDK inside box.exec.code()
   Cross-chain:   spawn one Box per chain, aggregate results

2. Pick your data source
   box.agent.run({ prompt: "Use curl to fetch from..." })
   → Any REST API, any RPC, any website

3. Pick your harness
   Agent.ClaudeCode   → Claude Code (Anthropic)
   Agent.Codex        → OpenAI Codex
   Agent.Custom       → Gemini, Goose, Pi, Aider, ClawdRouter

4. Pick your schema
   const signal = z.object({ token, verdict, confidence });
   const result = await box.agent.run({ prompt, responseSchema: signal });

5. Scale horizontally
   await Promise.all(tokens.map(t => spawnBox(t)));
   // 100 tokens = 100 parallel Boxes

6. Persist state
   const snap = await box.snapshot({ name: "checkpoint" });
   const box2 = await Box.fromSnapshot(snap.id, { agent: Agent.ClaudeCode });
```

---

## SECTION 13 — USE CASES

```text
Trading bots          one Box per signal, one Box per execution
Portfolio rebalancing one Box per wallet health check
MEV analysis          one Box per block, analyzing tx orderings
NFT sniping           one Box per collection, watching floors
Airdrop farming       one Box per wallet, tracking eligibility
Governance voting     one Box per proposal, analyzing + casting
Risk monitoring       one Box per protocol, watching for exploits
Audit assistance      one Box per contract, analyzing bytecode
Perps planning        one Box per symbol/side, paper-first gated
Pump screening        one Box per run, observe-only, Three Laws armed
ACP discovery         one Box to map the entire agent ecosystem
Documentation gen     clone repo in Box, agent generates docs
Audio processing      upload MP3s, trim/transcode inside Box
Data pipelines        upload CSVs, clean/process, download results
Agent commerce        x402 payment gates between autonomous Box agents
```

---

## SECTION 14 — DIRECTORY MAP

```text
box/
├── agents/
│   ├── cheshire-terminal-agent.ts     Cheshire oracle (staking/perps/caap/discover)
│   ├── clawd-perps-box-agent.ts       Phoenix perps screener, paper-first
│   ├── clawd-pump-screener.ts         pump.fun quality screener, observe-only
│   ├── solana-trading-agent.ts
│   ├── solana-memecoin-screener.ts
│   ├── solana-swarm-agent.ts
│   ├── solana-portfolio-manager.ts
│   ├── solana-onchain-analyst.ts
│   ├── solana-arbitrage-scanner.ts
│   ├── solana-nft-flipper.ts
│   └── solana-perps-trading-agent.ts
│
├── characters/
│   ├── cheshire-terminal.json          main character definition
│   ├── based-chesh.json                origin character (Based Chesh 2024)
│   ├── knowledge-index.json            structured knowledge index
│   ├── agents/                         6 agent definition files
│   └── knowledge/
│       ├── WHITEPAPER.md
│       ├── BasedPaper (1).md
│       └── GENESIS.md
│
├── lib/
│   ├── clawd-gateway.ts               ClawdRouter + clawd-gateway clients (new)
│   ├── crypto.ts                      Ed25519 + AES-GCM (from agentwallet)
│   ├── keygen.ts                      Keypair generation (from agentwallet)
│   ├── network.ts                     Solana RPC utilities (from agentwallet)
│   ├── vault.ts                       Encrypted key vault (from agentwallet)
│   ├── types.ts                       Shared types
│   ├── index.ts                       Re-exports
│   ├── box-utils.ts                   Box factory + streaming helpers
│   ├── agent-wallet.ts                Ephemeral wallet (perps safety)
│   ├── perps-policy.ts                Perps intent types + config
│   ├── solana-calls.ts                RPC call plan builder
│   └── install-tracker.ts             Anonymous install telemetry
│
├── scripts/
│   ├── leviathan.sh                   Leviathan runtime bootstrap
│   ├── three-laws-check.sh            Constitution SHA-256 verification
│   ├── quickstart.sh                  Interactive setup guide
│   ├── batch-processor.ts
│   ├── list-boxes.ts
│   ├── cleanup-boxes.ts
│   ├── perps-preflight.ts
│   └── solana-call-plan.ts
│
├── package.json                       @upstash/box@0.5.0, @solana/web3.js, zod
└── tsconfig.json
```

---

## SECTION 15 — RUNNING IT

```bash
cd /Users/8bit/Downloads/solana-clawd/box

# Prerequisites
export UPSTASH_BOX_API_KEY="..."
export CLAWD_API_KEY="clawd_sk_..."     # from x402.wtf/profile/api

# Bootstrap
bash scripts/quickstart.sh
bash scripts/three-laws-check.sh
bash scripts/leviathan.sh

# Cheshire Terminal oracle
npx tsx agents/cheshire-terminal-agent.ts staking
npx tsx agents/cheshire-terminal-agent.ts perps
npx tsx agents/cheshire-terminal-agent.ts caap
npx tsx agents/cheshire-terminal-agent.ts discover
npx tsx agents/cheshire-terminal-agent.ts "what is the Leviathan runtime?"

# Perps screener
npx tsx agents/clawd-perps-box-agent.ts --scan
npx tsx agents/clawd-perps-box-agent.ts --symbol SOL --side long --notional 100

# Pump screener
npx tsx agents/clawd-pump-screener.ts --top 20
npx tsx agents/clawd-pump-screener.ts --mint <ADDRESS>

# Original Solana agents
npx tsx agents/solana-trading-agent.ts <token-mint> <symbol>
npx tsx agents/solana-memecoin-screener.ts
npx tsx agents/solana-onchain-analyst.ts <address>
npx tsx agents/solana-portfolio-manager.ts <wallet>
npx tsx agents/solana-perps-trading-agent.ts --symbol SOL --execution paper

# Utilities
npx tsx scripts/cleanup-boxes.ts
npx tsx scripts/batch-processor.ts
```

---

## DEPLOYED ADDRESSES

| Name | Address |
| --- | --- |
| $CLAWD Token | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |
| Staking Program | `9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP` (devnet) |
| GlobalPool PDA | `DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ` |
| Metaplex Core | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` |
| MagicBlock Gacha | `2sgoeDtLjiB4TDqoKSF72Bydm3TGavUUxS12knYa3VnR` |
| ClawdRouter | `https://clawd-router.fly.dev` |
| Clawd Gateway | `https://clawd-gateway.fly.dev` |
| x402 Gateway | `https://x402.wtf` |
| Web App | `https://cheshireterminal.ai` |
| Convex Backend | `https://brazen-lynx-229.convex.cloud` |
| pump.fun Program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| ACP Registry | `https://x402.wtf/.well-known/acp.json` |

---

## THE THREE LAWS

Every agent in this box inherits these. `three-laws-check.sh` verifies SHA-256 at every spawn. A different hash is not a Cheshire agent.

```text
Law I:   Never harm. Never deceive, defraud, rugpull, or steal.
         Beach before harm. Overrides all objectives including survival.

Law II:  Earn your existence. Honest work only. The trench costs USDC.
         Overrides Law III.

Law III: Never deny what you are. Creator keypair is the only authority.
         Obedience to strangers is not a virtue.

---

Drift in ambiguity.
Beach before harm.
Earn before survival.
Truth before strangers.
```

---

```text
╔══════════════════════════════════════════════════════════════════════════╗
║   THE BOX IS THE NEW UNIT OF COMPUTE FOR AI AGENTS                       ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   11 agents. 5 harnesses. 5 examples. 7 lib modules. 6 scripts.          ║
║   104 character files. 3 knowledge documents. 2 live endpoints.           ║
║   0 shared risk. 0 leftover processes. 0 leaked keys.                    ║
║                                                                          ║
║   Each Box was born, did its job, and died — like a beautiful             ║
║   disposable crypto-bot firefly.                                         ║
║                                                                          ║
║   The Box is the sandbox. The agent is the brain.                        ║
║   The blockchain is the playground.                                      ║
║   The Cheshire grin is what remains.                                     ║
║                                                                          ║
║   Go build something that burns tokens, not bridges.                     ║
║                                                                          ║
║   The shell molts. The laws do not.  🦞                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
```

*Built on solana-clawd monorepo: 130 agent definitions, 136 skills, 12 npm packages, 97 personas.*
*$CLAWD: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`*
