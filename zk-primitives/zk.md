# clawd-zk — ZK Primitives Reference

Zero-knowledge primitives for the Clawd agent fleet on Solana.
Built on [Light Protocol V2](https://www.zkcompression.com) for rent-free compressed state.

---

## What this provides

| Primitive | On-chain instruction | Cost |
|---|---|---|
| Nullifier registry | `publish_attestation` (embedded) | ~15k lamports/nullifier |
| Groth16 proof verification | all three instructions | ~200k CU |
| Compressed attestation | `publish_attestation` | ~618k CU, ~25k lamports |
| Consume attestation (one-shot) | `consume_attestation` | ~310k CU, ~5k lamports |
| Encrypted state commitment | `commit_encrypted_state` | ~410k CU, ~5.3k lamports |

Program ID: `CLAWDzk11111111111111111111111111111111111`

---

## Three Instructions

### `publish_attestation`

Creates a nullifier + compressed attestation record for a model.

```
attester (signer, writable)
  └─ verify Groth16(attester, modelHash, payloadCommitment, nullifier)
  └─ create nullifier compressed PDA via Light CPI
  └─ write AttestationAccount (compressed) via Light CPI
```

**Public inputs order**: `[attester, modelHash, payloadCommitment, nullifier]`

**AttestationAccount schema**:
```rust
pub struct AttestationAccount {
    pub model_hash:          [u8; 32],
    pub attester:            [u8; 32],
    pub payload_commitment:  [u8; 32],
    pub published_at:        i64,
    pub status:              u8,   // 0=active, 1=consumed, 2=revoked
}
```

### `consume_attestation`

Marks an attestation as used. One-shot — cannot be re-consumed.

```
consumer (signer, writable)
  └─ verify Groth16(consumer, attestationAddress, consumeNonce)
  └─ state transition: status 0 → 1
```

**Public inputs order**: `[consumer, attestationAddress, consumeNonce]`

### `commit_encrypted_state`

Commits encrypted model weights or training data on-chain.

```
committer (signer, writable)
  └─ verify Groth16(committer, modelHash, ciphertextCommitment, version)
  └─ write EncryptedStateAccount (compressed) via Light CPI
```

**Public inputs order**: `[committer, modelHash, ciphertextCommitment, version_u64_le]`

**EncryptedStateAccount schema**:
```rust
pub struct EncryptedStateAccount {
    pub model_hash:             [u8; 32],
    pub committer:              [u8; 32],
    pub ciphertext_commitment:  [u8; 32],
    pub version:                u64,
    pub published_at:           i64,
}
```

---

## Nullifier Design

A nullifier is a 32-byte hash that proves an action was performed exactly once.
The nullifier itself is never stored — only its compressed PDA address.
Address tree rejects duplicates → replay protection.

**Client-side hash** (portable):
```
nullifier = SHA-256(secret || context || nonce)
```

**In circuits** (Poseidon): the proof pins the same value to on-chain public inputs.

**Address derivation**:
```rust
const NULLIFIER_PREFIX: &[u8] = b"clawd-zk-nullifier";

let (address, seed) = derive_address(
    &[NULLIFIER_PREFIX, nullifier.as_slice()],
    &address_tree_pubkey,
    &program_id,
);
```

**Cost vs. regular PDA**:
| Storage | Cost |
|---|---|
| Regular PDA | 890,880 lamports |
| Compressed PDA (clawd-zk) | 15,000 lamports |

---

## Groth16 Proof Format

```json
{
  "a": "0x...",          // 64 bytes — G1 point (big-endian wire)
  "b": "0x...",          // 128 bytes — G2 point (big-endian wire)
  "c": "0x...",          // 64 bytes — G1 point (big-endian wire)
  "verifyingKey": "0x..." // variable — serialized VK (alt-bn128)
}
```

The on-chain verifier swaps `proof_a` endianness (big-endian → little-endian).
`proof_b` and `proof_c` stay big-endian.
VK is supplied as instruction data — enables per-circuit support without program upgrades.

---

## TypeScript SDK — `@clawd/zk-client`

### Install

```bash
npm install @clawd/zk-client @lightprotocol/stateless.js @solana/kit
```

### Compute a nullifier

```typescript
import { computeNullifier, NULLIFIER_PREFIX } from "@clawd/zk-client";

const secret  = crypto.getRandomValues(new Uint8Array(32));
const context = "solana-clawd/attestation/v1";

const nullifier = computeNullifier({ secret, context });
// → Uint8Array(32)
```

### Assemble public inputs

```typescript
import { buildPublishPublicInputs } from "@clawd/zk-client";

const inputs = buildPublishPublicInputs({
  attester:          signer.publicKey.toBytes(),
  modelHash:         modelHashBytes,
  payloadCommitment: payloadCommitmentBytes,
  nullifier,
});
// → Uint8Array(128)  — four 32-byte fields packed
```

### Build a `publish_attestation` instruction

```typescript
import { ClawdZkClient } from "@clawd/zk-client";
import { createSolanaRpc } from "@solana/kit";

const rpc    = createSolanaRpc("https://mainnet.helius-rpc.com/?api-key=...");
const client = new ClawdZkClient({
  rpc,
  programId: new PublicKey("CLAWDzk11111111111111111111111111111111111"),
  photonUrl: "https://mainnet.helius-rpc.com/?api-key=...",
});

const ix = await client.publishAttestation({
  signer:            signer.publicKey,
  modelHash:         modelHashBytes,
  payloadCommitment: payloadCommitmentBytes,
  nullifier,
  proof: groth16Proof,  // { a, b, c, verifyingKey }
});
// → TransactionInstruction — sign and send normally
```

### Build a `commit_encrypted_state` instruction

```typescript
const ix = await client.commitEncryptedState({
  signer:               signer.publicKey,
  modelHash:            modelHashBytes,
  ciphertextCommitment: ciphertextCommitmentBytes,
  stateVersion:         1n,
  proof:                groth16Proof,
});
```

### Verify a proof off-chain (sanity check)

```typescript
import { verifyGroth16Offchain, buildPublishPublicInputs } from "@clawd/zk-client";

const ok = verifyGroth16Offchain(proof, buildPublishPublicInputs({ ... }));
// true/false — no pairing, structural check only
```

---

## Agent API — `@clawd/zk-agent`

The high-level wrapper. Wraps `@clawd/zk-client` with a natural-language router,
optional signing, and a CLI binary.

### Install

```bash
npm install @clawd/zk-agent
```

### Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CLAWD_ZK_RPC_URL` | yes | — | Helius or any Solana RPC |
| `CLAWD_ZK_PROGRAM_ID` | no | `DEFAULT_PROGRAM_ID` | base58 or alias (see below) |
| `CLAWD_ZK_PHOTON_URL` | no | = `CLAWD_ZK_RPC_URL` | Helius Photon indexer |
| `CLAWD_ZK_API_KEY` | no | — | separate RPC header key |
| `CLAWD_ZK_COMMITMENT` | no | `confirmed` | `processed\|confirmed\|finalized` |
| `CLAWD_ZK_KEYPAIR` | no | — | path to Solana CLI keypair JSON |
| `CLAWD_ZK_NETWORK` | no | `mainnet` | `mainnet\|devnet\|localnet` |

**Program ID aliases**: `CLAWDZK_MAINNET`, `CLAWDZK_DEVNET`, `CLAWDZK_LOCALNET`

### Quick start

```typescript
import { ClawdZkAgent, routeIntent, dispatchRoute } from "@clawd/zk-agent";

const agent = await ClawdZkAgent.fromEnv();

// Option A: direct call
const result = await agent.attestModel({
  modelHash:         modelHashBytes,
  payloadCommitment: payloadCommitmentBytes,
  proof:             groth16Proof,
  context:           "my-model/v1",
});
// result.nullifierHex, result.instruction, result.summary

// Option B: natural-language intent router
const route = routeIntent("attest this model 0xab12… with my proof.json", agent, {
  payloadCommitment: "0x" + "ab".repeat(32),
});
// → { intent: "attest-model", action: "attestModel", confidence: 0.9, args: {...} }

const result = await dispatchRoute(route, agent);
```

### Agent methods

| Method | On-chain instruction | Returns |
|---|---|---|
| `agent.attestModel(args)` | `publish_attestation` | `AttestModelResult` |
| `agent.commitEncryptedState(args)` | `commit_encrypted_state` | `CommitStateResult` |
| `agent.verifyProof(args)` | — (off-chain) | `VerifyProofResult` |
| `agent.computeNullifierFor(secret, ctx)` | — | `Bytes32` |

### Intent router

Deterministic, rule-based — no model calls.

| Verb (regex) | Intent | Action |
|---|---|---|
| `attest`, `attestation`, `publish` | `attest-model` | `attestModel` |
| `commit`, `commit_state`, `ciphertext` | `commit-state` | `commitEncryptedState` |
| `verify`, `check`, `validate` | `verify-proof` | `verifyProof` |
| `nullifier`, `derive`, `compute_nullifier` | `compute-nullifier` | `computeNullifier` |
| `inspect`, `config`, `status`, `show` | `inspect` | `describe` |
| `help`, `usage`, `how`, `what` | `help` | `help` |

### CLI

```bash
# Show active config
clawd-zk-agent inspect

# Build publish_attestation instruction
clawd-zk-agent attest <modelHash> <payloadCommitment> <proof.json> [--context "v1"]

# Build commit_encrypted_state instruction
clawd-zk-agent commit <ciphertextCommitment> <stateVersion> <proof.json> [--model <hash>]

# Off-chain verify
clawd-zk-agent verify <proof.json>

# Derive nullifier
clawd-zk-agent nullifier "context-tag"

# Natural-language router
clawd-zk-agent ask "attest this model 0xab12…"
```

---

## Light Protocol V2 — Tree Addresses (mainnet)

Pinned in `configs/light-trees.yaml`. Last verified 2026-06-15.

**Programs**:
- Light System: `SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7`
- Light Token: `cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m`
- Account Compression: `compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq`

**Address tree** (~1 trillion leaves):
`amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx`

**State trees** (5 trees, V2):
| # | Tree | Output Queue |
|---|---|---|
| 1 | `bmt1LryLZUMmF7ZtqESaw7wifBXLfXHQYoE4GAmrahU` | `oq1na8gojfdUhsfCpyjNt6h4JaDWtHf1yQj4koBWfto` |
| 2 | `bmt2…` | `oq2…` |
| 3–5 | see `configs/light-trees.yaml` | |

Read compressed state via Helius Photon:
```typescript
const account = await rpc.getCompressedAccount(attestationAddress);
```

---

## Cost Model (mainnet, ~$200/SOL)

| Operation | CU | Lamports | USD |
|---|---:|---:|---:|
| Groth16 verify (200k CU) | 200,000 | — | — |
| Create 1 nullifier | 206,000 | 15,000 | $0.003 |
| Write 1 attestation | 212,000 | 5,300 | $0.001 |
| Full `publish_attestation` | 618,000 | 25,000 | $0.005 |
| Publish + consume cycle | 1,200,000 | 50,000 | $0.010 |

---

## On-chain Error Codes

| Code | Meaning |
|---|---|
| `InvalidProof` | Groth16 pairing check failed |
| `InvalidPublicInputs` | Malformed or wrong-sized inputs |
| `NullifierAlreadyExists` | Address tree rejected (already registered) |
| `UnknownTree` | Unrecognised Light Protocol tree |

---

## Testing

```bash
# Off-chain TypeScript (vitest)
cd zk-primitives
npm test

# On-chain Rust (requires light test-validator in a separate terminal)
light test-validator
cargo test-sbf -p clawd-zk
```

---

## Security Assumptions

1. **SHA-256 nullifier** is collision-resistant for the client-to-circuit domain.
2. **Groth16** soundness holds under the Knowledge-of-Exponent assumption on alt-bn128.
3. **Light address tree** enforces uniqueness at the VM level — no double-create.
4. **VK is caller-supplied** — the program trusts the caller to use the correct circuit VK. Production systems should derive the VK from a trusted setup artifact.
5. **Encrypted payloads** are committed as a hash — ciphertext itself lives off-chain (IPFS/Arweave). The chain only stores the commitment.

---

## Production Checklist

- [ ] Run Powers-of-Tau ceremony for the specific circuit
- [ ] Generate canonical `LIGHT_CPI_SIGNER` via `anchor idl build`
- [ ] Deploy with `anchor deploy --provider.cluster mainnet`
- [ ] Register VK as program constant or well-known config
- [ ] Replace JSON shim in `client.ts` with `@coral-xyz/anchor` BorshInstructionCoder
- [ ] Wire `sendAndConfirm` from `@solana/kit` in `agent.ts` `trySend` hook
- [ ] Run `cargo test-sbf` against a real `light test-validator`

---

## Repository Layout

```
zk-primitives/
├── zk.md                          ← this file
├── README.md                      — overview + quick start
├── docs/
│   └── ARCHITECTURE.md            — deep dive: security, costs, alternatives
├── configs/
│   └── light-trees.yaml           — canonical V2 tree addresses (pinned)
├── programs/
│   └── clawd-zk/src/
│       ├── lib.rs                 — instruction dispatch
│       ├── nullifier.rs           — compressed PDA nullifiers
│       ├── proof.rs               — Groth16 verification
│       └── state.rs               — Light CPI state writes
├── client/                        — @clawd/zk-client npm package
│   └── src/
│       ├── nullifier.ts
│       ├── proof.ts
│       ├── state.ts
│       └── client.ts              — ClawdZkClient orchestrator
├── agent/                         — @clawd/zk-agent npm package
│   └── src/
│       ├── agent.ts               — ClawdZkAgent class
│       ├── intents.ts             — NL intent router
│       ├── config.ts              — env-driven config
│       └── cli.ts                 — clawd-zk-agent binary
└── tests/
    └── nullifier.test.ts
```
