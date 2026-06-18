# Clawd DAO — Architecture and Safety Design

*Last updated: June 18, 2026*

## Core constraint (non-negotiable)

> **User capital never enters a genesis-owned vault.**

All depositor assets live in **Percolator insurance pools**. Genesis programs do attribution and accounting only. The one path to unconstrained authority is a key rotation that runs through a 1-week Squads timelock — giving every depositor a pre-announced exit window before any change takes effect.

---

## Program architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        CLAWD DAO                                │
│                                                                 │
│  Genesis programs (attribution/accounting only):                │
│  ├── ModelRegistry      (solana_ai_inference, devnet)           │
│  │     initialize_model → ModelRegistry PDA per authority       │
│  ├── DataSubmission     (training data attribution)             │
│  │     submit_data + rate_data → $CLAWD credit per example      │
│  ├── ValidatorAccount   (validator stake + reputation)          │
│  │     become_validator → stake requirement, slashable          │
│  └── SAS Attestations   (compressed Light Protocol credentials) │
│        dataset / eval / adapter / governance events             │
│                                                                 │
│  User capital (genesis NEVER touches this):                     │
│  └── Percolator Insurance Pools                                 │
│        isolated collateral vaults — no admin upgrade authority  │
│        market-determined rates                                  │
│        Light Protocol compressed state (rent-free storage)      │
│                                                                 │
│  Governance path (only way to change authority):                │
│  Proposal → vote (72h) → pass → 1-week Squads timelock          │
│  ↳ depositors can exit during the 7-day window with no penalty  │
│  ↳ after timelock: treasury action / upgrade / key rotation     │
│                                                                 │
│  Emergency (3-of-5 multisig, no timelock):                      │
│  ├── pause new position opens (perps agent)                     │
│  ├── pause new dataset submissions                              │
│  └── pause inference endpoint routing                           │
│  Cannot touch: withdrawals, existing positions, $CLAWD transfers│
└─────────────────────────────────────────────────────────────────┘
```

---

## Onchain program: solana_ai_inference

Program ID: `3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj` (devnet + localnet)

### Instructions

| Instruction | PDA seeds | Purpose |
| --- | --- | --- |
| `initialize_model(model_hash, model_type, api_endpoint, term_reward_rate)` | `["model", authority]` | Register a model, create `ModelRegistry` account |
| `submit_data(data_hash, data_type, data_size, metadata)` | `["data", submitter]` | Submit training data for attribution credit |
| `rate_data(quality_score, term_reward)` | existing `DataSubmission` | Validator scores a submission (0–100) |
| `become_validator(stake_amount)` | `["validator", validator]` | Register as a validator with stake |

### Accounts

**ModelRegistry** — created by `initialize_model`:

```text
authority         Pubkey     wallet that owns this registry entry
model_cid         String     HF commit hash or sha256 of the adapter
model_type        Enum       TextGeneration | SentimentAnalysis | ...
api_endpoint      String     inference URL (ClawdRouter or HF)
term_reward_rate  u64        $CLAWD lamports per validated inference
accuracy          f64        updated by validator consensus
training_complete bool       set true when HF Jobs run finishes
validation_count  u64        total validator ratings received
created_at        i64        Unix timestamp
```

**DataSubmission** — created by `submit_data`:

```text
submitter     Pubkey    contributor wallet
data_hash     String    sha256 of the submitted JSONL batch
data_type     Enum      Text | DeFiData | SolanaTransactions | ...
data_size     u64       byte count
metadata      String    JSON: source URL, model_id, cycle number
quality_score u8        set by validator (0–100)
term_reward   u64       $CLAWD attribution amount
validated     bool      true once a validator has rated
submitted_at  i64
validated_at  Option<i64>
```

**Error codes:**

| Code | Name | Condition |
| --- | --- | --- |
| 6000 | `InvalidQualityScore` | quality_score not in 0–100 |
| 6001 | `UnauthorizedValidator` | caller has no `ValidatorAccount` |
| 6002 | `InsufficientStake` | stake below minimum |

---

## The Percolator connection

[percolator-meta](https://github.com/aeyakovenko/percolator-meta) describes a recursive research pattern: inputs flow through a series of operators, each transforming and enqueuing new work. Clawd uses this as the continuous training data infrastructure:

```text
Percolator Research Loop (scripts/auto_research.py):

  Seed URLs (docs, papers, ecosystem updates)
    ↓ fetch → extract claims + child URLs (SQLite dedup)
    ↓ Clawd-1.5B summarize → {"question": ..., "answer": ...}
    ↓ is_solana_relevant() gate (≥2 keyword matches)
    ↓ append to data/autoResearch.jsonl
    ↓ submit_data(sha256, DataType::DeFiData, size, metadata) → onchain attribution
    ↓ validator rates batch → quality_score → $CLAWD reward
    ↓ recurse into child_urls (depth ≤ max_depth)
    ↓ sleep → next cycle
