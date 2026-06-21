# Unsloth Guide

Unsloth is an optional local acceleration path for developers who want a
notebook/studio workflow around LoRA, QLoRA, GGUF export, and local model runs.
The default Clawd training path remains `scripts/train_lora.py` with
Transformers, PEFT, TRL, and Hugging Face Jobs.

Official references:

- Docs: https://unsloth.ai/docs
- GitHub: https://github.com/unslothai/unsloth
- Install script from the docs: `curl -fsSL https://unsloth.ai/install.sh | sh`

## Install

```bash
curl -fsSL https://unsloth.ai/install.sh | sh
```

Launch the local UI:

```bash
unsloth studio -H 0.0.0.0 -p 8888
```

## Use With Model-Kit Data

Build a dataset first:

```bash
ai-training/model-kit/bin/clawd-model-kit one-shot \
  ai-training/data/incoming \
  --output-prefix data/model_kit/unsloth-run
```

Use either:

```text
ai-training/data/model_kit/unsloth-run_sft.jsonl
```

or the parquet/HF Dataset directory:

```text
ai-training/data/model_kit/unsloth-run_processed/
```

Recommended settings for a first local pass:

```yaml
base_model: Qwen/Qwen2.5-1.5B-Instruct
max_seq_length: 4096
lora_r: 16
lora_alpha: 32
load_in_4bit: true
packing: false
```

## Export Back To The Kit

After Unsloth training, export adapter files into:

```text
ai-training/outputs/unsloth/<run-name>/
```

Expected adapter release files:

```text
adapter_config.json
adapter_model.safetensors
README.md
```

Then register a dry-run payload:

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/<your-adapter-repo> \
  --manifest data/model_kit/unsloth-run_manifest.json
```

## Security

Unsloth is allowed to read local data and model weights. Keep the training
workspace separate from wallets, OAuth files, browser profiles, and private RPC
credentials. Publish only after running:

```bash
ai-training/model-kit/bin/clawd-model-kit verify --path ai-training/outputs/unsloth
```
