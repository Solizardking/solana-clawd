import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowUpDown, RefreshCcw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

interface TokenTradingProps {
  mintAddress: string;
  tokenSymbol: string;
}

interface TokenPrice {
  price: number;
  virtualSolReserves: string;
  virtualTokenReserves: string;
  realSolReserves: string;
  realTokenReserves: string;
}

export function TokenTrading({ mintAddress, tokenSymbol }: TokenTradingProps) {
  const { publicKey, connected } = useWallet();
  const [amount, setAmount] = useState("");
  const [isBuying, setIsBuying] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for token price and reserves
  const priceQuery = useQuery<TokenPrice>({
    queryKey: [`/api/tokens/${mintAddress}/price`],
    enabled: !!mintAddress,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Calculate estimated output
  const estimatedOutput = (parseFloat(amount) || 0) * (priceQuery.data?.price || 0);

  // Trading mutation
  const tradeMutation = useMutation({
    mutationFn: async (data: { action: 'buy' | 'sell', amount: string }) => {
      return apiRequest(`/api/tokens/${mintAddress}/${data.action}`, {
        method: 'POST',
        body: JSON.stringify({
          amount: data.amount,
          wallet: publicKey?.toBase58(),
        }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Transaction Successful!",
        description: `Successfully ${isBuying ? 'bought' : 'sold'} ${amount} ${tokenSymbol}`,
      });
      setAmount("");

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/tokens/${mintAddress}/price`] });
    },
    onError: (error) => {
      toast({
        title: "Transaction Failed",
        description: error instanceof Error ? error.message : "Failed to execute trade",
        variant: "destructive",
      });
    },
  });

  const handleTrade = async () => {
    if (!connected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to trade tokens",
        variant: "destructive",
      });
      return;
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount to trade",
        variant: "destructive",
      });
      return;
    }

    try {
      await tradeMutation.mutateAsync({
        action: isBuying ? 'buy' : 'sell',
        amount,
      });
    } catch (error) {
      console.error("Trade error:", error);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-black/40 border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
            Trade {tokenSymbol}
          </CardTitle>
          <ClawdTokenAction mintAddress={mintAddress} symbol={tokenSymbol} variant="badge" />
        </div>
        {priceQuery.data && (
          <CardDescription className="text-center">
            Current Price: {priceQuery.data.price.toFixed(6)} SOL
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsBuying(!isBuying)}
            className="text-purple-400 hover:text-purple-300"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            {isBuying ? 'Switch to Sell' : 'Switch to Buy'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => priceQuery.refetch()}
            disabled={priceQuery.isFetching}
            className="text-purple-400 hover:text-purple-300"
          >
            <RefreshCcw className={`h-4 w-4 ${priceQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              type="number"
              placeholder={`Amount of ${tokenSymbol} to ${isBuying ? 'buy' : 'sell'}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-black/20"
            />
            {amount && !isNaN(parseFloat(amount)) && (
              <div className="text-sm text-gray-400 text-right">
                ≈ {estimatedOutput.toFixed(6)} SOL
              </div>
            )}
          </div>

          <Button
            onClick={handleTrade}
            disabled={tradeMutation.isPending || !amount || !connected}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
          >
            {tradeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {isBuying ? 'Buying...' : 'Selling...'}
              </>
            ) : (
              `${isBuying ? 'Buy' : 'Sell'} ${tokenSymbol}`
            )}
          </Button>
        </div>

        {priceQuery.data && (
          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <div>Real SOL Reserves: {(Number(priceQuery.data.realSolReserves) / LAMPORTS_PER_SOL).toFixed(4)} SOL</div>
            <div>Real Token Reserves: {(Number(priceQuery.data.realTokenReserves) / LAMPORTS_PER_SOL).toFixed(4)} {tokenSymbol}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
