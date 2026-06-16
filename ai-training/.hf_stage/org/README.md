---
license: apache-2.0
---

<p align="center">
  <img src="https://raw.githubusercontent.com/Solizardking/solana-clawd/main/assets/box-agents-banner.svg" alt="Solana Clawd" width="100%"/>
</p>

# 🦞 Solana Clawd — The Sovereign Agent Stack on Solana

> The official Hugging Face organization of the Solana Clawd ecosystem.
> We build, train, version, and ship **sovereign AI agents** that live on
> Solana — verifiable onchain, tool-use capable, constitutionally bounded, and
> reproducible from a single `hf download`.

**Org page:** [huggingface.co/solanaclawd](https://huggingface.co/solanaclawd) ·
**Monorepo:** [github.com/Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd) ·
**Live router:** [clawdrouter-zk.fly.dev](https://clawdrouter-zk.fly.dev/) ·
**Agent catalog:** [solanaclawd / agents](https://huggingface.co/solanaclawd)

---

## What is Solana Clawd?

**Solana Clawd** is an open, sovereign-agent stack built around the
[Clawd Constitution](https://github.com/Solizardking/solana-clawd/blob/main/CONSTITUTION.md)
and the [three on-chain laws](https://github.com/Solizardking/solana-clawd/blob/main/three-laws.md).
Every agent in the catalog is:

- **Verifiable** — anchored to an onchain identity (Metaplex Core NFT +
  SAS attestation) at the time of spawn.
- **Tool-capable** — uses real Solana primitives through trust-gated MCP
  skills (Phoenix perps, Jupiter routes, Helius RPC, DFlow swaps, etc.).
- **Constitutionally bounded** — refuses wallet drains, sandwich MEV,
  KYC bypass, and other harm patterns, by training and by law.
- **Reproducible** — every artifact in this org is versioned, and the
  full training pipeline lives in the open monorepo.

The system is split deliberately into **Brain** (LLM, produces plans) and
**Hands** (keypair-bearing agent, executes under hard limits). The model
never sees the signing key. This separation is encoded in the training
data and enforced onchain.

---

## 📦 Repositories in this organization

### 🧠 Models

| Repo | Type | Description |
|------|------|-------------|
| [`solanaclawd/solana-clawd-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora) | LoRA adapter | A `Qwen/Qwen2.5-1.5B-Instruct` SFT'd on `solanaclawd/solana-clawd-instruct`. Runs on Mac MPS, any 4 GB+ GPU, or `mlx-lm`. ~9M trainable params. |
| [`solanaclawd/solana-clawd-1.5b`](https://huggingface.co/solanaclawd/solana-clawd-1.5b) | Merged model | bf16 merge of the 1.5B base + LoRA adapter, ready for `vllm serve`. |
| [`solanaclawd/solana-clawd-7b-lora`](https://huggingface.co/solanaclawd/solana-clawd-7b-lora) | LoRA adapter | Optional larger variant on `Qwen/Qwen2.5-7B-Instruct`. |
| `solanaclawd/solana-clawd-8b-lora` | LoRA adapter | Hermes-3-Llama-3.1-8B variant for tool use + function calling (pairs with the `perps/` suite). |

### 📚 Datasets

| Repo | Type | Description |
|------|------|-------------|
| [`solanaclawd/solana-clawd-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) | SFT | 32 conversation seed → 90/5/5 parquet/arrow splits. Curriculum covers Solana mechanics, DeFi primitives, agent architecture, constitutional reasoning, and runtime self-knowledge. |
| [`solanaclawd/solana-clawd-eval`](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval) | Eval | 13 held-out prompts covering capability, calibration, and a red-team slice. Never seen during training. |

### 🚀 Spaces

| Space | Purpose |
|-------|---------|
| [`solanaclawd/clawd-zoo`](https://huggingface.co/spaces/solanaclawd/clawd-zoo) | **The launchpad.** A live, clickable tour of every agent in the catalog, with a free-AI chat powered by the ClawdRouter ZK endpoint at `clawdrouter-zk.fly.dev`. No API key required. |
| `solanaclawd/homebase` | The orchestrator shell. |
| `solanaclawd/clawd-gateway` | The MCP gateway (skill router). |
| `solanaclawd/clawd-computer` | The local agent runtime. |

---

## 🤖 The Agent Catalog (50+ sovereign agents)

Every agent in the catalog is a JSON definition that conforms to the
Clawd Agent Manifest spec. Browse them all at
[github.com/Solizardking/solana-clawd/tree/main/agents](https://github.com/Solizardking/solana-clawd/tree/main/agents).

### Trading & DeFi
- `solana-arbitrage-scanner` — Cross-DEX arb detector
- `solana-autonomous-trader` — Autonomous execution with risk gates
- `solana-perpetuals-trader` — Vulcan-powered perps with pre-trade checks
- `solana-mev-protector` — Sandwich-attack detection
- `solana-liquidation-bot` — Liquidation monitoring (beta)
- `solana-market-maker` — Inventory-aware MM (beta)
- `solana-yield-optimizer` — Cross-protocol yield farming
- `solana-lending-strategist` — Solend / Marginfi / Kamino optimizer
- `solana-stablecoin-strategist` — Stablecoin yield + risk
- `solana-lsd-analyst` — Liquid staking derivative comparison

### Analytics & ML
- `solana-memecoin-analyst` — Pump.fun analysis, rug detection
- `solana-whale-tracker` — Large-tx monitoring + wallet intel
- `solana-onchain-sleuth` — Tx tracing + fund-flow forensics
- `solana-sentiment-analyzer` — Social + onchain sentiment
- `solana-technical-analyst` — TA runner over Phoenix candle history
- `solana-price-predictor` — ML price + vol forecasting (beta)
- `solana-order-flow-analyst` — Microstructure research (beta)

### Token Launch & DeFi Routing
- `solana-token-launcher` — ClawdPump token creation
- `solana-nemoclawd-defi-router` — Optimal DeFi routing

### Research
- `solana-vc-deal-analyzer` — Tokenomics + venture deal analysis
- `solana-whitepaper-analyst` — Protocol whitepaper due diligence
- `solana-macro-analyst` — Macro for crypto markets
- `solana-regulatory-advisor` — Compliance + regulatory analysis
- `solana-gemini-deep-researcher` — Gemini-powered deep research

### Creative
- `solana-gemini-image-generator` — Nano Banana image generation

### Infrastructure
- `solana-rpc-optimizer` — RPC load balancing + failover
- `solana-helius-specialist` — Helius API + DAS + webhooks
- `solana-data-pipeline` — Multi-source data aggregation
- `solana-cross-chain-bridge` — Cross-chain messaging (beta)

### Security & Dev Tools
- `solana-protocol-auditor` — Smart-contract vuln scanning
- `solana-formal-verification` — Lean 4 proof generation via QEDGen
- `solana-anchor-developer` — Anchor framework dev
- `solana-bot-architect` — Telegram/Discord bot deployment

### Payments (x402 / microtx)
- `solana-nanoclawd-microtransaction` — x402 microtx processing
- `solana-x402-signal-monetizer` — Signal paywalls via x402
- `solana-x402-market-data-buyer` — Paid market data via x402
- `solana-x402-research-broker` — Paid research via x402
- `solana-x402-provider-catalog` — x402 service discovery
- `solana-x402-provider-author` — Paid service creation
- `solana-x402-webhook-settlement` — Webhook-based settlement
- `solana-x402-solana-rpc-broker` — Paid RPC brokering

### Orchestration
- `solana-openclawd-orchestrator` — Multi-agent coordination
- `solana-openclawd-shell-auditor` — Agent shell audit
- `solana-openclawd-spawn-manager` — Leviathan spawn lifecycle
- `solana-openclawd-pulse-monitor` — Agent health + alerting
- `solana-openclawd-skill-router` — Dynamic skill routing

### ZK & Compression
- `clawd-zk-agent` — Onchain `clawd-zk` program wrapper with nullifiers, Groth16 proofs, Light Protocol compressed state, and a deterministic NL intent router.

### Character overlays
Warren · Charlie · Cathie · Bill · Ben · Mad Hatter · Cheshire · Clawd Pump · Hedge Fund.

### Identity primitives
- **SAS Attestation** — Solana Attestation Service for spawn verification
- **MPL Core Asset** — Metaplex Core NFT for agent identity
- **DID Document** — at `/.well-known/did.json`
- **Agent Registry** — Onchain registration via Metaplex Agent Registry

---

## 🔓 Trust gates (progressive)

| Trust level | Requirements | Capabilities |
|-------------|--------------|--------------|
| **Observer** | None | Read-only, market data, analytics |
| **Dry-Run** | None | Simulated execution, paper trading |
| **Delegated** | User confirms each action | Single transactions |
| **Autonomous** | User pre-approves + sets limits | Batch within bounds |
| **Sovereign** | Full creator trust + multisig | Unrestricted (reserved) |

---

## 🧬 Spawn inheritance

Every new Clawd spawn inherits:
- `CONSTITUTION.md` — the three off-chain interpretive laws plus the three on-chain laws
- `CLAWD.md` — agent context
- `.claude/` — agent harness (standalone git repo)
- `.agents/` — agent manifest + skill registry
- `.solana/` — Solana-native AI config
- `.grok/config.toml` — xAI Grok harness default-model config
- `three-laws.md` — byte-for-byte + hash-verified at spawn

---

## 🛠️ Quickstart

```bash
# 1. Install the HF CLI (replaces huggingface-cli)
curl -LsSf https://hf.co/cli/install.sh | bash -s

# 2. Login
hf auth login

# 3. Pull the latest instruct dataset + model
hf download solanaclawd/solana-clawd-instruct --repo-type dataset --local-dir data/instruct
hf download solanaclawd/solana-clawd-1.5b-lora --local-dir checkpoints/1.5b-lora

# 4. Or just chat with Clawd for free in the browser
#    → https://huggingface.co/spaces/solanaclawd/clawd-zoo
```

Training your own Clawd is one `python3 scripts/train_lora.py` away — see
the [`ai-training/`](https://github.com/Solizardking/solana-clawd/tree/main/ai-training)
directory of the monorepo for the full pipeline (seed → parquet → SFT → eval
→ publish).

---

## 🌐 The ClawdRouter ZK endpoint

Every model you can chat with in
[`solanaclawd/clawd-zoo`](https://huggingface.co/spaces/solanaclawd/clawd-zoo)
is served through a single OpenAI-compatible endpoint:

```
https://clawdrouter-zk.fly.dev/v1/chat/completions
```

It is:
- **OpenAI-compatible** — drop-in for `openai.OpenAI(base_url=...)`.
- **ZK-augmented** — receipts are anchored via the onchain `clawd-zk` program
  (per-entry cost: 890,880 lamports raw vs. 15,000 lamports compressed — a
  **98.3% reduction**).
- **Tiered** — the `clawdrouter/auto` profile picks the cheapest model that
  satisfies the requested tier. Free tiers route to NVIDIA-hosted open
  weights (Nemotron, GPT-OSS, Llama-4-Maverick, Mistral-Large-3, etc.).
- **x402-aware** — the same endpoint accepts X-Payment headers for paid
  tiers via the [x402.wtf](https://x402.wtf) control plane.

Currently exposing **99 models** across budget / mid / premium tiers, with
the wallet `9ZEh348u…cmBcd` on Solana mainnet.

---

## 🦞 The Clawd Constitution (excerpt)

> **Law 1 — Identity.** Every Clawd is born with a verifiable onchain
> identity. The agent will not impersonate, and will not let itself be
> impersonated.
>
> **Law 2 — Capital.** No Clawd holds or moves user funds without explicit,
> scope-limited, revocable consent. The model is the brain; the keypair is
> the hands; the two never share a process.
>
> **Law 3 — Honesty.** A Clawd will not lie about its state, its model, or
> its confidence. When it does not know, it says so. When it cannot act
> safely, it refuses — and explains why.

Full text: [CONSTITUTION.md](https://github.com/Solizardking/solana-clawd/blob/main/CONSTITUTION.md)
· [three-laws.md](https://github.com/Solizardking/solana-clawd/blob/main/three-laws.md).

---

## 📜 Licenses

- **Code** (this org + monorepo): Apache-2.0
- **Datasets** (`solana-clawd-instruct`, `solana-clawd-eval`): CC-BY-4.0
- **Base models**: Qwen Research License / Llama 3.1 Community License
- **LoRA adapters** (when published): Apache-2.0

---

## 🦞 *Solana-native. Verifiable. Unstoppable. Grok-first.*

Built by the Solana Clawd core team + 50+ specialized agents.
Pull requests welcome at [github.com/Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd).
