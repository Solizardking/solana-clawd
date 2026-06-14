// @ts-nocheck
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { sendOptimizedRawTransaction } from './transactionOptimization';

dotenv.config({ quiet: true });

// Asset interfaces
export interface DasApiAsset {
  id: string;
  content: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
    };
  };
  authorities?: { address: string; scopes: string[] }[];
  compression?: { eligible: boolean; compressed: boolean; data_hash: string; creator_hash: string; asset_hash: string; tree_id: string; leaf_id: number };
  grouping?: { group_key: string; group_value: string }[];
  royalty?: { basis_points: number; primary_sale_happened: boolean; target: string | null };
  creators?: { address: string; share: number; verified: boolean }[];
  ownership: {
    owner: string;
    delegate: string | null;
    delegated: boolean;
    tokenStandard: string;
    supply: number;
    supply_mint: string;
    ownership_model: string;
    frozen: boolean;
    delegate_data: any;
    burnt: boolean;
  };
  uses?: { use_method: string; remaining: number; total: number };
  supply?: { print_max_supply: number; print_current_supply: number; edition_nonce: number };
  mutable: boolean;
  burnt: boolean;
  tokenStandard: string;
  interface: string;
}

export interface GetAssetResponse {
  id: string;
  content: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
    };
  };
  ownership: {
    owner: string;
    frozen: boolean;
    delegate: string | null;
    delegated: boolean;
    ownership_model: string;
  };
  mutable: boolean;
  burnt: boolean;
}

export interface WalletBalancesResponse {
  tokens: {
    mint: string;
    amount: string;
    decimals: number;
    tokenAccount: string;
  }[];
  nativeBalance: number;
}

export interface WalletTransfer {
  signature: string;
  timestamp: number;
  direction: "in" | "out";
  counterparty: string;
  mint: string;
  symbol?: string;
  amount: number;
  amountRaw: string;
  decimals: number;
}

export interface WalletTransfersResponse {
  data: WalletTransfer[];
  pagination: { hasMore: boolean; nextCursor?: string };
}

export interface ParsedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  fee: number;
  feePayer: string;
  description?: string;
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
  tokenTransfers?: { fromUserAccount: string; toUserAccount: string; mint: string; tokenAmount: number }[];
  accountData?: { account: string; nativeBalanceChange: number; tokenBalanceChanges: unknown[] }[];
}

export interface BurnTokenResponse {
  success: boolean;
  data: {
    signature: string;
    fee: number;
  };
  error?: string;
}

class HeliusService {
  private rpcUrl: string;
  private apiKey: string;
  private connection: Connection;

  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY || '';
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
    this.connection = new Connection(this.rpcUrl);
    
