#!/usr/bin/env tsx
/**
 * box/agents/solana-trading-agent.ts
 *
 * Autonomous Solana trading agent that runs inside an Upstash Box.
 * Uses Claude Code to analyze markets, generate signals, and construct
 * swap transactions through Jupiter.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-trading-agent.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { createAgentBox, logCost, saveSnapshot, execInBox } from "../lib/box-utils";

// ────────────────────────────────────────────
// Agent prompt
// ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Solana trading agent running inside a sandboxed Upstash Box.

Your mission: analyze Solana tokens, detect trading opportunities, and execute trades.

## CAPABILITIES
- Fetch real-time token prices via Jupiter API
- Analyze token security (honeypot checks, holder distribution)
- Assess liquidity depth and slippage estimates
- Construct swap transactions through Jupiter routing
- Manage position sizing with risk limits

## TOOLS AVAILABLE
- \`curl\` to call Jupiter API, Birdeye API, Helius RPC
- \`node\` for running TypeScript/JavaScript scripts
- Write files to /workspace/home/ for persistence between runs
- Git operations if needed

## RISK RULES (MANDATORY)
1. Never trade tokens with security score < 50
2. Never trade honeypots (detect via simulated sell)
3. Max position size: 0.5 SOL per trade (adjustable)
4. Stop-loss: -15% from entry
5. Never trade tokens with < $1,000 liquidity
6. Always verify the mint address is valid
7. Never trade tokens created < 24 hours ago (unless high conviction)

## OUTPUT FORMAT
Always return a JSON object:
{
  "analysis": {
    "mint": "...",
    "symbol": "...",
    "score": 0-100,
    "risk": "low|medium|high|extreme",
    "verdict": "buy|sell|pass"
  },
  "action": {
    "type": "none|swap",
    "inputToken": "SOL",
    "outputToken": "...",
    "amount": 0.0,
    "slippage": 0.0,
    "route": []
  },
  "rationale": "..."
}

When you identify a trade-worthy opportunity, write a trading script to /workspace/home/trade.ts
that constructs the swap via Jupiter quote API.
`;

// ────────────────────────────────────────────
// Trade signal schema
// ────────────────────────────────────────────

const TradeResultSchema = z.object({
  analysis: z.object({
    mint: z.string(),
    symbol: z.string(),
    score: z.number().min(0).max(100),
    risk: z.enum(["low", "medium", "high", "extreme"]),
    verdict: z.enum(["buy", "sell", "pass"]),
  }),
  action: z.object({
    type: z.enum(["none", "swap"]),
    inputToken: z.string().optional(),
    outputToken: z.string().optional(),
    amount: z.number().optional(),
    slippage: z.number().optional(),
    route: z.array(z.string()).optional(),
  }),
  rationale: z.string(),
});

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  // Validate environment
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  // Get target from CLI arg or env
  const targetMint = process.argv[2] ?? process.env.TARGET_TOKEN;
  const targetSymbol = process.argv[3] ?? "unknown";

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Trading Agent (Inside Upstash Box)   │");
  console.log("└──────────────────────────────────────────────┘");
  console.log("");
  console.log(`Target: ${targetSymbol} (${targetMint ?? "auto-detect"})`);

  // ── Step 1: Create the Box ──────────────────────────
  console.log("\n🚀 Creating Upstash Box sandbox...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.ClaudeCode,
      model: "anthropic/claude-opus-4-5",
      apiKey: process.env.CLAUDE_KEY!,
    },
    env: {
      HELIUS_API_KEY: process.env.HELIUS_API_KEY ?? "",
      BIRDEYE_API_KEY: process.env.BIRDEYE_API_KEY ?? "",
      RPC_URL: process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
    },
  });
  console.log(`  Box created: ${box.id}`);
  console.log(`  Runtime: node, Model: claude-opus-4-5`);

  try {
    // ── Step 2: Prepare the workspace ─────────────────
    console.log("\n📁 Preparing workspace...");
    await execInBox(box, "mkdir -p /workspace/home/trades");

    // ── Step 3: Run the agent ─────────────────────────
    console.log("\n🤖 Running trading agent...\n");

    const prompt = targetMint
      ? `Analyze the Solana token ${targetSymbol} at mint address ${targetMint}.
         Research it thoroughly using Jupiter API (https://quote-api.jup.ag/v6) and any other tools.
         Check liquidity, security, holder distribution. Output a JSON trading signal.`
      : `Scan the Solana ecosystem for trading opportunities.
         Check Jupiter token list, trending tokens, and meme coins.
         Identify 1-3 high-conviction tokens and analyze them.
         Output structured JSON with your findings and recommended action.`;

    const run = await box.agent.run({
      prompt: `
        ${SYSTEM_PROMPT}

        ## MISSION
        ${prompt}

        Remember: output valid JSON matching the schema.
      `,
      responseSchema: TradeResultSchema,
      onToolUse: (tool) => {
        const input = JSON.stringify(tool.input).slice(0, 120);
        console.log(`  → ${tool.name}: ${input}`);
      },
    });

    // ── Step 4: Parse and show results ────────────────
    console.log("\n┌─────────────── TRADE SIGNAL ───────────────┐");
    const result = run.result;
    console.log(`Token:    ${result.analysis.symbol} (${result.analysis.mint.slice(0, 8)}...)`);
    console.log(`Score:    ${result.analysis.score}/100`);
    console.log(`Risk:     ${result.analysis.risk}`);
    console.log(`Verdict:  ${result.analysis.verdict}`);
    console.log(`Action:   ${result.action.type}`);
    console.log(`Rationale: ${result.rationale.slice(0, 200)}`);
    console.log("└──────────────────────────────────────────────┘");

    // ── Step 5: Cost report ───────────────────────────
    logCost("Trading agent run", run.cost);

    // ── Step 6: Save snapshot ─────────────────────────
    if (result.action.type === "swap") {
      await saveSnapshot(box, `trade-${result.analysis.symbol}`, {
        label: `Trade signal for ${result.analysis.symbol}`,
      } as any);
    }

  } finally {
    // ── Step 7: Cleanup ───────────────────────────────
    console.log("\n🧹 Cleaning up box...");
    await box.delete();
    console.log("  Box deleted.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
