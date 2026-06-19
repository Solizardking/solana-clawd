---
license: cc-by-4.0
task_categories:
  - text-generation
  - question-answering
language:
  - en
tags:
  - solana
  - clawd
  - core-ai
  - agent
  - defi
  - code
  - constitutional-ai
pretty_name: Solana Clawd Core AI Instruct
---

# Solana Clawd Core AI Instruct

Instruction-tuning dataset derived from the local `core-ai` source tree and the
existing Solana Clawd AI training corpus.

## Contents

- Total examples: 35173
- Existing ai-training SFT examples: 25778
- Core AI source chunk examples: 9320
- Core AI knowledge JSONL examples: 75

## Format

Each row is a chat conversation in OpenAI/Hugging Face `messages` schema:

```json
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

## Reproduce

```bash
cd ai-training
python3 scripts/build_core_ai_dataset.py
python3 scripts/prepare_dataset.py \
  --input data/core_ai_clawd_sft.jsonl \
  --output data/core_ai_processed \
  --train-ratio 0.9 --eval-ratio 0.05 --seed 42
```

## Publish

```bash
hf repos create solanaclawd/solana-clawd-core-ai-instruct --type dataset --exist-ok
hf upload solanaclawd/solana-clawd-core-ai-instruct data/core_ai_processed . --repo-type dataset --commit-message "Add processed Core AI splits"
hf upload solanaclawd/solana-clawd-core-ai-instruct data/core_ai_dataset_card.md README.md --repo-type dataset --commit-message "Add dataset card"
hf upload solanaclawd/solana-clawd-core-ai-instruct data/core_ai_clawd_sft.jsonl raw/core_ai_clawd_sft.jsonl --repo-type dataset --commit-message "Add raw JSONL"
hf upload solanaclawd/solana-clawd-core-ai-instruct data/core_ai_dataset_manifest.json metadata/core_ai_dataset_manifest.json --repo-type dataset --commit-message "Add build manifest"
```

## Training

```bash
python3 scripts/train_lora.py --config configs/core_ai_lora_config.yaml --no-push --num-epochs 1
```

For a remote Hugging Face Job, upload the dataset first and then launch with
the same config or override `--dataset-repo solanaclawd/solana-clawd-core-ai-instruct`.

## Safety Notes

The builder runs in public-safe mode by default. It excludes common secret
filenames, private key/token patterns, binary artifacts, dependency folders,
lockfiles, and high-risk security records that are not suitable for public
dataset release.
