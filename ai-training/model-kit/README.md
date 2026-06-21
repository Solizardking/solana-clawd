# Solana AI Model Kit

The Solana AI Model Kit is the terminal-first training surface for Clawd AI:
drop in PDFs, JSON/JSONL, CSV/parquet, notebooks, markdown, YAML, or image
context; build a public-safe SFT dataset; optionally train LoRA adapters; stage
Hugging Face and Ollama releases; and register the model with CAAP/1.0 at
`onchain.x402.wtf`. The site also includes a live model arena for running chat
or code-generation benchmarks across OpenAI-compatible providers, Anthropic,
Gemini, and custom endpoints, with realtime results and X share links.

![Solana AI Model Kit](../../assets/solana-ai-model-kit.svg)

## Connected Surfaces

| Surface | Link |
| --- | --- |
| Model kit site | https://models.x402.wtf |
| Register page | https://register.x402.wtf |
| Onchain registry | https://onchain.x402.wtf |
| Registry manifest | https://onchain.x402.wtf/.well-known/clawd-registry.json |
| GitHub training repo | https://github.com/solizardking/solana-clawd-ai-training |
| Hugging Face org | https://huggingface.co/solanaclawd |
| Local model kit | `/Users/8bit/Downloads/solana-clawd/ai-training/model-kit` |

## Quick Start

```bash
cd /Users/8bit/Downloads/solana-clawd
python3 -m venv ai-training/.venv
source ai-training/.venv/bin/activate
python3 -m pip install -r ai-training/requirements.txt

ai-training/model-kit/bin/clawd-model-kit doctor
ai-training/model-kit/bin/clawd-model-kit init
```

Drop files into `ai-training/data/incoming/`, then run:

```bash
ai-training/model-kit/bin/clawd-model-kit one-shot \
  ai-training/data/incoming \
  --output-prefix data/model_kit/my-run \
  --dataset-repo solanaclawd/my-solana-dataset \
  --dataset-name "My Solana Dataset" \
  --train-dry-run
```

Open the frontend console:

```bash
ai-training/model-kit/bin/clawd-model-kit ui
```

The deployable static app is also available at:

```text
ai-training/model-kit/frontend/index.html
ai-training/model-kit/frontend/register.html
```

Render/Vercel deployment is documented in `docs/DEPLOYMENT.md`.

## Model Arena

The homepage at `models.x402.wtf` starts with a model arena. It can compare any
provider with an OpenAI-compatible `/chat/completions` endpoint, plus built-in
adapters for Anthropic and Gemini. Provider keys can be supplied per run in the
browser form or via backend environment variables such as `OPENROUTER_API_KEY`,
`OPENAI_API_KEY`, `XAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`.
Keys are not written into run records.

OpenRouter is the primary multi-model lane. Set `OPENROUTER_API_KEY` on the API
server, then choose one of the `OPENROUTER_*` presets from the arena model-id
field. `/api/arena/providers` exposes each preset as `{ env, label, model }`,
and `render.yaml` carries the deployment defaults. Repeated shell variable names
follow normal environment semantics: the final value is canonical, with older
meanings kept under explicit aliases such as `OPENROUTER_CHATGPT_LATEST`,
`OPENROUTER_MODEL6`, `OPENROUTER_RIVER_FLOW`, and `OPENROUTER_FREE_MODEL1`.

Primary OpenRouter defaults:

| Env | Default model |
| --- | --- |
| `OPENROUTER_DEFAULT_FREE_MODEL` | `nvidia/llama-nemotron-rerank-vl-1b-v2:free` |
| `OPENROUTER_FUSION` | `openrouter/fusion` |
| `OPENROUTER_KIMI_MODEL` | `moonshotai/kimi-k2.7-code` |
| `OPENROUTER_CLAWD_DEFAULT_MODEL` | `anthropic/claude-opus-4.8-fast` |
| `OPENROUTER_GPT` | `openai/gpt-5.2` |
| `OPENROUTER_GROK43` | `x-ai/grok-4.3` |
| `OPENROUTER_CODEX` | `openai/gpt-5.1-codex-max` |
| `OPENROUTER_NVIDIA_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` |
| `OPENROUTER_QWEN_MODEL` | `qwen/qwen3.7-plus` |
| `OPENROUTER_DEEP` | `deepseek/deepseek-v3.2` |

