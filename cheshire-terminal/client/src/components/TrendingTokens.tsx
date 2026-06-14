import { useState, useEffect } from 'react';
import { useTrendingTokens, useLatestTokens } from '@/lib/solanaTracker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { ClawdTokenAction } from '@/components/ClawdTokenAction';

export function TrendingTokens() {
  const { data: trendingTokens, isLoading: isTrendingLoading } = useTrendingTokens('1h');
  const { data: latestTokens, isLoading: isLatestLoading } = useLatestTokens(1);
  const [visibleTokens, setVisibleTokens] = useState<number[]>([]);
  const [showLatest, setShowLatest] = useState(false);

  useEffect(() => {
    const tokens = showLatest ? latestTokens : trendingTokens;
    if (!tokens) return;

    // Initialize with first few tokens
    setVisibleTokens([0, 1, 2]);

    // Rotate through tokens
    const interval = setInterval(() => {
      setVisibleTokens(prev => {
        const next = prev.map(i => (i + 1) % (tokens.length || 1));
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [trendingTokens?.length, latestTokens?.length, showLatest]);

  const isLoading = showLatest ? isLatestLoading : isTrendingLoading;
  const tokens = showLatest ? latestTokens : trendingTokens;

  if (isLoading) {
    return (
      <div className="w-full bg-black/40 border-b border-purple-500/30 p-2">
        <div className="flex gap-4">
          <Skeleton className="h-6 w-48 bg-purple-500/20" />
          <Skeleton className="h-6 w-48 bg-purple-500/20" />
          <Skeleton className="h-6 w-48 bg-purple-500/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-black/40 border-b border-purple-500/30">
      <div className="flex justify-between items-center px-4 py-2 border-b border-purple-500/20">
        <div className="flex gap-4">
          <button
            className={`text-sm ${!showLatest ? 'text-purple-200' : 'text-purple-400'}`}
            onClick={() => setShowLatest(false)}
          >
            Trending 🔥
          </button>
          <button
            className={`text-sm ${showLatest ? 'text-purple-200' : 'text-purple-400'}`}
            onClick={() => setShowLatest(true)}
          >
            Latest 🆕
          </button>
        </div>
      </div>
      <ScrollArea className="h-12">
        <div className="flex items-center px-4 py-1">
          <AnimatePresence>
            {visibleTokens.map((index) => {
              const token = tokens?.[index];
              if (!token) return null;

              const priceChange = token.events['1h']?.priceChangePercentage || 0;
              const isPositive = priceChange > 0;
              const price = token.pools[0]?.price?.usd || 0;

              return (
                <motion.div
                  key={token.token.mint}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between space-x-8 min-w-[300px]"
                >
                  <div className="flex items-center gap-2">
                    {token.token.image && (
                      <img 
                        src={token.token.image} 
                        alt={token.token.symbol}
                        className="w-5 h-5 rounded-full"
                      />
                    )}
                    <span className="text-sm font-medium text-purple-100">
                      {token.token.symbol}
                    </span>
                    <span
                      className={`text-xs ${
                        isPositive ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {isPositive ? '↑' : '↓'}{' '}
                      {Math.abs(priceChange).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-200">
                      ${price.toFixed(6)}
                    </span>
                    <ClawdTokenAction
                      mintAddress={token.token.mint}
                      symbol={token.token.symbol}
                      name={token.token.name}
                      logoURI={token.token.image}
                      price={price}
                      variant="badge"
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
