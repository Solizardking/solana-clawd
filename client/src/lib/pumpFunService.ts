// @ts-nocheck
import { PublicKey, Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PumpFunSDK } from './sdk/pumpFun';
import { TokenMetadata, TradeEvent, TestModeConfig } from './sdk/types';

export class PumpFunService {
  private sdk: PumpFunSDK;
  private connection: Connection;
  private eventListeners: Map<string, (event: any) => void>;

  constructor(provider: AnchorProvider, testMode: boolean = false) {
    const testModeConfig: TestModeConfig = {
      enabled: testMode,
      initialVirtualSol: BigInt(100 * LAMPORTS_PER_SOL),
      initialVirtualTokens: BigInt(1000000 * 1e6),
      feeBasisPoints: BigInt(100)
    };

    this.sdk = new PumpFunSDK(provider, testModeConfig);
    this.connection = provider.connection;
    this.eventListeners = new Map();

    this.sdk.addEventListener('tradeEvent', (event) => {
      this.eventListeners.get('tradeEvent')?.(event);
      console.log('Trade event:', { event });
    });
  }

  async createAndBuyToken(
    creator: Keypair,
    mint: Keypair,
    metadata: TokenMetadata,
    initialBuySol: number,
    slippageBasisPoints: bigint = 500n
  ) {
    try {
      console.log('Creating token with metadata:', {
        ...metadata,
        file: 'Blob data truncated'
      });

      // Create form data for metadata upload
      const formData = new FormData();
      formData.append('file', metadata.file);
      formData.append('name', metadata.name);
      formData.append('symbol', metadata.symbol);
      formData.append('description', metadata.description);
      formData.append('twitter', metadata.twitter || '');
      formData.append('telegram', metadata.telegram || '');
      formData.append('website', metadata.website || '');

      // Upload metadata with proper error handling
      let metadataResult;
      try {
        const metadataResponse = await fetch('/api/ipfs', {
          method: 'POST',
          body: formData,
        });

        if (!metadataResponse.ok) {
          throw new Error(`Metadata upload failed: ${metadataResponse.status} ${await metadataResponse.text()}`);
        }

        const contentType = metadataResponse.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          throw new Error('Invalid metadata response format');
        }

        metadataResult = await metadataResponse.json();
        console.log('Metadata uploaded:', metadataResult);

      } catch (uploadError) {
        console.error('Metadata upload error:', uploadError);
        return {
          success: false,
          error: `Failed to upload metadata: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
        };
      }

      // Create and buy token with improved error handling
      try {
        const createResults = await this.sdk.createAndBuyToken(
          creator,
          mint,
          {
            ...metadata,
            uri: metadataResult.uri
          },
          BigInt(Math.floor(initialBuySol * LAMPORTS_PER_SOL)),
          slippageBasisPoints,
          {
            unitLimit: 250000,
            unitPrice: 170000,
          }
        );

        if (!createResults?.success) {
          throw new Error(createResults?.error || 'Token creation failed with no error details');
        }

        console.log('Token created successfully:', {
          mint: mint.publicKey.toBase58(),
          createResults
        });

        return {
          success: true,
          tokenAddress: mint.publicKey.toBase58(),
          url: this.sdk.isTestMode()
            ? `https://test.pump.fun/${mint.publicKey.toBase58()}`
            : `https://pump.fun/${mint.publicKey.toBase58()}`
        };

      } catch (createError) {
        console.error('Token creation error:', createError);
        return {
          success: false,
          error: createError instanceof Error ? createError.message : 'Unknown error during token creation'
        };
      }

    } catch (error) {
      console.error('Error in createAndBuyToken:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async buyToken(
    mintAddress: string,
    solAmount: number,
    slippageBasisPoints: bigint = 500n
  ) {
    try {
      const amountInLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
      return await this.sdk.buyToken(
        this.connection.wallet.publicKey,
        mintAddress,
        amountInLamports,
        slippageBasisPoints
      );
    } catch (error) {
      console.error('Error buying token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getTokenPrice(mintAddress: string): Promise<{
    success: boolean;
    price?: number;
    error?: string;
  }> {
    try {
      const amm = this.sdk.getCurrentAMM();
      if (!amm) {
        return {
          success: false,
          error: 'AMM not initialized'
        };
      }

      const bondingCurve = await this.sdk.getBondingCurveAccount(new PublicKey(mintAddress));
      if (!bondingCurve) {
        return {
          success: false,
          error: 'Token not found'
        };
      }

      return {
        success: true,
        price: Number(bondingCurve.currentPrice) / LAMPORTS_PER_SOL
      };
    } catch (error) {
      console.error('Error getting token price:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  addEventListener(eventType: string, callback: (event: any) => void) {
    this.eventListeners.set(eventType, callback);
  }

  removeEventListener(eventType: string) {
    this.eventListeners.delete(eventType);
  }

  isTestMode(): boolean {
    return this.sdk.isTestMode();
  }

  getVirtualBalance(walletAddress: string) {
    return this.sdk.getVirtualBalance(walletAddress);
  }
}

export type { TokenMetadata, TradeEvent };
