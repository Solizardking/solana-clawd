import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from '@/components/ui/alert';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  AlertTriangle,
  Flame
} from 'lucide-react';
import { 
  PublicKey, 
  Connection, 
  Transaction, 
  TransactionInstruction, 
  sendAndConfirmTransaction, 
  Keypair,
  ComputeBudgetProgram,
  VersionedTransaction,
  TransactionMessage
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as spl from '@solana/spl-token';
import { useToast } from "@/hooks/use-toast";
import { HeliusService } from "@/lib/heliusService";

interface TokenBurnFormProps {
  // Optional initial token address to burn
  mintAddress?: string;
}

export default function TokenBurnForm({ mintAddress = '' }: TokenBurnFormProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { toast } = useToast();
  
  const [tokenAddress, setTokenAddress] = useState<string>(mintAddress);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [closeAccount, setCloseAccount] = useState<boolean>(true);
  
  // Show a confirmation dialog before burning
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tokenAddress.trim()) {
      setError('Please enter a token address');
      return;
    }
    
    setShowConfirmation(true);
  };
  
  const performBurn = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Please connect your wallet first');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Call the API endpoint to burn the token
      const response = await fetch('/api/helius/burn-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mintAddress: tokenAddress,
          walletAddress: wallet.publicKey.toString(),
          closeAccount: closeAccount
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to burn token');
      }
      
      const result = await response.json();
      
      setSuccess(`Successfully burned the token! Transaction signature: ${result.data.signature}`);
      toast({
        title: "Success!",
        description: "Token successfully burned and account closed",
      });
      
      // Reset the form
      setTokenAddress('');
    } catch (err: any) {
      console.error('Error burning token:', err);
      setError(`Failed to burn token: ${err.message}`);
      toast({
        title: "Error burning token",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      setShowConfirmation(false);
    }
  };
  
  const handleBurnManually = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Please connect your wallet first');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    
    try {
      const mintPublicKey = new PublicKey(tokenAddress);
      
      // Get the associated token account
      const associatedTokenAddress = await spl.getAssociatedTokenAddress(
        mintPublicKey,
        wallet.publicKey,
      );
      
      // Create instructions
      const instructions = [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 45000 })
      ];
      
      // Add burn instruction
      instructions.push(
        spl.createBurnCheckedInstruction(
          associatedTokenAddress,
          mintPublicKey,
          wallet.publicKey,
          1, // Amount to burn, use proper amount calculation for actual implementation
          0  // Decimals, should be fetched dynamically in real implementation
        )
      );
      
      // Add close account instruction if selected
      if (closeAccount) {
        instructions.push(
          spl.createCloseAccountInstruction(
            associatedTokenAddress,
            wallet.publicKey,
            wallet.publicKey
          )
        );
      }
      
      // Create transaction
      const recentBlockhash = await connection.getLatestBlockhash();
      
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: recentBlockhash.blockhash,
        instructions
      }).compileToV0Message();
      
      const transaction = new VersionedTransaction(messageV0);
      
      // Sign and send the transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      const { signature } = await HeliusService.sendSignedTransaction(
        Buffer.from(signedTransaction.serialize()).toString("base64"),
        { skipPreflight: false, maxRetries: 3 },
      );
      
      // Confirm transaction
      await connection.confirmTransaction({
        signature,
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
      });
      
      setSuccess(`Successfully burned the token! Transaction signature: ${signature}`);
      toast({
        title: "Success!",
        description: "Token successfully burned and account closed",
      });
      
      // Reset the form
      setTokenAddress('');
    } catch (err: any) {
      console.error('Error burning token:', err);
      setError(`Failed to burn token: ${err.message}`);
      toast({
        title: "Error burning token",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      setShowConfirmation(false);
    }
  };
  
  const closeEmptyAccounts = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Please connect your wallet first');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Call the API endpoint to close empty token accounts
      const response = await fetch('/api/helius/close-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: wallet.publicKey.toString()
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to close empty accounts');
      }
      
      const result = await response.json();
      
      if (result.data.accountsClosed > 0) {
        setSuccess(`Successfully closed ${result.data.accountsClosed} empty accounts! Transaction signature: ${result.data.signature}`);
        toast({
          title: "Success!",
          description: `Closed ${result.data.accountsClosed} empty token accounts`,
        });
      } else {
        setSuccess('No empty accounts found to close');
        toast({
          title: "No action needed",
          description: "No empty accounts found to close",
        });
      }
    } catch (err: any) {
      console.error('Error closing empty accounts:', err);
      setError(`Failed to close empty accounts: ${err.message}`);
      toast({
        title: "Error closing accounts",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-red-500" />
          Token Burn
        </CardTitle>
        <CardDescription>
          Burn unwanted tokens and recover rent by closing token accounts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!wallet.connected ? (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Wallet not connected</AlertTitle>
            <AlertDescription>
              Connect your wallet to burn tokens or close empty accounts.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-address">Token Mint Address</Label>
              <Input
                id="token-address"
                placeholder="Enter token mint address to burn"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="close-account" 
                checked={closeAccount} 
                onCheckedChange={(checked) => setCloseAccount(checked as boolean)}
                disabled={isProcessing}
              />
              <Label htmlFor="close-account" className="text-sm">
                Close account after burning (recover rent)
              </Label>
            </div>
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="mt-4 bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-50">
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </form>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button 
          onClick={closeEmptyAccounts} 
          disabled={isProcessing || !wallet.connected} 
          variant="outline"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Close Empty Accounts"
          )}
        </Button>
        
        <Button 
          onClick={handleSubmit} 
          disabled={isProcessing || !tokenAddress.trim() || !wallet.connected}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Burn Token"
          )}
        </Button>
      </CardFooter>
      
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Token Burn</DialogTitle>
            <DialogDescription>
              Are you sure you want to burn this token? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm font-medium">Token address:</p>
            <p className="text-sm text-gray-500 break-all">{tokenAddress}</p>
            {closeAccount && (
              <p className="mt-2 text-sm text-gray-500">
                The token account will be closed, and you will recover the rent.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmation(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={performBurn}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Burn Token"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