```

The SQLite manifest at `data/research_manifest.db` prevents re-fetching any URL across cycles. Each appended batch is submitted as a `DataSubmission` PDA so contributors get onchain credit.

---

## Governance flows

### Standard proposal: model training budget

```text
1.  $CLAWD holder submits proposal (e.g. "Allocate 50K compute credits to 8B training")
2.  Voting period: 72 hours, quorum: 10% circulating $CLAWD
3.  If passed → 1-week Squads timelock begins
4.  During 7-day window: any depositor can exit Percolator vaults, no penalty
5.  After timelock: treasury action executes (HF Jobs credit transfer, etc.)
6.  SAS standard attestation created for the completed action
```

### Key rotation (highest risk)

```text
1.  Proposal: "Rotate program upgrade authority to new multisig"
2.  Voting period: 7 days, super-quorum: 25% circulating $CLAWD
3.  1-week Squads timelock (this duration is non-reducible by governance)
4.  SAS attestation + nullifier created at timelock start
5.  Execution: upgrade authority transferred
6.  Second SAS attestation records completion
```

### Emergency pause (no timelock)

```text
3-of-5 multisig CAN pause (takes effect immediately):
  ✓ New position opens on Clawd perps agent
  ✓ New dataset submissions (submit_data)
  ✓ Inference endpoint routing (ClawdRouter)

3-of-5 multisig CANNOT:
  ✗ Touch Percolator vault balances
  ✗ Close existing positions
  ✗ Block $CLAWD token transfers
  ✗ Block withdrawals from any vault
```

---

## Trigger.dev: real-time market scanner

The `src/trigger/solana-market-scanner.ts` Trigger.dev task runs every 10 minutes:

1. Opens Birdeye WebSocket, subscribes to SOL/JUP/BONK 1-minute OHLCV
2. Collects price data for 10 seconds
3. Formats a market report and POSTs to the `quality-analysis` backend
4. The backend passes the report to the on-chain AI protocol for validator rating

This creates a continuous stream of live market data flowing through `submit_data` → validator `rate_data` → $CLAWD attribution — the same pipeline as AutoResearch, but for real-time trading signals rather than documentation.

```bash
# Run the scanner locally (requires BIRDEYE_API_KEY)
cd /path/to/OnChain-Ai
pnpm trigger:dev

# Or deploy to Trigger.dev cloud
pnpm trigger:deploy
```

---

## Onchain registration: one-shot curl

### Off-chain index only (no Solana wallet required)

```bash
./dao/register_model.sh \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --eval-accuracy 0.60 \
  --dataset-size 36109

# With auto-computed hash:
./dao/register_model.sh \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --model-hash "sha256:$(sha256sum ../scripts/train_lora.py | awk '{print $1}')"
```

This POSTs to `https://onchain.x402.wtf/api/register` with a CAAP/1.0 JSON payload. The registry at `onchain.x402.wtf/.well-known/clawd-registry.json` is updated immediately (no Solana tx cost).

