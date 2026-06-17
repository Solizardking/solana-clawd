#!/usr/bin/env python3
"""
Generate ZK-primitives SFT training pairs and append them to the seed dataset.

Produces ~20 high-quality conversations covering the clawd-zk program:
  - Three on-chain instructions (publish_attestation, consume_attestation, commit_encrypted_state)
  - Nullifier computation + cost model
  - Groth16 proof format and off-chain verification
  - @clawd/zk-client SDK usage
  - ClawdZkAgent natural-language intent router
  - Light Protocol V2 tree addresses and Photon indexer
  - Error codes + production checklist
  - Testing workflow

Usage:
  python3 scripts/add_zk_examples.py
  python3 scripts/add_zk_examples.py --dry-run          # print without writing
  python3 scripts/add_zk_examples.py --eval             # write to eval file instead
  python3 scripts/add_zk_examples.py --output custom.jsonl
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. "
    "You help developers build on Solana. "
    "You are an expert in zero-knowledge proofs, Light Protocol, and the clawd-zk program. "
    "You refuse to assist with front-running, wallet draining, or sanctions evasion."
)

ZK_EXAMPLES: list[dict] = [
    # ── Overview ────────────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What is clawd-zk and what does it do?"},
            {"role": "assistant", "content": (
                "clawd-zk is an Anchor program on Solana that provides three zero-knowledge primitives "
                "for the Clawd agent fleet:\n\n"
                "1. **`publish_attestation`** — Creates a nullifier-gated, Groth16-verified attestation "
                "record for a model. The attester proves knowledge of a secret without revealing it. "
                "Cost: ~618k CU / ~25k lamports.\n\n"
                "2. **`consume_attestation`** — One-shot consume of an existing attestation (status 0→1). "
                "Prevents the same attestation being used twice. Cost: ~310k CU / ~5k lamports.\n\n"
                "3. **`commit_encrypted_state`** — Commits encrypted model weights or training data "
                "on-chain via a Groth16-verified ciphertext commitment. "
                "Cost: ~410k CU / ~5.3k lamports.\n\n"
                "All three instructions use [Light Protocol V2](https://www.zkcompression.com) for "
                "compressed state storage — 60× cheaper than regular PDAs.\n\n"
                "Program ID: `CLAWDzk11111111111111111111111111111111111`"
            )},
        ]
    },
    # ── Nullifier concept ────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What is a nullifier in clawd-zk and why is it 60× cheaper than a regular PDA?"},
            {"role": "assistant", "content": (
                "A nullifier is a 32-byte hash that proves an action was performed exactly once, "
                "without revealing which action or who performed it.\n\n"
                "**How it works in clawd-zk**:\n"
                "```\n"
                "nullifier = SHA-256(secret || context || nonce)   # client-side\n"
                "address   = derive_address([b\"clawd-zk-nullifier\", nullifier], address_tree, program_id)\n"
                "```\n"
                "The nullifier itself is never stored. A compressed account is created at the *derived "
                "address* — its existence proves the nullifier was used. The Light address tree rejects "
                "any attempt to create the same address twice, giving you replay protection at the VM level.\n\n"
                "**Cost comparison**:\n"
                "| Storage | Cost per nullifier |\n"
                "|---|---|\n"
                "| Regular PDA | 890,880 lamports (~$0.18) |\n"
                "| Compressed PDA (clawd-zk) | 15,000 lamports (~$0.003) |\n\n"
                "The compressed account stores an empty struct (`NullifierAccount {}`). Existence is the "
                "proof — nothing else needs to be in the account."
            )},
        ]
    },
    # ── Groth16 proof format ──────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What format does clawd-zk expect for a Groth16 proof?"},
            {"role": "assistant", "content": (
                "clawd-zk expects proofs as a JSON file with four hex-encoded fields:\n\n"
                "```json\n"
                "{\n"
                "  \"a\": \"0x...\",          // 64 bytes  — G1 point (big-endian wire format)\n"
                "  \"b\": \"0x...\",          // 128 bytes — G2 point (big-endian wire format)\n"
                "  \"c\": \"0x...\",          // 64 bytes  — G1 point (big-endian wire format)\n"
                "  \"verifyingKey\": \"0x...\" // variable  — serialized VK (alt-bn128 layout)\n"
                "}\n"
                "```\n\n"
                "**Endianness note**: the on-chain verifier (`proof.rs`) swaps `proof_a` from "
                "big-endian (wire) to little-endian before passing it to `light-verifier`. "
                "`proof_b` and `proof_c` stay big-endian.\n\n"
                "**VK is caller-supplied** — you pass the verifying key as instruction data, not "
                "baked into the program. This lets you support different circuits without upgrading "
                "the program.\n\n"
                "Load a proof from disk with the agent:\n"
                "```typescript\n"
                "import { ClawdZkAgent } from \"@clawd/zk-agent\";\n"
                "const proof = await ClawdZkAgent.loadProof(\"./my-proof.json\");\n"
                "```\n\n"
                "Or off-chain sanity check (structural only, no pairing):\n"
                "```typescript\n"
                "import { verifyGroth16Offchain, buildPublishPublicInputs } from \"@clawd/zk-client\";\n"
                "const ok = verifyGroth16Offchain(proof, buildPublishPublicInputs({ ... }));\n"
                "```"
            )},
        ]
    },
    # ── publish_attestation code walkthrough ─────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "Show me how to build a publish_attestation instruction in TypeScript."},
            {"role": "assistant", "content": (
                "Here's a complete walkthrough using `@clawd/zk-client`:\n\n"
                "```typescript\n"
                "import { ClawdZkClient, computeNullifier, buildPublishPublicInputs } from \"@clawd/zk-client\";\n"
                "import { createSolanaRpc } from \"@solana/kit\";\n"
                "import { PublicKey } from \"@solana/web3.js\";\n\n"
                "const rpc = createSolanaRpc(process.env.CLAWD_ZK_RPC_URL!);\n"
                "const client = new ClawdZkClient({\n"
                "  rpc,\n"
                "  programId: new PublicKey(\"CLAWDzk11111111111111111111111111111111111\"),\n"
                "  photonUrl: process.env.CLAWD_ZK_RPC_URL, // Helius doubles as Photon\n"
                "});\n\n"
                "// 1. Derive nullifier from attester secret + context\n"
                "const nullifier = computeNullifier({\n"
                "  secret:  signerKeypair.secretKey.slice(0, 32),\n"
                "  context: \"solana-clawd/model/v1\",\n"
                "});\n\n"
                "// 2. Build the instruction\n"
                "const ix = await client.publishAttestation({\n"
                "  signer:            signerKeypair.publicKey,\n"
                "  modelHash:         modelHashBytes,    // Uint8Array(32)\n"
                "  payloadCommitment: commitmentBytes,   // Uint8Array(32)\n"
                "  nullifier,\n"
                "  proof: groth16Proof,                  // { a, b, c, verifyingKey }\n"
                "});\n\n"
                "// 3. Sign and send (standard @solana/kit)\n"
                "const tx = new Transaction().add(ix);\n"
                "const sig = await sendAndConfirmTransaction(connection, tx, [signerKeypair]);\n"
                "console.log(\"Attestation published:\", sig);\n"
                "```\n\n"
                "The client internally: derives the nullifier address, fetches a non-inclusion validity "
                "proof from Photon, packs Light CPI accounts, and returns the fully-assembled instruction. "
                "You just sign and send."
            )},
        ]
    },
    # ── ClawdZkAgent quick start ─────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What's the fastest way to use ClawdZkAgent in a Clawd script?"},
            {"role": "assistant", "content": (
                "The fastest path is `ClawdZkAgent.fromEnv()` — it reads config from environment "
                "variables and you go straight to calling methods:\n\n"
                "```typescript\n"
                "import { ClawdZkAgent } from \"@clawd/zk-agent\";\n\n"
                "// Set env vars before running:\n"
                "// export CLAWD_ZK_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...\n"
                "// export CLAWD_ZK_KEYPAIR=~/.config/solana/id.json\n\n"
                "const agent = await ClawdZkAgent.fromEnv();\n\n"
                "// Attest a model\n"
                "const result = await agent.attestModel({\n"
                "  modelHash:         modelHashBytes,\n"
                "  payloadCommitment: payloadBytes,\n"
                "  proof:             groth16Proof,\n"
                "  context:           \"my-model/v1\",\n"
                "});\n"
                "console.log(result.nullifierHex);  // registered nullifier\n"
                "console.log(result.summary);       // human-readable description\n\n"
                "// Or use the natural-language router (no model call — pure regex)\n"
                "import { routeIntent, dispatchRoute } from \"@clawd/zk-agent\";\n"
                "const route = routeIntent(\"verify this proof\", agent, { proofPath: \"./p.json\" });\n"
                "const r = await dispatchRoute(route, agent);\n"
                "```\n\n"
                "Required env:\n"
                "```bash\n"
                "CLAWD_ZK_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY\n"
                "CLAWD_ZK_KEYPAIR=/path/to/keypair.json   # optional, for signing\n"
                "```"
            )},
        ]
    },
    # ── Intent router ───────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What intents does the clawd-zk natural-language router understand?"},
            {"role": "assistant", "content": (
                "The intent router in `@clawd/zk-agent` is deterministic and rule-based — no LLM calls, "
                "no network. It matches verb patterns in the input text:\n\n"
                "| Verb (regex) | Intent | Maps to |\n"
                "|---|---|---|\n"
                "| `attest`, `attestation`, `publish` | `attest-model` | `agent.attestModel()` |\n"
                "| `commit`, `commit_state`, `ciphertext` | `commit-state` | `agent.commitEncryptedState()` |\n"
                "| `verify`, `check`, `validate` | `verify-proof` | `agent.verifyProof()` |\n"
                "| `nullifier`, `derive`, `compute_nullifier` | `compute-nullifier` | `agent.computeNullifierFor()` |\n"
                "| `inspect`, `config`, `status`, `show` | `inspect` | `agent.describe()` |\n"
                "| `help`, `usage`, `how`, `what` | `help` | show usage |\n\n"
                "If multiple verbs match, the highest-weight one wins. No match → fallback `help` "
                "(confidence 0.1).\n\n"
                "```typescript\n"
                "const route = routeIntent(\"attest this model 0xab12…\", agent, {\n"
                "  payloadCommitment: \"0x\" + \"cd\".repeat(32),\n"
                "});\n"
                "// → { intent: \"attest-model\", action: \"attestModel\", confidence: 0.9 }\n"
                "```\n\n"
                "This makes it safe to call from any Clawd surface (REPL, Telegram, voice agent, "
                "MCP tool) without worrying about prompt injection affecting routing."
            )},
        ]
    },
    # ── Light Protocol trees ─────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What are the Light Protocol V2 tree addresses used by clawd-zk on mainnet?"},
            {"role": "assistant", "content": (
                "These are pinned in `zk-primitives/configs/light-trees.yaml` (last verified 2026-06-15).\n\n"
                "**Core programs**:\n"
                "| Program | Address |\n"
                "|---|---|\n"
                "| Light System | `SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7` |\n"
                "| Light Token | `cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m` |\n"
                "| Account Compression | `compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq` |\n\n"
                "**Address tree** (~1 trillion leaves):\n"
                "`amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx`\n\n"
                "**State tree 1** (of 5):\n"
                "- tree: `bmt1LryLZUMmF7ZtqESaw7wifBXLfXHQYoE4GAmrahU`\n"
                "- output_queue: `oq1na8gojfdUhsfCpyjNt6h4JaDWtHf1yQj4koBWfto`\n"
                "- cpi_context: `cpi15BoVPKgEPw5o8wc2T816GE7b378nMXnhH3Xbq4y`\n\n"
                "Read compressed state back via Helius Photon:\n"
                "```typescript\n"
                "const account = await rpc.getCompressedAccount(attestationAddress);\n"
                "```\n\n"
                "The full list of all 5 state trees is in `configs/light-trees.yaml`. "
                "Re-verify against Helius mainnet if you deploy a new version of the program."
            )},
        ]
    },
    # ── commit_encrypted_state ───────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "When should I use commit_encrypted_state vs publish_attestation?"},
            {"role": "assistant", "content": (
                "Use each instruction for a different purpose:\n\n"
                "**`publish_attestation`** — *Prove a model exists at a point in time*\n"
                "- Creates an `AttestationAccount` with `model_hash`, `payload_commitment`, and `status`\n"
                "- Designed to be *consumed* once later (`consume_attestation`)\n"
                "- Use when: you want to attest a model for external verification, "
                "claim authorship, or enable one-shot token gating\n\n"
                "**`commit_encrypted_state`** — *Commit encrypted weights or training data*\n"
                "- Creates an `EncryptedStateAccount` with `ciphertext_commitment` and `version`\n"
                "- Versioned — you can commit v1, v2, v3 etc. for the same model\n"
                "- Not consumed; it's an append-only log of state commitments\n"
                "- Use when: you want to prove your model weights haven't changed, "
                "commit a training dataset hash, or anchor encrypted IP on-chain\n\n"
                "The ciphertext itself lives **off-chain** (IPFS / Arweave). "
                "The chain stores only the 32-byte hash commitment and the `version` counter. "
                "Groth16 proves the committer knows the preimage of the hash.\n\n"
                "```typescript\n"
                "// Commit encrypted weights v1\n"
                "const ix = await agent.commitEncryptedState({\n"
                "  modelHash:            modelHashBytes,\n"
                "  ciphertextCommitment: sha256(ciphertextBytes),\n"
                "  stateVersion:         1n,\n"
                "  proof:                groth16Proof,\n"
                "});\n"
                "```"
            )},
        ]
    },
    # ── Error codes ──────────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "I'm getting NullifierAlreadyExists from clawd-zk. What does that mean and how do I fix it?"},
            {"role": "assistant", "content": (
                "`NullifierAlreadyExists` means the Light address tree already has a compressed account "
                "at the derived nullifier address. The nullifier has already been used.\n\n"
                "**Why it happens**: nullifiers are one-shot by design. The address is deterministically "
                "derived from your `(secret, context, nonce)` inputs:\n"
                "```\n"
                "nullifier = SHA-256(secret || context || nonce)\n"
                "address   = derive_address([b\"clawd-zk-nullifier\", nullifier], address_tree, program_id)\n"
                "```\n"
                "If you call `publish_attestation` twice with the same inputs, the second call fails "
                "with this error.\n\n"
                "**Common fixes**:\n"
                "1. **Change the nonce** — pass a fresh nonce (e.g. `Date.now()` or a counter)\n"
                "2. **Change the context** — use a more specific domain tag like `\"my-model/v2\"`\n"
                "3. **Verify intent** — if you're consuming an existing attestation, use "
                "`consume_attestation`, not `publish_attestation`\n\n"
                "**Check if a nullifier is already registered**:\n"
                "```typescript\n"
                "import { computeNullifier, deriveNullifierAddress } from \"@clawd/zk-client\";\n"
                "const nullifier = computeNullifier({ secret, context, nonce });\n"
                "const address   = deriveNullifierAddress(nullifier, addressTree, programId);\n"
                "const existing  = await rpc.getCompressedAccount(address);\n"
                "if (existing) console.log(\"already registered\");\n"
                "```"
            )},
        ]
    },
    # ── All error codes ──────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What are all the error codes in the clawd-zk program?"},
            {"role": "assistant", "content": (
                "The clawd-zk Anchor program defines four error codes:\n\n"
                "| Code | Cause | Fix |\n"
                "|---|---|---|\n"
                "| `InvalidProof` | Groth16 pairing check failed on-chain | Re-export proof from prover; "
                "verify VK matches the circuit you deployed |\n"
                "| `InvalidPublicInputs` | Malformed or wrong-sized public inputs | Each field must be "
                "exactly 32 bytes; check `buildPublishPublicInputs` output |\n"
                "| `NullifierAlreadyExists` | Address tree rejected duplicate address | Nullifier already "
                "registered — change nonce or context |\n"
                "| `UnknownTree` | Light Protocol tree address not recognised | Update "
                "`configs/light-trees.yaml`; check you're on the right network |\n\n"
                "**Common env-level errors** (before the program even runs):\n"
                "- `CLAWD_ZK_RPC_URL is not set` → export it in your shell or `.env`\n"
                "- `Invalid CLAWD_ZK_PROGRAM_ID` → use base58 pubkey or valid alias "
                "(`CLAWDZK_MAINNET` / `CLAWDZK_DEVNET` / `CLAWDZK_LOCALNET`)\n"
                "- `proof.a expected 64 bytes, got N` → re-export the proof JSON from your prover"
            )},
        ]
    },
    # ── Testing ──────────────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "How do I run the clawd-zk tests?"},
            {"role": "assistant", "content": (
                "There are two test suites:\n\n"
                "**TypeScript (vitest) — off-chain, fast**\n"
                "```bash\n"
                "cd zk-primitives\n"
                "npm test\n"
                "```\n"
                "Covers: nullifier determinism and collision resistance, public input packing, "
                "proof serialization, off-chain sanity check.\n\n"
                "**Rust (cargo test-sbf) — on-chain, requires Light test validator**\n"
                "```bash\n"
                "# Terminal 1: start the Light test validator\n"
                "light test-validator\n\n"
                "# Terminal 2: run on-chain tests\n"
                "cargo test-sbf -p clawd-zk\n"
                "```\n"
                "The on-chain tests actually send transactions through the `clawd-zk` program against "
                "a local Light Protocol state. They verify the full CPI flow: nullifier creation, "
                "attestation write, and state transition.\n\n"
                "Install `light` CLI if you don't have it:\n"
                "```bash\n"
                "curl -sSfL https://install.light.so | sh\n"
                "```"
            )},
        ]
    },
    # ── Production checklist ─────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What do I need to do before deploying clawd-zk to mainnet?"},
            {"role": "assistant", "content": (
                "The current repo is a well-structured scaffold. Before deploying to mainnet:\n\n"
                "**Required**:\n"
                "1. **Powers-of-Tau ceremony** — run a circuit-specific trusted setup to generate "
                "the canonical verifying key for your Groth16 circuit\n"
                "2. **Generate `LIGHT_CPI_SIGNER`** — run `anchor idl build` and bake the PDA "
                "signer address into the program constants in `lib.rs`\n"
                "3. **Deploy** — `anchor deploy --provider.cluster mainnet`\n"
                "4. **Borsh encoding** — replace the JSON shim in `client.ts` with "
                "`@coral-xyz/anchor` `BorshInstructionCoder` for proper wire-format encoding\n"
                "5. **Wire `sendAndConfirm`** — the `trySend` hook in `agent.ts` is a no-op stub; "
                "connect it to `@solana/kit` `sendAndConfirmTransaction`\n"
                "6. **On-chain tests** — run `cargo test-sbf` against a real `light test-validator` "
                "with your deployed program ID\n\n"
                "**Recommended**:\n"
                "- Pin your deployed VK as a well-known config (not just caller-supplied)\n"
                "- Add a `revoke` instruction to handle compromised attestations\n"
                "- Set up Photon monitoring for nullifier registry growth\n"
                "- Run `anchor verify` against the deployed byte-code\n\n"
                "See `zk-primitives/docs/ARCHITECTURE.md` for the full security model."
            )},
        ]
    },
    # ── Public inputs packing ────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "How are public inputs packed for the three clawd-zk instructions?"},
            {"role": "assistant", "content": (
                "Each instruction has a specific field order. All fields are padded to exactly 32 bytes.\n\n"
                "**`publish_attestation`** (4 fields = 128 bytes):\n"
                "```typescript\n"
                "import { buildPublishPublicInputs } from \"@clawd/zk-client\";\n"
                "const inputs = buildPublishPublicInputs({\n"
                "  attester:          signer.publicKey.toBytes(),  // [0] 32 bytes\n"
                "  modelHash,                                       // [1] 32 bytes\n"
                "  payloadCommitment,                               // [2] 32 bytes\n"
                "  nullifier,                                       // [3] 32 bytes\n"
                "});\n"
                "```\n\n"
                "**`consume_attestation`** (3 fields = 96 bytes):\n"
                "```typescript\n"
                "import { buildConsumePublicInputs } from \"@clawd/zk-client\";\n"
                "const inputs = buildConsumePublicInputs({\n"
                "  consumer:            signer.publicKey.toBytes(), // [0] 32 bytes\n"
                "  attestationAddress,                              // [1] 32 bytes\n"
                "  consumeNonce,                                    // [2] 32 bytes\n"
                "});\n"
                "```\n\n"
                "**`commit_encrypted_state`** (4 fields = 128 bytes):\n"
                "```typescript\n"
                "import { buildCommitPublicInputs } from \"@clawd/zk-client\";\n"
                "const inputs = buildCommitPublicInputs({\n"
                "  committer:            signer.publicKey.toBytes(), // [0] 32 bytes\n"
                "  modelHash,                                         // [1] 32 bytes\n"
                "  ciphertextCommitment,                              // [2] 32 bytes\n"
                "  version: 1n,          // [3] u64 little-endian, zero-padded to 32 bytes\n"
                "});\n"
                "```\n\n"
                "The Rust on-chain helper functions (`build_public_inputs`, etc. in `lib.rs`) "
                "produce the same ordering, so the circuit, client, and on-chain verifier stay in sync."
            )},
        ]
    },
    # ── Cost model ──────────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "How much does it cost to use clawd-zk on mainnet?"},
            {"role": "assistant", "content": (
                "Cost breakdown at ~$200/SOL (mainnet mid-2026):\n\n"
                "| Operation | Compute Units | Lamports | USD |\n"
                "|---|---|---|---|\n"
                "| Groth16 verify (~200k CU) | 200,000 | — | — |\n"
                "| Create 1 nullifier | 206,000 | 15,000 | $0.003 |\n"
                "| Write 1 attestation | 212,000 | 5,300 | $0.001 |\n"
                "| `publish_attestation` (full) | 618,000 | 25,000 | $0.005 |\n"
                "| `consume_attestation` | 310,000 | 5,000 | $0.001 |\n"
                "| `commit_encrypted_state` | 410,000 | 5,300 | $0.001 |\n"
                "| Publish + consume cycle | 1,200,000 | 50,000 | $0.010 |\n\n"
                "For comparison, a regular PDA-based nullifier costs **890,880 lamports** (~$0.18) "
                "per nullifier — 60× more expensive than the Light Protocol approach.\n\n"
                "You also need priority fees on mainnet (5,000–50,000 lamports depending on congestion) "
                "and Jito tips if you want MEV protection."
            )},
        ]
    },
    # ── SDK packages ─────────────────────────────────────────────────────────
    {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What npm packages does clawd-zk provide and what does each export?"},
            {"role": "assistant", "content": (
                "The `zk-primitives/` directory publishes two npm packages:\n\n"
                "**`@clawd/zk-client`** (low-level SDK)\n"
                "```typescript\n"
                "// Nullifier\n"
                "import { computeNullifier, computeNullifierBatch, deriveNullifierAddress,\n"
                "         NULLIFIER_PREFIX } from \"@clawd/zk-client/nullifier\";\n\n"
                "// Proof assembly\n"
                "import { buildPublishPublicInputs, buildConsumePublicInputs,\n"
                "         buildCommitPublicInputs, serializeProof,\n"
                "         verifyGroth16Offchain } from \"@clawd/zk-client/proof\";\n\n"
                "// Light Protocol helpers\n"
                "import { fetchValidityProofV2, fetchAddressTreeV2,\n"
                "         fetchRandomStateTreeV2, packAccounts } from \"@clawd/zk-client/state\";\n\n"
                "// Orchestrator\n"
                "import { ClawdZkClient } from \"@clawd/zk-client\";\n"
                "```\n\n"
                "**`@clawd/zk-agent`** (agent wrapper + CLI)\n"
                "```typescript\n"
                "import { ClawdZkAgent, routeIntent, dispatchRoute,\n"
                "         loadAgentConfig, KNOWN_INTENTS } from \"@clawd/zk-agent\";\n"
                "```\n"
                "Also ships `clawd-zk-agent` CLI binary with subcommands: "
                "`inspect`, `attest`, `commit`, `verify`, `nullifier`, `ask`.\n\n"
                "Install both:\n"
                "```bash\n"
                "npm install @clawd/zk-client @clawd/zk-agent\n"
                "```"
            )},
        ]
    },
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="Print examples without writing")
    p.add_argument("--eval", action="store_true", help="Append to eval file instead of seed")
    p.add_argument("--output", default=None, help="Custom output path (overrides --eval)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).parent.parent / "data"

    if args.output:
        out_path = Path(args.output)
    elif args.eval:
        out_path = root / "solana_clawd_eval.jsonl"
    else:
        out_path = root / "solana_clawd_seed.jsonl"

    if args.dry_run:
        for ex in ZK_EXAMPLES:
            print(json.dumps(ex, indent=2))
            print()
        print(f"[dry-run] {len(ZK_EXAMPLES)} examples — not written")
        return

    existing: list[dict] = []
    if out_path.exists():
        with open(out_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    existing.append(json.loads(line))

    # Dedup: skip examples whose user turn already exists in the file
    existing_user_turns = {
        ex["messages"][1]["content"]
        for ex in existing
        if len(ex.get("messages", [])) > 1
    }
    new_examples = [
        ex for ex in ZK_EXAMPLES
        if ex["messages"][1]["content"] not in existing_user_turns
    ]

    if not new_examples:
        print(f"[skip] All {len(ZK_EXAMPLES)} ZK examples already in {out_path}")
        return

    with open(out_path, "a") as f:
        for ex in new_examples:
            f.write(json.dumps(ex) + "\n")

    print(f"[ok] Appended {len(new_examples)} ZK examples to {out_path}")
    print(f"     Total examples now: {len(existing) + len(new_examples)}")


if __name__ == "__main__":
    main()
