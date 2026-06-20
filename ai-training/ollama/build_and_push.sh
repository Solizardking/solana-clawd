#!/usr/bin/env bash
# Clawd Ollama — build and push all models
#
# Usage:
#   ./build_and_push.sh preview                    # push ALL preview models
#   ./build_and_push.sh preview  core-ai           # push only core-ai preview
#   ./build_and_push.sh preview  trading-factory   # push only trading-factory preview
#   ./build_and_push.sh finetuned                  # build + push ALL fine-tuned GGUF models
#   ./build_and_push.sh finetuned core-ai          # build + push core-ai fine-tuned only
#   ./build_and_push.sh finetuned trading-factory  # build + push trading-factory fine-tuned only
#   ./build_and_push.sh all                        # preview + finetuned for all models
#
# Requirements for 'finetuned':
#   brew install llama.cpp
#   pip install transformers peft torch accelerate huggingface_hub
#   ollama account linked at ollama.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLLAMA_NS="${OLLAMA_NS:-8bit}"
WORK_DIR="${SCRIPT_DIR}/build"
QUANT="${QUANT:-Q4_K_M}"
HF_TOKEN="${HF_TOKEN:-}"

# llama.cpp tools (brew install llama.cpp)
LLAMA_QUANTIZE="$(command -v llama-quantize 2>/dev/null || echo '')"
CONVERT_SCRIPT="$(find /opt/homebrew/Cellar/llama.cpp -name 'convert_hf_to_gguf.py' 2>/dev/null | head -1 || echo '')"

