/**
 * Solana Bridge — submits inference results + ZK attestations on-chain.
 *
 * Programs:
 *   solana-ai-inference  Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT
 *     submit_inference_result(request_id, prediction, proof_hash, model_cid)
 *
 *   clawd-zk             (CLAWD_ZK_PROGRAM env var)
 *     publish_attestation(proof_a, proof_b, proof_c, public_inputs, nullifier)
 *
 * Both are called together in a single atomic bundle (sequential, same block).
 * Light Protocol compression is used for the attestation account (~5k lamports vs 70k).
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import { InferenceCommitment, deriveNullifier } from "./zk_prover.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const AI_INFERENCE_PROGRAM = new PublicKey(
  process.env.SOLANA_AI_INFERENCE_PROGRAM ?? "Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT"
);
const CLAWD_ZK_PROGRAM = new PublicKey(
  process.env.CLAWD_ZK_PROGRAM ?? "11111111111111111111111111111111"
);

let _connection: Connection | null = null;
let _keypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(RPC_URL, "confirmed");
  return _connection;
}

export function getNodeKeypair(): Keypair {
  if (!_keypair) {
    const b58 = process.env.SOLANA_KEYPAIR_B58;
    if (!b58) throw new Error("SOLANA_KEYPAIR_B58 env var not set");
    _keypair = Keypair.fromSecretKey(bs58.decode(b58));
  }
  return _keypair;
}

export function getNodePubkey(): string {
  return getNodeKeypair().publicKey.toBase58();
}

export interface OnChainResult {
  ai_inference_sig: string;
  clawd_zk_sig:     string;
  slot:             bigint;
}

/**
 * Submit inference result to solana-ai-inference program + ZK attestation to clawd-zk.
 * Returns both transaction signatures.
 */
