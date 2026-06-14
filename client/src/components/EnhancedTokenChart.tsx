import { useState } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Skeleton } from '@/components/ui/skeleton';
import { AMM } from '@/lib/amm';

interface OHLCV {
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  time: number;
}

interface ChartDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  virtualSolReserves: string;
  virtualTokenReserves: string;
  realSolReserves: string;
  realTokenReserves: string;
  isComplete?: boolean;
  ohlcv?: OHLCV;
}

interface EnhancedTokenChartProps {
  mintAddress: string;
  timeframe?: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '12h' | '1d';
}

export function EnhancedTokenChart({ mintAddress, timeframe: initialTimeframe = '1h' }: EnhancedTokenChartProps) {
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [chartType, setChartType] = useState<'price' | 'volume'>('price');

  // Combined query for both our data and Solana Tracker data
  const { data: chartData, isLoading } = useQuery<ChartDataPoint[]>({
    queryKey: ['tokenChart', mintAddress, timeframe],
    queryFn: async () => {
      // Get both data sources in parallel
      const [bondingData, trackerData] = await Promise.all([
        apiRequest<ChartDataPoint[]>(`/api/tokens/${mintAddress}/chart?timeframe=${timeframe}`),
        apiRequest<{ ohlcv: OHLCV[] }>(`/api/solana-tracker/chart/${mintAddress}?type=${timeframe}`)
      ]);

      // Initialize AMM with the latest data
      const latestPoint = bondingData[bondingData.length - 1];
      const amm = new AMM(
        latestPoint.virtualSolReserves,
        latestPoint.virtualTokenReserves,
        latestPoint.realSolReserves,
        latestPoint.realTokenReserves
      );

      // Merge and process data
      return bondingData.map(point => {
        const matchingOHLCV = trackerData.ohlcv.find(
          o => Math.abs(o.time - point.timestamp) < 60000 // Within 1 minute
        );

        // Calculate virtualized price using AMM
        const solAmount = BigInt(Math.floor(0.1 * LAMPORTS_PER_SOL));
        const estimatedPrice = amm.getBuyPrice(solAmount);

        return {
          ...point,
          price: Number(estimatedPrice) / LAMPORTS_PER_SOL,
          ohlcv: matchingOHLCV
        };
      });
    },
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <Card className="w-full bg-black/40 border-purple-500/30">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {(['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d'] as const).map((t) => (
              <Skeleton key={t} className="h-8 w-12" />
            ))}
          </div>
          <Skeleton className="w-full h-[400px]" />
        </CardContent>
      </Card>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="w-full bg-black/40 border-purple-500/30">
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    );
  }

  const timestamps = chartData.map(d => {
    const date = new Date(d.timestamp);
    return timeframe === '1m' || timeframe === '5m' || timeframe === '15m' || timeframe === '30m' || timeframe === '1h'
      ? date.toLocaleTimeString()
      : date.toLocaleDateString();
  });

  const priceData = chartData.map(d => d.ohlcv?.close || d.price);
  const volumeData = chartData.map(d => d.ohlcv?.volume || d.volume);

  const chartSeries = chartType === 'price' ? [{
    data: priceData,
    label: 'Price (SOL)',
    color: 'rgb(147, 51, 234)',
    area: true,
  }] : [{
    data: volumeData,
    label: 'Volume (SOL)',
    color: 'rgb(59, 130, 246)',
    area: true,
  }];

  const latestData = chartData[chartData.length - 1];
  const hasCompletedMigration = latestData?.isComplete;

  return (
    <Card className="w-full bg-black/40 border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
            Token Analytics
          </CardTitle>
          {hasCompletedMigration && (
            <Badge variant="secondary" className="bg-green-500/10 text-green-400">
              Migrated to DEX
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between mb-4">
          <div className="flex gap-2">
            {(['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d'] as const).map((t) => (
              <Button
                key={t}
                variant={timeframe === t ? "default" : "outline"}
                onClick={() => setTimeframe(t)}
                size="sm"
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['price', 'volume'] as const).map((type) => (
              <Button
                key={type}
                variant={chartType === type ? "default" : "outline"}
                onClick={() => setChartType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="h-[400px] w-full">
          <LineChart
            series={chartSeries}
            xAxis={[{
              data: timestamps,
              scaleType: 'time',
              valueFormatter: (value) => value.toString()
            }]}
            height={400}
            margin={{ left: 60, right: 20, top: 20, bottom: 30 }}
            tooltip={{
              trigger: 'axis'
            }}
          />
        </div>

        {latestData && (
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">OHLC Data (SOL)</p>
              <p>Open: {latestData.ohlcv?.open.toFixed(6) || 'N/A'}</p>
              <p>High: {latestData.ohlcv?.high.toFixed(6) || 'N/A'}</p>
              <p>Low: {latestData.ohlcv?.low.toFixed(6) || 'N/A'}</p>
              <p>Close: {latestData.ohlcv?.close.toFixed(6) || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Bonding Curve Metrics</p>
              <p>Virtual SOL: {(Number(latestData.virtualSolReserves) / LAMPORTS_PER_SOL).toFixed(4)}</p>
              <p>Real SOL: {(Number(latestData.realSolReserves) / LAMPORTS_PER_SOL).toFixed(4)}</p>
              <p>24h Volume: {latestData.ohlcv?.volume.toFixed(2) || 'N/A'} SOL</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}