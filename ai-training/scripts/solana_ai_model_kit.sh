#!/usr/bin/env bash
# Solana AI Model Kit one-shot bootstrap.
#
# Safe default:
#   curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/ai-training/scripts/solana_ai_model_kit.sh | bash
#
# Live registry POST:
#   curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/ai-training/scripts/solana_ai_model_kit.sh \
#     | bash -s -- --live-register --hf-model YOUR_ORG/your-model

set -euo pipefail

RESET="\033[0m"
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"

ok() { printf "${GREEN}OK${RESET} %s\n" "$*"; }
info() { printf "${CYAN}..${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}!!${RESET} %s\n" "$*"; }
die() { printf "${RED}ERR${RESET} %s\n" "$*" >&2; exit 1; }

REPO_URL="${CLAWD_REPO_URL:-https://github.com/Solizardking/solana-clawd.git}"
GIT_REF="${CLAWD_GIT_REF:-main}"
KIT_DIR="${CLAWD_KIT_DIR:-${HOME}/.solana-clawd-model-kit}"
USE_LOCAL=false
INSTALL_DEPS=false
RUN_AUDIT=true
RUN_PUBLISH=false
RUN_TRAIN=false
RUN_REGISTER=false
REGISTER_DRY_RUN=true
TRAIN_FLAVOR="${CLAWD_TRAIN_FLAVOR:-a100-large}"
TRAIN_TIMEOUT="${CLAWD_TRAIN_TIMEOUT:-4h}"
HF_MODEL_ID="${CLAWD_HF_MODEL:-solanaclawd/solana-clawd-core-ai-1.5b-lora}"
MODEL_ENDPOINT="${CLAWD_MODEL_ENDPOINT:-https://clawd-box-router.fly.dev/v1}"
EVAL_ACCURACY="${CLAWD_EVAL_ACCURACY:-0.60}"
DATASET_SIZE="${CLAWD_DATASET_SIZE:-35173}"
ONCHAIN_AI_ROOT="${ONCHAIN_AI_ROOT:-/Users/8bit/Downloads/OnChain-Ai-main}"

usage() {
  cat <<'EOF'
Solana AI Model Kit

Usage:
  solana_ai_model_kit.sh [flags]

Flags:
  --local                  Use the current solana-clawd checkout instead of cloning
  --kit-dir <path>         Clone/update target directory (default: ~/.solana-clawd-model-kit)
  --repo-url <url>         Git repo URL
  --git-ref <ref>          Branch/tag to checkout (default: main)
  --install-deps           Create .venv and install ai-training/requirements.txt
  --no-audit               Skip local release audit
  --publish                Publish the trading-factory dataset; requires HF auth
  --train                  Launch the trading-factory LoRA HF job; requires HF auth
  --register               Dry-run an onchain.x402.wtf registration payload
  --live-register          POST the registration payload to onchain.x402.wtf/api/register
  --hf-model <repo>        Model repo to register
  --endpoint <url>         Inference endpoint for registry payload
  --eval-accuracy <num>    Eval score for registry payload
  --dataset-size <num>     Dataset size for registry payload
  --trading-factory        Use the trading-factory model/dataset defaults
  --onchain-ai-root <dir>  Print sidecar backend/frontend commands for this checkout
  --help                   Show this help

Secrets:
  Put HF_TOKEN, WANDB_API_KEY, NVIDIA_API_KEY, wallet keys, and Google ADC in
  your shell or secret manager only. This script never writes secrets to files.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) USE_LOCAL=true; shift ;;
    --kit-dir) KIT_DIR="$2"; shift 2 ;;
    --repo-url) REPO_URL="$2"; shift 2 ;;
    --git-ref) GIT_REF="$2"; shift 2 ;;
    --install-deps) INSTALL_DEPS=true; shift ;;
    --no-audit) RUN_AUDIT=false; shift ;;
    --publish) RUN_PUBLISH=true; shift ;;
    --train) RUN_TRAIN=true; shift ;;
    --register) RUN_REGISTER=true; REGISTER_DRY_RUN=true; shift ;;
    --live-register) RUN_REGISTER=true; REGISTER_DRY_RUN=false; shift ;;
    --hf-model) HF_MODEL_ID="$2"; shift 2 ;;
    --endpoint) MODEL_ENDPOINT="$2"; shift 2 ;;
    --eval-accuracy) EVAL_ACCURACY="$2"; shift 2 ;;
    --dataset-size) DATASET_SIZE="$2"; shift 2 ;;
    --trading-factory)
      HF_MODEL_ID="solanaclawd/solana-nvidia-trading-factory-8b-lora"
      DATASET_SIZE="142"
      shift
      ;;
    --onchain-ai-root) ONCHAIN_AI_ROOT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown flag: $1" ;;
  esac
