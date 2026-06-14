import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface TokenRecommendation {
  concept: string;
  marketTiming: string;
  initialLiquidity: number;
  targetAudience: string;
  marketingStrategy: string;
  uniqueFeatures: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  confidence: number;
}

export function TokenRecommendationEngine() {
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<TokenRecommendation | null>(null);
  const { toast } = useToast();
  const [userPreferences, setUserPreferences] = useState({
    budget: '',
    theme: '',
    goals: ''
  });

  const handlePreferenceChange = (field: keyof typeof userPreferences, value: string) => {
    setUserPreferences(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getRecommendation = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/token-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userPreferences)
      });

      if (!response.ok) {
        throw new Error('Failed to get recommendation');
      }

      const data = await response.json();
      setRecommendation(data);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get recommendation",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-purple-400 flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          AI Launch Advisor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-purple-300 mb-2 block">
              Investment Budget (in SOL)
            </label>
            <Input
              type="number"
              placeholder="e.g., 10"
              value={userPreferences.budget}
              onChange={(e) => handlePreferenceChange('budget', e.target.value)}
              className="bg-black/60 border-purple-500/30"
            />
          </div>
          
          <div>
            <label className="text-sm text-purple-300 mb-2 block">
              Token Theme/Category
            </label>
            <Input
              placeholder="e.g., DeFi, Memes, Gaming"
              value={userPreferences.theme}
              onChange={(e) => handlePreferenceChange('theme', e.target.value)}
              className="bg-black/60 border-purple-500/30"
            />
          </div>

          <div>
            <label className="text-sm text-purple-300 mb-2 block">
              Project Goals
            </label>
            <Textarea
              placeholder="Describe your token's goals and vision"
              value={userPreferences.goals}
              onChange={(e) => handlePreferenceChange('goals', e.target.value)}
              className="bg-black/60 border-purple-500/30"
            />
          </div>

          <Button
            onClick={getRecommendation}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Market
              </>
            ) : (
              'Get Personalized Recommendation'
            )}
          </Button>
        </div>

        {recommendation && (
          <div className="mt-6 space-y-4 border-t border-purple-500/30 pt-4">
            <h3 className="text-xl font-semibold text-purple-300">
              Launch Recommendation
            </h3>
            <div className="space-y-2">
              <p className="text-purple-200">
                <span className="font-semibold">Concept:</span> {recommendation.concept}
              </p>
              <p className="text-purple-200">
                <span className="font-semibold">Market Timing:</span> {recommendation.marketTiming}
              </p>
              <p className="text-purple-200">
                <span className="font-semibold">Initial Liquidity:</span> {recommendation.initialLiquidity} SOL
              </p>
              <p className="text-purple-200">
                <span className="font-semibold">Target Audience:</span> {recommendation.targetAudience}
              </p>
              <p className="text-purple-200">
                <span className="font-semibold">Marketing Strategy:</span> {recommendation.marketingStrategy}
              </p>
              <div>
                <span className="font-semibold text-purple-200">Unique Features:</span>
                <ul className="list-disc list-inside mt-2">
                  {recommendation.uniqueFeatures.map((feature, index) => (
                    <li key={index} className="text-purple-300">{feature}</li>
                  ))}
                </ul>
              </div>
              <p className="text-purple-200">
                <span className="font-semibold">Risk Level:</span>{' '}
                <span className={`font-bold ${
                  recommendation.riskLevel === 'Low' ? 'text-green-400' :
                  recommendation.riskLevel === 'Medium' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {recommendation.riskLevel}
                </span>
              </p>
              <div className="mt-4">
                <div className="bg-purple-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-purple-300">AI Confidence</span>
                    <span className="text-purple-400">{(recommendation.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-purple-950 rounded-full h-2 mt-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full"
                      style={{ width: `${recommendation.confidence * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
