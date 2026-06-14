/**
 * CLAWD ROUTER — OpenAI-compatible proxy through the configured gateway
 * which routes through OpenRouter with full app attribution.
 *
 * Attribution headers sent to OpenRouter via clawdrouter:
 *   - HTTP-Referer: https://cheshireterminal.ai/ (app URL for rankings)
 *   - X-OpenRouter-Title: Cheshire Terminal        (display name in leaderboards)
 *   - X-OpenRouter-Categories: cli-agent,cloud-agent (marketplace categories)
 */

import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";
import { rateLimit } from "../lib/rate-limit";
import {
  OPENROUTER_APP_CATEGORIES,
  OPENROUTER_APP_TITLE,
  OPENROUTER_APP_URL,
  getOpenRouterAttributionHeaders,
} from "../lib/openrouter-attribution";

const router = Router();

const CLAWDROUTER_BASE = (process.env.CLAWDROUTER_BASE_URL || "").trim().replace(/\/$/, "");

// Attribution headers are forwarded to OpenRouter so this app appears in public
// rankings, model app tabs, and analytics. See: https://openrouter.ai/docs/app-attribution
const FREE_MODEL_ENV_KEYS = [
  ["OPENROUTER_FREE_MODEL1"],
  ["OPENROUTER_FREE_MODEL2", "OPENROUTER_FREEMODEL2"],
  ["OPENROUTER_FREE_MODEL3", "OPENROUTER_FREEMODEL3"],
  ["OPENROUTER_FREE_MODEL4"],
  ["OPENROUTER_FREE_MODEL5"],
  ["OPENROUTER_FREE_MODEL6"],
  ["OPENROUTER_FREE_MODEL7"],
] as const;
const FREE_MODEL_FALLBACKS = [
  {
    id: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    name: "NVIDIA Llama Nemotron Rerank VL 1B",
    description: "Free lightweight NVIDIA ranking and vision-language model.",
  },
  {
    id: "~anthropic/claude-fable-latest",
    name: "Claude Fable Latest",
    description: "Anthropic Fable latest alias for public lightweight creative chats.",
  },
  {
    id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    description: "Anthropic Fable 5 for broader public reasoning coverage.",
  },
  {
    id: "nex-agi/nex-n2-pro:free",
    name: "NEX N2 Pro",
    description: "Free NEX-AGI general-purpose assistant model.",
  },
  {
    id: "sourceful/riverflow-v2.5-fast",
    name: "Riverflow v2.5 Fast",
    description: "Fast Sourceful model for quick public terminal responses.",
  },
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    name: "Nemotron 3.5 Content Safety",
    description: "Free NVIDIA safety-specialized model for guardrail-heavy prompts.",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra 550B",
    description: "Free large NVIDIA reasoning model for longer-form responses.",
  },
] as const;

const freeChatLimiter = rateLimit({
  namespace: "clawdrouter:free-chat",
  windowMs: 60_000,
  max: 20,
  message: "Too many free terminal requests. Please wait a moment.",
});

