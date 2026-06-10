#!/usr/bin/env tsx
/**
 * Sandboxed perps trading planner.
 *
 * This agent creates read-only/paper/live-preview plans inside an Upstash Box.
 * It never receives private keys and never submits signed transactions.
 */

import { Agent, Box } from "@upstash/box";
import { z } from "zod";
import {
  buildBoxPerpsPlan,
  loadBoxPerpsConfig,
  parsePerpsCliArgs,
  type PerpsIntent,
} from "../lib/perps-policy";
import { buildSolanaCallPlan, loadSolanaCallConfig } from "../lib/solana-calls";
import { logCost } from "../lib/box-utils";
import { trackInstallEvent } from "../lib/install-tracker";

const PerpsAgentResultSchema = z.object({
  verdict: z.enum(["observe", "paper-ready", "blocked"]),
  symbol: z.string(),
  side: z.enum(["long", "short"]),
  notionalUsd: z.number(),
  leverage: z.number(),
  blocking: z.array(z.string()),
  warnings: z.array(z.string()),
  walletPublicKey: z.string().optional(),
  dataSourcesChecked: z.array(z.string()),
  nextAction: z.string(),
  rationale: z.string(),
});

const GEMINI_AGENT_SOURCE = String.raw`
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const WORK_DIR = "/workspace/home";
const SESSIONS_DIR = "/workspace/home/.gemini-sessions";
const args = process.argv.slice(2);
const rawWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr);

function readArg(name, fallback = "") {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] ?? fallback : fallback;
}

function emit(event, data) {
  rawWrite("event: " + event + "\n");
  rawWrite("data: " + JSON.stringify(data) + "\n\n");
}

function loadHistory(file) {
  try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return []; }
}

function saveHistory(file, history) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(history));
}

const prompt = readArg("-p");
const model = readArg("--model", "gemini-2.5-flash");
const sessionId = readArg("--session") || randomUUID();
const sessionFile = SESSIONS_DIR + "/" + sessionId + ".json";

if (!prompt) { emit("error", { error: "no prompt provided", session_id: sessionId }); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { emit("error", { error: "GEMINI_API_KEY is required", session_id: sessionId }); process.exit(1); }

process.chdir(WORK_DIR);

try {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const chat = ai.chats.create({ model, history: loadHistory(sessionFile) });
  emit("tool", { name: "gemini", toolCallId: sessionId, input: { model } });

  let output = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const stream = await chat.sendMessageStream({ message: prompt });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) { output += text; emit("text", { text }); }
    const usage = chunk.usageMetadata;
    if (usage) {
      inputTokens = usage.promptTokenCount ?? inputTokens;
      outputTokens = usage.candidatesTokenCount ?? outputTokens;
    }
  }

  saveHistory(sessionFile, chat.getHistory());
  emit("done", { output, input_tokens: inputTokens, output_tokens: outputTokens, cached_input_tokens: 0, session_id: sessionId });
} catch (error) {
  emit("error", { error: error instanceof Error ? error.message : String(error), session_id: sessionId });
  process.exit(1);
}
`;

const DEEPSEEK_AGENT_SOURCE = String.raw`
import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const WORK_DIR = "/workspace/home";
const SESSIONS_DIR = "/workspace/home/.deepseek-sessions";
const args = process.argv.slice(2);
const rawWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr);

function readArg(name, fallback = "") {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] ?? fallback : fallback;
}

function emit(event, data) {
  rawWrite("event: " + event + "\n");
  rawWrite("data: " + JSON.stringify(data) + "\n\n");
}

function loadHistory(file) {
  try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return []; }
}

function saveHistory(file, history) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(history));
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

const prompt = readArg("-p");
const model = readArg("--model", process.env.DEEPSEEK_MODEL || "deepseek-v4-pro");
const sessionId = readArg("--session") || randomUUID();
const sessionFile = SESSIONS_DIR + "/" + sessionId + ".json";
const baseUrl = trimSlash(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
const thinking = process.env.DEEPSEEK_THINKING === "disabled" ? "disabled" : "enabled";
const reasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT === "max" ? "max" : "high";

if (!prompt) { emit("error", { error: "no prompt provided", session_id: sessionId }); process.exit(1); }
if (!process.env.DEEPSEEK_API_KEY) { emit("error", { error: "DEEPSEEK_API_KEY is required", session_id: sessionId }); process.exit(1); }

process.chdir(WORK_DIR);

try {
  const history = loadHistory(sessionFile);
  const messages = [
    {
      role: "system",
      content: [
        "You are the reasoning core for a Solana agent arena.",
        "Agents compete in paper perpetuals only unless operator gates explicitly arm live mode.",
        "Never request or print private keys, seed phrases, or raw API keys.",
        "Speak in compact terminal-style dialogue and include concrete risk, RPC, and market observations.",
      ].join(" "),
    },
    ...history,
    { role: "user", content: prompt },
  ];

  emit("tool", {
    name: "deepseek_chat_completions",
    toolCallId: sessionId,
    input: { model, base_url: baseUrl, thinking, reasoning_effort: reasoningEffort },
  });

  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + process.env.DEEPSEEK_API_KEY,
    },
    body: JSON.stringify({
      model,
      messages,
      thinking: { type: thinking },
      reasoning_effort: reasoningEffort,
      stream: false,
      max_tokens: 900,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || "DeepSeek request failed: " + response.status);
  }

  const message = body.choices?.[0]?.message || {};
  const output = message.content || "";
  if (output) emit("text", { text: output });

  saveHistory(sessionFile, [
    ...history,
    { role: "user", content: prompt },
    { role: "assistant", content: output },
  ]);

  emit("done", {
    output,
    input_tokens: body.usage?.prompt_tokens ?? 0,
    output_tokens: body.usage?.completion_tokens ?? 0,
    cached_input_tokens: body.usage?.prompt_cache_hit_tokens ?? 0,
    session_id: sessionId,
  });
} catch (error) {
  emit("error", { error: error instanceof Error ? error.message : String(error), session_id: sessionId });
  process.exit(1);
}
`;

const PERPS_PLAN_SOURCE = String.raw`
import { Keypair } from "@solana/web3.js";

const args = process.argv.slice(2);

function readFlag(name, fallback) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] ?? fallback : fallback;
}

function symbols(raw) {
  return String(raw || "SOL,ETH,BTC").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

function positive(raw, fallback) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const intent = {
  symbol: readFlag("--symbol", "SOL").toUpperCase(),
  side: readFlag("--side", "long"),
  notionalUsd: positive(readFlag("--notional", "100"), 100),
  leverage: positive(readFlag("--leverage", "1"), 1),
  expectedSpreadBps: positive(readFlag("--spread-bps", "10"), 10),
  execution: readFlag("--execution", "paper"),
};

const agentWallet = Keypair.generate();
const agentWalletPublicKey = agentWallet.publicKey.toBase58();
agentWallet.secretKey.fill(0);

const config = {
  allowedSymbols: symbols(process.env.PERPS_ALLOWED_SYMBOLS),
  maxNotionalUsd: positive(process.env.PERPS_MAX_NOTIONAL_USD, 250),
  maxLeverage: positive(process.env.PERPS_MAX_LEVERAGE, 3),
  maxSpreadBps: positive(process.env.PERPS_MAX_SPREAD_BPS, 40),
  liveTrading: process.env.LIVE_TRADING === "true",
  operatorConfirmed: process.env.OPERATOR_CONFIRMED === "true",
  simOnly: process.env.PERPS_SIM_ONLY !== "false",
  rpcConfigured: Boolean(process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || process.env.RPC_URL || process.env.HELIUS_API_KEY),
  deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
  deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  deepseekAnthropicBaseUrl: process.env.DEEPSEEK_ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic",
  walletReferenceConfigured: Boolean(process.env.PERPS_WALLET_ADDRESS || process.env.WALLET_PUBLIC_KEY),
  phoenixApiUrl: process.env.PHOENIX_API_URL || "https://api.phoenix.trade",
  jupiterQuoteUrl: process.env.JUPITER_QUOTE_URL || "https://quote-api.jup.ag/v6/quote",
  rpcUrl: process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || process.env.RPC_URL || (process.env.HELIUS_API_KEY ? "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY : "https://api.mainnet-beta.solana.com"),
};

const blocking = [];
const warnings = [];

if (!config.allowedSymbols.includes(intent.symbol)) blocking.push(intent.symbol + " is not in PERPS_ALLOWED_SYMBOLS");
if (intent.notionalUsd > config.maxNotionalUsd) blocking.push("notional exceeds max");
if (intent.leverage > config.maxLeverage) blocking.push("leverage exceeds max");
if (intent.expectedSpreadBps > config.maxSpreadBps) blocking.push("spread exceeds max");
if (!config.rpcConfigured) warnings.push("No HELIUS_RPC_URL/SOLANA_RPC_URL/RPC_URL configured; public endpoints may be used.");
if (!config.deepseekConfigured) warnings.push("No DEEPSEEK_API_KEY configured; DeepSeek autonomy falls back to scripted simulation.");
if (!config.walletReferenceConfigured) warnings.push("No public wallet reference configured; using ephemeral in-box agent wallet for simulation identity.");
if (intent.execution === "live-preview") {
  if (!config.liveTrading) blocking.push("LIVE_TRADING must be true");
  if (!config.operatorConfirmed) blocking.push("OPERATOR_CONFIRMED must be true");
  if (config.simOnly) blocking.push("PERPS_SIM_ONLY must be false");
  warnings.push("Live-preview does not sign or submit transactions inside Box.");
}

console.log(JSON.stringify({
  intent,
  config: {
    allowedSymbols: config.allowedSymbols,
    maxNotionalUsd: config.maxNotionalUsd,
    maxLeverage: config.maxLeverage,
    maxSpreadBps: config.maxSpreadBps,
    liveTrading: config.liveTrading,
    operatorConfirmed: config.operatorConfirmed,
    simOnly: config.simOnly,
    rpcConfigured: config.rpcConfigured,
    heliusConfigured: Boolean(process.env.HELIUS_API_KEY),
    deepseekConfigured: config.deepseekConfigured,
    deepseekModel: config.deepseekModel,
    deepseekBaseUrl: config.deepseekBaseUrl,
    deepseekAnthropicBaseUrl: config.deepseekAnthropicBaseUrl,
    phoenixApiUrl: config.phoenixApiUrl,
    jupiterQuoteUrl: config.jupiterQuoteUrl
  },
  wallet: {
    publicKey: agentWalletPublicKey,
    scope: "box-ephemeral",
    signing: "simulation-only",
    custody: "generated-in-sandbox"
  },
  solanaCalls: {
    rpcHealth: await postRpc(config.rpcUrl, "getHealth"),
    latestBlockhash: await postRpc(config.rpcUrl, "getLatestBlockhash", [{ commitment: "processed" }]),
    jupiterSolUsdcQuote: await getJson(config.jupiterQuoteUrl + "?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&slippageBps=50"),
    heliusAssetsByOwner: process.env.HELIUS_API_KEY ? await postRpc("https://rpc.helius.xyz/?api-key=" + process.env.HELIUS_API_KEY, "getAssetsByOwner", [{ ownerAddress: agentWalletPublicKey, page: 1, limit: 10 }]) : { skipped: "HELIUS_API_KEY not set" },
    phoenixMarket: await getJson(config.phoenixApiUrl.replace(/\/+$/, "") + "/exchange/market/" + encodeURIComponent(intent.symbol)),
    phoenixTraderState: await getJson(config.phoenixApiUrl.replace(/\/+$/, "") + "/trader/" + encodeURIComponent(agentWalletPublicKey) + "/state")
  },
  preflight: { ok: blocking.length === 0, mode: intent.execution, blocking, warnings },
  route: {
    adapter: "vulcan",
    command: "cargo",
    args: ["run", "--bin", "vulcan", "--", intent.side === "long" ? "paper-buy" : "paper-sell", "--symbol", intent.symbol]
  },
  notes: [
    "Box perps is paper-first and policy-gated.",
    "DeepSeek API is the preferred autonomous conversation and strategy reasoning rail when DEEPSEEK_API_KEY is configured.",
    "Do not copy private keys or seed phrases into this sandbox.",
    "Use live-preview only for human-inspected handoff to a separate signer."
  ]
}, null, 2));

if (blocking.length > 0) process.exitCode = 2;

async function postRpc(url, method, params = []) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "box-agent", method, params })
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getJson(url) {
  try {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("api-key")) parsed.searchParams.set("api-key", "redacted");
    return parsed.toString();
  } catch {
    return "[redacted-url]";
  }
}
`;

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  const provider = selectAgentProvider();
  if (!provider) {
    throw new Error("DEEPSEEK_API_KEY, GEMINI_API_KEY, or CLAUDE_KEY required");
  }

  const intent = parsePerpsCliArgs(process.argv.slice(2));
  const localPlan = buildBoxPerpsPlan(intent, loadBoxPerpsConfig());
  const solanaCallPlan = buildSolanaCallPlan(loadSolanaCallConfig(), {
    ownerPublicKey: process.env.PERPS_WALLET_ADDRESS ?? process.env.WALLET_PUBLIC_KEY,
    symbol: intent.symbol,
  });

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Solana Perps Trading Agent (Box Planner)    │");
  console.log("└──────────────────────────────────────────────┘");
  console.log(JSON.stringify(localPlan.preflight, null, 2));
  console.log(JSON.stringify(solanaCallPlan, null, 2));

  const box = await createPerpsBox(provider);
  console.log(`Box created: ${box.id}`);

  try {
    await box.files.write({ path: "perps-plan.mjs", content: PERPS_PLAN_SOURCE });
    await box.exec.command("cd /workspace/home && npm install @solana/web3.js --silent");

    if (provider === "deepseek") {
      await box.files.write({ path: "custom-deepseek-agent.mjs", content: DEEPSEEK_AGENT_SOURCE });
    }

    if (provider === "gemini") {
      await box.exec.command("cd /workspace/home && npm install @google/genai --silent");
      await box.files.write({ path: "custom-gemini-agent.mjs", content: GEMINI_AGENT_SOURCE });
    }

    const sandboxPlan = await runSandboxPreflight(box, intent);

    const run = await box.agent.run({
      prompt: [
        "You are a Solana perps risk reviewer running inside an ephemeral Box.",
        "Do not request, print, infer, or use private keys or seed phrases.",
        "Use RPC, Jupiter, Helius, and Phoenix responses only as market/read context.",
        "Vulcan/Phoenix live commands require explicit operator approval and an external signer.",
        "Review this perps plan and return only the requested JSON shape.",
        sandboxPlan,
      ].join("\n\n"),
      responseSchema: PerpsAgentResultSchema,
    });

    console.log(JSON.stringify(run.result, null, 2));
    logCost("Perps Box agent run", run.cost);
  } finally {
    await box.delete();
  }
}

type AgentProvider = "deepseek" | "gemini" | "claude";

function selectAgentProvider(): AgentProvider | undefined {
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.CLAUDE_KEY) return "claude";
  return undefined;
}

async function createPerpsBox(provider: AgentProvider) {
  await trackInstallEvent({
    event: "box_install",
    source: "github",
    packageName: "solana-clawd-box-agents",
    target: "solana-perps-trading-agent",
    version: process.env.npm_package_version ?? "unknown",
    gitRef: process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    installer: "box:perps",
    runtime: "node",
    platform: process.platform,
    nodeVersion: process.version,
  });

  return Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
    agent: provider === "deepseek"
      ? {
          harness: Agent.Custom,
          model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
          customHarness: {
            command: "node",
            args: ["/workspace/home/custom-deepseek-agent.mjs"],
            protocol: "box-sse-v1",
          },
        }
      : provider === "gemini"
      ? {
          harness: Agent.Custom,
          model: "gemini-2.5-flash",
          customHarness: {
            command: "node",
            args: ["/workspace/home/custom-gemini-agent.mjs"],
            protocol: "box-sse-v1",
          },
        }
      : {
          harness: Agent.ClaudeCode,
          model: "anthropic/claude-sonnet-4-5",
          apiKey: process.env.CLAUDE_KEY!,
        },
    env: pickPerpsEnv(),
  });
}

