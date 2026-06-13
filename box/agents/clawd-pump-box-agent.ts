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
 *   npm run box:pump -- --browser-use-only --browser-task "Open https://pump.fun and report the page title"
 */

import { Agent, Box, BoxApiKey, ClaudeCode } from "@upstash/box";
import { BrowserUse } from "browser-use-sdk/v3";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);

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

type PumpReadiness = {
  mode?: string;
  ready_to_start?: boolean;
  wallet?: {
    private_key_present?: boolean;
    public_key?: string;
  };
  live_gate?: Record<string, string>;
  endpoints?: Record<string, boolean | string>;
  checks?: Record<string, { passed?: boolean }>;
};

type BrowserUseContext = {
  enabled: boolean;
  task: string;
  sessionId?: string | null;
  status?: string;
  liveUrl?: string | null;
  output?: string | null;
  error?: string;
};

const ROOT = path.resolve(import.meta.dirname, "../..");
const ENV_FILES = [
  path.join(ROOT, ".env"),
  path.join(ROOT, ".env.local"),
  path.join(ROOT, "clawd-pump", ".env")
];
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

function agentApiKey(): string | BoxApiKey {
  const mode = process.env.CLAWD_BOX_AGENT_API_KEY;
  if (mode === BoxApiKey.UpstashKey || mode === BoxApiKey.StoredKey) return mode;
  if (process.env.CLAWD_BOX_USE_UPSTASH_MODEL_KEY === "true") return BoxApiKey.UpstashKey;
  if (!process.env.CLAUDE_KEY && !process.env.ANTHROPIC_API_KEY && process.env.UPSTASH_BOX_API_KEY) {
    return BoxApiKey.UpstashKey;
  }
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

async function loadProjectEnv(): Promise<string[]> {
  const loaded: string[] = [];
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    const values = parseEnvContent(await readFile(file, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined && value !== "") {
        process.env[key] = value;
      }
    }
    loaded.push(path.relative(ROOT, file));
  }

  if (!process.env.UPSTASH_BOX_API_KEY && process.env.BOX_KEY) {
    process.env.UPSTASH_BOX_API_KEY = process.env.BOX_KEY;
  }
  if (!process.env.RPC_HTTP && process.env.RPC_URL) {
    process.env.RPC_HTTP = process.env.RPC_URL;
  }
  if (!process.env.BROWSER_USE_API_KEY && process.env.BROWSERUSE_API_KEY) {
    process.env.BROWSER_USE_API_KEY = process.env.BROWSERUSE_API_KEY;
  }
  if (!process.env.BROWSERUSE_API_KEY && process.env.BROWSER_USE_API_KEY) {
    process.env.BROWSERUSE_API_KEY = process.env.BROWSER_USE_API_KEY;
  }

  return loaded;
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
    "AUTO_BUY_MAX_BUYS",
    "BROWSER_USE_API_KEY",
    "BROWSERUSE_API_KEY"
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

function browserUseKeyPresent(): boolean {
  return Boolean(process.env.BROWSER_USE_API_KEY || process.env.BROWSERUSE_API_KEY);
}

function maskState(key: string): string {
  return process.env[key] ? "set" : "missing";
}

function parseMode(value: string | undefined): "copy" | "autobuy" | "serve" {
  if (value === "autobuy" || value === "serve" || value === "copy") return value;
  return "copy";
}

async function loadPumpReadiness(mode: "copy" | "autobuy" | "serve"): Promise<PumpReadiness | undefined> {
  const script = path.join(ROOT, "clawd-pump", "scripts", "readiness_json.sh");
  if (!existsSync(script)) return undefined;

  const { stdout } = await execFileAsync(script, [mode], {
    cwd: path.join(ROOT, "clawd-pump"),
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout) as PumpReadiness;
}

function printPumpReadiness(readiness: PumpReadiness | undefined): void {
  console.log("\nlocal pump readiness:");
  if (!readiness) {
    console.log("readiness_json.sh=missing");
    return;
  }

  console.log(`ready_to_start=${readiness.ready_to_start === true}`);
  console.log(`mode=${readiness.mode || "missing"}`);
  console.log(`wallet_private_key_present=${readiness.wallet?.private_key_present === true}`);
  console.log(`wallet_public_key=${readiness.wallet?.public_key || "missing"}`);

  const liveGate = readiness.live_gate ?? {};
  for (const key of [
    "live_trading_enabled",
    "pump_dry_run",
    "max_trade_sol",
    "auto_buy_amount_sol",
    "counter_limit",
    "risk_management_enabled"
  ]) {
    console.log(`${key}=${liveGate[key] || "missing"}`);
  }

  const endpoints = readiness.endpoints ?? {};
  for (const key of [
    "rpc_http_present",
    "yellowstone_grpc_http_present",
    "yellowstone_grpc_token_present",
    "http_health_available"
  ]) {
    console.log(`${key}=${endpoints[key] === true}`);
  }

  const checks = readiness.checks ?? {};
  for (const key of ["wallet_address", "smoke_live_gates", "service_render", "funding", "preflight"]) {
    console.log(`${key}=${checks[key]?.passed === true}`);
  }
}

function readinessPromptSummary(readiness: PumpReadiness | undefined): string {
  if (!readiness) {
    return "Local pump readiness: unavailable.";
  }

  const checks = readiness.checks ?? {};
  const endpoints = readiness.endpoints ?? {};
  return [
    "Local pump readiness:",
    `- mode: ${readiness.mode || "missing"}`,
    `- ready_to_start: ${readiness.ready_to_start === true}`,
    `- wallet_public_key: ${readiness.wallet?.public_key || "missing"}`,
    `- wallet_private_key_present_locally: ${readiness.wallet?.private_key_present === true}`,
    `- rpc_http_present: ${endpoints.rpc_http_present === true}`,
    `- yellowstone_grpc_http_present: ${endpoints.yellowstone_grpc_http_present === true}`,
    `- live_trading_enabled: ${readiness.live_gate?.live_trading_enabled || "missing"}`,
    `- pump_dry_run: ${readiness.live_gate?.pump_dry_run || "missing"}`,
    `- max_trade_sol: ${readiness.live_gate?.max_trade_sol || "missing"}`,
    `- risk_management_enabled: ${readiness.live_gate?.risk_management_enabled || "missing"}`,
    `- wallet_address_check: ${checks.wallet_address?.passed === true}`,
    `- smoke_live_gates_check: ${checks.smoke_live_gates?.passed === true}`,
    `- service_render_check: ${checks.service_render?.passed === true}`,
    `- funding_check: ${checks.funding?.passed === true}`,
    `- live_preflight_check: ${checks.preflight?.passed === true}`
  ].join("\n");
}

async function validatePreflight(options: {
  includePrivateKey: boolean;
  bootstrapLocal: boolean;
  mcpUrl: string;
  loadedEnvFiles: string[];
  requireLiveReady: boolean;
  mode: "copy" | "autobuy" | "serve";
}): Promise<number> {
  const failures: string[] = [];
  let pumpReadiness: PumpReadiness | undefined;
  const managedAgentKey =
    process.env.CLAWD_BOX_AGENT_API_KEY === BoxApiKey.UpstashKey ||
    process.env.CLAWD_BOX_AGENT_API_KEY === BoxApiKey.StoredKey ||
    process.env.CLAWD_BOX_USE_UPSTASH_MODEL_KEY === "true" ||
    Boolean(process.env.UPSTASH_BOX_API_KEY);
  const agentKeyPresent = managedAgentKey || Boolean(process.env.CLAUDE_KEY || process.env.ANTHROPIC_API_KEY);
  const rpcPresent = Boolean(process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC_URLS || process.env.RPC_HTTP);

  if (!process.env.UPSTASH_BOX_API_KEY) failures.push("UPSTASH_BOX_API_KEY missing");
  if (!agentKeyPresent) {
    failures.push("CLAUDE_KEY or ANTHROPIC_API_KEY missing, or set CLAWD_BOX_AGENT_API_KEY=UPSTASH_KEY/STORED_KEY");
  }
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

  try {
    pumpReadiness = await loadPumpReadiness(options.mode);
    if (options.requireLiveReady && pumpReadiness?.ready_to_start !== true) {
      failures.push("local pump readiness is not ready_to_start=true");
    }
    if (
      options.requireLiveReady &&
      options.mode !== "serve" &&
      (
        pumpReadiness?.live_gate?.live_trading_enabled !== "true" ||
        pumpReadiness?.live_gate?.pump_dry_run !== "false"
      )
    ) {
      failures.push("live trading gates are not armed: require LIVE_TRADING_ENABLED=true and PUMP_DRY_RUN=false");
    }
  } catch (error) {
    failures.push(
      `local pump readiness failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log("clawd-pump Box preflight");
  console.log(`loaded env files: ${options.loadedEnvFiles.length ? options.loadedEnvFiles.join(", ") : "none"}`);
  console.log(`mcp url: ${options.mcpUrl}`);
  console.log(`bootstrap local mcp: ${options.bootstrapLocal}`);
  console.log(`private key forwarded: ${options.includePrivateKey}`);
  console.log(`require live ready: ${options.requireLiveReady}`);
  console.log(`mode: ${options.mode}`);
  console.log("");

  for (const key of [
    "UPSTASH_BOX_API_KEY",
    "BOX_KEY",
    "UPSTASH_BOX_BASE_URL",
    "CLAUDE_KEY",
    "ANTHROPIC_API_KEY",
    "CLAWD_BOX_AGENT_API_KEY",
    "CLAWD_BOX_USE_UPSTASH_MODEL_KEY",
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
    "PRIVATE_KEY",
    "BROWSER_USE_API_KEY",
    "BROWSERUSE_API_KEY"
  ]) {
    console.log(`${key}=${maskState(key)}`);
  }

  printPumpReadiness(pumpReadiness);

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

function formatBrowserStep(step: Record<string, unknown>): string {
  const number = step.number ?? step.stepNumber ?? step.index ?? "?";
  const type = step.type ? String(step.type) : "";
  const goal = step.summary ?? step.nextGoal ?? step.goal ?? step.action ?? step.status ?? step.data ?? "";
  const url = step.url ?? step.currentUrl ?? "";
  const prefix = type ? `[browser-use:${type}]` : `[browser-use:${number}]`;
  const parts = [prefix];
  if (goal) parts.push(String(goal));
  if (url) parts.push(`url=${url}`);
  return parts.join(" ");
}

async function runBrowserUseTask(task: string): Promise<BrowserUseContext> {
  if (!browserUseKeyPresent()) {
    return {
      enabled: false,
      task,
      error: "BROWSER_USE_API_KEY or BROWSERUSE_API_KEY missing"
    };
  }

  console.log("\nBrowser Use task:");
  console.log(task);

  const client = new BrowserUse({
    apiKey: process.env.BROWSER_USE_API_KEY ?? process.env.BROWSERUSE_API_KEY
  });
  const run = client.run(task, {
    timeout: Number(process.env.BROWSER_USE_TIMEOUT_MS ?? 300_000),
    interval: Number(process.env.BROWSER_USE_INTERVAL_MS ?? 2_000)
  });

  let sessionId: string | null = null;
  try {
    for await (const step of run) {
      sessionId = run.sessionId;
      console.log(formatBrowserStep(step as Record<string, unknown>));
    }

    const result = run.result ?? await run;
    const resultRecord = result as Record<string, unknown>;
    const session = resultRecord.session as Record<string, unknown> | undefined;
    const browserSession = resultRecord.browserSession as Record<string, unknown> | undefined;
    const liveUrl =
      (resultRecord.liveUrl as string | undefined) ??
      (session?.liveUrl as string | undefined) ??
      (browserSession?.liveUrl as string | undefined) ??
      null;

    return {
      enabled: true,
      task,
      sessionId: sessionId ?? run.sessionId,
      status: String(resultRecord.status ?? "completed"),
      liveUrl,
      output: typeof result.output === "string" ? result.output : JSON.stringify(result.output)
    };
  } catch (error) {
    return {
      enabled: true,
      task,
      sessionId: sessionId ?? run.sessionId,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function browserUsePromptSummary(context: BrowserUseContext | undefined): string {
  if (!context) {
    return "Browser Use: not requested.";
  }
  if (!context.enabled) {
    return `Browser Use: unavailable (${context.error}).`;
  }

  return [
    "Browser Use:",
    `- requested_task: ${context.task}`,
    `- session_id: ${context.sessionId || "missing"}`,
    `- status: ${context.status || (context.error ? "failed" : "unknown")}`,
    `- live_url: ${context.liveUrl || "missing"}`,
    `- result: ${context.output || context.error || "missing"}`,
    "- The Box env includes BROWSER_USE_API_KEY/BROWSERUSE_API_KEY when present.",
    "- Browser navigation is for observation and site interaction only; do not connect wallets or submit trades unless explicitly authorized."
  ].join("\n");
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

function buildPrompt(
  userPrompt: string,
  mcpUrl: string,
  includePrivateKey: boolean,
  readiness: PumpReadiness | undefined,
  browserUse: BrowserUseContext | undefined
): string {
  return `You are Clawd Pump running in an Upstash Box.

Use the solana-clawd-pump MCP server at ${mcpUrl} for Pump SDK transaction-building, quotes, token metadata, fee, AMM, and analytics workflows.

${readinessPromptSummary(readiness)}

${browserUsePromptSummary(browserUse)}

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
  const requireLiveReady = hasFlag("--require-live-ready");
  const browserUse = hasFlag("--browser-use");
  const browserUseOnly = hasFlag("--browser-use-only");
  const mode = parseMode(argValue("--mode"));
  const prompt = argValue("--prompt") ?? "Inspect the available Pump MCP tools, verify RPC/API access, and produce a readiness report. Do not trade.";
  const browserTask = argValue("--browser-task") ?? "Open https://pump.fun, confirm the page loads, report the page title/current URL, and do not connect a wallet or trade.";
  const mcpUrl = argValue("--mcp-url") ?? process.env.PUMP_MCP_URL ?? "http://127.0.0.1:3001/mcp";

  const loadedEnvFiles = await loadProjectEnv();
  const pumpReadiness = await loadPumpReadiness(mode).catch(() => undefined);

  if (browserUseOnly) {
    const context = await runBrowserUseTask(browserTask);
    console.log("\nBrowser Use result:");
    console.log(browserUsePromptSummary(context));
    return;
  }

  if (preflight) {
    process.exitCode = await validatePreflight({
      includePrivateKey,
      bootstrapLocal,
      mcpUrl,
      loadedEnvFiles,
      requireLiveReady,
      mode
    });
    return;
  }

  if (!bootstrapLocal && mcpUrl.includes("127.0.0.1")) {
    throw new Error("Use --bootstrap-local-mcp for localhost MCP, or pass --mcp-url with a reachable HTTPS MCP endpoint");
  }

  const browserUseContext = browserUse ? await runBrowserUseTask(browserTask) : undefined;

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
      prompt: buildPrompt(prompt, mcpUrl, includePrivateKey, pumpReadiness, browserUseContext)
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
