#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[nvidia-setup] root: ${ROOT_DIR}"
echo "[nvidia-setup] this script validates local files only; install heavy NVIDIA stacks explicitly."

python3 "${ROOT_DIR}/nvidia/scripts/verify_nvidia.py" --strict

cat <<'MSG'

Next optional installs depend on the target environment:
  - NeMo / NIM / NeMo Agent Toolkit for NVIDIA-hosted or self-hosted models
  - RAPIDS / cuOpt / cuFOLIO for GPU portfolio optimization
  - nv-ingest / NeMo Retriever for enterprise RAG ingestion

Keep NVIDIA_API_KEY, HF_TOKEN, WANDB_API_KEY, and wallet secrets in the shell or
secret manager. Do not write them into YAML, JSON, markdown, or git history.
MSG
