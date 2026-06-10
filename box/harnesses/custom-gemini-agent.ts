#!/usr/bin/env tsx
/**
 * box/harnesses/custom-gemini-agent.ts
 *
 * Gemini custom agent harness inside an Upstash Box.
 * Uses @google/genai SDK directly (not the CLI) so conversation
 * history persists across box.agent.run() calls — same as built-in harnesses.
 *
 * Requires: GEMINI_API_KEY from https://aistudio.google.com/apikey
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... GEMINI_API_KEY=... npx tsx harnesses/custom-gemini-agent.ts
 */

import { Agent, Box } from "@upstash/box";

const AGENT_SOURCE = String.raw`
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";

const WORK_DIR = "/workspace/home";
const SESSIONS_DIR = "/workspace/home/.gemini-sessions";

const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] ?? fallback : fallback;
}

const _write = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr);

function emit(event, data) {
  _write("event: " + event + "\n");
  _write("data: " + JSON.stringify(data) + "\n\n");
}

function isTextMimeType(mime) {
  if (mime.startsWith("text/")) return true;
  return ["application/json","application/javascript","application/typescript",
    "application/xml","application/yaml","application/toml","application/sql"]
    .includes(mime.split(";")[0]);
}

function buildPrompt(base) {
  if (!process.env.PROMPT_FILES_PATH) return base;
  try {
    const raw = readFileSync(process.env.PROMPT_FILES_PATH, "utf-8");
    try { unlinkSync(process.env.PROMPT_FILES_PATH); } catch {}
    const files = JSON.parse(raw);
    const fence = String.fromCharCode(96,96,96);
    const parts = [base];
    for (const f of files) {
      if (isTextMimeType(f.media_type)) {
        const content = Buffer.from(f.data, "base64").toString("utf-8");
        parts.push("\n\nAttached file: " + (f.filename || "unnamed") + "\n" + fence + "\n" + content + "\n" + fence);
      } else {
        console.error("[gemini] Skipping unsupported file type: " + f.media_type + " (" + (f.filename || "unnamed") + ")");
      }
    }
    return parts.join("");
  } catch { return base; }
}

function loadHistory(sessionFile) {
  try { return JSON.parse(readFileSync(sessionFile, "utf-8")); }
  catch { return []; }
}

function saveHistory(sessionFile, history) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(sessionFile, JSON.stringify(history));
}

const prompt = readArg("-p");
const model = readArg("--model", "gemini-2.5-flash");
const sessionId = readArg("--session") || randomUUID();
const sessionFile = SESSIONS_DIR + "/" + sessionId + ".json";

if (!prompt) { emit("error", { error: "no prompt provided", session_id: sessionId }); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { emit("error", { error: "GEMINI_API_KEY is required", session_id: sessionId }); process.exit(1); }

let agentOpts = {};
if (process.env.AGENT_OPTIONS) {
  try {
    const parsed = JSON.parse(process.env.AGENT_OPTIONS);
    agentOpts = parsed.agentOptions ?? parsed;
    console.error("[gemini] Agent options applied: " + Object.keys(agentOpts).join(", "));
  } catch (e) {
    console.error("[gemini] Warning: Failed to parse AGENT_OPTIONS: " + e.message);
  }
}

process.chdir(WORK_DIR);
const fullPrompt = buildPrompt(prompt);

try {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const history = loadHistory(sessionFile);
  const chat = ai.chats.create({ model, history, ...agentOpts });

  emit("tool", { name: "gemini", toolCallId: sessionId, input: { model, turns: Math.floor(history.length / 2) } });

  let output = "";
  let inputTokens = 0, outputTokens = 0, cachedInputTokens = 0;

  const stream = await chat.sendMessageStream({ message: fullPrompt });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) { output += text; emit("text", { text }); }
    const u = chunk.usageMetadata;
    if (u) {
      inputTokens = u.promptTokenCount ?? inputTokens;
      outputTokens = u.candidatesTokenCount ?? outputTokens;
      cachedInputTokens = u.cachedContentTokenCount ?? cachedInputTokens;
    }
  }

  saveHistory(sessionFile, chat.getHistory());

  emit("done", {
    output,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: cachedInputTokens,
    session_id: sessionId,
  });
} catch (error) {
  emit("error", {
    error: error instanceof Error ? error.message : String(error),
    input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, session_id: sessionId,
  });
  process.exit(1);
}
`;

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Gemini Custom Agent Harness (In Box)        │");
  console.log("└──────────────────────────────────────────────┘");

  // ── Step 1: Create Box with Custom Harness ───────────────
  console.log("\n🚀 Creating Box with custom Gemini harness...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.Custom,
      model: "gemini-2.5-flash",
      customHarness: {
        command: "node",
        args: ["/workspace/home/custom-gemini-agent.mjs"],
        protocol: "box-sse-v1",
      },
    },
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    // ── Step 2: Install deps + write harness inside box ────
    console.log("\n📦 Installing @google/genai inside box...");
    await box.exec.command("cd /workspace/home && npm install @google/genai --silent");

    console.log("\n📝 Writing custom harness...");
    await box.files.write({ path: "custom-gemini-agent.mjs", content: AGENT_SOURCE });

    // ── Step 3: Turn 1 ─────────────────────────────────────
    console.log("\n=== Turn 1 ===");
    const run1 = await box.agent.run({
      prompt: "My name is Ada. What's a fun fact about Ada Lovelace?",
    });
    console.log(run1.result);

    // ── Step 4: Turn 2 (session persists) ──────────────────
    console.log("\n=== Turn 2 (follow-up — remembers name) ===");
    const run2 = await box.agent.run({
      prompt: "What's my name?",
    });
    console.log(run2.result);
    console.log(`\nTokens: ${(run2.cost?.inputTokens ?? 0) + (run2.cost?.outputTokens ?? 0)}`);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });