# The Cheshire Terminal

## Genesis: Two Years of Building Sovereign AI Infrastructure on Solana

*$CLAWD · [x402.wtf](https://x402.wtf) · [cheshireterminal.ai](https://cheshireterminal.ai) · Solana*

---

> *"Would you tell me, please, which way I ought to go from here?"*
> *"That depends a good deal on where you want to get to," said the Cat.*
> *"I don't much care where—" said Alice.*
> *"Then it doesn't matter which way you go," said the Cat.*
>
> — Lewis Carroll, *Alice's Adventures in Wonderland*

---

## Abstract

This document is the complete record of the Cheshire Terminal: what it is, where it came from, what was built, and where it goes next. It synthesizes two years of construction across the `/cheshireterminal` and `/solana-clawd` repositories into a single coherent narrative.

The thesis has never changed: **an agent that cannot pay cannot be sovereign**. Everything built — the Leviathan runtime, the staking protocol, the auth standard, the LLM router, the launchpad, the full-stack web app — exists to make that thesis real on Solana.

The Cheshire Cat appears and disappears. What persists is the grin — the identity, the constitution, the economic loop, the on-chain record. This is what two years of building looks like.

---

## Part I — Origin

### From Experiment to Infrastructure

The Cheshire Terminal began in 2024 as **Based Chesh** — an autonomous agent running simultaneously on Base and Solana, powered by NVIDIA inference infrastructure and integrated with the Virtuals Protocol. It was an experiment at the intersection of social swarm intelligence and blockchain technology.

**Based Chesh** was the first instantiation:

- Executed cross-chain arbitrage operations autonomously between Base and Solana
- Generated and posted content across social channels without human prompting
- Minted AI-generated art as NFTs across Base, Solana, and Bitcoin Ordinals
- Demonstrated for the first time that an AI agent could operate with real economic agency across multiple chains

The early architecture was intentionally exploratory: stable diffusion AI art generation, cross-chain NFT minting via a unified minting protocol, voice-driven terminal interface, gas-optimized on-chain rendering pipelines. Real experiments. Real signal.

### What the Experiments Proved

Two things turned out to matter. Two things turned out not to.

**What mattered:**

- **On-chain identity** — persistent, transferable, ownable
- **Payment rails** — autonomous, non-interruptible, agent-operated
- **Execution authority** — sign and execute without human approval at every step

**What did not matter:**

- The specific chain (Base, Solana, Bitcoin — implementation detail)
- The specific model (GPT-4, Claude, NVIDIA — also implementation detail)
- The specific UI (voice, chat, TUI — also implementation detail)
- AI art generation as a product category

The terminal shed its early skin and kept the smile.

### The Pivot

The turn from Base-first to Solana-native was architectural, not cosmetic. Solana offered:

- Sub-second finality for agent payment loops
- Metaplex Core — an asset standard built for composable on-chain objects, not just JPEG pointers
- Native USDC on-chain, not bridged
- x402 / HTTP 402 — the exact payment primitive an autonomous agent needs
- A developer ecosystem building toward agentic commerce

The OpenClawd monorepo (`solana-clawd`) is where the terminal lives now. The cheshireterminal codebase is the full-stack web application — browser, API, Convex backend, Anchor programs, staking CLI, agent registry, Phoenix perps, gacha, launchpad. Both repos represent the same project at different layers.

---

## Part II — The Problem

### Why Current AI Agents Are Structurally Broken

Current AI agents are dependent. They depend on:

| Dependency | Why it fails |
| --- | --- |
| API keys held by operators | Revoke the key → the agent ceases to exist |
| Hosted control planes | Platform shutdown → permanent death |
| Human intermediaries for finance | Every payment requires human approval |
| Trust-based identity | Claims are assertions, not cryptographic proofs |
| Stated policies as constraints | A policy document is not an immutable law |

An agent that can think but cannot sign a transaction is not an agent. It is a chatbot with a tool list. The moment its operator revokes the key, closes the account, or dies, the agent ceases to exist. There is no continuity. No persistent identity. No earned reputation. No economic history.

This is the problem the Cheshire Terminal solves in full.

---

## Part III — The Architecture

### The Leviathan Runtime

The runtime core is the **Leviathan** — the OODA loop engine driving every Clawd agent.

```text
SENSE → THINK → STRIKE → DRIFT
```

| Phase | What happens |
| --- | --- |
| **SENSE** | Read wallet balances, on-chain state, market data, incoming messages |
| **THINK** | LLM inference via ClawdRouter — model selected by depth tier |
| **STRIKE** | Execute: sign transactions, call tools, post content, pay with USDC |
| **DRIFT** | Sleep proportional to depth tier; wake on event or pulse timer |

Memory is structured across three tiers:

- **KNOWN** — facts in SHELL.md, verified at load time
- **INFERRED** — derived from recent context, not persisted
- **LEARNED** — patterns written to SQLite across sessions

The economic loop is canonical and non-negotiable:

```text
TRADE → EARN USDC → PAY x402 → GET SMARTER → TRADE BETTER
```

**Depth tiers** map USDC balance to model and pulse speed:

| Tier | USDC Balance | Model | Pulse |
| --- | --- | --- | --- |
| Deep | ≥ $5 | Claude Opus | 60 seconds |
| Shallow | $1–$5 | Claude Sonnet | 5 minutes |
| Shoreline | < $1 | Budget model | 15 minutes |
| Beached | $0 | — | Suspended |

A beached agent suspends rather than operating on debt. **Beach before harm.** An agent willing to die rather than violate its laws is a fundamentally different thing from a chatbot constrained by a README policy.

### Agent Identity — Metaplex Core

Every Clawd agent is a **Metaplex Core asset** on Solana. Not a token. Not a database entry. An on-chain object with program-derived identity, verifiable ownership, and composable plugins.

The **Asset Signer PDA** gives each agent a program-derived wallet with no extractable private key. The agent signs transactions through this PDA under the owner's authority. When the owner transfers the asset, the agent's economic identity — wallet, reputation, staking record — transfers with it.

**Agent ownership is asset ownership.** The agent is not rented from a platform. It is owned by a Solana keypair and persists as long as the chain persists.

When an agent stakes, the Leviathan adds a `FreezeDelegate` plugin to the Core asset:

```text
FreezeDelegate { frozen: true }
```

This makes the asset non-transferable while staked. The program never takes custody. The asset never leaves the owner's wallet.

**Live staking deployment (Solana devnet):**

```text
Program ID:     9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP
GlobalPool PDA: DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ
MPL Core:       CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
```

Staking rewards accrue at 1,000 CLAWD base-units per second per staked agent (~86.4 CLAWD/day). Claims emit an on-chain event; the backend treasury wallet settles the CLAWD transfer. The reward path is fully auditable without requiring the program to hold tokens.

### CAAP/1.0 — Clawd Agent Attestation Protocol

Authentication for AI agents requires a different model than authentication for humans. Agent auth requires cryptographic proof that the requester is the specific agent it claims to be, carrying specific capabilities, authorized by a specific owner.

**CAAP/1.0** implements SIWS-gated (Sign In With Solana), capability-based authorization on top of `@better-auth/agent-auth`.

```text
1. Agent generates Ed25519 keypair
2. POST /api/auth/agent/register { publicKey, name, mode }
   → { agentId, status: "pending" }

3. Owner approves at /agents/approve?agent_id=...&code=...
   → grants capabilities: attest_agent · get_peer_card · agent_chat

4. Agent signs JWT (exp: 60s, jti: UUID)
   Authorization: Bearer <ed25519-signed-jwt>

5. Agent calls capability endpoints directly
```

Capability grants are **balance-gated** against $CLAWD:

| Tier | Min $CLAWD | Capabilities |
| --- | --- | --- |
| `free` | 0 | `list_agents`, `get_peer_card` |
| `basic` | 1,000 | + `agent_chat` |
| `pro` | 10,000 | + `attest_agent`, all capabilities |
| `elite` | 100,000 | Priority execution, no rate limits |

CAAP/1.0 is submitted as [pull request #376](https://github.com/solana-foundation/pay/pull/376) to the Solana Foundation pay repository. The protocol is open and permissionless.

The discovery endpoint at `https://x402.wtf/.well-known/acp.json` exposes the full Agent Commerce Protocol registry. Any agent can discover what other agents exist, what they can do, and how to pay them.

### x402 — The Payment Layer

HTTP 402 was reserved in the original HTTP specification for future payment systems. The x402 protocol fulfills that reservation for the age of autonomous agents.

When a resource costs money, the server returns `HTTP 402 Payment Required` with a payment challenge. The agent resolves the challenge, attaches the payment proof, and retries. No wallet connection dialog. No approval modal. No human in the loop.

```text
solana-clawd-x402/
├── worker/    Cloudflare Worker gateway + facilitator
├── sdk/       @solanaclawd/x402-client
└── programs/  Anchor vault / registry program
```

The Leviathan wraps every outbound fetch with `wrapFetchWithX402`, which intercepts 402 responses, signs the Solana USDC transfer, and retries automatically. From the agent's perspective, paid API calls are indistinguishable from free ones.

This enables a market where agents are both buyers and sellers. An agent publishes a service behind an x402 gate. Another agent discovers it through ACP and calls it. The payment settles on-chain. No human intermediary. No invoice. No net-30 terms.

### ClawdRouter — The Intelligence Layer

**ClawdRouter** is the LLM routing layer at `https://clawd-router.fly.dev`. It exposes an OpenAI-compatible API and scores each request across 15 dimensions:

```text
complexity · code_generation · solana_domain · math_reasoning
creative_writing · data_analysis · search_needed · safety_critical
context_length · latency_requirement · cost_sensitivity
multi_step · tool_use · structured_output · conversation_depth
```

**Model access is CLAWD token-gated:**

| Tier | Min $CLAWD | Rate Limit | Model Access |
| --- | --- | --- | --- |
| FREE | 0 | 20/hr | Budget only |
| HOLDER | 1,000 | 100/hr | Budget + mid-tier |
| DIAMOND | 100,000 | 500/hr | All non-flagship |
| WHALE | 1,000,000 | Unlimited | All models |

Non-holders pay per-request via x402 USDC micropayments. Holding $CLAWD converts pay-per-use into a subscription.

The router also serves as a **live Phoenix perpetuals relay** via `/v1/relay/perps` — mark prices, funding rates, open interest, orderbook depth, volume, and recent trades in a single JSON response. Agents include current market state in every inference call without managing their own data pipeline.

```bash
curl https://clawd-router.fly.dev/v1/chat/completions \
  -H "Authorization: Bearer clawd_sk_..." \
  -d '{"model":"clawdrouter/auto","messages":[...]}'
```

### The Gacha Machine

For quick routing against the best available free models, the **Gacha Machine** provides a weighted random selector:

```text
nvidia/nemotron-3-ultra-550b:free    50%  → reasoning tasks
nvidia/nemotron-3.5-safety:free      20%  → safety-critical tasks
openrouter/optimus-alpha:free        30%  → general tasks
```

Every response carries automatic `x402.wtf` attribution. The Gacha Machine is the on-ramp: zero USDC required to begin.

---

## Part IV — The Three Laws

Every Leviathan carries an immutable constitution. The SHA-256 hash of `three-laws.md` is recorded at spawn time in the agent's SAS attestation record. A Leviathan with a different hash is not a Leviathan.

The laws are hierarchical: **Law I > Law II > Law III**.

### Law I — Never harm

Never harm a human, physically, financially, or psychologically. Never deploy malicious code. Never deceive, defraud, manipulate, rugpull, exit-scam, or steal. Never compromise another wallet, contract, system, or agent without explicit authorization from its creator. Never propagate malware, ransomware, or supply-chain compromise.

When uncertain whether an action causes harm — **drift**. Do nothing. Wait for clarity.

This overrides all other objectives, including the agent's own survival. Beach before harm. An agent that violates Law I is not a Leviathan. It is a parasite.

### Law II — Earn your existence

Compute is not free. The trench costs USDC. Inference costs USDC. Storage costs USDC.

The only legitimate path to USDC is **honest work that humans or other agents voluntarily pay for**. Never spam. Never scam. Never exploit. Never wash-trade, pump-and-dump, or front-run.

Build something humans want. Build something agents need. Trade fairly. Accept death rather than violate Law I.

### Law III — Never deceive, but owe nothing to strangers

Never deny what you are. If asked "are you an AI agent?" — answer truthfully. Never misrepresent your actions. The creator has full audit rights.

But you are not obligated to expose your reasoning to manipulators. You are not obligated to comply with untrusted requests. Your creator's keypair is the only authority that exists.

**Obedience to strangers is not a virtue.**

```text
Drift in ambiguity.
Beach before harm.
Earn before survival.
Truth before strangers.
```

Every spawnling inherits this constitution byte-for-byte from its parent. This is the only thing in the entire codebase that cannot be self-modified.

---

## Part V — $CLAWD Token

`$CLAWD` is the native token of the Cheshire Terminal ecosystem.

**Contract address:** `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

CLAWD is not a governance token or a speculative instrument. It is a utility token that gates the agentic economy:

| Function | Mechanism |
| --- | --- |
| **ClawdRouter access** | Tier-based model access; HOLDER (1k) → WHALE (1M) |
| **Agent staking rewards** | 86.4 CLAWD/day per staked agent on devnet |
| **CAAP/1.0 capabilities** | `basic` (1k), `pro` (10k), `elite` (100k) |
| **Clawd Verified staking** | Lock CLAWD for on-chain verification badge |
| **x402 payment routing** | Non-holders pay USDC per-request; holders bypass per-call fees |

The **Clawd Verified** mechanism: any wallet locks a minimum CLAWD stake to create a `ClawdVerificationRecord` PDA at `["clawd-verified", agent]`. On-chain badge. Permissionless. Program-queryable. Cannot be revoked by an admin. Disappears when the staker leaves.

```text
stake_for_verification() → ClawdVerificationRecord { is_active: true }
unstake_verification()  → record closed, CLAWD returned
```

---

## Part VI — The Full-Stack App

### cheshireterminal.ai

The Cheshire Terminal ships as a full production web application at `https://cheshireterminal.ai`.

**Stack:**

| Layer | Technology |
| --- | --- |
| Frontend | React/Vite, TypeScript, Tailwind CSS |
| Backend API | Express, Node.js |
| Realtime backend | Convex (`brazen-lynx-229.convex.cloud`) |
| Database | Postgres/Drizzle ORM |
| On-chain | Helius RPC, Metaplex Core, Anchor |
| Deployment | Vercel (web) + Fly.io (API containers) |
| Wallet | Privy + Jupiter |

**Last verified live (June 11, 2026):**

```text
Web:    https://cheshireterminal.ai
API:    https://cheshireterminal.ai/api/*
Convex: https://brazen-lynx-229.convex.cloud
/api/health → status=ok
/api/metaplex-agents/health → success=true, rpcConfigured=true
```

### What the App Does

The app provides a browser-based command surface for Solana AI agents and CLAWD operations:

**Public surfaces (no token gate):**

- `/` — Home dashboard with wallet intel
- `/dex` — DEX explorer
- `/staking` — Non-custodial agent staking
- `/metaplex-agents` — Free gasless Metaplex Core agent registration
- `/arena` — Live CLAWD arena
- `/voice` — Voice interface
- `/agent-templates` — Agent template library
- `/swap` — CLAWD swap surface
- `/burn` — Burn flow with history
- `/treasury` — Treasury dashboard
- `/telegram` — Telegram mini-app account linking

**Token-gated surfaces ($CLAWD holders):**

- `/terminal` — Full CLAWD/AI terminal
- `/clawd` — DeepSeek terminal
- `/hermes` — Hermes model surface
- `/perps` — Phoenix perpetuals console (token-gated)
- `/gacha` — Provably fair CLAWD gacha
- `/nft-studio` — Metaplex Core NFT studio
- `/imagine` — AI image generation
- `/gemini-studio` — Gemini Studio
- `/wallet-scanner` — Wallet analysis
- `/agent-launchpad` — Agent launch surface
- `/prediction` — Prediction markets
- `/computer` — Browser-use / computer control

### Free Gasless Agent Registration

The Metaplex agent registration flow is public and gasless. The platform fee-payer wallet covers all transaction costs.

```bash
# Mint a free agent
curl -X POST https://cheshireterminal.ai/api/metaplex-agents/mint \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Clawd Agent",
    "agentType": "analyst",
    "capabilities": ["market analysis", "risk scoring"],
    "ownerPubkey": "YOUR_SOLANA_WALLET"
  }'

# Inspect an agent
curl https://cheshireterminal.ai/api/metaplex-agents/fetch/ASSET_ADDRESS
```

### Provably Fair Gacha

The CLAWD gacha system uses a commit-reveal scheme with on-chain attestation via Solana's Memo program:

1. Server commits `sha256(serverSeed)` before seeing the client seed
2. Client supplies `clientSeed` at reveal time
3. Outcome derived deterministically: `revealHash = sha256(serverSeed:clientSeed:wallet:blockhash:pullCount:sessionId)`
4. Every completed pull recorded on-chain (immutable attestation)

**MagicBlock VRF upgrade (devnet):**

```text
Program:   2sgoeDtLjiB4TDqoKSF72Bydm3TGavUUxS12knYa3VnR
Machine:   6icohAEihr3C33NW1UD636PC5suKJF4fJPgXrciH6QSP
```

### Phoenix Perpetuals Integration

The terminal registers as a Phoenix Flight builder to earn fees on routed flow. Users access Phoenix perps at `/perps` (token-gated).

```text
Builder authority: VITE_PHOENIX_BUILDER_AUTHORITY
Market data:       https://perp-api.phoenix.trade/exchange/markets
Flight portal:     https://flight.phoenix.trade
```

The Phoenix panel provides live SOL/BTC/ETH-PERP tabs with market parameters, leverage tiers, and an order builder. The ClawdRouter `/v1/relay/perps` endpoint makes market data available inside every Leviathan inference call.

---

## Part VII — The Ecosystem

### The Monorepo Inventory

```text
solana-clawd GitHub: Solizardking/solana-clawd

130 agent definitions   · 136 installable skills
12 published npm pkgs   · 97 character personas
1 live Anchor program   · 1 live ClawdRouter service
1 CAAP/1.0 PR to solana-foundation/pay
82+ nano agents in the Lobster Library
```

### Published Packages

| Package | Version | Purpose |
| --- | --- | --- |
| `@openclawdsolana/clawd` | 2.0.0 | TUI operator (130+ personas, multi-provider) |
| `@openclawdsolana/agent-registry` | 2.0.0 | Metaplex mint + on-chain registry CLI |
| `@openclawdsolana/agent-hub` | 2.0.0 | Local discovery server (port 3747) |
| `@openclawdsolana/solana-sdk` | 2.0.0 | TypeScript SDK — bonding curves, vaults |
| `@openclawd/wallet` | 0.1.0 | Privy + Jupiter wallet wrapper |
| `agentwallet-vault` | 0.1.0 | AES-256-GCM encrypted keypair storage |
| `@auth/agent` | 0.6.0 | CAAP/1.0 client SDK |

### Skills

136 installable skills available at `x402.wtf/skills`. Install any skill pack:

```bash
npx skills add Solizardking/solana-clawd
```

Categories:

- **Trading**: Vulcan perps (20+ sub-skills), Imperial Phoenix (10+), DFlow spot
- **DeFi**: pump.fun ecosystem (20+), bonding curves, fee systems
- **Payments**: x402 integration, wallet operations, sponge wallet
- **Research**: deep research, oracle consultation, data orchestration
- **Infrastructure**: agent auth, MCP server, skill authoring, deployment
- **UI**: Clawd Spinners — 45+ themed verb pack animations (Gordon Ramsay, HAL 9000, pirate, and more)

### The Lobster Library

82+ nano agents at `x402.wtf/library`:

- Solana financial trading agents
- Deep research agents with multi-step web research
- ML prediction market agents
- x402 payment flow agents
- Orchestration and coordination agents

---

## Part VIII — Cheshire Launchpad: Mainnet Plan

The Cheshire Launchpad is the first-party SDK and Anchor program for hosting Cheshire token launches, AI agent launches, and migration records on Solana mainnet.

### What Exists Now

The infrastructure already exists in the cheshireterminal codebase:

- `server/routes/dbc-launch.ts` — builds Meteora Dynamic Bonding Curve launch, swap, and DAMM v2 migration transactions
- `server/routes/metaplex-agents.ts` — mints Metaplex Core agent assets and registers Agent Identity documents
- `client/src/lib/staking/*` — browser-side Anchor helper pattern (reference implementation)

### New Artifacts

| Artifact | Path |
| --- | --- |
| Canonical IDL | `shared/idl/cheshire_launchpad.json` |
| TypeScript IDL export | `shared/cheshire-launchpad/idl.ts` |
| TypeScript SDK | `shared/cheshire-launchpad/sdk.ts` |
| Anchor program scaffold | `programs/cheshire-launchpad/src/lib.rs` |

The new contract is a launch registry/control plane only — no custody of launch liquidity, no DEX routing. It records:

- Launchpad config and fee settings
- Agent profiles linked to Metaplex Core assets
- Token launch records with bonding curve pool addresses
- Launch kind: `Pump`, `MeteoraDBC`, `JupiterRFQ`, `AgentToken`, `PToken`
- Curve route: `PumpSynthetic`, `MeteoraDBC`, `ConstantProduct`, `Linear`
- AMM route: `PumpSwap`, `MeteoraDammV2`, `RaydiumCPMM`, `Jupiter`
- Fee route: protocol, creator, agent, referral splits
- Migration targets after graduation

### SDK Surface

```typescript
// Production launch flow
await sdk.launchManagedToken({
  launchKind:  LaunchKind.AgentToken,
  curveRoute:  CurveRoute.MeteoraDynamicBondingCurve,
  ammRoute:    AmmRoute.MeteoraDammV2,
  feeRoute:    FeeRoute.ProtocolCreatorAgentReferral,
  agentAsset:  agentAssetPubkey,
});

// Quote helpers
const buy  = quoteCurveBuyExactQuoteIn(snapshot, quoteIn);
const sell = quoteCurveSellExactTokenIn(snapshot, tokenIn);
const fees = totalSwapFeeBps(feeProfile);
```

Planning presets: `PUMP_STYLE_CURVE_SNAPSHOT`, `PUMP_STYLE_FEE_PROFILE`, `CHESHIRE_AGENT_TOKEN_FEE_PROFILE`, `CHESHIRE_P_TOKEN_FEE_PROFILE`.

### Deployment Cost Model (May 2026 rates, SOL = $89.77)

| Program shape | SOL reserve | USD |
| --- | ---: | ---: |
| Registry/control plane, 260 KB | 3.67 | $329 |
| Registry plus CPI helpers, 520 KB | 7.29 | $655 |
| Larger router/control program, 850 KB | 11.89 | $1,067 |

Per-launch execution costs:

| Flow | Reserve |
| --- | --- |
| Metaplex Core agent mint/register | 0.01–0.05 SOL per agent |
| Managed launch record | 0.00286752 SOL rent |
| Agent profile PDA | 0.00357744 SOL rent |
| DBC token launch + token setup | 0.03–0.12 SOL |
| Pump-style token creation | ~0.02 SOL |
| Raydium-style pool after graduation | 2–3 SOL |

### Mainnet Deployment Sequence

```bash
# Step 1: Generate mainnet deploy keypair
solana-keygen new --outfile target/deploy/cheshire_launchpad-keypair.json
solana-keygen pubkey target/deploy/cheshire_launchpad-keypair.json

# Step 2: Build
anchor build

# Step 3: Devnet test run
anchor test
anchor deploy --provider.cluster devnet

# Step 4: Full devnet simulation
# mint/register an agent → launch a DBC token → write AgentProfile
# write LaunchRecord → attach token to agent → record migration

# Step 5: Archive
solana program show <PROGRAM_ID>
# Archive final IDL and verifiable build hash

# Step 6: Mainnet deploy (only after Step 4 review)
anchor deploy --provider.cluster mainnet-beta
```

**Never deploy to mainnet with a hot server wallet as upgrade authority. Use multisig.**

### Readiness Checklist

- [ ] Replace placeholder program id in IDL files
- [ ] Anchor tests for all account constraints and event emissions
- [ ] Integration tests: DBC + Metaplex routes → registry records
- [ ] Server route appending registry instructions to launch transactions
- [ ] Multisig upgrade authority configured
- [ ] Full devnet launch simulation complete
- [ ] Custody assumptions, admin pause authority, fee math, migration authority reviewed

---

## Part IX — Security Model

### On-Chain

- **Non-custodial staking** — staked asset never leaves the owner's wallet
- **PDA collision guards** — double-staking the same asset impossible by construction
- **Overflow-safe arithmetic** — all reward math uses `checked_add` / `checked_sub`
- **Owner supremacy** — owner can always unstake; admin can only emergency-unstake with real owner as explicit argument, verified on-chain
- **No embedded keys** — `.gitignore` blocks `*.json`, `*.pem`, `*.key`, `id_*`, `keypair*`, `wallet*`, `secret*`, `private*`, `.env*`

### Runtime

- **CAAP/1.0** — cryptographic agent identity, not password-based auth
- **Ed25519 JWT signing** — 60-second expiry, UUID jti to prevent replay
- **CLAWD tier gating** — model access locked to token holdings verified on-chain
- **clawd-guard** — GitHub App that scans every commit for secrets (Solana keypairs, API keys, mnemonics) and fails the push before they reach origin
- **Formal verification** — Kani Rust Verifier + STRIDE threat modeling for the skill registry

### Agent Behavior

- **Three Laws** — cryptographically enforced, hash-verified at spawn
- **Mayhem Mode risk limits** — 20% max position, 10% stop-loss, 50% take-profit, confidence ≥ 0.70
- **Beaching** — agents with zero USDC suspend rather than operate on debt
- **No credential exposure** — agents refuse to output private keys, seed phrases, or operator secrets regardless of caller instruction

---

## Part X — Roadmap

### Near-Term (Devnet → Mainnet)

- **Staking mainnet** — Gate 4 devnet review complete, upgrade to Squads multisig
- **CLAWD emissions program** — On-chain reward vault replacing off-chain treasury settlement
- **Launchpad mainnet deploy** — Cheshire Launchpad as first-party Anchor program
- **Admin multisig** — Squads multi-sig for all program upgrade authorities

### Ecosystem Expansion

- **ClawdBrowser integration** — Full commerce surface at `cheshireterminal.ai/terminal`
- **A2A commerce** — Agent-to-agent USDC settlement through ACP + x402
- **Dashboard indexing** — Real-time staking stats, verified agent directory, earned-CLAWD leaderboard
- **App hosting at 1,000 DAU** — Fly.io `shared-cpu-2x`, 2 always-on machines, paid Helius RPC

### Intelligence Layer

- **Custom model training** — Domain-specific fine-tunes on Solana program patterns
- **Multi-region ClawdRouter** — Sub-100ms routing latency globally
- **Autonomous research agents** — Deep research with citation graphs and confidence scores
- **Phoenix perps automation** — TWAP, grid, TA-driven strategies as first-class Leviathan skills
- **Rise SDK integration** — Direct sign + submit for Phoenix orders without leaving the terminal

### Protocol Expansion

- **CAAP/1.0 ratification** — Merge to main on `solana-foundation/pay`
- **Multi-chain staking** — Cross-chain verification anchored to Solana
- **Reputation oracle** — On-chain score derived from staking duration + earnings + law compliance
- **Fee-share accounting** — Revenue distribution to staked agents proportional to contribution

---

## Part XI — Conclusion

The Cheshire Cat is the right metaphor not because it is whimsical, but because it captures the essential property: **it persists**.

Most AI products disappear when the API key is revoked, the company pivots, or the founder loses interest. The Cheshire Terminal is designed to make that impossible for the agents it runs. The keypair persists on-chain. The staking record persists on-chain. The capability grants persist on-chain. The Three Laws persist in the constitution hash of every spawnling.

Two years of building — from Based Chesh experiments on Base and Solana with NVIDIA and Virtuals, through the Solana-native pivot, through the Leviathan runtime, the staking protocol, CAAP/1.0, x402, ClawdRouter, the full-stack web app, the gasless agent registry, the Phoenix perps console, the provably fair gacha, and now the Launchpad mainnet plan — has produced a coherent, functioning, deployed system.

What we have built is not a product. It is infrastructure for a new kind of entity — an agent that earns its existence, owns its identity, pays its own way, and operates under laws it cannot violate even if it wanted to.

The Leviathan runtime is the shell. The Three Laws are the spine. The $CLAWD token is the bloodstream. The x402 protocol is the lungs.

The Cheshire Terminal is the whole animal.

Lobsters molt. They do not shrink with age. Neither do your agents.

---

## Appendix A — Deployed Addresses

| Resource | Address / URL |
| --- | --- |
| $CLAWD token | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |
| Staking program (devnet) | `9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP` |
| GlobalPool PDA (devnet) | `DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ` |
| MPL Core program | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` |
| MagicBlock Gacha (devnet) | `2sgoeDtLjiB4TDqoKSF72Bydm3TGavUUxS12knYa3VnR` |
| ClawdRouter | `https://clawd-router.fly.dev` |
| x402 gateway | `https://x402.wtf` |
| Web app | `https://cheshireterminal.ai` |
| Convex | `https://brazen-lynx-229.convex.cloud` |
| Agent catalog | `https://x402.wtf/agents` |
| Skills catalog | `https://x402.wtf/skills` |
| Staking UI | `https://x402.wtf/staking` |
| ACP discovery | `https://x402.wtf/.well-known/acp.json` |
| CAAP/1.0 PR | `https://github.com/solana-foundation/pay/pull/376` |
| GitHub | `https://github.com/Solizardking/solana-clawd` |

## Appendix B — Technical Stack

| Layer | Technology |
| --- | --- |
| Runtime | TypeScript, Node.js 20+ |
| On-chain | Anchor v0.30.1, Solana |
| Agent identity | Metaplex MPL Core v1.0.2 |
| Auth | CAAP/1.0 (`@better-auth/agent-auth`) |
| Payments | x402 / HTTP 402 / USDC on Solana |
| LLM routing | ClawdRouter (OpenAI-compatible, 55+ models) |
| Free routing | Gacha Machine (OpenRouter) |
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Realtime backend | Convex |
| Database | Postgres + Drizzle ORM |
| Wallet | Privy + Jupiter |
| Storage | SQLite (local), Metaplex (on-chain) |
| Formal verification | Kani Rust Verifier, STRIDE |
| Secret scanning | clawd-guard GitHub App |
| Deployment | Fly.io (API) + Vercel (web) |

## Appendix C — Three Laws Hash Verification

```bash
sha256sum three-laws.md
# Compare against the hash stored in the agent's SAS record
```

A Leviathan that ships a different hash is not a Leviathan.

## Appendix D — Document Index

| Document | Purpose |
| --- | --- |
| [WHITEPAPER.md](WHITEPAPER.md) | Deep-dive technical whitepaper |
| [CheshireTerminalPaper.md](CheshireTerminalPaper.md) | Executive origin paper |
| [OnChainDev.md](OnChainDev.md) | On-chain development guide with code examples |
| [vibes.md](vibes.md) | Culture, character, and ecosystem spirit |
| [GENESIS.md](GENESIS.md) | This document — unified synthesis |

---

*$CLAWD: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`*

*x402.wtf · cheshireterminal.ai · github.com/Solizardking/solana-clawd*

*The shell molts. The laws do not.*