### Full onchain registration (creates ModelRegistry PDA)

```bash
./dao/register_model.sh --onchain \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --keypair ~/.config/solana/id.json \
  --cluster devnet

# Verify the PDA was created:
solana account <MODEL_REGISTRY_PDA> --url devnet --output json
```

### Manual curl (minimum viable)

```bash
curl -X POST https://onchain.x402.wtf/api/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HF_TOKEN" \
  -d '{
    "model_hash": "sha256:abc123",
    "model_type": "TextGeneration",
    "api_endpoint": "https://clawd-box-router.fly.dev/v1",
    "hf_model_id": "solanaclawd/solana-clawd-1.5b",
    "dataset_size": 36109,
    "eval_accuracy": 0.60,
    "wandb_run": "ktvtubjs",
    "cluster": "devnet",
    "protocol": "CAAP/1.0",
    "clawd_token": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
  }'
```

---

## ZK attestation flow

Every major artifact gets a SAS attestation. Compressed attestations use Light Protocol V2 (`~0.00003 SOL`); standard attestations use the base SAS program (`~0.002 SOL`).

| Event | Type | Nullifier | Cost |
| --- | --- | --- | --- |
| Dataset snapshot | compressed | no | ~0.00003 SOL |
| Adapter upload | compressed | no | ~0.00003 SOL |
| Eval result (W&B Weave) | standard | no | ~0.002 SOL |
| Governance proposal passed | standard | yes | ~0.003 SOL |
| Key rotation | standard | yes | ~0.003 SOL |

Nullifiers (`NFLx5WGPrTHHvdRNsidcrNcLxRruMC92E4yv7zhZBoT`) prevent each proposal from being attested more than once — replay protection at the protocol level.

```bash
# Create compressed dataset attestation
pnpm tsx dao/attestation/create_attestation.ts \
  --type dataset \
  --model-id "solanaclawd/solana-clawd-1.5b" \
  --size 36109 \
  --hash "sha256:$(sha256sum ../data/solana_clawd_merged.jsonl | awk '{print $1}')" \
  --compressed \
  --keypair ~/.config/solana/id.json

# Create eval attestation (dry run first)
pnpm tsx dao/attestation/create_attestation.ts \
  --type eval \
  --model-id "solanaclawd/solana-clawd-1.5b" \
  --accuracy 0.60 \
  --wandb-run "ktvtubjs" \
  --dry-run

# Verify any attestation (no trust required)
solana account <ATTESTATION_PDA> --url devnet --output json
```

Attestation PDAs are written to `dao/attestation/attestations.jsonl` and included in the CAAP/1.0 registry response.

---

## Key addresses

| Address | Purpose |
| --- | --- |
| `3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj` | `solana_ai_inference` program (devnet) |
| `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` | $CLAWD token mint |
| `NFLx5WGPrTHHvdRNsidcrNcLxRruMC92E4yv7zhZBoT` | Light Protocol nullifier program |
| `ATSPssFHEjvJgAXKkfAWNRqTQW9Wm6JDDVW7Ec1G3zM` | SAS program ID |

---

## What the DAO does NOT control

- User collateral in Percolator vaults
- Existing open positions on Phoenix perps
- $CLAWD token transfers
- Withdrawals at any time
- The base Solana protocol

The DAO controls: model training priorities, dataset curation, compute budget, registry parameters, and validator slashing thresholds. Nothing that can take a user's principal.

---

## Files in this directory

| File | Purpose |
| --- | --- |
| `DAO_DESIGN.md` | This document |
| `register_model.sh` | One-shot curl/onchain model registration |
| `register_model.ts` | TypeScript `initialize_model` Anchor instruction |
| `attestation/create_attestation.ts` | SAS compressed attestation creator |
| `attestation/attestations.jsonl` | Local index of created attestation PDAs |
