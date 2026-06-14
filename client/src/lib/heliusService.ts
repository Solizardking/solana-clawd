import { PublicKey } from '@solana/web3.js';
import { ComputeBudgetProgram } from '@solana/web3.js';

interface HeliusSearchOptions {
  showUnverifiedCollections?: boolean;
  showCollectionMetadata?: boolean;
  showGrandTotal?: boolean;
  showNativeBalance?: boolean;
  showFungible?: boolean;
  showInscription?: boolean;
  showZeroBalance?: boolean;
}

interface HeliusAsset {
  interface: string;
  id: string;
  content: {
    json_uri: string;
    files: Array<{
      uri: string;
      cdn_uri: string;
      mime: string;
    }>;
    metadata?: {
      description?: string;
      name?: string;
      symbol?: string;
      token_standard?: string;
    };
    token_info?: {
      balance: number;
      decimals: number;
      supply?: number;
      price_info?: {
        price_per_token: number;
        total_price: number;
        currency: string;
      };
    };
  };
  ownership: {
    owner: string;
    delegate?: string;
  };
}

interface TokenAccount {
  address: string;
  mint: string;
  owner: string;
  amount: number;
  tokenProgram: string;
  tokenInfo?: {
    decimals: number;
    symbol: string;
    price?: number;
  };
}

export class HeliusService {
  private static async makeRequest<T>(method: string, params: any): Promise<T> {
    try {
      console.log(`Making Helius API request: ${method}`, params);
      const response = await fetch('/api/helius/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-query',
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`Helius API response for ${method}:`, data);

      if (data.error) {
        throw new Error(`Helius API error: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      console.error('Helius API request failed:', error);
      throw error;
    }
  }

  static async searchAssets(
    query: string,
    page = 1,
    limit = 20
  ): Promise<HeliusAsset[]> {
    return this.makeRequest<HeliusAsset[]>('searchAssets', {
      query,
      page,
      limit,
      options: {
        showUnverifiedCollections: true,
        showCollectionMetadata: true,
        showNativeBalance: true,
      },
    });
  }

  static async getAssetsByOwner(
    ownerAddress: string,
    page = 1,
    limit = 20,
    options: HeliusSearchOptions = {}
  ): Promise<HeliusAsset[]> {
    return this.makeRequest<HeliusAsset[]>('getAssetsByOwner', {
      ownerAddress,
      page,
      limit,
      displayOptions: {
        showUnverifiedCollections: true,
        showCollectionMetadata: true,
        showGrandTotal: true,
        showNativeBalance: true,
        showFungible: true,
        ...options,
      },
    });
  }

  static async getToken(mintAddress: string) {
    const response = await fetch(`/api/helius/token/${encodeURIComponent(mintAddress)}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Token lookup failed (${response.status})`);
    }
    return payload.data;
  }

  static async getWalletFungibles(ownerAddress: string, page = 1, limit = 100, tokenType: 'fungible' | 'all' = 'fungible') {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      tokenType,
    });
    const response = await fetch(`/api/helius/wallet/${encodeURIComponent(ownerAddress)}/fungibles?${params}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Wallet fungibles lookup failed (${response.status})`);
    }
    return payload.data;
  }

  static async getWalletTokenAccounts(ownerAddress: string, opts: { mint?: string; programId?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (opts.mint) params.set('mint', opts.mint);
    if (opts.programId) params.set('programId', opts.programId);
    if (opts.limit) params.set('limit', String(opts.limit));
    const suffix = params.toString() ? `?${params}` : '';
    const response = await fetch(`/api/helius/wallet/${encodeURIComponent(ownerAddress)}/token-accounts${suffix}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Wallet token accounts lookup failed (${response.status})`);
    }
    return payload.data;
  }

  static async getTokenAccounts(
    params: { mint?: string; owner?: string },
    page = 1,
    limit = 100
  ): Promise<TokenAccount[]> {
    return this.makeRequest<TokenAccount[]>('getTokenAccounts', {
      ...params,
      page,
      limit,
      options: {
        showZeroBalance: true,
      },
    });
  }

  // Transaction optimization utilities
  static getOptimizedComputeUnitLimit(unitsConsumed: number): number {
    // Add 10% margin to the consumed units
    return Math.ceil(unitsConsumed * 1.1);
  }

  static createComputeUnitLimitInstruction(units: number) {
    return ComputeBudgetProgram.setComputeUnitLimit({
      units,
    });
  }

  static createComputeUnitPriceInstruction(microLamports: number) {
    return ComputeBudgetProgram.setComputeUnitPrice({
      microLamports,
    });
  }

  // Priority fee estimation
  static async getPriorityFeeEstimate(
    request: string | {
      transaction?: string;
      accountKeys?: string[];
      priorityLevel?: 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax';
      includeAllPriorityFeeLevels?: boolean;
      transactionEncoding?: 'Base64' | 'Base58';
    }
  ): Promise<number> {
    const body = typeof request === 'string'
      ? { transaction: request, priorityLevel: 'Medium', recommended: true }
      : { recommended: true, ...request };
    const response = await fetch('/api/helius/priority-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Priority fee lookup failed (${response.status})`);
    }
    return payload.data.priorityFeeEstimate;
  }

  static async sendSignedTransaction(
    signedTransaction: string,
    options: {
      mode?: 'rpc' | 'sender';
      skipPreflight?: boolean;
      maxRetries?: number;
      rebateAddress?: string;
      swqosOnly?: boolean;
    } = {}
  ): Promise<{ signature: string; explorerUrl?: string; mode?: string; optimizedBy?: string }> {
    const response = await fetch('/api/helius/send-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedTransaction, ...options }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Transaction send failed (${response.status})`);
    }
    return payload.data;
  }
}
