import { useState, useEffect, useCallback } from "react";
import { useRecentTokens, RecentToken } from "@/hooks/useRecentTokens";
import { useLocation } from "wouter";
import { Clock, Trash2, TrendingUp, TrendingDown, Star, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

type LiveToken = RecentToken & { loading?: boolean; error?: boolean };

type NewListing = {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  price?: number;
  liquidity?: number;
  createdAt?: number;
};

function fmt(n?: number) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(4)}`;
}

function fmtPrice(n?: number) {
  if (n == null) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(3)}`;
}

function PctBadge({ pct }: { pct?: number }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? "text-green-400" : "text-red-400"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function TokenCard({
  token,
  onRemove,
  onClick,
}: {
  token: LiveToken;
  onRemove: (address: string) => void;
  onClick: (address: string) => void;
}) {
  return (
    <div
      className="group relative bg-black/60 border border-purple-500/20 hover:border-purple-500/50 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:bg-purple-950/20"
      onClick={() => onClick(token.address)}
    >
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400"
        onClick={(e) => { e.stopPropagation(); onRemove(token.address); }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-3 mb-3">
        {token.logoURI ? (
          <img src={token.logoURI} alt={token.symbol} className="w-9 h-9 rounded-full bg-gray-800" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-xs font-bold text-white">
            {token.symbol?.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-bold text-white truncate">{token.symbol}</div>
          <div className="text-xs text-gray-400 truncate">{token.name}</div>
        </div>
        <div className="ml-auto" onClick={(event) => event.stopPropagation()}>
          <ClawdTokenAction
            mintAddress={token.address}
            symbol={token.symbol}
            name={token.name}
            logoURI={token.logoURI}
            price={token.price}
          />
        </div>
      </div>

      {token.loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="w-3 h-3 animate-spin" /> refreshing…
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono font-semibold text-white">{fmtPrice(token.price)}</span>
            <PctBadge pct={token.priceChange24hPercent} />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>MCap {fmt(token.marketCap)}</span>
            <span>Liq {fmt(token.liquidity)}</span>
          </div>
          <div className="text-[10px] text-gray-600">
            {token.viewedAt ? `viewed ${new Date(token.viewedAt).toLocaleString()}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function NewListingCard({ token, onClick }: { token: NewListing; onClick: (address: string) => void }) {
  return (
    <div
      className="bg-black/60 border border-cyan-500/20 hover:border-cyan-500/50 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:bg-cyan-950/10"
      onClick={() => onClick(token.address)}
    >
      <div className="flex items-center gap-3 mb-2">
        {token.logoURI ? (
          <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full bg-gray-800" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
            {token.symbol?.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white text-sm truncate">{token.symbol || "?"}</div>
          <div className="text-[11px] text-gray-400 truncate">{token.name}</div>
        </div>
        <div onClick={(event) => event.stopPropagation()}>
          <ClawdTokenAction
            mintAddress={token.address}
            symbol={token.symbol}
            name={token.name}
            logoURI={token.logoURI}
            price={token.price}
          />
        </div>
        <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 shrink-0">NEW</Badge>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{fmtPrice(token.price)}</span>
        <span>Liq {fmt(token.liquidity)}</span>
      </div>
    </div>
  );
}

export default function NewPage() {
  const { recent, removeToken, clearRecent } = useRecentTokens();
  const [liveTokens, setLiveTokens] = useState<LiveToken[]>([]);
  const [newListings, setNewListings] = useState<NewListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [, navigate] = useLocation();

  // Seed live tokens from localStorage immediately, then refresh prices
  useEffect(() => {
    setLiveTokens(recent.map((t) => ({ ...t, loading: true })));
  }, [recent.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshPrices = useCallback(async (tokens: RecentToken[]) => {
    if (!tokens.length) return;
    setLiveTokens(tokens.map((t) => ({ ...t, loading: true })));
    const updated = await Promise.all(
      tokens.map(async (t) => {
        try {
          const res = await fetch(`/api/birdeye/token-overview/${t.address}`);
          if (!res.ok) return { ...t, loading: false };
          const json = await res.json();
          const d = json?.data ?? json;
          return {
            ...t,
            price: d.price ?? t.price,
            priceChange24hPercent: d.priceChange24hPercent ?? t.priceChange24hPercent,
            marketCap: d.marketCap ?? t.marketCap,
            liquidity: d.liquidity ?? t.liquidity,
            loading: false,
          };
        } catch {
          return { ...t, loading: false, error: true };
        }
      })
    );
    setLiveTokens(updated);
  }, []);

  // Refresh on mount
  useEffect(() => {
    if (recent.length) refreshPrices(recent);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load new listings
  useEffect(() => {
    setListingsLoading(true);
    fetch("/api/birdeye/new-listings?limit=12")
      .then((r) => r.json())
      .then((json) => {
        const items: NewListing[] = (json?.data?.items ?? []).map((item: any) => ({
          address: item.address,
          symbol: item.symbol,
          name: item.name,
          logoURI: item.logoURI,
          price: item.price,
          liquidity: item.liquidity,
          createdAt: item.createdAt,
        }));
        setNewListings(items);
      })
      .catch(() => setNewListings([]))
      .finally(() => setListingsLoading(false));
  }, []);

  const handleTokenClick = (address: string) => {
    navigate(`/dex?token=${address}`);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Clock className="h-7 w-7 text-purple-400" />
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 via-cyan-400 to-green-400 text-transparent bg-clip-text">
            Recently Shopped
          </h1>
          <Star className="h-7 w-7 text-cyan-400" />
        </div>
        <p className="text-gray-400 text-sm">
          Your last {recent.length} viewed tokens · prices refreshed live
        </p>
      </div>

      {/* Recently Viewed */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            Your History
          </h2>
          <div className="flex items-center gap-2">
            {recent.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-400 hover:text-white"
                  onClick={() => refreshPrices(recent)}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-400 hover:text-red-300"
                  onClick={clearRecent}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Clear all
                </Button>
              </>
            )}
          </div>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-16 text-gray-500 border border-dashed border-gray-700 rounded-xl">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recently viewed tokens.</p>
            <p className="text-xs mt-1">Head to the <span className="text-purple-400 cursor-pointer" onClick={() => navigate("/dex")}>DEX</span> and browse some tokens.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {liveTokens.map((token) => (
              <TokenCard
                key={token.address}
                token={token}
                onRemove={removeToken}
                onClick={handleTokenClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* New Listings */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Just Listed on Solana</h2>
          <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">LIVE</Badge>
        </div>

        {listingsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-black/40 border border-gray-800 rounded-xl p-4 h-28 animate-pulse" />
            ))}
          </div>
        ) : newListings.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No new listings available right now.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {newListings.map((token) => (
              <NewListingCard key={token.address} token={token} onClick={handleTokenClick} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
