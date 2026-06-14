// @ts-nocheck
import OpenAI from "openai";
import { storage } from "../../storage";
import { Token } from "@shared/schema";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1"
});

// Log warning if OpenAI API key is missing
if (!process.env.OPENAI_API_KEY && !process.env.XAI_API_KEY) {
  console.warn('Warning: Neither OPENAI_API_KEY nor XAI_API_KEY environment variables are set');
}

interface TokenRecommendation {
  name: string;
  symbol: string;
  description: string;
  themeRationale: string;
  marketTiming: string;
  suggestedInitialBuy: number;
  confidence: number;
}

export async function generateTokenRecommendation(
  walletAddress: string,
  marketTrends?: string[],
  previousLaunches?: Token[]
): Promise<TokenRecommendation> {
  try {
    // Get user's launch history
    const userTokens = previousLaunches || await storage.getTokens();
    const userHistory = userTokens
      .filter(token => token.creatorAddress === walletAddress)
      .map(token => ({
        name: token.name,
        symbol: token.symbol,
        description: token.description
      }));

    // Create prompt for Grok
    const prompt = `As a meme token expert, analyze the following data and provide a personalized token launch recommendation:

User's Previous Launches:
${JSON.stringify(userHistory, null, 2)}

Current Market Trends:
${marketTrends ? marketTrends.join("\n") : "No specific trends provided"}

Please generate a meme token recommendation that:
1. Is unique and hasn't been done before
2. Has viral potential
3. Considers current market sentiment
4. Has a clear theme and narrative
5. Suggests optimal launch parameters

Respond in JSON format with the following structure:
{
  "name": "Token Name",
  "symbol": "TOKEN",
  "description": "Token description and concept",
  "themeRationale": "Explanation of why this theme was chosen",
  "marketTiming": "Why this is a good time to launch this concept",
  "suggestedInitialBuy": number (in SOL),
  "confidence": number (0-1)
}`;

    const response = await openai.chat.completions.create({
      model: "grok-3",
      messages: [
        { 
          role: "system", 
          content: "You are an expert meme token advisor with deep knowledge of viral internet culture and market timing."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const recommendation = JSON.parse(response.choices[0].message.content);
    
    return {
      name: recommendation.name,
      symbol: recommendation.symbol.toUpperCase(),
      description: recommendation.description,
      themeRationale: recommendation.themeRationale,
      marketTiming: recommendation.marketTiming,
      suggestedInitialBuy: parseFloat(recommendation.suggestedInitialBuy),
      confidence: parseFloat(recommendation.confidence)
    };
  } catch (error) {
    console.error("Error generating token recommendation:", error);
    throw new Error("Failed to generate token recommendation");
  }
}
