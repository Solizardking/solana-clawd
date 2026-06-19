# OnChain-AI Handoff

Implementation target: `onchain.x402.wtf`

Local app roots:

- Frontend: `/Users/8bit/Downloads/OnChain-Ai-main/frontend`
- Backend: `/Users/8bit/Downloads/OnChain-Ai-main/backend`
- Source model kit: `/Users/8bit/Downloads/solana-clawd/ai-training`

This handoff is for wiring the Solana Clawd AI training/model kit into the
existing OnChain-AI product. Do not copy API keys, OAuth client secrets,
wallet keypairs, ADC JSON, Hugging Face tokens, W&B keys, NVIDIA keys, or any
other private credentials into git, markdown, frontend code, Hub cards, or
browser-visible bundles.

## Goal

Make `onchain.x402.wtf` the public UI and API surface for the Solana AI Model
Kit:

1. Show the official Clawd datasets and model adapters.
2. Let users upload PDF, JSON, JSONL, CSV, text, markdown, YAML, and notebooks
   into wallet-scoped SFT datasets.
3. Publish user datasets to Hugging Face when a write token is supplied or when
   a server-side token is configured.
4. Register models into the CAAP/1.0 registry.
5. Display SAS/registry attestations and Hugging Face training job status.
6. Keep live trading and wallet-affecting flows gated behind explicit user
   wallet action and never hidden inside model-kit automation.

## Current Assets

Official Hub datasets:

| Artifact | Type | Status |
| --- | --- | --- |
| `solanaclawd/solana-clawd-core-ai-instruct` | dataset | 35,173 SFT examples from `core-ai` + `ai-training` |
| `solanaclawd/solana-clawd-realtime-research-instruct` | dataset | 29,058 examples from PDFs, notebooks, parquet data, and ZK context |
| `solanaclawd/solana-clawd-nvidia-trading-factory-instruct` | dataset | 142 examples, 127/7/8 train/eval/test splits |
| `solanaclawd/solana-nvidia-trading-factory-8b-lora` | model | completed adapter; HF job `ordlibrary/6a35a2ce953ed90bfb945009` |
| `solanaclawd/solana-clawd-core-ai-1.5b-lora` | model | recovery job `ordlibrary/6a35a6833093dba73ce2a86b` running on `a100-large`; last manual checkpoint reached step `365/3957` |

Local model-kit files to reference:

- `ai-training/scripts/solana_ai_model_kit.sh`
- `ai-training/model-kit/README.md`
- `ai-training/scripts/train_lora.py`
- `ai-training/scripts/prepare_dataset.py`
- `ai-training/scripts/realtime_dataset_ingest.py`
- `ai-training/dao/register_model.sh`
- `ai-training/onchainai.md`
- `ai-training/dataset_card.md`
- `ai-training/model_card.md`
- `README.md`, section "Solana AI Model Kit"

## Backend State

Existing backend entrypoint:

- `/Users/8bit/Downloads/OnChain-Ai-main/backend/main.py`

Already registered blueprints:

- `registry_bp` at `/api`
- `training_bp` at `/api`
- `docai_bp` at `/api`
- `model_registry_bp` at `/api`
- `ai_bp` at `/api/ai`
- `data_bp` at `/api/data`

Important existing endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | backend health |
| `GET /api/protocol` | protocol capabilities and required env names |
| `GET /.well-known/clawd-registry.json` | public CAAP/1.0 registry manifest |
| `POST /api/register` | upsert a CAAP registry model entry |
| `GET /api/models?hf_id=...` | list or filter registered models |
| `GET /api/attestations?model_id=...` | list attestations |
| `POST /api/attestations` | create an attestation record |
| `GET /api/training/status` | supported upload types and HF server-token state |
| `GET /api/training/datasets?wallet_address=...` | wallet-scoped dataset history |
| `POST /api/training/datasets` | upload files, build SFT JSONL, optionally push to HF |
| `GET /api/docai/status` | Document AI/Gemini/xAI configuration status |
| `POST /api/docai/process` | process one document |
| `POST /api/docai/pipeline` | document pipeline endpoint |

Registry constants already used by the backend:

- CAAP protocol: `CAAP/1.0`
- Program ID: `3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj`
- SAS program: `ATSPssFHEjvJgAXKkfAWNRqTQW9Wm6JDDVW7Ec1G3zM`
- CLAWD mint: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`
- Default inference endpoint: `https://clawd-box-router.fly.dev/v1`

## Frontend State

Existing frontend app:

- `/Users/8bit/Downloads/OnChain-Ai-main/frontend/src/App.jsx`
- API base: `/Users/8bit/Downloads/OnChain-Ai-main/frontend/src/lib/api.js`

Existing routes/components:

| Route | Component | Notes |
| --- | --- | --- |
| `/models` | `AIModels.jsx` | public model/dataset resource browser and registry form |
| `/register` | `ModelRegister.jsx` | model-registration intent UI |
| `/datasets` | `UserDatasets.jsx` | wallet-gated dataset builder and HF upload |
| `/` | `DocumentUploadStation.jsx` | wallet-gated document upload surface |
| `/dashboard` | `Dashboard.jsx` | public dashboard |
| `/analytics` | `Analytics.jsx` | public analytics |
| `/research` | `DeepSolana.jsx` | research UI |

