/**
 * File upload - upload local files to the sandbox for the agent to work with.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=abx_... ANTHROPIC_API_KEY=sk-... npx tsx examples/upstash-box/file-upload.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Box, Agent } from "@upstash/box";

mkdirSync("/tmp/box-demo", { recursive: true });
writeFileSync(
  "/tmp/box-demo/data.csv",
  `name,age,city
Alice,30,New York
Bob,25,San Francisco
Charlie,35,Chicago
Diana,28,Austin
Eve,32,Seattle`,
);

const box = await Box.create({
  apiKey: process.env.UPSTASH_BOX_API_KEY,
  baseUrl: process.env.UPSTASH_BOX_BASE_URL,
  runtime: "node",
  agent: {
    harness: Agent.ClaudeCode,
    model: "anthropic/claude-sonnet-4-5",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

try {
  console.log(`Box created: ${box.id}\n`);

  await box.files.upload([{ path: "/tmp/box-demo/data.csv", destination: "data.csv" }]);
  console.log("File uploaded to sandbox.\n");

  await box.agent.run({
    prompt: "Read data.csv in the workspace, analyze it, and create a summary report as report.md with statistics about the data.",
  });

  console.log("\n\nGenerated report:");
  console.log(await box.files.read("report.md"));
} finally {
  await box.delete();
}
