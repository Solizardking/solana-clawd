import { useState } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VoiceSynthesis } from "@/lib/voice";

interface TokenRecommendation {
  name: string;
  symbol: string;
  description: string;
  themeRationale: string;
  marketTiming: string;
  suggestedInitialBuy: number;
  confidence: number;
}

export function TokenRecommendations() {
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: recommendation, refetch, isLoading } = useQuery<TokenRecommendation>({
    queryKey: ['token-recommendation', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) throw new Error("Wallet not connected");
      
      return apiRequest('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          marketTrends: [] // TODO: Add market trends data
        })
      });
    },
    enabled: false // Don't fetch automatically
  });

  const handleGetRecommendation = async () => {
    if (!connected) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to get personalized recommendations",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsGenerating(true);
      await refetch();
      
      if (recommendation) {
        VoiceSynthesis.speak(
          `I recommend launching a token called ${recommendation.name} with the symbol ${recommendation.symbol}. ${recommendation.themeRationale}`
        );
      }
    } catch (error) {
      console.error("Error getting recommendation:", error);
      toast({
        title: "Recommendation Failed",
        description: "Failed to get token recommendation. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
          AI Token Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!recommendation ? (
          <Button
            onClick={handleGetRecommendation}
            disabled={isGenerating || !connected}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Market Trends...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Get Personalized Recommendation
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-4 animate-in fade-in-50">
            <div>
              <h3 className="text-lg font-semibold text-purple-200">{recommendation.name}</h3>
              <p className="text-sm font-mono text-purple-400">${recommendation.symbol}</p>
              <p className="text-sm text-gray-300 mt-2">{recommendation.description}</p>
            </div>

            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-purple-300">Theme Rationale:</span>
                <p className="text-gray-300">{recommendation.themeRationale}</p>
              </div>
              <div className="text-sm">
                <span className="text-purple-300">Market Timing:</span>
                <p className="text-gray-300">{recommendation.marketTiming}</p>
              </div>
              <div className="text-sm">
                <span className="text-purple-300">Suggested Initial Buy:</span>
                <p className="text-gray-300">{recommendation.suggestedInitialBuy} SOL</p>
              </div>
              <div className="text-sm">
                <span className="text-purple-300">AI Confidence:</span>
                <div className="w-full bg-purple-900/20 rounded-full h-2 mt-1">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full"
                    style={{ width: `${recommendation.confidence * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleGetRecommendation}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Get Another Recommendation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
