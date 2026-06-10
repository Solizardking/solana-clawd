#!/usr/bin/env tsx
/**
 * box/agents/solana-swarm-agent.ts
 *
 * Multi-agent swarm coordinator inside an Upstash Box.
 * Spawns child agents (code execution, shell, analysis) that collaborate
 * on complex blockchain tasks — all within the same sandbox.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-swarm-agent.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, runCodeInBox, writeAgentFile } from "../lib/box-utils";

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const SwarmResultSchema = z.object({
  task: z.string(),
  analysis: z.string(),
  codeGenerated: z.array(z.string()),
  findings: z.array(z.string()),
  recommendations: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  const task = process.argv[2] ?? "Analyze recent Solana transactions for MEV activity";
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Swarm Agent (Multi-Agent in Box)    │");
  console.log("└──────────────────────────────────────────────┘");
  console.log(`\nTask: ${task}`);

  // ── Step 1: Create Box ─────────────────────────────────
  console.log("\n🚀 Creating Upstash Box sandbox...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.ClaudeCode,
      model: "anthropic/claude-opus-4-5",
      apiKey: process.env.CLAUDE_KEY!,
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Sub-agent 1 — shell_exec: gather data ───
    console.log("\n🌐 Sub-agent 1: Data collector (shell)...");
    const heliusResult = await box.exec.command(
      `curl -s "https://api.mainnet-beta.solana.com" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getRecentPerformanceSamples","params":[5]}'`
    );
    console.log(`  → Performance samples collected (${heliusResult.result?.length ?? 0} bytes)`);

    // ── Step 3: Sub-agent 2 — code_exec: analyze data ────
    console.log("\n⚙️  Sub-agent 2: Data analyzer (code exec)...");
    const analysisCode = `
const samples = ${heliusResult.result ?? "[]"};
const parsed = JSON.parse(samples);
if (parsed?.result) {
  const summary = parsed.result.map((s: any) => ({
    slot: s.slot,
    numTransactions: s.numTransactions,
    samplePeriodSecs: s.samplePeriodSecs,
    tps: Math.round(s.numTransactions / s.samplePeriodSecs * 100) / 100,
  }));
  const avgTps = summary.reduce((a: number, b: any) => a + b.tps, 0) / summary.length;
  process.stdout.write(JSON.stringify({ samples: summary, avgTps: Math.round(avgTps * 100) / 100 }, null, 2));
} else {
  process.stdout.write(JSON.stringify({ error: "No data", raw: samples.slice(0, 500) }));
}
`;
    const analysisResult = await box.exec.code({ lang: "js", code: analysisCode });
    console.log(`  → Analysis: ${analysisResult.result?.slice(0, 300)}`);

    // ── Step 4: Write a helper script to the box ─────────
    console.log("\n📝 Sub-agent 3: Script writer...");
    await writeAgentFile(box, "mev-scanner.ts", `
import { readFileSync, writeFileSync } from "fs";

interface TxAnalysis {
  recentBlocks: number;
  avgTps: number;
  estimatedPriorityFees: string;
  mevActivity: string;
}

function analyze(data: any): TxAnalysis {
  const samples = data?.result ?? [];
  const avgTps = samples.length > 0
    ? samples.reduce((a: any, s: any) => a + (s.numTransactions / s.samplePeriodSecs), 0) / samples.length
    : 0;

  return {
    recentBlocks: samples.length,
    avgTps: Math.round(avgTps * 100) / 100,
    estimatedPriorityFees: avgTps > 3000 ? "HIGH (congested)" : avgTps > 1500 ? "MEDIUM" : "LOW",
    mevActivity: avgTps > 2500 ? "Possible MEV activity detected (high congestion)" : "Normal activity",
  };
}

// Read analysis from stdin
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const report = analyze(data);
    process.stdout.write(JSON.stringify(report, null, 2));
  } catch (e) {
    process.stderr.write("Parse error: " + e);
    process.exit(1);
  }
});
    `);

    // ── Step 5: Run the orchestrator agent ───────────────
    console.log("\n🧠 Sub-agent 4: Swarm orchestrator (Claude Code)...");
    const run = await box.agent.run({
      prompt: `You are a Solana swarm orchestrator inside an Upstash Box sandbox.

## Context
Multiple sub-agents have already gathered data:
1. Shell exec: Fetched recent Solana performance samples
2. Code exec: Computed average TPS and parsed the data
3. A TypeScript script (mev-scanner.ts) is available for further analysis

## Latest chain data
\`\`\`
${analysisResult.result?.slice(0, 1500) ?? "No data"}
\`\`\`

## Your Task
${task}

## Instructions
- Run \`npx tsx mev-scanner.ts\` to get deeper MEV analysis if needed
- Use \`curl\` to fetch more on-chain data from public RPC endpoints
- Analyze what you find and produce a structured report
- Return a SwarmResult with your findings including:
  - task: the original task description
  - analysis: comprehensive analysis
  - codeGenerated: any scripts/tools you created
  - findings: specific observations
  - recommendations: actionable next steps
  - confidence: 0-100

Be thorough. Use multiple tools within the box to cross-reference data.
`,
      responseSchema: SwarmResultSchema,
      onToolUse: (tool) => {
        console.log(`  → ${tool.name}: ${JSON.stringify(tool.input).slice(0, 120)}`);
      },
    });

    // ── Step 6: Results ──────────────────────────────────
    const result = run.result;
    console.log("\n┌────────────── SWARM RESULTS ─────────────────┐");
    console.log(`Task:     ${result.task}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`\nAnalysis:\n  ${result.analysis.slice(0, 500)}`);
    console.log(`\nFindings:`);
    result.findings.forEach(f => console.log(`  • ${f}`));
    console.log(`\nRecommendations:`);
    result.recommendations.forEach(r => console.log(`  → ${r}`));
    console.log("\n└──────────────────────────────────────────────┘");

    logCost("Swarm orchestrator", run.cost);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
