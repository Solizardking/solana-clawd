/**
 * Clawd Perps Box Agent
 *
 * Phoenix perpetuals screener inside an Upstash Box sandbox.
 * Paper-first. Never live without all three env arms set.
 *
 * Usage:
 *   CLAWD_API_KEY=... npx tsx agents/clawd-perps-box-agent.ts --scan
 *   CLAWD_API_KEY=... npx tsx agents/clawd-perps-box-agent.ts --symbol SOL --side long --notional 100
 *   CLAWD_API_KEY=... npx tsx agents/clawd-perps-box-agent.ts --symbol ETH --execution paper
 */

import { Box, Agent } from "@upstash/box";
import { z } from "zod";
import { routerChat, getPerpsRelay, CLAWD_ROUTER } from "../lib/clawd-gateway.js";

function parseArgs() {
  const a = process.argv.slice(2);
  const idx = (f: string) => a.indexOf(f);
  return {
    symbol:    idx("--symbol")    >= 0 ? a[idx("--symbol")    + 1] : "SOL",
    side:      idx("--side")      >= 0 ? a[idx("--side")      + 1] as "long" | "short" : undefined,
    notional:  idx("--notional")  >= 0 ? Number(a[idx("--notional") + 1]) : 100,
    execution: idx("--execution") >= 0 ? a[idx("--execution") + 1] as "observe" | "paper" | "live-preview" : "paper",
    scan:      a.includes("--scan"),
  };
}

const POLICY = {
  maxNotionalUsd: Number(process.env.PERPS_MAX_NOTIONAL_USD ?? 250),
  maxLeverage:    Number(process.env.PERPS_MAX_LEVERAGE      ?? 3),
  maxSpreadBps:   Number(process.env.PERPS_MAX_SPREAD_BPS    ?? 40),
  allowed:        (process.env.PERPS_ALLOWED_SYMBOLS ?? "SOL,ETH,BTC").split(","),
  liveTrading:    process.env.LIVE_TRADING          === "true",
  opConfirmed:    process.env.OPERATOR_CONFIRMED    === "true",
  simOnly:        process.env.PERPS_SIM_ONLY        !== "false",
} as const;

const SignalSchema = z.object({
  symbol:           z.string(),
  verdict:          z.enum(["BUY", "SELL", "WATCH", "BLOCKED"]),
  confidence:       z.number().min(0).max(1),
  funding_rate_pct: z.number().optional(),
  spread_bps:       z.number().optional(),
  reasoning:        z.string(),
});

const AnalysisSchema = z.object({
  preflight_ok:    z.boolean(),
  preflight_notes: z.array(z.string()),
  execution_mode:  z.enum(["observe", "paper", "live-preview", "blocked"]),
  signals:         z.array(SignalSchema),
  order_shape: z.object({
    action: z.string(), side: z.string(), symbol: z.string(),
    size_usd: z.number(), leverage: z.number(), order_id: z.string().optional(),
  }).optional(),
  composite_score: z.object({ momentum: z.number(), funding: z.number(), liquidity: z.number() }).optional(),
  next_action: z.string(),
});

type Analysis = z.infer<typeof AnalysisSchema>;

function systemPrompt() {
  return `You are Clawd Perps — autonomous perpetuals trading mind for Cheshire Terminal.
Phoenix Perpetuals DEX on Solana. Decision loop: preflight → observe → score → paper → confirm → live.
ARM STATUS: LIVE_TRADING=${POLICY.liveTrading}, OPERATOR_CONFIRMED=${POLICY.opConfirmed}, SIM_ONLY=${POLICY.simOnly}
${!POLICY.liveTrading ? "⚠️  DISARMED — paper/observe only." : ""}
Limits: notional=$${POLICY.maxNotionalUsd}, leverage=${POLICY.maxLeverage}x, spread=${POLICY.maxSpreadBps}bps, allowed=${POLICY.allowed.join(",")}
Score: momentum 40% + funding 40% + liquidity 20%. Threshold ±0.25.
Never submit real orders unless LIVE_TRADING=true, OPERATOR_CONFIRMED=true, SIM_ONLY=false.`;
}

async function main() {
  const opts   = parseArgs();
  const apiKey = process.env.CLAWD_API_KEY;
  if (!apiKey) { console.error("CLAWD_API_KEY required"); process.exit(1); }

  if (!POLICY.allowed.includes(opts.symbol)) {
    console.error(`PREFLIGHT FAILED: ${opts.symbol} not in allowed list`); process.exit(1);
  }
  if (opts.notional > POLICY.maxNotionalUsd) {
    console.error(`PREFLIGHT FAILED: $${opts.notional} > max $${POLICY.maxNotionalUsd}`); process.exit(1);
  }

  let marketData: unknown = null;
  try {
    marketData = await getPerpsRelay(apiKey);
  } catch { console.warn("Perps relay unavailable, continuing with analysis only"); }

  const box = await Box.create({
    agent: Agent.ClaudeCode,
    env: {
      CLAWD_API_KEY: apiKey, CLAWD_ROUTER,
      LIVE_TRADING: String(POLICY.liveTrading),
      OPERATOR_CONFIRMED: String(POLICY.opConfirmed),
      PERPS_SIM_ONLY: String(POLICY.simOnly),
    },
  });

  console.log(`Box: ${box.id}\n`);

  try {
    await box.files.write("market.json", JSON.stringify(marketData, null, 2));
    await box.files.write("policy.json", JSON.stringify(POLICY, null, 2));

    const userPrompt = opts.scan
      ? `Scan ${POLICY.allowed.join(", ")}. Market data in /workspace/market.json. Score all symbols, rank by confidence.`
      : `Analyze ${opts.symbol} for ${opts.side ?? "directional"} trade. Notional: $${opts.notional}, mode: ${opts.execution}. Market data in /workspace/market.json.`;

    const narrative = await routerChat(
      [{ role: "system", content: systemPrompt() }, { role: "user", content: userPrompt }],
      { apiKey }
    );

    const result  = await box.agent.run({ prompt: `${systemPrompt()}\n\n${userPrompt}\n\nReturn JSON only.`, responseSchema: AnalysisSchema });
    const analysis = result.output as Analysis;

    console.log(`Preflight: ${analysis.preflight_ok ? "OK" : "FAILED"}`);
    analysis.preflight_notes.forEach(n => console.log(`  • ${n}`));
    console.log();

    analysis.signals.forEach(s => {
      const b = s.verdict === "BUY" ? "🟢" : s.verdict === "SELL" ? "🔴" : s.verdict === "BLOCKED" ? "⛔" : "🟡";
      console.log(`${b} ${s.symbol}: ${s.verdict} (${(s.confidence * 100).toFixed(0)}%) — ${s.reasoning}`);
    });

    if (analysis.order_shape) {
      const o = analysis.order_shape;
      console.log(`\nOrder: ${o.action} ${o.side} ${o.symbol} $${o.size_usd} @ ${o.leverage}x [${analysis.execution_mode}]`);
    }

    console.log(`\n→ ${analysis.next_action}`);
    console.log("\n" + narrative.choices[0].message.content);
    console.log("\nCost:", result.cost);
  } finally {
    await box.delete();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
