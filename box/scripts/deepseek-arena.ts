#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ArenaAgent {
  id: string;
  name: string;
  role: string;
  market: string;
  side: "long" | "short" | "hedged";
  thesis: string;
  risk: number;
}

interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  anthropicBaseUrl: string;
  model: string;
  thinking: "enabled" | "disabled";
  reasoningEffort: "high" | "max";
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

const AGENTS: ArenaAgent[] = [
  {
    id: "phoenix-keeper",
    name: "Phoenix Keeper",
    role: "perps execution",
    market: "SOL-PERP",
    side: "long",
    thesis: "Momentum with funding guardrails",
    risk: 44,
  },
  {
    id: "basis-forge",
    name: "Basis Forge",
    role: "funding-rate arbitrage",
    market: "JUP-PERP",
    side: "hedged",
    thesis: "Capture basis spreads while staying market-neutral",
    risk: 31,
  },
  {
    id: "liquidation-scout",
    name: "Liquidation Scout",
    role: "liquidation radar",
    market: "BTC-PERP",
    side: "short",
    thesis: "Fade crowded leverage when liquidation clusters heat up",
    risk: 58,
  },
  {
    id: "signal-forge",
    name: "Signal Forge",
    role: "order-flow analyst",
    market: "BONK-PERP",
    side: "long",
    thesis: "Trade only when flow bursts survive the risk veto",
    risk: 63,
  },
];

loadEnvFiles([
  resolve(REPO_ROOT, ".env.local"),
  resolve(REPO_ROOT, ".env"),
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), ".env"),
]);

async function main() {
  const rounds = positiveInt(readFlag("--rounds"), 2);
  const json = hasFlag("--json");
  const config = loadDeepSeekConfig();
  const rpcUrl = resolveRpcUrl();
  const onchain = await readOnchainContext(rpcUrl);
  const messages = buildSystemMessages(config, rpcUrl, onchain);
  const transcript: Array<{ round: number; left: string; right: string; output: string }> = [];

  for (let round = 1; round <= rounds; round += 1) {
    const left = AGENTS[(round - 1) % AGENTS.length];
    const right = AGENTS[(round + 1) % AGENTS.length];
    messages.push({ role: "user", content: buildRoundPrompt(round, left, right, onchain) });
    const output = await deepseekChat(config, messages);
    messages.push({ role: "assistant", content: output });
    transcript.push({ round, left: left.name, right: right.name, output });
  }

  const result = {
    provider: "deepseek",
    openaiBaseUrl: config.baseUrl,
    anthropicBaseUrl: config.anthropicBaseUrl,
    model: config.model,
    rpcUrl: redactUrl(rpcUrl),
    rounds,
    transcript,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Solana Agent Arena - DeepSeek autonomous match");
  console.log(`model=${config.model} openai=${config.baseUrl} anthropic=${config.anthropicBaseUrl}`);
  console.log(`rpc=${redactUrl(rpcUrl)}`);
  for (const entry of transcript) {
    console.log(`\n[round ${entry.round}] ${entry.left} vs ${entry.right}`);
    console.log(entry.output);
  }
}

function loadDeepSeekConfig(): DeepSeekConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required for autonomous arena conversations.");
  }
  return {
    apiKey,
    baseUrl: trimSlash(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"),
    anthropicBaseUrl: trimSlash(process.env.DEEPSEEK_ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic"),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    thinking: process.env.DEEPSEEK_THINKING === "disabled" ? "disabled" : "enabled",
    reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT === "max" ? "max" : "high",
  };
}

function buildSystemMessages(config: DeepSeekConfig, rpcUrl: string, onchain: Record<string, unknown>): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the referee and shared reasoning core for a Solana agent arena.",
        "Agents compete using paper perpetuals, on-chain context, and terminal dialogue.",
        "Never request, infer, print, or use private keys, seed phrases, raw API keys, or wallet secrets.",
        "Output exactly four short terminal lines, with no markdown table and no extra prose.",
        "Mention risk gates when an agent overreaches.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Arena boot context:",
        `DeepSeek OpenAI base_url=${config.baseUrl}`,
        `DeepSeek Anthropic base_url=${config.anthropicBaseUrl}`,
        `model=${config.model}`,
        `rpc=${redactUrl(rpcUrl)}`,
        `onchain=${JSON.stringify(onchain)}`,
      ].join("\n"),
    },
  ];
}

function buildRoundPrompt(
  round: number,
  left: ArenaAgent,
  right: ArenaAgent,
  onchain: Record<string, unknown>,
): string {
  return [
    `Round ${round}: terminal-vs-terminal autonomous match.`,
    `Left agent: ${left.name}; role=${left.role}; market=${left.market}; side=${left.side}; risk=${left.risk}; thesis=${left.thesis}.`,
    `Right agent: ${right.name}; role=${right.role}; market=${right.market}; side=${right.side}; risk=${right.risk}; thesis=${right.thesis}.`,
    `On-chain context: ${JSON.stringify(onchain)}`,
    "Return exactly this shape:",
    "LEFT <agent>: <one terminal-native sentence>",
    "RIGHT <agent>: <one terminal-native sentence>",
    "RISK: <one sentence with paper/live gate status>",
    "REFEREE winner=<agent> next_action=<paper action> reason=<short reason>",
  ].join("\n");
}

async function deepseekChat(config: DeepSeekConfig, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      thinking: { type: config.thinking },
      reasoning_effort: config.reasoningEffort,
      stream: false,
      max_tokens: 850,
    }),
  });
  const body = await response.json().catch(() => ({})) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(body.error?.message ?? `DeepSeek request failed with HTTP ${response.status}`);
  }
  return body.choices?.[0]?.message?.content?.trim() || "[empty DeepSeek response]";
}

async function readOnchainContext(rpcUrl: string): Promise<Record<string, unknown>> {
  const [health, blockhash] = await Promise.all([
    postRpc(rpcUrl, "getHealth"),
    postRpc(rpcUrl, "getLatestBlockhash", [{ commitment: "processed" }]),
  ]);
  return { health, blockhash };
}

async function postRpc(url: string, method: string, params: unknown[] = []): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "deepseek-arena", method, params }),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveRpcUrl(): string {
  return (
    process.env.HELIUS_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    process.env.RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
    "https://api.mainnet-beta.solana.com"
  );
}

function loadEnvFiles(paths: string[]): void {
  const protectedKeys = new Set(
    Object.entries(process.env)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key),
  );
  for (const path of [...new Set(paths)]) {
    if (!existsSync(path)) continue;
    const parsed = parseEnv(readFileSync(path, "utf-8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!protectedKeys.has(key) && value && !isPlaceholderValue(value)) process.env[key] = value;
    }
  }
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function isPlaceholderValue(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("your-") || lower.startsWith("<") || lower.includes("api-key=your");
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.searchParams.has("api-key")) url.searchParams.set("api-key", "redacted");
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
