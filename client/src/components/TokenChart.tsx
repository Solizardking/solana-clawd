import { useEffect, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

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

interface TokenChartProps {
  mintAddress: string;
  timeframe?: '1h' | '24h' | '7d' | '30d';
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
}

export function TokenChart({ mintAddress, timeframe = '24h' }: TokenChartProps) {
  const { data: chartData, isLoading, error } = useQuery<ChartDataPoint[]>({
    queryKey: ['tokenChart', mintAddress, timeframe],
    queryFn: async () => {
      const response = await apiRequest<ChartDataPoint[]>(`/api/tokens/${mintAddress}/chart?timeframe=${timeframe}`);
      if (!response) throw new Error('No data received');
      return response;
    },
    refetchInterval: 10000 // Refresh every 10 seconds
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
          font: {
            family: 'system-ui'
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toFixed(6)} SOL`;
          },
          afterBody: function(tooltipItems: any[]) {
            const dataIndex = tooltipItems[0].dataIndex;
            const data = chartData![dataIndex];
            return [
              '',
              `Virtual SOL: ${(Number(data.virtualSolReserves) / LAMPORTS_PER_SOL).toFixed(4)}`,
              `Virtual Tokens: ${(Number(data.virtualTokenReserves) / LAMPORTS_PER_SOL).toFixed(4)}`,
              `Real SOL: ${(Number(data.realSolReserves) / LAMPORTS_PER_SOL).toFixed(4)}`,
              `Real Tokens: ${(Number(data.realTokenReserves) / LAMPORTS_PER_SOL).toFixed(4)}`,
              data.isComplete ? '🔄 Migrated to DEX' : ''
            ];
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
          callback: (value: number) => `${value.toFixed(6)} SOL`
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: 'rgb(255, 255, 255, 0.8)'
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
    },
  };

  if (isLoading) {
    return (
      <Card className="w-full bg-card">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {(['1h', '24h', '7d', '30d'] as const).map((t) => (
              <Skeleton key={t} className="h-8 w-12" />
            ))}
          </div>
          <Skeleton className="w-full h-[320px]" />
        </CardContent>
      </Card>
    );
  }

  if (error || !chartData) {
    return (
      <Card className="w-full bg-card">
        <CardContent className="p-0 overflow-hidden rounded-lg">
          <iframe
            title={`${mintAddress} live chart`}
            src={`https://dexscreener.com/solana/${mintAddress}?embed=1&theme=dark&trades=0&info=0`}
            className="h-[320px] w-full border-0"
            loading="lazy"
          />
        </CardContent>
      </Card>
    );
  }

  const timestamps = chartData.map(d => {
    const date = new Date(d.timestamp);
    return timeframe === '1h' ? date.toLocaleTimeString() : date.toLocaleDateString();
  });

  const prices = chartData.map(d => d.price);
  const volumes = chartData.map(d => d.volume);

  const data = {
    labels: timestamps,
    datasets: [
      {
        label: 'Price',
        data: prices,
        borderColor: 'rgb(147, 51, 234)',
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        fill: true,
        yAxisID: 'y',
        tension: 0.4,
      },
      {
        label: 'Volume',
        data: volumes,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        yAxisID: 'y1',
        tension: 0.4,
      },
    ],
  };

  const latestData = chartData[chartData.length - 1];
  const hasCompletedMigration = latestData?.isComplete;

  return (
    <Card className="w-full bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
            Token Metrics
          </CardTitle>
          {hasCompletedMigration && (
            <Badge variant="secondary" className="bg-green-500/10 text-green-400">
              Migrated to DEX
            </Badge>
          )}
        </div>
        <CardDescription>
          Real-time price and volume data with bonding curve metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] relative overflow-hidden rounded-lg">
          {chartData.length > 1 ? (
            <Line options={chartOptions} data={data} />
          ) : (
            <iframe
              title={`${mintAddress} live chart`}
              src={`https://dexscreener.com/solana/${mintAddress}?embed=1&theme=dark&trades=0&info=0`}
              className="h-full w-full border-0"
              loading="lazy"
            />
          )}
        </div>
        {latestData && (
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Virtual Reserves</p>
              <p>SOL: {(Number(latestData.virtualSolReserves) / LAMPORTS_PER_SOL).toFixed(4)}</p>
              <p>Tokens: {(Number(latestData.virtualTokenReserves) / LAMPORTS_PER_SOL).toFixed(4)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Real Reserves</p>
              <p>SOL: {(Number(latestData.realSolReserves) / LAMPORTS_PER_SOL).toFixed(4)}</p>
              <p>Tokens: {(Number(latestData.realTokenReserves) / LAMPORTS_PER_SOL).toFixed(4)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
