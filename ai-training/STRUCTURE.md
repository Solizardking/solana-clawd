# Solana Clawd AI Training Structure

This repo is organized as a production training workspace, not a flat scripts
folder. Keep source code, generated artifacts, and cache/build outputs in their
own lanes so model releases can be audited and reproduced.

## Primary Lanes

| Path | Lane | Ownership |
| --- | --- | --- |
| `model-kit/` | Product kit | One-shot CLI, frontend, onboarding, Hugging Face, Unsloth, Ollama, and onchain x402 handoff. |
| `nvidia/` | NVIDIA AI Blueprints | NIM routing, NeMo/NemoClawd adapters, cuFOLIO, AIQ, transaction foundation model, signal discovery, RAG, and distillation. |
| `nvidia/integration/` | Bridge source | Python adapters that connect NVIDIA Blueprints to Clawd, Trading Factory, Ollama, Hugging Face, and paper-mode execution. |
| `scripts/` | Operations | Dataset preparation, HF Jobs launch/watch/after scripts, release packaging, eval, Fireworks, and model-kit bootstrap. |
| `data/` | Dataset inputs/manifests | Source JSONL files, processed splits, dataset cards, strategy handoffs, and blueprint manifests. |
| `data/model_kit/` | Generated data products | Optimized rerun datasets, quality reports, and processed splits for the model kit. |
| `configs/` | Training config | LoRA, realtime research, GLM, Hermes, Core AI, and NVIDIA Trading Factory training configs. |
| `dao/` | Onchain registration | DAO design, model registration scripts, and attestation helpers. |
| `docs/` | Documentation | Optional long-form docs beyond the public README and cards. |
| `memory/` | Memory adapters | Local memory integration helpers. |
| `schemas/` | Contracts | JSON schemas for layout, manifests, and generated artifacts. |
| `perps/` | Tool interface | Model-facing Phoenix/Vulcan perps tools, schemas, and NVIDIA handoff generation. |
| `programs/` | Onchain programs | Anchor programs for Clawd core, registry, and treasury. |
| `sdk/` | Client SDKs | Python and TypeScript SDK surfaces. |
| `space/` | Hugging Face Space | Demo app and runtime requirements. |
| `studio/` | Frontend lab | Local browser experience for inspecting and operating the stack. |
| `trading_factory/` | Trading factory | Strategy factory, cuFOLIO references, Solana factory, and auto-research/wiki inputs. |
| `tests/` | Tests | Program and integration test assets. |

## Generated And Cache Lanes

| Path | Policy |
| --- | --- |
| `outputs/` | Generated release cards, audits, bundles, preflight summaries, and job logs. Do not treat as source unless a specific artifact is intentionally tracked. |
| `data/model_kit/` | Generated optimized datasets and rerun manifests. |
| `nvidia/outputs/` | NVIDIA blueprint run outputs and local model artifacts. |
| `ollama/build/` | Local merged model output for Ollama publishing. |
| `target/` | Rust/Anchor build output. |
| `__pycache__/` | Python bytecode cache. |
| `echo/`, `dirs created/` | Legacy scratch/placeholders. Keep out of release flows unless promoted into a documented source lane. |
| `*.safetensors`, `*.bin`, `*.pt`, `*.gguf`, `*.pkl` | Model weights or binary artifacts. Keep out of git; publish via Hugging Face or Ollama. |

These lanes are covered by `ai-training/.gitignore`. If an output needs to be
released, add a small card, manifest, or script that can reproduce it instead of
committing raw weights or caches.

## NVIDIA Integration Files

| File | Role |
| --- | --- |
| `nvidia/integration/clawd_nim_bridge.py` | OpenAI-compatible route to NVIDIA NIM, Hugging Face Inference, self-hosted Clawd, Clawd Router, or local Ollama. |
| `nvidia/integration/dataset_nvidia_sft.py` | Converts NVIDIA blueprint outputs, AIQ results, signal logs, and NemoClawd assets into SFT JSONL. |
| `nvidia/integration/nemo_clawd.py` | Builds the Core AI inventory and NemoClaw-style sandbox/network/lifecycle blueprint. |
| `nvidia/integration/nemo_clawd_agent.py` | Emits the NVIDIA Clawd agent plan and attaches NemoClawd inventory assets. |
| `nvidia/integration/trading_factory_nvidia.py` | Converts NVIDIA signals into Trading Factory / Vulcan paper-mode strategy configs. |

See `nvidia/integration/README.md` for the detailed integration contract.

## Top-Level Artifacts

| File | Role |
| --- | --- |
| `README.md` | Public project entrypoint, model/dataset links, one-shot bootstrap, and network story. |
| `model_card.md` | Model card template and release notes. |
| `dataset_card.md` | Dataset card template and provenance notes. |
| `onchain.md`, `onchainai.md` | Onchain registration and Solana AI network docs. |
| `clawd_solana_svm_ai_compute_design.md` | Design doc for the SVM AI compute network. |
| `SESSIONS.md` | Session notes and operational history. |
| `requirements.txt` | Python dependency baseline. |
| `Anchor.toml`, `Cargo.toml`, `Cargo.lock` | Anchor/Rust program workspace. |
| `solana1_yourgpt.jsonl`, `trainingday.jsonl` | Legacy/source training JSONL inputs. |

## Verification

Run these from `ai-training/`:

```bash
python3 scripts/organize_ai_training.py --check
python3 nvidia/scripts/verify_nvidia.py --strict
python3 nvidia/blueprints/transaction-foundation-model/preflight.py
```

The layout checker validates the required source/docs/config paths and reports
which generated/cache lanes are present. It does not move files or delete
artifacts.

To write a machine-readable inventory:

```bash
python3 scripts/organize_ai_training.py --write
```

Default output: `outputs/ai_training_inventory.json`.

## Safety Rules

- Keep API keys, OAuth files, wallet material, and private credentials out of
  JSON, YAML, markdown, logs, and generated manifests.
- Default agent and trading paths to `observer` or `paper` unless a trust gate
  explicitly authorizes live execution.
- Do not move files under `nvidia/integration/`, `trading_factory/`, `perps/`,
  or `scripts/` without updating imports, verifier requirements, and docs.
- Publish model weights through Hugging Face or Ollama; keep git focused on
  source, manifests, cards, and reproducible launch scripts.
