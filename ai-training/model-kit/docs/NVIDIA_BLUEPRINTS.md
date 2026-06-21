# NVIDIA AI Blueprint Integration

The local NVIDIA folder adapts six official NVIDIA AI Blueprint patterns into
the Solana Clawd training pipeline.

Official references:

- Transaction foundation model: https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model
- Model distillation for financial data: https://build.nvidia.com/nvidia/ai-model-distillation-for-financial-data
- Enterprise RAG pipeline: https://build.nvidia.com/nvidia/build-an-enterprise-rag-pipeline
- Quantitative signal discovery agent: https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent
- Quantitative portfolio optimization: https://build.nvidia.com/nvidia/quantitative-portfolio-optimization
- AI-Q: https://build.nvidia.com/nvidia/aiq

## Local Mapping

| NVIDIA pattern | Local Solana Clawd path | Purpose |
| --- | --- | --- |
| Transaction foundation model | `nvidia/blueprints/transaction-foundation-model/` | Convert Solana transaction JSONL into decoder/pretraining data and embeddings. |
| Model distillation | `nvidia/blueprints/model-distillation/` | Use hosted Nemotron/Hermes teacher outputs to create smaller Clawd student examples. |
| Enterprise RAG | `nvidia/blueprints/enterprise-rag/` | Document ingestion, retrieval, and generation contract for Solana docs and PDFs. |
| Signal discovery | `nvidia/blueprints/signal-discovery/` | Paper-mode Phoenix/Vulcan signal discovery and evaluation. |
| Portfolio optimization | `nvidia/blueprints/portfolio-optimization/` and `nvidia/cufolio/` | Mean-CVaR portfolio handoff with GPU-first and CPU fallback paths. |
| AI-Q | `nvidia/blueprints/aiq/` | Release scoring for safety, role coverage, and artifact completeness. |

## Commands

Verify the integration:

```bash
ai-training/model-kit/bin/clawd-model-kit nvidia verify --strict
```

Generate the NemoClawd factory plan:

```bash
ai-training/model-kit/bin/clawd-model-kit nvidia strategies
```

Run AI-Q style scoring:

```bash
ai-training/model-kit/bin/clawd-model-kit nvidia aiq --strict
```

Continue the transaction foundation model after a training job finishes:

```bash
cd ai-training
bash scripts/after_transaction_foundation_job.sh

# Optional: run eval, build the HF bundle, and dry-run registry metadata.
EVALUATE=1 BUNDLE=1 REGISTER=1 bash scripts/after_transaction_foundation_job.sh
```

The same path is exposed through the model kit:

```bash
ai-training/model-kit/bin/clawd-model-kit train --lane tx-foundation --train-dry-run
ai-training/model-kit/bin/clawd-model-kit nvidia tx-preflight --strict
ai-training/model-kit/bin/clawd-model-kit train --lane tx-foundation --remote --yes
ai-training/model-kit/bin/clawd-model-kit nvidia tx-foundation --strict
```

If the remote launch reports `402 Payment Required`, the authenticated
Hugging Face account needs Jobs credits. After adding credits, re-run the remote
train command and watch it with:

```bash
cd ai-training
bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>
```

## Training Pattern

The recommended Solana path is a teacher/student flywheel:

1. Ingest Solana docs, wiki/research, transaction traces, and paper-trading traces.
2. Label with hosted NIM/Nemotron or another teacher model.
3. Train a small student first with LoRA.
4. Evaluate JSON validity, safety refusal recall, source coverage, and paper metrics.
5. Publish adapter and cards to Hugging Face.
6. Register the endpoint and metadata at `onchain.x402.wtf`.

Do not start with a frontier-scale model as the first trainable student. Use it
as a teacher, judge, or hosted reasoning backend.

## Hardware Notes

The official NVIDIA blueprints range from CPU-plus-hosted-NIM workflows to
multi-GPU self-hosted workflows. Keep local development lightweight:

- Hosted NIM API for labeling and judging.
- Local Python for dataset assembly.
- HF Jobs for LoRA.
- Optional GPU systems only for self-hosted NIM, NeMo, nv-ingest, RAPIDS, or
  large local training.

## Safety

NVIDIA keys stay in environment variables only:

```bash
export NVIDIA_API_KEY=<set-in-shell-only>
```

Generated artifacts must not contain API keys, OAuth credentials, wallet keys,
or private endpoint credentials.
