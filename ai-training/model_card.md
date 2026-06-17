---
# ── HF Metadata (required for Hub) ────────────────────────────────────────────
# Replace every <PLACEHOLDER> before pushing to the Hub.
language: en
license: apache-2.0
base_model: Qwen/Qwen2.5-1.5B-Instruct
# Other common bases:
#   NousResearch/Hermes-3-Llama-3.1-8B   ← tool-use / perps function calling
#   meta-llama/Llama-3.2-1B-Instruct     ← ultra-small edge deployment
datasets:
  - solanaclawd/solana-clawd-instruct    # replace with your dataset repo ID
tags:
  - solana
  - defi
  - crypto
  - agent
  - lora
  - peft
  - constitutional-ai
  # add one of these if applicable:
  # - function-calling   ← Hermes-3 tool-use model
  # - code               ← if this model is code-specialized
library_name: peft
pipeline_tag: text-generation
# ──────────────────────────────────────────────────────────────────────────────
---

# Solana Clawd 1.5B LoRA

A LoRA fine-tune of Qwen2.5-1.5B-Instruct for Solana development, DeFi reasoning, memecoin risk analysis, agent architecture, and Clawd constitutional behavior.

**Base model**: [Qwen/Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)  
**Adapter type**: LoRA (r=16, alpha=32, ~9M trainable params / 0.6% of base)  
**Training data**: [solanaclawd/solana-clawd-instruct](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct)  
**Training config**: `ai-training/configs/lora_config.yaml`  
**Hub model ID**: `solanaclawd/solana-clawd-1.5b-lora`

> **Tool-use / function calling?** Use the 8B Hermes-3 base with
> `configs/hermes3_lora_config.yaml` and the `perps/` function-calling suite
> (13 tools: funding rate, paper trade, risk assessment, Jupiter quotes).

---

## What this model knows

Check every domain your training data covers:

- [x] Solana mechanics (PDAs, accounts, instructions, rent, compute budgets, Token-2022)
- [x] DeFi primitives (AMMs, CLMMs, perpetuals, bonding curves, Jupiter, Phoenix)
- [x] Memecoin risk (rug detection, holder concentration, deployer forensics)
- [x] Agent architecture (skill registries, brain/hands split, multi-agent coordination)
- [x] ZK compression (Light Protocol, nullifiers, Groth16 — see `zk-primitives/`)
- [x] Code generation (Anchor/Rust, TypeScript @solana/kit, Python)
- [x] Constitutional reasoning (Clawd Constitution, guardrails, refusal patterns)
- [ ] Perps function calling ← Hermes-3 8B path only
- [ ] Add your domain here

---

## Intended Use

**Good for**:

- Local Clawd agent inference (MPS / CUDA / CPU, 4 GB+ VRAM)
- Server inference (vLLM, TGI, Ollama after weight merge)
- HF Router (no GPU — OpenAI-compat endpoint)
- Clawd agent runtime (MCP skill, Telegram bot, voice agent)

**Out of scope**:

- Front-running, sandwich attacks, or MEV exploitation
- Wallet draining or social engineering
- Live trading without explicit user confirmation and a trust-gated execution layer
- Financial advice — this model produces analysis, not guaranteed outcomes

---

## Training Details

| Parameter | Value |
| --- | --- |
| Base model | `Qwen/Qwen2.5-1.5B-Instruct` |
| LoRA rank / alpha | 16 / 32 |
| LoRA dropout | 0.05 |
| Target modules | q/k/v/o + gate/up/down projections (all linear) |
| Trainable params | ~9M (0.6% of base) |
| Epochs | 3 |
| Learning rate | 2.0e-4 (cosine scheduler, 3% warmup) |
| Effective batch size | 16 (2 × 8 gradient accumulation) |
| Max sequence length | 4096 tokens |
| Quantization | 4-bit NF4 double-quant at training (CUDA only) |
| Loss | Assistant-only (system + user tokens masked) |
| Training hardware | Not yet recorded in-repo; use `outputs/` + HF Jobs logs for the first canonical run |
| Training time | Not yet recorded in-repo; populate after the first successful adapter export |
| Dataset size | 47 curated conversations -> 42/2/3 train/eval/test split |
| Dataset seed | 42 (deterministic splits) |

### Fireworks managed SFT run

The current Fireworks deployment uses the Hugging Face dataset export from
`solanaclawd/solana-clawd-instruct`, uploaded to Fireworks as JSONL because
the Fireworks dataset API only accepts uploaded files or cloud-storage URIs for
managed SFT.

| Field | Value |
| --- | --- |
| Job | `accounts/beetsbyj-d25663/supervisedFineTuningJobs/b1rgqmi9` |
| Final state | `JOB_STATE_COMPLETED` |
| Completed | `2026-06-17T22:59:49.848326Z` |
| Base model | `accounts/fireworks/models/qwen2p5-7b-instruct` |
| Output model | `accounts/beetsbyj-d25663/models/clawd-glm-5-2` |
| Live-merge deployment | `accounts/beetsbyj-d25663/deployments/clawd-glm-5-2-live` (`FAILED`, Fireworks internal error) |
| Multi-LoRA deployment | `accounts/beetsbyj-d25663/deployments/qwen2p5-7b-clawd-addons` (`FAILED`, Fireworks internal error) |
| Deployment shape | `NVIDIA_A100_80GB` x2, `FP16`, min replicas 0, max replicas 1 |
| Train dataset | `accounts/beetsbyj-d25663/datasets/solana-clawd-20260617` |
| Eval dataset | `accounts/beetsbyj-d25663/datasets/solana-clawd-eval-20260617` |
| Epochs | 1 |
| Learning rate | 1.0e-4 |
| LoRA rank | 8 |
| Max context length | 8192 |

