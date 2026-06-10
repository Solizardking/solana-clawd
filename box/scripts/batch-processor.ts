#!/usr/bin/env tsx
/**
 * box/scripts/batch-processor.ts
 *
 * Batch processing utility using Upstash Box.
 * Processes multiple tokens/wallets through an agent pipeline.
 * Demonstrates file upload/download and iterative box.agent.run().
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx scripts/batch-processor.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, writeAgentFile } from "../lib/box-utils";

const ANALYSIS_SCHEMA = z.object({
  token: z.string(),
  verdict: z.enum(["safe", "risky", "scam", "unknown"]),
  riskScore: z.number().min(0).max(100),
  keyIndicators: z.array(z.string()),
});

// Default batch targets
const DEFAULT_TARGETS = [
  { mint: "So11111111111111111111111111111111111111112", name: "Wrapped SOL" },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", name: "USDC" },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", name: "Bonk" },
  { mint: "z3dn17yLaGMKffVogeFHQ9zWVcXgqgf3PQnDsNs2g6M", name: "Ore" },
];

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  const targetsJson = process.env.BATCH_TARGETS ?? JSON.stringify(DEFAULT_TARGETS);
  const targets: { mint: string; name: string }[] = JSON.parse(targetsJson);

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Batch Processor (In Upstash Box)     │");
  console.log("└──────────────────────────────────────────────┘");
  console.log(`\nTargets: ${targets.map(t => t.name).join(", ")}`);

  // ── Step 1: Create a single Box for all processing ─────
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
    const results: { token: string; name: string; analysis: any; cost?: any }[] = [];
    let totalCost = 0;

    for (const target of targets) {
      console.log(`\n── Processing ${target.name} (${target.mint.slice(0, 8)}...) ──`);

      const run = await box.agent.run({
        prompt: `Analyze the Solana token ${target.name} at ${target.mint}.
Use curl to check basic info from a Solana RPC endpoint.
Check:
1. Is this a known legitimate token?
2. What's the risk profile?
3. Key security indicators

For ${target.mint}:
- Query the token supply
- Check if mint authority is revoked
- Assess overall risk

Return a structured analysis with token name, verdict (safe/risky/scam/unknown),
risk score (0-100), and key indicators (array of strings).`,
        responseSchema: ANALYSIS_SCHEMA,
        onToolUse: (tool) => {
          console.log(`  → ${tool.name}`);
        },
      });

      results.push({
        token: target.mint,
        name: target.name,
        analysis: run.result,
        cost: run.cost,
      });
      totalCost += run.cost?.totalUsd ?? 0;

      logCost(target.name, run.cost);
    }

    // ── Display summary ───────────────────────────────────
    console.log("\n┌────────────── BATCH RESULTS ─────────────────┐");
    console.log(`Processed ${results.length} tokens`);
    console.log(`Total cost: $${totalCost.toFixed(4)}`);

    for (const r of results) {
      const icon = r.analysis.verdict === "safe" ? "✅" : r.analysis.verdict === "risky" ? "⚠️" : r.analysis.verdict === "scam" ? "🚫" : "❓";
      console.log(`\n${icon} ${r.name}`);
      console.log(`   Verdict: ${r.analysis.verdict.toUpperCase()} (risk: ${r.analysis.riskScore}/100)`);
      console.log(`   Indicators:`);
      r.analysis.keyIndicators.slice(0, 3).forEach((ind: string) => console.log(`    • ${ind}`));
    }

    // ── Save results to box filesystem ────────────────────
    await writeAgentFile(box, "batch-results.json", JSON.stringify(results, null, 2));
    console.log("\n  Results saved to batch-results.json in box");

    // ── Download results ──────────────────────────────────
    console.log("\n⬇️  Downloading results from box...");
    await box.files.download({ folder: "." });

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
