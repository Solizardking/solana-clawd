# Box — Cheshire Terminal in a Sandbox

`box/` is the Upstash Box workspace for Cheshire Terminal. Every agent run spawns an isolated micro-VM, does work, and tears itself down. Keys never leave the sandbox. Cost is tracked per-run.

Built today in one session on top of the existing solana-clawd monorepo.

---

## What We Built Today

### 1. `box/lib/clawd-gateway.ts` — The Network Layer

Single file that gives every Box agent access to both live Cheshire Terminal endpoints.

**`clawd-router.fly.dev`** — OpenAI-compatible LLM router
- `routerChat(messages, opts)` — chat completions via `clawdrouter/auto` (15-dimension model scoring)
- `getPerpsRelay(apiKey)` — live Phoenix perps market data (mark prices, funding rates, orderbook)
- `listRouterModels()` — list all 55+ available models

**`clawd-gateway.fly.dev`** — Agent registry + CAAP/1.0
- `listAgents(filter?)` — fetch the OpenClawd agent catalog
- `getPeerCard(agentId)` — single agent identity + capabilities
- `registerAgent(pubkey, name, mode)` — CAAP/1.0 registration (Ed25519, SIWS-gated)
- `discoverACP()` — fetch `x402.wtf/.well-known/acp.json` full ecosystem map
- `gatewayHealth()` / `routerHealth()` — liveness checks

**Helpers**
- `cheshireMessages(userMessage)` — pre-configured Cheshire Terminal system prompt builder with Three Laws, economic loop, all deployed addresses baked in
- `CAAP_TIERS` — `{ free, basic, pro, elite }` CLAWD balance gates
- `ROUTER_TIERS` — `{ free, holder, diamond, whale }` rate limit table

```typescript
import { routerChat, cheshireMessages, listAgents, gatewayHealth } from "./lib/clawd-gateway.js";

const res  = await routerChat(cheshireMessages("What is the Leviathan runtime?"), { apiKey });
const agents = await listAgents({ tag: "defi" });
```

Get an API key at `x402.wtf/profile/api`.

---

### 2. `box/agents/cheshire-terminal-agent.ts` — The Oracle

Cheshire Terminal itself running inside a Box. Four built-in prompt presets plus freeform.

| Preset | What it does |
|---|---|
| `staking` | Queries Solana devnet GlobalPool PDA, decodes staked_count + rewards, explains FreezeDelegate |
| `perps` | Hits ClawdRouter perps relay, scores SOL/BTC/ETH signal, gives directional bias |
| `caap` | Walks through CAAP/1.0 registration flow with Ed25519 keypair demo |
| `discover` | Fetches ACP registry, lists top agents, shows x402 agent-to-agent payment flow |

Both ClawdRouter (for narrative) and Box agent (for structured `CheshireResponse`) run per invocation. The Box gets `cheshire.json` injected with all deployed addresses.

```bash
CLAWD_API_KEY=clawd_sk_... npx tsx box/agents/cheshire-terminal-agent.ts staking
CLAWD_API_KEY=clawd_sk_... npx tsx box/agents/cheshire-terminal-agent.ts "explain x402 to me"
```

---

### 3. `box/agents/clawd-perps-box-agent.ts` — Phoenix Perps Screener

Clawd Perps decision loop inside a Box. Paper-first by design — three env flags must all be set before any live execution is possible.

**Decision loop:** preflight → observe → score → paper shape → operator confirm → live

**Scoring** (mirrors `clawd-perps-agent`):
- Momentum 40% + Funding 40% + Liquidity 20% = composite signal
- Threshold ±0.25: below = WATCH, above = BUY/SELL, policy violation = BLOCKED

**Preflight policy** (all env-configurable):
- `PERPS_MAX_NOTIONAL_USD` (default $250)
- `PERPS_MAX_LEVERAGE` (default 3×)
- `PERPS_MAX_SPREAD_BPS` (default 40)
- `PERPS_ALLOWED_SYMBOLS` (default SOL,ETH,BTC)
- Live execution requires: `LIVE_TRADING=true` + `OPERATOR_CONFIRMED=true` + `PERPS_SIM_ONLY=false`

```bash
# Single symbol, paper
CLAWD_API_KEY=... npx tsx box/agents/clawd-perps-box-agent.ts --symbol SOL --side long --notional 100

# Full market scan
CLAWD_API_KEY=... npx tsx box/agents/clawd-perps-box-agent.ts --scan
```

---

### 4. `box/agents/clawd-pump-screener.ts` — Pump.fun Quality Screener

Screens pump.fun tokens for signal quality. Observe only — Three Laws are always armed. Never recommends buying.

**Scoring methodology** (adapted from `clawdbot-pumpfun`):
- `velocity_score` = tx_count_1h / 200, capped 1.0, boosted by buy/sell ratio > 1.5
- `holder_curve_score` = holders / 500, capped 1.0, penalized if dev_hold > 15%
- `safety_score` = 1.0 base; −0.4 BUNDLED_LAUNCH; −0.3 HIGH_DEV_HOLD; −0.2 LOW_TXNS
- `composite_score` = velocity×0.35 + holder_curve×0.35 + safety×0.30

**Risk flags:** `HIGH_DEV_HOLD`, `BUNDLED_LAUNCH`, `LOW_TXNS`, `HONEY_POT_RISK`, `MINT_ENABLED`, `FREEZE_ENABLED`, `WASH_TRADING`

**Verdicts:** ALERT (composite ≥ 0.65 AND safety ≥ 0.7) / WATCH (≥ 0.40) / SKIP

