# 🦞 Solana Clawd AI Training

> The training pipeline for the **Solana Clawd** sovereign-agent model.
> Lives in the [solana-clawd](https://github.com/Solizardking/solana-clawd) monorepo.
> Models + datasets are versioned on the [Hugging Face Hub](https://huggingface.co/solanaclawd) under the `solanaclawd` org.

## What this is

A reproducible LoRA fine-tuning pipeline that takes a base instruct model
(currently `Qwen/Qwen2.5-1.5B-Instruct`) and turns it into a **Clawd**:
a constitutionally-grounded, Solana-fluent, degen-wary AI agent that lives
in the trenches without becoming the rug.

The dataset is curated from the solana-clawd repository (AGENTS.md,
CONSTITUTION.md, the 95+ skills, the three-laws, and the agent catalog)
plus targeted reference material on Solana primitives, DeFi, and trading.

## Repo layout

```
ai-training/
├── README.md                    ← you are here
├── requirements.txt             ← Python deps
├── .gitignore                   ← excludes checkpoints / outputs / secrets
├── data/
│   └── solana_clawd_seed.jsonl  ← seed SFT pairs (~20 conversations)
├── configs/
│   ├── lora_config.yaml         ← LoRA + training hyperparameters
│   └── eval_config.yaml         ← evaluation config
├── scripts/
│   ├── prepare_dataset.py       ← JSONL → HF Datasets (parquet)
│   ├── train_lora.py            ← LoRA SFT via TRL + PEFT
│   ├── evaluate.py              ← held-out inference eval
│   └── launch_hf_jobs.sh        ← submit remote GPU job
├── dataset_card.md              ← dataset README (upload to Hub)
├── model_card.md                ← model README (upload to Hub)
├── checkpoints/                 ← (gitignored) LoRA adapter weights
└── outputs/                     ← (gitignored) eval reports
```

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
