# Solana AI Inference Protocol

> **Agent Knowledge Summary** — machine-queryable facts. Main knowledge base: [`knowledge/`](../../knowledge/README.md)

| Field | Value |
| ----- | ----- |
| **Program ID** | `Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT` |
| **Network** | Devnet / Mainnet |
| **Anchor** | `0.32.1` |
| **Solana CLI** | `1.18.20` |
| **TS client package** | `@clawd/solana-ai-inference-client` |
| **ORE program** | `ore2LrFdxHRrcqwR1KVW5jLEqfAXEJMxRNSGzwj73yz` |
| **ORE mint** | `oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp` (11 decimals) |
| **USDC mint** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals) |
| **SAS program** | `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG` |
| **$CLAWD token** | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |

**Key protocol constants:** `MIN_VALIDATOR_STAKE` = 1,000,000 · `PROTOCOL_FEE_BPS` = 250 (2.5%) · `SLASH_RATE_BPS` = 500 (5%) · `UNSTAKE_COOLDOWN` = 172,800s (48h) · `MAX_REPUTATION` = 10,000

**Instructions by module:** Admin (initialize_protocol, set_paused, propose_admin, accept_admin, update_protocol_fee) · Model Registry (initialize_model, update_model, finalize_training) · Data (submit_data, rate_data) · Inference (request_inference, submit_inference_result, fail_inference) · Staking (stake_tokens, request_unstake, execute_unstake) · Validators (register_validator, slash_validator) · DNA (record_dna_generation)

**PDA quick-ref:** config=`["config"]` · model=`["model",authority,nonce]` · validator=`["validator",validator]` · inference=`["inference",requester,nonce]` · stake=`["stake",staker]` · escrow=`["escrow",model_id]` · vault=`["vault",config_pda]`

**Lock tiers:** 1d=1.00× · 1w=1.50× · 1m=2.00× · 3m=3.00× · 6m=4.00× · 1yr=6.00×

**Build:** `anchor build --skip-lint` → `target/deploy/solana_ai_inference.so`

**RPC env vars:** `HELIUS_RPC_URL` / `HELIUS_WSS_URL` (falls back to public mainnet — see [`knowledge/anti-patterns.jsonl`](../../knowledge/anti-patterns.jsonl) anti-009)

**Knowledge cross-refs:**

| Entry | Topic |
| ----- | ----- |
| `codebase-facts.jsonl` cbfact-008 | SAS attestation addresses + schema types |
| `facts.jsonl` fact-pay-004 | USDC mint + Token-2022 + SAS program constants |
| `decisions.jsonl` decision-005 | Why MPL Core over Token Metadata v3 for agent NFTs |
| `decisions.jsonl` decision-001 | CAAP/1.0 auth — Ed25519 + JWT + SIWS |
| `anti-patterns.jsonl` anti-009 | Never hardcode RPC URLs — always use env vars |
| `gotchas.jsonl` gotcha-005 | FEE_PAYER_KEY must be full 64-byte base58 keypair |
| `patterns.jsonl` pattern-007 | CAAP client init pattern for new agents |

---

On-chain Anchor program + TypeScript client for decentralized AI model registration, inference requests, staking, and validator management on Solana.

**Program ID:** `Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT`  
**Network:** Devnet / Mainnet  
**Anchor:** `0.32.1` | **Solana:** `1.18.20`

---

## Architecture

```
programs/programs/
├── solana-ai-inference/      # Anchor on-chain program (Rust)
│   └── src/lib.rs            # All instructions, accounts, events, errors
├── client/                   # TypeScript SDK (@clawd/solana-ai-inference-client)
│   └── src/
│       ├── idl.ts            # Types, constants, account interfaces
│       ├── client.ts         # SolanaAiInferenceClient class
│       ├── ore.ts            # OreMinerClient + ORE v2 PDA helpers
│       ├── config.ts         # RPC endpoints, program IDs, API routes
│       └── index.ts          # Barrel export
├── Anchor.toml               # Toolchain config
└── Cargo.toml                # Workspace manifest
```

---

## On-chain Program

### Protocol Features