Current UI already uses `framer-motion`, `lucide-react`, and local `ui/*`
components. Continue using those patterns. Avoid adding a separate marketing
page when the feature should be an operational model-kit screen.

## Required Backend Work

1. Add a model-kit status endpoint.

   Suggested route: `GET /api/model-kit/status`

   Response should include:

   ```json
   {
     "ok": true,
     "registry_url": "https://onchain.x402.wtf/.well-known/clawd-registry.json",
     "datasets": [
       {
         "repo_id": "solanaclawd/solana-clawd-core-ai-instruct",
         "kind": "dataset",
         "rows": 35173,
         "status": "published"
       }
     ],
     "models": [
       {
         "repo_id": "solanaclawd/solana-nvidia-trading-factory-8b-lora",
         "kind": "model",
         "base_model": "NousResearch/Hermes-3-Llama-3.1-8B",
         "status": "complete"
       }
     ],
     "jobs": [
       {
         "id": "ordlibrary/6a35a6833093dba73ce2a86b",
         "name": "Core AI 1.5B LoRA recovery",
         "status": "running"
       }
     ]
   }
   ```

   The endpoint can start with static public metadata and later enrich from the
   Hugging Face API. Do not require `HF_TOKEN` for public repo metadata. If a
   token is used for private job lookup, read it only from backend env and never
   return it.

2. Seed/ensure registry entries for official models.

   Use existing `POST /api/register` semantics. Minimum payloads:

   ```json
   {
     "hf_model_id": "solanaclawd/solana-nvidia-trading-factory-8b-lora",
     "model_type": "TextGeneration",
     "api_endpoint": "https://clawd-box-router.fly.dev/v1",
     "dataset_size": 142,
     "eval_accuracy": 0.8547,
     "cluster": "devnet",
     "protocol": "CAAP/1.0",
     "clawd_token": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
   }
   ```

   For `solanaclawd/solana-clawd-core-ai-1.5b-lora`, wait until the HF adapter
   files exist before marking it complete. Until then, show it as a running
   recovery job.

3. Add attestation records for datasets and adapters.

   Use `POST /api/attestations` with:

   - `type: "dataset"` for dataset hashes/manifests.
   - `type: "adapter"` for LoRA adapter checksums.
   - `type: "eval"` for final evaluation metrics.
   - `type: "training_run"` for HF job IDs.

   The current backend accepts `model_id`, `type`, `pda`, `data_hash`,
   `accuracy`, `wandb_run`, `cluster`, and stores extra fields in JSON.

4. Preserve user dataset upload behavior.

   `POST /api/training/datasets` already:

   - accepts `files`, `wallet_address`, `dataset_name`, `private`,
     `push_to_hf`, `hf_namespace`, `hf_repo_id`, and optional request-scoped
     `hf_token`.
   - supports PDF, JSON, JSONL, NDJSON, CSV, text, markdown, YAML, and ipynb.
   - scans for likely secrets.
   - builds SFT `messages`.
   - can push `data/train.jsonl`, `manifest.json`, and `README.md` to HF.

   Keep HF user tokens request-scoped. Do not persist them in the database.

5. Add a small backend smoke script or docs command.

   Suggested checks:

   ```bash
   cd /Users/8bit/Downloads/OnChain-Ai-main/backend
   python3 -m py_compile main.py src/routes/registry.py src/routes/training_datasets.py src/routes/document_ai.py
   PORT=5001 python3 main.py
   curl -sS http://localhost:5001/api/health
   curl -sS http://localhost:5001/api/training/status
   curl -sS http://localhost:5001/.well-known/clawd-registry.json
   ```

## Required Frontend Work

1. Add a first-class Model Kit screen.

   Suggested route: `/model-kit`

   Suggested component:

   - `frontend/src/components/SolanaModelKit.jsx`

   The screen should be operational and compact:

   - Official datasets/models table.
   - Current Core AI training/recovery job panel.
   - Trading factory model panel with final metrics.
   - Registry status from `/api/models`.
   - Attestation status from `/api/attestations`.
   - A "Build Dataset" action that links to `/datasets`.
   - A "Register Model" action that links to `/register`.
   - A curl/CLI block for the one-shot local kit:

     ```bash
     curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/ai-training/scripts/solana_ai_model_kit.sh | bash
     ```

     Only show public commands. Do not show any real tokens.

2. Update `AIModels.jsx` resource constants.

   Add the newer official artifacts:

   - `solanaclawd/solana-clawd-core-ai-instruct`
   - `solanaclawd/solana-clawd-realtime-research-instruct`
   - `solanaclawd/solana-clawd-nvidia-trading-factory-instruct`
   - `solanaclawd/solana-nvidia-trading-factory-8b-lora`
   - `solanaclawd/solana-clawd-core-ai-1.5b-lora`

   Existing constants still mention `solana-clawd-1.5b-lora`; keep old entries
   only if they are real and useful, otherwise prefer the current repos above.

