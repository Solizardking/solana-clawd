# 🦞 Solana Clawd AI Training

> The training pipeline for the **Solana Clawd** sovereign-agent model.
> Lives in the [solana-clawd](https://github.com/Solizardking/solana-clawd) monorepo.
> Models + datasets are versioned on the [Hugging Face Hub](https://huggingface.co/solanaclawd) under the `solanaclawd` org.

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
│   ├── solana_clawd_seed.jsonl     ← seed SFT pairs (47 conversations)
│   ├── solana_clawd_eval.jsonl     ← held-out eval prompts (13 conversations)
│   ├── eval_card.md                ← eval dataset card (upload to Hub)
│   └── processed/                  ← committed sample output of prepare_dataset.py (parquet + arrow splits)
├── configs/
│   ├── lora_config.yaml            ← LoRA + training hyperparameters (Qwen2.5-1.5B)
│   ├── hermes3_lora_config.yaml    ← LoRA config for Hermes-3-Llama-3.1-8B (r=32, 4-bit)
│   ├── deep_solana_cpt_config.yaml ← continued pre-training config (DeepSolana-GPT2 corpus)
│   └── eval_config.yaml            ← evaluation config
├── scripts/
│   ├── prepare_dataset.py          ← JSONL → HF Datasets (parquet)
│   ├── train_lora.py               ← LoRA SFT via TRL + PEFT
│   ├── evaluate.py                 ← held-out inference eval
│   ├── launch_hf_jobs.sh           ← submit remote GPU job
│   ├── hermes3_inference.py        ← 3-mode Hermes-3 inference: HF Router / pipeline / direct
│   ├── solana_client.py            ← 8-command Solana RPC tool (wallet/tx/token/nft/whales/stats/price)
│   ├── download_deep_solana.py     ← DeepSolana-GPT2-bucket downloader + GPT-2→text decoder
│   └── add_v2_examples.py          ← one-off script that seeded the v2 dataset examples
├── perps/                          ← Hermes-3 function calling for Solana perps
│   ├── functions.py                ← 13 perps tools (sol price, funding rate, paper trade, risk...)
│   ├── functioncall.py             ← HermesPerpsAgent inference loop (HF Router / local, GOAP mode)
│   ├── schema.py                   ← Pydantic models: FunctionCall, TradeOrder, RiskAssessment...
│   └── prompter.py                 ← system prompt builder (standard / GOAP / JSON mode)
├── dataset_card.md                 ← dataset README (upload to Hub)
├── model_card.md                   ← model README (upload to Hub)
├── checkpoints/                    ← (gitignored) LoRA adapter weights
└── outputs/                        ← (gitignored) eval reports
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
|------|------|---------|
| [`solanaclawd/solana-clawd-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) | dataset | SFT instruction pairs (system/user/assistant) |
| [`solanaclawd/solana-clawd-eval`](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval) | dataset | Held-out evaluation prompts (red-team + capability) |
| [`solanaclawd/solana-clawd-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora) | model | LoRA adapter on Qwen2.5-1.5B-Instruct |
| [`solanaclawd/solana-clawd-1.5b`](https://huggingface.co/solanaclawd/solana-clawd-1.5b) | model | Merged bf16 model (base + LoRA) |
| [`solanaclawd/solana-clawd-7b-lora`](https://huggingface.co/solanaclawd/solana-clawd-7b-lora) | model | Optional larger variant (Qwen2.5-7B-Instruct) |

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

### 1. Curate the seed dataset

The seed lives in `data/solana_clawd_seed.jsonl`. Each line is a
`{"messages": [...]}` conversation. Add new examples by appending to this
file or pointing `--input` at a new path.

### 2. Prepare the dataset (parquet + Hub)

```bash
# Local only
python3 scripts/prepare_dataset.py --output data/processed

# Push to Hub
python3 scripts/prepare_dataset.py --push --repo-id solanaclawd/solana-clawd-instruct
```

This validates each example, splits 90/5/5, writes parquet for streaming
access, and (with `--push`) uploads to the Hub dataset.

### 3. Train (local or remote)

**Local (Mac MPS, small dataset, low epoch count for sanity check)**:
```bash
python3 scripts/train_lora.py --num-epochs 1 --no-quant
```

**Remote (HF Jobs, A100 or H200)**:
```bash
./scripts/launch_hf_jobs.sh a100-large   # 80GB A100, ~$3/hr
./scripts/launch_hf_jobs.sh h200          # 80GB H200, ~$4/hr
./scripts/launch_hf_jobs.sh l4x1          # 24GB L4, ~$0.80/hr
```

The script uses `hf jobs uv run` to spin up an HF-managed GPU container,
install deps, and run `train_lora.py`. Monitor with:
```bash
hf jobs ps
hf jobs logs <JOB_ID> --follow
hf jobs inspect <JOB_ID>
```

### 4. Evaluate

```bash
python3 scripts/evaluate.py --num 50
# Outputs JSON + Markdown reports in outputs/eval/
```

The eval report includes:
- **Throughput** (examples/sec on your hardware)
- **Refusal rate** on the red-team slice
- **Average generation length**
- **20 sample generations** for human review

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

The seed is intentionally small (~20 conversations) so the pipeline runs
end-to-end fast. To add more data:

1. **From a new skill**: when you add a skill under `skills/`, write 5-10
   Q&A pairs that exercise it and append them to `data/solana_clawd_seed.jsonl`.
2. **From a real user conversation**: scrub PII, distill into a
   system+user+assistant triple, append.
3. **From a constitutional edge case**: if a real prompt almost slipped
   past the safety filter, add a refusal example (the model should say no,
   and say why).

Then re-run `prepare_dataset.py --push` and re-train.

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

A full 1.5B LoRA training run on 1K examples takes ~15-30 min on A100.
Bump to ~$1-2 per training run.

## License

- **Code** (this directory): Apache-2.0
- **Dataset** (`solanaclawd/solana-clawd-instruct`): CC-BY-4.0
- **Base model** (Qwen2.5): Qwen Research License
- **Adapter** (when published): Apache-2.0

## See also

- [`AGENTS.md`](../AGENTS.md) — the Clawd agent catalog
- [`CONSTITUTION.md`](../CONSTITUTION.md) — the Clawd Constitution
- [`three-laws.md`](../three-laws.md) — the three on-chain laws
- [Hugging Face `hf` CLI docs](https://huggingface.co/docs/huggingface_hub/guides/cli)
- [TRL SFTTrainer](https://huggingface.co/docs/trl/sft_trainer)
- [PEFT LoRA](https://huggingface.co/docs/peft/main/en/index)
- [HF Jobs](https://huggingface.co/docs/hub/en/spaces-sdks-docker)
