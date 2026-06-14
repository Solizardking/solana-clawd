import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import SolanaTrackerAPI from "@/lib/solanaTracker";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

interface TokenTickerData {
  symbol: string;
  name: string;
  mintAddress: string;
  price: number;
  change24h: number;
}

export function TrendingTokenTicker() {
  const [tokens, setTokens] = useState<TokenTickerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const tickerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setIsLoading(true);
        const topTokens = await SolanaTrackerAPI.getTrendingTokens('1h');
        
        if (topTokens && topTokens.length > 0) {
          const mappedTokens = topTokens.map((token) => ({
            symbol: token.token?.symbol || "UNKNOWN",
            name: token.token?.name || "Unknown Token",
            mintAddress: token.token?.mint || "",
            price: token.pools?.[0]?.price?.usd || 0,
            change24h: token.events?.['1h']?.priceChangePercentage || 0
          }));
          
          setTokens(mappedTokens.slice(0, 10)); // Take top 10 tokens
        }
      } catch (error) {
        console.error("Failed to fetch trending tokens:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTokens();
    // Refresh every 5 minutes
    const interval = setInterval(fetchTokens, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tickerRef.current || tokens.length === 0) return;
    
    let position = 0;
    const ticker = tickerRef.current;
    const tickerWidth = ticker.scrollWidth;
    const viewportWidth = ticker.parentElement?.clientWidth || 0;
    
    const animate = () => {
      position = (position - 1) % tickerWidth;
      if (position <= -tickerWidth) position = viewportWidth;
      if (ticker) ticker.style.transform = `translateX(${position}px)`;
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [tokens]);

  if (isLoading) {
    return (
      <Card className="w-full bg-black/40 border-purple-500/30 py-2 px-4 overflow-hidden">
        <div className="flex items-center justify-center h-8 text-purple-300/60">
          Loading trending tokens...
        </div>
      </Card>
    );
  }

  if (tokens.length === 0) {
    return null;
  }

  return (
    <Card className="w-full bg-black/40 border-purple-500/30 py-2 px-0 overflow-hidden">
      <div className="relative whitespace-nowrap overflow-hidden">
        <div 
          ref={tickerRef} 
          className="inline-flex animate-ticker"
        >
          {tokens.map((token, index) => (
            <div 
              key={`${token.mintAddress}-${index}`} 
              className="inline-flex items-center gap-2 mx-4"
            >
              <span className="font-mono text-sm text-purple-300">{token.symbol}</span>
              <span className="mx-2 text-gray-400">|</span>
              <span 
                className={`inline-flex items-center ${
                  token.change24h >= 0 
                    ? "text-green-400" 
                    : "text-red-400"
                }`}
              >
                ${token.price.toFixed(6)}
                {token.change24h >= 0 ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
                <span className="text-xs ml-1">
                  {Math.abs(token.change24h).toFixed(2)}%
                </span>
              </span>
              <ClawdTokenAction
                mintAddress={token.mintAddress}
                symbol={token.symbol}
                name={token.name}
                price={token.price}
                variant="badge"
              />
            </div>
          ))}
          
          {/* Duplicate tokens for seamless looping */}
          {tokens.map((token, index) => (
            <div 
              key={`${token.mintAddress}-dup-${index}`} 
              className="inline-flex items-center gap-2 mx-4"
            >
              <span className="font-mono text-sm text-purple-300">{token.symbol}</span>
              <span className="mx-2 text-gray-400">|</span>
              <span 
                className={`inline-flex items-center ${
                  token.change24h >= 0 
                    ? "text-green-400" 
                    : "text-red-400"
                }`}
              >
                ${token.price.toFixed(6)}
                {token.change24h >= 0 ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
                <span className="text-xs ml-1">
                  {Math.abs(token.change24h).toFixed(2)}%
                </span>
              </span>
              <ClawdTokenAction
                mintAddress={token.mintAddress}
                symbol={token.symbol}
                name={token.name}
                price={token.price}
                variant="badge"
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