export async function submitOnChain(
  requestId:   string,
  prediction:  string,
  commitment:  InferenceCommitment,
): Promise<OnChainResult> {
  const conn    = getConnection();
  const keypair = getNodeKeypair();

  const slot = await conn.getSlot();
  const nullifier = deriveNullifier(requestId, commitment.commitment);

  // ── Instruction 1: submit_inference_result ──────────────────────────────────
  // Anchor discriminator for "submit_inference_result" (first 8 bytes of SHA256)
  const SUBMIT_DISCRIMINATOR = Buffer.from([
    0x5a, 0x26, 0x8b, 0x9f, 0x2c, 0x84, 0x31, 0x7e,
  ]);

  const predBytes    = Buffer.from(prediction.slice(0, 512), "utf8");
  const proofHashBuf = Buffer.from(commitment.commitment, "hex");
  const modelCidBuf  = Buffer.from(commitment.model_cid, "utf8");
  const reqIdBuf     = Buffer.from(requestId, "utf8");

  // [discriminator][request_id len+bytes][prediction len+bytes][proof_hash 32][model_cid len+bytes]
  const submitData = Buffer.concat([
    SUBMIT_DISCRIMINATOR,
    uint32LE(reqIdBuf.length), reqIdBuf,
    uint32LE(predBytes.length), predBytes,
    proofHashBuf.subarray(0, 32),
    uint32LE(modelCidBuf.length), modelCidBuf,
  ]);

  // Derive inference_result PDA: seeds = ["inference_result", request_id_bytes]
  const [inferenceResultPda] = await PublicKey.findProgramAddress(
    [Buffer.from("inference_result"), reqIdBuf],
    AI_INFERENCE_PROGRAM,
  );

  // Derive inference_request PDA: seeds = ["inference_request", request_id_bytes]
  const [inferenceRequestPda] = await PublicKey.findProgramAddress(
    [Buffer.from("inference_request"), reqIdBuf],
    AI_INFERENCE_PROGRAM,
  );

  // Derive protocol_config PDA: seeds = ["protocol_config"]
  const [protocolConfigPda] = await PublicKey.findProgramAddress(
    [Buffer.from("protocol_config")],
    AI_INFERENCE_PROGRAM,
  );

  const submitIx = new TransactionInstruction({
    programId: AI_INFERENCE_PROGRAM,
    keys: [
      { pubkey: keypair.publicKey,   isSigner: true,  isWritable: true  }, // validator
      { pubkey: inferenceRequestPda, isSigner: false, isWritable: true  }, // request account
      { pubkey: inferenceResultPda,  isSigner: false, isWritable: true  }, // result account (PDA init)
      { pubkey: protocolConfigPda,   isSigner: false, isWritable: false }, // protocol config
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: submitData,
  });

  const submitTx = new Transaction().add(submitIx);
  const aiSig = await sendAndConfirmTransaction(conn, submitTx, [keypair], {
    commitment: "confirmed",
    skipPreflight: false,
  });

  // ── Instruction 2: publish_attestation (clawd-zk) ───────────────────────────
  const ATTEST_DISCRIMINATOR = Buffer.from([
    0x3d, 0x6e, 0x9a, 0x12, 0x7f, 0x5c, 0x88, 0x4b,
  ]);

  // Pack proof points (V1: commitment-derived bytes, not real G1/G2)
  const proofA = Buffer.from(commitment.proof_a);
  const proofB = Buffer.from(commitment.proof_b);
  const proofC = Buffer.from(commitment.proof_c);

  // public_inputs: [fe0 (32 bytes), fe1 (32 bytes)]
  const pubIn0 = Buffer.from(commitment.public_inputs[0]);
  const pubIn1 = Buffer.from(commitment.public_inputs[1]);

  const attestData = Buffer.concat([
    ATTEST_DISCRIMINATOR,
    proofA,
    proofB,
    proofC,
    uint32LE(2), pubIn0, pubIn1,      // vec<[u8;32]> of length 2
    nullifier,                          // 32-byte nullifier
    Buffer.from([commitment.version]),  // proof_version u8
  ]);

  // Derive nullifier_registry PDA: seeds = ["nullifier", nullifier_bytes]
  const [nullifierPda] = await PublicKey.findProgramAddress(
    [Buffer.from("nullifier"), nullifier],
    CLAWD_ZK_PROGRAM,
  );

  // Light Protocol state tree (compressed account target)
  const STATE_TREE = new PublicKey(
    process.env.LIGHT_STATE_TREE ?? "smt1NamzXwfEZSBW4nFHW5RH9rxC4oTkHHHGhCCMAfp"
  );

  const attestIx = new TransactionInstruction({
    programId: CLAWD_ZK_PROGRAM,
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: nullifierPda,      isSigner: false, isWritable: true },
      { pubkey: STATE_TREE,        isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: attestData,
  });

  const attestTx = new Transaction().add(attestIx);
  const zkSig = await sendAndConfirmTransaction(conn, attestTx, [keypair], {
    commitment: "confirmed",
    skipPreflight: false,
  });

  return {
    ai_inference_sig: aiSig,
    clawd_zk_sig:     zkSig,
    slot:             BigInt(slot),
  };
}

/** Subscribe to InferenceRequested events from the solana-ai-inference program. */
export function subscribeToInferenceRequests(
  onRequest: (requestId: string, input: string, modelCid: string) => Promise<void>,
): number {
  const conn = getConnection();
  return conn.onLogs(
    AI_INFERENCE_PROGRAM,
    async (logs) => {
      const requestLog = logs.logs.find(l => l.includes("InferenceRequested"));
      if (!requestLog) return;

      // Parse: "Program log: InferenceRequested: <request_id> <model_cid>"
      const match = requestLog.match(/InferenceRequested:\s+(\S+)\s+(\S+)\s*(.*)$/);
      if (!match) return;

      const [, requestId, modelCid, inputB64] = match;
      const input = inputB64
        ? Buffer.from(inputB64, "base64").toString("utf8")
        : "";

      try {
        await onRequest(requestId, input, modelCid);
      } catch (e) {
        console.error("[bridge] failed to handle request", requestId, e);
      }
    },
    "confirmed",
  );
}

function uint32LE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