done

printf "${BOLD}Solana AI Model Kit${RESET}\n"
printf "repo=%s\n" "$REPO_URL"
printf "model=%s\n" "$HF_MODEL_ID"
printf "registry=https://onchain.x402.wtf\n\n"

command -v git >/dev/null 2>&1 || die "git is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required"

if [[ "$USE_LOCAL" == "true" ]]; then
  REPO_DIR="$(pwd)"
  [[ -d "${REPO_DIR}/ai-training" ]] || die "--local must run from the solana-clawd repo root"
else
  REPO_DIR="$KIT_DIR"
  if [[ -d "${REPO_DIR}/.git" ]]; then
    info "Updating existing checkout at ${REPO_DIR}"
    git -C "$REPO_DIR" fetch --depth 1 origin "$GIT_REF"
    git -C "$REPO_DIR" checkout FETCH_HEAD
  else
    info "Cloning ${REPO_URL} into ${REPO_DIR}"
    git clone --depth 1 --branch "$GIT_REF" "$REPO_URL" "$REPO_DIR"
  fi
fi

cd "${REPO_DIR}/ai-training"
ok "Using ai-training at $(pwd)"

if [[ -f data/core_ai_dataset_manifest.json ]]; then
  DATASET_SIZE="$(python3 -c 'import json; print(json.load(open("data/core_ai_dataset_manifest.json"))["stats"]["total_examples"])' 2>/dev/null || printf "%s" "$DATASET_SIZE")"
fi

if [[ "$INSTALL_DEPS" == "true" ]]; then
  info "Installing Python dependencies into .venv"
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python3 -m pip install --upgrade pip
  python3 -m pip install -r requirements.txt
  ok "Dependencies installed"
fi

if [[ "$RUN_AUDIT" == "true" ]]; then
  info "Running release audit"
  python3 scripts/run_release_pipeline.py
fi

if [[ "$RUN_PUBLISH" == "true" ]]; then
  info "Publishing trading-factory dataset"
  ./scripts/publish_trading_factory_dataset.sh
fi

if [[ "$RUN_TRAIN" == "true" ]]; then
  info "Launching trading-factory HF training job"
  ./scripts/launch_trading_factory_hf_job.sh "$TRAIN_FLAVOR" "$TRAIN_TIMEOUT"
fi

if [[ "$RUN_REGISTER" == "true" ]]; then
  info "Preparing registry payload for ${HF_MODEL_ID}"
  REG_ARGS=(
    --hf-model "$HF_MODEL_ID"
    --endpoint "$MODEL_ENDPOINT"
    --eval-accuracy "$EVAL_ACCURACY"
    --dataset-size "$DATASET_SIZE"
  )
  if [[ "$REGISTER_DRY_RUN" == "true" ]]; then
    REG_ARGS+=(--dry-run)
  fi
  ./dao/register_model.sh "${REG_ARGS[@]}"
fi

cat <<EOF

Next useful checks:
  curl -sS https://onchain.x402.wtf/.well-known/clawd-registry.json | python3 -m json.tool
  curl -sS "https://onchain.x402.wtf/api/models?hf_id=${HF_MODEL_ID}" | python3 -m json.tool

OnChain-AI sidecar, if present at:
  ${ONCHAIN_AI_ROOT}

Backend:
  cd "${ONCHAIN_AI_ROOT}/backend"
  python3 -m venv .venv
  source .venv/bin/activate
  python3 -m pip install -r requirements.txt
  PORT=5001 python3 main.py

Frontend:
  cd "${ONCHAIN_AI_ROOT}/frontend"
  npm install
  VITE_API_BASE_URL=http://localhost:5001 npm run dev
EOF

ok "Model kit bootstrap complete"
