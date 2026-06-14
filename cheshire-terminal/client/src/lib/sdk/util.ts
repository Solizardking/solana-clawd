// @ts-nocheck
import {
  Commitment,
  Connection,
  Finality,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { PriorityFee, TransactionResult } from "./types";
import { HeliusService } from "../heliusService";

export const DEFAULT_COMMITMENT: Commitment = "confirmed";
export const DEFAULT_FINALITY: Finality = "confirmed";

export function calculateWithSlippageBuy(
  amount: bigint,
  slippageBasisPoints: bigint
): bigint {
  return amount + (amount * slippageBasisPoints) / 10000n;
}

export function calculateWithSlippageSell(
  amount: bigint,
  slippageBasisPoints: bigint
): bigint {
  return amount - (amount * slippageBasisPoints) / 10000n;
}

export async function sendTx(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  feePayer: PublicKey,
  signers: Array<any>,
  priorityFees?: PriorityFee,
  commitment: Commitment = DEFAULT_COMMITMENT,
  finality: Finality = DEFAULT_FINALITY
): Promise<TransactionResult> {
  if (priorityFees) {
    const priorityFeeIx = await connection.getPriorityFeeEstimate(priorityFees);
    const messageV0 = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions: [
        {
          programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
          keys: [],
          data: Buffer.from([]),
        },
      ],
    }).compileToV0Message();
    transaction = new VersionedTransaction(messageV0);
  }

  try {
    if (transaction instanceof VersionedTransaction) {
      transaction.sign(signers);
    } else {
      transaction.partialSign(...signers);
    }
    const { signature } = await HeliusService.sendSignedTransaction(
      Buffer.from(transaction.serialize()).toString("base64"),
      { skipPreflight: true, maxRetries: 0 },
    );

    await connection.confirmTransaction(
      {
        signature,
        blockhash: (await connection.getLatestBlockhash(commitment)).blockhash,
        lastValidBlockHeight: (
          await connection.getLatestBlockhash(commitment)
        ).lastValidBlockHeight,
      },
      finality
    );

    return {
      success: true,
      signature,
      transaction,
    };
  } catch (error) {
    console.error('Error sending transaction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
