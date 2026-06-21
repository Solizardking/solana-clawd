/**
 * ZK Prover — Groth16 commitment chain for verifiable inference.
 *
 * V1: SHA-256 commitment: C = H(model_cid || H(input) || H(output) || node_pubkey || slot)
 *     Submitted as `public_inputs` to clawd-zk `publish_attestation`.
 *     Node keypair signs the commitment → verifiable off-chain, anchored on-chain.
 *
 * V2 (roadmap): snarkjs Groth16 circuit that proves output = f(model_cid, input)
 *     without revealing the model weights — true ZK verifiable inference.
 */
import { createHash, createHmac } from "node:crypto";

export interface InferenceCommitment {
  version:        number;
  model_cid:      string;
  input_hash:     string;
  output_hash:    string;
  node_pubkey:    string;
  slot:           bigint;
  timestamp_ms:   number;
  commitment:     string;   // hex — this is the "proof hash" stored on-chain
  proof_a:        number[]; // 32-byte placeholder (V1); real G1 point in V2
  proof_b:        number[]; // 64-byte placeholder (V1); real G2 point in V2
  proof_c:        number[]; // 32-byte placeholder (V1); real G1 point in V2
  public_inputs:  number[][]; // commitment split into 32-byte LE field elements
}

export function hashBytes(data: string | Uint8Array): Buffer {
  return createHash("sha256").update(data).digest();
}

export function buildCommitment(
  modelCid:    string,
  inputText:   string,
  outputText:  string,
  nodePubkey:  string,
  slot:        bigint,
): InferenceCommitment {
  const inputHash  = hashBytes(inputText);
  const outputHash = hashBytes(outputText);

  // C = SHA256(model_cid_bytes || input_hash || output_hash || node_pubkey_bytes || slot_le8)
  const slotBuf = Buffer.alloc(8);
  slotBuf.writeBigUInt64LE(slot);

  const commitBuf = createHash("sha256")
    .update(Buffer.from(modelCid, "utf8"))
    .update(inputHash)
    .update(outputHash)
    .update(Buffer.from(nodePubkey, "utf8"))
    .update(slotBuf)
    .digest();

  const commitHex = commitBuf.toString("hex");

  // Split 32-byte commitment into two 16-byte LE field elements for clawd-zk
  const fe0 = Array.from(commitBuf.subarray(0, 16)).map((b, i) => {
    const out = new Array(32).fill(0);
    out[i] = b;
    return out;
  }).flat().slice(0, 32);
  const fe1 = Array.from(commitBuf.subarray(16, 32)).map((b, i) => {
    const out = new Array(32).fill(0);
    out[i] = b;
    return out;
  }).flat().slice(0, 32);

  // V1: proof points are commitment-derived deterministic bytes (not real G1/G2)
  // The on-chain verifier skips Groth16 check when proof_version = 1 and
  // validates only the commitment hash against public_inputs.
  const proof_a = Array.from(commitBuf);
  const proof_b = Array.from(Buffer.concat([commitBuf, commitBuf]));
  const proof_c = Array.from(hashBytes(commitBuf));

  return {
    version:        1,
    model_cid:      modelCid,
    input_hash:     inputHash.toString("hex"),
    output_hash:    outputHash.toString("hex"),
    node_pubkey:    nodePubkey,
    slot,
    timestamp_ms:   Date.now(),
    commitment:     commitHex,
    proof_a,
    proof_b,
    proof_c,
    public_inputs:  [fe0, fe1],
  };
}

export function deriveNullifier(requestId: string, commitment: string): Buffer {
  // Nullifier prevents the same inference from being replayed / double-settled
  return createHmac("sha256", Buffer.from(commitment, "hex"))
    .update(requestId)
    .digest();
}
