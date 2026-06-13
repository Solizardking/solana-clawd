/**
 * Clawd Pump Box Agent
 *
 * Runs a Claude Code agent in an Upstash Box with access to the Solana Clawd
 * Pump MCP server. RPC and API keys are passed through an explicit allowlist.
 * Signing keys are excluded by default.
 *
 * Usage:
 *   npm run box:pump -- --prompt "Review pump wallet health"
 *   npm run box:pump -- --mcp-url https://your-mcp.example.com/mcp --keep-alive
 *   npm run box:pump -- --bootstrap-local-mcp --keep-alive --no-delete
 */

import { Agent, Box, ClaudeCode } from "@upstash/box";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type BoxLike = Awaited<ReturnType<typeof Box.create>> & {
  files: {
    write: (input: { path: string; content: string }) => Promise<unknown>;
  };
  exec?: {
    command?: (command: string) => Promise<unknown>;
  };
};

type McpServer = {
  name: string;
  url?: string;
  package?: string;
  headers?: Record<string, string>;
};

const ROOT = path.resolve(import.meta.dirname, "../..");
const PUMP_ENV_FILE = path.join(ROOT, "clawd-pump", ".env");
const LOCAL_MCP_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "README.md"
];

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalEnv(keys: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function agentApiKey(): string {
  return process.env.CLAUDE_KEY ?? process.env.ANTHROPIC_API_KEY ?? requiredEnv("CLAUDE_KEY");
}

function parseEnvContent(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadPumpEnv(): Promise<void> {
  if (!existsSync(PUMP_ENV_FILE)) return;
  const values = parseEnvContent(await readFile(PUMP_ENV_FILE, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined && value !== "") {
      process.env[key] = value;
    }
  }
}

function buildBoxEnv(includePrivateKey: boolean): Record<string, string> {
  const env = optionalEnv([
    "SOLANA_RPC_URL",
    "SOLANA_RPC_URLS",
    "RPC_HTTP",
    "HELIUS_RPC_URL",
    "BIRDEYE_API_KEY",
    "BIRDEYE_WSS_URL",
    "JUPITER_API_KEY",
    "JUPITER_ENDPOINT",
    "JUPITER_ULTRA_ENDPOINT",
    "JUP_SWAP_V1_API_KEY",
    "YELLOWSTONE_GRPC_HTTP",
    "YELLOWSTONE_GRPC_TOKEN",
    "ZERO_SLOT_URL",
    "ZERO_SLOT_HEALTH",
    "LIVE_TRADING_ENABLED",
    "PUMP_DRY_RUN",
    "MAX_TRADE_SOL",
    "MIN_RESERVE_SOL",
    "AUTO_BUY_AMOUNT_SOL",
    "AUTO_BUY_INTERVAL_SECONDS",
    "AUTO_BUY_MAX_BUYS"
  ]);

  if (includePrivateKey) {
    if (process.env.ALLOW_BOX_PRIVATE_KEY !== "true") {
      throw new Error("Refusing to pass PRIVATE_KEY unless ALLOW_BOX_PRIVATE_KEY=true is also set");
    }
    if (process.env.PRIVATE_KEY) env.PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (process.env.AGENT_WALLET_PRIVATE_KEY) {
      env.AGENT_WALLET_PRIVATE_KEY = process.env.AGENT_WALLET_PRIVATE_KEY;
    }
  }

  env.PUMP_MCP_MODE = "transaction-builder";
  return env;
}

function maskState(key: string): string {
  return process.env[key] ? "set" : "missing";
}

function validatePreflight(options: {
  includePrivateKey: boolean;
  bootstrapLocal: boolean;
  mcpUrl: string;
}): number {
  const failures: string[] = [];
  const agentKeyPresent = Boolean(process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY);
  const rpcPresent = Boolean(process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC_URLS || process.env.RPC_HTTP);

  if (!process.env.UPSTASH_BOX_API_KEY) failures.push("UPSTASH_BOX_API_KEY missing");
  if (!agentKeyPresent) failures.push("CLAUDE_KEY or ANTHROPIC_API_KEY missing");
  if (!rpcPresent) failures.push("SOLANA_RPC_URL, SOLANA_RPC_URLS, or RPC_HTTP missing");
  if (options.includePrivateKey && process.env.ALLOW_BOX_PRIVATE_KEY !== "true") {
    failures.push("ALLOW_BOX_PRIVATE_KEY must be true when --include-private-key is used");
  }
  if (!options.bootstrapLocal && options.mcpUrl.includes("127.0.0.1")) {
    failures.push("localhost MCP requires --bootstrap-local-mcp, or pass --mcp-url with a reachable endpoint");
  }
  if (options.bootstrapLocal) {
    for (const relative of LOCAL_MCP_FILES) {
      if (!existsSync(path.join(ROOT, "mcp-server", relative))) {
        failures.push(`mcp-server/${relative} missing`);
      }
    }
    if (!existsSync(path.join(ROOT, "mcp-server", "src"))) {
      failures.push("mcp-server/src missing");
    }
  }

  console.log("clawd-pump Box preflight");
  console.log(`loaded env file: ${existsSync(PUMP_ENV_FILE) ? "clawd-pump/.env" : "none"}`);
  console.log(`mcp url: ${options.mcpUrl}`);
  console.log(`bootstrap local mcp: ${options.bootstrapLocal}`);
  console.log(`private key forwarded: ${options.includePrivateKey}`);
  console.log("");

  for (const key of [
    "UPSTASH_BOX_API_KEY",
    "UPSTASH_BOX_BASE_URL",
    "CLAUDE_KEY",
    "ANTHROPIC_API_KEY",
    "SOLANA_RPC_URL",
    "SOLANA_RPC_URLS",
    "RPC_HTTP",
    "HELIUS_RPC_URL",
    "BIRDEYE_API_KEY",
    "YELLOWSTONE_GRPC_HTTP",
    "YELLOWSTONE_GRPC_TOKEN",
    "LIVE_TRADING_ENABLED",
    "PUMP_DRY_RUN",
    "MAX_TRADE_SOL",
    "PRIVATE_KEY"
  ]) {
    console.log(`${key}=${maskState(key)}`);
  }

  if (failures.length) {
    console.log("\nfailures:");
    for (const failure of failures) console.log(`- ${failure}`);
    return 1;
  }

  console.log("\npreflight ok");
  return 0;
}

function buildMcpServers(mcpUrl: string): McpServer[] {
  const servers: McpServer[] = [
    {
      name: "solana-clawd-pump",
      url: mcpUrl,
      headers: process.env.PUMP_MCP_BEARER
        ? { Authorization: `Bearer ${process.env.PUMP_MCP_BEARER}` }
        : undefined
    }
  ];

  if (process.env.CONTEXT7_KEY) {
    servers.push({
      name: "context7",
      url: "https://mcp.context7.com/mcp",
      headers: { Authorization: `Bearer ${process.env.CONTEXT7_KEY}` }
    });
  }

  return servers;
}

async function writeBoxFile(box: BoxLike, filePath: string, content: string): Promise<void> {
  await box.files.write({ path: filePath, content });
}

async function uploadDirectory(box: BoxLike, sourceDir: string, destDir: string): Promise<void> {
  const entries = await readdir(sourceDir);
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry);
    const destPath = `${destDir}/${entry}`;
    const info = await stat(sourcePath);
    if (info.isDirectory()) {
      await uploadDirectory(box, sourcePath, destPath);
    } else if (info.isFile()) {
      await writeBoxFile(box, destPath, await readFile(sourcePath, "utf8"));
    }
  }
}

