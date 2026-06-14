// @ts-nocheck
import {
  Commitment,
  Connection,
  Finality,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import {
  CreateTokenMetadata,
  PumpFunEventHandlers,
  PumpFunEventType,
  TradeEvent,
  PriorityFee,
  TransactionResult,
  TestModeConfig,
  VirtualBalance
} from "./types";
import { AMM } from "./amm";
import { BondingCurveAccount } from "./bondingCurveAccount";
import { GlobalAccount } from "./globalAccount";
import { calculateWithSlippageBuy, calculateWithSlippageSell, sendTx } from "./util";

export const PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const GLOBAL_ACCOUNT_SEED = "global";
export const MINT_AUTHORITY_SEED = "mint-authority";
export const BONDING_CURVE_SEED = "bonding-curve";
export const METADATA_SEED = "metadata";
export const DEFAULT_DECIMALS = 6;
export const DEFAULT_COMMITMENT: Commitment = 'confirmed';
export const DEFAULT_FINALITY: Finality = 'confirmed';

export class PumpFunSDK {
  public program: Program;
  public connection: Connection;
  private amm: AMM | null = null;
  private eventListeners: Map<string, (event: any) => void>;
  private testMode: TestModeConfig;
  private virtualBalances: Map<string, VirtualBalance>; // wallet -> balances

  constructor(
    provider: AnchorProvider,
    testModeConfig?: Partial<TestModeConfig>
  ) {
    this.connection = provider.connection;
    this.eventListeners = new Map();
    this.virtualBalances = new Map();

    // Initialize test mode if enabled
    this.testMode = {
      enabled: testModeConfig?.enabled ?? false,
      initialVirtualSol: testModeConfig?.initialVirtualSol ?? BigInt(100 * 1e9), // 100 SOL
      initialVirtualTokens: testModeConfig?.initialVirtualTokens ?? BigInt(1000000 * 1e6), // 1M tokens
      feeBasisPoints: testModeConfig?.feeBasisPoints ?? BigInt(100) // 1%
    };

    if (this.testMode.enabled) {
      console.log('PumpFun SDK initialized in test mode');
    }
  }

  private initializeVirtualBalance(walletAddress: string) {
    if (!this.virtualBalances.has(walletAddress)) {
      this.virtualBalances.set(walletAddress, {
        sol: this.testMode.initialVirtualSol,
        tokens: new Map()
      });
    }
  }

  async createAndBuyToken(
    creator: Keypair,
    mint: Keypair,
    metadata: CreateTokenMetadata,
    buyAmountSol: bigint,
    slippageBasisPoints: bigint = 500n,
    priorityFees?: PriorityFee
  ): Promise<TransactionResult> {
    try {
      if (this.testMode.enabled) {
        return this.createAndBuyTokenTest(creator, mint, metadata, buyAmountSol);
      }

      const formData = new FormData();
      formData.append("file", metadata.file);
      formData.append("name", metadata.name);
      formData.append("symbol", metadata.symbol);
      formData.append("description", metadata.description);
      formData.append("twitter", metadata.twitter || "");
      formData.append("telegram", metadata.telegram || "");
      formData.append("website", metadata.website || "");
      formData.append("showName", "true");

      const response = await fetch("/api/ipfs", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Metadata upload failed:', errorText);
        throw new Error(`Failed to upload metadata: ${errorText}`);
      }

      const metadataResult = await response.json();

      const tokenMetadata = await this.createTokenMetadata(metadata);
      const globalAccount = await this.getGlobalAccount();

      this.amm = AMM.fromGlobalAccount(globalAccount);
      const buyAmount = this.amm.getBuyPrice(buyAmountSol);
      const buyAmountWithSlippage = calculateWithSlippageBuy(buyAmountSol, slippageBasisPoints);

      const createTx = await this.getCreateInstructions(
        creator.publicKey,
        metadata.name,
        metadata.symbol,
        tokenMetadata.uri,
        mint
      );

      const buyTx = await this.getBuyInstructions(
        creator.publicKey,
        mint.publicKey,
        globalAccount.feeRecipient,
        buyAmount,
        buyAmountWithSlippage
      );

      const transaction = new Transaction().add(createTx).add(buyTx);

      const result = await sendTx(
        this.connection,
        transaction,
        creator.publicKey,
        [creator, mint],
        priorityFees
      );

      if (result.success) {
        this.emitTradeEvent({
          mint: mint.publicKey,
          solAmount: buyAmountSol,
          tokenAmount: buyAmount,
          isBuy: true,
          user: creator.publicKey,
          timestamp: Date.now(),
          virtualSolReserves: this.amm.virtualSolReserves,
          virtualTokenReserves: this.amm.virtualTokenReserves,
          realSolReserves: this.amm.realSolReserves,
          realTokenReserves: this.amm.realTokenReserves
        });
      }

      return result;
    } catch (error) {
      console.error('Error in createAndBuyToken:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async createAndBuyTokenTest(
    creator: Keypair,
    mint: Keypair,
    metadata: CreateTokenMetadata,
    buyAmountSol: bigint
  ): Promise<TransactionResult> {
    const walletAddress = creator.publicKey.toBase58();
    this.initializeVirtualBalance(walletAddress);

    const balance = this.virtualBalances.get(walletAddress)!;

    if (balance.sol < buyAmountSol) {
      return {
        success: false,
        error: 'Insufficient test SOL balance'
      };
    }

    // Initialize AMM with test parameters
    this.amm = new AMM(
      BigInt(0), // Initial virtual SOL reserves
      this.testMode.initialVirtualTokens,
      BigInt(0), // Initial real SOL reserves
      this.testMode.initialVirtualTokens,
      this.testMode.initialVirtualTokens
    );

    // Calculate token amount based on AMM
    const buyResult = this.amm.applyBuy(buyAmountSol);

    // Update virtual balances
    balance.sol -= buyAmountSol;
    balance.tokens.set(mint.publicKey.toBase58(), buyResult.tokenAmount);

    // Emit test trade event
    this.emitTradeEvent({
      mint: mint.publicKey,
      solAmount: buyAmountSol,
      tokenAmount: buyResult.tokenAmount,
      isBuy: true,
      user: creator.publicKey,
      timestamp: Date.now(),
      virtualSolReserves: this.amm.virtualSolReserves,
      virtualTokenReserves: this.amm.virtualTokenReserves,
      realSolReserves: this.amm.realSolReserves,
      realTokenReserves: this.amm.realTokenReserves
    });

    return {
      success: true,
      tokenAddress: mint.publicKey.toBase58(),
      url: `https://test.pump.fun/${mint.publicKey.toBase58()}`
    };
  }

  private async createTokenMetadata(metadata: CreateTokenMetadata) {
    const formData = new FormData();
    formData.append("file", metadata.file);
    formData.append("name", metadata.name);
    formData.append("symbol", metadata.symbol);
    formData.append("description", metadata.description);
    formData.append("twitter", metadata.twitter || "");
    formData.append("telegram", metadata.telegram || "");
    formData.append("website", metadata.website || "");
    formData.append("showName", "true");

    const response = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData
    });

    return response.json();
  }

  private emitTradeEvent(event: TradeEvent) {
    this.eventListeners.forEach(listener => listener(event));
  }

  addEventListener<T extends PumpFunEventType>(
    eventType: T,
    callback: (event: PumpFunEventHandlers[T]) => void
  ) {
    this.eventListeners.set(eventType, callback);
  }

  removeEventListener(eventType: string) {
    this.eventListeners.delete(eventType);
  }

  getBondingCurvePDA(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      PROGRAM_ID
    )[0];
  }

  getCurrentAMM(): AMM | null {
    return this.amm;
  }

  isTestMode(): boolean {
    return this.testMode.enabled;
  }

  getVirtualBalance(walletAddress: string): VirtualBalance | undefined {
    return this.virtualBalances.get(walletAddress);
  }

  async getGlobalAccount(): Promise<GlobalAccount> {
    //Implementation for getGlobalAccount is needed here.  This is a placeholder.
    throw new Error("getGlobalAccount not implemented");
  }

  async getCreateInstructions(
    creator: PublicKey,
    name: string,
    symbol: string,
    uri: string,
    mint: Keypair
  ): Promise<Transaction> {
    //Implementation for getCreateInstructions is needed here.  This is a placeholder.
    throw new Error("getCreateInstructions not implemented");
  }

  async getBuyInstructions(
    creator: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    buyAmount: bigint,
    buyAmountWithSlippage: bigint
  ): Promise<Transaction> {
    //Implementation for getBuyInstructions is needed here.  This is a placeholder.
    throw new Error("getBuyInstructions not implemented");
  }

  async buyToken(
    wallet: PublicKey,
    mintAddress: string,
    solAmount: bigint,
    slippageBasisPoints: bigint = 500n,
    priorityFees?: PriorityFee
  ): Promise<TransactionResult> {
    try {
      if (this.testMode.enabled) {
        return this.buyTokenTest(wallet, mintAddress, solAmount);
      }

      const mint = new PublicKey(mintAddress);
      const globalAccount = await this.getGlobalAccount();
      const bondingCurve = await this.getBondingCurveAccount(mint);


      this.amm = AMM.fromGlobalAccount(globalAccount);
      const buyAmount = this.amm.getBuyPrice(solAmount);
      const buyAmountWithSlippage = calculateWithSlippageBuy(solAmount, slippageBasisPoints);

      const buyTx = await this.getBuyInstructions(
        wallet,
        mint,
        globalAccount.feeRecipient,
        buyAmount,
        buyAmountWithSlippage
      );

      const result = await sendTx(
        this.connection,
        buyTx,
        wallet,
        [],
        priorityFees
      );

      if (result.success) {
        this.emitTradeEvent({
          mint,
          solAmount,
          tokenAmount: buyAmount,
          isBuy: true,
          user: wallet,
          timestamp: Date.now(),
          virtualSolReserves: this.amm.virtualSolReserves,
          virtualTokenReserves: this.amm.virtualTokenReserves,
          realSolReserves: this.amm.realSolReserves,
          realTokenReserves: this.amm.realTokenReserves
        });
      }

      return result;
    } catch (error) {
      console.error('Error in buyToken:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async buyTokenTest(
    wallet: PublicKey,
    mintAddress: string,
    solAmount: bigint
  ): Promise<TransactionResult> {
    const walletAddress = wallet.toBase58();
    this.initializeVirtualBalance(walletAddress);

    const balance = this.virtualBalances.get(walletAddress)!;

    if (balance.sol < solAmount) {
      return {
        success: false,
        error: 'Insufficient test SOL balance'
      };
    }

    // Calculate token amount based on AMM
    const buyResult = this.amm!.applyBuy(solAmount);

    // Update virtual balances
    balance.sol -= solAmount;
    const currentTokens = balance.tokens.get(mintAddress) || BigInt(0);
    balance.tokens.set(mintAddress, currentTokens + buyResult.tokenAmount);

    // Emit test trade event
    this.emitTradeEvent({
      mint: new PublicKey(mintAddress),
      solAmount,
      tokenAmount: buyResult.tokenAmount,
      isBuy: true,
      user: wallet,
      timestamp: Date.now(),
      virtualSolReserves: this.amm!.virtualSolReserves,
      virtualTokenReserves: this.amm!.virtualTokenReserves,
      realSolReserves: this.amm!.realSolReserves,
      realTokenReserves: this.amm!.realTokenReserves
    });

    return {
      success: true,
      tokenAddress: mintAddress
    };
  }
  async getBondingCurveAccount(mint: PublicKey): Promise<BondingCurveAccount> {
    throw new Error("Method not implemented.");
  }
}
