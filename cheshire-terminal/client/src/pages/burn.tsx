import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import TokenBurnForm from '@/components/TokenBurnForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Flame } from 'lucide-react';
import AnimatedGradientText from '@/components/AnimatedGradientText';

export default function BurnPage() {
  const wallet = useWallet();
  const [mintAddress, setMintAddress] = useState<string>('');
  
  // Read the mint address from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mint = params.get('mint');
    if (mint) {
      setMintAddress(mint);
    }
  }, []);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">
          <AnimatedGradientText>Solana Token Burn</AnimatedGradientText>
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Safely burn unwanted tokens and NFTs from your wallet. Close empty token accounts to recover rent fees.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <Tabs defaultValue="burn">
          <TabsList className="mb-6 grid grid-cols-2">
            <TabsTrigger value="burn" className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-500" />
              <span>Burn Tokens</span>
            </TabsTrigger>
            <TabsTrigger value="info">Information</TabsTrigger>
          </TabsList>
          
          <TabsContent value="burn">
            <TokenBurnForm mintAddress={mintAddress} />
          </TabsContent>
          
          <TabsContent value="info">
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <h3 className="text-lg font-semibold mb-2">What is token burning?</h3>
                <p className="text-muted-foreground">
                  Token burning is the process of permanently removing tokens from circulation by sending them to an address where they cannot be retrieved. When you burn tokens on Solana, you can also close the associated token account to recover the rent (SOL) that was used to create it.
                </p>
              </div>
              
              <div className="rounded-lg border p-4">
                <h3 className="text-lg font-semibold mb-2">Benefits of burning tokens:</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Remove unwanted or spam tokens from your wallet</li>
                  <li>Close empty token accounts to recover SOL rent fees</li>
                  <li>Clean up your wallet for better organization</li>
                  <li>Reduce the number of accounts associated with your wallet</li>
                </ul>
              </div>
              
              <div className="rounded-lg border p-4">
                <h3 className="text-lg font-semibold mb-2">How to use this tool:</h3>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Connect your Solana wallet</li>
                  <li>Enter the mint address of the token you want to burn</li>
                  <li>Choose whether to close the token account after burning</li>
                  <li>Confirm the transaction in your wallet</li>
                </ol>
                <p className="mt-2 text-muted-foreground">
                  You can also use the "Close Empty Accounts" button to automatically find and close all empty token accounts in your wallet, recovering SOL for each one.
                </p>
              </div>
              
              <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-900 dark:text-red-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important Warning</AlertTitle>
                <AlertDescription>
                  Burning tokens is irreversible. Once burned, the tokens cannot be recovered. Always double-check the mint address before confirming any burn transaction.
                </AlertDescription>
              </Alert>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}