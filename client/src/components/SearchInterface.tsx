import { useState, useEffect } from 'react';
import { useSearchTokens } from '@/lib/solanaTracker';
import { Search as SearchIcon, Filter, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TokenPrice } from './TokenPrice';
import { TokenImageGenerator } from './TokenImageGenerator';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { evaluateRiskLevel } from '@/lib/solanaTracker';
import { ClawdTokenAction } from '@/components/ClawdTokenAction';

export function SearchInterface() {
  const [query, setQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState({
    market: '', // 'pumpfun', 'raydium', 'orca'
    minLiquidity: 0,
    maxLiquidity: undefined as number | undefined,
    minMarketCap: 0,
    maxMarketCap: undefined as number | undefined,
    sortBy: 'marketCap', // 'marketCap', 'liquidity', 'createdAt'
    sortOrder: 'desc' as 'asc' | 'desc',
    showAllPools: false,
    lpBurn: undefined as number | undefined,
    showPriceChanges: true
  });

  const [showFilters, setShowFilters] = useState(false);

  // For advanced search
  const marketOptions = [
    { value: '', label: 'All Markets' },
    { value: 'pumpfun', label: 'PumpFun' },
    { value: 'raydium', label: 'Raydium' },
    { value: 'orca', label: 'Orca' }
  ];

  const sortOptions = [
    { value: 'marketCap', label: 'Market Cap' },
    { value: 'liquidity', label: 'Liquidity' },
    { value: 'createdAt', label: 'Date Created' },
    { value: 'buys', label: 'Buy Transactions' },
    { value: 'sells', label: 'Sell Transactions' },
    { value: 'totalTransactions', label: 'Total Transactions' }
  ];

  const { data: searchResults, isLoading } = useSearchTokens(
    query ? {
      query,
      limit: 15,
      sortBy: searchFilters.sortBy,
      sortOrder: searchFilters.sortOrder,
      minLiquidity: searchFilters.minLiquidity > 0 ? searchFilters.minLiquidity : undefined,
      maxLiquidity: searchFilters.maxLiquidity,
      minMarketCap: searchFilters.minMarketCap > 0 ? searchFilters.minMarketCap : undefined,
      maxMarketCap: searchFilters.maxMarketCap,
      market: searchFilters.market || undefined,
      lpBurn: searchFilters.lpBurn,
      showAllPools: searchFilters.showAllPools,
      showPriceChanges: searchFilters.showPriceChanges
    } : null
  );

  // Handle search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The query is already set on input change, so we don't need to do anything else here
  };

  // Format numbers for display
  const formatNumber = (num: number, decimals = 2) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(decimals)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent mb-2">
          Solana Token Search
        </h1>
        <p className="text-center text-purple-200/60">
          Search for tokens and get comprehensive risk analysis
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Search by token name, symbol, or address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-black/40 border-purple-500/30 focus:border-purple-500"
          />
          <Button 
            variant="outline"
            type="submit"
            className="bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30"
            disabled={isLoading}
          >
            <SearchIcon className="h-4 w-4" />
          </Button>
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className={`bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30 ${showFilters ? 'bg-purple-500/40' : ''}`}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-black/90 border-purple-500/30">
              <div className="space-y-4">
                <h3 className="font-medium text-purple-200">Advanced Filters</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="market" className="text-xs text-purple-200">Market</Label>
                  <Select 
                    value={searchFilters.market} 
                    onValueChange={(value) => setSearchFilters({...searchFilters, market: value})}
                  >
                    <SelectTrigger className="bg-black/40 border-purple-500/30">
                      <SelectValue placeholder="Select Market" />
                    </SelectTrigger>
                    <SelectContent className="bg-black/90 border-purple-500/30">
                      {marketOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-purple-200">Liquidity Range</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-200/60">
                      {searchFilters.minLiquidity > 0 ? formatNumber(searchFilters.minLiquidity) : '$0'}
                    </span>
                    <span className="text-xs text-purple-200/60">
                      {searchFilters.maxLiquidity ? formatNumber(searchFilters.maxLiquidity) : 'Unlimited'}
                    </span>
                  </div>
                  <Slider 
                    defaultValue={[0, 1000000]} 
                    max={10000000}
                    step={10000}
                    onValueChange={(values) => setSearchFilters({
                      ...searchFilters, 
                      minLiquidity: values[0], 
                      maxLiquidity: values[1] === 10000000 ? undefined : values[1]
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-purple-200">Market Cap Range</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-200/60">
                      {searchFilters.minMarketCap > 0 ? formatNumber(searchFilters.minMarketCap) : '$0'}
                    </span>
                    <span className="text-xs text-purple-200/60">
                      {searchFilters.maxMarketCap ? formatNumber(searchFilters.maxMarketCap) : 'Unlimited'}
                    </span>
                  </div>
                  <Slider 
                    defaultValue={[0, 50000000]} 
                    max={50000000}
                    step={100000}
                    onValueChange={(values) => setSearchFilters({
                      ...searchFilters, 
                      minMarketCap: values[0], 
                      maxMarketCap: values[1] === 50000000 ? undefined : values[1]
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sortBy" className="text-xs text-purple-200">Sort By</Label>
                  <div className="flex gap-2">
                    <Select 
                      value={searchFilters.sortBy} 
                      onValueChange={(value) => setSearchFilters({...searchFilters, sortBy: value})}
                    >
                      <SelectTrigger className="bg-black/40 border-purple-500/30">
                        <SelectValue placeholder="Sort By" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 border-purple-500/30">
                        {sortOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-black/40 border-purple-500/30"
                      onClick={() => setSearchFilters({
                        ...searchFilters, 
                        sortOrder: searchFilters.sortOrder === 'desc' ? 'asc' : 'desc'
                      })}
                    >
                      {searchFilters.sortOrder === 'desc' ? '↓' : '↑'}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    id="lp-burn"
                    checked={searchFilters.lpBurn === 100}
                    onCheckedChange={(checked) => setSearchFilters({
                      ...searchFilters,
                      lpBurn: checked ? 100 : undefined
                    })}
                  />
                  <Label htmlFor="lp-burn" className="text-xs text-purple-200">Only LP Burned Tokens</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    id="show-price-changes" 
                    checked={searchFilters.showPriceChanges}
                    onCheckedChange={(checked) => setSearchFilters({
                      ...searchFilters,
                      showPriceChanges: checked
                    })}
                  />
                  <Label htmlFor="show-price-changes" className="text-xs text-purple-200">Include Price Changes</Label>
                </div>

                <Button 
                  variant="default" 
                  className="w-full bg-purple-500/80" 
                  onClick={() => setShowFilters(false)}
                >
                  Apply Filters
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </form>

      {/* Active filters display */}
      {(searchFilters.market || searchFilters.minLiquidity > 0 || searchFilters.minMarketCap > 0 || searchFilters.lpBurn) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {searchFilters.market && (
            <Badge className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
              Market: {marketOptions.find(m => m.value === searchFilters.market)?.label}
              <button 
                className="ml-1 text-purple-300 hover:text-purple-100"
                onClick={() => setSearchFilters({...searchFilters, market: ''})}
              >
                ×
              </button>
            </Badge>
          )}
          {searchFilters.minLiquidity > 0 && (
            <Badge className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
              Min Liquidity: {formatNumber(searchFilters.minLiquidity)}
              <button 
                className="ml-1 text-purple-300 hover:text-purple-100"
                onClick={() => setSearchFilters({...searchFilters, minLiquidity: 0})}
              >
                ×
              </button>
            </Badge>
          )}
          {searchFilters.minMarketCap > 0 && (
            <Badge className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
              Min Market Cap: {formatNumber(searchFilters.minMarketCap)}
              <button 
                className="ml-1 text-purple-300 hover:text-purple-100"
                onClick={() => setSearchFilters({...searchFilters, minMarketCap: 0})}
              >
                ×
              </button>
            </Badge>
          )}
          {searchFilters.lpBurn === 100 && (
            <Badge className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
              LP Burned
              <button 
                className="ml-1 text-purple-300 hover:text-purple-100"
                onClick={() => setSearchFilters({...searchFilters, lpBurn: undefined})}
              >
                ×
              </button>
            </Badge>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-purple-300 hover:bg-purple-500/20"
            onClick={() => setSearchFilters({
              market: '',
              minLiquidity: 0,
              maxLiquidity: undefined,
              minMarketCap: 0,
              maxMarketCap: undefined,
              sortBy: 'marketCap',
              sortOrder: 'desc',
              showAllPools: false,
              lpBurn: undefined,
              showPriceChanges: true
            })}
          >
            Clear All
          </Button>
        </div>
      )}

      {/* Search results display */}
      <ScrollArea className="h-[600px]">
        {isLoading ? (
          <div className="text-center py-12 text-purple-200/60 animate-pulse">
            Searching...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Token Results */}
            {searchResults?.data && searchResults.data.length > 0 ? (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xl font-semibold text-purple-200">Search Results</h2>
                  <span className="text-sm text-purple-200/60">
                    {searchResults.total} tokens found
                  </span>
                </div>
                
                {searchResults.data.map((token) => {
                  // Get risk level for the token
                  const riskScore = token.risk?.score || 0;
                  const riskLevel = evaluateRiskLevel(riskScore);
                  const priceChanges = token.events && searchFilters.showPriceChanges;
                  
                  return (
                    <Card key={token.token.mint} className="mb-3 bg-black/40 border-purple-500/30">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            {token.token.image && (
                              <img 
                                src={token.token.image} 
                                alt={token.token.name}
                                className="w-10 h-10 rounded-full"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${token.token.symbol}&color=fff&background=7c3aed`;
                                }}
                              />
                            )}
                            <div>
                              <h3 className="font-medium text-purple-200">{token.token.name}</h3>
                              <div className="flex gap-2 items-center">
                                <span className="text-sm text-purple-300/60">{token.token.symbol}</span>
                                <Badge className={`text-xs ${riskLevel.bgColor} ${riskLevel.color}`}>
                                  {riskLevel.name}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {token.pools && token.pools[0] && (
                              <>
                                <div className="text-base font-medium text-purple-100">
                                  ${token.pools[0].price.usd.toFixed(8)}
                                </div>
                                <div className="text-xs text-purple-300/60 mt-1">
                                  Market: {token.pools[0].market.charAt(0).toUpperCase() + token.pools[0].market.slice(1)}
                                </div>
                              </>
                            )}
                            <div className="mt-2 flex justify-end">
                              <ClawdTokenAction
                                mintAddress={token.token.mint}
                                symbol={token.token.symbol}
                                name={token.token.name}
                                logoURI={token.token.image}
                                price={token.pools?.[0]?.price?.usd}
                                variant="badge"
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Token stats */}
                        <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                          <div className="bg-black/20 rounded-md p-2">
                            <div className="text-xs text-purple-300/50">Market Cap</div>
                            <div className="font-medium text-purple-200">
                              {token.pools && token.pools[0] && formatNumber(token.pools[0].marketCap.usd)}
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-md p-2">
                            <div className="text-xs text-purple-300/50">Liquidity</div>
                            <div className="font-medium text-purple-200">
                              {token.pools && token.pools[0] && formatNumber(token.pools[0].liquidity.usd)}
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-md p-2">
                            <div className="text-xs text-purple-300/50">LP Burn</div>
                            <div className="font-medium text-purple-200">
                              {token.pools && token.pools[0] && token.pools[0].lpBurn}%
                            </div>
                          </div>
                        </div>
                        
                        {/* Price changes if available */}
                        {priceChanges && (
                          <div className="mt-3">
                            <h4 className="text-xs text-purple-300/50 mb-1">Price Change</h4>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {['1h', '24h'].map(period => {
                                if (!token.events || !token.events[period]) return null;
                                const change = token.events[period].priceChangePercentage;
                                return (
                                  <div 
                                    key={period}
                                    className={`text-xs px-2 py-1 rounded-md ${
                                      change > 0 
                                        ? 'bg-green-900/30 text-green-400' 
                                        : change < 0 
                                        ? 'bg-red-900/30 text-red-400' 
                                        : 'bg-gray-800/30 text-gray-400'
                                    }`}
                                  >
                                    {period}: {change > 0 ? '+' : ''}{(change * 100).toFixed(2)}%
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Transaction stats */}
                        {(token.buys !== undefined || token.sells !== undefined) && (
                          <div className="flex gap-4 mt-3 text-xs text-purple-300/60">
                            <div>Buys: {token.buys || 0}</div>
                            <div>Sells: {token.sells || 0}</div>
                            <div>Txns: {token.txns || token.buys + token.sells || 0}</div>
                          </div>
                        )}
                      </CardContent>
                      
                      <CardFooter className="px-4 py-2 border-t border-purple-500/20 flex justify-between text-xs">
                        <div className="text-purple-300/60">
                          Created: {new Date(token.pools[0].createdAt).toLocaleDateString()}
                        </div>
                        <a 
                          href={`https://solanatracker.io/token/${token.token.mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300"
                        >
                          View Details →
                        </a>
                      </CardFooter>
                    </Card>
                  );
                })}
                
                {searchResults.total > searchResults.data.length && (
                  <div className="text-center py-4">
                    <span className="text-sm text-purple-200/60">
                      Showing {searchResults.data.length} of {searchResults.total} results
                    </span>
                  </div>
                )}
              </div>
            ) : (
              query && (
                <div className="space-y-4">
                  <div className="text-center py-8 text-purple-200/60">
                    No results found for "{query}"
                  </div>
                  <Separator className="my-6 bg-gray-800/50" />
                  <div className="mt-8">
                    <h3 className="text-xl font-semibold text-purple-200 mb-4 text-center">
                      Generate a Token Image
                    </h3>
                    <TokenImageGenerator />
                  </div>
                </div>
              )
            )}
            
            {!query && !isLoading && (
              <div className="space-y-4 text-center py-12">
                <TrendingUp className="h-16 w-16 text-purple-500/50 mx-auto" />
                <p className="text-purple-200/60">
                  Search for tokens by name, symbol, or address to get detailed information including risk scores.
                </p>
                <p className="text-purple-300/40 text-sm">
                  Use the filter button to refine your search with advanced criteria.
                </p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
