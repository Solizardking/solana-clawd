# Solana AI Model Kit

The Solana AI Model Kit turns this repository into a repeatable path for
building, training, evaluating, publishing, and registering Solana-native AI
models. It is designed for developers who want one of four things:

1. build public-safe Solana instruction datasets,
2. train LoRA adapters on Hugging Face Jobs,
3. publish datasets and adapters to the `solanaclawd` Hugging Face org,
4. register models in the CAAP/1.0 registry at `onchain.x402.wtf`, and
5. run paper-first trading-factory research for Solana spot and perps.

![Solana AI Model Kit](../../assets/solana-ai-model-kit.svg)

## Start Here

Pick the path that matches what you are doing today.

| Path | Use this when | First command |
| --- | --- | --- |
| Audit | You want to verify local files, manifests, and release readiness. | `bash ai-training/scripts/solana_ai_model_kit.sh --local` |
| Dataset builder | You want to convert PDFs, JSON, notebooks, parquet, or research notes into instruct data. | `python3 ai-training/scripts/realtime_dataset_ingest.py --help` |
| Trainer | You want to launch or recover a Hugging Face LoRA job. | `bash ai-training/scripts/solana_ai_model_kit.sh --local --train` |
| Trading factory | You want Solana strategy datasets and paper-mode portfolio optimization. | `bash ai-training/scripts/solana_ai_model_kit.sh --local --trading-factory` |
| Registry implementer | You want to wire this into `onchain.x402.wtf`. | Read `ai-training/onchain.md` |

The default mode is audit-only. The kit should never live trade or publish
secrets by default.

## Architecture

```text
source repos, PDFs, notebooks, parquet, market notes
  -> dataset builders and secret scanners
  -> Hugging Face datasets
  -> LoRA training jobs
  -> adapter repos
  -> CAAP registry payloads
  -> OpenAI-compatible or x402-aware serving endpoint
```

The trading-factory lane adds a paper/simulation loop:

```text
market data + research + strategy traces
  -> labeled strategy examples
  -> risk-gated instruction data
  -> student model candidates
  -> offline eval + paper backtest
  -> registry only after passing gates
```

## Repository Map

| Path | Purpose |
| --- | --- |
| `ai-training/scripts/` | Dataset builders, publish helpers, LoRA launchers, release verification. |
| `ai-training/configs/` | LoRA, dataset, and trading-factory configuration. |
| `ai-training/data/` | Local build outputs and generated manifests. Do not put secrets here. |
| `ai-training/trading_factory/` | Solana trading-factory README, source snapshots, strategy artifacts, and run notes. |
| `ai-training/perps/` | Perpetuals research and Phoenix/Vulcan-oriented material. |
| `ai-training/dao/` | Governance and registry notes. |
| `ai-training/model-kit/` | This developer-facing model kit. |
| `ai-training/onchain.md` | Handoff for the OnChain-AI backend/frontend implementation. |

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

Use `--live-register` only when the model endpoint and metadata are final. Model
registration is not permission to trade.

## Prerequisites

- macOS or Linux.
- Python 3.11+ for dataset and training utilities.
- `hf` CLI with `hf auth login` for uploads and Jobs.
- Optional `WANDB_API_KEY` for experiment tracking.
- Optional `NVIDIA_API_KEY` for Nemotron teacher labeling or NIM inference.
- Optional Node/npm when working on the OnChain-AI frontend.
- GPU access only when running local training or local inference. Hugging Face
  Jobs can handle remote LoRA runs.

Keep `HF_TOKEN`, `WANDB_API_KEY`, `NVIDIA_API_KEY`, Google credentials, wallet
files, and OAuth client secrets in your shell, OS keychain, or secret manager.
They do not belong in the repository or in generated dataset rows.

## Current Public Artifacts

