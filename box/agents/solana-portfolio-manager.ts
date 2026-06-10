#!/usr/bin/env tsx
/**
 * box/agents/solana-portfolio-manager.ts
 *
 * AI portfolio manager that runs inside an Upstash Box.
 * Tracks positions, rebalances based on risk, and generates
 * structured portfolio reports.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-portfolio-manager.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, writeAgentFile } from "../lib/box-utils";

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const PortfolioReportSchema = z.object({
  totalValueUsd: z.number(),
  solBalance: z.number(),
  positions: z.array(z.object({
    mint: z.string(),
    symbol: z.string(),
    amount: z.number(),
    valueUsd: z.number(),
    entryPrice: z.number().optional(),
    currentPrice: z.number(),
    pnlPercent: z.number().optional(),
    allocationPercent: z.number(),
    riskScore: z.number().min(0).max(100),
    recommendation: z.enum(["hold", "increase", "reduce", "exit"]),
  })),
  diversificationScore: z.number().min(0).max(100),
  riskLevel: z.enum(["conservative", "moderate", "aggressive"]),
  rebalanceActions: z.array(z.object({
    action: z.enum(["buy", "sell", "hold"]),
    token: z.string(),
    amount: z.string(),
    reason: z.string(),
  })),
  performance: z.object({
    dailyPnl: z.number().optional(),
    weeklyPnl: z.number().optional(),
    monthlyPnl: z.number().optional(),
    sharpeRatio: z.number().optional(),
  }).optional(),
});

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  const walletAddress = process.argv[2] ?? process.env.WALLET_ADDRESS;
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Portfolio Manager (In Upstash Box)   │");
  console.log("└──────────────────────────────────────────────┘");
  console.log(`\nWallet: ${walletAddress ?? "auto-detect (SOL balance only)"}`);

  // ── Step 1: Create Box ─────────────────────────────────
  console.log("\n🚀 Creating Upstash Box sandbox...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.ClaudeCode,
      model: "anthropic/claude-sonnet-4-5",
      apiKey: process.env.CLAUDE_KEY!,
    },
    env: {
      HELIUS_API_KEY: process.env.HELIUS_API_KEY ?? "",
      RPC_URL: process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Portfolio analysis prompt ────────────────
    console.log("\n📊 Running portfolio analysis...");

    const prompt = walletAddress
      ? `You are a Solana portfolio manager inside an Upstash Box sandbox.

## MISSION
Analyze the wallet ${walletAddress} and produce a comprehensive portfolio report.

## TOOLS
- Use \`curl\` to fetch wallet balances from Helius RPC:
  \`\`\`
  curl -X POST https://api.mainnet-beta.solana.com \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","id":1,"method":"getTokenAccountsByOwner","params":["${walletAddress}",{"programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},{"encoding":"jsonParsed"}]}'
  \`\`\`
- Use Jupiter API to get current prices for any tokens found
- Use Birdeye API if BIRDEYE_API_KEY env is set

## ANALYSIS
1. Calculate total portfolio value in USD
2. Evaluate each position:
   - Allocation vs ideal (max 20% per position)
   - Risk score (volatility, liquidity, security)
   - Recommendation: hold/increase/reduce/exit
3. Diversification score (0-100)
4. Rebalance suggestions

## RISK RULES
- Max 20% allocation to any single token
- Max 40% allocation to meme coins
- At least 5% in SOL for gas
- If any position is down >30%, flag for review
- If a position is up >100%, take partial profits

Return a structured portfolio report matching the schema.
`
      : `You are a Solana portfolio manager. Since no wallet address was provided, fetch the current SOL price from Jupiter API and produce a minimal market overview. Check https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd for SOL price.`;

    const run = await box.agent.run({
      prompt,
      responseSchema: PortfolioReportSchema,
      onToolUse: (tool) => {
        console.log(`  → ${tool.name}: ${JSON.stringify(tool.input).slice(0, 100)}`);
      },
    });

    // ── Step 3: Display report ───────────────────────────
    const result = run.result;
    console.log("\n┌──────────── PORTFOLIO REPORT ───────────────┐");
    console.log(`Total Value: $${result.totalValueUsd.toLocaleString()}`);
    console.log(`SOL Balance: ${result.solBalance}`);
    console.log(`Risk Level:  ${result.riskLevel.toUpperCase()}`);
    console.log(`Diversification: ${result.diversificationScore}/100`);

    console.log(`\nPositions (${result.positions.length}):`);
    for (const pos of result.positions) {
      const emoji = pos.recommendation === "hold" ? "➡️" : pos.recommendation === "increase" ? "⬆️" : pos.recommendation === "reduce" ? "⬇️" : "🚫";
      console.log(`  ${emoji} ${pos.symbol}: $${pos.valueUsd.toLocaleString()} (${pos.allocationPercent.toFixed(1)}%)`);
      console.log(`     Price: $${pos.currentPrice} | Risk: ${pos.riskScore}/100 → ${pos.recommendation}`);
    }

    if (result.rebalanceActions.length) {
      console.log(`\nRebalance Actions:`);
      for (const action of result.rebalanceActions) {
        console.log(`  ${action.action.toUpperCase()} ${action.amount} ${action.token}: ${action.reason}`);
      }
    }

    if (result.performance) {
      console.log(`\nPerformance:`);
      console.log(`  Daily:   $${result.performance.dailyPnl?.toFixed(2) ?? "N/A"}`);
      console.log(`  Weekly:  $${result.performance.weeklyPnl?.toFixed(2) ?? "N/A"}`);
      console.log(`  Sharpe:  ${result.performance.sharpeRatio?.toFixed(2) ?? "N/A"}`);
    }

    console.log("\n└──────────────────────────────────────────────┘");

    logCost("Portfolio analysis", run.cost);

    // ── Step 4: Save report to box filesystem ────────────
    await writeAgentFile(box, "portfolio-report.json", JSON.stringify(result, null, 2));
    console.log("  Report saved to portfolio-report.json in box");

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
