import { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { HeliusService } from '@/lib/heliusService';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { normalizeChartResponse, type NormalizedChartPoint } from '@/lib/tokenChartData';
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TokenDetailsProps {
  mintAddress: string;
  symbol?: string;
  timeframe?: '1h' | '24h' | '7d' | '30d';
  onClose?: () => void;
}

interface TokenMetadata {
  name: string;
  symbol: string;
  description?: string;
  supply?: number;
  decimals: number;
  imageUrl?: string;
  price?: number;
  volume24h?: number;
  holders?: number;
}

const chartParamsForTimeframe = (timeframe: TokenDetailsProps['timeframe']) => {
  const now = Math.floor(Date.now() / 1000);
  const ranges = {
    '1h': { type: '1m', seconds: 3600, limit: 60 },
    '24h': { type: '15m', seconds: 86400, limit: 96 },
    '7d': { type: '1h', seconds: 7 * 86400, limit: 168 },
    '30d': { type: '4h', seconds: 30 * 86400, limit: 180 },
  } as const;
  const range = ranges[timeframe || '24h'];
  return `type=${range.type}&time_from=${now - range.seconds}&time_to=${now}&limit=${range.limit}`;
};

export function TokenDetails({ mintAddress, symbol, timeframe = '24h', onClose }: TokenDetailsProps) {
  const [chartTimeframe, setChartTimeframe] = useState(timeframe);
  const [showVolume, setShowVolume] = useState(false);

  // Fetch token metadata from DAS API
  const { data: metadata, isLoading: metadataLoading } = useQuery<TokenMetadata>({
    queryKey: ['tokenMetadata', mintAddress],
    queryFn: async () => {
      const [heliusAsset, tokenAccounts] = await Promise.all([
        HeliusService.searchAssets(mintAddress),
        HeliusService.getTokenAccounts({ mint: mintAddress })
      ]);

      const asset = heliusAsset[0];
      if (!asset) throw new Error('Token not found');

      return {
        name: asset.content.metadata?.name || symbol || 'Unknown Token',
        symbol: asset.content.metadata?.symbol || symbol || '???',
        description: asset.content.metadata?.description,
        supply: asset.content.token_info?.supply,
        decimals: asset.content.token_info?.decimals || 9,
        price: asset.content.token_info?.price_info?.price_per_token,
        imageUrl: asset.content.files?.[0]?.uri,
        holders: tokenAccounts.length
      };
    }
  });

  // Fetch chart data from Solana Tracker
  const { data: chartData, isLoading: chartLoading } = useQuery<NormalizedChartPoint[]>({
    queryKey: ['tokenChart', mintAddress, chartTimeframe],
    queryFn: async () => {
      const response = await apiRequest(`/api/birdeye/ohlcv/${mintAddress}?${chartParamsForTimeframe(chartTimeframe)}`);
      return normalizeChartResponse(response);
    },
    refetchInterval: 10000
  });

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'rgb(255, 255, 255, 0.8)',
          font: { family: 'system-ui' }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y;
            return showVolume ? 
              `Volume: ${value.toFixed(2)} SOL` :
              `Price: ${value.toFixed(6)} SOL`;
          }
        }
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgb(255, 255, 255, 0.8)',
          callback: (value: number) => 
            showVolume ? 
              `${value.toFixed(2)} SOL` :
              `${value.toFixed(6)} SOL`
        }
      },
      x: {
        ticks: {
          color: 'rgb(255, 255, 255, 0.8)',
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    }
  };

  if (metadataLoading || chartLoading) {
    return (
      <Card className="w-full bg-black/40 border-purple-500/30">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-purple-500/20 rounded" />
            <div className="h-4 w-32 bg-purple-500/20 rounded" />
            <div className="h-[300px] bg-purple-500/20 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metadata || !chartData) {
    return (
      <Card className="w-full bg-black/40 border-purple-500/30">
        <CardContent className="p-6 text-center text-red-400">
          Failed to load token data
        </CardContent>
      </Card>
    );
  }

  const chartDataset = {
    labels: chartData.map((d) => {
      const date = new Date(d.timestamp);
      return chartTimeframe === '1h' ? 
        date.toLocaleTimeString() : 
        date.toLocaleDateString();
    }),
    datasets: [
      {
        label: showVolume ? 'Volume' : 'Price',
        data: showVolume ? 
          chartData.map((d) => d.volume) :
          chartData.map((d) => d.price),
        borderColor: showVolume ? 
          'rgb(59, 130, 246)' : 
          'rgb(147, 51, 234)',
        backgroundColor: showVolume ?
          'rgba(59, 130, 246, 0.1)' :
          'rgba(147, 51, 234, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  return (
    <Card className="w-full bg-black/40 border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {metadata.imageUrl && (
              <img 
                src={metadata.imageUrl} 
                alt={metadata.name} 
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
                {metadata.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono text-purple-400">
                  ${metadata.symbol}
                </span>
                <Badge variant="outline" className="text-xs">
                  {metadata.holders} holders
                </Badge>
                <ClawdTokenAction
                  mintAddress={mintAddress}
                  symbol={metadata.symbol}
                  name={metadata.name}
                  logoURI={metadata.imageUrl}
                  decimals={metadata.decimals}
                  price={metadata.price}
                  variant="badge"
                />
              </div>
            </div>
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-purple-400 hover:text-purple-300"
            >
              ×
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {metadata.description && (
            <p className="text-sm text-gray-300">
              {metadata.description}
            </p>
          )}

          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {['1h', '24h', '7d', '30d'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setChartTimeframe(tf as typeof chartTimeframe)}
                  className={`px-3 py-1 rounded text-sm ${
                    chartTimeframe === tf
                      ? 'bg-purple-500 text-white'
                      : 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`px-3 py-1 rounded text-sm ${
                showVolume
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
              }`}
            >
              {showVolume ? 'Show Price' : 'Show Volume'}
            </button>
          </div>

          <div className="h-[300px] overflow-hidden rounded-lg border border-purple-500/20 bg-black/40">
            {chartData.length > 1 ? (
              <Line options={chartOptions} data={chartDataset} />
            ) : (
              <iframe
                title={`${metadata.symbol} live chart`}
                src={`https://dexscreener.com/solana/${mintAddress}?embed=1&theme=dark&trades=0&info=0`}
                className="h-full w-full border-0"
                loading="lazy"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-purple-300 mb-1">Market Data</p>
              <div className="space-y-1 text-gray-300">
                <p>Price: {metadata.price?.toFixed(6) || 'N/A'} SOL</p>
                <p>24h Volume: {metadata.volume24h?.toFixed(2) || 'N/A'} SOL</p>
              </div>
            </div>
            <div>
              <p className="text-purple-300 mb-1">Token Info</p>
              <div className="space-y-1 text-gray-300">
                <p>Supply: {metadata.supply ? (metadata.supply / LAMPORTS_PER_SOL).toLocaleString() : 'N/A'}</p>
                <p>Decimals: {metadata.decimals}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
