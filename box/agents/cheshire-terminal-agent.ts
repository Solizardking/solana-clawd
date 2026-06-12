/**
 * Cheshire Terminal Box Agent
 *
 * Runs the Cheshire Terminal oracle inside an Upstash Box sandbox.
 * Routes inference through ClawdRouter (clawd-router.fly.dev).
 * Demonstrates CAAP/1.0 registration and ACP agent discovery.
 *
 * Usage:
 *   CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts staking
 *   CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts perps
 *   CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts caap
 *   CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts discover
 *   CLAWD_API_KEY=clawd_sk_... npx tsx agents/cheshire-terminal-agent.ts "any freeform prompt"
 */

import { Box, Agent } from "@upstash/box";
import { z } from "zod";
import {
  routerChat,
  cheshireMessages,
  gatewayHealth,
  routerHealth,
  CLAWD_GATEWAY,
  CLAWD_ROUTER,
} from "../lib/clawd-gateway.js";

const PROMPTS: Record<string, string> = {
  staking: `
    Query the Cheshire Terminal staking program on Solana devnet.
    Program ID: 9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP
    GlobalPool PDA: DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ
    Using the Solana devnet RPC (https://api.devnet.solana.com):
    1. Fetch and decode the GlobalPool account (admin, staked_count, total_rewards_distributed)
    2. Report reward rate: 1000 base-units/sec = 86.4 CLAWD/day
    3. Explain the FreezeDelegate non-custodial staking mechanism
  `.trim(),

  perps: `
    Using the ClawdRouter perps relay at ${CLAWD_ROUTER}/v1/relay/perps:
    1. Fetch SOL, BTC, and ETH perpetuals data
    2. Report: mark price, funding rate (annualized %), orderbook spread bps
    3. Score each: momentum + funding + liquidity composite (0–1)
    4. Directional bias (long/short/watch) with confidence
    5. Which has the best risk/reward right now?
  `.trim(),

  caap: `
    Demonstrate CAAP/1.0 agent attestation protocol.
    Gateway: ${CLAWD_GATEWAY}
    1. Generate a mock Ed25519 keypair for agent identity
    2. Show registration flow: POST /api/auth/agent/register
    3. Show how to sign a 60s JWT with jti: UUID
    4. Show a capability endpoint call with the bearer token
    5. Explain CLAWD tier gates: free/basic/pro/elite
  `.trim(),

  discover: `
    Discover the OpenClawd agent ecosystem.
    ACP endpoint: https://x402.wtf/.well-known/acp.json
    1. Fetch the ACP registry
    2. List the top 10 agents with capabilities
    3. Show agent-to-agent call via x402
    4. Payment flow: HTTP 402 → USDC → retry
    5. Agent-to-agent commerce vs human-to-agent
  `.trim(),
};

const CheshireResponseSchema = z.object({
  summary:        z.string(),
  key_findings:   z.array(z.string()),
  addresses:      z.record(z.string()).optional(),
  code_snippets:  z.array(z.string()).optional(),
  recommendation: z.string().optional(),
  grin:           z.string().optional(),
});

type CheshireResponse = z.infer<typeof CheshireResponseSchema>;

async function main() {
  const promptArg  = process.argv[2] ?? "staking";
  const userPrompt = PROMPTS[promptArg] ?? promptArg;
  const apiKey     = process.env.CLAWD_API_KEY;

  if (!apiKey) {
    console.error("CLAWD_API_KEY required. Get one at x402.wtf/profile/api");
    process.exit(1);
  }

  const [gw, rt] = await Promise.all([gatewayHealth(), routerHealth()]);
  console.log(`Gateway: ${gw.status} | Router: ${rt.status}\n`);

  const box = await Box.create({
    agent: Agent.ClaudeCode,
    env: {
      CLAWD_API_KEY:  apiKey,
      CLAWD_ROUTER,
      CLAWD_GATEWAY,
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    },
  });

  console.log(`Box: ${box.id}\n`);

  try {
    await box.files.write("cheshire.json", JSON.stringify({
      staking_program: "9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP",
      global_pool:     "DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ",
      clawd_token:     "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
      clawd_router:    CLAWD_ROUTER,
      x402_gateway:    "https://x402.wtf",
    }, null, 2));

    const narrative = await routerChat(cheshireMessages(userPrompt), { apiKey });
    console.log(narrative.choices[0].message.content);
    console.log();

    const result = await box.agent.run({
      prompt: `You are Cheshire Terminal. Context in /workspace/cheshire.json.\n\n${userPrompt}\n\nReturn JSON only.`,
      responseSchema: CheshireResponseSchema,
    });

    const r = result.output as CheshireResponse;
    console.log("Summary:", r.summary);
    r.key_findings?.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    if (r.recommendation) console.log("\nNext:", r.recommendation);
    if (r.grin) console.log(`\n${r.grin}`);
    console.log("\nCost:", result.cost);
  } finally {
    await box.delete();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