MODE="${1:-preview}"
TARGET="${2:-all}"   # all | core-ai | trading-factory

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;36m[clawd]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[✓]\033[0m $*"; }
die()   { echo -e "\033[1;31m[✗]\033[0m $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || die "'$1' not found — install it first"; }

# ── Preview: pull base + system prompt ────────────────────────────────────────
push_preview_core_ai() {
  info "=== Core AI 1.5B — preview ==="
  info "Pulling qwen2.5:1.5b..."
  ollama pull qwen2.5:1.5b

  info "Building ${OLLAMA_NS}/solana-clawd-core-ai:preview..."
  ollama create "${OLLAMA_NS}/solana-clawd-core-ai:preview" \
    -f "${SCRIPT_DIR}/Modelfile.core-ai-preview"

  info "Smoke test..."
  ollama run "${OLLAMA_NS}/solana-clawd-core-ai:preview" \
    "What is a PDA on Solana? One sentence." --nowordwrap

  info "Pushing to ollama.com..."
  ollama push "${OLLAMA_NS}/solana-clawd-core-ai:preview"
  ok "https://ollama.com/${OLLAMA_NS}/solana-clawd-core-ai:preview"
}

push_preview_trading_factory() {
  info "=== Trading Factory 8B — preview ==="
  info "Pulling hermes3:8b..."
  ollama pull hermes3:8b

  info "Building ${OLLAMA_NS}/solana-trading-factory:preview..."
  ollama create "${OLLAMA_NS}/solana-trading-factory:preview" \
    -f "${SCRIPT_DIR}/Modelfile.trading-factory-preview"

  info "Smoke test..."
  ollama run "${OLLAMA_NS}/solana-trading-factory:preview" \
    "What is the SOL-PERP funding rate used for on Phoenix?" --nowordwrap

  info "Pushing to ollama.com..."
  ollama push "${OLLAMA_NS}/solana-trading-factory:preview"
  ok "https://ollama.com/${OLLAMA_NS}/solana-trading-factory:preview"
}

# ── Fine-tuned: download → merge (if needed) → GGUF → quantize → push ────────
merge_and_convert() {
  local LABEL="$1"
  local HF_BASE="$2"
  local HF_ADAPTER="$3"   # empty string = already merged (just download directly)
  local MERGED_DIR="$4"
  local GGUF_FP16="$5"
  local GGUF_QUANT="$6"
  local QUANT_TYPE="$7"

  mkdir -p "${WORK_DIR}"

  if [[ -n "${HF_ADAPTER}" ]]; then
    info "Step 1/4 [${LABEL}] — Merging LoRA adapter into base..."
    python3 - <<PYEOF
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch, os

BASE    = "${HF_BASE}"
ADAPTER = "${HF_ADAPTER}"
MERGED  = "${MERGED_DIR}"
TOKEN   = os.environ.get("HF_TOKEN", "")

print(f"  base:    {BASE}")
print(f"  adapter: {ADAPTER}")
model = AutoModelForCausalLM.from_pretrained(
    BASE, torch_dtype=torch.bfloat16, device_map="cpu",
    token=TOKEN if TOKEN else None,
)
model = PeftModel.from_pretrained(model, ADAPTER, token=TOKEN if TOKEN else None)
model = model.merge_and_unload()
model.save_pretrained(MERGED)
AutoTokenizer.from_pretrained(ADAPTER, token=TOKEN if TOKEN else None).save_pretrained(MERGED)
print(f"  merged → {MERGED}")
PYEOF
  else
    info "Step 1/4 [${LABEL}] — Downloading merged model from HF (${HF_BASE})..."
    python3 - <<PYEOF
from huggingface_hub import snapshot_download
import os

REPO   = "${HF_BASE}"
DEST   = "${MERGED_DIR}"
TOKEN  = os.environ.get("HF_TOKEN", "")

print(f"  downloading {REPO} → {DEST}")
snapshot_download(
    repo_id=REPO,
    local_dir=DEST,
    token=TOKEN if TOKEN else None,
    ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*"],
)
print("  download complete")
PYEOF
  fi

  [[ -n "${CONVERT_SCRIPT}" ]] || die "convert_hf_to_gguf.py not found — brew install llama.cpp"
  info "Step 2/4 [${LABEL}] — Converting to GGUF fp16..."
  python3 "${CONVERT_SCRIPT}" \
    "${MERGED_DIR}" \
    --outfile "${GGUF_FP16}" \
    --outtype f16
  ok "GGUF fp16: ${GGUF_FP16} ($(du -sh "${GGUF_FP16}" | awk '{print $1}'))"

  [[ -n "${LLAMA_QUANTIZE}" ]] || die "llama-quantize not found — brew install llama.cpp"
  info "Step 3/4 [${LABEL}] — Quantizing to ${QUANT_TYPE}..."
  "${LLAMA_QUANTIZE}" "${GGUF_FP16}" "${GGUF_QUANT}" "${QUANT_TYPE}"
  ok "Quantized: ${GGUF_QUANT} ($(du -sh "${GGUF_QUANT}" | awk '{print $1}'))"
}

push_finetuned_core_ai() {
  info "=== Core AI 1.5B — fine-tuned GGUF ==="
  require_cmd ollama
  require_cmd python3

  local MERGED_DIR="${WORK_DIR}/solana-clawd-core-ai-1.5b-merged"
  local GGUF_FP16="${WORK_DIR}/solana-clawd-core-ai-1.5b-fp16.gguf"
  local GGUF_QUANT="${WORK_DIR}/solana-clawd-core-ai-1.5b-${QUANT}.gguf"

  # Merge LoRA adapter into base (solanaclawd/solana-clawd-1.5b is an empty repo)
  merge_and_convert \
    "core-ai" \
    "Qwen/Qwen2.5-1.5B-Instruct" \
    "solanaclawd/solana-clawd-core-ai-1.5b-lora" \
    "${MERGED_DIR}" \
    "${GGUF_FP16}" \
    "${GGUF_QUANT}" \
    "${QUANT}"

  info "Step 4/4 [core-ai] — Building Ollama model and pushing..."
  # Write Modelfile with absolute GGUF path
  local MF="${WORK_DIR}/Modelfile.core-ai"
  sed "s|FROM ./solana-clawd-core-ai-1.5b-Q4_K_M.gguf|FROM ${GGUF_QUANT}|" \
    "${SCRIPT_DIR}/Modelfile.core-ai-finetuned" > "${MF}"

  ollama create "${OLLAMA_NS}/solana-clawd-core-ai:latest" -f "${MF}"

  info "Smoke test..."
  ollama run "${OLLAMA_NS}/solana-clawd-core-ai:latest" \
    "Explain Solana's turbine block propagation. Be concise." --nowordwrap

  ollama push "${OLLAMA_NS}/solana-clawd-core-ai:latest"

  local VERSION
  VERSION="1.5b-merged-$(date +%Y%m%d)"
  ollama cp "${OLLAMA_NS}/solana-clawd-core-ai:latest" "${OLLAMA_NS}/solana-clawd-core-ai:${VERSION}"
  ollama push "${OLLAMA_NS}/solana-clawd-core-ai:${VERSION}"

  ok "https://ollama.com/${OLLAMA_NS}/solana-clawd-core-ai"
  ok "https://ollama.com/${OLLAMA_NS}/solana-clawd-core-ai:${VERSION}"
  info "GGUF kept at: ${GGUF_QUANT}"
}

push_finetuned_trading_factory() {
  info "=== Trading Factory 8B — fine-tuned GGUF ==="
  require_cmd ollama
  require_cmd python3

  local MERGED_DIR="${WORK_DIR}/solana-trading-factory-8b-merged"
  local GGUF_FP16="${WORK_DIR}/solana-trading-factory-8b-fp16.gguf"
  local GGUF_QUANT="${WORK_DIR}/solana-trading-factory-8b-${QUANT}.gguf"

  merge_and_convert \
    "trading-factory" \
    "NousResearch/Hermes-3-Llama-3.1-8B" \
    "solanaclawd/solana-nvidia-trading-factory-8b-lora" \
    "${MERGED_DIR}" \
    "${GGUF_FP16}" \
    "${GGUF_QUANT}" \
    "${QUANT}"

  info "Step 4/4 [trading-factory] — Building Ollama model and pushing..."
  local MF="${WORK_DIR}/Modelfile.trading-factory"
  sed "s|FROM ./solana-trading-factory-8b-Q4_K_M.gguf|FROM ${GGUF_QUANT}|" \
    "${SCRIPT_DIR}/Modelfile.trading-factory-finetuned" > "${MF}"

  ollama create "${OLLAMA_NS}/solana-trading-factory:latest" -f "${MF}"

  info "Smoke test..."
  ollama run "${OLLAMA_NS}/solana-trading-factory:latest" \
    "What signals should I check before opening a SOL-PERP long?" --nowordwrap

  ollama push "${OLLAMA_NS}/solana-trading-factory:latest"

  local VERSION
  VERSION="8b-lora-$(date +%Y%m%d)"
  ollama cp "${OLLAMA_NS}/solana-trading-factory:latest" "${OLLAMA_NS}/solana-trading-factory:${VERSION}"
  ollama push "${OLLAMA_NS}/solana-trading-factory:${VERSION}"

  ok "https://ollama.com/${OLLAMA_NS}/solana-trading-factory"
  ok "https://ollama.com/${OLLAMA_NS}/solana-trading-factory:${VERSION}"
  info "GGUF kept at: ${GGUF_QUANT}"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
run_preview() {
  case "${TARGET}" in
    all)              push_preview_core_ai; push_preview_trading_factory ;;
    core-ai)          push_preview_core_ai ;;
    trading-factory)  push_preview_trading_factory ;;
    *)                die "Unknown target '${TARGET}'. Use: all | core-ai | trading-factory" ;;
  esac
}

run_finetuned() {
  case "${TARGET}" in
    all)              push_finetuned_core_ai; push_finetuned_trading_factory ;;
    core-ai)          push_finetuned_core_ai ;;
    trading-factory)  push_finetuned_trading_factory ;;
    *)                die "Unknown target '${TARGET}'. Use: all | core-ai | trading-factory" ;;
  esac
}

case "${MODE}" in
  preview)   run_preview   ;;
  finetuned) run_finetuned ;;
  all)       run_preview; run_finetuned ;;
  *)         die "Unknown mode '${MODE}'. Use: preview | finetuned | all" ;;
esac
