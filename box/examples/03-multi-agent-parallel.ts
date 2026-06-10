#!/usr/bin/env tsx
/**
 * examples/03-multi-agent-parallel.ts
 *
 * Spin up multiple Boxes in parallel to process different tasks concurrently.
 * Each Box is independent — they share no state, no keys, no risk.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx examples/03-multi-agent-parallel.ts
 */
import { Box, Agent } from "@upstash/box";

const TASKS = [
  { name: "API", prompt: `Create a REST API at api/ with Express.js: GET /health, GET /time. Include package.json.` },
  { name: "CLI", prompt: `Create a CLI tool at cli/ using Node.js: "greet <name>" and "random". No deps.` },
  { name: "Library", prompt: `Create a TS utility library at lib/: slugify, truncate, capitalize. Include tests via vitest. Run them.` },
];

async function main() {
  console.log(`Launching ${TASKS.length} boxes in parallel...\n`);

  const results = await Promise.all(TASKS.map(async (task) => {
    const start = Date.now();
    const box = await Box.create({
      apiKey: process.env.UPSTASH_BOX_API_KEY!,
      runtime: "node",
      agent: { harness: Agent.ClaudeCode, model: "anthropic/claude-sonnet-4-5", apiKey: process.env.CLAUDE_KEY! },
    });

    const run = await box.agent.run({ prompt: task.prompt });
    const files = await box.files.list();
    const cost = run.cost;
    await box.delete();

    return { name: task.name, files: files.filter(f => !f.is_dir).map(f => f.name), tokens: (cost?.inputTokens ?? 0) + (cost?.outputTokens ?? 0), durationMs: Date.now() - start };
  }));

  for (const r of results) {
    console.log(`${r.name}: ${r.files.join(", ")} — ${r.tokens} tok, ${(r.durationMs / 1000).toFixed(1)}s`);
  }
}

main().catch(console.error);