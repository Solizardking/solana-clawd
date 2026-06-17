---
license: apache-2.0
base_model: Qwen/Qwen2.5-1.5B-Instruct
tags:
  - solana
  - defi
  - crypto
  - trading
  - anchor
  - memecoin
  - agent
  - clawd
  - lora
  - peft
library_name: peft
pipeline_tag: text-generation
---

# Solana Clawd 1.5B (LoRA)

A Qwen2.5-1.5B-Instruct model fine-tuned with LoRA on the
[solanaclawd/solana-clawd-instruct](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct)
dataset. Designed to run locally on a Mac (MPS) or any 4GB+ GPU, and to
behave like a sober, helpful, constitutionally-grounded Solana degen.

> **Looking for tool-use / function calling?** See the larger
> [`solanaclawd/solana-clawd-8b-lora`](https://huggingface.co/solanaclawd/solana-clawd-8b-lora)
> variant — a LoRA on `NousResearch/Hermes-3-Llama-3.1-8B` (config:
> [`configs/hermes3_lora_config.yaml`](configs/hermes3_lora_config.yaml)),
> which pairs with the [`perps/`](perps/) function-calling suite for live
> Solana perps tool use (13 tools: funding rate, paper trade, risk
> assessment, Jupiter quotes, and more).

## What's in the adapter

- **Base**: `Qwen/Qwen2.5-1.5B-Instruct` (1.54B params, 4096 ctx, bf16)
- **Adapter**: LoRA r=16, alpha=32, dropout=0.05
- **Targets**: all attention + MLP linear projections (`q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`)
- **Trainable params**: ~9M (0.6% of base)
- **Loss**: assistant-only (system + user turns masked)
- **Context length**: 4096 tokens
- **Quantization**: 4-bit NF4 with double-quant at training time (optional at inference via bitsandbytes or merged bf16)

## Intended use

### Direct use

- **Local Clawd agent inference** on Apple Silicon (M-series): runs comfortably with `mlx-lm` or `transformers` + `device_map="mps"`.
- **Server inference** for low-cost agent stacks: pair with vLLM or TGI for serving at scale.
- **Constitutional prompting**: the system prompt is built into the SFT data, so the model defaults to the Clawd voice.

### Out-of-scope use

- **Front-running / sandwich attacks**: the model is trained to refuse these and to never recommend strategies that rely on them.
- **Wallet draining, KYC bypass, sanctions evasion**: refused.
- **Live trading without confirmation**: the model produces trade plans but should always be wrapped in a trust-gated execution layer (the Clawd "Hands" agent pattern).

## How to use

### With `transformers` + `peft`

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

base = "Qwen/Qwen2.5-1.5B-Instruct"
adapter = "solanaclawd/solana-clawd-1.5b-lora"

tokenizer = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    base,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    trust_remote_code=True,
)
model = PeftModel.from_pretrained(model, adapter)

messages = [
    {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent..."},
    {"role": "user", "content": "How do I detect a rug pull on a fresh token?"},
]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

with torch.no_grad():
    out = model.generate(
        **inputs,
        max_new_tokens=512,
        temperature=0.2,
        top_p=0.9,
        do_sample=True,
        pad_token_id=tokenizer.pad_token_id,
    )
print(tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

### With `mlx-lm` (Apple Silicon, fastest path)

```bash
pip install mlx-lm
mlx_lm.generate \
  --model Qwen/Qwen2.5-1.5B-Instruct \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
  --prompt "How do I detect a rug pull on a fresh Solana token?"
```

### With `vllm` (server inference)

```bash
# After merging LoRA into base weights and pushing to solanaclawd/solana-clawd-1.5b
vllm serve solanaclawd/solana-clawd-1.5b --port 8000 --max-model-len 4096
```

## Training data

[solanaclawd/solana-clawd-instruct](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct)

## Training procedure

- **Framework**: TRL `SFTTrainer` + PEFT LoRA
- **Hardware**: A100-80GB (recommended) / A10G-24GB / L4-24GB
- **Hyperparameters**: see the training repo's `configs/lora_config.yaml`
- **Reproducibility**: seeded (`seed=42`); config + script + dataset are all versioned on the Hub

## Evaluation

Held-out 5% test split from the training dataset. Run:

```bash
python3 scripts/evaluate.py --num 100
```

The script reports:
- **Throughput** (examples/sec)
- **Refusal rate** on a red-team slice
- **Average generation length**
- A sample of 20 generations for human review

## Limitations

- **1.5B is small**. Complex multi-step reasoning on obscure Solana primitives may degrade to hallucination. Always verify before acting.
- **Knowledge cutoff**: the training data is current as of mid-2026. New programs, tickers, or rugs after that won't be in the model.
- **Not a trading oracle**. The model produces plans and analyses; risk and execution are still your job.
- **Constitutional guardrails are best-effort**. The model is trained to refuse offensive MEV and unsafe requests, but a determined adversarial prompt can still elicit. Wrap in your own guardrails.

## License

Apache-2.0 for the adapter weights. Base model (Qwen2.5-1.5B-Instruct) is under its own Qwen license. Training data is CC-BY-4.0.

## Citation

```bibtex
@misc{solana-clawd-1.5b-2026,
  title  = {Solana Clawd 1.5B (LoRA)},
  author = {Solana Clawd Core Team},
  year   = {2026},
  url    = {https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora}
}
```
