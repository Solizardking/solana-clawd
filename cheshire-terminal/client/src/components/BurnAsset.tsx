import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { burnService } from '../lib/burnService';
import { AlertCircle, Flame, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function BurnAsset() {
  const { publicKey, connected } = useWallet();
  const [assetId, setAssetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    signature?: string;
    error?: string;
  } | null>(null);

  const handleBurn = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!assetId || assetId.length < 32) {
      toast.error('Please enter a valid asset ID');
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      
      // Check if the asset is burnable by the current wallet
      const isBurnable = await burnService.isAssetBurnable(assetId, publicKey);
      
      if (!isBurnable) {
        toast.error('This asset cannot be burned. You might not be the owner.');
        setLoading(false);
        return;
      }
      
      // Get the wallet 
      const solanaWallet = (window as any).solana;
      
      if (!solanaWallet || !solanaWallet.signTransaction) {
        toast.error('Wallet connection error. Try reconnecting your wallet.');
        setLoading(false);
        return;
      }
      
      // Execute the burn
      const burnResult = await burnService.burnAsset({
        assetId,
        wallet: {
          publicKey,
          signTransaction: solanaWallet.signTransaction.bind(solanaWallet)
        }
      });
      
      setResult(burnResult);
      
      if (burnResult.success) {
        toast.success('Asset burned successfully!');
      } else {
        toast.error(burnResult.error || 'Failed to burn asset');
      }
    } catch (error) {
      console.error('Error during burn:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      toast.error('Error during burn operation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-red-500" />
          Burn Assets
        </CardTitle>
        <CardDescription>
          Burn your tokens or NFTs to remove them from circulation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="assetId">Asset ID (Token or NFT address)</Label>
            <Input
              id="assetId"
              placeholder="Enter token or NFT mint address"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{result.success ? 'Success' : 'Error'}</AlertTitle>
              <AlertDescription>
                {result.success
                  ? `Asset burned successfully. Transaction: ${result.signature}`
                  : `Failed to burn asset: ${result.error}`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleBurn} 
          disabled={!connected || loading || !assetId}
          className="w-full"
          variant="destructive"
        >
          {loading ? 'Processing...' : 'Burn Asset'}
        </Button>
      </CardFooter>
    </Card>
  );
}