| Module | Instructions |
|--------|-------------|
| **Admin** | `initialize_protocol`, `set_paused`, `propose_admin`, `accept_admin`, `update_protocol_fee` |
| **Model Registry** | `initialize_model`, `update_model`, `finalize_training` |
| **Data Submissions** | `submit_data`, `rate_data` |
| **Inference** | `request_inference`, `submit_inference_result`, `fail_inference` |
| **Staking** | `stake_tokens`, `request_unstake`, `execute_unstake` |
| **Validators** | `register_validator`, `slash_validator` |
| **DNA** | `record_dna_generation` |

### Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_VALIDATOR_STAKE` | 1,000,000 | Minimum tokens to register as validator |
| `PROTOCOL_FEE_BPS` | 250 | 2.5% fee on inference payments |
| `SLASH_RATE_BPS` | 500 | 5% slash on misbehaving validators |
| `UNSTAKE_COOLDOWN` | 172,800s | 48h cooldown after unstake request |
| `MAX_REPUTATION` | 10,000 | Maximum validator reputation score |

### Lock Duration Tiers

| Tier | Duration | Multiplier |
|------|----------|-----------|
| 1 Day | 86,400s | 1.00× |
| 1 Week | 604,800s | 1.50× |
| 1 Month | 2,592,000s | 2.00× |
| 3 Months | 7,776,000s | 3.00× |
| 6 Months | 15,552,000s | 4.00× |
| 1 Year | 31,536,000s | 6.00× |

### PDA Seeds

| Account | Seeds |
|---------|-------|
| `ProtocolConfig` | `["config"]` |
| `ModelRegistry` | `["model", authority, nonce_le8]` |
| `DataSubmission` | `["data", submitter, nonce_le8]` |
| `ValidatorAccount` | `["validator", validator]` |
| `InferenceRequest` | `["inference", requester, nonce_le8]` |
| `StakeAccount` | `["stake", staker]` |
| `DnaSubmission` | `["dna", author, dna_hash_bytes]` |
| Vault | `["vault", config_pda]` |
| Escrow | `["escrow", model_id]` |
| ValidatorVault | `["validator_vault", validator]` |

### Building

```bash
# Install solana toolchain (if needed)
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.20/install)"

# Install anchor via avm
cargo install avm
avm install 0.32.1 && avm use 0.32.1

# From this directory
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
anchor build --skip-lint
```

Output: `target/deploy/solana_ai_inference.so`

### Deploy

```bash
# Devnet
anchor deploy --provider.cluster devnet

# Mainnet (already deployed)
# Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT
```

---

## TypeScript Client (`@clawd/solana-ai-inference-client`)

### Install

```bash
pnpm add @clawd/solana-ai-inference-client
# or
npm install @clawd/solana-ai-inference-client
```

### Build from source

```bash
cd client
npm install
npm run build    # outputs to dist/
```

### Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { SolanaAiInferenceClient, createModelType, getLockDuration } from '@clawd/solana-ai-inference-client';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new Wallet(Keypair.generate()); // use your keypair
const client = new SolanaAiInferenceClient(connection, wallet);
```

### Inference Flow

```typescript
// 1. Register a model
const txSig = await client.initializeModel(
  authorityKeypair,
  'QmSomeCIDHash',
  createModelType('textGeneration'),
  'https://my-model-api.example.com',
  BigInt(1_000_000),  // inference fee in token base units
  BigInt(0)           // nonce
);

// 2. Finalize training
await client.finalizeTraining(authorityKeypair, modelPda, BigInt(9_500)); // 95% accuracy

// 3. Request inference
const [modelPda] = client.getModelPda(authorityKeypair.publicKey, BigInt(0));
await client.requestInference(
  requesterKeypair,
  requesterTokenAccount,
  escrowTokenAccount,
  modelPda,
  'Analyze sentiment: Solana is the fastest blockchain',
  BigInt(5_000), // 50% confidence threshold
  BigInt(0)      // nonce
);

// 4. Submit result (model authority)
await client.submitInferenceResult(
  authorityKeypair,
  inferencePda,
  modelPda,
  escrowTokenAccount,
  modelOwnerTokenAccount,
  treasuryTokenAccount,
  'positive',
  BigInt(9_200),  // 92% confidence
  BigInt(420)     // 420ms processing time
);

