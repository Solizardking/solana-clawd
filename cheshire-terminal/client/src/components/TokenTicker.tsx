import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { ClawdTokenAction } from '@/components/ClawdTokenAction';

interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  logoURI?: string;
  price: number;
  price24hChangePercent: number;
  volume24hUSD: number;
  rank: number;
  liquidity: number;
}

function formatPrice(p: number) {
  if (p < 0.000001) return p.toExponential(2);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  return p.toFixed(2);
}

function formatVol(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function TokenTicker() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/birdeye/trending-tokens?limit=20&sort_by=rank');
        if (!r.ok) {
          console.warn('[TokenTicker] Birdeye API returned', r.status);
          setIsLoading(false);
          return;
        }
        const d = await r.json();
        if (!d?.success) {
          console.warn('[TokenTicker] Birdeye API error:', d);
          setIsLoading(false);
          return;
        }
        const list: any[] = d?.data?.tokens || [];
        if (Array.isArray(list) && list.length) {
          const mapped: TrendingToken[] = list.map((t: any) => ({
            address: t.address || '',
            name: t.name || 'Unknown',
            symbol: t.symbol || '???',
            logoURI: t.logoURI,
            price: t.price || 0,
            price24hChangePercent: t.price24hChangePercent ?? t.price_change_24h ?? 0,
            volume24hUSD: t.volume24hUSD || t.volume_24h || 0,
            rank: t.rank || 0,
            liquidity: t.liquidity || 0,
          }));
          setTokens(mapped);
        } else {
          console.warn('[TokenTicker] No tokens in response');
        }
      } catch (err) {
        console.error('[TokenTicker] Fetch failed:', err);
      }
      setIsLoading(false);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);


  const items = tokens.length ? [...tokens, ...tokens] : [];

  if (isLoading && !tokens.length) {
    return (
      <div className="w-full h-10 bg-black border-b border-purple-900/40 flex items-center justify-center">
        <div className="flex items-center gap-2 text-purple-500/60 text-xs animate-pulse">
          <Zap className="w-3 h-3" /> Loading Solana trending...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-10 bg-black border-b border-purple-900/60 overflow-hidden relative select-none">
      {/* left label */}
      <div className="absolute left-0 top-0 h-full z-10 flex items-center px-3 bg-gradient-to-r from-black via-black to-transparent pr-8">
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-purple-400/80 uppercase whitespace-nowrap">
          <Zap className="w-3 h-3 text-yellow-400" />
          Trending
        </span>
      </div>

      {/* scrolling ticker */}
      <div
        ref={tickerRef}
        className="flex h-full items-center"
        style={{ paddingLeft: '100px' }}
      >
        <div
          className="flex items-center gap-0 whitespace-nowrap"
          style={{ animation: 'tickerScroll 60s linear infinite' }}
        >
          {items.map((token, i) => {
            const up = token.price24hChangePercent >= 0;
            return (
              <div
                key={`${token.address}-${i}`}
                className="inline-flex items-center gap-2 mx-4 px-3 py-1 rounded-full border border-purple-900/30 bg-black/60 hover:border-purple-500/50 hover:bg-purple-900/20 transition-all group cursor-pointer"
              >
                <a
                  href={`/dex?token=${encodeURIComponent(token.address)}`}
                  className="inline-flex items-center gap-2"
                >
                  {token.logoURI && (
                    <img
                      src={token.logoURI}
                      alt={token.symbol}
                      className="w-4 h-4 rounded-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span className="font-black text-xs text-white group-hover:text-purple-200 tracking-wide">{token.symbol}</span>
                  <span className="text-xs text-purple-300/80 font-mono">${formatPrice(token.price)}</span>
                  <span className={`flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(token.price24hChangePercent).toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-purple-500/50">{formatVol(token.volume24hUSD)}</span>
                </a>
                <ClawdTokenAction
                  mintAddress={token.address}
                  symbol={token.symbol}
                  name={token.name}
                  logoURI={token.logoURI}
                  price={token.price}
                  variant="badge"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* right fade */}
      <div className="absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-black to-transparent pointer-events-none" />

      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
