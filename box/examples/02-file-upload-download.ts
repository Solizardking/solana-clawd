#!/usr/bin/env tsx
/**
 * examples/02-file-upload-download.ts
 *
 * Upload files into a Box, have an agent process them, download results.
 * Demonstrates: files.write, files.read, files.upload, files.download
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... ANTHROPIC_API_KEY=... npx tsx examples/02-file-upload-download.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Box, Agent } from "@upstash/box";

async function main() {
  mkdirSync("/tmp/box-demo", { recursive: true });
  writeFileSync("/tmp/box-demo/data.csv",
    `name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,Chicago\nDiana,28,Austin\nEve,32,Seattle`);

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Example 2: File Upload/Download in Box       │");
  console.log("└──────────────────────────────────────────────┘");

  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: { harness: Agent.ClaudeCode, model: "anthropic/claude-sonnet-4-5", apiKey: process.env.ANTHROPIC_API_KEY! },
  });
  console.log(`\nBox: ${box.id}`);

  try {
    await box.files.upload([{ path: "/tmp/box-demo/data.csv", destination: "data.csv" }]);
    console.log("\n⬆️  Uploaded data.csv");

    const run = await box.agent.run({
      prompt: "Read data.csv, analyze it, create report.md with statistics about the data.",
    });
    console.log("  Agent done.");

    const report = await box.files.read("report.md");
    console.log("\n📄 Report:\n" + report.slice(0, 500));

    console.log("\n⬇️  Downloading workspace files...");
    await box.files.download({ folder: "." });
    console.log(`\n📊 Cost: $${(run.cost?.totalUsd ?? 0).toFixed(4)}`);
  } finally {
    await box.delete();
    console.log("\n✅ Box deleted.");
  }
}

main().catch(console.error);