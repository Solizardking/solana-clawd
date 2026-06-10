#!/usr/bin/env tsx
/**
 * examples/04-multi-turn-session.ts
 *
 * Multiple turns on the same Box — each run builds on the previous context.
 * Creates a project, adds tests, adds validation — all within one sandbox.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx examples/04-multi-turn-session.ts
 */
import { Box, Agent } from "@upstash/box";

async function main() {
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Example 4: Multi-Turn Session in a Box       │");
  console.log("└──────────────────────────────────────────────┘");

  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: { harness: Agent.ClaudeCode, model: "anthropic/claude-sonnet-4-5", apiKey: process.env.CLAUDE_KEY! },
  });
  console.log(`\nBox: ${box.id}\n`);

  // Turn 1
  console.log("=== Turn 1: Create Express API ===");
  const r1 = await box.agent.run({ prompt: "Create a REST API at api/ with GET/POST/DELETE /todos. In-memory store. Include package.json." });
  console.log(r1.result.slice(0, 300));

  // Turn 2
  console.log("\n=== Turn 2: Add Tests ===");
  const r2 = await box.agent.run({ prompt: "Add vitest tests for the API. Test all endpoints. Run them — they must pass." });
  console.log(r2.result.slice(0, 300));

  // Turn 3
  console.log("\n=== Turn 3: Add Validation ===");
  const r3 = await box.agent.run({ prompt: "Add input validation to POST /todos: title required, non-empty. Return 400 on invalid. Update tests. Run." });
  console.log(r3.result.slice(0, 300));

  const cost = r3.cost;
  console.log(`\n📊 Total session cost: $${(cost?.totalUsd ?? 0).toFixed(4)} (${(cost?.inputTokens ?? 0) + (cost?.outputTokens ?? 0)} tokens)`);

  const files = await box.files.list("api");
  console.log("\n📁 Final project:");
  for (const f of files) console.log(`  ${f.is_dir ? "📁" : "📄"} ${f.name}`);

  await box.delete();
  console.log("\n✅ Box deleted.");
}

main().catch(console.error);