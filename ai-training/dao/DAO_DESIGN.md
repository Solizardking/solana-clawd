# Clawd DAO — Architecture and Safety Design

*Last updated: June 18, 2026*

## Core constraint (non-negotiable)

> **User capital never enters a genesis-owned vault.**

All depositor assets live in **Percolator insurance pools**. Genesis programs do attribution and accounting only. The one path to unconstrained authority is a key rotation that runs through a 1-week Squads timelock — giving every depositor a pre-announced exit window before any change takes effect.

---

## Program architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAWD DAO                                │
│                                                             │
│  Genesis programs (attribution/accounting only):            │
│  ├── ModelRegistry     (solana_ai_inference)                │
│  ├── DataSubmission    (training data attribution)           │
│  ├── ValidatorAccount  (validator stake tracking)            │
│  └── SAS Attestations  (compressed credential anchors)      │
│                                                             │
│  User capital (never touched by genesis):                   │
│  └── Percolator Insurance Pools                             │
│      ├── isolated collateral vaults (no admin key)          │
│      ├── market-determined rates                            │
│      └── Light Protocol compressed state (rent-free)        │
│                                                             │
│  Governance timeline:                                       │
│  Proposal → [pass] → 1-week Squads timelock → execution     │
│  (depositors can exit during the 7-day window)              │
│                                                             │
│  Emergency: 3-of-5 multisig pause (trading only, not funds) │
└─────────────────────────────────────────────────────────────┘
```

---

## The Percolator connection

[percolator-meta](https://github.com/aeyakovenko/percolator-meta) describes a recursive research pattern — inputs flow through a series of operators, each transforming and enqueuing new work. We use this as the governance research infrastructure:

```
Percolator Research Loop:
  Seed (docs, papers, ecosystem updates)
    → fetch → extract claims + child URLs
    → Clawd summarize → eval gate
    → if quality ≥ threshold: append to training dataset
    → increment contributor attribution on ModelRegistry PDA
    → recurse with child URLs (depth-limited)

Attribution accounting (onchain):
  submit_data(data_hash, DataType::DeFiData, size, metadata)
  → DataSubmission PDA created (submitter gets credit)
  → Validators rate it (rate_data instruction)
  → term_reward_rate * quality_score → $CLAWD attribution
```

---

## Governance flows

### Model training budget (standard proposal)
```
1. $CLAWD holder submits proposal: "Allocate 50K compute credits to Hermes-3 8B training"
2. Voting period: 72 hours
3. Quorum: 10% of circulating $CLAWD
4. If passed: 1-week Squads timelock starts
5. During 7-day window: any depositor can exit Percolator vaults with no penalty
6. After timelock: treasury action executes (HF Jobs credit transfer)
```

### Key rotation (highest risk — requires timelock)
```
1. Proposal: "Rotate program upgrade authority from genesis multisig to new key"
2. Voting period: 7 days
3. Super-quorum: 25% of circulating $CLAWD
4. 1-week Squads timelock (non-reducible)
5. SAS attestation created for the rotation event
6. Execution: upgrade authority transferred
```

### Emergency pause (no timelock — trading only)
```
3-of-5 multisig can pause:
  - New position opens on Clawd perps agent
  - New dataset submissions
  - Inference endpoint routing

Cannot pause:
  - Withdrawals from Percolator vaults
  - Existing position management
  - $CLAWD token transfers
```

---

## Validator system (from solana_ai_inference IDL)

The `become_validator` instruction creates a `ValidatorAccount` PDA:
- Requires stake_amount (minimum to prevent spam)
- Validators rate submitted training data: `rate_data(quality_score: u8, term_reward: u64)`
- Invalid quality scores (not 0–100) rejected onchain (error code 6000)
- Unauthorized validators rejected (error code 6001)
- Insufficient stake rejected (error code 6002)

```bash
# Register as a Clawd validator (devnet)
solana-clawd-register-validator \
  --stake-amount 1000000000 \
  --keypair ~/.config/solana/id.json \
  --cluster devnet
```

---

## Onchain attestation flow

Every major artifact gets a SAS attestation anchored to the chain:

| Event | Attestation type | Cost |
|---|---|---|
| Dataset snapshot | compressed | ~0.00003 SOL |
| Adapter upload | compressed | ~0.00003 SOL |
| Eval result | standard | ~0.002 SOL |
| Governance action | standard | ~0.002 SOL |
| Key rotation | standard + nullifier | ~0.003 SOL |

Nullifiers (Light Protocol, `NFLx5WGPrTHHvdRNsidcrNcLxRruMC92E4yv7zhZBoT`) prevent replay attacks on governance attestations — each proposal can only be attested once.

---

## Registration: one-shot curl

```bash
# Register a model to onchain.x402.wtf (no Solana tx required)
./dao/register_model.sh \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --model-hash "sha256:$(sha256sum ai-training/scripts/train_lora.py | awk '{print $1}')" \
  --eval-accuracy 0.60 \
  --dataset-size 36109

# Or with full onchain registration (requires funded wallet + Anchor):
./dao/register_model.sh --onchain \
  --hf-model "solanaclawd/solana-clawd-1.5b" \
  --keypair ~/.config/solana/id.json
```

---

## Key addresses

| Address | Purpose |
|---|---|
| `3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj` | solana_ai_inference program (devnet) |
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

The DAO controls: model training priorities, dataset curation, compute budget allocation, registry parameters, and validator slashing thresholds. Nothing that can take a user's principal.
