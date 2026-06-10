#!/usr/bin/env tsx
/**
 * box/harnesses/custom-goose-agent.ts
 *
 * Goose custom agent harness inside an Upstash Box (github.com/aaif-goose/goose).
 * Goose is a Rust-based coding agent. Sessions are named so conversation
 * history persists across box.agent.run() calls.
 *
 * Requires: ANTHROPIC_API_KEY (or set GOOSE_PROVIDER + GOOSE_MODEL)
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... ANTHROPIC_API_KEY=... npx tsx harnesses/custom-goose-agent.ts
 */

import { Agent, Box } from "@upstash/box";

const AGENT_SOURCE = String.raw`
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, unlinkSync, writeFileSync, mkdirSync } from "fs";

const WORK_DIR = "/workspace/home";
const GOOSE_BIN = "/home/boxuser/.local/bin/goose";

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
      }
    }
    return parts.join("");
  } catch { return base; }
}

const prompt = readArg("-p");
const rawModel = readArg("--model", "");
const model = rawModel.includes("/") ? rawModel.split("/").slice(1).join("/") : rawModel;
const sessionId = readArg("--session") || randomUUID();
const isResume = !!readArg("--session");

// MCP servers: Goose natively supports MCP via config.yaml
const MCP_CONFIG_PATH = "/workspace/home/.box-internal/mcp-config.json";
try {
  const mcpConfigs = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8"));
  if (mcpConfigs.length > 0) {
    let yaml = "extensions:\n";
    for (const cfg of mcpConfigs) {
      const safeName = cfg.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      if (cfg.source === "npm") {
        const gooseArgs = ["-y", cfg.package_or_url, ...(cfg.args || [])];
        const argsYaml = gooseArgs.map(a => JSON.stringify(a)).join(", ");
        yaml += "  " + safeName + ":\n    name: " + safeName + "\n    type: stdio\n    cmd: npx\n    args: [" + argsYaml + "]\n    enabled: true\n";
      } else if (cfg.source === "url") {
        yaml += "  " + safeName + ":\n    name: " + safeName + "\n    type: streamable_http\n    uri: " + cfg.package_or_url + "\n    enabled: true\n";
        if (cfg.headers && Object.keys(cfg.headers).length) {
          yaml += "    headers:\n";
          for (const [k, v] of Object.entries(cfg.headers)) yaml += "      " + JSON.stringify(k) + ": " + JSON.stringify(v) + "\n";
        }
      }
    }
    mkdirSync("/home/boxuser/.config/goose", { recursive: true });
    writeFileSync("/home/boxuser/.config/goose/config.yaml", yaml);
    console.error("[goose] MCP servers configured: " + mcpConfigs.map(c => c.name).join(", "));
  }
} catch {}

if (!prompt) { emit("error", { error: "no prompt provided", session_id: sessionId }); process.exit(1); }

let agentOpts = {};
if (process.env.AGENT_OPTIONS) {
  try {
    const parsed = JSON.parse(process.env.AGENT_OPTIONS);
    agentOpts = parsed.agentOptions ?? parsed;
    console.error("[goose] Agent options applied: " + Object.keys(agentOpts).join(", "));
  } catch (e) {
    console.error("[goose] Warning: Failed to parse AGENT_OPTIONS: " + e.message);
  }
}

process.chdir(WORK_DIR);
const fullPrompt = buildPrompt(prompt);
emit("tool", { name: "goose", toolCallId: sessionId, input: { session: sessionId, resume: isResume } });

let output = "";
let inputTokens = 0, outputTokens = 0;
const pendingToolIds = new Map();

try {
  await new Promise((resolve, reject) => {
    const gooseArgs = [
      "run", "--name", sessionId, "--text", fullPrompt, "--output-format", "stream-json",
    ];
    if (isResume) gooseArgs.push("--resume");
    if (model) gooseArgs.push("--model", model);

    const proc = spawn(GOOSE_BIN, gooseArgs, {
      cwd: WORK_DIR, env: { ...process.env, ...agentOpts }, stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.type === "message" && event.message?.role === "assistant") {
            for (const part of event.message.content || []) {
              if (part.type === "text" && part.text) { output += part.text; emit("text", { text: part.text }); }
            }
          }
          if (event.type === "tool_call" || event.type === "tool_use") {
            const toolName = event.name ?? "tool";
            let toolCallId = event.id;
            if (!toolCallId) {
              toolCallId = randomUUID();
              const queue = pendingToolIds.get(toolName) ?? [];
              queue.push(toolCallId);
              pendingToolIds.set(toolName, queue);
            }
            emit("tool", { name: toolName, toolCallId, input: event.parameters ?? event.input ?? {} });
          }
          if (event.type === "tool_result") {
            let toolCallId = event.id ?? "";
            if (!toolCallId && event.name) {
              const queue = pendingToolIds.get(event.name);
              toolCallId = queue?.shift() ?? "";
            }
            emit("tool_result", { toolCallId, output: String(event.output ?? "") });
          }
          if (event.type === "complete") {
            if (typeof event.input_tokens === "number") inputTokens = event.input_tokens;
            if (typeof event.output_tokens === "number") outputTokens = event.output_tokens;
          }
        } catch { if (trimmed) { output += trimmed + "\n"; emit("text", { text: trimmed + "\n" }); } }
      }
    });
    proc.stderr.on("data", (data) => process.stderr.write(data));
    proc.on("close", (code) => code !== 0 ? reject(new Error("goose exited with code " + code)) : resolve(undefined));
    proc.on("error", reject);
  });

  emit("done", {
    output: output.trim(), input_tokens: inputTokens, output_tokens: outputTokens,
    cached_input_tokens: 0, session_id: sessionId,
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
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Goose Custom Agent Harness (In Box)         │");
  console.log("└──────────────────────────────────────────────┘");

  console.log("\n🚀 Creating Box with custom Goose harness...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: {
      harness: Agent.Custom,
      model: "anthropic/claude-sonnet-4-5",
      customHarness: {
        command: "node",
        args: ["/workspace/home/custom-goose-agent.mjs"],
        protocol: "box-sse-v1",
      },
    },
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      GOOSE_PROVIDER: "anthropic",
      GOOSE_DISABLE_KEYRING: "1",
      PATH: "/home/boxuser/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    console.log("\n📦 Installing Goose inside box...");
    await box.exec.command(`
      node --input-type=module -e "
        import { writeFileSync } from 'fs';
        const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
        const url = 'https://github.com/aaif-goose/goose/releases/download/stable/goose-' + arch + '-unknown-linux-gnu.tar.gz';
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        writeFileSync('/tmp/goose.tar.gz', buf);
      "
      mkdir -p /home/boxuser/.local/bin
      tar -xzf /tmp/goose.tar.gz -C /home/boxuser/.local/bin/
      chmod +x /home/boxuser/.local/bin/goose
    `);

    console.log("\n📝 Writing harness...");
    await box.files.write({ path: "custom-goose-agent.mjs", content: AGENT_SOURCE });

    console.log("\n=== Turn 1 ===");
    const run1 = await box.agent.run({
      prompt: "Create a file called hello.txt with the content 'Hello from Goose!'",
    });
    console.log(run1.result);

    console.log("\n=== Turn 2 (follow-up) ===");
    const run2 = await box.agent.run({
      prompt: "Read back the file you just created.",
    });
    console.log(run2.result);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });