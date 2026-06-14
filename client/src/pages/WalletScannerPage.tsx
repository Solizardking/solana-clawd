import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from '@/components/ui/alert';
import { 
  Search, 
  Loader2, 
  AlertTriangle,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import AnimatedGradientText from '@/components/AnimatedGradientText';

// Define types for our data
interface AssetData {
  id: string;
  content: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
    };
  };
  ownership: {
    owner: string;
    frozen: boolean;
    delegated: boolean;
    delegate: string | null;
    ownership_model: string;
  };
  tokenStandard: string;
  [key: string]: any;
}

// Helper function to format wallet addresses
const formatAddress = (address: string): string => {
  if (!address) return '';
  return address.slice(0, 4) + '...' + address.slice(-4);
};

export default function WalletScannerPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [searchAddress, setSearchAddress] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');

  // Fetch wallet assets
  const { 
    data: walletAssets, 
    isLoading, 
    isFetching, 
    error, 
    refetch 
  } = useQuery({
    queryKey: ['walletAssets', searchAddress],
    queryFn: async () => {
      if (!searchAddress) return null;
      const response = await fetch(`/api/helius/wallet-assets/${searchAddress}`);
      if (!response.ok) {
        throw new Error('Failed to fetch wallet details');
      }
      return response.json();
    },
    enabled: !!searchAddress,
    retry: 1,
  });

  // Handle form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setSearchAddress(inputValue.trim());
    }
  };

  // Use connected wallet address
  const connectAndUseWallet = () => {
    if (wallet.publicKey) {
      setInputValue(wallet.publicKey.toString());
      setSearchAddress(wallet.publicKey.toString());
    } else if (wallet.wallet && !wallet.connected) {
      wallet.connect();
    }
  };

  // Extract tokens and NFTs from assets
  const assets: AssetData[] = walletAssets?.data?.assets || [];
  const tokens = assets.filter((asset: AssetData) => 
    asset.tokenStandard !== 'NonFungible' && 
    asset.tokenStandard !== 'ProgrammableNonFungible'
  );
  const nfts = assets.filter((asset: AssetData) => 
    asset.tokenStandard === 'NonFungible' || 
    asset.tokenStandard === 'ProgrammableNonFungible'
  );

  // Handle burning tokens/NFTs by redirecting to burn page with the mint address
  const handleBurn = (mintAddress: string) => {
    // Navigate to the burn page with the mint address as query parameter
    window.location.href = `/burn?mint=${encodeURIComponent(mintAddress)}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <AnimatedGradientText>Solana Wallet Scanner</AnimatedGradientText>
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Scan any Solana wallet address to view its tokens and NFTs
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wallet Scanner</CardTitle>
          <CardDescription>
            Enter a Solana wallet address to view its tokens and NFTs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <form onSubmit={handleSearch} className="flex flex-1 space-x-2">
                <Input
                  placeholder="Enter Solana wallet address"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={!inputValue.trim() || isLoading || isFetching}
                >
                  {isLoading || isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Scan
                    </>
                  )}
                </Button>
              </form>
              
              <Button
                onClick={connectAndUseWallet}
                disabled={isLoading || isFetching}
                variant="outline"
              >
                {wallet.connected ? 'Use My Wallet' : 'Connect Wallet'}
              </Button>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to fetch wallet details. Please check the address and try again.
                </AlertDescription>
              </Alert>
            ) : (
              searchAddress && !isLoading && !isFetching && assets.length === 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No assets found</AlertTitle>
                  <AlertDescription>
                    This wallet doesn't have any tokens or NFTs, or the address may be incorrect.
                  </AlertDescription>
                </Alert>
              )
            )}

            {searchAddress && !isLoading && !isFetching && assets.length > 0 && (
              <Tabs defaultValue="tokens" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="tokens">
                    Tokens <Badge variant="outline" className="ml-2">{tokens.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="nfts">
                    NFTs <Badge variant="outline" className="ml-2">{nfts.length}</Badge>
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="tokens">
                  <div className="rounded-md border">
                    <Table>
                      <TableCaption>List of fungible tokens in wallet {formatAddress(searchAddress)}</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead className="hidden md:table-cell">Token ID</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tokens.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                              No tokens found in this wallet
                            </TableCell>
                          </TableRow>
                        ) : (
                          tokens.map((token) => (
                            <TableRow key={token.id}>
                              <TableCell className="font-medium">
                                {token.content.metadata?.name || 'Unknown Token'}
                              </TableCell>
                              <TableCell>
                                {token.content.metadata?.symbol || 'N/A'}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {formatAddress(token.id)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => {
                                    window.open(`https://solscan.io/token/${token.id}`, '_blank');
                                  }}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  {wallet.connected && wallet.publicKey?.toString() === searchAddress && (
                                    <Button variant="destructive" size="sm" onClick={() => handleBurn(token.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                
                <TabsContent value="nfts">
                  <div className="rounded-md border">
                    <Table>
                      <TableCaption>List of NFTs in wallet {formatAddress(searchAddress)}</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Collection</TableHead>
                          <TableHead className="hidden md:table-cell">NFT ID</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nfts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-gray-500">
                              No NFTs found in this wallet
                            </TableCell>
                          </TableRow>
                        ) : (
                          nfts.map((nft) => (
                            <TableRow key={nft.id}>
                              <TableCell className="font-medium">
                                {nft.content.metadata?.name || 'Unknown NFT'}
                              </TableCell>
                              <TableCell>
                                {nft.content.metadata?.symbol || 'N/A'}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {formatAddress(nft.id)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => {
                                    window.open(`https://solscan.io/token/${nft.id}`, '_blank');
                                  }}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  {wallet.connected && wallet.publicKey?.toString() === searchAddress && (
                                    <Button variant="destructive" size="sm" onClick={() => handleBurn(nft.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}