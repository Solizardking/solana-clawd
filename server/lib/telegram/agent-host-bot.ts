import { Telegraf } from "telegraf";
import OpenAI from "openai";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { userAgents } from "@shared/schema";
import { buildTelegramTradingPlan, looksLikeTradingRequest } from "./tradingIntent";
import { buildComputerUsePlan, looksLikeComputerUseRequest } from "./agentSpawner";

/**
 * Agent-Host Bot — a single Telegram bot that hosts every user-built CLAWD agent.
 *
 * Usage in Telegram:
 *   /start           — list available agents
 *   /list            — same as /start
 *   /<agentSlug>     — set the agent for this chat
 *   <any message>    — sends to the currently-selected agent
 *
 * Each chat keeps a small in-memory active-agent + conversation history.
 * Inference is paid from our shared pool; per-prompt $CLAWD burn is a TODO
 * (requires a wallet-signing flow on cheshireterminal.ai for chat-side users).
 */

interface ChatState {
  agentSlug: string | null;
  history: { role: "user" | "assistant" | "system"; content: string }[];
}

const HISTORY_LIMIT = 12;
const chatStates = new Map<number, ChatState>();

let bot: Telegraf | null = null;

function getClient(provider: string): OpenAI {
  if (provider === "deepseek" || provider === "openrouter") {
    // openrouter kept as alias → routed to DeepSeek
    return new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
    });
  }
  if (provider === "kimi" || provider === "moonshot") {
    return new OpenAI({
      baseURL: "https://api.moonshot.ai/v1",
      apiKey: process.env.MOONSHOT_API_KEY || "",
    });
  }
  if (provider === "openai") {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  }
  // default: xAI Grok
  return new OpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY || "",
  });
}

function isKimiModel(model: string): boolean {
  return model.startsWith("kimi-") || model.startsWith("moonshot-");
}

async function listAgentsText(): Promise<string> {
  if (!db) return "Agent directory unavailable.";
  const rows = await db
    .select({
      slug: userAgents.slug,
      name: userAgents.name,
      promptCount: userAgents.promptCount,
    })
    .from(userAgents)
    .where(eq(userAgents.status, "active"))
    .limit(50);
  if (!rows.length) {
    return "No agents deployed yet. Be the first — head to cheshireterminal.ai/agents/builder";
  }
  const lines = rows
    .map((r: { slug: string; name: string; promptCount: number }) => `• /${r.slug} — ${r.name} (${r.promptCount} prompts)`)
    .join("\n");
  return `🐾 Cheshire Terminal · Agent Directory\n\n${lines}\n\nTap a /command to start chatting. Build your own at cheshireterminal.ai/agents/builder`;
}

async function loadAgent(slug: string) {
  if (!db) return null;
  const [row] = await db.select().from(userAgents).where(eq(userAgents.slug, slug));
  return row && row.status === "active" ? row : null;
}

function toolConfig(agent: { importedSpec?: unknown }) {
  const imported = (agent.importedSpec ?? {}) as Record<string, any>;
  return (imported.toolConfig ?? {}) as Record<string, boolean>;
}

function enabledToolText(agent: { importedSpec?: unknown }) {
  const tools = toolConfig(agent);
  const labels = [
    tools.xSearch ? "x_search" : "",
    tools.webSearch ? "web_search" : "",
    tools.computerUse ? "computer_use" : "",
    tools.liveTrading ? "live_trading" : "",
    tools.heliusRpc ? "helius_rpc" : "",
    tools.jupiterRouting ? "jupiter" : "",
    tools.dflowRouting ? "dflow" : "",
    tools.phoenixPerps ? "phoenix_perps" : "",
  ].filter(Boolean);
  return labels.length ? labels.join(", ") : "chat";
}

