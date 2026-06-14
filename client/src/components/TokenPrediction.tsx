import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, TrendingDown, Minus, Brain } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PredictionResult {
  prediction: number;
  confidence: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  reasoning: string;
}

interface TokenPredictionProps {
  mintAddress: string;
  currentPrice?: number;
}

export function TokenPrediction({ mintAddress, currentPrice = 0 }: TokenPredictionProps) {
  const { data: prediction, isLoading } = useQuery<PredictionResult>({
    queryKey: ['tokenPrediction', mintAddress],
    queryFn: () => apiRequest(`/api/tokens/${mintAddress}/prediction`),
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <Card className="bg-black/40 border-purple-500/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!prediction) return null;

  const priceDiff = prediction.prediction - currentPrice;
  const percentChange = currentPrice === 0 ? 0 : (priceDiff / currentPrice) * 100;

  const getTrendIcon = () => {
    switch (prediction.trend) {
      case 'bullish':
        return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'bearish':
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-yellow-400" />;
    }
  };

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-200">AI Prediction</span>
          {getTrendIcon()}
        </div>
        
        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-200">
              ${prediction.prediction.toFixed(6)}
            </span>
            <span className={`text-sm ${percentChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
            </span>
          </div>
          <div className="text-xs text-purple-400">
            Confidence: {(prediction.confidence * 100).toFixed(1)}%
          </div>
        </div>

        <p className="text-sm text-purple-300/80">
          {prediction.reasoning}
        </p>
      </CardContent>
    </Card>
  );
}
