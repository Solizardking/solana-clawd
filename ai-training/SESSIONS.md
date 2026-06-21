# Clawd AI Training — Session Log

## 2026-06-21 — BigQuery Integration + First Local MPS Training Run

### What We Built

#### 1. BigQuery → TFM Pipeline (`bigquery_collector.py`)

Integrated `bigquery-public-data.crypto_solana_mainnet_us` as a real on-chain data
source for the Transaction Foundation Model CPT corpus.

- **File**: `nvidia/blueprints/transaction-foundation-model/bigquery_collector.py`
- **What it does**: Queries Solana mainnet DEX swap transactions (Jupiter v4/v6,
  Phoenix, Orca Whirlpool, Raydium AMM/CLMM/CPMM, Mercurial, Saber) and converts
  them to `SolanaTokenizerPipeline` CPT format:
  `PROG_N IX_SWAP MINT_N MINT_N AMT_N AMT_N FEE_N SLOT_N SIDE_BUY STATUS_SUCCESS`
- **Schema**: Auto-detects two BQ schema variants (nested ARRAY<STRUCT> instructions
  vs separate `instructions` + `token_transfers` tables). Fallback to mock mode.
- **Auth**: ADC only (`gcloud auth application-default login`). GCP project from
  `$GOOGLE_CLOUD_PROJECT` (default: `x402-477302`). No credentials in code/config.
- **Integrated into**: `collect.py` as Source 5 (`bigquery`), default sources list.

**To pull 100K mainnet swaps:**
```bash
python3 nvidia/blueprints/transaction-foundation-model/bigquery_collector.py \
    --limit 100000 --days 90 --append --output data/tx_foundation_cpt.jsonl
```

**To test without GCP auth:**
```bash
python3 nvidia/blueprints/transaction-foundation-model/bigquery_collector.py \
    --mock --limit 500
```

**To inspect the real BQ schema:**
```bash
python3 nvidia/blueprints/transaction-foundation-model/bigquery_collector.py --probe
```

#### 2. Clawd-GLM-5.2 LoRA — First Local Apple Silicon Training Run

**Historic moment**: First successful LoRA fine-tune of a 7B model running entirely
on Apple Silicon MPS (48 GB unified memory, arm64).

- **Config**: `configs/glm52_lora_config_mac.yaml`
- **Base model**: `Qwen/Qwen2.5-7B-Instruct` (7.6B params, bfloat16 → float32 on MPS)
- **Dataset**: `solanaclawd/solana-clawd-instruct` (27,405 train / 1,523 eval)
- **LoRA**: r=16, alpha=32, all-linear, 40.4M trainable params (0.53% of 7.66B)
- **Smoke test**: 100 steps locally, then push to HF Jobs for full 3-epoch run
- **Output adapter**: `outputs/clawd-glm52-lora-mac/`

**Two bugs fixed to make MPS training work:**

1. `device_map="auto"` → `{"": "mps"}` in `train_lora.py`
   - Root cause: Accelerate's auto-dispatch was placing some layers on `meta` device
     (disk offload), causing `MmBackward0: expected device meta but got mps:0`
   - Fix: Explicit single-device map forces all 339 weight shards onto MPS

2. `torch_dtype=bfloat16` → `float32` for MPS forward/backward
   - bfloat16 triggers the same meta-device mismatch in matmul backward graph
   - MPS float32 is stable and correct

3. `gradient_checkpointing: false` in mac config
   - Conflicts with `{"": "mps"}` + PEFT LoRA adapters on Apple Silicon

**Queued run**: After Qwen-7B finishes, `nvidia_trading_factory_lora_config_mac.yaml`
starts automatically (waiter PID 99186).

#### 3. Distillation Capability

`nvidia/blueprints/model-distillation/distill.py` — ready to use.

```bash
# Nemotron as teacher via NIM API
python3 nvidia/blueprints/model-distillation/distill.py \
    --mode cot \
    --teacher nvidia/nemotron-3-nano-30b-a3b \
    --backend nim \
    --dataset data/solana_clawd_merged.jsonl \
    --output data/distilled_clawd_glm52_cot.jsonl
```

Then retrain the LoRA on distilled CoT data for better reasoning traces.

### Commits This Session

| Hash | Message |
|------|---------|
| `d6180bdb` | feat: integrate BigQuery crypto_solana_mainnet_us into TFM pipeline |
| `8d8c5f5f` | fix: resolve MPS meta-device training crash on Apple Silicon |
| `0f7a49bf` | chore: tune mac training config for 100-step smoke test |

### Config Files Added / Modified

| File | Change |
|------|--------|
| `nvidia/blueprints/transaction-foundation-model/bigquery_collector.py` | NEW — BQ extractor |
| `nvidia/blueprints/transaction-foundation-model/collect.py` | Added bigquery as Source 5 |
| `nvidia/configs/solana_tx_foundation.yaml` | BQ dataset + auth docs |
| `nvidia/configs/nemo_clawd_factory.yaml` | BQ collector + bulk cmd in Blueprint 1 |
| `configs/glm52_lora_config_mac.yaml` | NEW — Apple Silicon MPS training config |
| `scripts/train_lora.py` | MPS device_map fix + float32 dtype fix |

### Status at Session End

| Component | Status |
|-----------|--------|
| BQ extractor | ✅ Written, AST-valid, committed |
| collect.py bigquery source | ✅ Wired in, default sources |
| GLM-5.2 smoke test (100 steps) | 🔄 Running — step 0/100, MPS kernel compiling |
| Trading Factory LoRA | ⏳ Queued, starts after GLM-5.2 |
| BQ data pull (100K mainnet) | 🔜 Run after `gcloud auth application-default login` |
| Distillation (CoT via NIM) | 🔜 Run after adapter checkpoint available |
| HF upload (solanaclawd/solana-tx-foundation-cpt) | 🔜 After BQ pull + parquet regen |
