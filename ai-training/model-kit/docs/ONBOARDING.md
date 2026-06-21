# Solana AI Model Kit Onboarding

This is the shortest path from local files to a reviewable Solana instruction
dataset, optional LoRA adapter, optional Ollama build, and dry-run CAAP registry
payload.

## 1. Local Setup

```bash
cd /Users/8bit/Downloads/solana-clawd
python3 -m venv ai-training/.venv
source ai-training/.venv/bin/activate
python3 -m pip install -r ai-training/requirements.txt
ai-training/model-kit/bin/clawd-model-kit doctor
ai-training/model-kit/bin/clawd-model-kit init
```

Optional auth:

```bash
hf auth login
export WANDB_API_KEY=<set-in-shell-only>
export NVIDIA_API_KEY=<set-in-shell-only>
```

Never put tokens, wallet keys, OAuth client secrets, or ADC JSON into dataset
files, markdown, YAML, frontend bundles, Hub cards, or git commits.

## 2. Drop In Data

Supported local inputs:

- PDF
- JSON and JSONL
- CSV and parquet
- Jupyter notebooks
- Markdown, text, YAML
- PNG, JPEG, WEBP, GIF, BMP, TIFF

Place files in:

```text
ai-training/data/incoming/
```

For image semantics, add a sidecar caption next to the image:

```text
chart.png
chart.png.caption.txt
```

Raw image bytes are not written into SFT rows. The builder writes hashes,
dimensions, MIME type, and sidecar caption text when present.

## 3. One-Shot Dataset

```bash
ai-training/model-kit/bin/clawd-model-kit one-shot \
  ai-training/data/incoming \
  --output-prefix data/model_kit/my-run \
  --dataset-repo solanaclawd/my-solana-dataset \
  --dataset-name "My Solana Dataset" \
  --train-dry-run
```

Outputs:

```text
ai-training/data/model_kit/my-run_sft.jsonl
ai-training/data/model_kit/my-run_processed/
ai-training/data/model_kit/my-run_manifest.json
ai-training/data/model_kit/my-run_dataset_card.md
```

## 4. Upload Dataset

```bash
ai-training/model-kit/bin/clawd-model-kit one-shot \
  ai-training/data/incoming \
  --dataset-repo solanaclawd/my-solana-dataset \
  --push-dataset \
  --yes
```

The `--yes` flag is required for uploads.

## 5. Train

Local dry-run:

```bash
ai-training/model-kit/bin/clawd-model-kit train \
  --lane custom \
  --dataset-path data/model_kit/my-run_processed \
  --output-dir outputs/my-solana-lora \
  --hub-model-id solanaclawd/my-solana-lora \
  --train-dry-run
```

Remote Hugging Face Job:

```bash
ai-training/model-kit/bin/clawd-model-kit train \
  --lane core-ai \
  --remote \
  --flavor a100-large \
  --timeout 4h \
  --yes
```

Remote training costs money and requires Hugging Face write permissions.

## 6. Register

Dry-run payload:

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/my-run_manifest.json
```

Live registry POST:

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/my-run_manifest.json \
  --live \
  --yes
```

Live onchain transactions require the separate `--onchain --yes` path and a
funded, isolated Solana keypair.

## 7. Frontend Console

```bash
ai-training/model-kit/bin/clawd-model-kit ui
```

Then open:

```text
http://127.0.0.1:8765
```

You can also open:

```text
ai-training/model-kit/frontend/index.html
```