async function execBox(box: BoxLike, command: string): Promise<void> {
  if (!box.exec?.command) {
    throw new Error("This @upstash/box SDK does not expose box.exec.command; use --mcp-url instead");
  }
  await box.exec.command(command);
}

async function bootstrapLocalMcp(box: BoxLike): Promise<void> {
  for (const relative of LOCAL_MCP_FILES) {
    const src = path.join(ROOT, "mcp-server", relative);
    const dst = `mcp-server/${relative}`;
    await writeBoxFile(box, dst, await readFile(src, "utf8"));
  }
  await uploadDirectory(box, path.join(ROOT, "mcp-server", "src"), "mcp-server/src");

  await execBox(
    box,
    "cd mcp-server && npm ci --silent && npm run build && nohup npm run start:http -- --port=3001 > ../pump-mcp.log 2>&1 &"
  );
}

function buildPrompt(userPrompt: string, mcpUrl: string, includePrivateKey: boolean): string {
  return `You are Clawd Pump running in an Upstash Box.

Use the solana-clawd-pump MCP server at ${mcpUrl} for Pump SDK transaction-building, quotes, token metadata, fee, AMM, and analytics workflows.

Operational policy:
- Observe and build transaction plans by default.
- Do not claim a trade was submitted unless a signing/execution tool actually returns a signature.
- LIVE_TRADING_ENABLED and PUMP_DRY_RUN are hard gates.
- PRIVATE_KEY forwarded: ${includePrivateKey ? "yes" : "no"}.
- If no signing key is available, produce unsigned transaction instructions and call plans only.
- Keep max trade size within MAX_TRADE_SOL and preserve MIN_RESERVE_SOL.

Task:
${userPrompt}`;
}