function grokRuntimeTools(agent: { provider: string; importedSpec?: unknown }, text: string) {
  if (agent.provider !== "xai") return undefined;
  const tools = toolConfig(agent);
  const lower = text.toLowerCase();
  const runtimeTools: any[] = [];
  const wantsX = /\b(x|twitter|tweet|tweets|social|sentiment|ct)\b/.test(lower);
  const wantsWeb = /\b(web|search|latest|news|source|sources|research|what happened|current)\b/.test(lower);
  if (tools.xSearch && (wantsX || wantsWeb)) {
    runtimeTools.push({ type: "x_search", enable_image_understanding: true, enable_video_understanding: true });
  }
  if (tools.webSearch && (wantsWeb || (!wantsX && /\b(search|research|current|latest)\b/.test(lower)))) {
    runtimeTools.push({ type: "web_search", enable_image_understanding: true });
  }
  return runtimeTools.length ? runtimeTools : undefined;
}

function truncate(text: string, max = 3800) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function runInference(
  agent: { provider: string; model: string; persona: string; name: string; importedSpec?: unknown },
  history: ChatState["history"],
  runtimeTools?: any[],
): Promise<string> {
  const client = getClient(agent.provider);
  const systemPrompt = `You are ${agent.name}, a persistent CLAWD agent on Cheshire Terminal.\n\n${agent.persona}\n\nRuntime tools enabled: ${enabledToolText(agent)}.\n\nWhen a user asks for live trading, never claim execution. Prepare routes and ask them to review/sign through Cheshire. When a user asks for browser or computer use, use the Cheshire Computer Use handoff. Stay in character. Be concise (under 1500 chars). You live on Telegram via @${process.env.TELEGRAM_AGENT_HOST_BOT_USERNAME || "the agent host bot"}.`;
  const base = {
    model: agent.model,
    messages: [{ role: "system" as const, content: systemPrompt }, ...history],
    max_tokens: 800,
    temperature: 0.85 as number | undefined,
    tools: runtimeTools,
    stream: false as const,
  };
  // Kimi/Moonshot supports extended thinking; remove temperature for those models
  const params = isKimiModel(agent.model)
    ? { ...base, thinking: { type: "enabled" }, temperature: undefined }
    : base;
  const completion = await client.chat.completions.create(params);
  return completion.choices[0]?.message?.content?.trim() ?? "(no response)";
}

