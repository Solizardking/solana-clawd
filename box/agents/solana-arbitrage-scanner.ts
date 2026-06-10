#!/usr/bin/env tsx
/**
 * box/agents/solana-arbitrage-scanner.ts
 *
 * Cross-DEX arbitrage scanner inside an Upstash Box.
 * Compares token prices across Jupiter, Raydium, and Orca to find
 * profitable arbitrage opportunities on Solana.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-arbitrage-scanner.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, writeAgentFile } from "../lib/box-utils";

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const ArbitrageResultSchema = z.object({
  scanTimestamp: z.string(),
  solPriceUsd: z.number(),
  opportunities: z.array(z.object({
    tokenSymbol: z.string(),
    tokenMint: z.string(),
    buyDex: z.string(),
    sellDex: z.string(),
    buyPriceUsd: z.number(),
    sellPriceUsd: z.number(),
    spreadPercent: z.number(),
    estimatedProfitUsd: z.number(),
    gasEstimateUsd: z.number(),
    netProfitUsd: z.number(),
    confidence: z.number().min(0).max(100),
    estimatedTimeMinutes: z.number(),
    route: z.array(z.string()),
  })),
  summary: z.object({
    totalOpportunities: z.number(),
    profitableCount: z.number(),
    bestProfitUsd: z.number(),
    averageSpread: z.number(),
    networkCongestion: z.enum(["low", "medium", "high", "extreme"]),
  }),
});

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Arbitrage Scanner (In Upstash Box)   │");
  console.log("└──────────────────────────────────────────────┘");

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
      RPC_URL: process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Write arbitrage scanner script inside box ─
    console.log("\n📝 Writing arbitrage scanner script...");
    await writeAgentFile(box, "arb-scanner.ts", `
/**
 * Cross-DEX price comparison for Solana tokens.
 * Uses Jupiter price API to compare routes.
 */

const JUPITER_QUOTE = "https://quote-api.jup.ag/v6";
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface PriceSnapshot {
  mint: string;
  symbol: string;
  priceThroughSol: number | null;
  priceThroughUsdc: number | null;
}

