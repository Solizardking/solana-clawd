import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface PredictionResponse {
  message: string;
  prediction: {
    direction: 'up' | 'down' | 'stable';
    confidence: number;
    timeframe: string;
  };
  marketAnalysis: {
    trend: string;
    sentiment: number;
    volume24h: number;
  };
}

export function CheshireAgent() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const { data: welcomeMessage } = useQuery({
    queryKey: ['cheshireWelcome'],
    queryFn: async () => {
      const response = await apiRequest<{ message: string }>('/api/ai/welcome');
      return response.message;
    }
  });

  const { data: prediction, isLoading } = useQuery({
    queryKey: ['cheshirePrediction'],
    queryFn: async () => {
      const response = await apiRequest<PredictionResponse>('/api/ai/predict');
      return response;
    },
    enabled: isAnalyzing,
    refetchInterval: isAnalyzing ? 30000 : false // Refresh every 30 seconds while analyzing
  });

  return (
    <Card className="w-full bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
          <span>🐱 Cheshire Oracle</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {welcomeMessage ? (
          <p className="text-purple-200 mb-4 italic">{welcomeMessage}</p>
        ) : (
          <Skeleton className="h-6 w-3/4 bg-purple-500/10" />
        )}

        <div className="space-y-4">
          <Button
            onClick={() => setIsAnalyzing(prev => !prev)}
            variant={isAnalyzing ? "destructive" : "default"}
            className="w-full"
          >
            {isAnalyzing ? "Stop Analysis" : "Begin Market Analysis"}
          </Button>

          {isAnalyzing && (
            <div className="space-y-2 animate-fade-in">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full bg-purple-500/10" />
                  <Skeleton className="h-4 w-3/4 bg-purple-500/10" />
                  <Skeleton className="h-4 w-1/2 bg-purple-500/10" />
                </div>
              ) : prediction ? (
                <>
                  <div className="bg-purple-500/10 p-4 rounded-lg">
                    <h3 className="font-semibold text-purple-300">Market Prediction</h3>
                    <p className="text-sm text-purple-200">{prediction.message}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-${prediction.prediction.direction === 'up' ? 'green' : 'red'}-400`}>
                        {prediction.prediction.direction === 'up' ? '↗️' : '↘️'}
                      </span>
                      <span className="text-sm">
                        Confidence: {(prediction.prediction.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="bg-purple-500/10 p-4 rounded-lg">
                    <h3 className="font-semibold text-purple-300">Market Analysis</h3>
                    <p className="text-sm text-purple-200">{prediction.marketAnalysis.trend}</p>
                    <div className="mt-2 text-sm">
                      <p>Sentiment: {prediction.marketAnalysis.sentiment.toFixed(2)}</p>
                      <p>24h Volume: {prediction.marketAnalysis.volume24h.toLocaleString()} SOL</p>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