// 5. Read back
const req = await client.getInferenceRequest(inferencePda);
console.log(req?.status, req?.prediction, req?.qualityScore);
```

### Staking

```typescript
// Stake with 1-year lock
await client.stakeTokens(
  userKeypair,
  userTokenAccount,
  vaultTokenAccount,
  BigInt(5_000_000),          // amount
  BigInt(getLockDuration('1year'))
);

// After lock expires: request + execute unstake (48h cooldown)
await client.requestUnstake(userKeypair);
// ... wait 48 hours ...
await client.executeUnstake(userKeypair, userTokenAccount, vaultTokenAccount);
```

### Validators

```typescript
// Register (requires MIN_VALIDATOR_STAKE = 1_000_000)
await client.registerValidator(
  validatorKeypair,
  userTokenAccount,
  validatorVaultAccount,
  BigInt(2_000_000)
);

// Rate a data submission
await client.rateData(validatorKeypair, dataSubmissionPda, 85); // score 0-100
```

### Read Operations

```typescript
// Protocol stats
const config = await client.getProtocolConfig();
console.log(`Models: ${config?.totalModels}, Validators: ${config?.totalValidators}`);

// Model info
const model = await client.getModel(modelPda);
console.log(`Accuracy: ${model?.accuracyBps}bps, Revenue: ${model?.totalRevenue}`);

// Inference request state
const req = await client.getInferenceRequest(inferencePda);
// status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
```

### PDA Helpers

```typescript
const [configPda]       = client.getConfigPda();
const [modelPda]        = client.getModelPda(authority, nonce);
const [validatorPda]    = client.getValidatorPda(validator);
const [inferencePda]    = client.getInferencePda(requester, nonce);
const [stakePda]        = client.getStakePda(staker);
const [escrowPda]       = client.getEscrowPda(modelId);
const [vaultPda]        = client.getVaultPda(configPda);
const [dnaPda]          = client.getDnaPda(author, dnaHash);
```

---

## ORE Mining Client

The SDK also includes `OreMinerClient` for interacting with the ORE v2 mining protocol.

```typescript
import { OreMinerClient, oreMinerPda, oreBoardPda } from '@clawd/solana-ai-inference-client';

const miner = new OreMinerClient(); // defaults to mainnet RPC from env

// Get comprehensive mining stats
const stats = await miner.getMiningStats(walletPublicKey);
console.log(`ORE balance: ${stats.oreBalance}`);
console.log(`Pending ORE rewards: ${stats.pendingOreRewards}`);
console.log(`Pending SOL rewards: ${stats.pendingSolRewards}`);
console.log(`Round ${stats.roundInfo?.roundId}, ${stats.roundInfo?.timeRemainingSeconds}s remaining`);

// Build and send transactions
const deploy = await miner.buildDeployTransaction(wallet, 0.1, squares);
const claimAll = await miner.buildClaimAllTransaction(wallet);
```

**ORE Program:** `ore2LrFdxHRrcqwR1KVW5jLEqfAXEJMxRNSGzwj73yz`  
**ORE Mint:** `oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp` (11 decimals)

---

## Configuration

Set environment variables for RPC access:

```bash
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_WSS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

Falls back to `https://api.mainnet-beta.solana.com` if unset.

---

## Model Types

`SentimentAnalysis` | `TextGeneration` | `ImageClassification` | `PricePrediction` | `DocumentUnderstanding` | `AudioTranscription` | `CodeGeneration` | `Embedding`

## Data Types

`Text` | `Image` | `Audio` | `Video` | `TradingData` | `SolanaTransactions` | `NftMetadata` | `DeFiData` | `Embeddings`

---

## Integration in Clawd Monorepo

This package is part of the `solana-clawd` monorepo workspace. Import it in any workspace package:

```json
// package.json
{
  "dependencies": {
    "@clawd/solana-ai-inference-client": "workspace:*"
  }
}
```

```typescript
import { SolanaAiInferenceClient } from '@clawd/solana-ai-inference-client';
```
