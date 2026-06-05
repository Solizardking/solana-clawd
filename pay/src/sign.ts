/**
 * pay/src/sign.ts
 *
 * Core Solana transaction signing and submission logic for Pay.
 * Shared by CLI (`pay sign <BASE64_TX>`) and MCP (`sign_transaction`) paths.
 *
 * Decodes base64 legacy/v0 transactions, signs the Pay account slot,
 * preserves all other signatures, and submits via RPC.
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Connection,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import * as bs58 from "bs58";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SignConfig {
  /** Base58 private key for the Pay account */
  privateKey: string;
  /** Solana RPC URL (defaults to mainnet-beta) */
  rpcUrl?: string;
  /** Network cluster (mainnet-beta, devnet, testnet) */
  network?: string;
  /** Commitment level for confirmation */
  commitment?: "processed" | "confirmed" | "finalized";
}

export interface SignResult {
  /** The confirmed transaction signature */
  signature: string;
  /** The signer's public key */
  signer: string;
  /** Network the transaction was submitted on */
  network: string;
  /** Number of required signers in the transaction */
  requiredSigners: number;
  /** Whether this was a legacy or versioned (v0) transaction */
  version: "legacy" | "v0";
}

export interface SignError {
  error: string;
  code: SignErrorCode;
  detail?: string;
}

export enum SignErrorCode {
  INVALID_BASE64 = "invalid_base64",
  INVALID_TRANSACTION = "invalid_transaction",
  NOT_REQUIRED_SIGNER = "not_required_signer",
  SIGNING_FAILED = "signing_failed",
  SUBMISSION_FAILED = "submission_failed",
  MISSING_PRIVATE_KEY = "missing_private_key",
  DECODE_FAILED = "decode_failed",
}

// ─── Transaction Submit Interface (injectable for testing) ──────────────────

export interface TransactionSubmitter {
  submit(transaction: Transaction | VersionedTransaction, connection: Connection): Promise<string>;
}

/** Default submitter using actual RPC */
export class RpcSubmitter implements TransactionSubmitter {
  async submit(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
  ): Promise<string> {
    if (transaction instanceof Transaction) {
      return sendAndConfirmTransaction(connection, transaction, [], {
        commitment: "confirmed",
      });
    }
    // VersionedTransaction submission
    const rawTx = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  }
}

// ─── Core Signing Logic ─────────────────────────────────────────────────────

function decodeBase64Transaction(encoded: string): Transaction | VersionedTransaction {
  let buffer: Uint8Array;
  try {
    buffer = Uint8Array.from(Buffer.from(encoded, "base64"));
  } catch {
    throw Object.assign(
      new Error("Failed to decode base64 transaction input"),
      { code: SignErrorCode.INVALID_BASE64 },
    );
  }

  if (buffer.length === 0) {
    throw Object.assign(
      new Error("Empty transaction bytes"),
      { code: SignErrorCode.DECODE_FAILED },
    );
  }

  // Try legacy first, then versioned
  try {
    return Transaction.from(buffer);
  } catch {
    // Fall through to versioned
  }

  try {
    return VersionedTransaction.deserialize(buffer);
  } catch (err: any) {
    throw Object.assign(
      new Error(`Cannot decode transaction: ${err?.message ?? "unknown error"}`),
      { code: SignErrorCode.DECODE_FAILED, detail: err?.message },
    );
  }
}

function getTransactionVersion(tx: Transaction | VersionedTransaction): "legacy" | "v0" {
  if (tx instanceof Transaction) return "legacy";
  return "v0";
}

function getRequiredSignatures(tx: Transaction | VersionedTransaction): PublicKey[] {
  if (tx instanceof Transaction) {
    // Legacy: compile message to get required signers
    const message = tx.compileMessage();
    const { staticAccountKeys } = message;
    const numRequired = message.header.numRequiredSignatures;
    return staticAccountKeys.slice(0, numRequired);
  }
  // Versioned
  const message = tx.message;
  const staticAccountKeys = message.staticAccountKeys;
  const numRequired = message.header.numRequiredSignatures;
  return staticAccountKeys.slice(0, numRequired);
}

function isPaySigner(
  payPubkey: PublicKey,
  requiredSigners: PublicKey[],
): { isSigner: boolean; index: number } {
  const index = requiredSigners.findIndex((pk) => pk.equals(payPubkey));
  return { isSigner: index >= 0, index };
}

