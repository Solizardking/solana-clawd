#!/usr/bin/env tsx
/**
 * box/agents/solana-onchain-analyst.ts
 *
 * Deep on-chain analysis agent inside an Upstash Box.
 * Investigates token contracts, wallet activity, and transaction patterns
 * to produce structured security and risk reports.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-onchain-analyst.ts <mint-or-wallet>
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, writeAgentFile, saveSnapshot } from "../lib/box-utils";

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const AnalysisReportSchema = z.object({
  targetType: z.enum(["token", "wallet", "transaction"]),
  targetAddress: z.string(),
  summary: z.string(),
  riskScore: z.number().min(0).max(100),
  threatLevel: z.enum(["safe", "low", "medium", "high", "critical"]),
  findings: z.array(z.object({
    category: z.string(),
    severity: z.enum(["info", "warning", "critical"]),
    detail: z.string(),
  })),
  metrics: z.object({
    totalTransactions: z.number().optional(),
    uniqueAccounts: z.number().optional(),
    totalVolumeUsd: z.number().optional(),
    ageDays: z.number().optional(),
    holderCount: z.number().optional(),
    topHolderPercent: z.number().optional(),
  }).optional(),
  recommendation: z.string(),
  confidence: z.number().min(0).max(100),
});

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npx tsx agents/solana-onchain-analyst.ts <mint-address | wallet-address>");
    process.exit(1);
  }

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana On-Chain Analyst (In Upstash Box)    │");
  console.log("└──────────────────────────────────────────────┘");
  console.log(`\nTarget: ${target}`);

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
    env: {
      HELIUS_API_KEY: process.env.HELIUS_API_KEY ?? "",
      RPC_URL: process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Write analysis tooling inside the box ────
    console.log("\n🔧 Writing analysis tooling...");
    await writeAgentFile(box, "rpc-fetcher.ts", `
/**
 * Fetch on-chain data from Solana RPC.
 */
const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const HELIUS = process.env.HELIUS_API_KEY
  ? \`https://rpc.helius.xyz/?api-key=\${process.env.HELIUS_API_KEY}\`
  : RPC;

interface RpcRequest {
  method: string;
  params: any[];
}

async function rpcCall(req: RpcRequest): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: req.method, params: req.params }),
  });
  return res.json();
}

async function main() {
  const target = process.argv[2];
  if (!target) { console.error("Need target"); process.exit(1); }

  const results: Record<string, any> = {};

  // Get account info
  try {
    const info = await rpcCall({ method: "getAccountInfo", params: [target, { encoding: "jsonParsed" }] });
    results.accountInfo = info;
  } catch (e) { results.accountInfoError = String(e); }

  // Get signature history (last 10 txs)
  try {
    const sigs = await rpcCall({ method: "getSignaturesForAddress", params: [target, { limit: 10 }] });
    results.recentSignatures = sigs;
  } catch (e) { results.signaturesError = String(e); }

  // Get token supply
  try {
    const supply = await rpcCall({ method: "getTokenSupply", params: [target] });
    results.tokenSupply = supply;
  } catch (e) { /* not a token */ }

  process.stdout.write(JSON.stringify(results, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
    `.trim());

    // ── Step 3: Fetch on-chain data ──────────────────────
    console.log("\n📡 Fetching on-chain data...");
    const rpcResult = await box.exec.command(`npx tsx rpc-fetcher.ts ${target}`);
    const dataPreview = rpcResult.result?.slice(0, 2000) ?? "No data";
    console.log(`  Data received: ${rpcResult.result?.length ?? 0} bytes`);

    // ── Step 4: Run the AI analyst ───────────────────────
    console.log("\n🔬 Running AI analyst...");
    const run = await box.agent.run({
      prompt: `You are a Solana on-chain analyst inside an Upstash Box sandbox.

## TARGET
Address: ${target}

## RAW DATA FROM RPC
\`\`\`json
${dataPreview}
\`\`\`

## YOUR MISSION
Analyze this on-chain data thoroughly. Determine:
1. Is this a token mint, wallet, or program account?
2. What is the risk profile? (security issues, suspicious patterns)
3. Key findings organized by severity (info, warning, critical)
4. A clear recommendation

## ANALYSIS FRAMEWORK
For **token mints**:
- Is the mint authority set or revoked? (revoked = safer)
- Is the freeze authority set? (set = potential rug)
- Token supply details (total supply, decimals)
- Any suspicious patterns in metadata

For **wallets**:
- Number of transactions
- Age of the wallet
- Interaction patterns (DEXs, bridges, CEXs, mixers)
- Balance and token holdings

For **programs**:
- Deployment time
- Upgrade authority status
- Recent interaction volume

## OUTPUT
Return a structured AnalysisReport with your findings.
Be conservative with risk scoring — better to flag false positives than miss real threats.
`,
      responseSchema: AnalysisReportSchema,
      onToolUse: (tool) => {
        console.log(`  → ${tool.name}: ${JSON.stringify(tool.input).slice(0, 120)}`);
      },
    });

    // ── Step 5: Display report ───────────────────────────
    const result = run.result;
    console.log("\n┌──────────── ANALYSIS REPORT ─────────────────┐");
    console.log(`Target:  ${result.targetAddress.slice(0, 20)}...`);
    console.log(`Type:    ${result.targetType}`);
    console.log(`Risk:    ${result.riskScore}/100 → ${result.threatLevel.toUpperCase()}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`\nSummary: ${result.summary}`);

    console.log(`\nFindings (${result.findings.length}):`);
    for (const f of result.findings) {
      const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
      console.log(`  ${icon} [${f.severity.toUpperCase()}] ${f.category}: ${f.detail}`);
    }

    if (result.metrics) {
      console.log(`\nMetrics:`);
      Object.entries(result.metrics).forEach(([k, v]) => {
        if (v !== undefined) console.log(`  ${k}: ${v}`);
      });
    }

    console.log(`\nRecommendation: ${result.recommendation}`);
    console.log("\n└──────────────────────────────────────────────┘");

    logCost("On-chain analysis", run.cost);

    // ── Step 6: Save report ──────────────────────────────
    const reportName = `analysis-${target.slice(0, 12)}`;
    await writeAgentFile(box, `${reportName}.json`, JSON.stringify(result, null, 2));
    await saveSnapshot(box, reportName, {
      label: `Analysis of ${target.slice(0, 16)}`,
    } as any);

    console.log(`\n💾 Report saved as ${reportName}.json`);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
