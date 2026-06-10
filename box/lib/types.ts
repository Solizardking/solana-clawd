/**
 * box/lib/types.ts
 *
 * Shared types for Upstash Box blockchain agents.
 */

import { z } from "zod";

// ────────────────────────────────────────────
// Environment config
// ────────────────────────────────────────────

export interface BoxEnvConfig {
  upstashBoxApiKey: string;
  upstashBoxBaseUrl?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  grokApiKey?: string;
  heliusApiKey?: string;
  rpcUrl?: string;
  privateKey?: string;
  birdeyeApiKey?: string;
  jupiterApiKey?: string;
}

// ────────────────────────────────────────────
// Agent runtime config
// ────────────────────────────────────────────

export type AgentModel =
  | "anthropic/claude-opus-4-5"
  | "anthropic/claude-sonnet-4-5"
  | "anthropic/claude-haiku-4-5"
  | "openai/gpt-4o"
  | "xai/grok-2";

export type BoxRuntime = "node" | "python" | "go";

export interface AgentConfig {
  model: AgentModel;
  runtime: BoxRuntime;
  apiKey?: string;
}

// ────────────────────────────────────────────
// Trade signal types
// ────────────────────────────────────────────

export const TradeSignalSchema = z.object({
  token: z.string(),
  mint: z.string(),
  action: z.enum(["buy", "sell", "hold", "pass"]),
  confidence: z.number().min(0).max(100),
  sizeUsd: z.number().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  rationale: z.string(),
});

export type TradeSignal = z.infer<typeof TradeSignalSchema>;

// ────────────────────────────────────────────
// Token analysis
// ────────────────────────────────────────────

export const TokenAnalysisSchema = z.object({
  mint: z.string(),
  symbol: z.string(),
  name: z.string(),
  priceUsd: z.number(),
  volume24h: z.number(),
  liquidityUsd: z.number(),
  marketCap: z.number().optional(),
  holders: z.number().optional(),
  securityScore: z.number().min(0).max(100),
  riskLevel: z.enum(["low", "medium", "high", "extreme"]),
  isHoneypot: z.boolean(),
  isMintable: z.boolean(),
  topHolderConcentration: z.number().optional(),
  creatorDumpRisk: z.enum(["none", "low", "medium", "high"]),
  socials: z.object({
    twitter: z.string().optional(),
    telegram: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
});

export type TokenAnalysis = z.infer<typeof TokenAnalysisSchema>;

// ────────────────────────────────────────────
// Portfolio types
// ────────────────────────────────────────────

export const PortfolioPositionSchema = z.object({
  mint: z.string(),
  symbol: z.string(),
  amount: z.number(),
  entryPrice: z.number(),
  currentPrice: z.number(),
  pnlUsd: z.number(),
  pnlPercent: z.number(),
  allocationPercent: z.number(),
  riskScore: z.number().min(0).max(100),
});

export type PortfolioPosition = z.infer<typeof PortfolioPositionSchema>;

// ────────────────────────────────────────────
// Arbitrage opportunity
// ────────────────────────────────────────────

export const ArbitrageOpportunitySchema = z.object({
  tokenA: z.string(),
  tokenB: z.string(),
  dexA: z.string(),
  dexB: z.string(),
  priceDiffPercent: z.number(),
  estimatedProfitUsd: z.number(),
  estimatedGasUsd: z.number(),
  netProfitUsd: z.number(),
  confidence: z.number().min(0).max(100),
  executionTime: z.string(),
});

export type ArbitrageOpportunity = z.infer<typeof ArbitrageOpportunitySchema>;

// ────────────────────────────────────────────
// Swap / trade execution
// ────────────────────────────────────────────

export const SwapResultSchema = z.object({
  txHash: z.string(),
  inputToken: z.string(),
  inputAmount: z.number(),
  outputToken: z.string(),
  outputAmount: z.number(),
  priceImpact: z.number(),
  fee: z.number(),
  route: z.array(z.string()),
  success: z.boolean(),
  error: z.string().optional(),
});

export type SwapResult = z.infer<typeof SwapResultSchema>;

// ────────────────────────────────────────────
// Cost tracking
// ────────────────────────────────────────────

export interface RunCost {
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  computeMs: number;
}