Arena API:

| Endpoint | Use |
| --- | --- |
| `GET /api/arena/providers` | Provider templates, adapter metadata, and code execution policy. |
| `POST /api/arena/runs` | Start a chat or code arena run. |
| `GET /api/arena/runs/{id}/events` | Server-sent realtime run events. |
| `GET /api/arena/runs/{id}` | Fetch recorded outputs and benchmarks. |
| `GET /api/arena/runs/{id}/share` | Build a shareable X intent URL. |

Code mode asks each model for Python, extracts the fenced code block, and runs it
with a timeout, temporary working directory, isolated Python flags, basic
resource limits, and a denylist for filesystem/network/process imports. Set
`MODEL_ARENA_ENABLE_CODE_EXECUTION=0` to disable server-side execution.

Completed runs are held in memory for realtime reads and appended to
`MODEL_ARENA_LOG_PATH` as JSONL, defaulting to `/tmp/model-arena-runs.jsonl`.
The API rehydrates completed runs from that log for `/api/arena/runs/{id}` and
shared `?arenaRun=` links; use a mounted path for long-lived production records.

## What It Builds

```text
source files
  -> document parser and secret filter
  -> chat-message SFT JSONL
  -> parquet train/eval/test splits
  -> dataset card and manifest
  -> optional LoRA / QLoRA adapter
  -> optional HF upload
  -> optional Ollama build
  -> optional CAAP registry payload
```

Side effects are gated:

- Local audit, ingest, and dry-run registration are safe by default.
- Hugging Face upload requires `--yes`.
- Remote Hugging Face Jobs require `--yes`.
- Ollama push requires `--yes`.
- Live `onchain.x402.wtf` registry POST requires `--yes`.
- Onchain Solana transactions require `--onchain --live --yes`.

## Package Map

| Path | Purpose |
| --- | --- |
| `bin/clawd-model-kit` | Terminal entrypoint. |
| `clawd_model_kit.py` | Python CLI wrapper around existing `ai-training/scripts/*`. |
| `config.example.yaml` | Example project/lane defaults. |
| `frontend/` | Static `models.x402.wtf` and `register.x402.wtf` pages. |
| `backend/` | Render-ready FastAPI status, arena, and registration proxy. |
| `render.yaml` | Render blueprint for the backend API. |
| `vercel.json` | Vercel static frontend and host rewrite config. |
| `package.json` | Static-site build/dev scripts. |
| `docs/ONBOARDING.md` | End-to-end local walkthrough. |
| `docs/DEPLOYMENT.md` | Render/Vercel deployment and domain wiring. |
| `docs/HUGGING_FACE.md` | HF CLI, upload, and Jobs guide. |
| `docs/UNSLOTH.md` | Optional Unsloth local training guide. |
| `docs/NVIDIA_BLUEPRINTS.md` | NVIDIA blueprint mapping. |
| `docs/PERPS.md` | Solana perps tool lane and function-calling guide. |
| `docs/ONCHAIN_X402.md` | Registry and CAAP handoff. |
| `docs/SECURITY.md` | Release and credential safety contract. |

## CLI

```bash
ai-training/model-kit/bin/clawd-model-kit --help
```

| Command | Use |
| --- | --- |
| `doctor` | Check Python, git, HF CLI/auth, Ollama, env-key presence, frontend files. |
| `init` | Create `data/incoming`, `data/model_kit`, and `outputs/model_kit`. |
| `ingest` | Parse files into SFT JSONL, dataset splits, manifest, and dataset card. |
| `prepare` | Prepare an existing messages JSONL into HF Dataset splits. |
| `verify` | Secret scan model-kit artifacts or run the full release verifier. |
| `train` | Local `train_lora.py` run, dry-run, push, or remote HF Job launch. |
| `one-shot` | Ingest, validate, optionally train and register in one command. |
| `upload` | Build HF release bundles or upload a reviewed path. |
| `register` | Dry-run or live-register CAAP/1.0 metadata. |
| `ollama` | Build/push preview or fine-tuned Ollama models. |
| `nvidia` | Run NVIDIA verifier, AI-Q scoring, or NemoClawd factory plan generation. |
| `perps` | Inspect tools, write perps manifests, create NVIDIA handoffs, or run the function-calling agent. |
| `ui` | Serve the static frontend console. |