export async function startAgentHostBot() {
  if (process.env.TELEGRAM_AGENT_HOST_BOT_ENABLED === "false") {
    console.log("[agent-host-bot] disabled by TELEGRAM_AGENT_HOST_BOT_ENABLED=false");
    return;
  }

  const token = process.env.TELEGRAM_AGENT_HOST_BOT_TOKEN;
  if (!token) {
    console.warn(
      "[agent-host-bot] TELEGRAM_AGENT_HOST_BOT_TOKEN not set — skipping startup.",
    );
    return;
  }
  if (bot) return; // singleton

  bot = new Telegraf(token);

  async function selectAgent(ctx: any, slug: string) {
    const chatId = ctx.chat.id;
    const agent = await loadAgent(slug);
    if (!agent) {
      await ctx.reply(`Unknown agent /${slug}. Try /list to see what's available.`);
      return false;
    }
    chatStates.set(chatId, { agentSlug: slug, history: [] });
    const hello =
      agent.greeting ||
      `Hi, I'm ${agent.name}. ${agent.persona.split("\n")[0].slice(0, 200)}`;
    await ctx.reply(`🐾 Now chatting with *${agent.name}* (/${slug})\n\n${hello}`, {
      parse_mode: "Markdown",
    });
    return true;
  }

  bot.start(async (ctx) => {
    const payload = ((ctx as any).startPayload || ((ctx.message as any)?.text || "").split(/\s+/)[1] || "")
      .trim()
      .toLowerCase();
    if (payload) {
      const selected = await selectAgent(ctx, payload);
      if (selected) return;
    }
    chatStates.set(ctx.chat.id, { agentSlug: null, history: [] });
    await ctx.reply(await listAgentsText());
  });

  bot.command("list", async (ctx) => {
    await ctx.reply(await listAgentsText());
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `Commands:\n/list — show all agents\n/<slug> — switch to that agent in this chat\n/reset — clear conversation memory\n\nAny other message goes to your selected agent.`,
    );
  });

  bot.command("reset", async (ctx) => {
    const s = chatStates.get(ctx.chat.id);
    if (s) s.history = [];
    await ctx.reply("🧹 Conversation cleared. Say something to start fresh.");
  });

  // Catch-all command handler — treat any /word as "switch to agent <word>"
  bot.on("text", async (ctx) => {
    const text = (ctx.message as any).text as string;
    const chatId = ctx.chat.id;

    if (text.startsWith("/")) {
      const slug = text.slice(1).split(/[\s@]/)[0].toLowerCase();
      if (["start", "list", "help", "reset"].includes(slug)) return;
      await selectAgent(ctx, slug);
      return;
    }

    const state = chatStates.get(chatId) ?? { agentSlug: null, history: [] };
    if (!state.agentSlug) {
      await ctx.reply(
        "Pick an agent first — send /list to see who's online, then tap a /slug.",
      );
      return;
    }
    const agent = await loadAgent(state.agentSlug);
    if (!agent) {
      state.agentSlug = null;
      await ctx.reply("That agent is no longer available. /list to pick another.");
      return;
    }

    const tools = toolConfig(agent);
    const telegramId = String(ctx.from?.id ?? "");

    if (tools.liveTrading && looksLikeTradingRequest(text)) {
      const plan = await buildTelegramTradingPlan(text, telegramId);
      if (plan.handled) {
        await ctx.reply(truncate(plan.text), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: plan.buttons ? { inline_keyboard: plan.buttons } : undefined,
        });
        return;
      }
    }

    if (tools.computerUse && looksLikeComputerUseRequest(text)) {
      const plan = buildComputerUsePlan(text);
      await ctx.reply(truncate(plan.text), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: plan.buttons ? { inline_keyboard: plan.buttons } : undefined,
      });
      return;
    }

    state.history.push({ role: "user", content: text });
    if (state.history.length > HISTORY_LIMIT)
      state.history = state.history.slice(-HISTORY_LIMIT);
    chatStates.set(chatId, state);

    try {
      await ctx.sendChatAction("typing");
      const reply = await runInference(agent, state.history, grokRuntimeTools(agent, text));
      state.history.push({ role: "assistant", content: reply });
      await ctx.reply(reply);

      // Increment usage counter (fire-and-forget). TODO: per-prompt CLAWD burn.
      if (db) {
        db.execute(
          sql`UPDATE user_agents SET "promptCount" = "promptCount" + 1 WHERE slug = ${state.agentSlug}`,
        ).catch(() => {});
      }
    } catch (e: unknown) {
      console.error("[agent-host-bot] inference error:", e instanceof Error ? e.message : e);
      await ctx.reply("⚠️ Inference hiccup — try again in a moment.");
    }
  });

  bot.catch((err: unknown) => {
    console.error("[agent-host-bot] uncaught:", err);
  });

  // Telegraf v4: bot.launch() returns a Promise that resolves only when the
  // bot STOPS. Never await it — fire-and-forget and surface errors via .catch.
  bot
    .launch({ dropPendingUpdates: true })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[agent-host-bot] launch failed:", msg);
      const code = (e as { response?: { error_code?: number } })?.response?.error_code;
      if (code === 409 || msg.includes("409")) {
        console.error("[agent-host-bot] polling conflict. Another process or deployment is already polling this bot token.");
      }
      if (code === 404 || msg.includes("404")) {
        console.error("[agent-host-bot] bot token was rejected by Telegram. Check TELEGRAM_AGENT_HOST_BOT_TOKEN.");
      }
      bot = null;
    });
  console.log("[agent-host-bot] launch initiated (polling mode)");
}

export function stopAgentHostBot() {
  if (bot) {
    bot.stop("SIGTERM");
    bot = null;
  }
}