async function signTransaction(
  tx: Transaction | VersionedTransaction,
  keypair: Keypair,
): Promise<Transaction | VersionedTransaction> {
  const payPubkey = keypair.publicKey;
  const requiredSigners = getRequiredSignatures(tx);
  const { isSigner, index } = isPaySigner(payPubkey, requiredSigners);

  if (!isSigner) {
    throw Object.assign(
      new Error(
        `Selected pay account ${payPubkey.toBase58()} is not a required signer for this transaction. ` +
        `Required signers: ${requiredSigners.map((s) => s.toBase58()).join(", ")}`,
      ),
      { code: SignErrorCode.NOT_REQUIRED_SIGNER },
    );
  }

  if (tx instanceof Transaction) {
    // Legacy transaction signing
    try {
      tx.partialSign(keypair);
    } catch (err: any) {
      throw Object.assign(
        new Error(`Transaction signing failed: ${err?.message ?? "unknown error"}`),
        { code: SignErrorCode.SIGNING_FAILED, detail: err?.message },
      );
    }
  } else {
    // Versioned transaction: sign message bytes
    try {
      const messageBytes = tx.message.serialize();
      const signature = keypair.sign(Buffer.from(messageBytes)); // nacl sign returns Uint8Array
      tx.signatures[index] = Buffer.from(signature);
    } catch (err: any) {
      throw Object.assign(
        new Error(`Transaction signing failed: ${err?.message ?? "unknown error"}`),
        { code: SignErrorCode.SIGNING_FAILED, detail: err?.message },
      );
    }
  }

  return tx;
}

// ─── Main Sign + Submit Function ────────────────────────────────────────────

export async function signAndSubmit(
  transactionBase64: string,
  config: SignConfig,
  submitter?: TransactionSubmitter,
): Promise<SignResult> {
  // 1. Validate config
  if (!config.privateKey) {
    throw Object.assign(
      new Error("Private key not configured. Set PAY_PRIVATE_KEY or pass it directly."),
      { code: SignErrorCode.MISSING_PRIVATE_KEY },
    );
  }

  // 2. Decode keypair
  let keypair: Keypair;
  try {
    const secretKey = bs58.decode(config.privateKey);
    keypair = Keypair.fromSecretKey(secretKey);
  } catch (err: any) {
    throw Object.assign(
      new Error(`Invalid private key: ${err?.message ?? "unknown error"}`),
      { code: SignErrorCode.MISSING_PRIVATE_KEY },
    );
  }

  // 3. Decode transaction
  const tx = decodeBase64Transaction(transactionBase64);
  const version = getTransactionVersion(tx);
  const requiredSigners = getRequiredSignatures(tx);

  // 4. Verify signer required
  const { isSigner } = isPaySigner(keypair.publicKey, requiredSigners);
  if (!isSigner) {
    throw Object.assign(
      new Error(
        `Selected pay account ${keypair.publicKey.toBase58()} is not a required signer. ` +
        `Required: ${requiredSigners.map((s) => s.toBase58()).join(", ")}`,
      ),
      { code: SignErrorCode.NOT_REQUIRED_SIGNER },
    );
  }

  // 5. Sign
  const signedTx = await signTransaction(tx, keypair);

  // 6. Submit
  const network = config.network ?? "mainnet-beta";
  const rpcUrl = config.rpcUrl ?? clusterApiUrl(network as any);
  const connection = new Connection(rpcUrl, config.commitment ?? "confirmed");

  const actualSubmitter = submitter ?? new RpcSubmitter();

  let signature: string;
  try {
    signature = await actualSubmitter.submit(signedTx, connection);
  } catch (err: any) {
    throw Object.assign(
      new Error(`Transaction submission failed: ${err?.message ?? "unknown error"}`),
      { code: SignErrorCode.SUBMISSION_FAILED, detail: err?.message },
    );
  }

  return {
    signature,
    signer: keypair.publicKey.toBase58(),
    network,
    requiredSigners: requiredSigners.length,
    version,
  };
}

// ─── Utility: Check if a transaction needs signing before submission ────────

export function checkIncompleteSigners(
  tx: Transaction | VersionedTransaction,
): PublicKey[] {
  const incomplete: PublicKey[] = [];

  if (tx instanceof Transaction) {
    const requiredSigners = getRequiredSignatures(tx);
    for (let i = 0; i < requiredSigners.length; i++) {
      if (tx.signatures[i]?.signature === null) {
        incomplete.push(requiredSigners[i]);
      }
    }
  } else {
    const requiredSigners = getRequiredSignatures(tx);
    const allZeros = Buffer.alloc(64);
    for (let i = 0; i < requiredSigners.length; i++) {
      if (!tx.signatures[i] || tx.signatures[i].equals(allZeros)) {
        incomplete.push(requiredSigners[i]);
      }
    }
  }

  return incomplete;
}