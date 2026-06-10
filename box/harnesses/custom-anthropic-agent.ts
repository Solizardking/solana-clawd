#!/usr/bin/env tsx
/**
 * box/harnesses/custom-anthropic-agent.ts
 *
 * Minimal Anthropic custom agent harness inside an Upstash Box.
 * Calls Anthropic API directly and streams text back through Box SSE protocol.
 * Perfect for when you want to BYOM (bring your own model) with Anthropic.
 *
 * Requires: ANTHROPIC_API_KEY
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... ANTHROPIC_API_KEY=... npx tsx harnesses/custom-anthropic-agent.ts
 */

import { Agent, Box } from "@upstash/box";

const AGENT_SOURCE = String.raw`
const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function emit(event, data) {
  process.stdout.write("event: " + event + "\n");
  process.stdout.write("data: " + JSON.stringify(data) + "\n\n");
}

const prompt = readArg("-p");
const model = readArg("--model", "claude-haiku-4-5-20251001");
const sessionId = readArg("--session") || crypto.randomUUID();

try {
  emit("tool", { name: "anthropic_messages", input: { model } });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message ?? "Anthropic request failed: " + response.status);
  }

  const output = body.content
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("") ?? "";

  emit("text", { text: output });
  emit("done", {
    output,
    input_tokens: body.usage?.input_tokens ?? 0,
    output_tokens: body.usage?.output_tokens ?? 0,
    session_id: sessionId,
  });
} catch (error) {
  emit("error", {
    error: error instanceof Error ? error.message : String(error),
    session_id: sessionId,
  });
  process.exitCode = 1;
}
`;

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Anthropic Custom Agent Harness (In Box)     │");
  console.log("└──────────────────────────────────────────────┘");

  console.log("\n🚀 Creating Box with custom Anthropic harness...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.Custom,
      model: "claude-haiku-4-5-20251001",
      customHarness: {
        command: "node",
        args: ["/workspace/home/custom-anthropic-agent.mjs"],
        protocol: "box-sse-v1",
      },
    },
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    console.log("\n📝 Writing custom harness...");
    await box.files.write({ path: "custom-anthropic-agent.mjs", content: AGENT_SOURCE });

    console.log("\n=== Running agent ===");
    const run = await box.agent.run({
      prompt: "Say hello from an Anthropic-powered custom agent running inside an Upstash Box.",
    });
    console.log(run.result);
    console.log(`\nTokens: ${(run.cost?.inputTokens ?? 0) + (run.cost?.outputTokens ?? 0)}`);
  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });