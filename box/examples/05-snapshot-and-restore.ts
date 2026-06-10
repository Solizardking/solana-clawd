#!/usr/bin/env tsx
/**
 * examples/05-snapshot-and-restore.ts
 *
 * Create a Box, generate files, save a snapshot, restore into a second Box,
 * and continue working. Demonstrates snapshot persistence across Box lifetimes.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... CLAUDE_KEY=... npx tsx examples/05-snapshot-and-restore.ts
 */
import { Box, Agent } from "@upstash/box";

async function main() {
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Example 5: Snapshot & Restore               │");
  console.log("└──────────────────────────────────────────────┘");

  // ── Box 1: Create project ──────────────────────────────
  console.log("\n🚀 Box 1: Creating project...");
  const box1 = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: { harness: Agent.ClaudeCode, model: "anthropic/claude-sonnet-4-5", apiKey: process.env.CLAUDE_KEY! },
  });

  await box1.agent.run({ prompt: "Create hello.ts with a greet function, math.ts with add/sub/mul/div, index.ts that demos both." });

  console.log("\n📸 Saving snapshot...");
  const snapshot = await box1.snapshot({ name: "project-checkpoint" });
  console.log(`  Snapshot: ${snapshot.id} (${(snapshot as any).size_bytes ?? "?"} bytes)`);

  // ── Box 2: Restore from snapshot ───────────────────────
  console.log("\n🚀 Box 2: Restoring from snapshot...");
  const box2 = await Box.fromSnapshot(snapshot.id, {
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: { harness: Agent.ClaudeCode, model: "anthropic/claude-sonnet-4-5", apiKey: process.env.CLAUDE_KEY! },
  });

  // Verify files exist
  const files = await box2.files.list("/workspace/home");
  console.log("\n📁 Restored files:");
  for (const f of files) if (!f.is_dir) console.log(`  📄 ${f.name}`);

  // Add more work
  await box2.agent.run({ prompt: "Add logger.ts with info/warn/error methods, and update index.ts to use it." });
  console.log("\n✅ New work added on restored Box.");

  const finalFiles = await box2.files.list("/workspace/home");
  console.log("\n📁 Final files:");
  for (const f of finalFiles) if (!f.is_dir) console.log(`  📄 ${f.name}`);

  await box1.delete();
  await box2.delete();
  console.log("\n✅ Both boxes deleted.");
}

main().catch(console.error);