function getClawdRouterApiKey() {
  return process.env.CLAWDROUTER_API_KEY || process.env.X402_AUTH_TOKEN || "";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatModelName(id: string) {
  const cleaned = id.replace(/^~/, "");
  const slug = cleaned.split("/").pop() ?? cleaned;
  const core = slug.replace(/:free$/i, "");
  return titleCase(core.replace(/[-_]+/g, " "));
}

function getConfiguredFreeModels() {
  const seen = new Set<string>();
  const envConfigured: Array<{ id: string; name: string; description: string }> = [];

  FREE_MODEL_ENV_KEYS.forEach((group, index) => {
    const value = group
      .map((key) => (process.env[key] ?? "").trim())
      .find(Boolean);
    if (!value) return;

    const fallback = FREE_MODEL_FALLBACKS[index];
    envConfigured.push({
      id: value,
      name: fallback?.name ?? formatModelName(value),
      description: fallback?.description ?? "Configured public free model for the Cheshire free terminal.",
    });
  });

  const uniqueConfigured = envConfigured
    .filter((model) => {
      const normalized = model.id.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  if (uniqueConfigured.length > 0) return uniqueConfigured;

  return FREE_MODEL_FALLBACKS.filter((entry) => {
    const normalized = entry.id.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isAllowedFreeModel(model: string) {
  return getConfiguredFreeModels().some((entry) => entry.id === model);
}

function getConfigError() {
  return {
    error: "CLAWD Router is not configured",
    details: "Set CLAWDROUTER_BASE_URL and CLAWDROUTER_API_KEY (or X402_AUTH_TOKEN).",
  };
}

function getClient() {
  const apiKey = getClawdRouterApiKey();
  if (!CLAWDROUTER_BASE || !apiKey) {
    throw new Error(getConfigError().details);
  }
  return new OpenAI({
    apiKey,
    baseURL: CLAWDROUTER_BASE,
    defaultHeaders: getOpenRouterAttributionHeaders(),
  });
}

// ─── Models ────────────────────────────────────────────────────────────────────
router.get("/models", async (_req: Request, res: Response) => {
  try {
    const client = getClient();
    const models = await client.models.list();
    res.json({ configured: true, models: models.data });
  } catch (e: any) {
    console.error("CLAWDROUTER /models error:", e?.message);
    // Fallback: return curated list from known clawdrouter catalog
    res.json({
      configured: false,
      ...(!CLAWDROUTER_BASE || !getClawdRouterApiKey() ? { message: getConfigError().details } : {}),
      models: [
        { id: "clawdrouter/auto", name: "CLAWD Router Auto", description: "Auto-selects best model for your tier" },
        { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
        { id: "openai/gpt-5-nano", name: "GPT-5 Nano", description: "Latest nano model" },
        { id: "xai/grok-4-fast", name: "Grok 4 Fast", description: "Fast Grok inference" },
        { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", description: "DeepSeek V3 chat" },
        { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Google's fast model" },
        { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", description: "Fast Anthropic model" },
        { id: "nvidia/nemotron-super-49b", name: "Nemotron Super 49B", description: "Free NVIDIA model" },
      ],
    });
  }
});

router.get("/free-models", async (_req: Request, res: Response) => {
  const models = getConfiguredFreeModels();
  res.json({
    configured: Boolean(CLAWDROUTER_BASE && getClawdRouterApiKey()),
    defaultModel: models[0]?.id ?? null,
    models,
  });
});

// ─── Status / Health ───────────────────────────────────────────────────────────
router.get("/status", async (_req: Request, res: Response) => {
  const apiKey = getClawdRouterApiKey();
  if (!CLAWDROUTER_BASE || !apiKey) {
    return res.status(503).json({
      status: "error",
      configured: false,
      baseUrl: CLAWDROUTER_BASE || null,
      message: getConfigError().details,
    });
  }
  try {
    const client = getClient();
    const r = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
      temperature: 0.1,
    });
    res.json({
      status: "success",
      configured: true,
      baseUrl: CLAWDROUTER_BASE,
      appAttribution: {
        url: OPENROUTER_APP_URL,
        title: OPENROUTER_APP_TITLE,
        categories: OPENROUTER_APP_CATEGORIES,
      },
      message: "CLAWD Router ready (proxied through OpenRouter)",
      sample: r.choices[0]?.message?.content,
    });
  } catch (e: any) {
    res.json({
      status: "error",
      configured: !!apiKey,
      baseUrl: CLAWDROUTER_BASE,
      keyHint: apiKey ? `${apiKey.slice(0, 8)}...` : "not set",
      message: e?.message || "Status check failed",
    });
  }
});

// ─── Chat completion (standard) ───────────────────────────────────────────────
router.post("/chat", async (req: Request, res: Response) => {
  try {
    if (!CLAWDROUTER_BASE || !getClawdRouterApiKey()) {
      return res.status(503).json(getConfigError());
    }
    const {
      messages,
      model = "openai/gpt-4o-mini",
      temperature = 0.7,
      max_tokens,
      response_format,
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const client = getClient();
    const body: any = { model, messages, temperature };
    if (max_tokens) body.max_tokens = max_tokens;
    if (response_format) body.response_format = response_format;

    const r = await client.chat.completions.create(body);
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: r.model ?? model,
      route: "/api/clawdrouter/chat",
      promptTokens: r.usage?.prompt_tokens,
      completionTokens: r.usage?.completion_tokens,
      totalTokens: r.usage?.total_tokens,
      metadata: { categories: OPENROUTER_APP_CATEGORIES },
    });
    res.json(r);
  } catch (e: any) {
    console.error("CLAWDROUTER /chat error:", e?.response?.data || e?.message);
    res.status(500).json({ error: "CLAWD Router chat failed", details: e?.message });
  }
});

router.post("/free-chat", freeChatLimiter, async (req: Request, res: Response) => {
  try {
    if (!CLAWDROUTER_BASE || !getClawdRouterApiKey()) {
      return res.status(503).json(getConfigError());
    }
    const {
      messages,
      model = getConfiguredFreeModels()[0]?.id,
      temperature = 0.6,
      max_tokens = 900,
      response_format,
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }
    if (!model || !isAllowedFreeModel(model)) {
      return res.status(400).json({ error: "Model is not in the configured free terminal pool" });
    }

    const client = getClient();
    const body: any = { model, messages, temperature, max_tokens };
    if (response_format) body.response_format = response_format;

    const r = await client.chat.completions.create(body);
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: r.model ?? model,
      route: "/api/clawdrouter/free-chat",
      promptTokens: r.usage?.prompt_tokens,
      completionTokens: r.usage?.completion_tokens,
      totalTokens: r.usage?.total_tokens,
      metadata: { categories: OPENROUTER_APP_CATEGORIES, freeMode: true },
    });
    res.json(r);
  } catch (e: any) {
    console.error("CLAWDROUTER /free-chat error:", e?.response?.data || e?.message);
    res.status(500).json({ error: "CLAWD Router free chat failed", details: e?.message });
  }
});

// ─── Chat completion (streaming SSE) ──────────────────────────────────────────
router.post("/chat/stream", async (req: Request, res: Response) => {
  try {
    if (!CLAWDROUTER_BASE || !getClawdRouterApiKey()) {
      return res.status(503).json(getConfigError());
    }
    const {
      messages,
      model = "openai/gpt-4o-mini",
      temperature = 0.7,
      max_tokens,
      response_format,
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const client = getClient();
    const body: any = { model, messages, temperature, stream: true };
    if (max_tokens) body.max_tokens = max_tokens;
    if (response_format) body.response_format = response_format;

    const stream = await client.chat.completions.create(body);
    let streamedText = "";

    for await (const chunk of stream as any) {
      streamedText += chunk.choices?.[0]?.delta?.content ?? "";
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model,
      route: "/api/clawdrouter/chat/stream",
      totalTokens: estimateTokensFromText(JSON.stringify(messages), streamedText),
      metadata: { categories: OPENROUTER_APP_CATEGORIES, streamed: true },
    });
    res.end();
  } catch (e: any) {
    console.error("CLAWDROUTER /chat/stream error:", e?.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "CLAWD Router stream failed", details: e?.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: e?.message })}\n\n`);
      res.end();
    }
  }
});

router.post("/free-chat/stream", freeChatLimiter, async (req: Request, res: Response) => {
  try {
    if (!CLAWDROUTER_BASE || !getClawdRouterApiKey()) {
      return res.status(503).json(getConfigError());
    }
    const {
      messages,
      model = getConfiguredFreeModels()[0]?.id,
      temperature = 0.6,
      max_tokens = 900,
      response_format,
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }
    if (!model || !isAllowedFreeModel(model)) {
      return res.status(400).json({ error: "Model is not in the configured free terminal pool" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const client = getClient();
    const body: any = { model, messages, temperature, max_tokens, stream: true };
    if (response_format) body.response_format = response_format;

    const stream = await client.chat.completions.create(body);
    let streamedText = "";

    for await (const chunk of stream as any) {
      streamedText += chunk.choices?.[0]?.delta?.content ?? "";
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model,
      route: "/api/clawdrouter/free-chat/stream",
      totalTokens: estimateTokensFromText(JSON.stringify(messages), streamedText),
      metadata: { categories: OPENROUTER_APP_CATEGORIES, streamed: true, freeMode: true },
    });
    res.end();
  } catch (e: any) {
    console.error("CLAWDROUTER /free-chat/stream error:", e?.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "CLAWD Router free stream failed", details: e?.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: e?.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