## Supported Data

| Type | Handling |
| --- | --- |
| PDF | `auto` extractor tries NVIDIA `nv-ingest`, then Google Document AI, Gemini, then local `pypdf`. |
| JSON/JSONL | Reads `messages`, QA fields, or structured rows. |
| CSV/parquet | Converts rows to QA/context examples when fields match, otherwise structured records. |
| Notebook | Converts markdown and code cells into context chunks. |
| Markdown/text/YAML | Chunks reference text with source hashes. |
| Images | Writes metadata rows; sidecar captions become SFT rows. |

Image sidecars:

```text
chart.png
chart.png.caption.txt
```

Raw image bytes are never written to JSONL rows, cards, manifests, or Hub
uploads.

## Public Artifacts

| Artifact | Hub repo | Status |
| --- | --- | --- |
| Core AI dataset | `solanaclawd/solana-clawd-core-ai-instruct` | 35,173 examples |
| Realtime research dataset | `solanaclawd/solana-clawd-realtime-research-instruct` | 29,058 examples |
| NVIDIA trading factory dataset | `solanaclawd/solana-clawd-nvidia-trading-factory-instruct` | 142 examples, 127/7/8 splits |
| Transaction foundation CPT dataset | `solanaclawd/solana-tx-foundation-cpt` | 19,542 examples, text CPT format |
| Perps tool manifest | `data/model_kit/perps_tool_manifest.json` | 13 model-facing Solana/Phoenix/Jupiter tools |
| Core 1.5B LoRA | `solanaclawd/solana-clawd-core-ai-1.5b-lora` | Core AI adapter lane |
| Solana TX Foundation 1.5B | `solanaclawd/solana-tx-foundation-1.5b` | Transaction CPT -> SFT lane |
| Trading factory 8B LoRA | `solanaclawd/solana-nvidia-trading-factory-8b-lora` | Completed HF job `ordlibrary/6a35a2ce953ed90bfb945009` |

## One-Shot Examples

Local ingest only:

```bash
ai-training/model-kit/bin/clawd-model-kit ingest \
  ai-training/data/incoming \
  --output-prefix data/model_kit/local
```

Dataset upload:

```bash
ai-training/model-kit/bin/clawd-model-kit one-shot \
  ai-training/data/incoming \
  --dataset-repo solanaclawd/my-solana-dataset \
  --push-dataset \
  --yes
```

Local training dry-run against generated data:

```bash
ai-training/model-kit/bin/clawd-model-kit train \
  --lane custom \
  --dataset-path data/model_kit/local_processed \
  --output-dir outputs/my-solana-lora \
  --hub-model-id solanaclawd/my-solana-lora \
  --train-dry-run
```

Remote HF Job:

```bash
ai-training/model-kit/bin/clawd-model-kit train \
  --lane core-ai \
  --remote \
  --flavor a100-large \
  --timeout 4h \
  --yes
```

Dry-run CAAP registration:

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/local_manifest.json
```

Live registry POST:

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/local_manifest.json \
  --endpoint https://your-router.example/v1 \
  --eval-accuracy 0.72 \
  --live \
  --yes
```

## NVIDIA Blueprint Lanes

| Blueprint | Local adapter |
| --- | --- |
| Transaction foundation model | `nvidia/blueprints/transaction-foundation-model/` |
| Model distillation | `nvidia/blueprints/model-distillation/` |
| Enterprise RAG | `nvidia/blueprints/enterprise-rag/` |
| Quantitative signal discovery | `nvidia/blueprints/signal-discovery/` |
| Portfolio optimization | `nvidia/blueprints/portfolio-optimization/` and `nvidia/cufolio/` |
| AI-Q | `nvidia/blueprints/aiq/` |

