import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClawdSwapWidget } from '@/components/ClawdSwapWidget';
import { ClawdTokenAction } from '@/components/ClawdTokenAction';
import { useRecentTokens } from '@/hooks/useRecentTokens';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Search, RefreshCw, ExternalLink, Copy,
  BarChart2, Zap, AlertTriangle, Shield, Users, Activity, Droplets,
  ArrowUpRight, ArrowDownRight, Info, X, Brain, Loader2, Clock,
  Globe, MessageCircle, ChevronRight, Star, Eye, Flame, Network, Send, Sparkles
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { normalizeChartResponse } from '@/lib/tokenChartData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenOverview {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  price: number;
  marketCap?: number;
  fdv?: number;
  liquidity?: number;
  volume24hUSD?: number;
  volume24hChangePercent?: number;
  priceChange1mPercent?: number;
  priceChange5mPercent?: number;
  priceChange30mPercent?: number;
  priceChange1hPercent?: number;
  priceChange4hPercent?: number;
  priceChange24hPercent?: number;
  lastTradeUnixTime?: number;
  extensions?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    description?: string;
    coingeckoId?: string;
  };
  supply?: number;
  holder?: number;
  uniqueWallet24h?: number;
  uniqueWalletHistory24hChangePercent?: number;
  buy24h?: number;
  sell24h?: number;
  trade24h?: number;
  v24hUSD?: number;
  v1hUSD?: number;
  v4hUSD?: number;
}

interface OHLCVItem {
  unixTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  txHash: string;
  blockTime: number;
  side: string;
  price: number;
  priceUsd: number;
  volumeUsd: number;
  from: { symbol: string; amount: number };
  to: { symbol: string; amount: number };
  source: string;
  owner: string;
}

interface TopTrader {
  address: string;
  volume: number;
  volumeBuy: number;
  volumeSell: number;
  tradeCount: number;
  tradeBuy: number;
  tradeSell: number;
  netVolume: number;
  pnl?: number;
  realized?: number;
}

interface SecurityData {
  creatorAddress?: string;
  creatorBalance?: number;
  creatorPercentage?: number;
  top10HolderBalance?: number;
  top10HolderPercent?: number;
  ownerAddress?: string;
  isMintable?: boolean;
  isFreezable?: boolean;
  totalSupply?: number;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  isToken2022?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (v?: number | null, sig = 6): string => {
  if (v == null) return '—';
  if (v === 0) return '$0.00';
  if (v < 0.000001) return `$${v.toExponential(2)}`;
  if (v < 0.01) return `$${v.toPrecision(sig)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
};

const fmtNum = (v?: number | null): string => {
  if (v == null) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
};

const fmtPct = (v?: number | null): string => {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
};

const fmtTime = (ts: number): string => {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const fmtAddr = (a?: string, n = 6): string => {
  if (!a) return '—';
  return `${a.slice(0, n)}…${a.slice(-4)}`;
};

const pctClass = (v?: number | null) =>
  v == null ? 'text-gray-400' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';

const apiJson = async (url: string) => {
  try {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: data?.error || `HTTP ${response.status}`, data: { items: [], tokens: [] } };
    }
    return data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Network error', data: { items: [], tokens: [] } };
  }
};

const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const BUBBLE_PROMPT_PRESETS = [
  'Find concentrated holder clusters and explain whether they look coordinated.',
  'Identify the largest connected wallets, exchange labels, contracts, and suspicious links.',
  'Summarize top holder concentration and whether supply appears distributed or controlled.',
  'Look for insider, sniper, or bundled wallet patterns visible on this Bubblemap.',
];

const intelSignalTone = (level?: string) => {
  switch (level) {
    case 'positive':
      return 'border-emerald-500/25 bg-emerald-950/20 text-emerald-300';
    case 'watch':
      return 'border-amber-500/25 bg-amber-950/20 text-amber-300';
    case 'risk':
      return 'border-red-500/25 bg-red-950/20 text-red-300';
    default:
      return 'border-cyan-500/25 bg-cyan-950/20 text-cyan-300';
  }
};

// ─── Mini stat badge ─────────────────────────────────────────────────────────

const PctBadge = ({ label, value }: { label: string; value?: number | null }) => (
  <div className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[70px]">
    <span className="text-[10px] text-gray-500 mb-0.5">{label}</span>
    <span className={`text-xs font-bold ${pctClass(value)}`}>{fmtPct(value)}</span>
  </div>
);

// ─── Token row in list ────────────────────────────────────────────────────────

const TokenRow = ({
  token,
  rank,
  onSelect,
  selected,
}: {
  token: TokenOverview;
  rank?: number;
  onSelect: (t: TokenOverview) => void;
  selected?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-800/60 hover:bg-gray-800/50 transition-colors ${
      selected ? 'bg-purple-900/30 border-l-2 border-l-purple-500' : ''
    }`}
    onClick={() => onSelect(token)}
  >
    {rank && <span className="text-[11px] text-gray-600 w-5 shrink-0">{rank}</span>}
    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden border border-gray-700">
      {token.logoURI ? (
        <img src={token.logoURI} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
      ) : (
        <span className="text-[10px] font-bold text-purple-400">{token.symbol?.slice(0, 2)}</span>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-white truncate">{token.symbol}</span>
      </div>
      <div className="text-[11px] text-gray-500 truncate">{token.name}</div>
    </div>
    <div className="text-right shrink-0">
      <div className="text-sm font-medium text-white">{fmtPrice(token.price)}</div>
      <div className={`text-[11px] font-medium ${pctClass(token.priceChange24hPercent)}`}>
        {fmtPct(token.priceChange24hPercent)}
      </div>
    </div>
    <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
      <ClawdTokenAction
        mintAddress={token.address}
        symbol={token.symbol}
        name={token.name}
        logoURI={token.logoURI}
        decimals={token.decimals}
        price={token.price}
      />
    </div>
  </motion.div>
);

// ─── OHLCV Mini Chart using SVG sparkline ────────────────────────────────────

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  if (!data.length) return null;
  const w = 200, h = 50;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts.join(' ')} />
    </svg>
  );
};

