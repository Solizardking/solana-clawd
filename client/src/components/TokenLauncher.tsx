// @ts-nocheck
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Keypair } from '@solana/web3.js';
import { PumpFunService, TokenMetadata, TradeEvent } from '@/lib/pumpFunService';
import { useAnchorProvider } from '@/hooks/useAnchorProvider';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Switch } from "@/components/ui/switch";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB max file size

export function TokenLauncher() {
  const { connected, publicKey } = useWallet();
  const provider = useAnchorProvider();
  const { toast } = useToast();
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTrade, setLastTrade] = useState<TradeEvent | null>(null);
  const [isTestMode, setIsTestMode] = useState(true); // Default to test mode
  const [virtualBalance, setVirtualBalance] = useState<{sol: string, tokens: Map<string, string>} | null>(null);

  const [formData, setFormData] = useState<TokenMetadata>({
    name: '',
    symbol: '',
    description: '',
    file: null as unknown as Blob,
    telegram: '',
    twitter: '',
    website: ''
  });

  const [launchParams, setLaunchParams] = useState({
    initialBuySol: 0.1,
    slippageBasisPoints: 500,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        e.target.value = ''; // Reset input
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file');
        e.target.value = '';
        return;
      }

      setFormData(prev => ({ ...prev, file }));
      setError(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLaunchParams(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  useEffect(() => {
    if (provider && publicKey) {
      const pumpFunService = new PumpFunService(provider, isTestMode);

      // Set up trade event listener
      pumpFunService.addEventListener('tradeEvent', (event: TradeEvent) => {
        setLastTrade(event);
        toast({
          title: event.isBuy ? "Token Purchase" : "Token Sale",
          description: `${event.isBuy ? "Bought" : "Sold"} ${Number(event.tokenAmount) / 10 ** 6} tokens for ${Number(event.solAmount) / LAMPORTS_PER_SOL} SOL`,
          variant: "default"
        });
      });

      // Get virtual balance in test mode
      if (isTestMode) {
        const balance = pumpFunService.getVirtualBalance(publicKey.toBase58());
        if (balance) {
          setVirtualBalance({
            sol: (Number(balance.sol) / LAMPORTS_PER_SOL).toFixed(2),
            tokens: new Map(
              Array.from(balance.tokens.entries()).map(([mint, amount]) => 
                [mint, (Number(amount) / 10 ** 6).toFixed(2)]
              )
            )
          });
        }
      }
    }
  }, [provider, publicKey, isTestMode]);

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        const maxDimension = 800;

        if (width > height && width > maxDimension) {
          height *= maxDimension / width;
          width = maxDimension;
        } else if (height > maxDimension) {
          width *= maxDimension / height;
          height = maxDimension;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!connected || !provider || !publicKey) {
      setError("Please connect your wallet to launch a token");
      return;
    }

    if (!isTestMode) {
      setError("Production launches require a wallet-adapter transaction builder and are disabled in this browser flow. Re-enable Test Mode to simulate launches safely.");
      return;
    }

    try {
      setIsLaunching(true);

      // Compress image before upload
      if (formData.file instanceof File) {
        try {
          const compressedImage = await compressImage(formData.file);
          formData.file = compressedImage;
        } catch (err) {
          console.error('Image compression failed:', err);
          setError('Failed to process image. Please try a different image.');
          return;
        }
      }

      const pumpFunService = new PumpFunService(provider, isTestMode);
      const mintKeypair = Keypair.generate();

      console.log('Launching token with params:', {
        formData,
        launchParams,
        mintKeypair: mintKeypair.publicKey.toBase58(),
        testMode: isTestMode
      });

      const result = await pumpFunService.createAndBuyToken(
        { publicKey } as Keypair,
        mintKeypair,
        formData,
        launchParams.initialBuySol,
        BigInt(launchParams.slippageBasisPoints)
      );

      if (result.success) {
        toast({
          title: `Token launched successfully in ${isTestMode ? 'test' : 'production'} mode!`,
          description: `View your token at ${result.url}`,
          variant: "default"
        });

        // Reset form after successful launch
        setFormData({
          name: '',
          symbol: '',
          description: '',
          file: null as unknown as Blob,
          telegram: '',
          twitter: '',
          website: ''
        });
      } else {
        setError(result.error || "Failed to launch token");
        toast({
          title: "Launch failed",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to launch token";
      setError(errorMessage);
      toast({
        title: "Launch failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
          Launch New Token
        </CardTitle>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              checked={isTestMode}
              onCheckedChange={setIsTestMode}
              id="test-mode"
            />
            <Label htmlFor="test-mode" className="text-sm text-muted-foreground">
              Test Mode {isTestMode ? "Enabled" : "Disabled"}
            </Label>
          </div>
          {lastTrade && (
            <Badge variant="secondary" className="bg-purple-500/10 text-purple-400">
              Last Trade: {Number(lastTrade.tokenAmount) / 10 ** 6} tokens
            </Badge>
          )}
        </div>
        {isTestMode && virtualBalance && (
          <div className="mt-2 text-sm text-muted-foreground">
            <p>Test Balance: {virtualBalance.sol} SOL</p>
            {virtualBalance.tokens.size > 0 && (
              <div className="mt-1">
                <p>Test Tokens:</p>
                {Array.from(virtualBalance.tokens.entries()).map(([mint, amount]) => (
                  <p key={mint} className="ml-2">
                    {amount} {mint.slice(0, 4)}...{mint.slice(-4)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!connected ? (
          <div className="text-center py-8">
            <p className="mb-4 text-muted-foreground">Connect your wallet to launch tokens</p>
            <WalletMultiButton />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Token Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol">Token Symbol</Label>
              <Input
                id="symbol"
                name="symbol"
                value={formData.symbol}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="initialBuySol">Initial Buy Amount (SOL)</Label>
              <Input
                id="initialBuySol"
                name="initialBuySol"
                type="number"
                step="0.1"
                min="0.1"
                value={launchParams.initialBuySol}
                onChange={handleParamChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slippageBasisPoints">Slippage Tolerance (basis points)</Label>
              <Input
                id="slippageBasisPoints"
                name="slippageBasisPoints"
                type="number"
                min="1"
                max="1000"
                value={launchParams.slippageBasisPoints}
                onChange={handleParamChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Token Logo (Max 1MB)</Label>
              <Input
                id="file"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram">Telegram (Optional)</Label>
              <Input
                id="telegram"
                name="telegram"
                value={formData.telegram}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website (Optional)</Label>
              <Input
                id="website"
                name="website"
                value={formData.website}
                onChange={handleInputChange}
              />
            </div>

            {!isTestMode && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertDescription>
                  Production launches are disabled in this browser flow until the transaction builder signs with the connected wallet.
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLaunching || !isTestMode}
            >
              {isLaunching ? "Launching..." : isTestMode ? "Launch Test Token" : "Production Launch Disabled"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
