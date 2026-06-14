import { useQuery } from "@tanstack/react-query";

const API_BASE_URL = "/api/solana-tracker";

// Constants for risk assessment
export const RISK_LEVELS = {
  SAFE: { name: 'Safe', color: 'text-green-500', bgColor: 'bg-green-500/20', description: 'Low risk - looks good!' },
  WARNING: { name: 'Warning', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', description: 'Proceed with caution' },
  DANGER: { name: 'Danger', color: 'text-red-500', bgColor: 'bg-red-500/20', description: 'High risk - be very careful!' },
  EXTREME: { name: 'Extreme Risk', color: 'text-red-600', bgColor: 'bg-red-600/30', description: 'Not recommended - potential rug' }
};

// Risk level enums matching API
export const RISK_LEVEL_ENUM = {
  low: 'SAFE',
  warning: 'WARNING',
  danger: 'DANGER',
  critical: 'EXTREME'
};

// Risk categories (from API documentation)
export const RISK_CATEGORIES = {
  'No social media': { level: 'warning', score: 2000 },
  'No file metadata': { level: 'warning', score: 100 },
  'Pump.fun contracts can be changed at any time': { level: 'warning', score: 10 },
  'Bonding curve not complete': { level: 'warning', score: 4000 },
  'Freeze Authority Enabled': { level: 'danger', score: 7500 },
  'Mint Authority Enabled': { level: 'danger', score: 2500 },
  'Transitioning from Pump.fun to Raydium': { level: 'warning', score: 100 },
  'Rugged': { level: 'danger', score: 20000 },
  'Low Liquidity (Very Low)': { level: 'danger', score: 7500 },
  'Low Liquidity (Low)': { level: 'warning', score: 5000 },
  'Price Decrease': { level: 'warning', score: 1000 },
  'LP Burned': { level: 'danger', score: 4000 },
  'Single Holder Ownership (>90%)': { level: 'danger', score: 7000 },
  'Single Holder Ownership (>80%)': { level: 'danger', score: 6000 },
  'Single Holder Ownership (>70%)': { level: 'danger', score: 4600 },
  'Single Holder Ownership (>60%)': { level: 'danger', score: 4400 },
  'Single Holder Ownership (>50%)': { level: 'danger', score: 4300 },
  'Single Holder Ownership (>40%)': { level: 'danger', score: 4100 },
  'Single Holder Ownership (>30%)': { level: 'danger', score: 3500 },
  'Single Holder Ownership (>20%)': { level: 'danger', score: 2500 },
  'Single Holder Ownership (>10%)': { level: 'danger', score: 2000 },
  'Top 10 Holders': { level: 'danger', score: 5000 }
};

// Risk evaluation helper function
export function evaluateRiskLevel(riskScore: number) {
  if (riskScore < 3) return RISK_LEVELS.SAFE;
  if (riskScore < 5) return RISK_LEVELS.WARNING;
  if (riskScore < 8) return RISK_LEVELS.DANGER;
  return RISK_LEVELS.EXTREME;
}

// Risk level mapper from API level string to our level object
export function mapRiskLevel(levelString: string) {
  const level = levelString.toLowerCase();
  const riskKey = RISK_LEVEL_ENUM[level as keyof typeof RISK_LEVEL_ENUM] || 'WARNING';
  return RISK_LEVELS[riskKey as keyof typeof RISK_LEVELS];
}

interface TokenMetadata {
  name: string;
  symbol: string;
  mint: string;
  uri: string;
  decimals: number;
  image: string;
  description?: string;
  extensions?: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
  hasFileMetaData: boolean;
}

interface Pool {
  liquidity: {
    quote: number;
    usd: number;
  };
  price: {
    quote: number;
    usd: number;
  };
  tokenSupply: number;
  lpBurn: number;
  tokenAddress: string;
  marketCap: {
    quote: number;
    usd: number;
  };
  market: string;
  quoteToken: string;
  decimals: number;
  security?: {
    freezeAuthority: string | null;
    mintAuthority: string | null;
  };
  lastUpdated: number;
  createdAt: number;
  poolId: string;
}

interface TokenData {
  token: TokenMetadata;
  pools: Pool[];
  events: {
    [key: string]: {
      priceChangePercentage: number;
    };
  };
  risk: {
    rugged: boolean;
    risks: Array<{
      name: string;
      description: string;
      level: string;
      score: number;
    }>;
    score: number;
  };
  buys: number;
  sells: number;
  txns: number;
  holders: number;
}

class SolanaTrackerAPI {
  private static async fetchWithRetry(endpoint: string, options: RequestInit = {}, retries = 3): Promise<any> {
    try {
      const url = `${API_BASE_URL}${endpoint}`;
      const finalOptions = {
        ...options,
        headers: {
          'Accept': 'application/json',
          ...options.headers,
        }
      };

      const response = await fetch(url, finalOptions);

      if (response.status === 429 && retries > 0) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5');
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return this.fetchWithRetry(endpoint, options, retries - 1);
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Solana Tracker API Error:', error);
      throw error;
    }
  }

  static async getTokenData(tokenAddress: string): Promise<TokenData> {
    return this.fetchWithRetry(`/token/${tokenAddress}`);
  }

  // Removed duplicate searchTokens method

  static async getWalletTokens(walletAddress: string): Promise<{
    tokens: Array<TokenData & { balance: number; value: number }>;
    total: number;
    totalSol: number;
  }> {
    return this.fetchWithRetry(`/wallet/${walletAddress}`);
  }

  static async getTrendingTokens(timeframe: string = '1h'): Promise<TokenData[]> {
    const response = await fetch('/api/birdeye/trending-tokens?limit=20&sort_by=volume24hUSD&sort_type=desc');
    if (!response.ok) {
      throw new Error(`Birdeye trending request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const tokens: any[] = data?.data?.tokens || data?.data?.items || [];
    return tokens.map((token: any) => ({
      token: {
        symbol: token.symbol || 'UNKNOWN',
        name: token.name || 'Unknown Token',
        mint: token.address || token.mint || '',
        image: token.logoURI || token.logo_uri || '',
      },
      pools: [{ price: { usd: Number(token.price || 0) } }],
      events: {
        [timeframe]: {
          priceChangePercentage: Number(token.price24hChangePercent ?? token.price_change_24h ?? 0),
        },
        '1h': {
          priceChangePercentage: Number(token.price24hChangePercent ?? token.price_change_24h ?? 0),
        },
      },
    } as unknown as TokenData));
  }
  static async getTokenByPool(poolAddress: string): Promise<TokenData> {
    return this.fetchWithRetry(`/token-by-pool/${poolAddress}`);
  }

  static async getTokenPrice(tokenAddress: string): Promise<TokenPrice> {
    return this.fetchWithRetry(`/price?token=${tokenAddress}`);
  }

  static async getTokenAllTimeHigh(tokenAddress: string): Promise<{
    highest_price: number;
    timestamp: number;
  }> {
    return this.fetchWithRetry(`/ath/${tokenAddress}`);
  }

  static async getTokenChart(
    tokenAddress: string,
    interval: string = '1h',
    options?: {
      time_from?: number;
      time_to?: number;
      marketCap?: boolean;
      removeOutliers?: boolean;
    }
  ): Promise<{
    oclhv: ChartDataPoint[];
  }> {
    const params = new URLSearchParams({
      type: interval,
      ...(options?.time_from && { time_from: options.time_from.toString() }),
      ...(options?.time_to && { time_to: options.time_to.toString() }),
      ...(options?.marketCap && { marketCap: 'true' }),
      ...(options?.removeOutliers !== undefined && { removeOutliers: options.removeOutliers.toString() }),
    });

    return this.fetchWithRetry(`/chart/${tokenAddress}?${params}`);
  }

  static async getMultiTokenPrices(tokenAddresses: string[]): Promise<{ [key: string]: TokenPrice }> {
    return this.fetchWithRetry(`/price/multi?tokens=${tokenAddresses.join(',')}`);
  }

  static async getLatestTokens(page: number = 1): Promise<TokenData[]> {
    return this.fetchWithRetry(`/latest?page=${page}`);
  }

  static async getDeployerTokens(walletAddress: string): Promise<{
    total: number;
    tokens: TokenData[];
  }> {
    return this.fetchWithRetry(`/deployer/${walletAddress}`);
  }

  static async getTokenHolders(tokenAddress: string): Promise<{
    total: number;
    accounts: Array<{
      wallet: string;
      amount: number;
      value: {
        quote: number;
        usd: number;
      };
      percentage: number;
    }>;
  }> {
    return this.fetchWithRetry(`/holders/${tokenAddress}`);
  }

  static async getMultiTokenData(tokenAddresses: string[]): Promise<{ [key: string]: TokenData }> {
    return this.fetchWithRetry(`/tokens/multi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tokens: tokenAddresses }),
    });
  }


  static async checkHealth(): Promise<{
    status: string;
    timestamp: string;
    clawdLive?: boolean;
    clawdTraderConfigured?: boolean;
  }> {
    const response = await fetch('/api/solana-tracker/health', {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  }
  static async searchTokens(params: {
    query: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    showAllPools?: boolean;
    // Creation filters
    minCreatedAt?: number;
    maxCreatedAt?: number;
    // Liquidity & Market Cap
    minLiquidity?: number;
    maxLiquidity?: number;
    minMarketCap?: number;
    maxMarketCap?: number;
    // Volume filters
    minVolume?: number;
    maxVolume?: number;
    volumeTimeframe?: string;
    // Timeframe-specific volume filters
    minVolume_5m?: number;
    maxVolume_5m?: number;
    minVolume_15m?: number;
    maxVolume_15m?: number;
    minVolume_30m?: number;
    maxVolume_30m?: number;
    minVolume_1h?: number;
    maxVolume_1h?: number;
    minVolume_6h?: number;
    maxVolume_6h?: number;
    minVolume_12h?: number;
    maxVolume_12h?: number;
    minVolume_24h?: number;
    maxVolume_24h?: number;
    // Transaction filters
    minBuys?: number;
    maxBuys?: number;
    minSells?: number;
    maxSells?: number;
    minTotalTransactions?: number;
    maxTotalTransactions?: number;
    // Token characteristics
    lpBurn?: number;
    market?: string;
    freezeAuthority?: string;
    mintAuthority?: string;
    deployer?: string;
    status?: string;
    // Additional options
    showPriceChanges?: boolean;
  }): Promise<{
    status: string;
    data: TokenData[];
    total: number;
    pages: number;
    page: number;
  }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    return this.fetchWithRetry(`/search?${searchParams}`);
  }
}