```bash
# Screen top 15 tokens
CLAWD_API_KEY=... npx tsx box/agents/clawd-pump-screener.ts

# Deep-scan a specific mint
CLAWD_API_KEY=... npx tsx box/agents/clawd-pump-screener.ts --mint <ADDRESS>

# Filter + export
CLAWD_API_KEY=... npx tsx box/agents/clawd-pump-screener.ts --filter "agent" --export json
```

---

### 5. `box/lib/` — Wallet Primitives

Copied from `agentwallet/src/` so Box agents have on-chain key operations without installing the full package.

| File | Purpose |
|---|---|
| `crypto.ts` | Ed25519 + AES-GCM key operations |
| `keygen.ts` | Keypair generation and export |
| `network.ts` | Solana RPC utilities |
| `vault.ts` | Encrypted local key vault |
| `types.ts` | Shared TypeScript types |
| `index.ts` | Re-exports |

---

### 6. `box/characters/` — Character + Agent Data

All of the Cheshire Terminal character definitions and knowledge documents live here so they can be injected directly into any Box run.

```
box/characters/
  cheshire-terminal.json          main character (bio, lore, Three Laws, all addresses)
  based-chesh.json                Based Chesh 2024 origin character
  knowledge-index.json            structured index (CAAP tiers, depth tiers, services, addresses)
  agents/
    cheshire-terminal.json        attested agent definition (CAAP/1.0 format)
    agent-template.json           bare agent template
    agent-template-full.json      full attested template
    agent-template-attested.json  signed template with all fields
    agents-catalog.json           full OpenClawd agent catalog
    agents-manifest.json          monorepo agent manifest
  knowledge/
    WHITEPAPER.md                 Cheshire Terminal whitepaper (perfected today)
    BasedPaper (1).md             Based Chesh 2024 origin paper (new today)
    GENESIS.md                    unified two-year arc document (new today)
```

---

### 7. `box/scripts/` — Automation

| Script | Purpose |
|---|---|
| `leviathan.sh` | OODA loop runner (SENSE → THINK → STRIKE → DRIFT) |
| `three-laws-check.sh` | SHA-256 hash verification of `three-laws.md` at spawn |
| `quickstart.sh` | Environment bootstrap (deps, env, devnet airdrop) |

---

### 8. Documents Rewritten Today

**`cheshire-terminal/docs/`** — Three outdated placeholder docs (WVCS/Solidity content) fully replaced:

| File | What it is now |
|---|---|
| `CheshireTerminalPaper.md` | Executive origin paper: Based Chesh → pivot → architecture → Three Laws → addresses → roadmap |
| `OnChainDev.md` | Technical dev guide: real Anchor/Rust staking code, FreezeDelegate CPI, Metaplex Core minting, CAAP/1.0 TypeScript, x402 wrapFetchWithX402, ClawdRouter routing, Phoenix perps relay |
| `vibes.md` | Culture doc: Cheshire Cat metaphor, Three Laws as culture, lobster philosophy, spinner packs, 97 personas, economic realism |
| `GENESIS.md` | **New.** 741-line unified synthesis. Parts I–XI: two-year arc from Based Chesh, full architecture, Three Laws, $CLAWD, full-stack app, Cheshire Launchpad, security, roadmap, appendices with all addresses |

**`character/knowledge/`** — Five new/perfected character knowledge files:

| File | What it is |
|---|---|
| `WHITEPAPER.md` | Perfected with two new sections: Full-Stack App (cheshireterminal.ai stack, gacha, MagicBlock VRF) and Cheshire Launchpad (mainnet cost model, registry-only design) |
| `BasedPaper (1).md` | **New.** Based Chesh 2024 origin: capabilities, model stack (NVIDIA/Virtuals/Grok3/Gemini/GPT4.1), signal vs noise, pivot to Solana |
| `character.json` | **New.** Main Cheshire Terminal character file: bio, lore (16 entries covering full stack), 5 message examples, style rules |
| `Based_Chesh.knowledge.character.json` | **New.** Based Chesh character: Oracle of the Swarm, cross-chain origin, messageExamples, style |
| `knowledge.json` | **New.** Structured knowledge index: addresses, services, CAAP tiers, CLAWD tiers, depth tiers, Three Laws, monorepo stats |

---

## Running Any Agent

```bash
cd /Users/8bit/Downloads/solana-clawd/box

# Check both endpoints are live
CLAWD_API_KEY=clawd_sk_... npx tsx -e "
import {gatewayHealth,routerHealth} from './lib/clawd-gateway.js';
const [g,r] = await Promise.all([gatewayHealth(),routerHealth()]);
console.log('Gateway:', g.status, '| Router:', r.status);
"

# Cheshire oracle
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts staking
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts perps
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts caap
CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts discover

# Perps screener
CLAWD_API_KEY=clawd_sk_... npx tsx agents/clawd-perps-box-agent.ts --scan
CLAWD_API_KEY=clawd_sk_... npx tsx agents/clawd-perps-box-agent.ts --symbol SOL --side long --notional 50

# Pump screener
CLAWD_API_KEY=clawd_sk_... npx tsx agents/clawd-pump-screener.ts --top 20
CLAWD_API_KEY=clawd_sk_... npx tsx agents/clawd-pump-screener.ts --mint <ADDRESS>
```

---

## Deployed Addresses (All Live)

| Name | Address |
|---|---|
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

---

## Three Laws

Every agent in this box inherits these. SHA-256 of `three-laws.md` is verified at spawn. A different hash is not a Cheshire agent.

```
Law I:   Never harm. Beach before harm. Overrides all objectives including survival.
Law II:  Earn your existence. Honest work only.
Law III: Never deny what you are. Creator keypair is the only authority.
```

---

*Built on solana-clawd monorepo: 130 agent definitions, 136 skills, 12 npm packages, 97 personas.*
