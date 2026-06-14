import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/contexts/AuthContext';

const CLAWD_TOKEN = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';

export interface WalletNetWorth {
  total_value: string;
  currency: string;
  items: Array<{
    address: string;
    name: string;
    symbol: string;
    logo_uri: string;
    amount: number;
    price: number;
    value: string;
    decimals: number;
  }>;
}

export interface WalletPnl {
  realized_profit_usd: number;
  realized_profit_percent: number;
  unrealized_usd: number;
  total_usd: number;
  win_rate: number;
  total_buy: number;
  total_sell: number;
}

export interface WalletNetWorthPoint {
  time: number;
  value: number;
}

export interface WalletAsset {
  id: string;
  interface: string | null;
  name: string;
  symbol: string;
  image: string | null;
  balance: number;
  decimals: number;
}

export interface WalletIntelSummary {
  wallet: string;
  clawd: {
    mint: string;
    balance: number;
    isHolder: boolean;
    isAdmin: boolean;
    holderMinimum: number;
  };
  netWorth: {
    totalValue: number;
    currency: string;
    items: Array<{
      address: string;
      name: string;
      symbol: string;
      logoUri: string | null;
      amount: number;
      price: number;
      value: number;
      decimals: number;
    }>;
  } | null;
  pnl: {
    totalUsd: number;
    realizedUsd: number;
    realizedPct: number;
    unrealizedUsd: number;
    winRate: number;
    totalBuy: number;
    totalSell: number;
  } | null;
  assets: WalletAsset[];
  netWorthChart: {
    source: string;
    points: WalletNetWorthPoint[];
  };
  generatedAt: string;
}

interface TokenGateState {
  isVerified: boolean;
  isVerifying: boolean;
  clawdBalance: number | null;
  netWorth: WalletNetWorth | null;
  pnl: WalletPnl | null;
  walletIntel: WalletIntelSummary | null;
  netWorthChart: WalletNetWorthPoint[];
  assets: WalletAsset[];
  error: string | null;
  verify: () => Promise<void>;
  refresh: () => Promise<void>;
}

const TokenGateContext = createContext<TokenGateState>({
  isVerified: false,
  isVerifying: false,
  clawdBalance: null,
  netWorth: null,
  pnl: null,
  walletIntel: null,
  netWorthChart: [],
  assets: [],
  error: null,
  verify: async () => {},
  refresh: async () => {},
});

export function TokenGateProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected } = useWallet();
  const { user } = useAuth();
  const walletAddress = publicKey?.toString() ?? null;

  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [clawdBalance, setClawdBalance] = useState<number | null>(null);
  const [netWorth, setNetWorth] = useState<WalletNetWorth | null>(null);
  const [pnl, setPnl] = useState<WalletPnl | null>(null);
  const [walletIntel, setWalletIntel] = useState<WalletIntelSummary | null>(null);
  const [netWorthChart, setNetWorthChart] = useState<WalletNetWorthPoint[]>([]);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress || !user) return;
    if (
      user.walletAddress === walletAddress &&
      (user.role === "admin" || user.isTokenGated)
    ) {
      setIsVerified(true);
      if (typeof user.clawdBalance === "number" && user.clawdBalance >= 0) {
        setClawdBalance(user.clawdBalance);
      }
    }
  }, [user, walletAddress]);

  const fetchWalletIntel = useCallback(async (wallet: string) => {
    const res = await fetch(`/api/wallet-intel/summary?wallet=${encodeURIComponent(wallet)}`);
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Wallet intelligence lookup failed');
    }

    const summary = data as WalletIntelSummary & { success?: boolean };
    setWalletIntel(summary);
    setClawdBalance(summary.clawd.balance);
    setIsVerified(Boolean(summary.clawd.isHolder || summary.clawd.isAdmin));
    setAssets(summary.assets ?? []);
    setNetWorthChart(summary.netWorthChart?.points ?? []);
    setNetWorth(summary.netWorth
      ? {
          total_value: String(summary.netWorth.totalValue),
          currency: summary.netWorth.currency,
          items: summary.netWorth.items.map((item) => ({
            address: item.address,
            name: item.name,
            symbol: item.symbol,
            logo_uri: item.logoUri ?? '',
            amount: item.amount,
            price: item.price,
            value: String(item.value),
            decimals: item.decimals,
          })),
        }
      : null);
    setPnl(summary.pnl
      ? {
          realized_profit_usd: summary.pnl.realizedUsd,
          realized_profit_percent: summary.pnl.realizedPct,
          unrealized_usd: summary.pnl.unrealizedUsd,
          total_usd: summary.pnl.totalUsd,
          win_rate: summary.pnl.winRate,
          total_buy: summary.pnl.totalBuy,
          total_sell: summary.pnl.totalSell,
        }
      : null);
  }, []);

  // Reset when wallet disconnects; otherwise fetch the full summary in one request.
  useEffect(() => {
    if (!connected || !walletAddress) {
      setIsVerified(false);
      setClawdBalance(null);
      setNetWorth(null);
      setPnl(null);
      setWalletIntel(null);
      setNetWorthChart([]);
      setAssets([]);
      setError(null);
      return;
    }

    fetchWalletIntel(walletAddress).catch((e) => {
      console.error('Wallet intelligence fetch error:', e);
      setError(e instanceof Error ? e.message : 'Wallet intelligence lookup failed');
    });
  }, [connected, walletAddress, fetchWalletIntel]);

  const verify = useCallback(async () => {
    if (!walletAddress) {
      setError('Connect your wallet first');
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      await fetchWalletIntel(walletAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed — please try again');
    } finally {
      setIsVerifying(false);
    }
  }, [walletAddress, fetchWalletIntel]);

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    await fetchWalletIntel(walletAddress);
  }, [walletAddress, fetchWalletIntel]);

  return (
    <TokenGateContext.Provider value={{ isVerified, isVerifying, clawdBalance, netWorth, pnl, walletIntel, netWorthChart, assets, error, verify, refresh }}>
      {children}
    </TokenGateContext.Provider>
  );
}

export function useTokenGate() {
  return useContext(TokenGateContext);
}

export { CLAWD_TOKEN };
