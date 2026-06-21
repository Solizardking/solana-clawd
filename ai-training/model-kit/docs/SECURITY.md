# Model Kit Security Contract

The model kit is public-release oriented. It assumes every dataset row, manifest,
card, frontend bundle, and Hub upload may become public.

## Defaults

- Audit and local ingest are safe by default.
- Uploads require `--yes`.
- Remote Hugging Face Jobs require `--yes`.
- Ollama pushes require `--yes`.
- Live registry POSTs require `--yes`.
- Onchain transactions require `--onchain --live --yes`.
- Live trading is out of scope for model-kit automation.

## Never Commit

- `HF_TOKEN`
- `WANDB_API_KEY`
- `NVIDIA_API_KEY`
- OpenAI, xAI, Gemini, Helius, Birdeye, or private RPC keys
- Solana keypairs, seed phrases, private keys, wallet passwords
- OAuth client secrets or Google ADC JSON
- Browser profiles, cookies, session dumps
- Private endpoint bearer tokens

## Before Publishing

```bash
ai-training/model-kit/bin/clawd-model-kit constitution --strict
ai-training/model-kit/bin/clawd-model-kit verify
python3 ai-training/scripts/verify_core_ai_release.py
python3 ai-training/scripts/verify_trading_factory_release.py --local-only --strict
```

The Constitution gate checks `CONSTITUTION.md`, `three-laws.md`, and `CLAWD.md`.
Set `CLAWD_THREE_LAWS_SHA256=sha256:<expected>` in CI when you want byte-for-byte
enforcement against a known on-chain law hash.

If a secret-like pattern is found:

1. Remove it from files and git history as needed.
2. Rotate the credential.
3. Rebuild the dataset.
4. Re-run the verifier.

## Dataset Rules

- Store source basename, type, hash, and local record IDs.
- Do not store local absolute paths in SFT rows.
- Do not store raw image bytes in JSONL rows.
- Keep user-provided HF tokens request-scoped when using OnChain-AI.
- Preserve source category and generation process in dataset/model cards.
- Preserve the Constitution hash commitment in CAAP/1.0 registration metadata.

## Model Rules

- Model outputs are never accepted as transactions.
- Execution clients must parse, validate, simulate, and risk-check actions.
- Paper trading examples must remain clearly labeled as paper/simulation.
- Live trading requires a separate execution path and explicit operator action.
