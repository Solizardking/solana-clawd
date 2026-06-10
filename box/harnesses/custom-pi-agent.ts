#!/usr/bin/env tsx
/**
 * box/harnesses/custom-pi-agent.ts
 *
 * Pi custom agent harness (github.com/earendil-works/pi).
 * Pi is an open-source coding agent supporting multiple LLM providers.
 *
 * Model format: "<provider>/<model-id>" e.g. "anthropic/claude-sonnet-4-5"
 *
 * Requires: ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... ANTHROPIC_API_KEY=... npx tsx harnesses/custom-pi-agent.ts
 */

import { Agent, Box } from "@upstash/box";

const AGENT_SOURCE = String.raw`
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { randomUUID } from "crypto";
import { mkdir } from "fs/promises";
import { readFileSync, unlinkSync } from "fs";

const WORK_DIR = "/workspace/home";
const SESSIONS_DIR = "/workspace/home/.pi-sessions";
const MCP_CONFIG_PATH = "/workspace/home/.box-internal/mcp-config.json";

function loadMcpServers() {
  try {
    const configs = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8"));
    if (!configs.length) return { urls: [], warned: false };
    const urls = [];
    let warned = false;
    for (const cfg of configs) {
      if (cfg.source === "url") {
        urls.push(cfg.package_or_url);
      } else {
        console.error("[pi] Warning: npm MCP server '" + cfg.name + "' not supported; only HTTP MCP servers are applied");
        warned = true;
      }
    }
    if (urls.length) console.error("[pi] MCP servers: " + urls.join(", "));
    return { urls, warned };
  } catch { return { urls: [], warned: false }; }
}

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

const prompt = readArg("-p");
const modelStr = readArg("--model", "anthropic/claude-sonnet-4-5");
const sessionId = readArg("--session") || randomUUID();
const sessionDir = SESSIONS_DIR + "/" + sessionId;

if (!prompt) { emit("error", { error: "no prompt provided", session_id: sessionId }); process.exit(1); }

function isTextMimeType(mime) {
  if (mime.startsWith("text/")) return true;
  return ["application/json","application/javascript","application/typescript",
    "application/xml","application/yaml","application/x-yaml","application/toml",
    "application/sql","application/graphql"].includes(mime.split(";")[0]);
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
      }
    }
    return parts.join("");
  } catch { return base; }
}

function agentOptions() {
  if (!process.env.AGENT_OPTIONS) return {};
  try { const opts = JSON.parse(process.env.AGENT_OPTIONS); return opts; }
  catch (e) { console.error("[pi] Warning: Failed to parse AGENT_OPTIONS: " + e.message); return {}; }
}

function resolveModel(str) {
  const slash = str.indexOf("/");
  if (slash !== -1) return getModel(str.slice(0, slash), str.slice(slash + 1));
  return getModel("anthropic", str);
}

try {
  process.chdir(WORK_DIR);
  await mkdir(sessionDir, { recursive: true });
  const model = resolveModel(modelStr);
  const fullPrompt = buildPrompt(prompt);
  const extraOpts = agentOptions();
  const { urls: mcpUrls } = loadMcpServers();

  const { session } = await createAgentSession({
    model, workingDir: WORK_DIR, agentDir: sessionDir,
    sessionManager: SessionManager.continueRecent(WORK_DIR, sessionDir),
    ...(mcpUrls.length ? { extensionUrls: mcpUrls } : {}),
    ...extraOpts,
  });

  emit("tool", { name: "pi_agent", toolCallId: sessionId, input: { model: modelStr } });

  let output = "", inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, totalCostUSD = 0;

  function accumulateUsage(messages) {
    for (const m of messages ?? []) {
      if (m?.role !== "assistant" || !m.usage) continue;
      inputTokens += m.usage.input ?? 0;
      outputTokens += m.usage.output ?? 0;
      cachedInputTokens += m.usage.cacheRead ?? 0;
      totalCostUSD += m.usage.cost?.total ?? 0;
    }
  }

  let resolveEnd;
  const agentEndPromise = new Promise((resolve) => { resolveEnd = resolve; });

  session.subscribe((event) => {
    if (event.type === "message_update") {
      const ae = event.assistantMessageEvent;
      if (ae.type === "text_delta") { output += ae.delta; emit("text", { text: ae.delta }); }
      else if (ae.type === "thinking_delta") { emit("thinking", { text: ae.delta }); }
    } else if (event.type === "tool_execution_start") {
      emit("tool", { name: event.toolName, toolCallId: event.toolCallId, input: event.args ?? {} });
    } else if (event.type === "tool_execution_end") {
      emit("tool_result", { toolCallId: event.toolCallId, output: String(event.result ?? ""), is_error: event.isError ?? false });
    } else if (event.type === "agent_end") {
      accumulateUsage(event.messages);
      resolveEnd();
    }
  });

  await session.prompt(fullPrompt);
  await agentEndPromise;

  emit("done", {
    output, input_tokens: inputTokens, output_tokens: outputTokens,
    cached_input_tokens: cachedInputTokens, total_cost_usd: totalCostUSD, session_id: sessionId,
  });
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  emit("error", { error: msg, session_id: sessionId });
  process.exit(1);
}
`;

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Pi Custom Agent Harness (In Box)            │");
  console.log("└──────────────────────────────────────────────┘");

  console.log("\n🚀 Creating Box with custom Pi harness...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.Custom,
      model: "anthropic/claude-sonnet-4-5",
      customHarness: {
        command: "node",
        args: ["/workspace/home/custom-pi-agent.mjs"],
        protocol: "box-sse-v1",
      },
    },
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    console.log("\n📦 Installing Pi SDK inside box...");
    await box.exec.command("cd /workspace/home && npm install @earendil-works/pi-coding-agent @earendil-works/pi-ai --silent");

    console.log("\n📝 Writing harness...");
    await box.files.write({ path: "custom-pi-agent.mjs", content: AGENT_SOURCE });

    console.log("\n=== Turn 1 ===");
    const run1 = await box.agent.run({ prompt: "Create a file called hello.txt with the content 'Hello from Pi agent!'" });
    console.log(run1.result);

    console.log("\n=== Turn 2 (follow-up) ===");
    const run2 = await box.agent.run({ prompt: "Now read back the file you just created." });
    console.log(run2.result);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });