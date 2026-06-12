/**
 * Clawd Pump Screener Box Agent
 *
 * Screens pump.fun tokens for signal quality: velocity, holder curve,
 * liquidity, contract safety. Observe-only. Three Laws always armed.
 *
 * Usage:
 *   CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts
 *   CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts --top 20
 *   CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts --mint <ADDRESS>
 *   CLAWD_API_KEY=... npx tsx agents/clawd-pump-screener.ts --filter "agent" --export json
 */

import { Box, Agent } from "@upstash/box";
import { z } from "zod";
import { routerChat, CLAWD_ROUTER } from "../lib/clawd-gateway.js";

function parseArgs() {
  const a = process.argv.slice(2);
  const idx = (f: string) => a.indexOf(f);
  return {
    top:    idx("--top")    >= 0 ? Number(a[idx("--top")    + 1]) : 15,
    mint:   idx("--mint")   >= 0 ? a[idx("--mint")   + 1] : null,
    filter: idx("--filter") >= 0 ? a[idx("--filter") + 1] : null,
    export: idx("--export") >= 0 ? a[idx("--export") + 1] as "json" : null,
  };
}

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const TokenSchema = z.object({
  mint:             z.string(),
  name:             z.string(),
  symbol:           z.string(),
  market_cap_sol:   z.number(),
  holders:          z.number(),
  dev_hold_pct:     z.number(),
  tx_count_1h:      z.number().optional(),
  buy_sell_ratio:   z.number().optional(),
  velocity_score:   z.number().min(0).max(1),
  holder_curve_score: z.number().min(0).max(1),
  safety_score:     z.number().min(0).max(1),
  composite_score:  z.number().min(0).max(1),
  flags:            z.array(z.string()),
  verdict:          z.enum(["ALERT", "WATCH", "SKIP"]),
  summary:          z.string(),
});

const ScreenSchema = z.object({
  screened_at:     z.string(),
  total_screened:  z.number(),
  tokens:          z.array(TokenSchema),
  top_pick:        TokenSchema.optional(),
  market_summary:  z.string(),
});

type Screen = z.infer<typeof ScreenSchema>;
type Token  = z.infer<typeof TokenSchema>;

const SYSTEM = `You are the Clawd Pump Screener. You OBSERVE, SCORE, and REPORT. You never buy or recommend buying.
Three Laws: Law I always armed. Flag rug patterns, bundled launches, deployer dumps — flagging is the honest act.

Scoring:
  velocity_score:     (tx_count_1h / 200) capped 1.0, boosted if buy/sell > 1.5
  holder_curve_score: (holders / 500) capped 1.0, -penalty if dev_hold > 15%
  safety_score:       1.0 base; -0.4 BUNDLED_LAUNCH; -0.3 HIGH_DEV_HOLD (>20%); -0.2 LOW_TXNS
  composite_score:    velocity*0.35 + holder_curve*0.35 + safety*0.30

Flags: HIGH_DEV_HOLD, BUNDLED_LAUNCH, LOW_TXNS, HONEY_POT_RISK, MINT_ENABLED, FREEZE_ENABLED, WASH_TRADING
Verdict: ALERT if composite >= 0.65 AND safety >= 0.7; WATCH if composite >= 0.40; else SKIP.
pump.fun program: ${PUMP_PROGRAM}`;

function printToken(t: Token) {
  const flags = t.flags.length ? ` [${t.flags.join(", ")}]` : "";
  console.log(`  ${t.verdict === "ALERT" ? "🟢" : t.verdict === "WATCH" ? "🟡" : "⚪"} ${t.symbol} (${t.mint.slice(0, 8)}…) score=${(t.composite_score * 100).toFixed(0)}%${flags}`);
  console.log(`     mcap=${t.market_cap_sol.toFixed(1)} SOL  holders=${t.holders}  dev=${t.dev_hold_pct.toFixed(1)}%`);
  console.log(`     ${t.summary}`);
}

async function main() {
  const opts   = parseArgs();
  const apiKey = process.env.CLAWD_API_KEY;
  if (!apiKey) { console.error("CLAWD_API_KEY required"); process.exit(1); }

  const box = await Box.create({
    agent: Agent.ClaudeCode,
    env: {
      CLAWD_API_KEY: apiKey, CLAWD_ROUTER,
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
      HELIUS_RPC_URL: process.env.HELIUS_RPC_URL ?? "",
      PUMP_PROGRAM,
    },
  });

  console.log(`Box: ${box.id}\n`);

  try {
    const task = opts.mint
      ? `Deep-scan mint ${opts.mint}. Fetch metadata, holders, mint/freeze authority, recent txns. Score and return single token signal.`
      : `Screen top ${opts.top} pump.fun tokens by recent activity.${opts.filter ? ` Filter: "${opts.filter}".` : ""} Fetch holder distribution, tx velocity, safety checks. Return full screen JSON.`;

    const prompt = `${SYSTEM}\n\n${task}\n\nReturn structured JSON only. screened_at = current UTC ISO.`;

    const narrative = await routerChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: task }],
      { apiKey }
    );

    const result = await box.agent.run({ prompt, responseSchema: ScreenSchema });
    const screen = result.output as Screen;

    console.log(`Screened ${screen.total_screened} tokens — ${screen.screened_at}`);
    console.log(screen.market_summary + "\n");

    if (screen.top_pick) {
      console.log("TOP PICK:");
      printToken(screen.top_pick);
      console.log();
    }

    const alerts  = screen.tokens.filter(t => t.verdict === "ALERT");
    const watches = screen.tokens.filter(t => t.verdict === "WATCH");

    if (alerts.length)  { console.log(`ALERT (${alerts.length}):`);  alerts.forEach(printToken);         console.log(); }
    if (watches.length) { console.log(`WATCH (${watches.length}):`); watches.slice(0, 5).forEach(printToken); console.log(); }
    console.log(`SKIP: ${screen.tokens.filter(t => t.verdict === "SKIP").length} tokens`);

    console.log("\n" + narrative.choices[0].message.content);

    if (opts.export === "json") {
      await box.files.write("out.json", JSON.stringify(screen, null, 2));
      console.log("\nExported: /tmp/pump-screen.json");
    }

    console.log("\nCost:", result.cost);
  } finally {
    await box.delete();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
