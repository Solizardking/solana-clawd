#!/usr/bin/env tsx
/**
 * box/agents/solana-nft-flipper.ts
 *
 * NFT flipper agent that runs inside an Upstash Box.
 * Analyzes NFT collections on Solana (Tensor, MagicEden) to find
 * mispriced assets, floor sweep opportunities, and flipping targets.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-nft-flipper.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, writeAgentFile } from "../lib/box-utils";

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const NftAnalysisSchema = z.object({
  scanTimestamp: z.string(),
  nftCount: z.number(),
  collections: z.array(z.object({
    name: z.string(),
    collectionAddress: z.string(),
    floorPriceSol: z.number(),
    floorPriceUsd: z.number(),
    volume24h: z.number(),
    listedCount: z.number(),
    totalSupply: z.number(),
    listingRatio: z.number(),
    avgPrice24h: z.number(),
    bestBid: z.number().optional(),
    spreadBps: z.number().optional(),
    opportunity: z.enum(["strong_buy", "watch", "pass", "overpriced"]),
    confidence: z.number().min(0).max(100),
    rationale: z.string(),
    potentialProfitSol: z.number().optional(),
  })),
  topOpportunities: z.array(z.object({
    collection: z.string(),
    estimatedFlipProfitSol: z.number(),
    flipTimeframe: z.string(),
    strategy: z.string(),
  })),
});

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana NFT Flipper Agent (In Upstash Box)   │");
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
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Write an NFT floor tracker script ────────
    console.log("\n📝 Writing NFT floor tracker script...");
    await writeAgentFile(box, "nft-tracker.ts", `
/**
 * Fetch NFT collection data from public APIs.
 * Uses Tensor API (public) and MagicEden API.
 */

const COLLECTIONS = [
  { name: "Mad Lads", symbol: "MAD" },
  { name: "Tensorians", symbol: "TNSR" },
  { name: "Claynosaurz", symbol: "CLAY" },
  { name: "Frogana", symbol: "FROG" },
  { name: "Retardio Cousins", symbol: "RETARDIO" },
  { name: "SMB Gen2", symbol: "SMB" },
  { name: "DeGods", symbol: "DEGOD" },
  { name: "y00ts", symbol: "Y00T" },
  { name: "Solcasino", symbol: "SCS" },
  { name: "Based Guys", symbol: "BASED" },
  { name: "DogeZilla", symbol: "DOGEZILLA" },
  { name: "Okay Bears", symbol: "OKAY" },
];

interface CollectionData {
  name: string;
  floorPrice: number | null;
  volume24h: number | null;
  listedCount: number | null;
  totalSupply: number | null;
  avgPrice24h: number | null;
  error?: string;
}

