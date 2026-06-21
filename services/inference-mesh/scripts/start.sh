#!/bin/bash
set -e

CORE_MODEL="${DEFAULT_INFERENCE_MODEL:-8bit/solana-clawd-core-ai}"
TRADING_MODEL="${TRADING_INFERENCE_MODEL:-8bit/solana-trading-factory}"
DEFAULT_INFERENCE_MODELS="${CORE_MODEL},${TRADING_MODEL},8bit/solana-trading-factory:8b-lora-20260620,8bit/solana-trading-factory:latest,8bit/solana-trading-factory:preview,8bit/solana-clawd-core-ai:1.5b-merged-20260620,8bit/solana-clawd-core-ai:latest,8bit/solana-clawd-core-ai:preview,8bit/solana-clawd:preview,8bit/DeepSolana:latest,hermes3:8b,qwen2.5:1.5b,nemotron3:33b"
INFERENCE_MODELS="${INFERENCE_MODELS:-$DEFAULT_INFERENCE_MODELS}"

# Start Ollama daemon in background
ollama serve &

# Wait for Ollama to be ready
echo "[mesh] waiting for ollama..."
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:11434/api/version > /dev/null 2>&1; then
    echo "[mesh] ollama ready after ${i}s"
    break
  fi
  sleep 2
done

pull_if_missing() {
  local model="$1"
  if ollama list 2>/dev/null | grep -q "^${model}"; then
    echo "[mesh] model cached: $model"
  else
    echo "[mesh] pulling $model ..."
    ollama pull "$model" || echo "[mesh] warn: could not pull $model (will retry on first request)"
  fi
}

preload_models() {
  seen_models=""
  for model in $(echo "$INFERENCE_MODELS" | tr ',' ' '); do
    if [ -z "$model" ]; then
      continue
    fi
    case " $seen_models " in
      *" $model "*) continue ;;
    esac
    seen_models="$seen_models $model"
    pull_if_missing "$model"
  done
}

# Keep Fly health checks responsive. Missing models are also pulled on first
# request, so preloading can safely continue after the API/admin server starts.
preload_models &

echo "[mesh] starting inference API on port ${PORT:-8080}"
exec node dist/server.js
