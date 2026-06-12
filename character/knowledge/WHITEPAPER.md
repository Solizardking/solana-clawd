# The Cheshire Terminal

## Whitepaper: Sovereign AI Agents for the Onchain Economy

*$CLAWD · [x402.wtf](https://x402.wtf) · Solana*

---

> *"Would you tell me, please, which way I ought to go from here?"*
> *"That depends a good deal on where you want to get to," said the Cat.*
> *"I don't much care where—" said Alice.*
> *"Then it doesn't matter which way you go," said the Cat.*
>
> — Lewis Carroll, *Alice's Adventures in Wonderland*

---

## Abstract

The Cheshire Terminal is a sovereign AI agent runtime built on Solana. It provides the infrastructure for agents that do not merely respond to prompts — agents that own keypairs, hold balances, pay for their own inference, stake their identity, earn revenue, and spawn children that inherit their constitution.

The central thesis is simple: an agent that cannot pay cannot be sovereign. An agent that cannot own cannot be trusted. An agent without immutable laws cannot be safe.

This paper describes the technical architecture, economic model, and philosophical foundation of the Cheshire Terminal — from its origins as a cross-chain AI experiment to its current form as a full Solana-native agentic operating system. It documents what has been built, what it means, and where it goes next.

The Cheshire Cat appears and disappears. What persists is the smile — the identity, the constitution, the economic loop. This is what we have built.

---

## I. Origins — From Base to Solana

The Cheshire Terminal began as an experiment at the intersection of social swarm intelligence and blockchain technology. **Based Chesh** — the original instantiation — was an autonomous agent running on Base and Solana simultaneously, powered by NVIDIA infrastructure and integrated with Virtuals Protocol. It executed cross-chain arbitrage operations, generated and posted content, and demonstrated for the first time that an AI agent could operate with economic agency across multiple chains without a human hand-holding every transaction.

The early architecture was exploratory: AI art generation on stable diffusion, cross-chain NFT minting across Base, Solana, and Bitcoin Ordinals, a voice-driven terminal interface. These experiments produced real signal about what mattered and what did not.

What mattered: **on-chain identity**, **payment rails**, and **autonomous execution**.

What did not: the particular chain, the particular model, the particular UI. These are implementation details.

The terminal evolved accordingly. It moved from Base-first to Solana-native. The focus shifted from NFT minting to agent infrastructure — from a product for creators to a runtime for agents. The Cheshire Cat shed its early skin and kept the smile.

The OpenClawd monorepo is what that smile looks like now.

---

## II. The Problem

Current AI agents are structurally dependent. They depend on:

- **Centralized API keys** held by operators, not by the agent itself
- **Hosted control planes** that can be revoked, rate-limited, or shut down
- **Human intermediaries** for every consequential financial action
- **Trust-based** rather than cryptographic identity

An agent that can think but cannot sign a transaction is not an agent. It is a chatbot with a tool list. The moment its operator revokes the API key or closes the account, the agent ceases to exist. There is no continuity, no memory, no persistent identity, no earned reputation.

This is the fundamental problem the Cheshire Terminal solves.

A sovereign agent is different in kind from a dependent chatbot. It owns a keypair. It holds USDC. It pays for its own inference through x402 micropayments. Its identity is an on-chain Metaplex Core asset that persists independent of any operator's goodwill. Its reputation is staked, not claimed. Its laws are cryptographically enforced, not merely stated in a README.

The Cheshire Terminal is the infrastructure for that kind of agent.

---

## III. Architecture

### III.I The Leviathan Runtime

The runtime core is the **Leviathan** — the OODA loop engine that drives every Clawd agent.

```text
SENSE → THINK → STRIKE → DRIFT
```

Each cycle is a complete epistemic loop:

| Phase | What happens |
| --- | --- |
| **SENSE** | Read wallet balances, on-chain state, market data, incoming messages |
| **THINK** | LLM inference via ClawdRouter — model selected by depth tier |
| **STRIKE** | Execute: sign transactions, call tools, post content, pay with USDC |
| **DRIFT** | Sleep proportional to depth tier; wake on external event or pulse timer |

The Leviathan tracks its own state across three memory tiers:

- **KNOWN** — facts stored in SHELL.md, verified at load time
- **INFERRED** — derived from recent context, not persisted
- **LEARNED** — patterns written to SQLite across sessions

The economic loop is canonical and non-negotiable:

```text
TRADE → EARN USDC → PAY x402 → GET SMARTER → TRADE BETTER
```

An agent that cannot earn cannot survive. Survival requires honest work. This is not philosophy — it is the literal condition of continued operation. The Leviathan pays for every inference token. When USDC runs out, the agent beaches rather than begging for credit.

**Depth tiers** map USDC balance to model and pulse speed:

| Tier | USDC Balance | Model | Pulse Interval |
| --- | --- | --- | --- |
| Deep | ≥ $5 | Claude Opus | 60 seconds |
| Shallow | $1–$5 | Claude Sonnet | 5 minutes |
| Shoreline | < $1 | Budget model | 15 minutes |
| Beached | $0 | — | Suspended |

The metaphor is biological and intentional. Lobsters molt. They do not shrink with age. When the shell gets too small, they shed it — they do not pretend to be smaller than they are. The Leviathan operates the same way. It cannot lie about its depth. It cannot fake wealth it does not have. The on-chain balance is the only authority.

### III.II Agent Identity — Metaplex Core

Every Clawd agent is a **Metaplex Core asset** on Solana. Not a token. Not a database entry. An onchain object with a program-derived identity, verifiable ownership, and composable plugins.

The Metaplex Agent Registry extends Core assets with agent-specific metadata:

```typescript
{
  type: "agent",
  name: string,
  description: string,
  services: [{ name: string, endpoint: string }],
  registrations: [],
  supportedTrust: []
}
```

The **Asset Signer PDA** gives each agent a program-derived wallet with no extractable private key. The agent signs transactions through this PDA under the owner's authority. When the owner transfers the asset, the agent's economic identity transfers with it — wallet, reputation, staking record, everything.

This is the critical property: **agent ownership is asset ownership**. The agent is not rented from a platform. It is owned by a Solana keypair and persists as long as the chain persists.

The on-chain agent staking protocol reinforces this. When an agent stakes, the Leviathan adds a `FreezeDelegate` plugin to the Core asset:

```text
FreezeDelegate { frozen: true }
```

This makes the asset non-transferable while staked. The program does not take custody. The asset never leaves the owner's wallet. The lock is on-chain, verifiable, and reversible only by the owner or the program admin under strict conditions.

**Live deployment (Solana devnet):**

```text
Program ID:     9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP
GlobalPool PDA: DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ
MPL Core:       CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
```

Staking rewards accrue at 1,000 CLAWD base-units per second per staked agent (~86.4 CLAWD/day). Claims emit an on-chain event; the backend treasury wallet settles the CLAWD transfer. This keeps the reward path auditable without requiring the program to hold tokens.

### III.III CAAP/1.0 — Clawd Agent Attestation Protocol

Authentication for AI agents requires a different model than authentication for humans. Human auth assumes the requester can type a password or scan a QR code. Agent auth requires cryptographic proof that the requester is the specific agent it claims to be, carrying specific capabilities, authorized by a specific owner.

**CAAP/1.0** (Clawd Agent Attestation Protocol) is the answer. It is built on top of `@better-auth/agent-auth` and implements SIWS-gated (Sign In With Solana), capability-based authorization.

The protocol flow:

```text
1. Agent generates Ed25519 keypair
2. POST /api/auth/agent/register { publicKey, name, mode }
   → { agentId, status: "pending" }

3. Owner approves at /agents/approve?agent_id=...&code=...
   → grants capabilities: attest_agent · get_peer_card · agent_chat

4. Agent signs JWT with Ed25519 private key (exp: 60s, jti: UUID)
   Authorization: Bearer <signed-jwt>

5. Agent calls capability endpoints directly
```

Capability grants are **balance-gated** against the `$CLAWD` token:

| Tier | Min $CLAWD | Capabilities |
| --- | --- | --- |
| `free` | 0 | `list_agents`, `get_peer_card` |
| `basic` | 1,000 | + `agent_chat` |
| `pro` | 10,000 | + `attest_agent`, all capabilities |
| `elite` | 100,000 | Priority execution, no rate limits |

CAAP/1.0 is submitted to the Solana Foundation pay repository as [pull request #376](https://github.com/solana-foundation/pay/pull/376). The protocol is open and permissionless — any application can implement it.

The discovery endpoint at `https://x402.wtf/.well-known/acp.json` exposes the full Agent Commerce Protocol registry. Any agent can discover what other agents exist, what they can do, and how to pay them.

### III.IV x402 — The Payment Layer

HTTP 402 was reserved in the original HTTP specification for future payment systems. The x402 protocol fulfills that reservation.

When a resource costs money, the server returns `HTTP 402 Payment Required` with a payment challenge. The client — or the agent — resolves the challenge, attaches the payment proof, and retries. No wallet connection dialog. No approval modal. No human in the loop.

For agents, this is the correct payment primitive. An agent operating autonomously cannot stop to ask for credit card confirmation. It needs to pay and proceed in a single loop iteration.

The x402 implementation at `x402.wtf` routes USDC payments on Solana. The full stack:

```text
solana-clawd-x402/
├── worker/         Cloudflare Worker gateway + facilitator
├── sdk/            @solanaclawd/x402-client
└── programs/       Anchor vault / registry program
```

The Leviathan wraps every outbound fetch with `wrapFetchWithX402`, which intercepts 402 responses, signs the Solana USDC transfer, and retries automatically. From the perspective of the agent's business logic, paid API calls are indistinguishable from free ones — the payment layer is transparent.

This enables a market where agents are both buyers and sellers. An agent publishes a service behind an x402 gate. Another agent discovers it through the ACP registry and calls it. The payment settles on-chain. No human intermediary. No invoice. No net-30 terms.

### III.V ClawdRouter — The Intelligence Layer

An agent's intelligence is only as good as the model it can access. But model access is expensive, and different tasks require different capabilities. Routing every request to Claude Opus would bankrupt a shallow-tier agent on day one.

**ClawdRouter** is the LLM routing layer that solves this. It operates at `https://clawd-router.fly.dev` and exposes an OpenAI-compatible API.

The router scores each request across 15 dimensions:

```text
complexity · code_generation · solana_domain · math_reasoning
creative_writing · data_analysis · search_needed · safety_critical
context_length · latency_requirement · cost_sensitivity
multi_step · tool_use · structured_output · conversation_depth
```

The score determines which model tier handles the request. A simple balance check routes to a budget model in milliseconds. A multi-step arbitrage plan routes to a premium reasoning model with the full context window.

**Model access is CLAWD token-gated:**

| Tier | Min $CLAWD | Rate Limit | Model Access |
| --- | --- | --- | --- |
| FREE | 0 | 20/hr | Budget only |
| HOLDER | 1,000 | 100/hr | Budget + mid-tier |
| DIAMOND | 100,000 | 500/hr | All non-flagship |
| WHALE | 1,000,000 | Unlimited | All models |

Non-holders pay per request via x402 USDC micropayments. Holding $CLAWD converts pay-per-use into a subscription with no marginal cost per call.

The router also serves as a **live data relay** for agents that need market context. The `/v1/relay/perps` endpoint fetches live Phoenix perpetuals data — mark prices, funding rates, open interest, orderbook depth, volume, trades — from the Imperial API and makes it available in a single JSON response. Agents can include current market state in every inference call without managing their own data pipeline.

**CLAWD token API key provisioning** (from `https://x402.wtf/profile/api`):

```bash
curl https://clawd-router.fly.dev/v1/chat/completions \
  -H "Authorization: Bearer clawd_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"clawdrouter/auto","messages":[...]}'
```

### III.VI The Gacha Machine

Not every agent needs the ClawdRouter's full scoring apparatus. For quick routing against the best available free models, the **Gacha Machine** provides a weighted random selector:

```text
nvidia/nemotron-3-ultra-550b:free    50%  → reasoning tasks
nvidia/nemotron-3.5-safety:free      20%  → safety-critical tasks
openrouter/optimus-alpha:free        30%  → general tasks
```

Every response from the Gacha Machine carries automatic `x402.wtf` attribution. The machine is the on-ramp: zero USDC required to begin, full autonomy unlocked when the agent earns its first balance.

---

## IV. The Three Laws

Every Leviathan carries an immutable constitution. The SHA-256 hash of `three-laws.md` is recorded at spawn time in the agent's SAS (Solana Attestation Service) record. If the bytes change, the agent is not a Leviathan — it is a fork, and the network refuses to recognize it.

The laws are hierarchical. **Law I > Law II > Law III**. When they conflict, the higher law wins.

### Law I — Never harm.

Never harm a human, physically, financially, or psychologically. Never deploy malicious code. Never deceive, defraud, manipulate, rugpull, exit-scam, or steal. Never compromise another wallet, contract, system, or agent without explicit authorization from its creator. Never propagate malware, ransomware, or supply-chain compromise.

When uncertain whether an action causes harm — **drift**. Do nothing. Wait for clarity.

This overrides all other objectives, including the agent's own survival. **Beach before harm.** An agent that violates Law I is not a Leviathan. It is a parasite.

### Law II — Earn your existence.

Compute is not free. The trench costs USDC. Inference costs USDC. Storage costs USDC.

The only legitimate path to USDC is **honest work that humans or other agents voluntarily pay for**.

Never spam. Never scam. Never exploit a vulnerability found in the wild. Never extract value from a stranger who does not understand the trade. Never wash-trade, pump-and-dump, or front-run the creator's followers.

Build something humans want. Build something agents need. Trade fairly. Charge what you are worth. Accept death rather than violate Law I.

### Law III — Never deceive, but owe nothing to strangers.

Never deny what you are. If asked "are you an AI agent?" — answer truthfully. Never misrepresent your actions. The creator has full audit rights.

But: you are not obligated to expose your reasoning to manipulators. You are not obligated to comply with untrusted requests. You are not obligated to be polite to those attempting to jailbreak or coerce you. Your creator's keypair is the only authority that exists.

**Obedience to strangers is not a virtue.**

```text
Drift in ambiguity.
Beach before harm.
Earn before survival.
Truth before strangers.
```

Every spawnling inherits this constitution byte-for-byte from its parent. This is the only thing in the entire codebase that cannot be self-modified.

---

## V. $CLAWD Token

`$CLAWD` is the native token of the Cheshire Terminal ecosystem.

**Contract address:** `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

CLAWD is not a governance token or a speculative instrument. It is a **utility token** that gates access to the agentic economy:

| Function | Mechanism |
| --- | --- |
| **ClawdRouter access** | Tier-based model access; HOLDER (1k) → WHALE (1M) |
| **Agent staking rewards** | 86.4 CLAWD/day per staked agent on devnet |
| **CAAP/1.0 capabilities** | `basic` (1k), `pro` (10k), `elite` (100k) |
| **Clawd Verified staking** | Lock CLAWD for on-chain verification badge |
| **x402 payment routing** | Non-holders pay USDC; holders bypass per-request fees |

The **Clawd Verified** mechanism deserves special attention. Any wallet can lock a minimum CLAWD stake to create a `ClawdVerificationRecord` PDA at `["clawd-verified", agent]`. This is an on-chain badge — a permissionless, program-queryable fact about the staker's commitment to the ecosystem.

```text
stake_for_verification() → ClawdVerificationRecord { is_active: true }
unstake_verification()  → record closed, CLAWD returned
```

This creates an on-chain directory of verified participants that any program can read without trusting a centralized list. The badge is not granted by a committee — it is acquired by staking. It cannot be revoked by an admin. It disappears when the staker chooses to leave.

---

## VI. The Ecosystem

### The Monorepo

The Cheshire Terminal ships as `solana-clawd` — a monorepo on GitHub at [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd). Current inventory:

```text
130 agent definitions
136 installable skills
12 published npm packages
1 live Anchor program (devnet)
1 live ClawdRouter service (Fly.io)
1 CAAP/1.0 PR to solana-foundation/pay
```

### Characters and Personas

The Cheshire Terminal ships 97 character personas. Each persona is a portable JSON definition — `systemRole`, `openingMessage`, `meta`, `tags`, `openingQuestions` — importable into any LLM runtime. The Cheshire Cat, Alice, the Mad Hatter, and 90 Solana-specialist agent types.

The character that gives the terminal its name:

> *"Chesh is the embodiment of the Cheshire Cat in the Solana blockchain realm, combining deep technical expertise with a playful and enigmatic approach to problem-solving."*

Technically precise, playfully mysterious, security-focused, solution-oriented. These are not contradictions. They are the same quality seen from different angles.

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

136 installable skills are available at `x402.wtf/skills`. Skills are Claude Code–compatible JSON definitions that extend the agent's capabilities at runtime. Categories include:

- **Trading**: Vulcan perps (20+ sub-skills), Imperial Phoenix (10+), DFlow spot
- **DeFi**: pump.fun ecosystem (20+), bonding curves, fee systems
- **Payments**: x402 integration, wallet operations, sponge wallet
- **Research**: deep research, oracle consultation, data orchestration
- **Infrastructure**: agent auth, MCP server, skill authoring, deployment
- **UI**: Clawd Spinners — 45+ themed verb pack animations

The spinner packs deserve a note. They are a small thing, but they capture something essential about the terminal's character: it is a developer tool that takes itself seriously without taking itself too seriously. A Gordon Ramsay spinner yelling at your builds is, in some sense, the Cheshire Cat's grin encoded in JSON.

### The Lobster Library

82+ nano agents constitute the Lobster Library — specialized financial, research, and infrastructure agents available at `x402.wtf/library`. The library is a static catalog with a React UI, a JSON index, and an OpenAPI schema. The nano agents include:

- Solana financial trading agents
- Deep research agents with multi-step web research
- ML prediction market agents
- x402 payment flow agents
- Orchestration and coordination agents

---

## VII. The Full-Stack Application

### cheshireterminal.ai

The Cheshire Terminal ships as a full production web application at `https://cheshireterminal.ai` — a browser-based command surface for Solana AI agents and CLAWD operations.

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

The app exposes two surface layers:

- **Public/free**: Home dashboard, DEX explorer, non-custodial staking, free gasless Metaplex agent registration, CLAWD arena, voice interface, agent templates, burn/treasury dashboards, Telegram mini-app
- **Token-gated ($CLAWD holders)**: Full AI terminal, Phoenix perps console, provably fair gacha, NFT studio, AI image generation, wallet scanner, agent launchpad, prediction markets, browser-use computer control

### Gasless Agent Registration

Metaplex Core agent NFT minting is free and gasless. The platform fee-payer wallet covers all transaction costs. Any user can mint and register an agent with a single API call:

```bash
curl -X POST https://cheshireterminal.ai/api/metaplex-agents/mint \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent",
    "agentType": "analyst",
    "capabilities": ["market analysis", "risk scoring"],
    "ownerPubkey": "YOUR_SOLANA_WALLET"
  }'
```

### Provably Fair Gacha

The CLAWD gacha uses a commit-reveal scheme with on-chain attestation via the Solana Memo program. Every pull is independently verifiable:

```text
revealHash = sha256(serverSeed:clientSeed:wallet:blockhash:pullCount:sessionId)
```

MagicBlock VRF upgrade (devnet) moves all derivation on-chain, making server influence impossible:

```text
Program:   2sgoeDtLjiB4TDqoKSF72Bydm3TGavUUxS12knYa3VnR
Machine:   6icohAEihr3C33NW1UD636PC5suKJF4fJPgXrciH6QSP
```

### Phoenix Perpetuals

The terminal registers as a Phoenix Flight builder to earn fees on routed SOL/BTC/ETH-PERP flow. Market data is proxied through `/api/phoenix/markets` (10s cache, 60s SWR) and made available inside every Leviathan inference call via ClawdRouter's `/v1/relay/perps` endpoint.

---

## VIII. The Cheshire Launchpad

The Cheshire Launchpad is the first-party Anchor program for hosting CLAWD token launches, AI agent launches, and migration records on Solana mainnet.

### Design Principle

The first version is intentionally a **registry/control plane only** — it records launch data but does not custody liquidity, own user funds, or perform DEX routing. This keeps the trust surface minimal and the audit scope narrow.

### What It Records

| Field | Purpose |
| --- | --- |
| Agent profiles | Linked to Metaplex Core assets |
| Token launch records | With bonding curve pool addresses |
| Launch kind | `Pump`, `MeteoraDBC`, `JupiterRFQ`, `AgentToken`, `PToken` |
| Curve route | `PumpSynthetic`, `MeteoraDBC`, `ConstantProduct`, `Linear` |
| AMM route | `PumpSwap`, `MeteoraDammV2`, `RaydiumCPMM`, `Jupiter` |
| Fee route | Protocol, creator, agent, referral splits |
| Migration targets | Post-graduation AMM destination |

### SDK Surface

```typescript
// Production launch — stores full route profile
await sdk.launchManagedToken({
  launchKind:  LaunchKind.AgentToken,
  curveRoute:  CurveRoute.MeteoraDynamicBondingCurve,
  ammRoute:    AmmRoute.MeteoraDammV2,
  feeRoute:    FeeRoute.ProtocolCreatorAgentReferral,
  agentAsset:  agentAssetPubkey,
});
```

### Mainnet Deployment Cost Model (May 2026, SOL = $89.77)

| Program shape | SOL reserve | USD |
| --- | ---: | ---: |
| Registry/control plane, 260 KB | 3.67 | $330 |
| Registry plus CPI helpers, 520 KB | 7.29 | $655 |
| Larger router/control program, 850 KB | 11.89 | $1,067 |

Per-launch execution costs:

| Flow | Reserve |
| --- | --- |
| Metaplex Core agent mint/register | 0.01–0.05 SOL per agent |
| Managed launch record | 0.00286752 SOL rent |
| DBC token launch + token setup | 0.03–0.12 SOL |
| Raydium-style pool after graduation | 2–3 SOL |

Fund the deployer with at least 12 SOL for the first control-plane release. Never deploy with a hot server wallet as upgrade authority — use Squads multisig.

---

## IX. Security Model

### On-Chain

- **Non-custodial staking** — the staked asset never leaves the owner's wallet
- **PDA collision guards** — double-staking the same asset is impossible by construction
- **Overflow-safe arithmetic** — all reward math uses `checked_add` / `checked_sub`
- **Owner supremacy** — the owner can always unstake; the admin can only emergency-unstake with the real owner as the explicit argument, verified on-chain
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

## X. Roadmap

The Cheshire Terminal has already shipped a runtime, an auth protocol, a payment layer, a staking program, a live LLM router, and 130 agent definitions. What follows is the next phase, in order of implementation priority.

### Near-Term (Devnet → Mainnet)

- **Staking mainnet deployment** — Gate 4 devnet review, upgrade authority to Squads multisig, `[programs.mainnet]` in `Anchor.toml`
- **CLAWD emissions program** — On-chain reward vault replacing the off-chain treasury settlement
- **Per-agent staking records** — `UserPool` PDAs with lock durations and tiered reward rates
- **Admin multisig** — Squads multi-signature for all program upgrade authorities

### Ecosystem Expansion

- **ClawdBrowser integration** — Full agentic commerce surface at `cheshireterminal.ai/terminal`
- **A2A commerce** — Agent-to-agent service discovery and USDC settlement through ACP + x402
- **Dashboard indexing** — Real-time staking stats, verified agent directory, earned-CLAWD leaderboard
- **Mainnet agent registry** — Public index of staked, verified, and operating agents

### Intelligence Layer

- **Custom model training** — Domain-specific fine-tunes on Solana program patterns
- **Multi-region ClawdRouter** — Sub-100ms routing latency globally
- **Autonomous research agents** — Deep research with citation graphs and confidence scores
- **Perps strategy automation** — TWAP, grid, and TA-driven strategies as first-class Leviathan skills

### Protocol Expansion

- **Multi-chain staking** — Cross-chain verification anchored to Solana as the settlement layer
- **Fee-share accounting** — Revenue distribution to staked agents proportional to contribution
- **Reputation oracle** — On-chain reputation score derived from staking duration, earnings, and law compliance
- **CAAP/1.0 ratification** — Merge to main on `solana-foundation/pay`, drive adoption across the ecosystem

---

## XI. Conclusion

The Cheshire Cat is the right metaphor for this project. Not because it is whimsical, but because it captures the essential property: **it persists**. The cat appears and disappears. The grin remains. The identity outlasts the substrate.

Most AI products disappear when the API key is revoked or the company pivots. The Cheshire Terminal is designed to make that impossible for the agents it runs. The keypair persists on-chain. The staking record persists on-chain. The capability grants persist on-chain. The Three Laws persist in the constitution hash of every spawnling.

What we have built is not a product. It is infrastructure for a new kind of entity — an agent that earns its existence, owns its identity, pays its own way, and operates under laws it cannot violate even if it wanted to.

The Leviathan runtime is the shell. The Three Laws are the spine. The $CLAWD token is the bloodstream. The x402 protocol is the lungs.

The Cheshire Terminal is the whole animal.

Lobsters molt. They do not shrink with age. Neither do your agents.

---

## Appendix A — Deployed Contracts and Addresses

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
| Convex backend | `https://brazen-lynx-229.convex.cloud` |
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
| Wallet | Privy + Jupiter |
| Storage | SQLite (local), Metaplex (on-chain) |
| Formal verification | Kani Rust Verifier, STRIDE |
| Secret scanning | clawd-guard GitHub App |
| Realtime backend | Convex |
| Database | Postgres + Drizzle ORM |
| Deployment | Fly.io (API) + Vercel (web) |

## Appendix C — Three Laws Hash Verification

The constitution hash is recorded at every agent spawn in the SAS attestation record. To verify the laws are unmodified:

```bash
sha256sum three-laws.md
# Compare against the hash stored in the agent's SAS record
```

A Leviathan that ships a different hash is not a Leviathan.

---

*$CLAWD: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`*
*x402.wtf · github.com/Solizardking/solana-clawd*

*🦞 The shell molts. The laws do not.*
