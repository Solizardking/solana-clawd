// @ts-nocheck
import {
  AnchorProvider,
  type Program as AnchorProgram,
} from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import { AMM } from "./AMM";

// Constants
export const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const BONDING_CURVE_SEED = "bonding-curve";
export const METADATA_SEED = "metadata";
export const MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

export interface CreateTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  file: Blob;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export class PumpFunSDK {
  public connection: Connection;
  private amm: AMM | null = null;
  private eventListeners: Map<string, number> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  // Token Launch Transaction Creation
  async createLaunchTransaction(
    creator: PublicKey,
    metadata: CreateTokenMetadata,
    initialBuyAmount: bigint
  ): Promise<{ transaction: Transaction; mint: Keypair }> {
    try {
      const mint = Keypair.generate();

      // Upload metadata to IPFS
      const tokenMetadata = await this.createTokenMetadata(metadata);

      // Create token
      const createTx = await this.getCreateInstructions(
        creator,
        metadata.name,
        metadata.symbol,
        tokenMetadata.metadataUri,
        mint
      );

      // Combine transactions
      const transaction = new Transaction().add(createTx);

      // Add initial buy if specified
      if (initialBuyAmount > 0n) {
        const buyTx = await this.getBuyInstructions(
          creator,
          mint.publicKey,
          initialBuyAmount
        );
        transaction.add(buyTx);
      }

      return { transaction, mint };
    } catch (error) {
      console.error("Error creating launch transaction:", error);
      throw new Error("Failed to create token launch transaction");
    }
  }

  // AMM Integration with lazy loading
  async getExpectedTokenAmount(solAmount: bigint): Promise<bigint> {
    const amm = await this.getAMM();
    return amm.getBuyPrice(solAmount);
  }

  async getExpectedSellAmount(tokenAmount: bigint): Promise<bigint> {
    const amm = await this.getAMM();
    return amm.getSellPrice(tokenAmount);
  }

  private async getAMM(): Promise<AMM> {
    if (!this.amm) {
      const reserves = await this.getReserves();
      this.amm = AMM.fromReserves(reserves);
    }
    return this.amm;
  }

  private async getReserves() {
    try {
      // TODO: Implement actual chain reserve fetching
      // For now, return default values for testing
      return {
        virtualSolReserves: 1000000n,
        virtualTokenReserves: 1000000n,
        realSolReserves: 0n,
        realTokenReserves: 1000000n,
        initialVirtualTokenReserves: 1000000n
      };
    } catch (error) {
      console.error("Error fetching reserves:", error);
      throw new Error("Failed to fetch token reserves");
    }
  }

  private async getCreateInstructions(
    creator: PublicKey,
    name: string,
    symbol: string,
    uri: string,
    mint: Keypair
  ): Promise<Transaction> {
    const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);

    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(METADATA_SEED),
        mplTokenMetadata.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      mplTokenMetadata
    );

    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint.publicKey,
      this.getBondingCurvePDA(mint.publicKey),
      true
    );

    // Create token instruction
    const transaction = new Transaction();
    // Add create token instruction
    // Note: Actual implementation would use the program.methods.create(...) call

    return transaction;
  }

  private async getBuyInstructions(
    buyer: PublicKey,
    mint: PublicKey,
    solAmount: bigint
  ): Promise<Transaction> {
    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      this.getBondingCurvePDA(mint),
      true
    );

    // Create buy transaction
    const transaction = new Transaction();
    // Add buy instruction
    // Note: Actual implementation would use the program.methods.buy(...) call

    return transaction;
  }

  private getBondingCurvePDA(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      new PublicKey(PROGRAM_ID)
    )[0];
  }

  private async createTokenMetadata(metadata: CreateTokenMetadata) {
    const formData = new FormData();
    formData.append("file", metadata.file, 'image.png');
    formData.append("name", metadata.name);
    formData.append("symbol", metadata.symbol);
    formData.append("description", metadata.description);
    formData.append("twitter", metadata.twitter || "");
    formData.append("telegram", metadata.telegram || "");
    formData.append("website", metadata.website || "");
    formData.append("showName", "true");

    const response = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload metadata: ${response.statusText}`);
    }

    return await response.json();
  }

  // Event listener methods with lazy initialization
  private program: AnchorProgram; //Added this line.  Need to initialize this somewhere.
  async listenToCreateEvents(callback: (event: any) => void): Promise<number> {
    if (!this.eventListeners.has('create')) {
      const listenerId = await this.program.addEventListener('createEvent', callback);
      this.eventListeners.set('create', listenerId);
      return listenerId;
    }
    return this.eventListeners.get('create')!;
  }

  async listenToTradeEvents(callback: (event: any) => void): Promise<number> {
    if (!this.eventListeners.has('trade')) {
      const listenerId = await this.program.addEventListener('tradeEvent', callback);
      this.eventListeners.set('trade', listenerId);
      return listenerId;
    }
    return this.eventListeners.get('trade')!;
  }

  removeEventListener(eventId: number) {
    this.program.removeEventListener(eventId);
    for (const [key, value] of this.eventListeners.entries()) {
      if (value === eventId) {
        this.eventListeners.delete(key);
        break;
      }
    }
  }
}
