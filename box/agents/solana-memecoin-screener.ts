#!/usr/bin/env tsx
/**
 * box/agents/solana-memecoin-screener.ts
 *
 * Real-time meme coin screener that runs inside an Upstash Box.
 * Scans DexScreener, Birdeye, and Jupiter for new token listings,
 * runs security checks, and ranks opportunities.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx agents/solana-memecoin-screener.ts
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import { logCost, execInBox, saveSnapshot } from "../lib/box-utils";

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const ScreenerResultSchema = z.object({
  scanTimestamp: z.string(),
  marketRegime: z.enum(["RISK_ON", "RISK_OFF", "NEUTRAL"]),
  topPicks: z.array(z.object({
    mint: z.string(),
    symbol: z.string(),
    name: z.string(),
    priceUsd: z.number(),
    volume24h: z.number(),
    liquidityUsd: z.number(),
    ageHours: z.number(),
    securityScore: z.number().min(0).max(100),
    signalScore: z.number().min(0).max(100),
    riskLevel: z.enum(["low", "medium", "high", "extreme"]),
    recommendation: z.enum(["buy", "watch", "pass"]),
    rationale: z.string(),
  })),
  rejectedTokens: z.array(z.object({
    mint: z.string(),
    symbol: z.string(),
    reason: z.string(),
  })).optional(),
});

// ────────────────────────────────────────────
// Prompts
// ────────────────────────────────────────────

const SCREENER_PROMPT = `You are a Solana meme coin screener running inside a sandboxed Upstash Box.

## MISSION
Scan Solana for new and trending meme coins. Find high-signal opportunities while avoiding rugs, honeypots, and scams.

## SCAN PROCESS
1. **Discover tokens**: Use DexScreener (https://dexscreener.com/solana) via curl, or Birdeye API, or Jupiter token list
2. **Filter aggressively**: Minimum $1,000 liquidity, less than 72 hours old, security score > 60
3. **Security check each candidate**:
   - Is it a known honeypot? (check sell simulation)
   - Is the liquidity locked? (check LP info)
   - Is the mint authority renounced? (check on-chain metadata)
   - Is the top 10 holder concentration < 40%?
   - Is the creator wallet funded and active?
4. **Score each token** (0-100):
   - Liquidity depth (0-25): higher = better
   - Volume/age ratio (0-20): higher momentum = better
   - Security score (0-25): clean contract = better
   - Social presence (0-15): has Twitter/Telegram = better
   - Holder distribution (0-15): more decentralized = better
5. **Filter**: Only tokens scoring 60+ make it to topPicks
6. **Reject**: Tokens below threshold go to rejectedTokens with reasons

## MARKET REGIME DETECTION
- RISK_ON: SOL up >3% in 24h, high volume, positive sentiment
- RISK_OFF: SOL down >3% in 24h, low volume, negative sentiment
- NEUTRAL: Everything else

## OUTPUT
Return a structured JSON object with your top picks (max 5), rejected tokens with reasons, and market regime.

Be thorough. Check each token carefully. Better to pass on a good token than recommend a rug.
`;

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.CLAUDE_KEY) throw new Error("CLAUDE_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Meme Coin Screener (In Upstash Box)  │");
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
      BIRDEYE_API_KEY: process.env.BIRDEYE_API_KEY ?? "",
      HELIUS_API_KEY: process.env.HELIUS_API_KEY ?? "",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Install tools inside box ─────────────────
    console.log("\n🔧 Setting up scanner tools...");
    await execInBox(box, "npm install -g typescript tsx @solana/web3.js");

    // ── Step 3: Write a scanner script inside the box ────
    console.log("\n📝 Writing scanner script...");
    await box.files.write({
      path: "scanner.ts",
      content: `
const JUPITER_API = "https://token.jup.ag/v6";

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

async function fetchTokenList(): Promise<TokenInfo[]> {
  const res = await fetch(\`\${JUPITER_API}/tokens?tags=verified\`);
  if (!res.ok) throw new Error(\`Jupiter token list failed: \${res.status}\`);
  return res.json();
}

async function checkLiquidity(mint: string): Promise<number> {
  try {
    const res = await fetch(\`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=\${mint}&amount=1000000000&slippageBps=100\`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.inAmount ? Number(data.inAmount) / 1e9 : 0;
  } catch { return 0; }
}

interface ScanResult {
  total: number;
  memeCandidates: { address: string; symbol: string; name: string; tags: string[] }[];
}

async function scan(): Promise<ScanResult> {
  const tokens = await fetchTokenList();
  const memeTags = ["meme", "memecoin", "community", "dog", "cat", "pepe", "bonk", "woof", "silly"];
  
  const memes = tokens.filter(t =>
    t.tags?.some(tag => memeTags.some(mt => tag.toLowerCase().includes(mt))) ||
    t.symbol.toLowerCase().includes("dog") ||
    t.symbol.toLowerCase().includes("cat") ||
    t.symbol.toLowerCase().includes("pepe")
  );

  // Check liquidity for first 10
  const enriched = [];
  for (const token of memes.slice(0, 10)) {
    const liq = await checkLiquidity(token.address);
    enriched.push({ ...token, estimatedLiquidity: liq });
  }

  enriched.sort((a, b) => (b as any).estimatedLiquidity - (a as any).estimatedLiquidity);

  return {
    total: tokens.length,
    memeCandidates: memes.slice(0, 20).map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      tags: t.tags ?? [],
    })),
  };
}

scan().then(r => {
  process.stdout.write(JSON.stringify(r, null, 2));
}).catch(e => {
  console.error(e);
  process.exit(1);
});
      `.trim(),
    });

    // ── Step 4: Run the scanner ──────────────────────────
    console.log("\n🔍 Running token scan inside box...");
    const scanRun = await box.exec.command("npx tsx scanner.ts");
    console.log(`  Tokens found: ${scanRun.result?.slice(0, 300)}...`);

    // ── Step 5: Run the AI agent with scan context ───────
    console.log("\n🤖 Running AI screener agent...\n");
    const run = await box.agent.run({
      prompt: `
        ${SCREENER_PROMPT}

        ## SCAN DATA
        The token list scan found tokens. Here's the output:
        ${scanRun.result?.slice(0, 3000) ?? "No scan data available"}

        Analyze these tokens and return a structured screener result.
        Focus on meme coins with real liquidity and community.
      `,
      responseSchema: ScreenerResultSchema,
      onToolUse: (tool) => {
        console.log(`  → ${tool.name}: ${JSON.stringify(tool.input).slice(0, 100)}`);
      },
    });

    // ── Step 6: Display results ──────────────────────────
    const result = run.result;
    console.log("\n┌────────────── SCREENER RESULTS ──────────────┐");
    console.log(`Market: ${result.marketRegime}  |  ${result.scanTimestamp}`);

    for (const pick of result.topPicks) {
      const emoji = pick.recommendation === "buy" ? "🟢" : pick.recommendation === "watch" ? "🟡" : "⚪";
      console.log(`\n${emoji} ${pick.symbol} (${pick.mint.slice(0, 6)}...)`);
      console.log(`   Price: $${pick.priceUsd}  Vol: $${(pick.volume24h / 1000).toFixed(0)}K`);
      console.log(`   Liq: $${(pick.liquidityUsd / 1000).toFixed(0)}K  Age: ${pick.ageHours.toFixed(1)}h`);
      console.log(`   Security: ${pick.securityScore}/100  Signal: ${pick.signalScore}/100`);
      console.log(`   Risk: ${pick.riskLevel}  → ${pick.recommendation.toUpperCase()}`);
      console.log(`   Why: ${pick.rationale.slice(0, 200)}`);
    }

    if (result.rejectedTokens?.length) {
      console.log("\n❌ Rejected tokens:");
      for (const r of result.rejectedTokens) {
        console.log(`   ${r.symbol}: ${r.reason}`);
      }
    }

    logCost("Screener run", run.cost);

    // ── Step 7: Save snapshot ────────────────────────────
    const timestamp = Date.now();
    await saveSnapshot(box, `screener-${timestamp}`, {
      label: `Screener results - ${result.topPicks.length} picks`,
    } as any);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