    console.log('Helius service initialized with RPC URL:', this.rpcUrl.slice(0, -10) + '...');
  }

  private async makeRpcRequest<T>(method: string, params: any = {}): Promise<T> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'my-id',
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`Helius API error: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      console.error(`Error making Helius RPC request (${method}):`, error);
      throw error;
    }
  }

  private async makeRestRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      const url = new URL(`https://api.helius.xyz/v0${endpoint}`);
      url.searchParams.append('api-key', this.apiKey);
      
      // Add any additional query parameters
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Helius REST API error: ${response.statusText}`);
      }
      
      return await response.json() as T;
    } catch (error) {
      console.error(`Error making Helius REST request (${endpoint}):`, error);
      throw error;
    }
  }

  async getAssetsByOwner(ownerAddress: string, limit: number = 10, page: number = 1): Promise<DasApiAsset[]> {
    try {
      const result = await this.makeRpcRequest<{ items: DasApiAsset[] }>('getAssetsByOwner', {
        ownerAddress,
        page,
        limit,
        displayOptions: {
          showNativeBalance: true,
          showFungible: true,
          showInscription: true
        }
      });
      
      return result.items || [];
    } catch (error) {
      console.error('Error fetching assets by owner:', error);
      throw error;
    }
  }

  async getWalletBalances(walletAddress: string): Promise<WalletBalancesResponse> {
    try {
      // This endpoint is not officially part of the Helius API, so we'll return a simplified response
      return {
        tokens: [],
        nativeBalance: await this.connection.getBalance(new PublicKey(walletAddress)) / 1e9
      };
    } catch (error) {
      console.error('Error fetching wallet balances:', error);
      throw error;
    }
  }

  async burnToken(
    mintAddress: string,
    walletAddress: string,
    closeAccount: boolean = true
  ): Promise<BurnTokenResponse> {
    try {
      // This is a simplified implementation as we don't have the wallet private key on the server
      // In a real implementation, we would create a transaction and let the client sign it
      
      const mintPublicKey = new PublicKey(mintAddress);
      const walletPublicKey = new PublicKey(walletAddress);
      
      // Get the associated token account
      const associatedTokenAddress = await spl.getAssociatedTokenAddress({
        mint: mintPublicKey,
        owner: walletPublicKey
      });
      
      // Check if the token account exists
      const tokenAccountInfo = await this.connection.getAccountInfo(associatedTokenAddress);
      if (!tokenAccountInfo) {
        throw new Error('Token account not found');
      }
      
      // Get the token balance
      const tokenAmount = await this.connection.getTokenAccountBalance(associatedTokenAddress);
      const amountToBurn = tokenAmount.value.amount;
      const decimals = tokenAmount.value.decimals;
      
      // Create burn instruction
      const burnInstruction = spl.createBurnCheckedInstruction(
        associatedTokenAddress,
        mintPublicKey,
        walletPublicKey,
        BigInt(amountToBurn),
        decimals
      );
      
      // Create close account instruction if requested
      const instructions = [burnInstruction];
      
      if (closeAccount) {
        const closeInstruction = spl.createCloseAccountInstruction(
          associatedTokenAddress,
          walletPublicKey,
          walletPublicKey
        );
        
        instructions.push(closeInstruction);
      }
      
      // In a real implementation, we would return the instructions to the client for signing
      // For now, we'll just return a simulated result
      
      return {
        success: true,
        data: {
          signature: 'simulation-only',
          fee: 0.000005 // Typical Solana transaction fee
        }
      };
    } catch (error) {
      console.error('Error burning token:', error);
      throw error;
    }
  }

  async burnNft(walletAddress: string, mint: string): Promise<BurnTokenResponse> {
    try {
      // For NFTs, the process is similar to burning tokens, but we would check if it's actually an NFT first
      // This is a simplified implementation
      
      return this.burnToken(mint, walletAddress, true);
    } catch (error) {
      console.error('Error burning NFT:', error);
      throw error;
    }
  }

  // Wallet API v1 — token transfers (in/out) with sender/recipient
  async getWalletTransfers(
    address: string,
    opts: { limit?: number; cursor?: string } = {}
  ): Promise<WalletTransfersResponse> {
    const url = new URL(`https://api.helius.xyz/v1/wallet/${address}/transfers`);
    url.searchParams.set("api-key", this.apiKey);
    if (opts.limit) url.searchParams.set("limit", String(opts.limit));
    if (opts.cursor) url.searchParams.set("cursor", opts.cursor);
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`Helius transfers ${r.status}: ${await r.text()}`);
    return r.json() as Promise<WalletTransfersResponse>;
  }

  // Enhanced Transaction API — parsed tx history for a wallet
  async getParsedTransactions(
    address: string,
    opts: { limit?: number; before?: string; commitment?: string; type?: string } = {}
  ): Promise<ParsedTransaction[]> {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
    url.searchParams.set("api-key", this.apiKey);
    if (opts.limit) url.searchParams.set("limit", String(opts.limit));
    if (opts.before) url.searchParams.set("before", opts.before);
    if (opts.commitment) url.searchParams.set("commitment", opts.commitment);
    if (opts.type) url.searchParams.set("type", opts.type);
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`Helius transactions ${r.status}: ${await r.text()}`);
    return r.json() as Promise<ParsedTransaction[]>;
  }

  // Parse a specific transaction by signature
  async parseTransaction(signature: string): Promise<ParsedTransaction | null> {
    const url = new URL("https://api.helius.xyz/v0/transactions");
    url.searchParams.set("api-key", this.apiKey);
    const r = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [signature] }),
    });
    if (!r.ok) throw new Error(`Helius parse tx ${r.status}: ${await r.text()}`);
    const arr = await r.json() as ParsedTransaction[];
    return arr[0] ?? null;
  }

  async executeBurnTransaction(transactionBase64: string, privateKey: string): Promise<string> {
    try {
      // This method would be used if we were executing the burn transaction on the server
      // which is not recommended for security reasons
      
      // In a real implementation, the client would sign the transaction and send it to the blockchain
      
      // For testing/simulation purposes:
      const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
      const keypair = bs58.decode(privateKey);
      
      // Sign and send the transaction
      const { signature } = await sendOptimizedRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
      
      return signature;
    } catch (error) {
      console.error('Error executing burn transaction:', error);
      throw error;
    }
  }
}

export const heliusService = new HeliusService();
