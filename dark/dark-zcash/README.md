# 🛡️ Dark Zcash — Zcash Privacy Primitives for Solana

**Where Zcash's battle-tested zero-knowledge cryptography meets Solana's blistering speed.**

> 🔒 **Sapling + Orchard zk-SNARKs** | ⚡ 400ms blocks | 🔐 256-byte Groth16 proofs

## Overview

The Zcash module provides browser-grade Zcash-style privacy primitives adapted for the Solana ecosystem. This module is the cryptographic engine behind Dark Protocol's shielded transactions, private transfers, and zero-knowledge proof verification.

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🎯 **Sapling Addresses** | ✅ | Full key derivation chain (sk → fvk → ivk → address) |
| 🧙 **Groth16 Proofs** | ✅ | Placeholder proof system for shielded transactions |
| 🌳 **Merkle Trees** | ✅ | Zcash-style incremental Merkle tree commitments |
| 🔐 **Note Encryption** | ✅ | ChaCha20-Poly1305 AEAD encrypted notes |
| 🚫 **Nullifiers** | ✅ | Double-spend prevention via nullifier sets |
| 🛡️ **Shielded Pool** | ✅ | Deposit/withdraw from privacy pool |
| 📝 **Encrypted Memos** | ✅ | Private messages attached to transfers |
| 🔑 **Viewing Keys** | ✅ | Separate viewing and spending authority |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Zcash Privacy Layer                  │
├───────────────┬───────────────────┬─────────────────┤
│   Address      │   Proof System    │   Note System    │
│   System       │                   │                  │
│                │                   │                  │
│  SpendingKey   │  Groth16 Prover   │  NoteEncryption  │
│       ↓        │       ↓           │       ↓          │
│  FullViewingKey│  VerifyProof      │  NoteDecryption  │
│       ↓        │       ↓           │       ↓          │
│  IncomingVK    │  Public Inputs    │  Plaintext       │
│       ↓        │  (root,commit,    │  (value,memo,    │
│  PaymentAddr   │   nullifier)      │   rcm)           │
└───────────────┴───────────────────┴─────────────────┘
         │               │                  │
         └───────────────┴──────────────────┘
                         │
              ┌──────────▼──────────┐
              │  Solana Blockchain   │
              │  Dark Protocol       │
              │  Program (Anchor)    │
              └─────────────────────┘
```

## Key Derivation Chain

```
SaplingSpendingKey (sk) — 32 bytes
        │
        ├── ask (spend authorizing key)
        ├── nsk (nullifier deriving key)
        │
        ▼
SaplingFullViewingKey (fvk) — 64 bytes
        │
        ├── ak (spend validating key)
        ├── nk (nullifier key)
        │
        ▼
SaplingIncomingViewingKey (ivk) — 32 bytes
        │
        └── + diversifier (d) — 11 bytes
                │
                ▼
SaplingPaymentAddress — 43 bytes (d + pk_d)
```

## Usage

```typescript
import {
  generateSaplingSpendingKey,
  deriveFullViewingKey,
  deriveIncomingViewingKey,
  createSaplingPaymentAddress,
  generateNoteCommitment,
  createNullifier,
  encryptNote,
  decryptNote,
  Groth16Proof,
} from "@dark-zcash/index";

// Generate a new spending key
const sk = generateSaplingSpendingKey();

// Derive the viewing key chain
const fvk = deriveFullViewingKey(sk);
const ivk = deriveIncomingViewingKey(fvk);

// Create a shielded payment address
const diversifier = new Uint8Array(11);
crypto.getRandomValues(diversifier);
const address = createSaplingPaymentAddress(ivk, diversifier);

// Create a shielded note commitment
const { commitment, note } = generateNoteCommitment(
  BigInt(1_000_000_000), // 1 SOL
  address.pk_d,
  sk
);

// Create a nullifier to prevent double-spends
const nullifier = createNullifier(commitment, sk);

// Encrypt a note for the recipient
const encryptedNote = encryptNote(note, ivk);

// Decrypt with the recipient's viewing key
const decrypted = decryptNote(encryptedNote, ivk);

// Create a zero-knowledge proof
const proof = new Groth16Proof();
proof.generateProof({
  root: merkleRoot,
  commitment,
  nullifier,
  secretKey: sk,
  publicKey: address.pk_d,
});
```

## Cryptographic Primitives

### Pedersen Commitments
- **Function:** `commit(value, randomness) → commitment`
- **Used for:** Note hiding in shielded transactions

### Merkle Tree (Incremental)
- **Depth:** 32 levels (supports 4B+ notes)
- **Function:** `insert(leaf) → newRoot`
- **Proof:** Merkle path verification for ZK circuits

### Nullifier Derivation
- **Function:** `nullify(commitment, secret) → nullifier`
- **Purpose:** Prevent double-spending in shielded pool

### Note Encryption (ChaCha20-Poly1305)
- **Key:** Derived from shared secret (Diffie-Hellman)
- **Nonce:** 12 bytes random
- **AEAD:** Authenticated encryption with Poly1305

---

**Part of the ZOLana Ecosystem — Privacy is a right, not a privilege.**