const SvgTokenChart = ({
  points,
  color,
}: {
  points: Array<{ time: Date; close: number; volume: number }>;
  color: string;
}) => {
  const priceWidth = 960;
  const priceHeight = 240;
  const volumeHeight = 76;
  const padX = 14;
  const padY = 16;
  const closes = points.map((point) => point.close);
  const volumes = points.map((point) => Math.max(0, point.volume || 0));
  const minPrice = Math.min(...closes);
  const maxPrice = Math.max(...closes);
  const priceRange = maxPrice - minPrice || Math.max(maxPrice, 1);
  const maxVolume = Math.max(...volumes, 1);
  const xFor = (index: number) =>
    points.length === 1
      ? priceWidth / 2
      : padX + (index / (points.length - 1)) * (priceWidth - padX * 2);
  const yFor = (value: number) =>
    padY + (1 - (value - minPrice) / priceRange) * (priceHeight - padY * 2);
  const line = points.map((point, index) => `${xFor(index)},${yFor(point.close)}`).join(' ');
  const area = `${padX},${priceHeight - padY} ${line} ${priceWidth - padX},${priceHeight - padY}`;
  const barWidth = Math.max(2, Math.min(10, (priceWidth - padX * 2) / Math.max(points.length, 1) * 0.6));
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="rounded-lg bg-gray-950 p-3">
      <svg viewBox={`0 0 ${priceWidth} ${priceHeight}`} className="h-[240px] w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={priceWidth}
            y1={priceHeight * ratio}
            y2={priceHeight * ratio}
            stroke="#1f2937"
            strokeWidth="1"
          />
        ))}
        <polygon points={area} fill={color} opacity="0.08" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg viewBox={`0 0 ${priceWidth} ${volumeHeight}`} className="mt-1 h-20 w-full" preserveAspectRatio="none">
        {volumes.map((volume, index) => {
          const h = Math.max(1, (volume / maxVolume) * (volumeHeight - 12));
          return (
            <rect
              key={`${points[index].time.getTime()}-${index}`}
              x={xFor(index) - barWidth / 2}
              y={volumeHeight - h}
              width={barWidth}
              height={h}
              rx="1"
              fill="#6366f1"
              opacity="0.42"
            />
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
        <span>{first?.time.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <span>{points.length} candles</span>
        <span>{last?.time.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
};

// ─── Main DexPage ─────────────────────────────────────────────────────────────

export default function DexPage() {
  const { user, isAuthenticated } = useAuth();
  const hasHolderAccess = isAuthenticated && (user?.role === "admin" || user?.isTokenGated);
  const [selectedToken, setSelectedToken] = useState<TokenOverview | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [ohlcvType, setOhlcvType] = useState('15m');
  const [activeDetailTab, setActiveDetailTab] = useState('overview');
  const [activeListTab, setActiveListTab] = useState('trending');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [bubblePrompt, setBubblePrompt] = useState('Find concentrated holder clusters, connected wallets, exchange labels, and suspicious transfer patterns.');
  const [bubbleAnswer, setBubbleAnswer] = useState<string | null>(null);
  const [isBubbleAsking, setIsBubbleAsking] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const address = new URLSearchParams(window.location.search).get('token');
    if (!address) return;

    setSelectedToken((current) => current?.address === address ? current : {
      address,
      symbol: fmtAddr(address, 4),
      name: 'Loading token',
      decimals: 0,
      price: 0,
    });
  }, []);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: trendingData, isLoading: loadingTrending, refetch: refetchTrending } = useQuery({
    queryKey: ['/api/birdeye/trending'],
    queryFn: () => apiJson('/api/birdeye/trending'),
    refetchInterval: 30000,
  });

  const { data: newListingsData, isLoading: loadingNew, refetch: refetchNew } = useQuery({
    queryKey: ['/api/birdeye/new-listings'],
    queryFn: () => apiJson('/api/birdeye/new-listings'),
    refetchInterval: 60000,
  });

  const { data: searchData, isLoading: loadingSearch } = useQuery({
    queryKey: ['/api/birdeye/search-tokens', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return null;
      return apiJson(`/api/birdeye/search-tokens?q=${encodeURIComponent(debouncedQuery)}`);
    },
    enabled: debouncedQuery.trim().length > 0,
  });

  const { data: overviewData, isLoading: loadingOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['/api/birdeye/token-overview', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/token-overview/${selectedToken.address}`);
    },
    enabled: !!selectedToken?.address,
    refetchInterval: 10000,
  });

  const { data: ohlcvData, isLoading: loadingOHLCV } = useQuery({
    queryKey: ['/api/birdeye/ohlcv', selectedToken?.address, ohlcvType],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/ohlcv/${selectedToken.address}?type=${ohlcvType}&limit=140`);
    },
    enabled: !!selectedToken?.address,
    refetchInterval: 15000,
  });

  const { data: tradeData, isLoading: loadingTrades } = useQuery({
    queryKey: ['/api/birdeye/transactions', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/transactions/${selectedToken.address}?limit=30`);
    },
    enabled: !!selectedToken?.address && activeDetailTab === 'trades',
    refetchInterval: 10000,
  });

  const { data: topTradersData, isLoading: loadingTraders } = useQuery({
    queryKey: ['/api/birdeye/top-traders', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/top-traders/${selectedToken.address}?limit=10`);
    },
    enabled: !!selectedToken?.address && activeDetailTab === 'traders',
  });

  const { data: securityData, isLoading: loadingSecurity } = useQuery({
    queryKey: ['/api/birdeye/security', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/security/${selectedToken.address}`);
    },
    enabled: !!selectedToken?.address && activeDetailTab === 'security',
  });

  const { data: metadataData } = useQuery({
    queryKey: ['/api/birdeye/token-metadata', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/token-metadata/${selectedToken.address}`);
    },
    enabled: !!selectedToken?.address,
  });

  const { data: liquidityData } = useQuery({
    queryKey: ['/api/birdeye/liquidity', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/liquidity/${selectedToken.address}`);
    },
    enabled: !!selectedToken?.address && activeDetailTab === 'liquidity',
  });

  const { data: tokenIntelData, isLoading: loadingIntel, refetch: refetchIntel } = useQuery({
    queryKey: ['/api/birdeye/token-intelligence', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      return apiJson(`/api/birdeye/token-intelligence/${selectedToken.address}`);
    },
    enabled: !!selectedToken?.address && activeDetailTab === 'intel',
    staleTime: 30000,
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  // Normalize token from trending list (different field names than overview)
  const normalizeToken = (t: any): TokenOverview => ({
    ...t,
    address: t.address || t.tokenAddress || t.mint || '',
    symbol: t.symbol || 'UNKNOWN',
    name: t.name || t.symbol || 'Unknown Token',
    logoURI: t.logoURI || t.logo_uri || t.logo || '',
    price: asNumber(t.price),
    // Trending tokens use price24hChangePercent; overview uses priceChange24hPercent
    priceChange24hPercent: t.priceChange24hPercent ?? t.price24hChangePercent ?? t.price_change_24h_percent ?? null,
    priceChange1hPercent: t.priceChange1hPercent ?? t.price1hChangePercent ?? t.price_change_1h_percent ?? null,
    priceChange4hPercent: t.priceChange4hPercent ?? t.price4hChangePercent ?? t.price_change_4h_percent ?? null,
    // Trending tokens use lowercase marketcap
    marketCap: t.marketCap ?? t.marketcap ?? t.market_cap ?? null,
    // Volume field
    volume24hUSD: t.volume24hUSD ?? t.v24hUSD ?? t.volume_24h_usd ?? null,
  });

  const trendingTokens: TokenOverview[] = React.useMemo(() => {
    const items = (trendingData as any)?.data?.tokens || (trendingData as any)?.data?.items || [];
    return items.slice(0, 20).map(normalizeToken);
  }, [trendingData]);

  const newTokens: TokenOverview[] = React.useMemo(() => {
    const items = (newListingsData as any)?.data?.items || [];
    return items.slice(0, 30).map(normalizeToken).filter((token: TokenOverview) => !!token.address);
  }, [newListingsData]);

  const searchResults: TokenOverview[] = React.useMemo(() => {
    const raw = searchData as any;
    const groupedItems = Array.isArray(raw?.data?.items) ? raw.data.items : [];
    const flattened = groupedItems.flatMap((item: any) => Array.isArray(item?.result) ? item.result : item);
    const items = raw?.data?.tokens || raw?.data?.result?.tokens || flattened || [];
    return items.map(normalizeToken).filter((token: TokenOverview) => !!token.address).slice(0, 20);
  }, [searchData]);

  const tokenDetail: TokenOverview | null = React.useMemo(() => {
    const d = (overviewData as any)?.data;
    if (!d) return selectedToken;
    return { ...selectedToken, ...d };
  }, [overviewData, selectedToken]);

  const ohlcvItems: OHLCVItem[] = React.useMemo(() => {
    return normalizeChartResponse(ohlcvData).map((item) => ({
      unixTime: item.unixTime,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }));
  }, [ohlcvData]);

  const chartSource = (ohlcvData as any)?.data?.source || (ohlcvData as any)?.source;

  const trades: Trade[] = React.useMemo(() => {
    return (tradeData as any)?.data?.items || [];
  }, [tradeData]);

  const traders: TopTrader[] = React.useMemo(() => {
    return (topTradersData as any)?.data?.items || [];
  }, [topTradersData]);

  const security: SecurityData | null = React.useMemo(() => {
    return (securityData as any)?.data || null;
  }, [securityData]);

  const metadata = React.useMemo(() => {
    return (metadataData as any)?.data || null;
  }, [metadataData]);

  const liquidity = React.useMemo(() => {
    return (liquidityData as any)?.data || null;
  }, [liquidityData]);

  const tokenIntel = React.useMemo(() => {
    return (tokenIntelData as any)?.data || null;
  }, [tokenIntelData]);

  const bubblemapUrl = tokenIntel?.sources?.bubblemaps?.appUrl
    || (tokenDetail?.address ? `https://v2.bubblemaps.io/map?chain=solana&address=${encodeURIComponent(tokenDetail.address)}` : '');

  // ── Handlers ──────────────────────────────────────────────────────────────

  const { addToken } = useRecentTokens();

  const handleSelectToken = useCallback((token: TokenOverview) => {
    const normalized = normalizeToken(token);
    if (!normalized.address) return;
    setSelectedToken(normalized);
    const nextUrl = `${window.location.pathname}?token=${encodeURIComponent(normalized.address)}`;
    window.history.replaceState(null, '', nextUrl);
    setActiveDetailTab('overview');
    setAiAnalysis(null);
    setBubbleAnswer(null);
    addToken({
      address: normalized.address,
      symbol: normalized.symbol,
      name: normalized.name,
      logoURI: normalized.logoURI,
      price: normalized.price,
      priceChange24hPercent: normalized.priceChange24hPercent,
      marketCap: normalized.marketCap,
      liquidity: normalized.liquidity,
    });
  }, [addToken]);

  const copyAddress = () => {
    if (!tokenDetail?.address) return;
    navigator.clipboard.writeText(tokenDetail.address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleAiAnalyze = async () => {
    if (!tokenDetail || isAnalyzing) return;
    if (!hasHolderAccess) {
      setActiveDetailTab('ai');
      setAiAnalysis('AI token analysis is reserved for live $CLAWD holders. Market data, charts, trades, liquidity, and security tabs remain available in browse mode.');
      return;
    }
    setIsAnalyzing(true);
    setActiveDetailTab('ai');
    try {
      let chartImage: string | undefined;
      if (chartRef.current) {
        try {
          const canvas = await html2canvas(chartRef.current);
          chartImage = canvas.toDataURL('image/png');
        } catch {}
      }
      const r = await fetch('/api/birdeye/analyze-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: tokenDetail.address, chart_image: chartImage }),
      });
      const d = await r.json();
      setAiAnalysis(d.chart_analysis || d.error || 'No analysis available');
    } catch (e) {
      setAiAnalysis('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBubbleAsk = async () => {
    if (!tokenDetail || isBubbleAsking) return;
    setActiveDetailTab('intel');

    if (!hasHolderAccess) {
      setBubbleAnswer('Natural-language Bubblemaps analysis is reserved for live $CLAWD holders. You can still open the Bubblemap link and review token intelligence from Birdeye, Solana Tracker, and DFlow.');
      return;
    }

    setIsBubbleAsking(true);
    setBubbleAnswer(null);
    try {
      const response = await fetch('/api/birdeye/bubblemaps/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: tokenDetail.address,
          prompt: bubblePrompt,
          chain: 'solana',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setBubbleAnswer(data.answer || 'Bubblemaps returned no text answer. Open the live map for the visual view.');
    } catch (error) {
      setBubbleAnswer(error instanceof Error ? error.message : 'Bubblemaps analysis failed. Please try again.');
    } finally {
      setIsBubbleAsking(false);
    }
  };

  const handleRefresh = () => {
    refetchTrending();
    refetchNew();
    if (selectedToken) refetchOverview();
    if (selectedToken && activeDetailTab === 'intel') refetchIntel();
  };

  // ── Chart data prep ───────────────────────────────────────────────────────

  const chartPoints = React.useMemo(() => {
    return ohlcvItems
      .map((item) => ({
        time: new Date(item.unixTime * 1000),
        close: Number(item.close),
        volume: Number(item.volume),
      }))
      .filter((item) => Number.isFinite(item.time.getTime()) && Number.isFinite(item.close));
  }, [ohlcvItems]);

  const chartPrices = chartPoints.map(i => i.close);
  const chartError = (ohlcvData as any)?.success === false ? ((ohlcvData as any)?.error || 'Chart data unavailable') : null;
  const chartKey = `${tokenDetail?.address ?? 'token'}-${ohlcvType}-${chartSource ?? 'source'}-${chartPoints.length}`;
  const priceColor = chartPrices.length >= 2 && chartPrices[chartPrices.length - 1] >= chartPrices[0]
    ? '#10b981' : '#ef4444';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur lg:sticky lg:top-0 lg:z-10">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div className="flex items-center gap-2 shrink-0">
            <BarChart2 className="h-5 w-5 text-purple-400" />
            <span className="font-bold text-purple-300 text-base sm:text-lg">CLAWD DEX</span>
            <Badge className="bg-purple-900/60 text-purple-300 border-purple-700 text-[10px]">BIRDEYE</Badge>
          </div>
          <div className="relative w-full max-w-2xl sm:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search token, symbol, or address"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                if (e.target.value) setActiveListTab('search');
                else setActiveListTab('trending');
              }}
              className="pl-9 bg-gray-800 border-gray-700 text-white placeholder-gray-500 h-9"
            />
            {loadingSearch && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400 animate-spin" />
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}
            className="w-full shrink-0 border-gray-700 text-gray-400 hover:text-white sm:w-auto">
            <RefreshCw className="h-4 w-4 sm:mr-1.5" /> <span className="ml-1.5 sm:ml-0">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4 xl:flex-row xl:gap-4">

        {/* ── CLAWD Swap Widget ── */}
        <div className="order-3 w-full shrink-0 space-y-3 xl:order-1 xl:w-[400px]">
          <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/45 via-gray-900 to-emerald-950/30 p-3 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                Holder Route
              </Badge>
              <a
                href="/clawd-swap"
                className="inline-flex items-center gap-1 text-xs text-amber-200/80 hover:text-amber-100"
              >
                Why use it <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <h2 className="mt-2 text-sm font-semibold text-white">
              Route CLAWD buys through our own Meteora pool.
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Native swaps are holder-only. Browse market data freely; hold $CLAWD to route trades through the CLAWD/SOL pool.
            </p>
          </div>
          <ClawdSwapWidget />
        </div>

        {/* ── Left: Token List ── */}
        <div className="order-1 flex w-full shrink-0 flex-col gap-3 xl:order-2 xl:w-[320px]">
          <Tabs value={activeListTab} onValueChange={setActiveListTab}>
            <TabsList className="w-full bg-gray-900 border border-gray-800">
              <TabsTrigger value="trending" className="flex-1 text-xs">
                <TrendingUp className="h-3 w-3 mr-1" />Trending
              </TabsTrigger>
              <TabsTrigger value="new" className="flex-1 text-xs">
                <Zap className="h-3 w-3 mr-1" />New
              </TabsTrigger>
              <TabsTrigger value="search" className="flex-1 text-xs">
                <Search className="h-3 w-3 mr-1" />Search
              </TabsTrigger>
            </TabsList>

            <div className="mt-2 border border-gray-800 rounded-lg bg-gray-900 overflow-hidden">
              <TabsContent value="trending" className="m-0">
                <ScrollArea className="h-[min(52vh,480px)] xl:h-[calc(100vh-180px)]">
                  {loadingTrending ? (
                    Array(8).fill(0).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                        <Skeleton className="w-8 h-8 rounded-full bg-gray-800" />
                        <div className="flex-1">
                          <Skeleton className="h-3 w-16 bg-gray-800 mb-1" />
                          <Skeleton className="h-2 w-24 bg-gray-800" />
                        </div>
                        <Skeleton className="h-3 w-16 bg-gray-800" />
                      </div>
                    ))
                  ) : trendingTokens.length > 0 ? (
                    trendingTokens.map((t, i) => (
                      <TokenRow key={t.address} token={t} rank={i + 1}
                        onSelect={handleSelectToken}
                        selected={selectedToken?.address === t.address} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-500 text-sm">No trending tokens</div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="new" className="m-0">
                <ScrollArea className="h-[min(52vh,480px)] xl:h-[calc(100vh-180px)]">
                  {loadingNew ? (
                    Array(8).fill(0).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                        <Skeleton className="w-8 h-8 rounded-full bg-gray-800" />
                        <div className="flex-1"><Skeleton className="h-3 w-16 bg-gray-800 mb-1" /><Skeleton className="h-2 w-24 bg-gray-800" /></div>
                        <Skeleton className="h-3 w-16 bg-gray-800" />
                      </div>
                    ))
                  ) : newTokens.length > 0 ? (
                    newTokens.map(t => (
                      <TokenRow key={t.address} token={t}
                        onSelect={handleSelectToken}
                        selected={selectedToken?.address === t.address} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      <Zap className="h-8 w-8 mx-auto mb-2 text-gray-700" />
                      New listings will appear here
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="search" className="m-0">
                <ScrollArea className="h-[min(52vh,480px)] xl:h-[calc(100vh-180px)]">
                  {!debouncedQuery.trim() ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      <Search className="h-8 w-8 mx-auto mb-2 text-gray-700" />
                      Type to search tokens
                    </div>
                  ) : loadingSearch ? (
                    <div className="p-8 text-center text-gray-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-purple-400" />
                      Searching…
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(t => (
                      <TokenRow key={t.address} token={t}
                        onSelect={handleSelectToken}
                        selected={selectedToken?.address === t.address} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-500 text-sm">No results for "{debouncedQuery}"</div>
                  )}
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* ── Right: Token Detail ── */}
        <div className="order-2 min-w-0 flex-1 xl:order-3">
          {!selectedToken ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-24 text-gray-600">
              <BarChart2 className="h-16 w-16 mb-4 text-gray-800" />
              <h2 className="text-xl font-bold text-gray-500 mb-2">Select a Token</h2>
              <p className="text-sm text-gray-600">Click any token from the list to view full market data, charts, trades, and AI analysis.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* ── Token Header ── */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <div className="h-11 w-11 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden shrink-0 sm:h-14 sm:w-14">
                      {tokenDetail?.logoURI ? (
                        <img src={tokenDetail.logoURI} alt="" className="w-full h-full object-cover"
                          onError={e => { (e.target as any).style.display = 'none'; }} />
                      ) : (
                        <span className="text-lg font-bold text-purple-400">{tokenDetail?.symbol?.slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="max-w-full truncate text-lg font-bold text-white sm:text-2xl">{tokenDetail?.name}</h1>
                        <Badge className="bg-gray-800 text-gray-300 border-gray-700">{tokenDetail?.symbol}</Badge>
                        {metadata?.extensions?.coingecko_id && (
                          <Badge className="bg-orange-900/40 text-orange-400 border-orange-700 text-[10px]">CG</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={copyAddress}
                          className="text-xs text-gray-500 hover:text-purple-400 transition-colors font-mono flex items-center gap-1">
                          {fmtAddr(tokenDetail?.address, 8)}
                          {copiedAddr ? <span className="text-emerald-400">✓</span> : <Copy className="h-3 w-3" />}
                        </button>
                        <a href={`https://birdeye.so/token/${tokenDetail?.address}?chain=solana`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-gray-600 hover:text-purple-400">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <a href={`https://solscan.io/token/${tokenDetail?.address}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-gray-600 hover:text-purple-400">
                          <Globe className="h-3.5 w-3.5" />
                        </a>
                        {tokenDetail?.extensions?.telegram && (
                          <a href={tokenDetail.extensions.telegram} target="_blank" rel="noopener noreferrer"
                            className="text-gray-600 hover:text-sky-400">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-end justify-between gap-3 sm:block sm:text-right">
                    {loadingOverview ? (
                      <Skeleton className="h-8 w-32 bg-gray-800 mb-1 ml-auto" />
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-white sm:text-3xl">{fmtPrice(tokenDetail?.price)}</div>
                        <div className={`flex items-center justify-end gap-1 text-sm font-medium ${pctClass(tokenDetail?.priceChange24hPercent)}`}>
                          {(tokenDetail?.priceChange24hPercent ?? 0) >= 0
                            ? <ArrowUpRight className="h-4 w-4" />
                            : <ArrowDownRight className="h-4 w-4" />}
                          {fmtPct(tokenDetail?.priceChange24hPercent)} (24h)
                        </div>
                      </>
                    )}
                    <Button size="sm" className="mt-0 bg-purple-600 hover:bg-purple-700 text-white sm:mt-2"
                      onClick={handleAiAnalyze} disabled={isAnalyzing}>
                      {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
                      {hasHolderAccess ? "AI Analyze" : "Holder AI"}
                    </Button>
                    {tokenDetail?.address && (
                      <ClawdTokenAction
                        mintAddress={tokenDetail.address}
                        symbol={tokenDetail.symbol}
                        name={tokenDetail.name}
                        logoURI={tokenDetail.logoURI}
                        decimals={tokenDetail.decimals}
                        price={tokenDetail.price}
                        variant="inline"
                      />
                    )}
                  </div>
                </div>

                {/* Price change timeframe badges */}
                <div className="mobile-scroll mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                  <PctBadge label="1m" value={tokenDetail?.priceChange1mPercent} />
                  <PctBadge label="5m" value={tokenDetail?.priceChange5mPercent} />
                  <PctBadge label="30m" value={tokenDetail?.priceChange30mPercent} />
                  <PctBadge label="1h" value={tokenDetail?.priceChange1hPercent} />
                  <PctBadge label="4h" value={tokenDetail?.priceChange4hPercent} />
                  <PctBadge label="24h" value={tokenDetail?.priceChange24hPercent} />
                  <div className="ml-2 flex flex-col items-center bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[80px]">
                    <span className="text-[10px] text-gray-500 mb-0.5">Vol 24h</span>
                    <span className="text-xs font-bold text-blue-400">{fmtNum(tokenDetail?.volume24hUSD)}</span>
                  </div>
                  <div className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[80px]">
                    <span className="text-[10px] text-gray-500 mb-0.5">Liq</span>
                    <span className="text-xs font-bold text-cyan-400">{fmtNum(tokenDetail?.liquidity)}</span>
                  </div>
                  <div className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[80px]">
                    <span className="text-[10px] text-gray-500 mb-0.5">Mkt Cap</span>
                    <span className="text-xs font-bold text-purple-400">{fmtNum(tokenDetail?.marketCap)}</span>
                  </div>
                  {tokenDetail?.holder != null && (
                    <div className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[70px]">
                      <span className="text-[10px] text-gray-500 mb-0.5">Holders</span>
                      <span className="text-xs font-bold text-amber-400">{fmtNum(tokenDetail.holder)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Chart ── */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-300">Price Chart</span>
                    {chartSource && (
                      <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px]">
                        {String(chartSource).replace('-', ' ')}
                      </Badge>
                    )}
                  </div>
                  <div className="mobile-scroll flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {['1m','5m','15m','1h','4h','1d'].map(t => (
                      <button key={t}
                        className={`text-[11px] px-2 py-1 rounded transition-colors ${
                          ohlcvType === t
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-500 hover:text-gray-300 bg-gray-800'
                        }`}
                        onClick={() => setOhlcvType(t)}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                <div ref={chartRef} className="w-full">
                  {loadingOHLCV ? (
                    <div className="flex h-64 items-center justify-center sm:h-48">
                      <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                    </div>
                  ) : chartPrices.length > 1 ? (
                    <SvgTokenChart key={chartKey} points={chartPoints} color={priceColor} />
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
                      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs text-gray-500">
                        <span>{chartError ? `Chart API fallback: ${chartError}` : 'Live embedded chart fallback'}</span>
                        <span className="font-mono">{fmtAddr(tokenDetail?.address, 5)}</span>
                      </div>
                      <iframe
                        title={`${tokenDetail?.symbol || 'Token'} live chart`}
                        src={`https://dexscreener.com/solana/${tokenDetail?.address}?embed=1&theme=dark&trades=0&info=0`}
                        className="h-[430px] w-full border-0 sm:h-[360px]"
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Detail Tabs ── */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
                  <div className="mobile-scroll overflow-x-auto border-b border-gray-800 px-3 sm:px-4">
                    <TabsList className="h-11 min-w-max gap-1 bg-transparent p-0">
                      {[
                        { v: 'overview', label: 'Overview', icon: Info },
                        { v: 'trades', label: 'Trades', icon: Activity },
                        { v: 'traders', label: 'Top Traders', icon: Users },
                        { v: 'liquidity', label: 'Liquidity', icon: Droplets },
                        { v: 'intel', label: 'Intel', icon: Network },
                        { v: 'security', label: 'Security', icon: Shield },
                        { v: 'ai', label: 'AI Analysis', icon: Brain },
                      ].map(({ v, label, icon: Icon }) => (
                        <TabsTrigger key={v} value={v}
                          className="h-9 px-2 text-[11px] data-[state=active]:text-purple-300 data-[state=active]:border-b-2 data-[state=active]:border-purple-500 rounded-none sm:px-3 sm:text-xs">
                          <Icon className="h-3 w-3 mr-1" />{label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {/* Overview */}
                  <TabsContent value="overview" className="p-5 m-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                      {[
                        { label: 'Market Cap', value: fmtNum(tokenDetail?.marketCap), color: 'text-purple-400' },
                        { label: 'FDV', value: fmtNum(tokenDetail?.fdv), color: 'text-indigo-400' },
                        { label: 'Volume 24h', value: fmtNum(tokenDetail?.volume24hUSD), color: 'text-blue-400' },
                        { label: 'Liquidity', value: fmtNum(tokenDetail?.liquidity), color: 'text-cyan-400' },
                        { label: 'Volume 1h', value: fmtNum(tokenDetail?.v1hUSD), color: 'text-teal-400' },
                        { label: 'Volume 4h', value: fmtNum(tokenDetail?.v4hUSD), color: 'text-green-400' },
                        { label: 'Holders', value: fmtNum(tokenDetail?.holder), color: 'text-amber-400' },
                        { label: 'Wallets 24h', value: fmtNum(tokenDetail?.uniqueWallet24h), color: 'text-orange-400' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/60">
                          <div className="text-[11px] text-gray-500 mb-1">{label}</div>
                          <div className={`text-base font-bold ${color}`}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Trade stats */}
                    {(tokenDetail?.buy24h != null || tokenDetail?.sell24h != null) && (
                      <div className="mb-5">
                        <h3 className="text-sm font-semibold text-gray-400 mb-3">Trade Activity (24h)</h3>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3 text-center">
                            <div className="text-[11px] text-emerald-600 mb-1">Buys</div>
                            <div className="text-lg font-bold text-emerald-400">{tokenDetail?.buy24h?.toLocaleString() ?? '—'}</div>
                          </div>
                          <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-center">
                            <div className="text-[11px] text-red-600 mb-1">Sells</div>
                            <div className="text-lg font-bold text-red-400">{tokenDetail?.sell24h?.toLocaleString() ?? '—'}</div>
                          </div>
                          <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-3 text-center">
                            <div className="text-[11px] text-gray-500 mb-1">Total</div>
                            <div className="text-lg font-bold text-white">{tokenDetail?.trade24h?.toLocaleString() ?? '—'}</div>
                          </div>
                        </div>
                        {/* Buy/Sell pressure bar */}
                        {tokenDetail?.buy24h != null && tokenDetail?.sell24h != null && (
                          <div className="mt-3">
                            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                              <span>Buy pressure</span><span>Sell pressure</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${(tokenDetail.buy24h / (tokenDetail.buy24h + tokenDetail.sell24h)) * 100}%` }}
                              />
                              <div className="h-full bg-red-500 flex-1" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    {(tokenDetail?.extensions?.description || metadata?.extensions?.description) && (
                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-2">About</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {tokenDetail?.extensions?.description || metadata?.extensions?.description}
                        </p>
                      </div>
                    )}

                    {/* Links */}
                    <div className="flex gap-2 flex-wrap mt-4">
                      <a href={`https://solscan.io/token/${tokenDetail?.address}`}
                        target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"
                          className="border-gray-700 text-gray-400 hover:text-white text-xs h-8">
                          <ExternalLink className="h-3 w-3 mr-1" />SolScan
                        </Button>
                      </a>
                      <a href={`https://birdeye.so/token/${tokenDetail?.address}?chain=solana`}
                        target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"
                          className="border-gray-700 text-gray-400 hover:text-white text-xs h-8">
                          <Eye className="h-3 w-3 mr-1" />BirdEye
                        </Button>
                      </a>
                      <a href={`https://dexscreener.com/solana/${tokenDetail?.address}`}
                        target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"
                          className="border-gray-700 text-gray-400 hover:text-white text-xs h-8">
                          <BarChart2 className="h-3 w-3 mr-1" />DexScreener
                        </Button>
                      </a>
                      {tokenDetail?.extensions?.website && (
                        <a href={tokenDetail.extensions.website} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline"
                            className="border-gray-700 text-gray-400 hover:text-white text-xs h-8">
                            <Globe className="h-3 w-3 mr-1" />Website
                          </Button>
                        </a>
                      )}
                    </div>
                  </TabsContent>

                  {/* Trades */}
                  <TabsContent value="trades" className="m-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-800 text-gray-500">
                            <th className="px-4 py-2 text-left">Time</th>
                            <th className="px-4 py-2 text-left">Type</th>
                            <th className="px-4 py-2 text-right">Price</th>
                            <th className="px-4 py-2 text-right">Volume</th>
                            <th className="px-4 py-2 text-left">Wallet</th>
                            <th className="px-4 py-2 text-left">DEX</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingTrades ? (
                            Array(10).fill(0).map((_, i) => (
                              <tr key={i} className="border-b border-gray-800/40">
                                {Array(6).fill(0).map((_, j) => (
                                  <td key={j} className="px-4 py-2">
                                    <Skeleton className="h-3 w-16 bg-gray-800" />
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : trades.length > 0 ? (
                            trades.map((t, i) => (
                              <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                                <td className="px-4 py-2 text-gray-500 font-mono">{fmtTime(t.blockTime)}</td>
                                <td className="px-4 py-2">
                                  <Badge className={`text-[10px] px-1.5 py-0 ${
                                    t.side === 'buy'
                                      ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
                                      : 'bg-red-900/40 text-red-400 border-red-700'
                                  }`}>
                                    {t.side?.toUpperCase() ?? '—'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-gray-300">{fmtPrice(t.priceUsd || t.price)}</td>
                                <td className="px-4 py-2 text-right font-medium text-gray-200">{fmtNum(t.volumeUsd)}</td>
                                <td className="px-4 py-2">
                                  <a href={`https://solscan.io/account/${t.owner}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-purple-400 hover:underline font-mono">{fmtAddr(t.owner)}</a>
                                </td>
                                <td className="px-4 py-2 text-gray-500">{t.source}</td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-600">No trades found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  {/* Top Traders */}
                  <TabsContent value="traders" className="m-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-800 text-gray-500">
                            <th className="px-4 py-2 text-left">#</th>
                            <th className="px-4 py-2 text-left">Wallet</th>
                            <th className="px-4 py-2 text-right">Volume</th>
                            <th className="px-4 py-2 text-right">Buy Vol</th>
                            <th className="px-4 py-2 text-right">Sell Vol</th>
                            <th className="px-4 py-2 text-right">Trades</th>
                            <th className="px-4 py-2 text-right">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingTraders ? (
                            Array(5).fill(0).map((_, i) => (
                              <tr key={i} className="border-b border-gray-800/40">
                                {Array(7).fill(0).map((_, j) => (
                                  <td key={j} className="px-4 py-2"><Skeleton className="h-3 w-16 bg-gray-800" /></td>
                                ))}
                              </tr>
                            ))
                          ) : traders.length > 0 ? (
                            traders.map((t, i) => (
                              <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                                <td className="px-4 py-2.5 text-gray-600">{i + 1}</td>
                                <td className="px-4 py-2.5">
                                  <a href={`https://solscan.io/account/${t.address}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-purple-400 hover:underline font-mono">{fmtAddr(t.address)}</a>
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-200 font-medium">{fmtNum(t.volume)}</td>
                                <td className="px-4 py-2.5 text-right text-emerald-400">{fmtNum(t.volumeBuy)}</td>
                                <td className="px-4 py-2.5 text-right text-red-400">{fmtNum(t.volumeSell)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-400">{t.tradeCount ?? '—'}</td>
                                <td className={`px-4 py-2.5 text-right font-medium ${(t.netVolume ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {t.netVolume != null ? fmtNum(Math.abs(t.netVolume)) : '—'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">No trader data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  {/* Liquidity */}
                  <TabsContent value="liquidity" className="p-5 m-0">
                    {!liquidity ? (
                      <div className="text-center py-8 text-gray-600">
                        <Droplets className="h-8 w-8 mx-auto mb-2 text-gray-700" />
                        Loading liquidity data…
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {[
                            { label: 'Total Liquidity', value: fmtNum(liquidity.liquidity || liquidity.totalLiquidity), color: 'text-cyan-400' },
                            { label: 'Total LP', value: fmtNum(liquidity.totalLp), color: 'text-teal-400' },
                            { label: 'Active Pairs', value: liquidity.activePair ?? liquidity.pools?.length, color: 'text-blue-400' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-4">
                              <div className="text-[11px] text-gray-500 mb-1">{label}</div>
                              <div className={`text-xl font-bold ${color}`}>{value ?? '—'}</div>
                            </div>
                          ))}
                        </div>
                        {liquidity.pools && liquidity.pools.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-2">Top Liquidity Pools</h3>
                            <div className="space-y-2">
                              {liquidity.pools.slice(0, 5).map((pool: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-gray-800/40 border border-gray-700/40 rounded-lg px-4 py-3">
                                  <div>
                                    <div className="text-xs font-medium text-white">{pool.source || pool.name || 'Pool'}</div>
                                    <div className="text-[11px] text-gray-500 font-mono mt-0.5">{fmtAddr(pool.address, 6)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-bold text-cyan-400">{fmtNum(pool.liquidity)}</div>
                                    <div className="text-[10px] text-gray-500">{pool.liquidityPercent?.toFixed(1)}%</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* Token Intelligence */}
                  <TabsContent value="intel" className="p-5 m-0">
                    {loadingIntel ? (
                      <div className="text-center py-8 text-gray-600">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-cyan-400" />
                        Loading Birdeye, Solana Tracker, DFlow, and Bubblemaps intelligence…
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/35 via-gray-950 to-purple-950/30 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="mb-2 flex items-center gap-2">
                                <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                                  Onchain Intel
                                </Badge>
                                <Badge className="border-purple-500/30 bg-purple-500/10 text-purple-300">
                                  Bubblemap Ready
                                </Badge>
                              </div>
                              <h3 className="text-base font-semibold text-white">Holder graph and market intelligence</h3>
                              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-400">
                                Combines Birdeye market/security data, Solana Tracker ownership signals, DFlow market context, and a live Bubblemaps V2 route for this token.
                              </p>
                            </div>
                            {bubblemapUrl && (
                              <a href={bubblemapUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500">
                                  <Network className="mr-1.5 h-3.5 w-3.5" /> Open Bubblemap
                                </Button>
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          {[
                            { label: 'Top 10 Holders', value: fmtPct(tokenIntel?.summary?.top10HolderPercent), color: 'text-amber-400' },
                            { label: 'Creator Share', value: fmtPct(tokenIntel?.summary?.creatorPercentage), color: 'text-orange-400' },
                            { label: 'Risk Score', value: tokenIntel?.summary?.riskScore ?? '—', color: tokenIntel?.summary?.rugged ? 'text-red-400' : 'text-emerald-400' },
                            { label: 'DFlow Market', value: tokenIntel?.summary?.dflowMarket?.ticker || '—', color: tokenIntel?.summary?.dflowMarket ? 'text-cyan-400' : 'text-gray-500' },
                            { label: 'Snipers', value: fmtPct(tokenIntel?.summary?.ownership?.snipersPercent), color: 'text-red-300' },
                            { label: 'Bundlers', value: fmtPct(tokenIntel?.summary?.ownership?.bundlersPercent), color: 'text-fuchsia-300' },
                            { label: 'Insiders', value: fmtPct(tokenIntel?.summary?.ownership?.insidersPercent), color: 'text-purple-300' },
                            { label: 'Tracked Holders', value: fmtNum(tokenIntel?.summary?.ownership?.holders ?? tokenIntel?.summary?.holderCount), color: 'text-blue-300' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-lg border border-gray-700/60 bg-gray-800/60 p-3">
                              <div className="mb-1 text-[11px] text-gray-500">{label}</div>
                              <div className={`truncate text-base font-bold ${color}`}>{value}</div>
                            </div>
                          ))}
                        </div>

                        {Array.isArray(tokenIntel?.signals) && tokenIntel.signals.length > 0 && (
                          <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <h3 className="text-sm font-semibold text-gray-300">Derived Signals</h3>
                              {tokenIntel?.sourceCoverage && (
                                <Badge className="border-gray-700 bg-gray-800 text-gray-400 text-[10px]">
                                  {tokenIntel.sourceCoverage.available}/{tokenIntel.sourceCoverage.total} sources live
                                </Badge>
                              )}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {tokenIntel.signals.slice(0, 9).map((signal: any, index: number) => (
                                <div
                                  key={`${signal.label}-${index}`}
                                  className={`rounded-lg border p-3 ${intelSignalTone(signal.level)}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-semibold text-gray-100">{signal.label}</div>
                                      <div className="mt-1 text-[11px] leading-relaxed text-gray-400">{signal.detail}</div>
                                    </div>
                                    <div className="shrink-0 text-sm font-bold">{signal.value}</div>
                                  </div>
                                  <div className="mt-2 text-[10px] uppercase tracking-wide text-gray-600">{signal.source}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid gap-3 lg:grid-cols-4">
                          {[
                            {
                              label: 'Birdeye',
                              detail: 'Overview, liquidity, security',
                              live: tokenIntel?.sources?.birdeye?.overview?.available,
                            },
                            {
                              label: 'Solana Tracker',
                              detail: 'Risk, holders, snipers, bundlers',
                              live: tokenIntel?.sources?.solanaTracker?.token?.available,
                            },
                            {
                              label: 'DFlow',
                              detail: tokenIntel?.sources?.dflow?.configured ? 'Prediction market by mint' : 'API key not configured',
                              live: tokenIntel?.sources?.dflow?.market?.available || tokenIntel?.sources?.dflow?.liveData?.available,
                            },
                            {
                              label: 'Bubblemaps',
                              detail: tokenIntel?.sources?.bubblemaps?.firecrawlConfigured ? 'Firecrawl interaction enabled' : 'Open-link only',
                              live: Boolean(bubblemapUrl),
                            },
                          ].map(({ label, detail, live }) => (
                            <div key={label} className="rounded-lg border border-gray-700/60 bg-gray-950/60 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-gray-200">{label}</span>
                                <Badge className={`border text-[10px] ${
                                  live
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    : 'border-gray-600 bg-gray-800 text-gray-400'
                                }`}>
                                  {live ? 'Live' : 'Unavailable'}
                                </Badge>
                              </div>
                              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{detail}</p>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-xl border border-gray-700/60 bg-gray-950/70 p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10">
                              <Sparkles className="h-4 w-4 text-cyan-300" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white">Ask the Bubblemap</div>
                              <div className="text-[11px] text-gray-500">Uses Firecrawl to interact with the live Bubblemaps V2 token page.</div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              value={bubblePrompt}
                              onChange={(event) => setBubblePrompt(event.target.value)}
                              placeholder="Ask about wallet clusters, top holders, or suspicious links"
                              className="bg-gray-900 border-gray-700 text-white placeholder-gray-500"
                            />
                            <Button
                              onClick={handleBubbleAsk}
                              disabled={isBubbleAsking || !tokenDetail?.address}
                              className="bg-cyan-600 text-white hover:bg-cyan-500 sm:w-auto">
                              {isBubbleAsking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                              Ask
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {BUBBLE_PROMPT_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setBubblePrompt(preset)}
                                className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-[11px] text-gray-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
                              >
                                {preset.split(' ').slice(0, 4).join(' ')}
                              </button>
                            ))}
                          </div>
                          {bubbleAnswer && (
                            <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-4">
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{bubbleAnswer}</p>
                            </div>
                          )}
                        </div>

                        {Array.isArray(tokenIntel?.errors) && tokenIntel.errors.length > 0 && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5" /> Partial source coverage
                            </div>
                            <div className="space-y-1">
                              {tokenIntel.errors.slice(0, 5).map((item: any, index: number) => (
                                <div key={`${item.source}-${index}`} className="text-[11px] text-amber-100/70">
                                  {item.source}: {item.error}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* Security */}
                  <TabsContent value="security" className="p-5 m-0">
                    {loadingSecurity ? (
                      <div className="text-center py-8 text-gray-600">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-purple-400" />
                        Loading security data…
                      </div>
                    ) : !security ? (
                      <div className="text-center py-8 text-gray-600">No security data available</div>
                    ) : (
                      <div className="space-y-4">
                        {/* Risk flags */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            {
                              label: 'Mint Authority',
                              risk: security.mintAuthority != null && security.mintAuthority !== 'null',
                              safe: 'Disabled',
                              danger: 'Enabled',
                              icon: AlertTriangle,
                            },
                            {
                              label: 'Freeze Authority',
                              risk: security.freezeAuthority != null && security.freezeAuthority !== 'null',
                              safe: 'Disabled',
                              danger: 'Enabled',
                              icon: Shield,
                            },
                          ].map(({ label, risk, safe, danger, icon: Icon }) => (
                            <div key={label}
                              className={`flex items-center gap-3 rounded-lg p-4 border ${
                                risk
                                  ? 'bg-red-900/20 border-red-800/50'
                                  : 'bg-emerald-900/20 border-emerald-800/50'
                              }`}
                            >
                              <Icon className={`h-5 w-5 shrink-0 ${risk ? 'text-red-400' : 'text-emerald-400'}`} />
                              <div>
                                <div className="text-xs font-semibold text-gray-300">{label}</div>
                                <div className={`text-xs ${risk ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {risk ? danger : safe}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {[
                            { label: 'Creator', value: fmtAddr(security.creatorAddress, 8) },
                            { label: 'Creator Balance', value: `${security.creatorPercentage?.toFixed(2) ?? '—'}%` },
                            { label: 'Top 10 Holders', value: `${security.top10HolderPercent?.toFixed(2) ?? '—'}%` },
                            { label: 'Total Supply', value: fmtNum(security.totalSupply) },
                            { label: 'Token-2022', value: security.isToken2022 ? 'Yes' : 'No' },
                            { label: 'Mintable', value: security.isMintable ? '⚠ Yes' : 'No' },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-3">
                              <div className="text-[11px] text-gray-500 mb-1">{label}</div>
                              <div className="text-sm font-medium text-gray-200">{value}</div>
                            </div>
                          ))}
                        </div>

                        {security.top10HolderPercent != null && (
                          <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Top 10 holder concentration</span>
                              <span className={security.top10HolderPercent > 50 ? 'text-red-400' : 'text-emerald-400'}>
                                {security.top10HolderPercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${security.top10HolderPercent > 50 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(security.top10HolderPercent, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* AI Analysis */}
                  <TabsContent value="ai" className="p-5 m-0">
                    <div className="flex flex-col items-center">
                      {isAnalyzing ? (
                        <div className="text-center py-12">
                          <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-purple-900/30 border border-purple-700/50 flex items-center justify-center mx-auto mb-4">
                              <Brain className="h-8 w-8 text-purple-400 animate-pulse" />
                            </div>
                          </div>
                          <p className="text-gray-400">Clawd is analyzing the token…</p>
                          <p className="text-gray-600 text-sm mt-1">Processing chart data and market metrics</p>
                        </div>
                      ) : aiAnalysis ? (
                        <div className="w-full">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-700 flex items-center justify-center">
                              <Brain className="h-4 w-4 text-purple-400" />
                            </div>
                            <span className="text-sm font-semibold text-purple-300">Clawd AI Analysis</span>
                            <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-[10px]">
                              {tokenDetail?.symbol}
                            </Badge>
                          </div>
                          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
                          </div>
                          <Button size="sm" variant="outline"
                            className="mt-4 border-gray-700 text-gray-400 hover:text-white"
                            onClick={handleAiAnalyze}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Re-analyze
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <Brain className="h-12 w-12 mx-auto mb-4 text-gray-700" />
                          <p className="text-gray-500 mb-1">No analysis yet</p>
                          <p className="text-gray-600 text-sm mb-4">Click "AI Analyze" to get Clawd's insights on this token</p>
                          <Button onClick={handleAiAnalyze}
                            className="bg-purple-600 hover:bg-purple-700">
                            <Brain className="h-4 w-4 mr-2" /> Analyze with Clawd AI
                          </Button>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
