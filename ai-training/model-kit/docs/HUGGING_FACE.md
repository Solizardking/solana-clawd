# Hugging Face Guide

The kit uses the modern `hf` CLI, Hugging Face Jobs, and Hub repositories.

Official references:

- CLI guide: https://huggingface.co/docs/huggingface_hub/guides/cli
- Upload guide: https://huggingface.co/docs/huggingface_hub/guides/upload
- Jobs guide: https://huggingface.co/docs/huggingface_hub/guides/jobs
- Solana Clawd org: https://huggingface.co/solanaclawd

## Install And Auth

```bash
curl -LsSf https://hf.co/cli/install.sh | bash
hf auth login
hf auth whoami
```

Prefer `HF_TOKEN` in the shell or `hf auth login`. Do not pass tokens in command
history or write them into config files.

## Dataset Upload

Local generated datasets are written as JSONL, parquet splits, a manifest, and
a dataset card. Upload through the one-shot path:

```bash
ai-training/model-kit/bin/clawd-model-kit one-shot \
  ai-training/data/incoming \
  --dataset-repo solanaclawd/my-solana-dataset \
  --push-dataset \
  --yes
```

Or build a staged bundle:

```bash
ai-training/model-kit/bin/clawd-model-kit upload --bundle
```

Manual upload after review:

```bash
hf upload solanaclawd/my-solana-dataset \
  ai-training/outputs/hf_release_bundle/datasets/realtime_research \
  . \
  --type dataset \
  --commit-message "chore: upload Solana model-kit dataset"
```

## Jobs

Hugging Face Jobs run a command inside a Docker image on HF infrastructure,
including GPU flavors. The kit delegates to the existing launchers:

```bash
ai-training/model-kit/bin/clawd-model-kit train \
  --lane core-ai \
  --remote \
  --flavor a100-large \
  --timeout 4h \
  --yes
```

Monitor:

```bash
hf jobs ps
hf jobs inspect <namespace/job-id>
hf jobs logs <namespace/job-id>
hf jobs stats
```

## Release Gates

Before public release:

```bash
ai-training/model-kit/bin/clawd-model-kit verify
python3 ai-training/scripts/verify_core_ai_release.py
python3 ai-training/scripts/verify_trading_factory_release.py --local-only --strict
```

For the full local trading-factory release gate:

```bash
ai-training/model-kit/bin/clawd-model-kit verify --full-release
```

The model repo is not complete until it contains adapter weights and config,
normally `adapter_model.safetensors` and `adapter_config.json`.
