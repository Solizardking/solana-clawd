# Blueprint 3: AI Model Distillation for Financial Data

https://build.nvidia.com/nvidia/ai-model-distillation-for-financial-data

Distills a large teacher model (Hermes-3-8B or Qwen2.5-7B fine-tuned on
Solana financial data) into the compact 1.5B Clawd student model.

Enables the 1.5B Clawd to reason like the 8B model on perps, DeFi signals,
and portfolio decisions — without the GPU memory requirements.

## Distillation strategies

| Strategy | Speed | Quality | Notes |
|---|---|---|---|
| Response distillation | Fast | Good | Copy teacher outputs as student SFT targets |
| KL divergence | Slow | Best | Minimize KL(teacher logits ∥ student logits) |
| Chain-of-thought | Medium | Good | Teacher generates reasoning traces; student learns CoT |

## Files

| File | Purpose |
|---|---|
| `distill.py` | Main distillation pipeline (response or KL mode) |
| `teacher_student.py` | Teacher inference + student training setup |

## Quick start

```bash
export NVIDIA_API_KEY=nvapi-...
export HF_TOKEN=hf_...

# Step 1: generate teacher outputs on the trading factory dataset
python3 blueprints/model-distillation/distill.py \
  --mode response \
  --teacher solanaclawd/solana-nvidia-trading-factory-8b-lora \
  --student Qwen/Qwen2.5-1.5B-Instruct \
  --dataset ../../data/nvidia_trading_factory_sft.jsonl \
  --output ../../data/distilled_trading_factory.jsonl

# Step 2: train student on distilled outputs
python3 ../../scripts/train_lora.py \
  --input ../../data/distilled_trading_factory.jsonl \
  --config ../../configs/lora_config.yaml
```
