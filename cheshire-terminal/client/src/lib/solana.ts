// @ts-nocheck
import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { PumpFunSDK } from "./pumpFunSdk";
import { createTokenMetadata, uploadMetadata, TokenMetadata } from "@shared/mplTokenMetadataHelper";
import { resolveBrowserRpcUrl } from "./runtimeConfig";

const RPC_URL = resolveBrowserRpcUrl();
const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000 // 60 seconds
});

const sdk = new PumpFunSDK(connection);

// Production program IDs
const TOKEN_LAUNCHER_PROGRAM_ID = new PublicKey("funvWGBmpr8N7pTNqpxkWPgWnQbL3Yr5vzCHNJT2YkL");
const AMM_PROGRAM_ID = new PublicKey("PUMPFuNHhAiVzWrQEPAYXvTYKNeJhWqw5eKnRJHct84");

export async function launchToken(
  name: string,
  symbol: string,
  description: string,
  imageUrl: string,
  wallet: PublicKey,
  initialSupply: number = 1_000_000,
  decimals: number = 6
) {
  try {
    // Create token metadata
    const metadata: TokenMetadata = {
      name,
      symbol,
      description,
      image: imageUrl,
      attributes: [
        { trait_type: "Category", value: "Meme Token" },
        { trait_type: "Network", value: "Solana" },
        { trait_type: "Launch Platform", value: "FunPump" }
      ],
      properties: {
        files: [{ uri: imageUrl, type: "image/png" }],
        category: "image"
      }
    };

    // Upload metadata to decentralized storage
    const metadataUri = await uploadMetadata(metadata);

    // Generate mint account
    const mint = Keypair.generate();

    // Prepare launch transaction
    const launchTx = await sdk.prepareTokenLaunch({
      programId: TOKEN_LAUNCHER_PROGRAM_ID,
      mint: mint.publicKey,
      authority: wallet,
      name,
      symbol,
      uri: metadataUri,
      initialSupply,
      decimals
    });

    // Create metadata account transaction
    const metadataTx = await createTokenMetadata(
      mint.publicKey,
      wallet,
      metadata,
      wallet
    );

    // Execute transactions with proper error handling
    const result = await sdk.executeTransactions([launchTx, metadataTx], [mint], {
      skipPreflight: false,
      maxRetries: 3
    });

    if (!result.success) {
      throw new Error(result.error?.toString() || "Transaction failed");
    }

    return {
      signature: result.signature,
      mintAddress: mint.publicKey.toBase58(),
      metadataUri
    };
  } catch (error) {
    console.error("Token launch error:", error);
    throw error;
  }
}

export async function buyTokens(
  tokenMint: PublicKey,
  amountInSol: number,
  wallet: PublicKey
) {
  try {
    const buyTx = await sdk.prepareBuyTransaction({
      programId: AMM_PROGRAM_ID,
      tokenMint,
      amountInSol,
      wallet,
      slippageBps: 100 // 1% slippage tolerance
    });

    const result = await sdk.executeTransactions([buyTx], [], {
      skipPreflight: false,
      maxRetries: 3
    });

    if (!result.success) {
      throw new Error(result.error?.toString() || "Buy transaction failed");
    }

    return {
      signature: result.signature,
      amount: amountInSol
    };
  } catch (error) {
    console.error("Token buy error:", error);
    throw error;
  }
}

export async function sellTokens(
  tokenMint: PublicKey,
  amountTokens: number,
  wallet: PublicKey
) {
  try {
    const sellTx = await sdk.prepareSellTransaction({
      programId: AMM_PROGRAM_ID,
      tokenMint,
      amountTokens,
      wallet,
      slippageBps: 100 // 1% slippage tolerance
    });

    const result = await sdk.executeTransactions([sellTx], [], {
      skipPreflight: false,
      maxRetries: 3
    });

    if (!result.success) {
      throw new Error(result.error?.toString() || "Sell transaction failed");
    }

    return {
      signature: result.signature,
      amount: amountTokens
    };
  } catch (error) {
    console.error("Token sell error:", error);
    throw error;
  }
}