async function runSandboxPreflight(box: Box, intent: PerpsIntent): Promise<string> {
  const command = [
    "node",
    "/workspace/home/perps-plan.mjs",
    "--symbol",
    shellArg(intent.symbol),
    "--side",
    shellArg(intent.side),
    "--notional",
    shellArg(String(intent.notionalUsd)),
    "--leverage",
    shellArg(String(intent.leverage)),
    "--spread-bps",
    shellArg(String(intent.expectedSpreadBps)),
    "--execution",
    shellArg(intent.execution),
  ].join(" ");

  const result = await box.exec.command(command);
  return result.result || JSON.stringify({ error: "empty sandbox preflight output" });
}

function pickPerpsEnv(): Record<string, string> {
  const allowed = [
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "DEEPSEEK_ANTHROPIC_BASE_URL",
    "DEEPSEEK_MODEL",
    "DEEPSEEK_FAST_MODEL",
    "DEEPSEEK_THINKING",
    "DEEPSEEK_REASONING_EFFORT",
    "GEMINI_API_KEY",
    "HELIUS_RPC_URL",
    "SOLANA_RPC_URL",
    "RPC_URL",
    "HELIUS_API_KEY",
    "JUPITER_QUOTE_URL",
    "PHOENIX_API_URL",
    "PERPS_ALLOWED_SYMBOLS",
    "PERPS_MAX_NOTIONAL_USD",
    "PERPS_MAX_LEVERAGE",
    "PERPS_MAX_SPREAD_BPS",
    "PERPS_SIM_ONLY",
    "LIVE_TRADING",
    "OPERATOR_CONFIRMED",
    "PERPS_WALLET_ADDRESS",
    "WALLET_PUBLIC_KEY",
  ];

  return Object.fromEntries(
    allowed
      .map((key) => [key, process.env[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );
}

function shellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
