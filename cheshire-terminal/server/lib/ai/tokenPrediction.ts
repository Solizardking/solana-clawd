// @ts-nocheck
import OpenAI from "openai";
import { BondingCurveAccount } from "../pumpFunSDK";

const openai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
});

interface PredictionResult {
  prediction: number;
  confidence: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  reasoning: string;
}

export async function generateTokenPrediction(
  mintAddress: string,
  historicalData: { timestamp: number; price: number; volume: number }[],
  bondingCurve: BondingCurveAccount | null
): Promise<PredictionResult> {
  try {
    const prompt = `Analyze this token's historical data and bonding curve parameters to predict future price movement:
Historical Data: ${JSON.stringify(historicalData)}
${bondingCurve ? `Bonding Curve Data: ${JSON.stringify(bondingCurve)}` : ''}

Provide a detailed analysis including:
1. Price prediction for next 24 hours
2. Confidence level (0-1)
3. Market trend (bullish/bearish/neutral)
4. Reasoning behind the prediction

Format response as JSON with keys: prediction, confidence, trend, reasoning`;

    const response = await openai.chat.completions.create({
      model: "grok-3",
      messages: [
        {
          role: "system",
          content: "You are an expert cryptocurrency analyst focusing on token price prediction and market analysis."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      prediction: parseFloat(result.prediction),
      confidence: Math.min(1, Math.max(0, parseFloat(result.confidence))),
      trend: result.trend.toLowerCase() as 'bullish' | 'bearish' | 'neutral',
      reasoning: result.reasoning
    };
  } catch (error) {
    console.error("Error generating token prediction:", error);
    throw new Error("Failed to generate price prediction");
  }
}
