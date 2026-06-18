#!/usr/bin/env bash
# Clawd Ollama build and push pipeline
#
# Two modes:
#   ./build_and_push.sh preview     # push qwen2.5:1.5b base + Clawd system prompt (now)
#   ./build_and_push.sh finetuned   # merge LoRA → GGUF → push fine-tuned model (post-training)
#
# Requirements for 'finetuned' mode:
#   pip install transformers peft torch
#   git clone https://github.com/ggerganov/llama.cpp   (at LLAMA_CPP_DIR)
#   cd llama.cpp && cmake -B build && cmake --build build --target llama-quantize llama-gguf-split
#   ollama account linked at ollama.com (ollama push requires login)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLLAMA_NAMESPACE="${OLLAMA_NAMESPACE:-8bit}"
HF_LORA_REPO="${HF_LORA_REPO:-solanaclawd/solana-clawd-1.5b-lora}"
HF_BASE_MODEL="${HF_BASE_MODEL:-Qwen/Qwen2.5-1.5B-Instruct}"
LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-$HOME/llama.cpp}"
WORK_DIR="${SCRIPT_DIR}/build"
QUANT="${QUANT:-Q4_K_M}"

MODE="${1:-preview}"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo "[clawd] $*"; }
die()   { echo "[clawd] ERROR: $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || die "$1 not found — install it first"; }

# ── Preview mode: base + system prompt ────────────────────────────────────────
push_preview() {
  info "Pulling qwen2.5:1.5b base..."
  ollama pull qwen2.5:1.5b

  info "Creating 8bit/solana-clawd:preview..."
  ollama create "${OLLAMA_NAMESPACE}/solana-clawd:preview" \
    -f "${SCRIPT_DIR}/Modelfile.preview"

  info "Testing locally..."
  ollama run "${OLLAMA_NAMESPACE}/solana-clawd:preview" \
    "What is a PDA on Solana? Answer in one sentence." --nowordwrap

  info "Pushing to ollama.com..."
  ollama push "${OLLAMA_NAMESPACE}/solana-clawd:preview"

  info "Done — preview live at https://ollama.com/${OLLAMA_NAMESPACE}/solana-clawd:preview"
}

# ── Fine-tuned mode: merge → GGUF → quantize → push ──────────────────────────
push_finetuned() {
  require_cmd python3
  require_cmd ollama

  mkdir -p "${WORK_DIR}"
  MERGED_DIR="${WORK_DIR}/solana-clawd-1.5b-merged"
  GGUF_FP16="${WORK_DIR}/solana-clawd-1.5b-fp16.gguf"
  GGUF_QUANT="${WORK_DIR}/solana-clawd-1.5b-${QUANT}.gguf"

  # ── Step 1: Merge LoRA into base ──────────────────────────────────────────
  info "Step 1/4 — Merging LoRA adapter into base model..."
  python3 - <<PYEOF
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

BASE    = "${HF_BASE_MODEL}"
ADAPTER = "${HF_LORA_REPO}"
MERGED  = "${MERGED_DIR}"

print(f"Loading base: {BASE}")
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16, device_map="cpu")
print(f"Applying adapter: {ADAPTER}")
model = PeftModel.from_pretrained(model, ADAPTER)
model = model.merge_and_unload()
print(f"Saving merged model to {MERGED}")
model.save_pretrained(MERGED)
AutoTokenizer.from_pretrained(ADAPTER).save_pretrained(MERGED)
print("Merge complete.")
PYEOF

  # ── Step 2: Convert to GGUF (fp16) ───────────────────────────────────────
  info "Step 2/4 — Converting to GGUF fp16..."
  [[ -d "${LLAMA_CPP_DIR}" ]] || die "llama.cpp not found at ${LLAMA_CPP_DIR} — set LLAMA_CPP_DIR env var"

  python3 "${LLAMA_CPP_DIR}/convert_hf_to_gguf.py" \
    "${MERGED_DIR}" \
    --outfile "${GGUF_FP16}" \
    --outtype f16
  info "GGUF fp16: ${GGUF_FP16}"

  # ── Step 3: Quantize to Q4_K_M ────────────────────────────────────────────
  info "Step 3/4 — Quantizing to ${QUANT}..."
  QUANTIZE_BIN="${LLAMA_CPP_DIR}/build/bin/llama-quantize"
  [[ -f "${QUANTIZE_BIN}" ]] || QUANTIZE_BIN="${LLAMA_CPP_DIR}/quantize"  # older builds
  [[ -f "${QUANTIZE_BIN}" ]] || die "llama-quantize binary not found — build llama.cpp first"

  "${QUANTIZE_BIN}" "${GGUF_FP16}" "${GGUF_QUANT}" "${QUANT}"
  info "Quantized GGUF: ${GGUF_QUANT} ($(du -sh "${GGUF_QUANT}" | awk '{print $1}'))"

  # ── Step 4: Create + push to Ollama ──────────────────────────────────────
  info "Step 4/4 — Building Ollama model and pushing..."

  # Copy Modelfile to work dir alongside the GGUF so relative path resolves
  cp "${SCRIPT_DIR}/Modelfile.finetuned" "${WORK_DIR}/Modelfile"
  # Patch the FROM line to point at the quant file
  sed -i.bak "s|FROM ./solana-clawd-1.5b-q4_K_M.gguf|FROM ${GGUF_QUANT}|" "${WORK_DIR}/Modelfile"

  ollama create "${OLLAMA_NAMESPACE}/solana-clawd:latest" \
    -f "${WORK_DIR}/Modelfile"

  info "Testing locally..."
  ollama run "${OLLAMA_NAMESPACE}/solana-clawd:latest" \
    "What is the SOL-PERP funding rate used for on Phoenix?" --nowordwrap

  ollama push "${OLLAMA_NAMESPACE}/solana-clawd:latest"

  # Also tag as versioned
  local VERSION
  VERSION="1.5b-lora-$(date +%Y%m%d)"
  ollama cp "${OLLAMA_NAMESPACE}/solana-clawd:latest" "${OLLAMA_NAMESPACE}/solana-clawd:${VERSION}"
  ollama push "${OLLAMA_NAMESPACE}/solana-clawd:${VERSION}"

  info "Done!"
  info "  latest  → https://ollama.com/${OLLAMA_NAMESPACE}/solana-clawd"
  info "  version → https://ollama.com/${OLLAMA_NAMESPACE}/solana-clawd:${VERSION}"
  info "GGUF kept at: ${GGUF_QUANT}"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "${MODE}" in
  preview)   push_preview   ;;
  finetuned) push_finetuned ;;
  *)         die "Unknown mode '${MODE}'. Use: preview | finetuned" ;;
esac
