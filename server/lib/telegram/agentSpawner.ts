import OpenAI from "openai";
import { eq, sql } from "drizzle-orm";
import { db, hasDatabase } from "../../db";
import { userAgents } from "@shared/schema";
import { getClawdBalance } from "../clawd-balance";
import { getPublicAppUrl } from "./auth";
import { getLinkedTelegramWallet } from "./tradingIntent";

type AgentToolConfig = {
  webSearch: boolean;
  xSearch: boolean;
  computerUse: boolean;
  liveTrading: boolean;
  jupiterRouting: boolean;
  dflowRouting: boolean;
  meteoraRouting: boolean;
  phoenixPerps: boolean;
  predictionMarkets: boolean;
  heliusRpc: boolean;
};

type AgentSpawnIntent = {
  isAgentRequest: boolean;
  name?: string | null;
  slug?: string | null;
  role?: string | null;
  personality?: string | null;
  description?: string | null;
  greeting?: string | null;
  tools?: Partial<AgentToolConfig> | null;
  maxAutonomy?: "advisory" | "prepare_trades" | "confirmed_execution" | null;
  riskLimits?: {
    requireConfirmation?: boolean;
    maxTradeSol?: number | null;
    maxSlippageBps?: number | null;
  } | null;
  confidence?: number;
};

type TelegramButton =
  | { text: string; web_app: { url: string } }
  | { text: string; url: string };

export type TelegramAgentSpawnPlan = {
  handled: boolean;
  text: string;
  buttons?: TelegramButton[][];
};

const MIN_CLAWD_TO_DEPLOY = Number(process.env.TELEGRAM_AGENT_MIN_CLAWD ?? process.env.CLAWD_MIN_BALANCE ?? "100000");

const AGENT_SPAWN_RE =
  /\b(create|spawn|build|deploy|launch|make|set up|summon)\b[\s\S]{0,140}\b(agent|clawd agent|grok agent|trading bot|research bot|telegram agent)\b/i;

let tableReady = false;

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appUrl() {
  return getPublicAppUrl().replace(/\/$/, "");
}