3. Wire navigation.

   Update `Header.jsx` to include:

   - Models
   - Model Kit
   - Datasets
   - Register
   - Dashboard

   Keep dataset creation wallet-gated. The model-kit overview can be public.

4. Improve dataset upload feedback in `UserDatasets.jsx`.

   Keep the existing `POST /api/training/datasets` flow, but add:

   - Manifest hash display.
   - Example preview count.
   - HF commit link when upload succeeds.
   - Quality score/tier from the `quality` response.
   - Clear copy that tokens are one-request only and not stored.

5. Keep frontend secrets out.

   Frontend env should only use public values like:

   ```bash
   VITE_API_BASE_URL=https://onchain-ai-backend.onrender.com
   ```

   Never expose `HF_TOKEN`, `WANDB_API_KEY`, `NVIDIA_API_KEY`,
   `GOOGLE_API_KEY`, service-account JSON, wallet private keys, or OAuth client
   secrets in Vite env vars.

## Registration Payloads

Use these from backend scripts, admin UI actions, or one-time seed scripts.

Trading factory model:

```json
{
  "hf_model_id": "solanaclawd/solana-nvidia-trading-factory-8b-lora",
  "model_hash": "sha256:unknown",
  "model_type": "TextGeneration",
  "api_endpoint": "https://clawd-box-router.fly.dev/v1",
  "dataset_size": 142,
  "eval_accuracy": 0.8547,
  "wandb_run": "",
  "cluster": "devnet",
  "protocol": "CAAP/1.0",
  "clawd_token": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
}
```

Core AI model, after adapter files are verified:

```json
{
  "hf_model_id": "solanaclawd/solana-clawd-core-ai-1.5b-lora",
  "model_hash": "sha256:unknown",
  "model_type": "TextGeneration",
  "api_endpoint": "https://clawd-box-router.fly.dev/v1",
  "dataset_size": 35173,
  "eval_accuracy": 0,
  "wandb_run": "",
  "cluster": "devnet",
  "protocol": "CAAP/1.0",
  "clawd_token": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
}
```

Do not use `PricePrediction` for these registrations. The existing backend
reserves that type for oracle-verified models and returns `403`.

## Local Dev Commands

Backend:

```bash
cd /Users/8bit/Downloads/OnChain-Ai-main/backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
PORT=5001 python3 main.py
```

Frontend:

```bash
cd /Users/8bit/Downloads/OnChain-Ai-main/frontend
npm install
VITE_API_BASE_URL=http://localhost:5001 npm run dev
```

Production-style frontend build:

```bash
cd /Users/8bit/Downloads/OnChain-Ai-main/frontend
VITE_API_BASE_URL=https://onchain-ai-backend.onrender.com npm run build
```

## Acceptance Checklist

Backend:

- `GET /api/health` returns `status: ok`.
- `GET /api/model-kit/status` returns all official artifacts and no secrets.
- `GET /.well-known/clawd-registry.json` includes registered Clawd models.
- `POST /api/register` upserts the trading-factory model.
- `GET /api/models?hf_id=solanaclawd/solana-nvidia-trading-factory-8b-lora`
  returns the seeded record.
- `POST /api/training/datasets` still builds datasets from PDF/JSON/notebook
  inputs and clears any user-supplied HF token after the request.

Frontend:

- `/model-kit` renders without wallet connection.
- `/datasets` remains wallet-gated.
- `/model-kit` links to the official HF datasets/models.
- `/model-kit` shows registry and attestation state from backend APIs.
- `/datasets` shows generated manifest hash, quality score, and HF commit link.
- `npm run build` passes.

Security:

- No private tokens, OAuth client secrets, ADC JSON, service-account JSON, or
  wallet keypairs are committed.
- No secrets are returned by `/api/model-kit/status`, `/api/protocol`, or any
  frontend bundle.
- User HF tokens are accepted only in multipart upload requests and are never
  stored.
- Live trading/perps actions remain separate from this model-kit flow.

## Final Verification Commands

Run these before handing the implementation back:

```bash
cd /Users/8bit/Downloads/OnChain-Ai-main/backend
python3 -m py_compile main.py src/routes/registry.py src/routes/training_datasets.py src/routes/document_ai.py

cd /Users/8bit/Downloads/OnChain-Ai-main/frontend
npm run build

cd /Users/8bit/Downloads/solana-clawd
rg "h[f]_[A-Za-z0-9]{30,}|wandb[_]v1[_][A-Za-z0-9_-]{20,}|nvapi[-][A-Za-z0-9_-]{20,}|client[_]secret[_][0-9].*\\.json|application[_]default[_]credentials\\.json|ya29\\.|BE[G]IN .*PRIVATE KEY" \
  README.md ai-training/onchain.md ai-training/README.md \
  /Users/8bit/Downloads/OnChain-Ai-main/frontend/src \
  /Users/8bit/Downloads/OnChain-Ai-main/backend/src
```

The final `rg` command should produce no matches.
