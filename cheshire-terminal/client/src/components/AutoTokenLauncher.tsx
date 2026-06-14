import { useState } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { TokenLaunchForm } from './TokenLaunchForm';

interface TokenLaunchResponse {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  mintAddress: string;
  signature: string;
  buyers?: string[];
}

export function AutoTokenLauncher() {
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();

  const launchMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!publicKey) throw new Error("Wallet not connected");

      // Add wallet address to form data
      data.append('wallet', publicKey.toBase58());

      // Determine if this is a bulk launch
      const hasBuyers = data.get('buyerWallets');
      const endpoint = hasBuyers ? '/api/tokens/bundle-buy' : '/api/tokens/auto-launch';

      const response = await apiRequest<TokenLaunchResponse>(endpoint, {
        method: 'POST',
        body: data
      });

      if (!response) {
        throw new Error("Failed to launch token");
      }

      return response;
    },
    onSuccess: (data) => {
      const buyerInfo = data.buyers?.length 
        ? `\nToken distributed to ${data.buyers.length} additional buyers`
        : '';

      toast({
        title: "Token Launched! 🚀",
        description: `Successfully launched ${data.name} ($${data.symbol})\nMint Address: ${data.mintAddress}\nTransaction: ${data.signature}${buyerInfo}`,
      });
    },
    onError: (error) => {
      console.error("Launch error:", error);
      toast({
        title: "Launch Failed",
        description: error instanceof Error ? error.message : "Failed to launch token",
        variant: "destructive"
      });
    }
  });

  if (!connected) {
    return (
      <div className="text-center text-purple-300/60 p-4">
        Please connect your wallet to launch tokens
      </div>
    );
  }

  return <TokenLaunchForm launchMutation={launchMutation} />;
}