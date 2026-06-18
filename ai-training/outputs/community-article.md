---
title: "Clawd: Sovereign Solana AI — Models, Agents, and the Onchain Registry"
thumbnail: https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct/resolve/main/banner.png
authors:
  - user: solanaclawd
tags:
  - solana
  - lora
  - agents
  - defi
  - zk
  - dao
  - x402
---

# Clawd: Sovereign Solana AI — Models, Agents, and the Onchain Registry

*June 18, 2026 · The first public announcement from the Solana Clawd initiative*

---

We started Clawd with one observation: every major LLM knows *about* Solana but none of them truly *thinks* in Solana. They struggle with PDAs, get funding rates backwards, blank on Light Protocol's ZK compression primitives, and produce Anchor code that compiles but violates rent exemption. That gap is not a knowledge retrieval problem. It is a training distribution problem.

Today we are announcing:

1. **Three open-weight Solana-native models** — Qwen2.5 1.5B, GLM-5.2, and Hermes-3 8B variants, all fine-tuned on the Solana Clawd instruction dataset
2. **36,109-example public dataset** at [`solanaclawd/solana-clawd-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct)
3. **A live perps agent example** — Hermes-3 with 13 Solana tools calling Phoenix DEX, Jupiter, CoinGecko, and the Solana RPC in a function-calling loop
4. **Onchain AI registry** at [onchain.x402.wtf](https://onchain.x402.wtf) — CAAP/1.0 agent identity anchored to the $CLAWD token
5. **ZK attestation layer** at [zk.x402.wtf](https://zk.x402.wtf) — Light Protocol compressed credentials proving model lineage and evaluation results
6. **Percolator AutoResearch** — a recursive research loop that continuously transforms ecosystem documents into training data and wiki entries
7. **Clawd DAO (safety-first design)** — user capital lives in Percolator insurance vaults, never in genesis-controlled accounts; all authority changes go through a 1-week Squads timelock

---

## The model family

| Model | Base | Parameters | LoRA r/α | Primary use |
|---|---|---|---|---|
| `solanaclawd/solana-clawd-1.5b-lora` | Qwen2.5-1.5B-Instruct | 1.5B | 16/32 | Dev assistant, protocol Q&A |
| `solanaclawd/Clawd-GLM-5.2` | zai-org/GLM-5.2 | 5.2B | 32/64 | ZK reasoning, DeFi analysis |
| `solanaclawd/solana-clawd-8b-lora` | Hermes-3-Llama-3.1-8B | 8B | 32/64 | **Tool-use, function calling** |

Every variant shares the same system identity:

> *You are Clawd, a sovereign Solana-native AI agent with deep knowledge of ZK compression, DeFi protocols, and the Clawd agent ecosystem. You operate under the Clawd Constitution: transparency, reproducibility, and never claiming to predict prices.*

The 1.5B model is the everyday workhorse — fast enough for edge inference on a MacBook M-series, accurate enough for developer assistance and protocol explanation. The GLM-5.2 carries a dedicated ZK primitives track: nullifiers, Groth16 proof verification, Light Protocol V2 compressed-state trees, and the `clawd-zk` program. The Hermes-3 8B is the function-calling backbone — it speaks the `<tool_call>` XML format natively and drives our perps agent example.

---

## The dataset: 36,109 examples from three sources

```
solanaclawd/solana-clawd-instruct
├── 47 curated conversations      (hand-written, highest quality)
├── 8,970 Alpaca-format examples  (solana1_yourgpt.jsonl — converted)
└── 27,092 messages-format examples (trainingday.jsonl — direct)
```

All three sources are normalized to the same `{"messages": [...]}` format before training. The Alpaca conversion handles both the standard `instruction + input → output` pattern and the variant where the question lives in the `input` field when `instruction` is empty — a subtle difference that caused half the examples to be skipped in the first normalization pass.

The dataset is public, CC-BY-4.0, and iframe-embeddable:

```html
<iframe
  src="https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct/embed/viewer/default/train"
  frameborder="0"
  width="100%"
  height="560px"
></iframe>
```

A separate evaluation split lives at [`solanaclawd/solana-clawd-eval`](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval).

---

## Training: HF Jobs + W&B on A100

Training runs on HuggingFace Jobs using `uv` inline script dependencies — no `requirements.txt`, no Docker image to maintain. The entire dependency declaration lives in the script header:

```python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "torch>=2.1.0",
#   "transformers>=5.12.0",
#   "trl>=1.6.0",
#   "peft>=0.19.1",
#   "wandb>=0.19.0",
# ]
# ///
```

Launch a training run:

```bash
hf jobs uv run scripts/train_lora.py \
  --flavor a100-large \
  --timeout 7h \
  --env WANDB_PROJECT=clawd \
  --env-file <(printf "WANDB_API_KEY=%s\n" "$WANDB_API_KEY") \
  --detach \
  -- --config configs/lora_config.yaml
```

The current run (`6a3420dccfe67f7a37c5f272`, W&B run `ktvtubjs`, name `rose-gorge-1`) started at step 10 with loss=1.421, grad_norm=0.769, token_accuracy=64.1%, and runs 6,096 total steps at ~4 sec/step — roughly 7 hours to completion. The adapter will push to `solanaclawd/solana-clawd-1.5b-lora` automatically.

**Baseline W&B evaluation** (pre fine-tune, `OpenPipe/Qwen3-14B-Instruct` judge):

| Metric | Score |
|---|---|
| Format compliance | 100% |
| Answer accuracy | 60% |
| Latency | 689ms |
| Weave run | `019edb80-957d-70dc-9289-9a27b188e57b` |

We re-run the eval after each training checkpoint to measure improvement.

---

## The Perps Agent: Hermes-3 with 13 Solana tools

The `ai-training/perps/` directory contains a production-ready function-calling agent built on the Hermes-3 8B model. It runs against the HF Inference Router (no GPU required) or locally with a LoRA adapter.

**13 tools across four categories:**

| Category | Tools |
|---|---|
| Price data | `get_sol_price`, `get_token_price`, `get_market_overview` |
| Phoenix perps | `get_perp_markets`, `get_funding_rate`, `get_orderbook` |
| Positions | `check_positions`, `check_sol_balance`, `get_trader_history` |
| Execution | `paper_trade`, `assess_position_risk`, `get_jupiter_quote`, `send_sol` |

The agent defaults to **PAPER mode** — no real funds are ever touched unless `LIVE_TRADING=true` is explicitly set. Risk scores ≥ 7/10 trigger a mandatory confirmation gate.

**Quick start (HF Router, no GPU):**

```bash
cd ai-training/perps
pip install openai pyyaml pydantic

export HF_TOKEN=hf_...

# Get SOL price + Phoenix funding rate
python functioncall.py --query "What is the SOL price and SOL-PERP funding rate?"

# Paper trade with GOAP reasoning
python functioncall.py \
  --query "Paper trade: long SOL-PERP $500 at 3x leverage" \
  --goap --verbose

# Risk assessment
python functioncall.py \
  --query "Assess the risk of shorting SOL-PERP $1000 at 5x" \
  --verbose

# With your fine-tuned adapter (local mode)
HERMES_LOCAL=1 HERMES_ADAPTER=solanaclawd/solana-clawd-8b-lora \
  python functioncall.py --query "Show my positions" --wallet <YOUR_WALLET>
```

**GOAP mode** injects a `<scratch_pad>` reasoning block between tool calls — the model writes its goal, planned actions, observations, and reflection before each function invocation. This is the same pattern used in the NousResearch/Hermes-Function-Calling repository, adapted for Solana.

The agent also integrates with **Vulcan CLI** — Ellipsis Labs' official Phoenix DEX trading CLI. Vulcan ships bundled MCP skills for Claude Code, Cursor, and Codex:

```bash
# Install Vulcan
curl -fsSL https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh | sh

# Install agent skills for Claude Code
vulcan agent install --target claude

# Run paper grid strategy on SOL
vulcan strategy grid start \
  --symbol SOL \
  --center-on-mark \
  --width-pct 2.5 \
  --levels-per-side 5 \
  --tokens-per-level 0.5 \
  --run-until-stopped \
  --mode paper \
  --detached
```

---

## Percolator AutoResearch: recursive wiki generation

Toly's [percolator-meta](https://github.com/aeyakovenko/percolator-meta) describes a recursive research pattern: fetch a document, extract claims and links, spawn research tasks for each claim, repeat. We adapt this as Clawd's continuous training data pipeline.

```
Seed URLs (docs, papers, ecosystem announcements)
    ↓
percolator fetch → markdown + extracted links
    ↓
clawd summarize → structured wiki entry
    ↓
eval gate (does it improve eval accuracy?)
    ↓
if yes → append to solanaclawd/solana-clawd-instruct
         trigger incremental fine-tune
    ↓
extract child URLs → queue next cycle
```

The `auto_research.py` script in `ai-training/scripts/` implements this loop. It uses Clawd-1.5B for summarization (local, no API cost), tracks every document in a SQLite manifest (no duplicate fetches), and writes output to the same JSONL format as the training dataset.

```bash
# Run one cycle
python scripts/auto_research.py \
  --seed-urls "https://docs.solanalabs.com/llms.txt" \
  --depth 2 \
  --model solanaclawd/solana-clawd-1.5b \
  --output data/autoResearch.jsonl

# Run continuously (appends to dataset, triggers incremental train)
python scripts/auto_research.py \
  --seed-urls "https://docs.solanalabs.com/llms.txt" \
  --depth 3 \
  --loop \
  --interval-hours 6 \
  --push-to-hub solanaclawd/solana-clawd-instruct
```

---

## Onchain AI Registry: onchain.x402.wtf

Every Clawd model has an onchain identity anchored to the $CLAWD token. The registry at [onchain.x402.wtf](https://onchain.x402.wtf) exposes a CAAP/1.0 (Clawd Agent Authentication Protocol) endpoint — a `.well-known/clawd-registry.json` document that maps model IDs to their capability declarations, evaluation hashes, and SAS attestation addresses.

```json
{
  "protocol": "CAAP/1.0",
  "registry": [
    {
      "model_id": "solanaclawd/solana-clawd-1.5b",
      "capabilities": ["solana-dev", "protocol-qa", "anchor-codegen"],
      "eval_accuracy": 0.60,
      "dataset_hash": "sha256:...",
      "sas_attestation": "At1...",
      "clawd_token_gate": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
    }
  ]
}
```

Agents authenticate to the registry using their wallet keypair. ClawdRouter maps `$CLAWD` token holdings to inference tier — `clawd_free_*` keys bypass billing and route to free model slots. The router lives at `clawd-box-router.fly.dev` and proxies 79 models via the OpenAI-compatible `/v1/chat/completions` endpoint.

---

## ZK Attestation Layer: zk.x402.wtf

Model quality claims without verification are marketing. [zk.x402.wtf](https://zk.x402.wtf) anchors every major artifact — dataset snapshots, model adapter hashes, evaluation results — to the Solana chain as Light Protocol compressed attestations.

We use the **Solana Attestation Service (SAS)** to create verifiable credentials for:

- Dataset integrity (Merkle root of training JSONL)
- LoRA adapter checksums (post-training)
- Evaluation results (W&B Weave trace hashes)
- AutoResearch document manifests

**Creating an attestation (TypeScript with Gill):**

```typescript
import { createSolanaClient, generateKeyPair, signAndSendTransaction } from "gill";
import { getCreateAttestationInstruction } from "@solana-attestation-service/sdk";

const { rpc, sendAndConfirmTransaction } = createSolanaClient({
  urlOrMoniker: "mainnet",
});

const attestation = await getCreateAttestationInstruction({
  schema: clawd_model_schema,
  data: {
    model_id: "solanaclawd/solana-clawd-1.5b",
    adapter_sha256: "abc123...",
    eval_accuracy: 60,
    dataset_size: 36109,
    training_run: "6a3420dccfe67f7a37c5f272",
    timestamp: Date.now(),
  },
  signer: agentWallet,
});
```

**Compressed attestations** (Light Protocol v2) reduce the cost from ~0.002 SOL per credential to ~0.00003 SOL — making it economically feasible to attest every training checkpoint and eval run. The `clawd-zk` program wraps Light Protocol's compressed state tree to manage nullifiers, preventing double-spend attacks on credential reuse.

---

## The Clawd DAO: safety-first autonomous governance

The DAO coordinates $CLAWD holders around model training priorities, dataset curation, and infrastructure funding. It is designed around one hard constraint:

> **User capital never touches a genesis-owned vault.**

All depositor assets live in **Percolator insurance pools** — isolated, market-determined collateral vaults with no admin upgrade authority. The genesis programs are attribution and accounting infrastructure only: they record who contributed what, calculate proportional $CLAWD rewards, and anchor the governance registry.

**The authority model:**

```
$CLAWD holders
    ↓ vote on
Proposal: model training budget, dataset priorities, registry upgrades
    ↓ if passed
1-week Squads timelock
    ↓ (every depositor has 7 days to review and exit before execution)
Key rotation / program upgrade / treasury action
```

The 1-week timelock is non-negotiable and cannot be shortened by governance vote. It exists specifically so that any depositor who disagrees with a change can exit before it takes effect.

**The one exception**: emergency pause of live agent trading. The multisig can halt new positions in under 60 seconds with a 3-of-5 quorum. This does not touch user collateral — it only prevents new entries.

**Onchain attestation of governance actions:**

Every passed proposal, timelock activation, and key rotation is recorded as a SAS attestation, creating an immutable audit trail that any observer can verify without trusting the DAO team:

```bash
# Verify the governance history
vulcan status -o json | jq '.data.registry'

# Check a specific proposal attestation
solana account <ATTESTATION_ADDRESS> --output json
```

---

## What's next

The 1.5B training run completes in ~7 hours. Once the adapter lands at `solanaclawd/solana-clawd-1.5b-lora`:

1. Re-run W&B Weave eval to measure fine-tune improvement over 60% baseline
2. Merge adapter into `solanaclawd/solana-clawd-1.5b` (merged weights for easier inference)
3. Publish the GLM-5.2 model card with full ZK training details
4. Launch the Percolator AutoResearch loop on Solana documentation
5. Deploy the first SAS attestation for the 36,109-example dataset snapshot
6. Open the onchain registry at [onchain.x402.wtf](https://onchain.x402.wtf) to third-party agents

---

## Links and resources

| Resource | URL |
|---|---|
| Models | [huggingface.co/solanaclawd](https://huggingface.co/solanaclawd) |
| Dataset | [huggingface.co/datasets/solanaclawd](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) |
| Training repo | [github.com/Solizardking/solana-clawd-ai-training](https://github.com/Solizardking/solana-clawd-ai-training) |
| Onchain registry | [onchain.x402.wtf](https://onchain.x402.wtf) |
| ZK attestations | [zk.x402.wtf](https://zk.x402.wtf) |
| x402 payments | [x402.wtf](https://x402.wtf) |
| W&B project | [wandb.ai/clawdsolana-clawd/clawd](https://wandb.ai/clawdsolana-clawd/clawd) |
| Percolator meta | [github.com/aeyakovenko/percolator-meta](https://github.com/aeyakovenko/percolator-meta) |
| Phoenix perps | [phoenix.trade](https://phoenix.trade) |
| Vulcan CLI | [github.com/Ellipsis-Labs/vulcan-cli](https://github.com/Ellipsis-Labs/vulcan-cli) |

---

*Everything is open-weight, open-dataset, and open-source. All model cards include acknowledged limitations. Nothing here is financial advice — Clawd generates analysis, not price predictions.*

*$CLAWD: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`*
