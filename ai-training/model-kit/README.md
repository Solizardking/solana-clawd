# Solana AI Model Kit

The Solana AI Model Kit turns this repo into a repeatable path for:

1. building public-safe Solana instruction datasets,
2. training LoRA adapters on Hugging Face Jobs,
3. publishing the datasets and adapters to the `solanaclawd` Hugging Face org,
4. registering the model in the CAAP/1.0 registry at `onchain.x402.wtf`, and
5. serving it through an OpenAI-compatible or x402-aware router.

![Solana AI Model Kit](../../assets/solana-ai-model-kit.svg)

## One-Shot

Audit-only, safe by default:

```bash
curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/ai-training/scripts/solana_ai_model_kit.sh | bash
```

Use an existing checkout:

```bash
bash ai-training/scripts/solana_ai_model_kit.sh --local
```

Publish and train the trading-factory lane after `hf auth login`:

```bash
bash ai-training/scripts/solana_ai_model_kit.sh --local --publish --train --trading-factory
```

Dry-run a CAAP registry payload:

```bash
bash ai-training/scripts/solana_ai_model_kit.sh \
  --local \
  --register \
  --hf-model solanaclawd/solana-clawd-core-ai-1.5b-lora
```

Live POST to `https://onchain.x402.wtf/api/register`:

```bash
bash ai-training/scripts/solana_ai_model_kit.sh \
  --local \
  --live-register \
  --hf-model YOUR_ORG/your-model \
  --endpoint https://your-router.example/v1 \
  --eval-accuracy 0.60 \
  --dataset-size 35173
```

## Current Public Artifacts

| Artifact | Hub repo | Status |
| --- | --- | --- |
| Core AI dataset | [`solanaclawd/solana-clawd-core-ai-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-core-ai-instruct) | 35,173 examples |
| Realtime research dataset | [`solanaclawd/solana-clawd-realtime-research-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct) | 29,058 examples |
| NVIDIA trading factory dataset | [`solanaclawd/solana-clawd-nvidia-trading-factory-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct) | 142 examples, 127/7/8 splits |
| Core 1.5B LoRA | [`solanaclawd/solana-clawd-core-ai-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-core-ai-1.5b-lora) | adapter upload pending successful recovery/retrain |
| Trading factory 8B LoRA | [`solanaclawd/solana-nvidia-trading-factory-8b-lora`](https://huggingface.co/solanaclawd/solana-nvidia-trading-factory-8b-lora) | Completed HF job `ordlibrary/6a35a2ce953ed90bfb945009`; train loss 1.1692, eval loss 0.8064 |

## OnChain-AI Sidecar

The registry API is implemented by the Flask backend in the OnChain-AI project
and surfaced at `https://onchain.x402.wtf`.

Local backend:

```bash
export ONCHAIN_AI_ROOT=/Users/8bit/Downloads/OnChain-Ai-main
cd "$ONCHAIN_AI_ROOT/backend"
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
PORT=5001 python3 main.py
```

Local frontend:

```bash
cd "$ONCHAIN_AI_ROOT/frontend"
npm install
VITE_API_BASE_URL=http://localhost:5001 npm run dev
```

Registry checks:

```bash
curl -sS https://onchain.x402.wtf/.well-known/clawd-registry.json | python3 -m json.tool
curl -sS "https://onchain.x402.wtf/api/models?hf_id=solanaclawd/solana-clawd-core-ai-1.5b-lora" | python3 -m json.tool
```

## Safety Contract

- `HF_TOKEN`, `WANDB_API_KEY`, `NVIDIA_API_KEY`, Google credentials, and wallet
  files stay in your shell or secret manager.
- Dataset builders scan for common token/private-key patterns before release.
- Trading-factory examples default to paper mode.
- Live trading requires an execution client, wallet controls, explicit operator
  approval, and pre-trade risk gates outside the dataset.