| Artifact | Hub repo | Status |
| --- | --- | --- |
| Core AI dataset | [`solanaclawd/solana-clawd-core-ai-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-core-ai-instruct) | 35,173 examples |
| Realtime research dataset | [`solanaclawd/solana-clawd-realtime-research-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct) | 29,058 examples |
| NVIDIA trading factory dataset | [`solanaclawd/solana-clawd-nvidia-trading-factory-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct) | 142 examples, 127/7/8 splits |
| Core 1.5B LoRA | [`solanaclawd/solana-clawd-core-ai-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-core-ai-1.5b-lora) | HF recovery job `ordlibrary/6a35a6833093dba73ce2a86b` running; adapter files pending |
| Trading factory 8B LoRA | [`solanaclawd/solana-nvidia-trading-factory-8b-lora`](https://huggingface.co/solanaclawd/solana-nvidia-trading-factory-8b-lora) | Completed HF job `ordlibrary/6a35a2ce953ed90bfb945009`; train loss 1.1692, eval loss 0.8064 |

## Dataset Workflows

Build the Core AI dataset from local source material:

```bash
cd ai-training
python3 scripts/build_core_ai_dataset.py
python3 scripts/prepare_dataset.py \
  --input data/core_ai_instruct.jsonl \
  --output data/core_ai_prepared \
  --push-to-hub solanaclawd/solana-clawd-core-ai-instruct
```

Convert PDFs, JSON, notebooks, parquet, or markdown into realtime instruction
rows:

```bash
cd ai-training
python3 scripts/realtime_dataset_ingest.py \
  --input /path/to/file.pdf \
  --input /path/to/file.json \
  --input /path/to/notebook.ipynb \
  --output data/realtime_research_instruct.jsonl
```

Build the trading-factory dataset:

```bash
cd ai-training
python3 scripts/build_nvidia_trading_factory_dataset.py \
  --config configs/nvidia_trading_factory_config.yaml
```

Before publishing a dataset, run the release verifier and scan for secrets:

```bash
cd ai-training
python3 scripts/verify_core_ai_release.py
python3 scripts/verify_trading_factory_release.py
rg -n "hf_|wandb_|nvapi-|BEGIN (RSA|OPENSSH|PRIVATE)|client_secret" .
```

If `rg` finds a real secret, remove it from files and rotate the credential.

## Training Workflows

Train the current Core AI adapter:

```bash
cd ai-training
hf jobs run \
  --flavor a100-large \
  --timeout 4h \
  --secrets HF_TOKEN \
  --secrets WANDB_API_KEY \
  ghcr.io/astral-sh/uv:python3.11-bookworm \
  uv run /data/train_lora.py \
    --config none \
    --dataset-repo solanaclawd/solana-clawd-core-ai-instruct \
    --base-model Qwen/Qwen2.5-1.5B-Instruct \
    --output-dir /data/outputs/core-ai-clawd-1.5b-lora \
    --hub-model-id solanaclawd/solana-clawd-core-ai-1.5b-lora \
    --num-epochs 1 \
    --push \
    --no-eval \
    --no-checkpoints \
    --no-quant
```

Train the trading-factory adapter from the kit wrapper:

```bash
bash ai-training/scripts/solana_ai_model_kit.sh --local --train --trading-factory
```

Monitor jobs:

```bash
hf jobs inspect <namespace/job-id>
hf jobs logs <namespace/job-id>
bash scripts/watch_core_ai_hf_job.sh ordlibrary/6a35a6833093dba73ce2a86b 60
```

Release gate:

```bash
cd ai-training
python3 scripts/verify_full_goal_release.py --strict
python3 scripts/verify_core_ai_release.py
python3 scripts/verify_trading_factory_release.py --strict
```

The release is not complete until the model repo contains both
`adapter_config.json` and `adapter_model.safetensors`.

## Nemotron Trading Factory Model

Yes, this kit can support a trading-factory model that uses Nemotron v3, but the
right design is a teacher/student flywheel rather than trying to fine-tune a
frontier 550B model directly.

Recommended split as of June 19, 2026:

| Role | Recommended model class | Why |
| --- | --- | --- |
| Teacher and judge | Nemotron Ultra/Super served by NVIDIA API, NIM, or another hosted provider | Best for high-quality labeling, critique, long-context research synthesis, and risk analysis. |
| Practical student | `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16` | Small enough to test first, commercial-use-ready, long context, vLLM/SGLang serving path. |
| Larger student | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16` | MoE student candidate with 3.5B active / 30B total parameters when GPU budget allows. |
| Production serving | NIM, vLLM, SGLang, or TRT-LLM behind an OpenAI-compatible endpoint | Lets `onchain.x402.wtf` register one stable endpoint while the backend model can change. |

Do not start by training `nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4` in this
repository. Treat Ultra/Super as teacher or judge models. Train a Nano-class
student first, then evaluate whether larger student checkpoints are worth the
cost.

Nemotron-specific implementation notes:

- Validate the license for the exact checkpoint before release.
- Run a tokenizer/model compatibility smoke test before launching an expensive
  LoRA job. Some Nemotron v3 checkpoints use custom architecture code and serving
  options.
- Use reasoning-off or constrained JSON mode for deterministic strategy tool
  calls.
- Use reasoning-on for research synthesis, risk reviews, and trade-plan critique.
- For `NVIDIA-Nemotron-3-Nano-4B-BF16`, serving with vLLM requires the model's
  documented vLLM setup, custom reasoning parser, and `--trust-remote-code`.

Experimental student dry-run contract:

```bash
cd ai-training
python3 scripts/train_lora.py \
  --config none \
  --dataset-repo solanaclawd/solana-clawd-nvidia-trading-factory-instruct \
  --base-model nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16 \
  --output-dir outputs/nemotron3-nano-4b-trading-factory-lora \
  --num-epochs 1 \
  --no-push \
  --no-eval \
  --no-checkpoints
```

Only promote this to a real HF Job after the local smoke test confirms that
`transformers`, tokenizer loading, chat templates, PEFT target modules, and
remote-code requirements are compatible.

## NVIDIA/NemoClawd Factory Adapter

The Solana factory emits a single reviewable agent plan that new developers can
inspect before running any model or trading workflow:

```bash
cd ai-training
python3 scripts/build_solana_trading_factory_strategies.py
python3 nvidia/integration/nemo_clawd_agent.py --mode paper
python3 nvidia/blueprints/aiq/agent.py --strict
python3 nvidia/scripts/verify_nvidia.py --strict
```

Primary files:

| File | Purpose |
| --- | --- |
| `trading_factory/solana_factory/nvidia_agent.py` | Builds the Solana NemoClawd NVIDIA agent plan. |
| `nvidia/configs/nemo_clawd_factory.yaml` | Secret-free model, artifact, workflow, and safety config. |
| `nvidia/integration/nemo_clawd_agent.py` | CLI wrapper that writes `data/strategies/nvidia_clawd_agent_plan.json`. |
| `nvidia/blueprints/aiq/agent.py` | Local AIQ-style evaluator for safety, role coverage, and artifact completeness. |

The adapter maps NVIDIA's signal-discovery, portfolio-optimization,
model-distillation, transaction-foundation, enterprise-RAG, and AIQ blueprints
into the existing Vulcan/Rise/cuFOLIO factory. It also adapts NemoClawd-style
sandbox, MCP, and permission-gate concepts without vendoring the whole
NemoClawd repository.

## Distillation Flywheel

This is our Solana version of the NVIDIA financial-data distillation blueprint.
The NVIDIA blueprint uses a data flywheel, teacher labeling, stratified splitting,
LoRA fine-tuning with NeMo Customizer, evaluation with NeMo Evaluator, and
deployment with NIM. Our adaptation keeps the same control-loop idea but swaps
the financial-news labels for Solana trading and risk labels.

1. Ingest
   - Solana market data snapshots.
   - Phoenix/Vulcan paper-mode strategy traces.
   - cuFOLIO portfolio optimization outputs.
   - Realtime research PDFs, notebooks, parquet, and JSON.
   - OnChain-AI user prompts and model responses after redaction.

2. Label
   - Market regime: trend, chop, volatility expansion, liquidation cascade.
   - Event type: funding shift, liquidity gap, momentum break, mean reversion,
     oracle divergence, smart-contract risk, macro headline.
   - Action class: no-trade, observe, rebalance, hedge, reduce, paper-entry,
     paper-exit.
   - Risk grade: acceptable, caution, reject.
   - Tool quality: valid JSON, invalid JSON, unsafe live-action request,
     missing risk fields.

3. Split
   - Stratify by market, regime, risk grade, and action class.
   - Keep leakage barriers between source documents and eval rows.
   - Keep a separate adversarial risk set for liquidation, leverage, wallet, and
     prompt-injection cases.

4. Distill
   - Teacher: Nemotron Ultra/Super through NVIDIA-hosted inference or NIM.
   - Student: Qwen baseline, Nemotron Nano 4B, then Nemotron Nano 30B when
     infrastructure supports it.
   - Adapter method: LoRA first; full fine-tune only if LoRA fails the metrics.

5. Evaluate
   - Classification F1 for regime/event/risk labels.
   - JSON validity and schema pass rate.
   - Risk-refusal recall for unsafe live-trading prompts.
   - Paper-trading metrics: max drawdown, liquidation-risk hits, slippage
     assumptions, turnover, and fee drag.
   - Latency and cost per 1,000 decisions.

6. Promote
   - Push adapter files to Hugging Face.
   - Publish dataset and model cards with source composition.
   - Register with CAAP/1.0 at `onchain.x402.wtf`.
   - Keep live execution behind separate wallet, approval, and Vulcan risk gates.

## Solana Developer Standards

For new Solana code in this kit:

- Prefer `@solana/kit` for new backend clients, RPC calls, and transaction
  assembly.
- Prefer `@solana/client` and `@solana/react-hooks` in frontend wallet-aware UI.
- Keep `@solana/web3.js` isolated at compatibility boundaries when an external
  SDK requires it.
- Make cluster, RPC endpoint, fee payer, recent blockhash, token program, owners,
  signers, and writable accounts explicit.
- Distinguish Token Program from Token-2022 in every token flow.
- Add LiteSVM, Mollusk, or Surfpool tests for transaction-building code.

Model outputs should never be accepted as transactions. The execution layer must
parse, validate, simulate, and risk-check every action first.

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

- Trading-factory examples default to paper mode.
- Live trading requires an execution client, wallet controls, explicit operator
  approval, and pre-trade risk gates outside the dataset.
- Dataset rows must not include tokens, API keys, OAuth client secrets, wallet
  keys, private RPC credentials, or personal contact/payment identifiers.
- Model cards must disclose source categories, generation process, evaluation
  limits, and known failure modes.
- Public releases must pass the release verifier and a secret scan.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `hf jobs run` cannot push adapters | Confirm `hf auth whoami`, token write permission, and `--secrets HF_TOKEN`. |
| W&B is missing | Either pass `--secrets WANDB_API_KEY` or run without W&B reporting. |
| Model repo has only `README.md` | The training job has not pushed adapter artifacts yet. Check logs and rerun only if the job failed. |
| Dataset upload fails | Run the secret scan, check dataset card metadata, and verify HF org permissions. |
| Nemotron smoke test fails | Check `trust_remote_code`, model class support, PEFT target modules, and vLLM/NIM requirements before spending on a remote job. |
| Trading-factory eval looks good but risk tests fail | Do not promote. Improve labels, add adversarial examples, and rerun paper simulations. |

## FAQ

**Is this financial advice?** No. This kit builds research models, datasets, and
paper-mode strategy tools. It does not make trade recommendations for users.

**Can the model live trade?** Not by itself. Live execution belongs in a separate
Vulcan/Rise/Phoenix execution path with wallet isolation, explicit approval, and
pre-trade risk gates.

**Can we use Nemotron Ultra?** Yes, as a teacher, judge, or hosted inference model.
Do not use it as the first LoRA student in this repository.

**What should a new developer build first?** Start with a local dataset ingest,
run the release verifier, then register a dry-run CAAP payload. After that, add
one small eval before touching training or serving.
