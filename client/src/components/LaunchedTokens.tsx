import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineChart, Plus } from "lucide-react";
import { ChatRoom } from "@/components/ChatRoom";
import { TokenChart } from "@/components/TokenChart";
import { TokenPrediction } from "@/components/TokenPrediction";
import { TokenRecommendations } from "@/components/TokenRecommendations";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TokenDetails } from "./TokenDetails";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from "@/contexts/AuthContext";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

interface TokenCard {
  name: string;
  symbol: string;
  mintAddress: string;
  imageUrl: string;
  description: string;
  createdAt: string;
  isComplete?: boolean;
}

type SortOption = 'newest' | 'oldest' | 'nameAsc' | 'nameDesc';
type FilterOption = 'all' | 'bonding' | 'dex';

export function LaunchedTokens() {
  const { isAuthenticated } = useAuth();
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [selectedToken, setSelectedToken] = useState<TokenCard | null>(null);

  const { data: tokens, isLoading, error } = useQuery<TokenCard[]>({
    queryKey: ['launchedTokens'],
    queryFn: async () => {
      try {
        console.log("Fetching launched tokens...");
        const response = await apiRequest<TokenCard[]>('/api/tokens/launched');
        console.log("Received response:", response);
        return response || [];
      } catch (err) {
        console.error("Error fetching launched tokens:", err);
        throw err;
      }
    },
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated ? 30000 : false,
  });

  if (!isAuthenticated) {
    return (
      <Card className="bg-black/40 border-purple-500/30">
        <CardContent className="p-6 text-center text-sm text-purple-300/70">
          Sign in with your CLAWD holder session to view launched tokens and launch analytics.
        </CardContent>
      </Card>
    );
  }

  const sortedAndFilteredTokens = tokens ? tokens
    .filter(token => {
      if (filter === 'all') return true;
      if (filter === 'bonding') return !token.isComplete;
      return token.isComplete;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'nameAsc':
          return a.name.localeCompare(b.name);
        case 'nameDesc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    }) : [];

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full grid grid-cols-12 gap-6 animate-pulse">
        <div className="col-span-12 lg:col-span-3">
          <Card className="bg-black/40 border-purple-500/30">
            <CardContent className="p-6">
              <Skeleton className="h-8 w-48 mb-2"/>
              <Skeleton className="h-6 w-24"/>
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12 lg:col-span-9">
          <Card className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-purple-500/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48 mb-2"/>
                <Skeleton className="h-8 w-24"/>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12">
          <Skeleton className="h-48 w-full"/>
        </div>
        <div className="col-span-12">
          <div className="flex justify-between items-center mb-6">
            <Skeleton className="h-8 w-48"/>
            <Skeleton className="h-8 w-24"/>
          </div>
          <ScrollArea className="h-[600px] pr-4">
              <div className="grid grid-cols-1 gap-6">
                {[1,2,3].map((i) => (
                  <Card key={i} className="bg-black/40 border-purple-500/30">
                    <CardContent className="p-6">
                      <Skeleton className="h-[300px] w-full"/>
                    </CardContent>
                  </Card>
                ))}
              </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full grid grid-cols-12 gap-6">
        <div className="col-span-12">
          <Card className="w-full bg-black/40 border-purple-500/30">
            <CardContent className="p-6 text-center">
              <p className="text-red-400 mb-4">Error loading tokens: {error instanceof Error ? error.message : 'Unknown error'}</p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="text-purple-400 border-purple-500/30"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Empty state
  if (!sortedAndFilteredTokens || sortedAndFilteredTokens.length === 0) {
    return (
      <div className="w-full grid grid-cols-12 gap-6">
        <div className="col-span-12">
          <Card className="bg-black/40 border-purple-500/30">
            <CardContent className="p-12 text-center">
              <p className="text-purple-300/60 mb-4">No tokens have been launched yet. Be the first to launch!</p>
              <Button className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700">
                Launch New Token
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full grid grid-cols-12 gap-6">
      {/* Balance Section - Top Left */}
      <div className="col-span-12 lg:col-span-3">
        <Card className="bg-black/40 border-purple-500/30">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-purple-200 mb-2">Your Balance</h3>
            <div className="text-2xl font-bold text-white">0.00 SOL</div>
            <p className="text-sm text-gray-400 mt-1">≈ $0.00 USD</p>
          </CardContent>
        </Card>
      </div>

      {/* Launch New Token Button - Top Right */}
      <div className="col-span-12 lg:col-span-9">
        <Card className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-purple-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Launch Your Token</h3>
                <p className="text-gray-300">Create and launch your own token with AI-powered features</p>
              </div>
              <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500">
                <Plus className="w-4 h-4 mr-2" />
                Launch New Token
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations */}
      <div className="col-span-12">
        <TokenRecommendations />
      </div>

      {/* Token List Section */}
      <div className="col-span-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-purple-200">Recently Launched Tokens</h2>
          <div className="flex gap-2">
            {['1h', '24h', '7d', '30d'].map((tf) => (
              <Button
                key={tf}
                variant={selectedTimeframe === tf ? 'default' : 'outline'}
                onClick={() => setSelectedTimeframe(tf as '1h' | '24h' | '7d' | '30d')}
                className="text-sm"
              >
                {tf.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {/* Sort Buttons */}
          <Button
            variant={sortBy === 'newest' ? 'default' : 'outline'}
            onClick={() => setSortBy('newest')}
          >
            Newest
          </Button>
          <Button
            variant={sortBy === 'oldest' ? 'default' : 'outline'}
            onClick={() => setSortBy('oldest')}
          >
            Oldest
          </Button>
          <Button
            variant={sortBy === 'nameAsc' ? 'default' : 'outline'}
            onClick={() => setSortBy('nameAsc')}
          >
            Name A-Z
          </Button>
          <Button
            variant={sortBy === 'nameDesc' ? 'default' : 'outline'}
            onClick={() => setSortBy('nameDesc')}
          >
            Name Z-A
          </Button>
        </div>

        <div className="flex gap-2 mb-4">
          {/* Filter Buttons */}
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'bonding' ? 'default' : 'outline'}
            onClick={() => setFilter('bonding')}
          >
            Bonding Curve
          </Button>
          <Button
            variant={filter === 'dex' ? 'default' : 'outline'}
            onClick={() => setFilter('dex')}
          >
            DEX
          </Button>
        </div>

        <ScrollArea className="h-[600px] pr-4">
          <div className="grid grid-cols-1 gap-6">
            {sortedAndFilteredTokens.map((token) => (
              <Card
                key={token.mintAddress}
                className="bg-black/40 border-purple-500/30 hover:border-purple-500/60 transition-all cursor-pointer"
                onClick={() => setSelectedToken(token)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={token.imageUrl}
                        alt={token.name}
                        className="w-12 h-12 rounded-full"
                        loading="lazy"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-purple-200">{token.name}</h3>
                          {token.isComplete ? (
                            <Badge variant="secondary" className="bg-green-500/10 text-green-400">
                              DEX
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-400">
                              Bonding Curve
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-mono text-purple-400">${token.symbol}</p>
                        <p className="text-sm text-gray-400">
                          {formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div onClick={(event) => event.stopPropagation()}>
                      <ClawdTokenAction
                        mintAddress={token.mintAddress}
                        symbol={token.symbol}
                        name={token.name}
                        logoURI={token.imageUrl}
                        variant="inline"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <TokenChart
                      mintAddress={token.mintAddress}
                      timeframe={selectedTimeframe}
                    />
                  </div>

                  <div className="mt-4">
                    <TokenPrediction
                      mintAddress={token.mintAddress}
                      currentPrice={0}
                    />
                  </div>

                  <div className="mt-4 rounded-lg border border-purple-500/20 bg-black/20 p-4">
                    <p className="text-sm text-purple-200">Token chat is available from the dedicated room flow.</p>
                    <Button
                      variant="outline"
                      className="w-full mt-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://solscan.io/token/${token.mintAddress}`, "_blank");
                      }}
                    >
                      <LineChart className="h-4 w-4 mr-2" />
                      View on Solscan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={!!selectedToken} onOpenChange={() => setSelectedToken(null)}>
        <DialogContent className="max-w-4xl bg-black/95 border-purple-500/30">
          {selectedToken && (
            <TokenDetails
              mintAddress={selectedToken.mintAddress}
              symbol={selectedToken.symbol}
              onClose={() => setSelectedToken(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
