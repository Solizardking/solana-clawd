import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangle,
  Shield,
  Skull,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTokenData } from '@/lib/solanaTracker';
import { RISK_LEVELS, mapRiskLevel, evaluateRiskLevel } from '@/lib/solanaTracker';

type RiskFactor = {
  name: string;
  description: string;
  level: string;
  score: number;
};

interface TokenRiskAnalysisProps {
  tokenAddress: string;
}

export function TokenRiskAnalysis({ tokenAddress }: TokenRiskAnalysisProps) {
  const { data: tokenData, isLoading, error: queryError } = useTokenData(tokenAddress);
  const [expanded, setExpanded] = useState(false);

  const renderRiskIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'danger':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'critical':
        return <Skull className="h-5 w-5 text-red-600" />;
      default:
        return <HelpCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className="bg-black/40 border-purple-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-purple-200">Risk Analysis</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (queryError || !tokenData || !tokenData.risk) {
    return (
      <Card className="bg-black/40 border-purple-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-purple-200">Risk Analysis</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="flex flex-col items-center text-center gap-2">
            <XCircle className="h-10 w-10 text-gray-400" />
            <p className="text-gray-300">
              {queryError ? 'Failed to load risk data' : 'No risk data available for this token'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { score, risks, rugged } = tokenData.risk;
  const riskLevel = evaluateRiskLevel(score);
  const sortedRisks = [...risks].sort((a, b) => b.score - a.score); // Sort risks by score (highest first)
  
  // Display top risks by default, all when expanded
  const displayRisks = expanded ? sortedRisks : sortedRisks.slice(0, 5);
  const hasMoreRisks = sortedRisks.length > 5;

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-purple-200 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Risk Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Overall Risk Score */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-300">Risk Score</span>
            <Badge className={`${riskLevel.bgColor} ${riskLevel.color}`}>
              {riskLevel.name} ({score}/10)
            </Badge>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className={`h-full ${
                score < 3 
                ? "bg-green-500" 
                : score < 5 
                ? "bg-yellow-500" 
                : score < 8 
                ? "bg-red-500" 
                : "bg-red-700"
              }`}
              style={{ width: `${Math.min(score * 10, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{riskLevel.description}</p>
        </div>

        {rugged && (
          <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-md p-3 flex items-center gap-2">
            <Skull className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-300">
              Warning: This token has been flagged as potentially rugged
            </p>
          </div>
        )}

        <Separator className="my-4 bg-gray-800" />

        {/* Risk Factors */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-300">Risk Factors</h3>
            <Badge variant="outline" className="text-purple-300 border-purple-500/30">
              {risks.length} {risks.length === 1 ? 'Factor' : 'Factors'}
            </Badge>
          </div>
          
          {displayRisks.length > 0 ? (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {displayRisks.map((factor, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm p-2 rounded-md bg-black/20 border border-gray-800/50">
                    {renderRiskIcon(factor.level)}
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <p className="font-medium text-gray-200">{factor.name}</p>
                        <span className="text-xs text-gray-400">Score: {factor.score}</span>
                      </div>
                      <p className="text-xs text-gray-400">{factor.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {hasMoreRisks && (
                <button 
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-purple-400 hover:text-purple-300 underline w-full text-center mt-2"
                >
                  {expanded ? 'Show fewer factors' : `Show ${sortedRisks.length - 5} more factors`}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No specific risk factors identified</p>
          )}
        </div>

        <div className="mt-4 text-center">
          <a 
            href={`https://solanatracker.io/token/${tokenAddress}?tab=risk`}
            className="text-xs text-purple-400 hover:text-purple-300 underline" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            View detailed analysis on Solana Tracker
          </a>
        </div>
      </CardContent>
    </Card>
  );
}