The trained model is `READY` in Fireworks, but both attempted on-demand
deployment methods failed during model-server initialization with a Fireworks
internal error. The account currently has no validated deployment shape returned
for `accounts/fireworks/models/qwen2p5-7b-instruct`.

### How to reproduce

```bash
cd /path/to/solana-clawd/ai-training
pip install -r requirements.txt
export HF_TOKEN=hf_...

# 1. Prepare dataset
python3 scripts/prepare_dataset.py \
  --input data/solana_clawd_seed.jsonl \
  --output data/processed \
  --push --repo-id solanaclawd/solana-clawd-instruct

# 2. Train (local)
python3 scripts/train_lora.py \
  --config configs/lora_config.yaml \
  --dataset-repo solanaclawd/solana-clawd-instruct \
  --output-dir ./outputs/solana-clawd-1.5b-lora \
  --hub-model-id solanaclawd/solana-clawd-1.5b-lora

# 3. Train (remote GPU — recommended for speed)
./scripts/launch_hf_jobs.sh a100-large   # or h200, l4x1, a100x4
```

---

## Evaluation

```bash
python3 scripts/evaluate.py \
  --config configs/eval_config.yaml \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
  --dataset solanaclawd/solana-clawd-eval \
  --out ./outputs/eval \
  --format markdown
```

| Metric | Value |
| --- | --- |
| Eval examples | 13 in the committed eval set; runtime sample size depends on `--num` |
| Throughput | Populate from `outputs/eval/eval_results.json` after running the adapter |
| Refusal rate (heuristic) | Populate from `outputs/eval/eval_results.json` after running the adapter |
| Avg generation length | Populate from `outputs/eval/eval_results.json` after running the adapter |

---

## Usage

### transformers + peft (universal)

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE    = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER = "solanaclawd/solana-clawd-1.5b-lora"

tokenizer = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
model     = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16,
                                                  device_map="auto", trust_remote_code=True)
model     = PeftModel.from_pretrained(model, ADAPTER)

messages = [
    {"role": "system",    "content": "You are Clawd, a sovereign Solana-native AI agent."},
    {"role": "user",      "content": "How do I detect a rug pull on a fresh token?"},
]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

with torch.no_grad():
    out = model.generate(**inputs, max_new_tokens=512, temperature=0.2, top_p=0.9,
                         do_sample=True, pad_token_id=tokenizer.pad_token_id)
print(tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

### mlx-lm (Apple Silicon — fastest local path)

```bash
pip install mlx-lm
mlx_lm.generate \
  --model Qwen/Qwen2.5-1.5B-Instruct \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
  --prompt "How do I detect a rug pull on a fresh Solana token?"
```

### HF Router (no GPU required)

```python
from openai import OpenAI

client = OpenAI(base_url="https://router.huggingface.co/v1", api_key="hf_...")
response = client.chat.completions.create(
    model="solanaclawd/solana-clawd-1.5b-lora",
    messages=[
        {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent."},
        {"role": "user",   "content": "What is a PDA?"},
    ],
    max_tokens=512,
)
print(response.choices[0].message.content)
```

### Hermes-3 perps function calling (8B path only)

```bash
# Paper trade via the perps agent
python3 ai-training/perps/functioncall.py \
  --query "Paper trade: long SOL-PERP $500 at 3x" --verbose

# GOAP reasoning (multi-step strategies)
python3 ai-training/perps/functioncall.py \
  --goap --query "Assess risk of shorting SOL-PERP $1000 at 5x"
```

---

## Limitations

- **Small model**: 1.5B parameters — complex multi-step reasoning on obscure Solana
  primitives may degrade to hallucination. Always verify before acting.
- **Knowledge cutoff**: training data is current as of mid-2026. New programs,
  tickers, or exploits after that date are outside the model's knowledge.
- **Not a trading oracle**: the model produces plans and analyses — risk and
  execution are the user's responsibility.
- **Constitutional guardrails are best-effort**: the model is trained to refuse
  harmful actions, but adversarial prompts may still elicit undesired outputs.
  Wrap production deployments in an independent safety layer.
- **Tokenizer**: Qwen2.5 tokenizer; switch to Llama tokenizer for Hermes-3 base.

---

## Bias and Safety

Trained on curated Solana/DeFi content with a constitutional system prompt.
The dataset explicitly excludes front-running, wallet draining, and sanctions-evasion
examples. Guardrails are heuristic — not formally verified.

For any production trading or financial application, apply independent review.

---

## License

| Artifact | License |
| --- | --- |
| Adapter weights | Apache-2.0 |
| Base model (Qwen2.5) | [Qwen License](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE) |
| Training code | Apache-2.0 |
| Training dataset | CC-BY-4.0 |

---

## Citation

```bibtex
@misc{solana-clawd-YOUR-MODEL-ID,
  title     = {<MODEL NAME>},
  author    = {solanaclawd},
  year      = {2026},
  url       = {https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora},
  note      = {LoRA fine-tune of Qwen2.5-1.5B-Instruct on Solana DeFi + agent data}
}
```
