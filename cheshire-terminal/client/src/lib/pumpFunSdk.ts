// @ts-nocheck
import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PriorityFee, CreateTokenMetadata, TransactionResult } from "./types";

export const PROGRAM_ID = "PUMPFuNHhAiVzWrQEPAYXvTYKNeJhWqw5eKnRJHct84";
export const MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
export const BONDING_CURVE_SEED = "bonding-curve";
export const METADATA_SEED = "metadata";

export class PumpFunSDK {
  public connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async createAndBuy(
    authority: Keypair,
    mint: Keypair,
    metadata: CreateTokenMetadata,
    initialBuyAmount: bigint,
    slippageBasisPoints: bigint
  ): Promise<TransactionResult> {
    try {
      console.log('Creating token with params:', {
        authority: authority.publicKey.toBase58(),
        mint: mint.publicKey.toBase58(),
        name: metadata.name,
        symbol: metadata.symbol,
        initialBuyAmount: initialBuyAmount.toString(),
        slippageBasisPoints: slippageBasisPoints.toString()
      });

      // Convert file to base64 for API request
      const fileBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]); // Remove data URL prefix
        };
        reader.readAsDataURL(metadata.file);
      });

      const response = await fetch("/api/tokens/launch/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          mint: mint.publicKey.toBase58(),
          authority: authority.publicKey.toBase58(),
          name: metadata.name,
          symbol: metadata.symbol,
          description: metadata.description,
          file: fileBase64,
          initialBuyAmount: initialBuyAmount.toString(),
          slippageBasisPoints: slippageBasisPoints.toString(),
          twitter: metadata.twitter,
          telegram: metadata.telegram,
          website: metadata.website
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Token launch preparation failed:', errorData);
        throw new Error(`Failed to prepare token launch: ${response.status} ${errorData}`);
      }

      const responseData = await response.json();
      if (!responseData || !responseData.transaction) {
        throw new Error('Invalid response data from token launch preparation');
      }

      console.log('Successfully prepared token launch transaction');

      return {
        success: true,
        signature: responseData.signature,
        transaction: responseData.transaction,
        tokenAddress: mint.publicKey.toBase58(),
        url: `https://solscan.io/token/${mint.publicKey.toBase58()}`
      };

    } catch (error) {
      console.error('Error in createAndBuy:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred during token launch",
      };
    }
  }

  async prepareTokenLaunch(params: TokenLaunchParams): Promise<Transaction> {
    try {
      // Create token launch transaction request
      const response = await fetch("/api/tokens/launch/prepare", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          programId: params.programId.toBase58(),
          mint: params.mint.toBase58(),
          authority: params.authority.toBase58(),
          name: params.name,
          symbol: params.symbol,
          uri: params.uri,
          initialSupply: params.initialSupply,
          decimals: params.decimals
        })
      });

      if (!response.ok) {
        throw new Error("Failed to prepare token launch transaction");
      }

      const { transaction } = await response.json();
      return Transaction.from(Buffer.from(transaction, 'base64'));

    } catch (error) {
      throw new Error(`Failed to prepare token launch: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async prepareBuyTransaction(params: BuyParams): Promise<Transaction> {
    try {
      const response = await fetch("/api/tokens/buy/prepare", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          programId: params.programId.toBase58(),
          tokenMint: params.tokenMint.toBase58(),
          wallet: params.wallet.toBase58(),
          amountInSol: params.amountInSol,
          slippageBps: params.slippageBps
        })
      });

      if (!response.ok) {
        throw new Error("Failed to prepare buy transaction");
      }

      const { transaction } = await response.json();
      return Transaction.from(Buffer.from(transaction, 'base64'));
    } catch (error) {
      throw new Error(`Failed to prepare buy transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async prepareSellTransaction(params: SellParams): Promise<Transaction> {
    try {
      const response = await fetch("/api/tokens/sell/prepare", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          programId: params.programId.toBase58(),
          tokenMint: params.tokenMint.toBase58(),
          wallet: params.wallet.toBase58(),
          amountTokens: params.amountTokens,
          slippageBps: params.slippageBps
        })
      });

      if (!response.ok) {
        throw new Error("Failed to prepare sell transaction");
      }

      const { transaction } = await response.json();
      return Transaction.from(Buffer.from(transaction, 'base64'));
    } catch (error) {
      throw new Error(`Failed to prepare sell transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async executeTransactions(
    transactions: Transaction[],
    signers: Keypair[] = [],
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    try {
      // Submit transactions for execution
      const response = await fetch("/api/tokens/execute", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          transactions: transactions.map(tx => tx.serialize().toString('base64')),
          signers: signers.map(signer => Buffer.from(signer.secretKey).toString('base64')),
          options: {
            skipPreflight: options.skipPreflight || false,
            maxRetries: options.maxRetries || 3
          }
        })
      });

      if (!response.ok) {
        throw new Error("Failed to execute transactions");
      }

      const result = await response.json();

      return {
        success: true,
        signature: result.signature,
        transaction: result.transaction
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // Helper function to calculate expected token amounts based on AMM formula
  async getExpectedTokenAmount(solAmount: bigint): Promise<bigint> {
    try {
      const response = await fetch(`/api/tokens/calculate-amount?solAmount=${solAmount.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to calculate token amount");
      }
      const { tokenAmount } = await response.json();
      return BigInt(tokenAmount);
    } catch (error) {
      throw new Error("Failed to calculate expected token amount");
    }
  }
}

interface TokenLaunchParams {
  programId: PublicKey;
  mint: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  initialSupply: number;
  decimals: number;
}

interface TokenTradeParams {
  programId: PublicKey;
  tokenMint: PublicKey;
  wallet: PublicKey;
  slippageBps: number;
}

interface BuyParams extends TokenTradeParams {
  amountInSol: number;
}

interface SellParams extends TokenTradeParams {
  amountTokens: number;
}

interface TransactionOptions {
  skipPreflight?: boolean;
  maxRetries?: number;
}