async function fetchCollection(name: string): Promise<CollectionData> {
  try {
    const encoded = encodeURIComponent(name);
    const res = await fetch(
      \`https://api.tensor.so/v1/collection/\${encoded}/stats\`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) {
      // Fallback: try MagicEden
      const meRes = await fetch(
        \`https://api-mainnet.magiceden.dev/v2/collections/\${encoded}/stats\`
      );
      if (!meRes.ok) return { name, floorPrice: null, volume24h: null, listedCount: null, totalSupply: null, avgPrice24h: null, error: \`HTTP \${res.status}\` };
      const meData = await meRes.json();
      return {
        name,
        floorPrice: meData.floorPrice ?? null,
        volume24h: meData.volume24h ?? null,
        listedCount: meData.listedCount ?? null,
        totalSupply: null,
        avgPrice24h: null,
      };
    }
    const data = await res.json();
    return {
      name,
      floorPrice: data.floorPrice ?? null,
      volume24h: data.volume24h ?? null,
      listedCount: data.listedCount ?? null,
      totalSupply: data.totalSupply ?? null,
      avgPrice24h: data.avgPrice24h ?? null,
    };
  } catch (e) {
    return { name, floorPrice: null, volume24h: null, listedCount: null, totalSupply: null, avgPrice24h: null, error: String(e) };
  }
}

async function main() {
  console.error(\`Fetching data for \${COLLECTIONS.length} collections...\`);
  const results = [];

  for (const col of COLLECTIONS) {
    console.error(\`  Fetching \${col.name}...\`);
    const data = await fetchCollection(col.name);
    results.push({ ...data, symbol: col.symbol });
    // Rate limit safety
    await new Promise(r => setTimeout(r, 200));
  }

  results.sort((a, b) => ((b.volume24h ?? 0) - (a.volume24h ?? 0)));
  process.stdout.write(JSON.stringify(results, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
    `.trim());

    // ── Step 3: Run NFT scanner ──────────────────────────
    console.log("\n🔍 Scanning NFT collections...");
    const scanResult = await box.exec.command("npx tsx nft-tracker.ts");
    const scanData = scanResult.result?.slice(0, 3000) ?? "No data";
    console.log(`  Data: ${scanResult.result?.length ?? 0} bytes from ${scanData.match(/"name":"([^"]+)"/g)?.length ?? 0} collections`);

    // ── Step 4: AI analysis ──────────────────────────────
    console.log("\n🤖 Analyzing NFT flipping opportunities...\n");
    const run = await box.agent.run({
      prompt: `You are a Solana NFT flipper inside an Upstash Box sandbox.

## RAW MARKET DATA
\`\`\`json
${scanData}
\`\`\`

## YOUR MISSION
Analyze these NFT collections for flipping opportunities.

## ANALYSIS FRAMEWORK
1. **Floor price analysis**: Is the floor low relative to recent sales?
2. **Volume signals**: High volume + stable floor = healthy market
3. **Listing ratio**: listedCount / totalSupply. If < 5%, supply squeeze potential. If > 15%, oversupplied.
4. **Spread**: Difference between best bid and floor. Narrow spread = efficient market.
5. **Price trend**: Compare current floor to avg price in last 24h.

## SCORING
- **strong_buy**: Floor dip with high volume, low listing ratio
- **watch**: Stable floor, moderate volume — good for monitoring
- **pass**: Low volume, high listing ratio, declining floor
- **overpriced**: Floor significantly above floor price trend

## OUTPUT
Return structured NftAnalysis with collections scored and top flipping opportunities identified.

For topOpportunities, suggest concrete strategies like:
- "Buy floor when SOL price dips below $X"
- "Sweep floor listings and flip at avg price"
- "Wait for collection to cool off before entry"
`,
      responseSchema: NftAnalysisSchema,
      onToolUse: (tool) => {
        console.log(`  → ${tool.name}: ${JSON.stringify(tool.input).slice(0, 100)}`);
      },
    });

    // ── Step 5: Display results ──────────────────────────
    const result = run.result;
    console.log("\n┌─────────────── NFT ANALYSIS ─────────────────┐");
    console.log(`Collections scanned: ${result.nftCount}`);
    console.log(`Time: ${result.scanTimestamp}`);

    for (const col of result.collections) {
      const icon = col.opportunity === "strong_buy" ? "🟢" : col.opportunity === "watch" ? "🟡" : col.opportunity === "pass" ? "⚪" : "🔴";
      console.log(`\n${icon} ${col.name}`);
      console.log(`   Floor: ${col.floorPriceSol} SOL ($${col.floorPriceUsd})`);
      console.log(`   24h Vol: ${col.volume24h} SOL | Listed: ${col.listedCount}/${col.totalSupply}`);
      console.log(`   Listing ratio: ${(col.listingRatio * 100).toFixed(1)}%`);
      console.log(`   Opportunity: ${col.opportunity} (conf: ${col.confidence}%)`);
      console.log(`   Why: ${col.rationale.slice(0, 150)}`);
    }

    if (result.topOpportunities.length > 0) {
      console.log(`\n🏆 Top Flipping Opportunities:`);
      for (const opp of result.topOpportunities) {
        console.log(`   ${opp.collection}: ~${opp.estimatedFlipProfitSol} SOL profit — ${opp.strategy}`);
        console.log(`   Timeframe: ${opp.flipTimeframe}`);
      }
    }

    console.log("\n└──────────────────────────────────────────────┘");
    logCost("NFT analysis", run.cost);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
