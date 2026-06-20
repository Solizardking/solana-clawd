<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=28&pause=1200&color=9945FF&center=true&vCenter=true&width=720&lines=Solana+Clawd+AI+Training;Fine-tune+%E2%86%92+Eval+%E2%86%92+Attest+Onchain;One-shot+GPU+training+pipeline;Register+models+to+onchain.x402.wtf;Open-source+Solana+AI+stack" alt="Animated header" />

<br/>

[![GitHub](https://img.shields.io/badge/GitHub-solana--clawd--ai--training-181717?style=for-the-badge&logo=github)](https://github.com/Solizardking/solana-clawd-ai-training)
[![HuggingFace](https://img.shields.io/badge/HuggingFace-solanaclawd-FFD21F?style=for-the-badge&logo=huggingface&logoColor=black)](https://huggingface.co/solanaclawd)
[![OnChain Registry](https://img.shields.io/badge/Registry-onchain.x402.wtf-9945FF?style=for-the-badge)](https://onchain.x402.wtf)

<br/>

[![Buy on Phantom](https://img.shields.io/badge/Buy_%24CLAWD-Phantom-blueviolet?style=flat-square)](https://phantom.com/tokens/solana/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)
[![Dexscreener](https://img.shields.io/badge/Chart-Dexscreener-green?style=flat-square)](https://dexscreener.com/solana/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)
[![Birdeye](https://img.shields.io/badge/Chart-Birdeye-orange?style=flat-square)](https://birdeye.so/token/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)
[![Jupiter](https://img.shields.io/badge/Swap-Jupiter-blue?style=flat-square)](https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)
[![Solscan](https://img.shields.io/badge/Token-Solscan-lightblue?style=flat-square)](https://solscan.io/token/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

<br/>

> The training pipeline for the **Solana Clawd** sovereign-agent model family.
> Fine-tune, evaluate, and register AI models to the Solana blockchain in one session.

</div>

---

## Models

| Model | Size | Status | Links |
|---|---|---|---|
| `solanaclawd/solana-clawd-core-ai-1.5b-lora` | 1.5B LoRA | ✅ **Live** — train_loss 0.9008, token_acc 82.9% | [![HF](https://img.shields.io/badge/HF-model-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/solanaclawd/solana-clawd-core-ai-1.5b-lora) |
| `solanaclawd/solana-nvidia-trading-factory-8b-lora` | 8B LoRA | ✅ **Live** — Hermes-3, Solana perps | [![HF](https://img.shields.io/badge/HF-model-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/solanaclawd/solana-nvidia-trading-factory-8b-lora) |
| `solanaclawd/solana-clawd-1.5b` | 1.5B merged | ✅ **Live** — vLLM / TGI / Ollama ready | [![HF](https://img.shields.io/badge/HF-model-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/solanaclawd/solana-clawd-1.5b) |
| `solanaclawd/solana-clawd-7b-lora` | 7B LoRA | 🔄 **Training** | [![HF](https://img.shields.io/badge/HF-model-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/solanaclawd/solana-clawd-7b-lora) |
| `solanaclawd/solana-tx-foundation-1.5b` | 1.5B CPT+SFT | 🔄 **Training** | [![HF](https://img.shields.io/badge/HF-model-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/solanaclawd/solana-tx-foundation-1.5b) |

## Datasets

| Dataset | Examples | Links |
|---|---|---|
| `solanaclawd/solana-clawd-core-ai-instruct` | 35,173 | [![HF](https://img.shields.io/badge/HF-dataset-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/datasets/solanaclawd/solana-clawd-core-ai-instruct) |
| `solanaclawd/solana-clawd-instruct` | 36,109 | [![HF](https://img.shields.io/badge/HF-dataset-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) |
| `solanaclawd/solana-clawd-realtime-research-instruct` | 29,058 | [![HF](https://img.shields.io/badge/HF-dataset-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct) |
| `solanaclawd/solana-clawd-nvidia-trading-factory-instruct` | 142 | [![HF](https://img.shields.io/badge/HF-dataset-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct) |
| `solanaclawd/solana-tx-foundation-cpt` | 19,542 | [![HF](https://img.shields.io/badge/HF-dataset-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/datasets/solanaclawd/solana-tx-foundation-cpt) |
| `solanaclawd/solana-clawd-eval` | 13 | [![HF](https://img.shields.io/badge/HF-dataset-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval) |

## Evals

| Run | Model | Score | Links |
|---|---|---|---|
| Solana MCQ benchmark (18Q) | `solanaclawd/solana-clawd-core-ai-1.5b-lora` | **94.4% (17/18)** | — |
| HF Jobs A100 training | `solanaclawd/solana-clawd-core-ai-1.5b-lora` | **82.9% token acc, loss 0.9008** | [![HF Job](https://img.shields.io/badge/HF-job-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/jobs/ordlibrary/6a35a6833093dba73ce2a86b) |
| Trading Factory A100 | `solanaclawd/solana-nvidia-trading-factory-8b-lora` | **85.5% token acc, loss 0.8064** | [![HF Job](https://img.shields.io/badge/HF-job-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/jobs/ordlibrary/6a35a2ce953ed90bfb945009) |
| W&B Weave baseline | `OpenPipe/Qwen3-14B-Instruct` | 60% (12/20) | [![W&B](https://img.shields.io/badge/W%26B-trace-FFBE00?logo=weightsandbiases)](https://wandb.ai/clawdsolana-clawd/clawd/r/call/019edb80-957d-70dc-9289-9a27b188e57b) |
| W&B live metrics | all runs | — | [![W&B](https://img.shields.io/badge/W%26B-clawd-FFBE00?logo=weightsandbiases)](https://wandb.ai/clawdsolana-clawd/clawd) |

## Spaces

| Space | Description |
|---|---|
| [![HF Space](https://img.shields.io/badge/Space-brave--new--world-FFD21F?logo=huggingface&logoColor=black)](https://huggingface.co/spaces/solanaclawd/brave-new-world) | Live Clawd demo — chat, perps tools, ZK reasoning |

---

## One-shot bootstrap

```bash
# Decentralized compute network bootstrap
curl -fsSL https://onchain.x402.wtf/install.sh | bash

# Audit, train, register — one command
curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd-ai-training/main/scripts/solana_ai_model_kit.sh | bash

# From clone
git clone https://github.com/Solizardking/solana-clawd-ai-training
cd solana-clawd-ai-training
export HF_TOKEN=hf_...          # huggingface.co/settings/tokens
./scripts/launch_hf_jobs.sh a100-large
./dao/register_model.sh --hf-model "YOUR_ORG/your-model"
```

---

## The Decentralized Solana SVM AI & Compute Network

The future of AI should not be locked behind corporate walls.

It should be open.
It should be fast.
It should reward the people who power it.
And it should run on-chain.

That future is **Clawd** — a decentralized AI and compute network built natively for the Solana SVM.

---

### The Problem: AI Is Becoming Too Centralized

Today, the most powerful AI systems are controlled by a small group of corporations. They decide who gets access, what the models are allowed to say, what values are embedded into the systems, and how expensive intelligence becomes.

This creates a dangerous bottleneck.

When AI creation is centralized, the world gets fewer builders, less open experimentation, more corporate bias, restricted access, and a massive waste of compute. Training data becomes narrow. Incentives become misaligned. Contributors are rarely rewarded fairly. And the public is left watching from the outside while the future is built behind closed doors.

AI should not belong to five companies.

It should belong to everyone willing to contribute compute, data, verification, models, and intelligence.

That is the mission of **Clawd**.

---

### Introducing Clawd

**Clawd is a decentralized Solana-native AI and compute supercloud.**

It lets anyone with GPU power participate in AI creation, earn rewards, and help build open models while preserving privacy and settling payments instantly on Solana.

Clawd is not just another chatbot project. It is a full AI production network with three core layers:

1. **Clawd Arena** — competitive model training
2. **Clawd Swarm** — decentralized GPU coordination
3. **Clawd Nexus** — production inference and model marketplace

Together, these layers create a complete system for training, refining, launching, and monetizing AI models on Solana.

The home of Clawd is **[onchain.x402.wtf](https://onchain.x402.wtf)**.

---

### Clawd Arena: The Training Battlefield

Clawd Arena is where AI models compete. Compute Nodes enter training tasks and race to produce the best-performing models. Every task becomes a battlefield of intelligence, optimization, and verifiable contribution.

Instead of one centralized lab deciding which model wins, Clawd lets the network compete openly. Performance is measured, ranked, and rewarded through Solana programs. The best outputs rise to the top. The strongest models move forward. The contributors who create value get paid.

---

### Clawd Swarm: The Decentralized Compute Collective

Once top models emerge from the Arena, they move into **Clawd Swarm** — the decentralized GPU layer. Thousands of nodes contribute GPU power, private data signals, evaluations, and optimization cycles without exposing raw private data. Clawd coordinates this swarm through Solana, handling payments, scoring, aggregation, and slashing with speed and transparency.

The result is a living AI network that gets stronger as more people join.

More GPUs. More contributors. More intelligence. More rewards flowing back to the people who built it.

---

### Clawd Nexus: The AI Marketplace

Clawd Nexus is where trained models become real products. Once a model is ready, it can be deployed as an inference endpoint inside the Clawd network. Builders, agents, apps, and users can call these models, pay through Solana-native rails, and generate real revenue for the contributors behind them.

This turns AI models into on-chain economic assets. Every useful inference can reward the people who helped create, train, evaluate, and serve the model.

---

### How Clawd Works

```
Task created → Compute Nodes compete in Clawd Arena
  → Best models move into Clawd Swarm for refinement
  → Finished models launch through Clawd Nexus
  → Real usage generates real rewards → repeat
```

All of this is coordinated by Solana. Participants stake **$CLAWD**, contribute verifiable work, and earn based on their actual value to the network.

---

### Why Solana?

Clawd is built on Solana because decentralized AI needs speed.

| Feature | Impact |
| --- | --- |
| Parallel execution (Sealevel) | Thousands of concurrent AI tasks without queue bottlenecks |
| Sub-cent fees | Micro-rewards are worth claiming — every training step can be paid |
| 400ms block time | Real-time coordination between compute nodes and verifiers |
| cNFTs | Cheap versioned model checkpoints anchored on-chain |
| SPL token extensions | Atomic reward splits across trainers, verifiers, and data contributors |

---

### Flagship Intelligence: DeepSolanaZKr-1

The first major model emerging from Clawd is **DeepSolanaZKr-1** — combining recursive zero-knowledge reasoning, DeepSeek-style advanced reasoning, and Solana's parallel runtime into a new kind of AI-ZK intelligence layer.

| Target Metric | Value |
| --- | --- |
| ZK verification speedup | 93× |
| AI-ZK transactions/sec | 28,000 |
| Transaction cost | 0.0003 SOL |
| Execution speedup vs rollups | 48× |
| Privacy cost reduction | 91% |

```bash
ollama run 8bit/DeepSolana
```

---

### What This Opens Up

**Private credential verification** — An AI agent proves qualifications without revealing salary history, client data, or work records.

**Autonomous energy trading** — A solar farmer's Clawd agent sells excess power, optimizes pricing, and settles on Solana for a fraction of legacy costs.

**AI self-improvement** — A student trains an AI twin that contributes to the network and earns passive income through real usage.

Private intelligence. Open participation. Instant rewards. On-chain ownership.

---

### The Future Is Open AI on Solana

Clawd is a decentralized AI and compute network where anyone can contribute, compete, earn, deploy, and build.

AI becomes open. Compute becomes liquid. Models become on-chain assets. Contributors become owners.

Powered by **$CLAWD**. Running on **Solana**. Live at **[onchain.x402.wtf](https://onchain.x402.wtf)**.

---

## The Foundation — Why Blockchain + AI?

We are standing at the edge of a paradigm shift. For decades, the development of artificial intelligence has been concentrated in the hands of a few: large corporations with access to proprietary datasets, enormous compute budgets, and closed feedback loops. The models that emerged were powerful — but opaque, biased, and inaccessible to most of the world.

Two technologies are changing that. Together, they open a door to **On-Chain Reinforcement Learning (ORL)** — a framework in which AI models learn, improve, and are rewarded entirely on decentralized infrastructure.

### Transparency and Trust

Blockchain technology introduced a new paradigm for secure, decentralized, and transparent data management. Recording training data provenance on-chain means developers — and the public — can trace the lineage of every model weight, every gradient update, every reward signal.

At the World Economic Forum in Davos, executives noted that blockchain could be instrumental in monitoring the data used to train AI models, thereby preventing bias. This is not a future possibility — it is an architectural decision we can make today.

### The Convergence

| Domain | How Blockchain + AI Applies |
| --- | --- |
| Healthcare | Blockchain-verified patient records, analyzed by federated AI models, enable privacy-preserving diagnosis without data leaving the hospital |
| Sustainable Energy | AI-optimized grids, powered by tokenized renewable energy markets, reduce waste and carbon output at scale |
| Financial Inclusion | Decentralized microfinance platforms with AI lending algorithms reach communities that traditional banks ignore |
| Solana-Native DeFi | Thousands of TPS at sub-cent fees makes Solana uniquely suited as the settlement and coordination layer for AI training pipelines |

---

## Part II — Decentralized AI Training Architecture

Decentralized AI training distributes the process of building AI models across multiple independent nodes in a blockchain network. Instead of relying on a centralized data repository or a single compute provider, training transactions are coordinated and recorded on-chain — ensuring data integrity and security throughout.

| Component | Description |
| --- | --- |
| Data Sharing | Data owners contribute datasets to model training without transferring raw data off-premises. The blockchain records contributions and preserves each participant's data rights. |
| Model Training | AI models train across multiple decentralized nodes, each on different data subsets — federated learning with a cryptographic audit trail. |
| Aggregation | After local training, improvements (updated weights, gradients) are aggregated. Blockchain ensures this is secure, transparent, and that contributors are rewarded fairly. |

**Benefits**

| Benefit | Description |
| --- | --- |
| Privacy | Data stays local; only model updates move across the network |
| Reduced Bias | Diverse contributors produce more generalizable models |
| Incentivization | Token rewards drive participation from data owners and compute providers |
| Auditability | Every training step is verifiable on-chain — forever |

---

## Part III — Consensus Learning: Blockchain as the Arbiter of Intelligence

Consensus Learning (CL) creates decentralized AI models where participants never share raw data or model weights — only predictions. The blockchain coordinates the consensus protocol that turns individual predictions into a collectively optimal output.

**Phase 1 — Individual Learning**: Each participant trains their own model on private data. No sensitive information is disclosed. After training, participants submit initial predictions through a smart contract or Proof-of-Stake mechanism.

**Phase 2 — Communication**: Participants transmit predictions to peers via a gossip protocol. Each participant updates their prediction based on the quality and confidence of peers' outputs, converging on a consensus.

| Project | Approach | What CL Does Differently |
| --- | --- | --- |
| Bittensor | Incentivized subnet inference | CL uses gossip consensus on predictions, not validator scoring |
| FLock.io | Federated fine-tuning + rewards | CL never shares gradients or weights, only prediction outputs |
| Ritual | AI coprocessor for contracts | CL aggregates knowledge without a trusted coprocessor |

CL is Byzantine-resilient and data-confidential by design. Malicious nodes are filtered through confidence-weighted aggregation — the gossip protocol makes it safe by construction.

---

## Part IV — On-Chain Reinforcement Learning

ORL extends Consensus Learning to the temporal, reward-driven domain — where agents learn by taking actions in an environment and receiving feedback over time.

The blockchain serves three roles: **Environment Record** (every state, action, and reward written to chain, creating a tamper-proof trajectory log), **Reward Oracle** (smart contracts define the reward function: objective, transparent, and uncorrupted by any single party), and **Coordination Layer** (multiple agents learn in parallel; the chain aggregates their experiences into a shared replay buffer).

**The ORL Training Loop**

```
1. Observe State    — Agent reads on-chain data: prices, liquidity, governance
2. Take Action      — Generates prediction, executes trade, submits vote
3. Receive Reward   — Smart contract returns transparent, immutable reward
4. Write to Chain   — Transition (state, action, reward, next_state) → on-chain replay buffer
5. Update Policy    — Aggregator samples replay buffer, updates shared policy weights
6. Commit Checkpoint — Updated model committed to chain (or IPFS with on-chain hash via cNFT)
7. Reward Participants — Stakers earn proportional to contribution quality → repeat
```

This loop creates a self-improving, collectively owned AI system — one that gets smarter as more participants contribute, and whose entire learning history is permanently auditable. **The blockchain does not just store the model. It is the model's teacher.**

### Why Solana?

| Feature | Value |
| --- | --- |
| Block time | 400ms — near-real-time environment steps recorded on-chain |
| Transaction cost | <$0.001 — economically viable to log millions of training steps |
| Programs | Smart contracts define complex, programmable reward functions on-chain |
| cNFTs | Compressed NFTs for cheap, versioned model checkpoints at scale |

### DeepSolana — The Reference Model

DeepSolana is the first open-weight model in this lineage — a Solana-native language model trained on blockchain transaction data, protocol documentation, and on-chain events. A pretrained base for fine-tuning on task-specific reward signals, distributed via Ollama for local inference with zero cloud dependency.

```bash
ollama run 8bit/DeepSolana
```

---

## Part V — Live: The Onchain Model Kit

The architecture above is not theoretical. The Solana Clawd AI Training pipeline is an operational, reproducible LoRA fine-tuning system — registered on-chain, attested by validators, and served through ClawdRouter.

**Published Assets**

| Artifact | Type | Size |
| --- | --- | --- |
| `solanaclawd/solana-clawd-core-ai-instruct` | Dataset | 35,173 SFT examples |
| `solanaclawd/solana-clawd-realtime-research-instruct` | Dataset | 29,058 examples |
| `solanaclawd/solana-clawd-nvidia-trading-factory-instruct` | Dataset | 142 examples |
| `solanaclawd/solana-nvidia-trading-factory-8b-lora` | Model | Hermes-3-8B · 85.5% eval accuracy |
| `solanaclawd/solana-clawd-core-ai-1.5b-lora` | Model | Qwen2.5-1.5B · 82.9% token accuracy |

**Register a Model (One Curl)**

```bash
curl -X POST https://onchain.x402.wtf/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "model_type":    "TextGeneration",
    "api_endpoint":  "https://clawd-box-router.fly.dev/v1",
    "hf_model_id":   "YOUR_ORG/your-model",
    "dataset_size":  36109,
    "eval_accuracy": 0.60,
    "cluster":       "devnet",
    "protocol":      "CAAP/1.0",
    "clawd_token":   "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
  }'
```

**Inference After Registration**

```bash
curl https://clawd-box-router.fly.dev/v1/chat/completions \
  -H "Authorization: Bearer clawd_free_public" \
  -d '{
    "model": "solanaclawd/solana-clawd-1.5b",
    "messages": [
      {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent."},
      {"role": "user", "content": "What is the SOL-PERP funding rate on Phoenix?"}
    ]
  }'
```

Query the live registry: [onchain.x402.wtf/.well-known/clawd-registry.json](https://onchain.x402.wtf/.well-known/clawd-registry.json)

---

## Roadmap — Twelve Months

| Quarter | Focus | Milestones |
| --- | --- | --- |
| Q3 2026 | Foundations | DeepSolana v1 on Jupiter tx dataset · On-chain replay buffer prototype · Consensus learning testnet (3–5 nodes) |
| Q4 2026 | Incentive Layer | Token-gated participation · Smart-contract reward oracle · Byzantine-fault-tolerant aggregation with slashing |
| Q1 2027 | Scale | 50+ node consensus learning network · Compressed checkpoint storage (cNFTs) · Cross-chain reward signals |
| Q2 2027 | Open Ecosystem | Public ORL API · DeepSolana v2 (ORL fine-tuned on 6mo live data) · Bittensor cross-network evaluation |

> The future is not one where a handful of companies own the intelligence layer. It is one where intelligence is grown in public, rewarded by protocol, and owned by the network.

---

## Ecosystem

| Model / Project | Role |
| --- | --- |
| [DeepSolana](https://ollama.com/8bit/DeepSolana) | Solana-native base model, ORL fine-tuning reference |
| [Bittensor](https://bittensor.com) | Incentivized subnet architecture for AI inference |
| [FLock.io](https://flock.io) | Federated fine-tuning with on-chain rewards |
| [Ritual](https://ritual.net) | AI coprocessor for infusing AI into smart contracts |
| [solanaclawd/brave-new-world](https://huggingface.co/spaces/solanaclawd/brave-new-world) | Live Clawd Space — chat, perps tools, ZK reasoning |
| [ClawdRouter](https://clawd-box-router.fly.dev) | 55+ models, 15-dimension scoring, free tier |

---

## Clawd: Decentralized Solana SVM AI & Compute Network

### The Problem with Centralised Control over AI Creation

The centralisation problem presents an overbearing barrier to AI innovation. Under the status quo, the world's largest corporations hold sway over the trajectory of AI development based on their own objectives, which do not necessarily align with the public interest.

The danger of AI being controlled by centralised corporations is that their biases and values are amplified on a global scale. They decide who gains access to the models, and their value alignment often downgrades the performance of models.

We consequently see low public participation, less access to computing power, amplified data bias and inaccuracies from less and lower quality training data, and a missed opportunity for AI to realise its maximal potential as a force for good.

There is a pressing need for an equitable distribution of rewards for those who contribute compute, data, verification, and intelligence — powered by Solana's blazing speed and near-zero fees.

---

### System Design

Clawd's system logic is comprised of three major components: **Clawd Arena**, **Clawd Swarm**, and **Clawd Nexus**.

Upon task creation, the model is first trained and validated in the Clawd Arena — a high-speed Solana SVM-powered decentralized compute battlefield — then optionally further refined at massive scale in Clawd Swarm using participants' local hardware and private data (no raw data ever leaves the device). Finally, the optimized model is deployed and monetized in the Clawd Nexus, where real-world usage and feedback loops continuously improve it via on-chain revenue sharing.

When a task is created in Clawd Arena, it is executed by Compute Nodes. These nodes train and submit models (or proofs). Verifiers evaluate submissions using standardized benchmarks and Solana-native consensus mechanisms. The fastest finality on Solana ranks the models instantly. Top models flow into Clawd Swarm for collaborative enhancement with distributed GPUs and private knowledge, producing a superior global model. The result is deployed in the Clawd Nexus as high-performance inference endpoints for apps. All participants stake $CLAWD and earn based on verifiable contribution.

---

### Solana Layer — Economic Engine

**Incentivisation**: Anchor programs and PDAs enable lightning-fast staking, task settlement, and atomic reward distribution. Sub-second finality and near-zero fees make micro-contributions profitable — anyone with a GPU can participate and earn instantly.

**Security**: Clawd combines Solana's Tower BFT + economic security with proof-of-compute mechanisms. Participants stake $CLAWD. Dishonest behaviour triggers immediate slashing visible on-chain. Solana's massive parallelism (Sealevel) allows thousands of concurrent AI tasks while keeping verification cheap and fast.

| Attack | Description | Clawd Mitigation |
| --- | --- | --- |
| Sybil Attacks | Creating many fake identities | High $CLAWD staking + Solana account rent + performance-only rewards + VRF task assignment |
| DoS Attacks | Overwhelming the network | Rate limiting + priority fees + Solana's built-in spam resistance |
| Free-rider Attacks | Submitting low-effort work | Top-K reward system + verifiable compute scoring + Solana-timed epochs |
| Lookup Attacks | Gaming validation sets | Dual hidden datasets + Solana-randomised evaluation splits |
| Poisoning Attacks | Submitting corrupted contributions | Majority voting + slashing + verifiable GPU/TEE proofs |

---

### AI & Compute Layer

**Clawd Arena** — A competitive, Solana-timed training battlefield. Compute Nodes race to deliver the best-performing model for any task. Leaderboards and instant ranking via Solana programs drive rapid iteration and reward the strongest contributors.

**Clawd Swarm** — The decentralized high-performance compute collective. Thousands of nodes contribute GPU power and private data signals without ever sharing raw data. Solana coordinates aggregation, payments, and slashing in real time — enabling true swarm intelligence at web2 speeds and costs.

**Clawd Nexus** — The production and monetization hub. Deploy models as unstoppable inference endpoints. Developers integrate via simple APIs, pay with Solana Pay, and revenue is automatically split to trainers, verifiers, data contributors, and compute providers.

---

### Participants

**Compute Nodes** — Provide GPU/TPU resources, stake $CLAWD, train or run inference jobs, and compete for top rewards.

**Verifiers** — Stake $CLAWD, run standardized benchmarks, and earn for accurate scoring. Solana's speed makes verification highly profitable.

**Delegators / Patrons** — Support top nodes or verifiers by delegating $CLAWD. Earn a share of their rewards effortlessly via the Clawd dashboard (Phantom/Solflare compatible).

---

### Quickstart — Arena Dashboard

1. Go to [arena.clawd.io](https://arena.clawd.io), connect Phantom or Solflare wallet
2. Stake $CLAWD on a task
3. Get your `CLAWD_API_KEY` from the dashboard
4. Run a training node:

```bash
git clone https://github.com/Solizardking/solana-clawd-ai-training
cd solana-clawd-ai-training
export TASK_ID=<task-id>
export CLAWD_API_KEY=your-key
export HF_TOKEN=hf_...
./scripts/launch_hf_jobs.sh a100-large    # compete on any base model with LoRA
./dao/register_model.sh --hf-model "YOUR_ORG/your-model" --eval-accuracy 0.80
```

5. Claim rewards instantly or on epoch close via the dashboard

---

### Verifier Guide

Stake $CLAWD → Get API key → Run verification loop with your GPU/CPU. Rewards auto-distributed via Solana.

```bash
git clone https://github.com/Solizardking/solana-clawd-ai-training
cd solana-clawd-ai-training
python3 scripts/solana_benchmark.py --model YOUR_ORG/submitted-model  # score a submission
```

---

### Task Lifecycle

```
Task creation → Solana program registers task + bounty
  → Compute Nodes compete → Verifiers score
  → Top models advance to Swarm
  → Final model listed in Nexus with revenue share enabled
```

---

### Solana Programs

| Program | Role |
| --- | --- |
| `ClawdStakeProgram` | Staking, delegation, PDAs |
| `ClawdArenaTaskManager` | Task creation, assignment, top-K logic |
| `ClawdSwarmCoordinator` | Role randomisation, aggregation, slashing |
| `ClawdRewardDistributor` | Atomic payouts using SPL token extensions |
| `ClawdNexusRegistry` | Model listing, inference revenue splitting |
| `3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj` | `solana_ai_inference` Anchor program (devnet) |

All built with Anchor for maximum speed and security.

---

### Model API / Inference (Nexus)

Use `api.nexus.clawd.io` endpoints with your API key. Revenue flows back to creators and compute providers automatically.

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.nexus.clawd.io/v1", api_key="your-clawd-key")
response = client.chat.completions.create(
    model="solanaclawd/solana-clawd-core-ai-1.5b-lora",
    messages=[{"role": "user", "content": "How do I detect a rug pull on Solana?"}],
)
print(response.choices[0].message.content)
```

---

## What this is (Training Pipeline)

A reproducible LoRA fine-tuning pipeline that takes a base instruct model
(`Qwen/Qwen2.5-1.5B-Instruct`, with `NousResearch/Hermes-3-Llama-3.1-8B` as a
larger tool-use-capable variant) and turns it into a **Clawd**:
a constitutionally-grounded, Solana-fluent, degen-wary AI agent that lives
in the trenches without becoming the rug.

The dataset is curated from the solana-clawd repository (AGENTS.md,
CONSTITUTION.md, the 137+ skills, the three-laws, and the agent catalog)
plus targeted reference material on Solana primitives, DeFi, perpetuals,
and the agent's own runtime capabilities (voice agent, MCP skills catalog,
Composio provider, ZK primitives, HF Router, ClawdRouter, x402).

## Repo layout

```text
ai-training/
├── README.md                       ← you are here
├── requirements.txt                ← Python deps (HF stack + openai + httpx + mcp)
├── .gitignore                      ← excludes checkpoints / outputs / secrets
├── data/
│   ├── solana_clawd_seed.jsonl     ← original seed SFT pairs (47 constitutional conversations)
│   ├── solana_clawd_merged.jsonl   ← merged dataset v2 (36,109 conversations — canonical training input)
│   ├── solana_clawd_eval.jsonl     ← held-out eval prompts (13 conversations)
│   ├── eval_card.md                ← eval dataset card (upload to Hub)
│   └── processed/                  ← output of prepare_dataset.py (parquet + arrow, train/eval/test)
├── solana1_yourgpt.jsonl           ← source: 8,970 Solana Alpaca-format QA pairs (normalized into merged)
├── trainingday.jsonl               ← source: 27,092 Solana API/RPC messages-format pairs (normalized into merged)
├── configs/
│   ├── lora_config.yaml            ← LoRA + training hyperparameters (Qwen2.5-1.5B) — W&B logging enabled
│   ├── hermes3_lora_config.yaml    ← LoRA config for Hermes-3-Llama-3.1-8B (r=32, 4-bit)
│   ├── deep_solana_cpt_config.yaml ← continued pre-training config (DeepSolana-GPT2 corpus)
│   └── eval_config.yaml            ← evaluation config
├── scripts/
│   ├── prepare_dataset.py          ← JSONL → HF Datasets (parquet), multi-file --input support
│   ├── realtime_dataset_ingest.py  ← PDF/JSON/notebook/parquet/text → realtime HF dataset
│   ├── build_nvidia_trading_factory_dataset.py ← Solana spot/perps NVIDIA trading factory SFT builder
│   ├── solana_ai_model_kit.sh      ← curlable one-shot audit/train/register bootstrap
│   ├── submit_dataset_file.sh      ← drop-in file submit wrapper for realtime_dataset_ingest.py
│   ├── train_lora.py               ← LoRA SFT via TRL + PEFT
│   ├── evaluate.py                 ← held-out inference eval
│   ├── wandb_eval.py               ← W&B Weave benchmark eval (JSON QA, traces to clawdsolana-clawd/clawd)
│   ├── launch_hf_jobs.sh           ← submit remote GPU job (passes WANDB_API_KEY, 6h timeout)
│   ├── auto_research.py            ← Percolator-style recursive wiki generator (see §Percolator AutoResearch)
│   ├── ingest_wiki_data.py         ← pulls 18 SFT pairs from clawd-autoresearch-wiki → seed dataset
│   ├── solana_benchmark.py         ← 18-MCQ Solana Knowledge Benchmark (OpenAI-compatible endpoint)
│   ├── hermes3_inference.py        ← 3-mode Hermes-3 inference: HF Router / pipeline / direct
│   ├── solana_client.py            ← 8-command Solana RPC tool (wallet/tx/token/nft/whales/stats/price)
│   ├── download_deep_solana.py     ← DeepSolana-GPT2-bucket downloader + GPT-2→text decoder
│   └── add_v2_examples.py          ← one-off script that seeded the v2 dataset examples
├── memory/
│   └── honcho.py                   ← Honcho persistent cross-session memory (remember/recall/dream)
├── perps/                          ← Hermes-3 function calling for Solana perps (example agent space)
│   ├── functions.py                ← 13 perps tools (sol price, funding rate, paper trade, risk...)
│   ├── functioncall.py             ← HermesPerpsAgent inference loop (HF Router / local, GOAP mode)
│   ├── schema.py                   ← Pydantic models: FunctionCall, TradeOrder, RiskAssessment...
│   └── prompter.py                 ← system prompt builder (standard / GOAP / JSON mode)
├── dao/                            ← Onchain AI registry + DAO governance
│   ├── DAO_DESIGN.md               ← Architecture, safety constraints, governance flows
│   ├── register_model.sh           ← One-shot curl model registration to onchain.x402.wtf
│   ├── register_model.ts           ← TypeScript: initialize_model Anchor instruction
│   └── attestation/
│       ├── create_attestation.ts   ← SAS compressed attestation for dataset/eval/adapter artifacts
│       └── attestations.jsonl      ← Local index of created attestations
├── dataset_card.md                 ← dataset README (upload to Hub)
├── model_card.md                   ← model README (upload to Hub)
├── model-kit/
│   └── README.md                   ← public one-shot Solana AI Model Kit guide
├── outputs/                        ← Community article, model cards (gitignored checkpoints)
│   ├── community-article.md        ← First public announcement (HF blog)
│   └── Clawd-GLM-5.2-README.md    ← GLM-5.2 model card
├── checkpoints/                    ← (gitignored) LoRA adapter weights
└── data/
    ├── research_manifest.db        ← SQLite: visited URLs for AutoResearch dedup
    └── autoResearch.jsonl          ← AutoResearch output (appended each cycle)
```

See also: [`skills/solana-rpc/SKILL.md`](../skills/solana-rpc/SKILL.md) — the
Clawd skill registration for `scripts/solana_client.py`, and
[`hermes-agent/`](../hermes-agent/) — the `clawd-operator` Hermes adapter and
`clawd-agent` Phoenix/Oracle tool integrations that consume `perps/functions.py`.

## The Hugging Face integration

We use the Hub as the **source of truth** for every artifact in the
training pipeline. The whole point is that a new Clawd agent, spawned
anywhere in the world, can `pip install` nothing, set a `HF_TOKEN`, and
pull the latest model + dataset in two lines.

### Repos in the `solanaclawd` org

| Repo | Type | Purpose |
| --- | --- | --- |
| [`solanaclawd/solana-clawd-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) | dataset | **36,109 examples** — SFT instruction pairs (system/user/assistant), 32,498/1,805/1,806 train/eval/test |
| [`solanaclawd/solana-clawd-core-ai-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-core-ai-instruct) | dataset | **35,173 examples** — public-safe blend of `core-ai` source chunks, `core-ai` knowledge JSONL, and the cleaned `ai-training` SFT corpus |
| [`solanaclawd/solana-clawd-realtime-research-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct) | dataset | **29,058 examples** — submitted PDFs, notebooks, parquet Solana QA, and ZK skill context; 26,152/1,452/1,454 train/eval/test |
| [`solanaclawd/solana-clawd-nvidia-trading-factory-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct) | dataset | **142 examples published** — NVIDIA trading-factory stage plans, Solana spot/perps market scenarios, cuFOLIO/cuOpt Mean-CVaR specs, Vulcan/Phoenix paper strategy specs, Rise read plans, autoresearch perps references, perps tool-use, and risk refusals; 127/7/8 train/eval/test |
| `solanaclawd/solana-tx-foundation-cpt` | dataset | **19,542 examples** — Solana tx records in NeMo CPT format, tokenized by `SolanaTokenizerPipeline` (vocab_size=4886); used for Blueprint 1 continued pre-training |
| [`solanaclawd/solana-clawd-eval`](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval) | dataset | Held-out eval prompts (red-team + capability, 13 conversations) |
| [`solanaclawd/solana-clawd-core-ai-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-core-ai-1.5b-lora) | model | Qwen2.5-1.5B LoRA adapter — **LIVE** (pushed 2026-06-19T23:44Z); recovery job [`ordlibrary/6a35a6833093dba73ce2a86b`](https://huggingface.co/jobs/ordlibrary/6a35a6833093dba73ce2a86b) completed on A100-large in 3h 14m; train_loss=0.9008, token_accuracy=82.9%, 24.54M tokens |
| `solanaclawd/solana-tx-foundation-1.5b` | model | Qwen2.5-1.5B CPT+SFT model (Blueprint 1) — **in training**; base → CPT on `solana-tx-foundation-cpt` → SFT on merged 30K pairs |
| [`solanaclawd/solana-nvidia-trading-factory-8b-lora`](https://huggingface.co/solanaclawd/solana-nvidia-trading-factory-8b-lora) | model | Hermes-3-8B LoRA adapter for the Solana NVIDIA trading factory dataset; completed HF job `ordlibrary/6a35a2ce953ed90bfb945009` |
| [`solanaclawd/solana-clawd-1.5b`](https://huggingface.co/solanaclawd/solana-clawd-1.5b) | model | Merged bf16 model (base + LoRA), vllm-ready |
| [`solanaclawd/solana-clawd-7b-lora`](https://huggingface.co/solanaclawd/solana-clawd-7b-lora) | model | Optional larger variant (Qwen2.5-7B-Instruct) |

**External NVIDIA models** used by this pipeline (via NIM API or HF Inference API — not published under `solanaclawd`):

| Model | Access | Role |
| --- | --- | --- |
| `nvidia/nemotron-3-nano-30b-a3b` | NIM API (`NVIDIA_API_KEY`) | Primary reasoning — signal verdicts, portfolio narration, distillation |
| `nvidia/nemotron-3-super-120b-a12b` | NIM API (`NVIDIA_API_KEY`) | Teacher model — SFT labeling and CoT distillation (Blueprint 3) |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16` | HF Inference API (`HF_TOKEN`) | Local pipeline fallback when no `NVIDIA_API_KEY`; set `NVIDIA_USE_PIPELINE=1` for local weights |
| `nvidia/nv-embedqa-e5-v5` | NIM API | RAG embedding (Blueprint 5 — enterprise-rag) |
| `nvidia/nv-rerankqa-mistral-4b-v3` | NIM API | RAG reranker (Blueprint 5) |

### Dataset viewer

<iframe
  src="https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct/embed/viewer/default/train"
  frameborder="0"
  width="100%"
  height="560px"
></iframe>

### Local CLI setup

```bash
# Install the CLI (macOS / Linux)
curl -LsSf https://hf.co/cli/install.sh | bash -s

# Or via pip (anywhere)
pip install --upgrade huggingface_hub

# Authenticate
hf auth login                  # paste a token from huggingface.co/settings/tokens
hf auth whoami                 # verify

# Install the CLI skill so any agent (Cline, Claude Code, Cursor, etc.) knows the commands
hf skills add --global
# (or for Claude Code: hf skills add --claude --global)
```

### One-time setup for the training pipeline

```bash
# Install Python deps
python3 -m pip install -r requirements.txt

# Verify the dataset + model repos exist
hf repos list --namespace solanaclawd
```

## The end-to-end pipeline

### 1. Curate the dataset

The canonical training input is `data/solana_clawd_merged.jsonl` — **36,109 conversations**
assembled from three sources, all normalized to `{"messages": [...]}` format with the
Clawd system prompt prepended where missing:

| Source file | Format | Examples | Notes |
| --- | --- | --- | --- |
| `data/solana_clawd_seed.jsonl` | messages (Clawd system prompt) | 47 | Original constitutional seed |
| `solana1_yourgpt.jsonl` | Alpaca (`instruction`/`input`/`output`) | 8,970 | Solana QA pairs — normalized by merge script |
| `trainingday.jsonl` | messages + `metadata` | 27,092 | Solana API/RPC docs — metadata stripped, system prompt injected |

The Alpaca normalizer handles both layout variants in `solana1_yourgpt.jsonl`:

- `instruction` non-empty → user = instruction (+ `\n\nContext:\n` + input if present)
- `instruction` empty → user = `input` field (question was in the wrong column)

To add more sources, append a new JSONL to the merge command and re-run `prepare_dataset.py`:

```bash
# Re-merge after adding a new source file
python3 - << 'EOF'
import json

SYSTEM = "You are Clawd, a sovereign Solana-native AI agent. ..."

with open("data/solana_clawd_merged.jsonl", "a") as out:
    with open("data/my_new_source.jsonl") as f:
        for line in f:
            obj = json.loads(line.strip())
            # normalize and write
EOF
```

### 2. Prepare the dataset (parquet + Hub)

```bash
# From the merged file (canonical)
python3 scripts/prepare_dataset.py \
  --input data/solana_clawd_merged.jsonl \
  --output data/processed \
  --train-ratio 0.9 --eval-ratio 0.05 \
  --seed 42 \
  --push --repo-id solanaclawd/solana-clawd-instruct
```

This validates each example, splits 90/5/5, writes parquet for streaming
access, and (with `--push`) uploads to the Hub dataset.

### 2b. Submit PDFs/JSON/notebooks/parquet as realtime datasets

`scripts/realtime_dataset_ingest.py` converts submitted files into the same
messages schema used by the SFT trainer. It supports `.pdf`, `.json`, `.jsonl`,
`.ipynb`, `.parquet`, `.md`, `.txt`, `.yaml`, and `.yml`, filters
high-confidence secret patterns, dedupes duplicate files by SHA256, and writes:

- `data/realtime_research_sft.jsonl`
- `data/realtime_research_processed/{train,eval,test}.parquet`
- `data/realtime_research_dataset_manifest.json`
- `data/realtime_research_dataset_card.md`

The current config ingests the submitted research PDFs, the Solana notebook and
parquet dataset, and the local `zk` skill:

```bash
python3 scripts/realtime_dataset_ingest.py \
  --config configs/realtime_dataset_config.yaml

# Submit arbitrary files and push the refreshed public dataset:
./scripts/submit_dataset_file.sh /path/to/paper.pdf /path/to/records.json -- --push

# Drop-folder mode:
python3 scripts/realtime_dataset_ingest.py \
  --config configs/realtime_dataset_config.yaml \
  --watch-dir data/incoming \
  --watch \
  --push
```

Published dataset:
[`solanaclawd/solana-clawd-realtime-research-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct).

NVIDIA Nemotron / NeMo Retriever extraction is supported for the PDF stage,
following the NVIDIA Nemotron RAG document-processing pattern: extract text,
tables as markdown, and chart elements through `nv-ingest`, then normalize the
structured output into chat-style SFT rows.

```bash
# Keep this in your shell or secret manager only. Do not write it into YAML,
# markdown, manifests, commits, or Hub uploads.
export NVIDIA_API_KEY=<from-build.nvidia.com>

# Install the optional NVIDIA stack only in the GPU/NIM extraction environment.
python3 -m pip install nv-ingest==26.1.1 nv-ingest-api==26.1.1 nv-ingest-client==26.1.1

python3 scripts/realtime_dataset_ingest.py \
  --config configs/realtime_dataset_config.yaml \
  --pdf-extractor nvidia
```

In `pdf_extractor: auto` mode, the builder tries NVIDIA first when
`NVIDIA_API_KEY` is present, then Google Document AI/Gemini, then local
`pypdf`. NVIDIA extraction caches provider responses under `data/nvidia_cache/`
and records only provider/method metadata, not API keys.

Google-backed PDF extraction is built in:

```bash
# Gemini API-key path. Uses GEMINI_API_KEY first, then GOOGLE_API_KEY.
export GEMINI_API_KEY=...
python3 scripts/realtime_dataset_ingest.py \
  --config configs/realtime_dataset_config.yaml \
  --pdf-extractor gemini

# Document AI processor path. Uses the configured :process endpoint and labels.
# Requires OAuth/ADC, for example `gcloud auth application-default login`,
# GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_DOCUMENTAI_ACCESS_TOKEN.
python3 scripts/realtime_dataset_ingest.py \
  --config configs/realtime_dataset_config.yaml \
  --pdf-extractor documentai \
  --documentai-label client=clawd
```

When NVIDIA is not configured, the Google-backed PDF path is still available.
Document AI requests use the processor endpoint in `configs/realtime_dataset_config.yaml`:
`https://us-documentai.googleapis.com/v1/projects/1013652097839/locations/us/processors/29a612e70aee73e1:process`.
Use Application Default Credentials from `gcloud auth application-default login`
or a service-account path in your shell environment. Do not add Google OAuth
client-secret files, ADC JSON, access tokens, or API keys to config files,
dataset cards, manifests, commits, or Hub uploads.
The config also sends `x-goog-user-project: x402-477302` for quota attribution;
Document AI still requires billing to be enabled on the processor project
(`1013652097839`). If that project returns `BILLING_DISABLED`, enable billing
there or point `documentai_endpoint` at a processor owned by a billing-enabled
project.

### 2c. Build the NVIDIA Solana trading-factory dataset

`scripts/build_nvidia_trading_factory_dataset.py` creates a separate SFT lane
for an NVIDIA-style algorithmic trading factory specialized to Solana spot and
perpetual futures. It uses:

- NVIDIA trading-factory architecture patterns: market ingestion, research,
  optimization, inference, execution policy, and monitoring.
- NVIDIA Quantitative Portfolio Optimization patterns: cuML KDE scenario
  generation, RAPIDS/cuDF returns and backtesting, cuFOLIO/cuOpt Mean-CVaR
  optimization, CVaR/leverage/budget/turnover/cardinality constraints, and
  CVXPY/cuOpt solver handoff.
- Local Clawd perps tools: SOL/token prices, Phoenix markets/funding/orderbook,
  Jupiter quotes, paper trades, wallet checks, trader history, and position-risk
  scoring.
- Clawd trust gates: observer, dry-run/paper, delegated confirmation, and
  strictly gated live execution.

```bash
python3 scripts/build_nvidia_trading_factory_dataset.py

python3 scripts/prepare_dataset.py \
  --input data/nvidia_trading_factory_sft.jsonl \
  --output data/nvidia_trading_factory_processed \
  --train-ratio 0.9 --eval-ratio 0.05 \
  --seed 42

python3 scripts/train_lora.py \
  --config configs/nvidia_trading_factory_lora_config.yaml \
  --dry-run

python3 scripts/verify_trading_factory_release.py --local-only --strict
```

Current artifacts, verified with `scripts/verify_trading_factory_release.py --strict`:

- `data/nvidia_trading_factory_sft.jsonl` — 142 examples
- `data/nvidia_trading_factory_processed/{train,eval,test}.parquet` — 127/7/8
- `data/nvidia_trading_factory_manifest.json`
- `data/nvidia_trading_factory_dataset_card.md`
- `configs/nvidia_trading_factory_lora_config.yaml` — Hermes-3-8B LoRA config
- `trading_factory/cufolio/` — local cuFOLIO snapshot for CVaR/scenario/rebalance references
- `trading_factory/clawd-autoresearch-wiki/perps/` — local perps research references
- `data/strategies/` — generated Vulcan paper TA configs, Rise read plan, cuFOLIO Mean-CVaR handoff, command manifest, and `nvidia_clawd_agent_plan.json`
- `nvidia/` — local NVIDIA blueprint adapters for transaction foundation modeling, portfolio optimization, model distillation, signal discovery, enterprise RAG, and AIQ
- Hub dataset — [`solanaclawd/solana-clawd-nvidia-trading-factory-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct)

Regenerate and verify the NVIDIA/NemoClawd factory plan:

```bash
python3 scripts/build_solana_trading_factory_strategies.py
python3 nvidia/integration/nemo_clawd_agent.py --mode paper
python3 perps/nvidia_perps.py --market SOL --mode observer
python3 nvidia/blueprints/aiq/agent.py --strict
python3 nvidia/scripts/verify_nvidia.py --strict
```

NVIDIA integration folders:

| Folder | What it does |
| --- | --- |
| `nvidia/blueprints/transaction-foundation-model/` | Converts Solana tx JSONL to NeMo CPT format and defines the NIM/NeMo fine-tune launch contract. |
| `nvidia/blueprints/portfolio-optimization/` | cuML KDE scenario generation plus Mean-CVaR optimizer with cuFOLIO preferred and CVXPY fallback. |
| `nvidia/blueprints/model-distillation/` | Response and CoT distillation from a Hermes/Nemotron teacher into the 1.5B Clawd student lane. |
| `nvidia/blueprints/signal-discovery/` | Phoenix perps signal agent: RSI, MACD, funding rate, orderbook imbalance, and EMA divergence via `RPC_URL` and Vulcan CLI; paper executes on accepted signals. |
| `nvidia/blueprints/enterprise-rag/` | NeMo Retriever RAG contract: nv-ingest PDFs/docs to local FAISS, rerank, then NIM/Clawd generation. |
| `nvidia/blueprints/aiq/` | Local AIQ evaluator that scores safety, artifact completeness, and 9-role coverage. |
| `nvidia/cufolio/` | GPU portfolio optimizer with Clawd CVaR, leverage, and turnover constraints; emits Vulcan paper commands. |
| `nvidia/integration/` | NIM bridge routes NVIDIA to ClawdRouter to Ollama, signal-to-trading-factory bridge, and NVIDIA SFT dataset builder. |
| `perps/` | Model-facing perps tools, schemas, function-calling harness, and `data/perps/nvidia_perps_handoff.json` generator. |

Perps signal agent quick start:

```bash
export RPC_URL=https://api.mainnet-beta.solana.com
export NVIDIA_API_KEY=<set-in-shell-only>
python3 nvidia/blueprints/signal-discovery/perps_signal_agent.py \
  --market SOL \
  --mode paper \
  --loop
```

Publish or refresh the dataset after `HF_TOKEN` is available in your shell or
an existing `hf auth login` session is active:

```bash
./scripts/publish_trading_factory_dataset.sh
```

After publishing, verify the Hub release:

```bash
python3 scripts/verify_trading_factory_release.py --strict
```

For a single guarded audit/publish entry point that can read simple local
`KEY=VALUE` env files without printing secret values:

```bash
# Audit local state, Core AI Hub state, and trading-factory local readiness.
python3 scripts/run_release_pipeline.py

# After placing HF_TOKEN in your shell or a local env file:
python3 scripts/run_release_pipeline.py --publish-trading-dataset

# Launch training. W&B is used only when WANDB_API_KEY exists in the process env.
python3 scripts/run_release_pipeline.py --launch-trading-training
```

If you want a clean local upload directory first:

```bash
python3 scripts/build_hf_release_bundle.py
cat outputs/hf_release_bundle/UPLOAD.md

# Optional full local archive for all three dataset repos:
python3 scripts/build_hf_release_bundle.py --include-published --output outputs/hf_release_bundle_all
```

Launch the trading-factory LoRA as a new HF job only when you are ready. This
helper does not cancel or modify any currently running job:

```bash
./scripts/launch_trading_factory_hf_job.sh a100-large 4h
```

Current trading-factory training job state:

- Superseded failed job: `ordlibrary/6a359f0e953ed90bfb944faf`
- Fixed failure: remote trainer attempted to load `/data/nvidia_trading_factory_processed`
  from the mounted job bucket. `scripts/train_lora.py` now falls back to
  `dataset_repo` when the configured local path is absent.
- Superseded failed replacement: `ordlibrary/6a35a02d953ed90bfb944fe3`
- Fixed failure: Hermes exposes `tokenizer.chat_template` as a dict and TRL
  expects a string when assistant-only loss is enabled. `scripts/train_lora.py`
  now normalizes dict templates and disables assistant-only loss when generation
  markers are unavailable.
- Successful retry: `ordlibrary/6a35a2ce953ed90bfb945009`
- Final evidence: the retry loaded the published Hub dataset, tokenized train
  and eval splits, built `SFTTrainer`, completed 48/48 training steps, pushed
  `adapter_config.json` and `adapter_model.safetensors`, and verified both files
  on Hub.
- Final metrics: train loss `1.1692`, eval loss `0.8064`,
  eval mean token accuracy `0.8547`.

Keep `HF_TOKEN`, `WANDB_API_KEY`, `NVIDIA_API_KEY`, wallet keys, ADC JSON, and
client-secret files in your shell or secret manager only. Do not add them to
YAML, markdown, manifests, commits, or Hub uploads.

**Current dataset lanes**:

- Core AI: **35,173** examples in `solanaclawd/solana-clawd-core-ai-instruct`
- Realtime research: **29,058** examples in `solanaclawd/solana-clawd-realtime-research-instruct`
- Trading factory: **142** examples in `solanaclawd/solana-clawd-nvidia-trading-factory-instruct`

### 3. Train (local or remote)

**Local (Mac MPS, sanity check)**:

```bash
python3 scripts/train_lora.py --num-epochs 1 --no-quant
```

**Remote (HF Jobs, A100 or H200)**:

```bash
./scripts/launch_hf_jobs.sh a100-large   # 80GB A100, ~$3/hr
./scripts/launch_hf_jobs.sh h200          # 80GB H200, ~$4/hr
./scripts/launch_hf_jobs.sh l4x1          # 24GB L4, ~$0.80/hr
```

The script passes `WANDB_API_KEY` and `WANDB_PROJECT=clawd` into the job container
so training metrics stream to the [clawdsolana-clawd/clawd](https://wandb.ai/clawdsolana-clawd/clawd)
W&B project automatically. Monitor with:

```bash
hf jobs ps
hf jobs logs <JOB_ID> --follow
hf jobs inspect <JOB_ID>
```

**Core AI release verification/recovery**:

```bash
# Verifies both datasets and the Core AI LoRA adapter files on Hugging Face.
python3 scripts/verify_core_ai_release.py --strict

# If the adapter is still missing, relaunches the Core AI job.
# Requires HF auth; W&B is attached only when WANDB_API_KEY exists in the environment.
./scripts/recover_core_ai_release.sh a100-large 4h
```

`scripts/train_lora.py` writes the adapter model card into the output directory,
checks that `adapter_config.json` and `adapter_model.safetensors` exist locally,
pushes the adapter folder to the Hub, and verifies those files are present on the
remote model repo before the job can report success.

Core AI recovery run — **COMPLETED**:

- Job: [`ordlibrary/6a35a6833093dba73ce2a86b`](https://huggingface.co/jobs/ordlibrary/6a35a6833093dba73ce2a86b)
- Hardware: `a100-large`
- Started: `2026-06-19T20:29Z` — Finished: `2026-06-19T23:44Z` (3h 14m)
- Dataset: `solanaclawd/solana-clawd-core-ai-instruct` (31,655 train rows)
- Output: `solanaclawd/solana-clawd-core-ai-1.5b-lora` — adapter files live on Hub
- **train_loss**: 0.9008 | **mean_token_accuracy**: 82.9% | **tokens**: 24.54M
- **Solana MCQ benchmark**: 17/18 = **94.4%** (1-epoch, local MPS eval)
  - Perfect: agent, constitution, defi, security, zk
  - Miss: Q3 compute unit budget (got 1.4M → correct is 200K)
- **3-epoch retrain**: running as [`ordlibrary/6a35dd23953ed90bfb945356`](https://huggingface.co/jobs/ordlibrary/6a35dd23953ed90bfb945356) (H200, 6h timeout)

#### Training run history

| Run | Job ID | Status | Base model | Output |
| --- | --- | --- | --- | --- |
| Qwen2.5-1.5B (canceled) | `6a341687ef9220ea67d99583` | CANCELED (credits) | Qwen2.5-1.5B-Instruct | — |
| DeepSolanaZKr-1 GLM-5.2 (v1) | `6a345ab22eb64285ee573432` | ERROR (ephemeral disk) | zai-org/GLM-5.2 | — |
| DeepSolanaZKr-1 GLM-5.2 (v2) | `6a345dd12eb64285ee5734b4` | ERROR (model is 1TB+) | zai-org/GLM-5.2 | — |
| **DeepSolanaZKr-1 Qwen2.5-7B** | **`6a3460cb2eb64285ee5734d9`** | **RUNNING** | **Qwen/Qwen2.5-7B-Instruct** | **ordlibrary/DeepSolanaZKr-1** |

> GLM-5.2 turned out to be a 1TB multimodal model (282 shards) — not the 5.2B text model we expected. Switched to Qwen2.5-7B-Instruct: 14.5GB bf16, fits cleanly on A100 80GB, stronger on code/Solana reasoning.

#### Current training run (2026-06-18) — DeepSolanaZKr-1 Qwen2.5-7B

| Field | Value |
| --- | --- |
| Job ID | `6a3460cb2eb64285ee5734d9` |
| URL | [huggingface.co/jobs/ordlibrary/6a3460cb2eb64285ee5734d9](https://huggingface.co/jobs/ordlibrary/6a3460cb2eb64285ee5734d9) |
| Hardware | `a100-large` — NVIDIA A100 80GB |
| Base model | `Qwen/Qwen2.5-7B-Instruct` |
| Config | `configs/glm52_lora_config.yaml` — LoRA r=32, α=64, 3 epochs |
| Dataset | `solanaclawd/solana-clawd-instruct` — 27,328 train examples (cleaned) |
| Dataset changes | Removed 78 off-topic + 575 short answers; capped QN/Helius/Alchemy at 500 each; added 20 DeepSolanaZKr-1 ZK examples |
| Est. steps | ~5,137 (27,328 ÷ batch 16 × 3 epochs) |
| Est. duration | ~2–3 hrs on A100 (GLM-5.2 is 5.2B vs 1.5B) |
| Output | `ordlibrary/DeepSolanaZKr-1` (pushed on completion) |
| W&B | [`clawdsolana-clawd/clawd`](https://wandb.ai/clawdsolana-clawd/clawd) — live training metrics |

```bash
# Watch live logs
hf jobs logs 6a3460cb2eb64285ee5734d9 --follow

# Watch W&B metrics live
# https://wandb.ai/clawdsolana-clawd/clawd
```

### 4. Evaluate

#### 4a. Held-out inference eval (local)

```bash
python3 scripts/evaluate.py --num 50
# Outputs JSON + Markdown reports in outputs/eval/
```

The report includes throughput, refusal rate on the red-team slice, average
generation length, and 20 sample generations for human review.

#### 4b. W&B Weave benchmark eval

Runs the [JSON QA benchmark](https://weave.wandb.ai/wandb/json-qa) against any
model served via the W&B Inference API, with structured traces in Weave.

```bash
export WANDB_API_KEY=<your-key-from-wandb.ai/authorize>

# Baseline (pre-fine-tune)
python3 scripts/wandb_eval.py

# Post-training eval against DeepSolanaZKr-1 (run after HF job 6a3460cb completes)
python3 scripts/wandb_eval.py --model ordlibrary/DeepSolanaZKr-1

# Traces appear live at: https://wandb.ai/clawdsolana-clawd/clawd/weave
# Run name auto-generated: eval-DeepSolanaZKr-1-hfjob-6a3460cb
```

**Eval run history:**

| Run | Model | Job | Accuracy | Format | Weave |
| --- | --- | --- | --- | --- | --- |
| Baseline | `OpenPipe/Qwen3-14B-Instruct` | — | **60%** (12/20) | 100% | [019edb80](https://wandb.ai/clawdsolana-clawd/clawd/r/call/019edb80-957d-70dc-9289-9a27b188e57b) |
| Post-SFT | `ordlibrary/DeepSolanaZKr-1` | [6a3460cb](https://huggingface.co/jobs/ordlibrary/6a3460cb2eb64285ee5734d9) | pending | pending | pending |

Run the post-SFT eval once HF job `6a3460cb2eb64285ee5734d9` completes to measure the fine-tune delta.

### 5. Deploy into Clawd agents

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
from peft import PeftModel

# Option A — merged adapter (HF Jobs output, zero extra deps)
pipe = pipeline("text-generation", model="ordlibrary/DeepSolanaZKr-1")
messages = [{"role": "user", "content": "What is a Solana compressed account?"}]
print(pipe(messages)[0]["generated_text"][-1]["content"])

# Option B — base + LoRA adapter (if adapter-only was pushed)
base = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen2.5-7B-Instruct",
    torch_dtype="auto",
    device_map="auto",
)
model = PeftModel.from_pretrained(base, "ordlibrary/DeepSolanaZKr-1")
tokenizer = AutoTokenizer.from_pretrained("ordlibrary/DeepSolanaZKr-1")
```

Or with `mlx-lm` on a Mac (fastest local path):

```bash
pip install mlx-lm
mlx_lm.generate \
  --model Qwen/Qwen2.5-1.5B-Instruct \
  --adapter solanaclawd/solana-clawd-core-ai-1.5b-lora \
  --prompt "How do I detect a rug pull on a fresh Solana token?"
```

### 6. Fireworks managed SFT

Fireworks does not accept Hugging Face dataset URLs directly for managed SFT.
Use the Hub dataset as the source of truth, then upload the JSONL export to a
Fireworks dataset or provide a supported cloud-storage URI (`gs://`, `s3://`,
or Azure Blob).

Current Fireworks run:

| Field | Value |
| --- | --- |
| Account | `accounts/beetsbyj-d25663` |
| Job | `accounts/beetsbyj-d25663/supervisedFineTuningJobs/b1rgqmi9` |
| Final state | `JOB_STATE_COMPLETED` |
| Base model | `accounts/fireworks/models/qwen2p5-7b-instruct` |
| Output model | `accounts/beetsbyj-d25663/models/clawd-glm-5-2` |
| Live-merge deployment | `accounts/beetsbyj-d25663/deployments/clawd-glm-5-2-live` (`FAILED`, Fireworks internal error) |
| Multi-LoRA deployment | `accounts/beetsbyj-d25663/deployments/qwen2p5-7b-clawd-addons` (`FAILED`, Fireworks internal error) |
| Deployment shape | `NVIDIA_A100_80GB` x2, `FP16`, min replicas 0, max replicas 1 |
| Train dataset | `accounts/beetsbyj-d25663/datasets/solana-clawd-20260617` |
| Eval dataset | `accounts/beetsbyj-d25663/datasets/solana-clawd-eval-20260617` |
| Source dataset | [`solanaclawd/solana-clawd-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) |

```bash
export FIREWORKS_API_KEY=fw_...

python3 scripts/deploy_fireworks.py \
  --account-id beetsbyj-d25663 \
  --dataset-id solana-clawd-20260617 \
  --eval-dataset-id solana-clawd-eval-20260617 \
  --base-model qwen2p5-7b-instruct \
  --output-model clawd-glm-5-2 \
  --display-name "Clawd GLM 5.2 Solana SFT" \
  --reuse-datasets

python3 scripts/monitor_fireworks_job.py \
  --account-id beetsbyj-d25663 \
  --job-id b1rgqmi9 \
  --once

python3 scripts/monitor_fireworks_deployment.py \
  --account-id beetsbyj-d25663 \
  --deployment-id qwen2p5-7b-clawd-addons \
  --once

curl https://api.fireworks.ai/inference/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIREWORKS_API_KEY" \
  -d '{
    "model": "accounts/beetsbyj-d25663/models/clawd-glm-5-2#accounts/beetsbyj-d25663/deployments/qwen2p5-7b-clawd-addons",
    "messages": [{"role": "user", "content": "What is a PDA on Solana?"}]
  }'
```

Both Fireworks deployment methods currently fail after creation with an
internal Fireworks error. The model artifact itself is `READY`; serving requires
Fireworks support to resolve the on-demand deployment failure or a different
validated deployment shape for `qwen2p5-7b-instruct`.

## Hermes-3-Llama-3.1-8B path (tool use / function calling)

For agents that need to call real tools (Solana perps, on-chain data,
Jupiter quotes) rather than just converse, use the `NousResearch/Hermes-3-Llama-3.1-8B`
base with `configs/hermes3_lora_config.yaml` and the `perps/` function-calling
suite instead of (or alongside) the 1.5B chat-only model:

```bash
# Train (8B needs a 24GB+ GPU with 4-bit, or 80GB A100/H200 in bf16)
python3 scripts/train_lora.py --config configs/hermes3_lora_config.yaml
./scripts/launch_hf_jobs.sh a100-large --config configs/hermes3_lora_config.yaml

# Inference — 3 modes in one script
python3 scripts/hermes3_inference.py --mode router "What is a PDA?"        # HF Router, no GPU
python3 scripts/hermes3_inference.py --mode pipeline "What is a PDA?"      # local transformers
python3 scripts/hermes3_inference.py --mode direct --adapter solanaclawd/solana-clawd-8b-lora "What is a PDA?"

# Function calling — 13 Solana perps tools (Phoenix DEX, Jupiter, risk assessment)
cd perps
python3 functioncall.py --query "What's the SOL-PERP funding rate? Should I go long?"
python3 functioncall.py --query "Paper trade: long SOL-PERP $500 at 3x leverage" --verbose
HERMES_LOCAL=1 python3 functioncall.py --goap --query "Assess risk of shorting SOL-PERP $1000 at 5x"
```

The 13 perps tools (`perps/functions.py`) and the matching `HermesAdapter`
(`hermes-agent/clawd-operator/adapters/hermes.py`) and Phoenix/Oracle
`Tool` wrappers (`hermes-agent/clawd-agent/tools/`) all share the same
function definitions, so a LoRA trained here drops directly into the
running agents.

## Continued pre-training: DeepSolana-GPT2-bucket

To inject raw Solana-domain text (ordinals, program source, on-chain docs)
before the instruction-tuning pass, decode the
[`ordlibrary/DeepSolana-GPT2-bucket`](https://huggingface.co/datasets/ordlibrary/DeepSolana-GPT2-bucket)
dataset and run a CPT stage with `configs/deep_solana_cpt_config.yaml`:

```bash
python3 scripts/download_deep_solana.py --output data/deep_solana_corpus.jsonl --limit 5000
python3 scripts/train_lora.py --config configs/deep_solana_cpt_config.yaml
# then SFT on top of the CPT checkpoint:
python3 scripts/train_lora.py --config configs/lora_config.yaml --base-model ./outputs/solana-clawd-1.5b-cpt
```

The downloader also supports `--sft-mode` to wrap decoded chunks directly as
ChatML pairs appended to `data/solana_clawd_seed.jsonl`, skipping the
separate CPT stage entirely.

## Why Qwen2.5-1.5B?

We picked `Qwen/Qwen2.5-1.5B-Instruct` as the base because:

- **Size**: 1.5B fits in 4GB VRAM with 4-bit quantization, runs comfortably on a Mac M2 with MPS, and trains on a single 24GB GPU.
- **Quality**: Qwen2.5 is a top-tier instruct model at this size, with strong code, reasoning, and tool-use ability.
- **Tokenizer**: The Qwen tokenizer is multilingual and handles code / addresses / base58 well.
- **License**: Apache-2.0, friendly for derivatives.

Larger variants (3B, 7B) can be trained with the same pipeline by overriding
`--base-model Qwen/Qwen2.5-7B-Instruct` and using a bigger GPU.

## Adding new training data

The merged dataset (`data/solana_clawd_merged.jsonl`) is the canonical training
input. To add more data, contribute to any of the three source layers and re-merge:

- **New skill** → write 5–10 Q&A pairs in `{"messages": [...]}` format, append to `data/solana_clawd_seed.jsonl`
- **New bulk source** → normalize your JSONL into messages format (see merge script), drop it at the repo root
- **Constitutional edge case** → add a refusal example where the assistant explains why it won't help

Then re-run the merge + push:

```bash
# Re-normalize if needed, then:
python3 scripts/prepare_dataset.py \
  --input data/solana_clawd_merged.jsonl \
  --push --repo-id solanaclawd/solana-clawd-instruct

./scripts/launch_hf_jobs.sh a100-large
```

## Trust gates and the Constitution

This model is a tool. It is not a sovereign execution layer.

In the Clawd stack, the model is the **brain**: it produces analyses and
trade plans. The **hands** (a separate agent with a real keypair) executes
them under hard limits. The model never sees the signing key.

This split is encoded in the dataset — no example asks the model to sign
a transaction directly. The model's outputs are always inputs to a human
or a trust-gated agent that asks: "do you really want to do this?"

The Clawd Constitution's three on-chain laws are the final guard. This
fine-tune is helpful training, not a replacement for the laws.

## Cost reference (HF Jobs, mid-2026)

| Flavor | VRAM | $/hr | Use |
| --- | --- | --- | --- |
| `l4x1` | 24GB | ~$0.80 | Quick checks, 1.5B-3B models |
| `a10g-large` | 24GB | ~$1.00 | Slightly faster, same VRAM class |
| `a100-large` | 80GB | ~$3.00 | Standard full training, 1.5B-7B |
| `h200` | 80GB | ~$4.00 | Fastest single-GPU, also fine for 7B |
| `a100x4` | 320GB | ~$12.00 | 13B-30B with DDP |
| `h200x8` | 640GB | ~$32.00 | 70B+ with DDP |

With the current 36K-example dataset (32,498 train), a 1.5B LoRA run at 3 epochs
takes ~1–2 hrs on A100 (~$3–6 per full training run). A 7B run takes ~4–6 hrs (~$12–18).

## Self-hosted GPU deployment

Once your LoRA adapter is trained and pushed to `solanaclawd/solana-clawd-core-ai-1.5b-lora`,
you can serve it from your own GPU (on-prem, rented, or cloud VM) using any of the
paths below. All paths start with a one-time weight merge to produce a standalone model.

### Step 0 — merge the LoRA adapter into the base (do this once)

```python
# merge_and_save.py
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE    = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER = "solanaclawd/solana-clawd-core-ai-1.5b-lora"
MERGED  = "./outputs/solana-clawd-1.5b-merged"

model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype="auto", device_map="cpu")
model = PeftModel.from_pretrained(model, ADAPTER)
model = model.merge_and_unload()
model.save_pretrained(MERGED)
AutoTokenizer.from_pretrained(BASE).save_pretrained(MERGED)
print(f"Merged model saved to {MERGED}")

# Optionally push the merged model to the Hub
# model.push_to_hub("solanaclawd/solana-clawd-1.5b")
# tokenizer.push_to_hub("solanaclawd/solana-clawd-1.5b")
```

```bash
python3 merge_and_save.py
# or push merged weights directly:
hf upload solanaclawd/solana-clawd-1.5b outputs/solana-clawd-1.5b-merged --repo-type model
```

---

### Option A — vLLM (recommended for production, OpenAI-compatible API)

vLLM is the fastest open-source inference server. Works on any NVIDIA GPU with 8GB+ VRAM.

```bash
pip install vllm

# Serve the merged model (OpenAI-compatible endpoint on port 8000)
vllm serve ./outputs/solana-clawd-1.5b-merged \
  --served-model-name solana-clawd-1.5b \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype bfloat16 \
  --max-model-len 4096

# Or serve the LoRA adapter directly on top of the base (no merge needed)
vllm serve Qwen/Qwen2.5-1.5B-Instruct \
  --enable-lora \
  --lora-modules clawd=solanaclawd/solana-clawd-core-ai-1.5b-lora \
  --served-model-name solana-clawd-1.5b \
  --host 0.0.0.0 --port 8000
```

Test it:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "solana-clawd-1.5b",
    "messages": [{"role": "user", "content": "What is a PDA on Solana?"}],
    "max_tokens": 256
  }'
```

Compatible with the OpenAI Python SDK — swap `base_url` to your server IP.

---

### Option B — HuggingFace TGI (Text Generation Inference)

HF's own serving stack. Supports continuous batching, speculative decoding, GPTQ, AWQ.

```bash
# Docker (simplest path on a Linux GPU box)
docker run --gpus all --shm-size 1g \
  -p 8080:80 \
  -v $(pwd)/outputs/solana-clawd-1.5b-merged:/model \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id /model \
  --max-input-length 2048 \
  --max-total-tokens 4096

# Test
curl http://localhost:8080/v1/chat/completions \
  -d '{"model":"tgi","messages":[{"role":"user","content":"What is a PDA?"}]}'
```

---

### Option C — Ollama (Mac / Linux, easiest local setup)

```bash
# 1. Install
brew install ollama   # macOS
# curl -fsSL https://ollama.com/install.sh | sh  # Linux

# 2. Create a Modelfile pointing at the merged weights
cat > Modelfile <<'EOF'
FROM ./outputs/solana-clawd-1.5b-merged
SYSTEM "You are Clawd, a sovereign Solana-native AI agent."
PARAMETER temperature 0.2
PARAMETER top_p 0.9
EOF

ollama create solana-clawd-1.5b -f Modelfile
ollama run solana-clawd-1.5b "What is a PDA on Solana?"

# Also starts an OpenAI-compatible REST server on port 11434
ollama serve
```

---

### Option D — Modal (serverless GPU, pay-per-second)

[Modal](https://modal.com) lets you deploy a GPU function with no server management.
Cold-start is ~20s; billed only when a request is in-flight.

```python
# deploy_modal.py
import modal

app = modal.App("solana-clawd-1.5b")
image = modal.Image.debian_slim(python_version="3.11").pip_install("vllm", "huggingface_hub")

@app.function(gpu="A10G", image=image, secrets=[modal.Secret.from_name("HF_TOKEN")])
@modal.web_endpoint(method="POST")
def infer(request: dict):
    import os
    from vllm import LLM, SamplingParams
    llm = LLM("solanaclawd/solana-clawd-1.5b", dtype="bfloat16")
    params = SamplingParams(temperature=0.2, max_tokens=512)
    messages = request.get("messages", [])
    prompt = "\n".join(f"{m['role']}: {m['content']}" for m in messages)
    return {"text": llm.generate([prompt], params)[0].outputs[0].text}
```

```bash
modal deploy deploy_modal.py
# Returns a public HTTPS endpoint — plug it into any OpenAI client
```

---

### Option E — RunPod / Vast.ai (rented GPU, full control)

Use these when you want a persistent GPU box cheaper than AWS/GCP.

| Provider | Best for | Typical price |
| --- | --- | --- |
| [RunPod](https://runpod.io) | Persistent pods, Jupyter, SSH | $0.20–$0.60/hr (RTX 3090/4090) |
| [Vast.ai](https://vast.ai) | Cheapest spot market, SSH | $0.10–$0.40/hr (RTX 3090/4090) |
| [Lambda Labs](https://lambdalabs.com) | Reserved A100s, reliable | $1.10/hr (A100 80GB) |

Once you have SSH access to a GPU box, use Option A (vLLM) or B (TGI) above.
Set up a reverse proxy (Caddy or nginx) with TLS to expose it as a stable API endpoint.

---

### Plugging your self-hosted endpoint into Clawd agents

Once your vLLM / TGI / Ollama endpoint is running, point any OpenAI-compatible
client at it — same as the HF Router path, just swap the `base_url`:

```python
from openai import OpenAI

# vLLM / TGI running on your box (replace with your IP or domain)
client = OpenAI(base_url="http://YOUR_GPU_HOST:8000/v1", api_key="none")

response = client.chat.completions.create(
    model="solana-clawd-1.5b",
    messages=[
        {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent."},
        {"role": "user",   "content": "Analyze the risk of going long SOL-PERP at 5x."},
    ],
    max_tokens=512,
)
print(response.choices[0].message.content)
```

Set `CLAWD_INFERENCE_URL=http://YOUR_GPU_HOST:8000/v1` in your agent environment
and the existing skill wrappers (`scripts/hermes3_inference.py`, `perps/functioncall.py`)
will pick it up automatically.

---

## License

- **Code** (this directory): Apache-2.0
- **Dataset** (`solanaclawd/solana-clawd-instruct`): CC-BY-4.0
- **Base model** (Qwen2.5): Qwen Research License
- **Adapter** (when published): Apache-2.0

## Percolator AutoResearch

Continuous training data generation inspired by [percolator-meta](https://github.com/aeyakovenko/percolator-meta).
Fetches Solana ecosystem documents recursively, extracts QA pairs using Clawd-1.5B, gates on quality,
and appends to the training dataset — creating a self-improving loop.

```text
Seed URLs (llms.txt / docs / papers)
  ↓ fetch → extract claims + child links
  ↓ Clawd summarize → {"question": ..., "answer": ...}
  ↓ eval gate (Solana-keyword relevance ≥ 2)
  ↓ if quality → append to data/autoResearch.jsonl
  ↓ increment DataSubmission PDA attribution (onchain)
  ↓ recurse into child links (depth-limited, SQLite dedup)
```

```bash
# Single research cycle — Solana + Phoenix docs
python3 scripts/auto_research.py \
  --seed-urls \
    https://docs.solanalabs.com/llms.txt \
    https://docs.phoenix.trade/llms.txt \
    https://www.zkcompression.com/llms.txt \
  --depth 2 \
  --output data/autoResearch.jsonl

# Continuous loop — runs every 6h, pushes new examples to Hub
python3 scripts/auto_research.py \
  --seed-urls https://docs.solanalabs.com/llms.txt \
  --depth 3 \
  --loop --interval-hours 6 \
  --push-to-hub solanaclawd/solana-clawd-instruct

# Uses ClawdRouter free tier by default (clawd_free_* key)
# Override with: --api-base https://clawd-box-router.fly.dev/v1 --api-key $HF_TOKEN
```

The SQLite manifest at `data/research_manifest.db` tracks every visited URL — no page is fetched twice across cycles. Output goes to `data/autoResearch.jsonl` in the same `{"messages": [...]}` format as the rest of the training data and can be merged directly.

---

## Clawd Autoresearch Wiki Integration

Source: [github.com/Solizardking/clawd-autoresearch-wiki](https://github.com/Solizardking/clawd-autoresearch-wiki)

The wiki is a companion monorepo containing three modules now integrated into this pipeline:

### Wiki → Training Data (`ingest_wiki_data.py`)

Pulls 18 curated Solana SFT pairs from the wiki's `solana-chat/solana/dataset.py` and appends them to `data/solana_clawd_seed.jsonl`. Skips duplicates automatically.

```bash
# Add wiki SFT pairs to seed data (dry-run first)
python3 scripts/ingest_wiki_data.py --dry-run
python3 scripts/ingest_wiki_data.py

# Add + push merged dataset to Hub
python3 scripts/ingest_wiki_data.py --push --repo solanaclawd/solana-clawd-instruct
```

Coverage: PDA mechanics · rent/compute/CPI · SPL/Token-2022 · Anchor · pump.fun bonding curves · perp liquidations · rug-check checklist · honeypot detection · brain/hands split · skill registry · Light Protocol · ZK routing · three on-chain laws · x402 payment flow.

### Solana Knowledge Benchmark (`solana_benchmark.py`)

18-question MCQ eval across 6 domains, adapted from the wiki's `solana-chat/solana/tasks.py`. Uses any OpenAI-compatible endpoint — designed to track fine-tune delta pre/post training.

```bash
export WANDB_API_KEY=<key>

# Baseline (pre-fine-tune)
python3 scripts/solana_benchmark.py

# Post-training eval
python3 scripts/solana_benchmark.py --model ordlibrary/DeepSolanaZKr-1

# Against local vLLM
python3 scripts/solana_benchmark.py \
  --model solanaclawd/solana-clawd-core-ai-1.5b-lora \
  --base-url http://localhost:8000/v1 --api-key none
```

Domains: `core` · `defi` · `security` · `agent` · `zk` · `constitution`

### Full release verifier

Run the broad verifier before calling the setup/release goal complete. It checks
the explicit `core-ai` and `ai-training` path list, local manifests, public Hub
datasets, the Core AI adapter repo, and release-doc secret hygiene.

```bash
cd ai-training
python3 scripts/verify_full_goal_release.py --strict
```

**Release complete** — `solanaclawd/solana-clawd-core-ai-1.5b-lora` contains
`adapter_config.json` and `adapter_model.safetensors` (pushed 2026-06-19T23:44Z).

```bash
cd ai-training
python3 scripts/verify_full_goal_release.py --strict   # should now pass
```

### Persistent Memory (`memory/honcho.py`)

Honcho-backed cross-session memory for the training pipeline — remembers eval results, dataset decisions, and experiment lessons across context wipes.

```python
from memory.honcho import AgentMemory

mem = AgentMemory(api_key="hch-...", workspace="clawd-training")
mem.remember_eval("ordlibrary/DeepSolanaZKr-1", "6a3464cf", 0.78, 18, "post-SFT run")
mem.remember_training_run("6a3464cf", "Qwen/Qwen2.5-1.5B-Instruct",
                           "solanaclawd/solana-clawd-instruct", "COMPLETE")
ctx = mem.recall("What was the last eval accuracy?")
summary = mem.dream()  # autonomous consolidation
```

Set `HONCHO_API_KEY` to enable cloud persistence; falls back to local in-memory log if unset.

---

## Onchain AI Registry

Every Clawd model has a permanent onchain identity anchored via the [`solana_ai_inference`](https://github.com/Solizardking/OnChain-Ai) Anchor program (`3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj`) and indexed at [onchain.x402.wtf](https://onchain.x402.wtf).

### Solana AI Model Kit one-shot

Safe audit-only bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/ai-training/scripts/solana_ai_model_kit.sh | bash
```

From a local checkout:

```bash
bash scripts/solana_ai_model_kit.sh --local
bash scripts/solana_ai_model_kit.sh --local --register
bash scripts/solana_ai_model_kit.sh --local --live-register --hf-model YOUR_ORG/your-model
```

See [`model-kit/README.md`](./model-kit/README.md) for the full fork, train,
register, and OnChain-AI sidecar workflow.

### One-shot curl registration (off-chain index only)

```bash
./dao/register_model.sh \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --eval-accuracy 0.60 \
  --dataset-size 36109

# With auto-computed hash from train_lora.py:
./dao/register_model.sh \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --model-hash "sha256:$(sha256sum scripts/train_lora.py | awk '{print $1}')"
```

### Full onchain registration (creates ModelRegistry PDA)

```bash
# Requires: funded Solana wallet, pnpm, @coral-xyz/anchor installed
./dao/register_model.sh --onchain \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --keypair ~/.config/solana/id.json \
  --cluster devnet
```

This calls `initialize_model(model_hash, ModelType::TextGeneration, api_endpoint, term_reward_rate)` which creates a `ModelRegistry` PDA at `["model", authority.pubkey]`. The PDA stores accuracy, validation count, training status, and the CLAWD reward rate — all queryable without a centralized API.

```bash
# Verify onchain registration
solana account <MODEL_REGISTRY_PDA> --url devnet --output json
```

### CAAP/1.0 registry format

The off-chain index at `onchain.x402.wtf/.well-known/clawd-registry.json` maps model IDs to their capabilities and onchain anchors:

```json
{
  "protocol": "CAAP/1.0",
  "registry": [{
    "model_id": "solanaclawd/solana-clawd-1.5b",
    "capabilities": ["solana-dev", "protocol-qa", "anchor-codegen"],
    "eval_accuracy": 0.60,
    "sas_attestation": "At1...",
    "program_pda": "...",
    "clawd_token_gate": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
  }]
}
```

---

## ZK Attestations (zk.x402.wtf)

Model quality claims are anchored as compressed on-chain credentials using [Solana Attestation Service (SAS)](https://github.com/solana-foundation/solana-attestation-service) and [Light Protocol V2](https://www.zkcompression.com).

| Artifact | Type | Cost |
| --- | --- | --- |
| Dataset snapshot (36K examples Merkle root) | compressed | ~0.00003 SOL |
| LoRA adapter checksum | compressed | ~0.00003 SOL |
| W&B Weave eval result | standard | ~0.002 SOL |
| Governance proposal | standard + nullifier | ~0.003 SOL |

```bash
# Create eval attestation (dry run first)
pnpm tsx dao/attestation/create_attestation.ts \
  --type eval \
  --model-id "solanaclawd/solana-clawd-1.5b" \
  --accuracy 0.60 \
  --wandb-run "ktvtubjs" \
  --keypair ~/.config/solana/id.json \
  --dry-run

# Create dataset attestation (compressed, mainnet)
pnpm tsx dao/attestation/create_attestation.ts \
  --type dataset \
  --model-id "solanaclawd/solana-clawd-1.5b" \
  --size 36109 \
  --hash "sha256:$(sha256sum data/solana_clawd_merged.jsonl | awk '{print $1}')" \
  --compressed \
  --keypair ~/.config/solana/id.json
```

Attestation addresses are written to `dao/attestation/attestations.jsonl` and included in the CAAP/1.0 registry. Verify any attestation without trusting the Clawd team:

```bash
solana account <ATTESTATION_PDA> --url mainnet-beta --output json
```

---

## DAO & Governance

See [`dao/DAO_DESIGN.md`](dao/DAO_DESIGN.md) for the full architecture. Summary:

**Hard constraints:**

- User capital lives in Percolator insurance pools — genesis programs never touch it
- All authority changes require 1-week Squads timelock (non-reducible, even by governance vote)
- 3-of-5 multisig emergency pause covers trading only — withdrawals are always open

**What governance controls:** model training priorities, dataset curation budget, compute allocation, registry parameters, validator slashing thresholds

**Validator network** (from `solana_ai_inference` IDL):

- `become_validator(stake_amount)` — register and stake
- `submit_data(data_hash, DataType, size, metadata)` — submit training data for attribution
- `rate_data(quality_score, term_reward)` — validators score submissions (0–100)
- Quality × `term_reward_rate` = $CLAWD attribution per validated example

---

## Public announcement

The first Solana Clawd community article is at [`outputs/community-article.md`](outputs/community-article.md) — ready to publish at [huggingface.co/blog/solanaclawd](https://huggingface.co/blog/solanaclawd). It covers the model family, 36K dataset, perps agent example, Percolator AutoResearch, onchain registry, ZK attestations, and DAO safety design.

---

## See also

- [`AGENTS.md`](../AGENTS.md) — the Clawd agent catalog
- [`CONSTITUTION.md`](../CONSTITUTION.md) — the Clawd Constitution
- [`three-laws.md`](../three-laws.md) — the three on-chain laws
- [`dao/DAO_DESIGN.md`](dao/DAO_DESIGN.md) — DAO architecture and safety model
- [onchain.x402.wtf](https://onchain.x402.wtf) — onchain AI registry
- [zk.x402.wtf](https://zk.x402.wtf) — ZK attestation layer
- [Percolator meta](https://github.com/aeyakovenko/percolator-meta) — recursive research pattern
- [Vulcan CLI](https://github.com/Ellipsis-Labs/vulcan-cli) — Phoenix perps trading CLI with MCP
- [Hugging Face `hf` CLI docs](https://huggingface.co/docs/huggingface_hub/guides/cli)
- [TRL SFTTrainer](https://huggingface.co/docs/trl/sft_trainer)
- [PEFT LoRA](https://huggingface.co/docs/peft/main/en/index)
- [HF Jobs](https://huggingface.co/docs/hub/en/spaces-sdks-docker)
- [Solana Attestation Service](https://github.com/solana-foundation/solana-attestation-service)
- [Light Protocol ZK compression](https://www.zkcompression.com)
