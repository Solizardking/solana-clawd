import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getWalletRpcUrl } from '@/lib/publicConfig';

async function fetchBalance(address: string) {
  const rpcUrl = await getWalletRpcUrl();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getBalance',
      params: [address],
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.result.value / LAMPORTS_PER_SOL;
}

export function WalletInfo() {
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58();

  const { data: balance, isLoading, error } = useQuery({
    queryKey: ['wallet-balance', address],
    queryFn: () => address ? fetchBalance(address) : null,
    enabled: !!address,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (!address) return null;

  if (isLoading) {
    return (
      <Card className="bg-black/40 border-purple-500/30">
        <CardContent className="p-4">
          <Skeleton className="h-4 w-24 bg-purple-500/20" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-black/40 border-purple-500/30">
        <CardContent className="p-4">
          <p className="text-red-400 text-sm">Error loading wallet info</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-purple-300/60">Balance</span>
          <span className="text-purple-200 font-mono">
            {balance?.toFixed(4)} SOL
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