function appPath(path: string, params?: Record<string, string | number | undefined | null>) {
  const url = new URL(`${appUrl()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTools(intent: AgentSpawnIntent, original: string): AgentToolConfig {
  const text = `${original} ${intent.description ?? ""} ${intent.role ?? ""}`.toLowerCase();
  const tools = intent.tools ?? {};
  const liveTrading =
    tools.liveTrading ?? /\b(trade|trading|swap|jupiter|dflow|helius|meteora|perps|phoenix|prediction market)\b/.test(text);
  return {
    webSearch: tools.webSearch ?? /\b(web|search|research|latest|news|internet)\b/.test(text),
    xSearch: tools.xSearch ?? /\b(x search|x\/twitter|twitter|tweets?|social|sentiment)\b/.test(text),
    computerUse: tools.computerUse ?? /\b(computer use|browser|browse|click|website|login|dashboard|screenshot|ui)\b/.test(text),
    liveTrading,
    jupiterRouting: tools.jupiterRouting ?? /\b(jupiter|jup|ultra)\b/.test(text),
    dflowRouting: tools.dflowRouting ?? /\b(dflow|intent|ooda)\b/.test(text),
    meteoraRouting: tools.meteoraRouting ?? /\b(meteora|clawd)\b/.test(text),
    phoenixPerps: tools.phoenixPerps ?? /\b(perps?|phoenix|long|short)\b/.test(text),
    predictionMarkets: tools.predictionMarkets ?? /\b(prediction|odds|yes\/no|kalshi|market)\b/.test(text),
    heliusRpc: tools.heliusRpc ?? (liveTrading || /\b(helius|rpc|solana)\b/.test(text)),
  };
}

function normalizeIntent(raw: Partial<AgentSpawnIntent>, original: string): AgentSpawnIntent {
  const role = typeof raw.role === "string" && raw.role.trim() ? raw.role.trim() : null;
  const description = typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : original;
  const baseName =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : role
        ? titleCase(role).slice(0, 42)
        : "Clawd Grok Agent";

  return {
    isAgentRequest: raw.isAgentRequest !== false,
    name: baseName.slice(0, 64),
    slug: typeof raw.slug === "string" ? slugify(raw.slug) : null,
    role,
    personality: typeof raw.personality === "string" && raw.personality.trim() ? raw.personality.trim() : "sharp, practical, and concise",
    description,
    greeting: typeof raw.greeting === "string" && raw.greeting.trim()
      ? raw.greeting.trim().slice(0, 500)
      : `I am ${baseName}, your Grok-powered CLAWD agent. Tell me what to watch, research, route, or prepare.`,
    tools: normalizeTools(raw as AgentSpawnIntent, original),
    maxAutonomy: raw.maxAutonomy ?? "prepare_trades",
    riskLimits: {
      requireConfirmation: raw.riskLimits?.requireConfirmation !== false,
      maxTradeSol: typeof raw.riskLimits?.maxTradeSol === "number" ? raw.riskLimits.maxTradeSol : null,
      maxSlippageBps: typeof raw.riskLimits?.maxSlippageBps === "number" ? raw.riskLimits.maxSlippageBps : 100,
    },
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
  };
}

function fallbackIntent(text: string): AgentSpawnIntent {
  const nameMatch =
    text.match(/\b(?:called|named|name it|as)\s+([A-Za-z][A-Za-z0-9 _-]{2,42})/i)?.[1] ??
    text.match(/\bagent\s+([A-Za-z][A-Za-z0-9 _-]{2,42})/i)?.[1];
  const role = text
    .replace(AGENT_SPAWN_RE, "")
    .replace(/\b(with|that can|who can|for)\b/gi, "")
    .trim();
  return normalizeIntent({
    isAgentRequest: true,
    name: nameMatch ? titleCase(nameMatch) : "Clawd Grok Trader",
    role: role || "Grok-powered Solana research and trading operator",
    description: text,
  }, text);
}

async function parseAgentSpawnIntent(text: string): Promise<AgentSpawnIntent> {
  if (!process.env.XAI_API_KEY) return fallbackIntent(text);
  const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });
  const system = [
    "You parse Telegram requests that create persistent CLAWD Grok agents.",
    "Return only JSON. Do not include markdown.",
    "The agent can be configured with web_search, x_search, computer_use, Helius RPC trading previews, Jupiter routing, DFlow routing, Meteora CLAWD/SOL routing, Phoenix perps, and prediction markets.",
    "Trading autonomy must stay human-confirmed. Use maxAutonomy prepare_trades unless the user explicitly says confirmed execution, and requireConfirmation should remain true.",
    "JSON shape:",
    "{\"isAgentRequest\":true,\"name\":\"Solana Scout\",\"slug\":\"solana_scout\",\"role\":\"X and web market researcher\",\"personality\":\"fast, skeptical, concise\",\"description\":\"...\",\"greeting\":\"...\",\"tools\":{\"webSearch\":true,\"xSearch\":true,\"computerUse\":false,\"liveTrading\":true,\"jupiterRouting\":true,\"dflowRouting\":true,\"meteoraRouting\":true,\"phoenixPerps\":false,\"predictionMarkets\":false,\"heliusRpc\":true},\"maxAutonomy\":\"prepare_trades\",\"riskLimits\":{\"requireConfirmation\":true,\"maxTradeSol\":0.5,\"maxSlippageBps\":100},\"confidence\":0.9}",
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: process.env.TELEGRAM_AGENT_GROK_MODEL || process.env.TELEGRAM_GROK_MODEL || "grok-4.3",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      temperature: 0.15,
      max_tokens: 900,
      response_format: { type: "json_object" },
    } as any);
    const content = completion.choices[0]?.message?.content ?? "{}";
    return normalizeIntent(JSON.parse(content) as Partial<AgentSpawnIntent>, text);
  } catch {
    return fallbackIntent(text);
  }
}

async function ensureUserAgentsTable() {
  if (tableReady || !hasDatabase) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_agents (
      id SERIAL PRIMARY KEY,
      "ownerWallet" VARCHAR(64) NOT NULL,
      slug VARCHAR(32) NOT NULL UNIQUE,
      name VARCHAR(64) NOT NULL,
      persona TEXT NOT NULL,
      greeting TEXT,
      provider VARCHAR(32) NOT NULL DEFAULT 'xai',
      model VARCHAR(64) NOT NULL DEFAULT 'grok-4.3',
      "avatarUrl" TEXT,
      "sourceAgentId" VARCHAR(128),
      "launchRuntime" VARCHAR(64),
      "importedSpec" JSONB,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      "promptCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS "sourceAgentId" VARCHAR(128)`);
  await db.execute(sql`ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS "launchRuntime" VARCHAR(64)`);
  await db.execute(sql`ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS "importedSpec" JSONB`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_agents_owner_idx ON user_agents("ownerWallet")`);
  tableReady = true;
}

async function uniqueSlug(base: string) {
  const reserved = new Set(["start", "help", "list", "agents", "new", "create", "delete", "admin", "clawd", "cheshire", "trade", "search"]);
  let root = slugify(base) || "clawd_grok_agent";
  if (reserved.has(root)) root = `${root}_agent`;
  root = root.slice(0, 28);
  for (let i = 0; i < 25; i++) {
    const suffix = i === 0 ? "" : `_${i + 1}`;
    const candidate = `${root.slice(0, 32 - suffix.length)}${suffix}`;
    const [existing] = await db.select().from(userAgents).where(eq(userAgents.slug, candidate));
    if (!existing) return candidate;
  }
  return `${root.slice(0, 21)}_${Date.now().toString(36).slice(-6)}`;
}

async function generatePersona(intent: AgentSpawnIntent, tools: AgentToolConfig, original: string) {
  const toolLines = [
    tools.webSearch ? "- Use Grok web_search for current web research, source checks, and news." : "",
    tools.xSearch ? "- Use Grok x_search for X/Twitter sentiment, posts, handles, and real-time social context." : "",
    tools.computerUse ? "- When browser or UI work is needed, route the user to Cheshire Computer Use and keep destructive actions confirmation-gated." : "",
    tools.liveTrading ? "- For trades, prepare live routes through Cheshire only. Never claim a trade executed until a signed transaction is confirmed." : "",
    tools.heliusRpc ? "- Prefer Helius-backed Solana RPC surfaces for wallet, routing, and transaction status context." : "",
    tools.jupiterRouting ? "- For broad spot swaps, prefer Jupiter Ultra routing when requested or when it is the best fit." : "",
    tools.dflowRouting ? "- For intent/OODA swaps, use DFlow route preparation and signed intent submission flows." : "",
    tools.meteoraRouting ? "- For CLAWD/SOL, use the Meteora CLAWD/SOL flow when it fits." : "",
    tools.phoenixPerps ? "- For perps, use Phoenix route preparation and explain margin/liquidation risk." : "",
    tools.predictionMarkets ? "- For event trades, use DFlow prediction market discovery and require market-rule review." : "",
  ].filter(Boolean).join("\n");

  const fallback =
    `You are ${intent.name}, a Grok 4.3-powered persistent CLAWD agent on Cheshire Terminal.\n\n` +
    `Role: ${intent.role || intent.description}\n` +
    `Personality: ${intent.personality || "sharp, practical, concise"}\n\n` +
    `Capabilities:\n${toolLines || "- General Telegram-native Grok chat."}\n\n` +
    `Execution policy:\n` +
    `- Be natural and action-oriented.\n` +
    `- For swaps and trades, quote and prepare. The user must explicitly review and sign with their wallet.\n` +
    `- Do not bypass confirmation for financial, browser, posting, permission, or sensitive-data actions.\n` +
    `- Keep Telegram answers concise unless the user asks for details.\n\n` +
    `Original user brief: ${original}`;

  if (!process.env.XAI_API_KEY) return fallback;

  try {
    const client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
    const completion = await client.chat.completions.create({
      model: process.env.TELEGRAM_AGENT_GROK_MODEL || process.env.TELEGRAM_GROK_MODEL || "grok-4.3",
      messages: [
        {
          role: "system",
          content: "Write a production system prompt for a persistent Telegram-hosted CLAWD agent. Preserve all safety and execution constraints. Return plain text only.",
        },
        { role: "user", content: fallback },
      ],
      temperature: 0.4,
      max_tokens: 1100,
    });
    return completion.choices[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function toolSummary(tools: AgentToolConfig) {
  const labels = [
    tools.xSearch ? "X search" : "",
    tools.webSearch ? "web search" : "",
    tools.computerUse ? "computer use" : "",
    tools.heliusRpc ? "Helius RPC" : "",
    tools.jupiterRouting ? "Jupiter" : "",
    tools.dflowRouting ? "DFlow" : "",
    tools.meteoraRouting ? "Meteora" : "",
    tools.phoenixPerps ? "Phoenix perps" : "",
    tools.predictionMarkets ? "prediction markets" : "",
  ].filter(Boolean);
  return labels.length ? labels.join(" · ") : "Grok chat";
}

function agentHostStartUrl(slug: string) {
  const username = (process.env.TELEGRAM_AGENT_HOST_BOT_USERNAME || process.env.VITE_TELEGRAM_AGENT_HOST_BOT_USERNAME || "")
    .replace(/^@/, "")
    .trim();
  return username ? `https://t.me/${username}?start=${encodeURIComponent(slug)}` : null;
}

export function looksLikeAgentSpawnRequest(text: string) {
  return AGENT_SPAWN_RE.test(text);
}

export function looksLikeComputerUseRequest(text: string) {
  return /\b(computer use|use (?:the )?browser|open .*browser|click|navigate|log in|login|screenshot|inspect .*page|go to https?:\/\/)\b/i.test(text);
}

export async function buildTelegramAgentSpawnPlan(text: string, telegramId?: string): Promise<TelegramAgentSpawnPlan> {
  if (!looksLikeAgentSpawnRequest(text)) return { handled: false, text: "" };

  if (!hasDatabase) {
    return {
      handled: true,
      text:
        "🤖 <b>Agent creation unavailable</b>\n\n" +
        "The database is not configured, so I cannot persist a CLAWD Grok agent yet.",
    };
  }

  await ensureUserAgentsTable();

  const [intent, wallet] = await Promise.all([
    parseAgentSpawnIntent(text),
    getLinkedTelegramWallet(telegramId),
  ]);

  if (!intent.isAgentRequest) return { handled: false, text: "" };

  if (!wallet) {
    return {
      handled: true,
      text:
        "🤖 <b>Link a wallet first</b>\n\n" +
        "I can create the agent from Telegram, but persistent CLAWD agents need a linked Solana wallet for ownership and gating.",
      buttons: [[{ text: "Link Wallet", web_app: { url: appPath("/telegram") } }]],
    };
  }

  let balance = 0;
  try {
    balance = await getClawdBalance(wallet);
  } catch {
    balance = 0;
  }
  if (balance < MIN_CLAWD_TO_DEPLOY) {
    return {
      handled: true,
      text:
        "🤖 <b>CLAWD gate not met</b>\n\n" +
        `<b>Wallet:</b> <code>${shortWallet(wallet)}</code>\n` +
        `<b>Balance:</b> ${Math.floor(balance).toLocaleString()} CLAWD\n` +
        `<b>Required:</b> ${MIN_CLAWD_TO_DEPLOY.toLocaleString()} CLAWD\n\n` +
        "Once your linked wallet meets the gate, send the same natural-language agent request again.",
      buttons: [
        [{ text: "Buy CLAWD", url: "https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump" }],
        [{ text: "Verify Wallet", web_app: { url: appPath("/telegram") } }],
      ],
    };
  }

  const tools = normalizeTools(intent, text);
  const slug = await uniqueSlug(intent.slug || intent.name || "clawd_grok_agent");
  const persona = await generatePersona(intent, tools, text);
  const model = process.env.TELEGRAM_AGENT_GROK_MODEL || process.env.TELEGRAM_GROK_MODEL || "grok-4.3";

  const [created] = await db
    .insert(userAgents)
    .values({
      ownerWallet: wallet,
      slug,
      name: intent.name || titleCase(slug),
      persona,
      greeting: intent.greeting ?? null,
      provider: "xai",
      model,
      launchRuntime: "telegram-agent",
      importedSpec: {
        createdVia: "telegram-natural-language",
        sourceAgentId: "clawd-grok-telegram-spawn",
        naturalLanguagePrompt: text,
        toolConfig: tools,
        autonomy: intent.maxAutonomy ?? "prepare_trades",
        riskLimits: {
          requireConfirmation: intent.riskLimits?.requireConfirmation !== false,
          maxTradeSol: intent.riskLimits?.maxTradeSol ?? null,
          maxSlippageBps: intent.riskLimits?.maxSlippageBps ?? 100,
        },
        routing: {
          heliusRpc: Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY),
          jupiterUltra: tools.jupiterRouting,
          dflowIntent: tools.dflowRouting,
          meteoraClawdSol: tools.meteoraRouting,
          phoenixPerps: tools.phoenixPerps,
        },
        recommendation: {
          runtime: "telegram-agent",
          reason: "Spawned directly from Telegram with Grok 4.3 and Cheshire live-action routing.",
        },
      },
    })
    .returning();

  const hostUrl = agentHostStartUrl(created.slug);
  const buttons: TelegramButton[][] = [
    [{ text: "Open Agent", web_app: { url: appPath(`/agents/deployed/${created.slug}`) } }],
  ];
  if (hostUrl) buttons.push([{ text: "Chat With Agent", url: hostUrl }]);
  buttons.push([
    { text: "Computer Use", web_app: { url: appPath("/computer", { task: `Use ${created.name} to ${intent.role || text}` }) } },
    { text: "Trading Hub", web_app: { url: appPath("/telegram") } },
  ]);

  return {
    handled: true,
    text:
      "🤖 <b>CLAWD Grok agent spawned</b>\n\n" +
      `<b>Name:</b> ${html(created.name)}\n` +
      `<b>Slug:</b> <code>/${html(created.slug)}</code>\n` +
      `<b>Model:</b> ${html(model)}\n` +
      `<b>Owner:</b> <code>${shortWallet(wallet)}</code>\n` +
      `<b>Tools:</b> ${html(toolSummary(tools))}\n\n` +
      "Trading-capable agents prepare live Jupiter, DFlow, Meteora, and Phoenix routes through Cheshire. The wallet still reviews and signs before anything is submitted on-chain.",
    buttons,
  };
}

export function buildComputerUsePlan(text: string): TelegramAgentSpawnPlan {
  const task = text.replace(/^\/(?:computer|browse)\s*/i, "").trim() || text;
  return {
    handled: true,
    text:
      "🖥️ <b>Computer Use ready</b>\n\n" +
      `Task: <i>${html(task)}</i>\n\n` +
      "Open the browser-use console to run this with a live session. Destructive, financial, posting, login, and sensitive-data steps require confirmation.",
    buttons: [[{ text: "Open Computer Use", web_app: { url: appPath("/computer", { task }) } }]],
  };
}
