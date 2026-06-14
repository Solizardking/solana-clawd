import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeChartResponse } from '@/lib/tokenChartData';

interface TrendingToken {
  symbol: string;
  mint: string;
  volume: number;
}

interface VolumeData {
  volume: number;
  time: number;
}

export function TrendingHeatmap() {
  const { data: trendingData, isLoading: isLoadingTrending } = useQuery({
    queryKey: ['trendingTokens'],
    queryFn: async () => {
      return apiRequest<TrendingToken[]>('/api/solana-tracker/trending');
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const topTokens = (trendingData || []).slice(0, 5); // Get top 5 tokens

  const { data: volumeData, isLoading: isLoadingVolume } = useQuery({
    queryKey: ['volumeHeatmap', topTokens.map(t => t.mint).join(',')],
    queryFn: async () => {
      if (!topTokens.length) return null;

      const now = Math.floor(Date.now() / 1000);
      const fiveHoursAgo = now - 5 * 3600;

      const promises = topTokens.map(async (token) => {
        const response = await apiRequest(`/api/solana-tracker/chart/${token.mint}?type=1h&time_from=${fiveHoursAgo}&time_to=${now}`);
        return normalizeChartResponse(response).map((point) => ({
          volume: point.volume,
          time: point.unixTime,
        }));
      });

      return Promise.all(promises);
    },
    enabled: topTokens.length > 0,
    refetchInterval: 60000
  });

  if (isLoadingTrending || isLoadingVolume) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-8 w-48" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!volumeData || !topTokens.length) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    );
  }

  const heatmapRows = volumeData.map((tokenData) =>
    Array.from({ length: 5 }, (_, index) => {
      const point = tokenData[index] || tokenData[tokenData.length - 1];
      return Math.log10((point?.volume || 0) + 1);
    })
  );
  const maxIntensity = Math.max(1, ...heatmapRows.flat());

  const timeLabels = Array.from({ length: 5 }, (_, i) => {
    const date = new Date();
    date.setHours(date.getHours() - (4 - i));
    return date.toLocaleTimeString();
  });

  return (
    <Card className="w-full bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
          Trading Activity Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="grid grid-cols-[90px_repeat(5,minmax(0,1fr))] gap-2 text-[10px] text-purple-300/70">
            <div />
            {timeLabels.map((label) => (
              <div key={label} className="truncate text-center">{label}</div>
            ))}
          </div>
          <div className="space-y-2">
            {topTokens.map((token, tokenIndex) => (
              <div key={token.mint} className="grid grid-cols-[90px_repeat(5,minmax(0,1fr))] gap-2 items-center">
                <div className="truncate text-xs font-semibold text-purple-200">{token.symbol}</div>
                {heatmapRows[tokenIndex]?.map((value, timeIndex) => {
                  const opacity = Math.max(0.12, value / maxIntensity);
                  return (
                    <div
                      key={`${token.mint}-${timeIndex}`}
                      className="h-10 rounded border border-purple-500/20"
                      style={{ backgroundColor: `rgba(147, 51, 234, ${opacity})` }}
                      title={`${token.symbol} volume intensity ${value.toFixed(2)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
