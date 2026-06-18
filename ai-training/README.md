# 🦞 Solana Clawd AI Training

> The training pipeline for the **Solana Clawd** sovereign-agent model.
> **GitHub**: [Solizardking/solana-clawd-ai-training](https://github.com/Solizardking/solana-clawd-ai-training) — standalone repo for this pipeline.
> **Parent monorepo**: [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)
> **HuggingFace org**: [solanaclawd](https://huggingface.co/solanaclawd) — models, datasets, spaces

## What this is

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
│   ├── train_lora.py               ← LoRA SFT via TRL + PEFT
│   ├── evaluate.py                 ← held-out inference eval
│   ├── wandb_eval.py               ← W&B Weave benchmark eval (JSON QA, traces to clawdsolana-clawd/clawd)
│   ├── launch_hf_jobs.sh           ← submit remote GPU job (passes WANDB_API_KEY, 6h timeout)
│   ├── auto_research.py            ← Percolator-style recursive wiki generator (see §Percolator AutoResearch)
│   ├── hermes3_inference.py        ← 3-mode Hermes-3 inference: HF Router / pipeline / direct
│   ├── solana_client.py            ← 8-command Solana RPC tool (wallet/tx/token/nft/whales/stats/price)
│   ├── download_deep_solana.py     ← DeepSolana-GPT2-bucket downloader + GPT-2→text decoder
│   └── add_v2_examples.py          ← one-off script that seeded the v2 dataset examples
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
| [`solanaclawd/solana-clawd-eval`](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval) | dataset | Held-out eval prompts (red-team + capability, 13 conversations) |
| [`solanaclawd/solana-clawd-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora) | model | LoRA adapter on Qwen2.5-1.5B-Instruct (training in progress — see current run below) |
| [`solanaclawd/solana-clawd-1.5b`](https://huggingface.co/solanaclawd/solana-clawd-1.5b) | model | Merged bf16 model (base + LoRA), vllm-ready |
| [`solanaclawd/solana-clawd-7b-lora`](https://huggingface.co/solanaclawd/solana-clawd-7b-lora) | model | Optional larger variant (Qwen2.5-7B-Instruct) |

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

**Current dataset stats** (pushed 2026-06-18):
- Total: **36,109** examples
- Train: **32,498** · Eval: **1,805** · Test: **1,806**
- Parquet size: ~40.1 MB (train), ~2.3 MB (eval/test)

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

#### Current training run (2026-06-18)

| Field | Value |
| --- | --- |
| Job ID | `6a341687ef9220ea67d99583` |
| URL | [huggingface.co/jobs/ordlibrary/6a341687ef9220ea67d99583](https://huggingface.co/jobs/ordlibrary/6a341687ef9220ea67d99583) |
| Hardware | `a100-large` — NVIDIA A100 80GB |
| Base model | `Qwen/Qwen2.5-1.5B-Instruct` |
| Config | `configs/lora_config.yaml` — LoRA r=16, α=32, 3 epochs |
| Dataset | `solanaclawd/solana-clawd-instruct` — 32,498 train examples |
| Est. steps | ~6,093 (32,498 ÷ batch 16 × 3 epochs) |
| Est. duration | ~1–2 hrs on A100 |
| Output | `solanaclawd/solana-clawd-1.5b-lora` (pushed on completion) |
| W&B | `clawdsolana-clawd/clawd` project |

```bash
# Watch live logs
hf jobs logs 6a341687ef9220ea67d99583 --follow
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
python3 scripts/wandb_eval.py
# Traces appear live at: https://wandb.ai/clawdsolana-clawd/clawd/weave
```

**Baseline eval results (2026-06-18)** — `OpenPipe/Qwen3-14B-Instruct` before fine-tune lands:

| Metric | Result |
| --- | --- |
| Examples evaluated | 20 |
| Format compliance (`<answer>` tags) | **100%** (20/20) |
| Answer accuracy | **60%** (12/20) |
| Mean latency | 689 ms |
| Weave run | [019edb80-957d-70dc-9289-9a27b188e57b](https://wandb.ai/clawdsolana-clawd/clawd/r/call/019edb80-957d-70dc-9289-9a27b188e57b) |

Re-run after the LoRA job finishes to measure fine-tune delta against this baseline.

### 5. Deploy into Clawd agents

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

base = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen2.5-1.5B-Instruct",
    torch_dtype="auto",
    device_map="auto",
)
model = PeftModel.from_pretrained(base, "solanaclawd/solana-clawd-1.5b-lora")
tokenizer = AutoTokenizer.from_pretrained("solanaclawd/solana-clawd-1.5b-lora")
```

Or with `mlx-lm` on a Mac (fastest local path):

```bash
pip install mlx-lm
mlx_lm.generate \
  --model Qwen/Qwen2.5-1.5B-Instruct \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
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
|--------|-----:|-----:|-----|
| `l4x1` | 24GB | ~$0.80 | Quick checks, 1.5B-3B models |
| `a10g-large` | 24GB | ~$1.00 | Slightly faster, same VRAM class |
| `a100-large` | 80GB | ~$3.00 | Standard full training, 1.5B-7B |
| `h200` | 80GB | ~$4.00 | Fastest single-GPU, also fine for 7B |
| `a100x4` | 320GB | ~$12.00 | 13B-30B with DDP |
| `h200x8` | 640GB | ~$32.00 | 70B+ with DDP |

With the current 36K-example dataset (32,498 train), a 1.5B LoRA run at 3 epochs
takes ~1–2 hrs on A100 (~$3–6 per full training run). A 7B run takes ~4–6 hrs (~$12–18).

## Self-hosted GPU deployment

Once your LoRA adapter is trained and pushed to `solanaclawd/solana-clawd-1.5b-lora`,
you can serve it from your own GPU (on-prem, rented, or cloud VM) using any of the
paths below. All paths start with a one-time weight merge to produce a standalone model.

### Step 0 — merge the LoRA adapter into the base (do this once)

```python
# merge_and_save.py
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE    = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER = "solanaclawd/solana-clawd-1.5b-lora"
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
  --lora-modules clawd=solanaclawd/solana-clawd-1.5b-lora \
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

## Onchain AI Registry

Every Clawd model has a permanent onchain identity anchored via the [`solana_ai_inference`](https://github.com/Solizardking/OnChain-Ai) Anchor program (`3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj`) and indexed at [onchain.x402.wtf](https://onchain.x402.wtf).

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