```bash
ai-training/model-kit/bin/clawd-model-kit nvidia verify --strict
ai-training/model-kit/bin/clawd-model-kit nvidia strategies
ai-training/model-kit/bin/clawd-model-kit nvidia aiq --strict
ai-training/model-kit/bin/clawd-model-kit train --lane tx-foundation --train-dry-run
ai-training/model-kit/bin/clawd-model-kit nvidia tx-preflight --strict
ai-training/model-kit/bin/clawd-model-kit train --lane tx-foundation --remote --yes
ai-training/model-kit/bin/clawd-model-kit nvidia tx-foundation --strict
```

For remote transaction jobs, a `402 Payment Required` response means the
authenticated Hugging Face account needs Jobs credits. After launch, watch with:

```bash
cd ai-training
bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>
```

## Perps Tool Lane

The model kit bakes in the source perps tools from `ai-training/perps/`:
`functions.py`, `functioncall.py`, `nvidia_perps.py`, `prompter.py`, `schema.py`,
and `README.md`. Generated `__pycache__/` files are ignored.

```bash
ai-training/model-kit/bin/clawd-model-kit perps tools
ai-training/model-kit/bin/clawd-model-kit perps tools --write --json
ai-training/model-kit/bin/clawd-model-kit perps handoff --market SOL --mode observer
ai-training/model-kit/bin/clawd-model-kit perps agent \
  --query "Assess the risk of long SOL-PERP 500 USDC at 2x"
```

Perps commands stay observer/paper-first. If `LIVE_TRADING=true` is present in
the environment, the model-kit wrapper refuses perps agent/handoff execution
unless `--allow-live-env --yes` is explicitly supplied.

## Unsloth And Ollama

The default training path is `scripts/train_lora.py` with Transformers, PEFT,
TRL, and Hugging Face Jobs. Unsloth is optional for local accelerated LoRA,
QLoRA, Studio workflows, and GGUF export.

```bash
curl -fsSL https://unsloth.ai/install.sh | sh
unsloth studio -H 0.0.0.0 -p 8888
```

Ollama preview/fine-tuned publishing uses the existing Ollama scripts:

```bash
ai-training/model-kit/bin/clawd-model-kit ollama --mode preview --target core-ai --yes
```

## Security Contract

Never put these in files that can be committed or uploaded:

- `HF_TOKEN`
- `WANDB_API_KEY`
- `NVIDIA_API_KEY`
- private RPC keys
- OAuth client secrets or Google ADC JSON
- Solana keypairs, seed phrases, private keys, wallet passwords
- browser cookies or session dumps

Before public release:

```bash
ai-training/model-kit/bin/clawd-model-kit verify
python3 ai-training/scripts/verify_core_ai_release.py
python3 ai-training/scripts/verify_trading_factory_release.py --local-only --strict
```

For the full trading-factory release gate:

```bash
ai-training/model-kit/bin/clawd-model-kit verify --full-release
```

Model outputs must never be accepted as transactions. Execution code must parse,
validate, simulate, and risk-check every action first. Live trading remains
outside this model-kit automation.

## References

- Hugging Face CLI: https://huggingface.co/docs/huggingface_hub/guides/cli
- Hugging Face Jobs: https://huggingface.co/docs/huggingface_hub/guides/jobs
- Hugging Face uploads: https://huggingface.co/docs/huggingface_hub/guides/upload
- Unsloth docs: https://unsloth.ai/docs
- NVIDIA Transaction Foundation Model blueprint: https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model
- NVIDIA Model Distillation blueprint: https://build.nvidia.com/nvidia/ai-model-distillation-for-financial-data
- NVIDIA Enterprise RAG blueprint: https://build.nvidia.com/nvidia/build-an-enterprise-rag-pipeline
- NVIDIA Quantitative Signal Discovery blueprint: https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent
- NVIDIA Quantitative Portfolio Optimization blueprint: https://build.nvidia.com/nvidia/quantitative-portfolio-optimization
- NVIDIA AI-Q blueprint: https://build.nvidia.com/nvidia/aiq