async function main(): Promise<void> {
  const keepAlive = hasFlag("--keep-alive");
  const preflight = hasFlag("--preflight");
  const noDelete = hasFlag("--no-delete") || keepAlive;
  const bootstrapLocal = hasFlag("--bootstrap-local-mcp");
  const includePrivateKey = hasFlag("--include-private-key");
  const prompt = argValue("--prompt") ?? "Inspect the available Pump MCP tools, verify RPC/API access, and produce a readiness report. Do not trade.";
  const mcpUrl = argValue("--mcp-url") ?? process.env.PUMP_MCP_URL ?? "http://127.0.0.1:3001/mcp";

  await loadPumpEnv();

  if (preflight) {
    process.exitCode = validatePreflight({ includePrivateKey, bootstrapLocal, mcpUrl });
    return;
  }

  if (!bootstrapLocal && mcpUrl.includes("127.0.0.1")) {
    throw new Error("Use --bootstrap-local-mcp for localhost MCP, or pass --mcp-url with a reachable HTTPS MCP endpoint");
  }

  const box = await Box.create({
    apiKey: requiredEnv("UPSTASH_BOX_API_KEY"),
    baseUrl: process.env.UPSTASH_BOX_BASE_URL,
    runtime: "node",
    keepAlive,
    env: buildBoxEnv(includePrivateKey),
    agent: {
      harness: Agent.ClaudeCode,
      model: (process.env.CLAWD_BOX_MODEL as ClaudeCode | undefined) ?? ClaudeCode.Sonnet_4_5,
      apiKey: agentApiKey()
    },
    skills: ["anthropics/skills/frontend-design"],
    mcpServers: buildMcpServers(mcpUrl)
  } as Parameters<typeof Box.create>[0]);

  console.log(`Box: ${box.id}`);

  try {
    if (bootstrapLocal) {
      await bootstrapLocalMcp(box as BoxLike);
      console.log("Local Pump MCP server bootstrapped inside Box on http://127.0.0.1:3001/mcp");
    }

    const run = await box.agent.stream({
      prompt: buildPrompt(prompt, mcpUrl, includePrivateKey)
    });

    for await (const chunk of run) {
      if (chunk.type === "text-delta") process.stdout.write(chunk.text);
    }
  } finally {
    if (noDelete) {
      console.log(`\nBox kept alive: ${box.id}`);
    } else {
      await box.delete();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
