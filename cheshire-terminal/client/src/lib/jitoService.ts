import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';

const JITO_VALIDATORS = [
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
];

const ENDPOINTS = [
  "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
];

export class JitoService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  private async getRandomValidator(): Promise<PublicKey> {
    const validatorAddress = JITO_VALIDATORS[Math.floor(Math.random() * JITO_VALIDATORS.length)];
    return new PublicKey(validatorAddress);
  }

  async executeAndConfirm(
    transaction: VersionedTransaction,
    payer: Keypair,
    latestBlockhash: { blockhash: string; lastValidBlockHeight: number },
    jitoFee: number
  ): Promise<{ confirmed: boolean; signature: string | null }> {
    try {
      const jitoValidatorWallet = await this.getRandomValidator();
      console.log("Selected Jito Validator:", jitoValidatorWallet.toBase58());

      // Create fee transaction
      const feeMessage = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: jitoValidatorWallet,
            lamports: jitoFee,
          }),
        ],
      }).compileToV0Message();

      const feeTransaction = new VersionedTransaction(feeMessage);
      feeTransaction.sign([payer]);

      const jitoTxSignature = bs58.encode(feeTransaction.signatures[0]);
      const serializedFeeTransaction = bs58.encode(feeTransaction.serialize());
      const serializedMainTransaction = bs58.encode(transaction.serialize());

      const bundle = [serializedFeeTransaction, serializedMainTransaction];

      // Send to all Jito validators
      const requests = ENDPOINTS.map(url =>
        axios.post(url, {
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [bundle],
        })
      );

      console.log("Sending transaction to Jito validators...");
      const responses = await Promise.all(requests.map(p => p.catch(e => e)));
      const successfulResponses = responses.filter(r => !(r instanceof Error));

      if (successfulResponses.length > 0) {
        console.log("Transaction accepted by Jito validator");
        return await this.confirmTransaction(jitoTxSignature, latestBlockhash);
      }

      console.log("No Jito validators accepted the transaction");
      return { confirmed: false, signature: jitoTxSignature };

    } catch (error) {
      console.error("Error executing Jito transaction:", error);
      return { confirmed: false, signature: null };
    }
  }

  private async confirmTransaction(
    signature: string,
    latestBlockhash: { blockhash: string; lastValidBlockHeight: number }
  ): Promise<{ confirmed: boolean; signature: string }> {
    console.log("Confirming transaction...");
    const confirmation = await this.connection.confirmTransaction({
      signature,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      blockhash: latestBlockhash.blockhash,
    }, "confirmed");

    return {
      confirmed: !confirmation.value.err,
      signature
    };
  }
}