async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
): Promise<{ price: number | null; routes: string[] }> {
  try {
    const res = await fetch(
      \`\${JUPITER_QUOTE}/quote?inputMint=\${inputMint}&outputMint=\${outputMint}&amount=\${amount}&slippageBps=50\`
    );
    if (!res.ok) return { price: null, routes: [] };
    const data = await res.json();
    return {
      price: data.outAmount ? Number(data.outAmount) / 1e6 : null,
      routes: data.routePlan?.map((r: any) => r.exchangeName) ?? [],
    };
  } catch {
    return { price: null, routes: [] };
  }
}

interface TokenListItem {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  tags?: string[];
}

async function getTokenList(): Promise<TokenListItem[]> {
  try {
    const res = await fetch("https://token.jup.ag/v6/tokens?tags=verified");
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function scan() {
  const tokens = await getTokenList();
  console.error(\`Fetched \${tokens.length} tokens\`);

  // Pick high-volume tokens to check
  const checkSymbols = [
    "USDC", "USDT", "JUP", "RAY", "ORCA", "PYTH", "JTO",
    "WIF", "BONK", "WEN", "MEW", "POPCAT", "DOGWIFHAT",
  ];

  const candidates = tokens.filter(t => checkSymbols.includes(t.symbol.toUpperCase()));
  console.error(\`Checking \${candidates.length} tokens for arb opportunities\`);

  const results: any[] = [];

  for (const token of candidates.slice(0, 10)) {
    // Price through SOL route
    const solRoute = await getQuote(WRAPPED_SOL, token.address, "1000000000");
    // Price through USDC route
    const usdcRoute = await getQuote(USDC, token.address, "1000000");

    if (solRoute.price && usdcRoute.price) {
      const solPrice = 1 / solRoute.price; // invert
      const usdcPrice = usdcRoute.price;
      const diff = Math.abs(solPrice - usdcPrice) / Math.min(solPrice, usdcPrice) * 100;

      if (diff > 0.5) {
        results.push({
          symbol: token.symbol,
          mint: token.address,
          priceViaSol: solPrice,
          priceViaUsdc: usdcPrice,
          spreadPercent: diff,
          solRoutes: solRoute.routes,
          usdcRoutes: usdcRoute.routes,
        });
      }
    }
  }

  results.sort((a, b) => b.spreadPercent - a.spreadPercent);
  process.stdout.write(JSON.stringify(results.slice(0, 10), null, 2));
}

scan().catch(e => { console.error(e); process.exit(1); });
    `.trim());

    // ── Step 3: Run the arb scanner ──────────────────────
    console.log("\n🔍 Running cross-DEX price scanner...");
    const scanResult = await box.exec.command("npx tsx arb-scanner.ts");
    const scanData = scanResult.result?.slice(0, 2000) ?? "No opportunities found";
    console.log(`  Scan complete: ${scanResult.result?.length ?? 0} bytes`);

    // ── Step 4: AI analysis of arb opportunities ─────────
    console.log("\n🤖 Analyzing arbitrage opportunities...\n");
    const run = await box.agent.run({
      prompt: `You are a Solana arbitrage scanner inside an Upstash Box sandbox.

## RAW SCAN DATA
\`\`\`json
${scanData}
\`\`\`

## YOUR MISSION
Analyze the cross-DEX price differences found and provide a structured arbitrage report.

## ANALYSIS
1. For each opportunity:
   - Is the spread real or just quote noise?
   - Estimate the gas cost (Solana txs cost ~0.000005 SOL base + priority fees)
   - Is the liquidity sufficient to execute?
   - Calculate net profit after fees

2. Network congestion assessment:
   - Check recent block production
   - Estimate priority fee needed

3. Only include opportunities where:
   - Spread > 0.5% (minimum for profitability after fees)
   - Net profit > $1.00
   - Confidence > 50%

## OUTPUT
Return a structured ArbitrageResult with verified opportunities.
Be realistic about execution feasibility — sandwich attacks, slippage, and MEV make arb harder than it looks.
`,
      responseSchema: ArbitrageResultSchema,
      onToolUse: (tool) => {
        console.log(`  → ${tool.name}: ${JSON.stringify(tool.input).slice(0, 100)}`);
      },
    });

    // ── Step 5: Display results ──────────────────────────
    const result = run.result;
    console.log("\n┌──────────── ARBITRAGE SCAN ──────────────────┐");
    console.log(`Time:   ${result.scanTimestamp}`);
    console.log(`SOL:    $${result.solPriceUsd}`);

    console.log(`\nSummary:`);
    console.log(`  Total opportunities found:    ${result.summary.totalOpportunities}`);
    console.log(`  Profitable:                   ${result.summary.profitableCount}`);
    console.log(`  Best profit:                  $${result.summary.bestProfitUsd.toFixed(2)}`);
    console.log(`  Average spread:               ${result.summary.averageSpread.toFixed(2)}%`);
    console.log(`  Network congestion:           ${result.summary.networkCongestion}`);

    if (result.opportunities.length > 0) {
      console.log(`\nOpportunities:`);
      for (const opp of result.opportunities) {
        console.log(`\n  ${opp.tokenSymbol} (${opp.tokenMint.slice(0, 6)}...)`);
        console.log(`  Buy: ${opp.buyDex} @ $${opp.buyPriceUsd} → Sell: ${opp.sellDex} @ $${opp.sellPriceUsd}`);
        console.log(`  Spread: ${opp.spreadPercent.toFixed(2)}% | Profit: $${opp.netProfitUsd.toFixed(2)}`);
        console.log(`  Est. Time: ${opp.estimatedTimeMinutes}min | Confidence: ${opp.confidence}%`);
        console.log(`  Route: ${opp.route.join(" → ")}`);
      }
    } else {
      console.log("\n  No profitable arbitrage opportunities found.");
    }
    console.log("\n└──────────────────────────────────────────────┘");

    logCost("Arb scanner", run.cost);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