// React Query hooks
export function useTrendingTokens(timeframe: string = '1h') {
  return useQuery({
    queryKey: ['trending-tokens', timeframe],
    queryFn: () => SolanaTrackerAPI.getTrendingTokens(timeframe),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useTokenData(tokenAddress: string | null) {
  return useQuery({
    queryKey: ['token-data', tokenAddress],
    queryFn: () => tokenAddress ? SolanaTrackerAPI.getTokenData(tokenAddress) : null,
    enabled: !!tokenAddress,
  });
}

export function useWalletTokens(walletAddress: string | null) {
  return useQuery({
    queryKey: ['wallet-tokens', walletAddress],
    queryFn: () => walletAddress ? SolanaTrackerAPI.getWalletTokens(walletAddress) : null,
    enabled: !!walletAddress,
  });
}

export function useTokenChart(
  tokenAddress: string | null,
  interval: string = '1h',
  options?: Parameters<typeof SolanaTrackerAPI.getTokenChart>[2]
) {
  return useQuery({
    queryKey: ['token-chart', tokenAddress, interval, options],
    queryFn: () => tokenAddress ? SolanaTrackerAPI.getTokenChart(tokenAddress, interval, options) : null,
    enabled: !!tokenAddress,
  });
}

export function useLatestTokens(page: number = 1) {
  return useQuery({
    queryKey: ['latest-tokens', page],
    queryFn: () => SolanaTrackerAPI.getLatestTokens(page),
    refetchInterval: 30000,
  });
}

export function useTokenByPool(poolAddress: string | null) {
  return useQuery({
    queryKey: ['token-by-pool', poolAddress],
    queryFn: () => poolAddress ? SolanaTrackerAPI.getTokenByPool(poolAddress) : null,
    enabled: !!poolAddress,
  });
}

export function useTokenAllTimeHigh(tokenAddress: string | null) {
  return useQuery({
    queryKey: ['token-ath', tokenAddress],
    queryFn: () => tokenAddress ? SolanaTrackerAPI.getTokenAllTimeHigh(tokenAddress) : null,
    enabled: !!tokenAddress,
  });
}

export function useMultiTokenPrices(tokenAddresses: string[] | null) {
  return useQuery({
    queryKey: ['multi-token-prices', tokenAddresses],
    queryFn: () => tokenAddresses ? SolanaTrackerAPI.getMultiTokenPrices(tokenAddresses) : null,
    enabled: !!tokenAddresses && tokenAddresses.length > 0,
  });
}

export function useDeployerTokens(walletAddress: string | null) {
  return useQuery({
    queryKey: ['deployer-tokens', walletAddress],
    queryFn: () => walletAddress ? SolanaTrackerAPI.getDeployerTokens(walletAddress) : null,
    enabled: !!walletAddress,
  });
}

export function useTokenHolders(tokenAddress: string | null) {
  return useQuery({
    queryKey: ['token-holders', tokenAddress],
    queryFn: () => tokenAddress ? SolanaTrackerAPI.getTokenHolders(tokenAddress) : null,
    enabled: !!tokenAddress,
  });
}

export function useMultiTokenData(tokenAddresses: string[] | null) {
  return useQuery({
    queryKey: ['multi-token-data', tokenAddresses],
    queryFn: () => tokenAddresses ? SolanaTrackerAPI.getMultiTokenData(tokenAddresses) : null,
    enabled: !!tokenAddresses && tokenAddresses.length > 0,
  });
}

export function useSearchTokens(params: Parameters<typeof SolanaTrackerAPI.searchTokens>[0] | null) {
  return useQuery({
    queryKey: ['search-tokens', params],
    queryFn: () => params ? SolanaTrackerAPI.searchTokens(params) : null,
    enabled: !!params,
  });
}

// Add health check hook
export function useApiHealth() {
  return useQuery({
    queryKey: ['api-health'],
    queryFn: () => SolanaTrackerAPI.checkHealth(),
    refetchInterval: 60000 // Check every minute
  });
}

interface TokenPrice {
  price: number;
  liquidity: number;
  marketCap: number;
  lastUpdated: number;
}

interface ChartDataPoint {
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  time: number;
}

export default SolanaTrackerAPI;
