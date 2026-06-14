import fs from "fs";
import path from "path";
import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { rateLimit } from "../lib/rate-limit";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";
import {
  OPENROUTER_API_BASE_URL,
  OPENROUTER_APP_CATEGORIES,
  OPENROUTER_APP_TITLE,
  OPENROUTER_APP_URL,
  getOpenRouterAttributionHeaders,
} from "../lib/openrouter-attribution";

const router = Router();

const FREE_ROUTER_MODEL = "openrouter/free";
const BODY_BUILDER_MODEL = "openrouter/bodybuilder";
const AUTO_ROUTER_MODEL = "openrouter/auto";
const AUTO_ROUTER_ENABLED = (process.env.FREE_TERMINAL_ALLOW_AUTO || "").trim().toLowerCase() === "true";
const BODY_BUILDER_ENABLED = (process.env.FREE_TERMINAL_ALLOW_BODY_BUILDER || "").trim().toLowerCase() === "true";
const FREE_MODEL_ENV_KEYS = [
  ["OPENROUTER_FREE_MODEL1"],
  ["OPENROUTER_FREE_MODEL2", "OPENROUTER_FREEMODEL2"],
  ["OPENROUTER_FREE_MODEL3", "OPENROUTER_FREEMODEL3"],
  ["OPENROUTER_FREE_MODEL4"],
  ["OPENROUTER_FREE_MODEL5"],
  ["OPENROUTER_FREE_MODEL6"],
  ["OPENROUTER_FREE_MODEL7"],
] as const;
const CONFIGURED_FREE_MODEL_FALLBACKS = [
  {
    id: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    label: "Nemotron Rerank VL 1B",
    aliases: ["free1", "rerank", "vl"],
    description: "Configured free lightweight NVIDIA ranking and vision-language model.",
  },
  {
    id: "~anthropic/claude-fable-latest",
    label: "Claude Fable Latest",
    aliases: ["free2", "fable", "fable-latest"],
    description: "Configured public Anthropic Fable alias for lightweight creative chats.",
  },
  {
    id: "anthropic/claude-fable-5",
    label: "Claude Fable 5",
    aliases: ["free3", "fable-5"],
    description: "Configured public Anthropic Fable model for broader reasoning coverage.",
  },
  {
    id: "nex-agi/nex-n2-pro:free",
    label: "NEX N2 Pro Free",
    aliases: ["free4", "nex"],
    description: "Configured free NEX-AGI general-purpose assistant model.",
  },
  {
    id: "sourceful/riverflow-v2.5-fast",
    label: "Riverflow v2.5 Fast",
    aliases: ["free5", "riverflow"],
    description: "Configured fast Sourceful model for quick public terminal responses.",
  },
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    label: "Nemotron 3.5 Content Safety",
    aliases: ["free6", "safety"],
    description: "Configured free NVIDIA safety-specialized model for guardrail-heavy prompts.",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra 550B",
    aliases: ["free7", "ultra", "nemotron-ultra"],
    description: "Configured free large NVIDIA reasoning model for longer-form responses.",
  },
] as const;

type FreeModelOption = {
  id: string;
  label: string;
  description: string;
  kind: "router" | "variant" | "configured";
  docsUrl: string;
  aliases?: string[];
  configured?: boolean;
};

function getConfiguredFreeModels(): FreeModelOption[] {
  const seen = new Set<string>();
  const models: FreeModelOption[] = [];

  FREE_MODEL_ENV_KEYS.forEach((group, index) => {
    const value = group
      .map((key) => (process.env[key] ?? "").trim())
      .find(Boolean);
    const fallback = CONFIGURED_FREE_MODEL_FALLBACKS[index];
    const id = value || fallback.id;
    const normalized = id.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    models.push({
      id,
      label: fallback.label,
      description: fallback.description,
      aliases: [...fallback.aliases],
      kind: "configured",
      configured: Boolean(value),
      docsUrl: "https://openrouter.ai/docs/guides/routing/model-variants/free",
    });
  });

  return models;
}

function getPublicModelOptions(): FreeModelOption[] {
  const seen = new Set<string>();
  const models: FreeModelOption[] = [
    {
      id: FREE_ROUTER_MODEL,
      label: "Free Models Router",
      description: "Zero-cost router that picks an available free model for each turn.",
      kind: "router",
      aliases: ["free", "router"],
      docsUrl: "https://openrouter.ai/docs/guides/routing/routers/free-router",
    },
    ...getConfiguredFreeModels(),
    ...(BODY_BUILDER_ENABLED
      ? [{
          id: BODY_BUILDER_MODEL,
          label: "Body Builder",
          description: "Request-body planner for generating parallel OpenRouter calls from natural language.",
          kind: "router" as const,
          aliases: ["builder", "bodybuilder"],
          docsUrl: "https://openrouter.ai/docs/guides/routing/routers/body-builder",
        }]
      : []),
    ...(AUTO_ROUTER_ENABLED
      ? [{
          id: AUTO_ROUTER_MODEL,
          label: "Auto Router",
          description: "Smart routing with session stickiness for multi-turn chats.",
          kind: "router" as const,
          aliases: ["auto"],
          docsUrl: "https://openrouter.ai/docs/guides/routing/routers/auto-router",
        }]
      : []),
  ];

  return models.filter((model) => {
    const normalized = model.id.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isPublicSafeModel(model: string) {
  const normalized = model.trim();
  const configured = getConfiguredFreeModels().some((option) => option.id === normalized);
  return (
    normalized === FREE_ROUTER_MODEL ||
    configured ||
    (BODY_BUILDER_ENABLED && normalized === BODY_BUILDER_MODEL) ||
    normalized.endsWith(":free") ||
    (AUTO_ROUTER_ENABLED && normalized === AUTO_ROUTER_MODEL)
  );
}

function assertPublicSafeModel(model: string) {
  const normalized = model.trim();
  if (!isPublicSafeModel(normalized)) {
    const allowed = BODY_BUILDER_ENABLED
      ? "openrouter/free, configured OPENROUTER_FREE_MODEL* IDs, openrouter/bodybuilder, or an explicit :free model variant"
      : "openrouter/free, configured OPENROUTER_FREE_MODEL* IDs, or an explicit :free model variant";
    throw new Error(
      `Model is not allowed on public /free. Use ${allowed}.`,
    );
  }
  return normalized;
}

const DEFAULT_CHAT_MODEL = "nex-agi/nex-n2-pro:free";
const configuredDefaultModel = (process.env.FREE_TERMINAL_MODEL || DEFAULT_CHAT_MODEL).trim() || DEFAULT_CHAT_MODEL;
const DEFAULT_MODEL = isPublicSafeModel(configuredDefaultModel) ? configuredDefaultModel : FREE_ROUTER_MODEL;

const requestLimiter = rateLimit({
  namespace: "free-terminal:chat",
  windowMs: 60_000,
  max: 20,
  message: "Free terminal is moving too fast right now. Wait a few seconds and try again.",
});

const FREE_MODEL_OPTIONS = getPublicModelOptions();

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(20_000),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(32),
  model: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(4_000).optional(),
});

type SpinnerPack = {
  slug: string;
  title: string;
  verbCount: number;
  sampleVerbs: string[];
  verbs: string[];
  attribution: string | null;
  source: string | null;
};

function getOpenRouterApiKey() {
  return (process.env.OPENROUTER_API_KEY || process.env.CLAWDROUTER_OPENROUTER_API_KEY || "").trim();
}

function getOpenRouterClient() {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_API_BASE_URL,
    defaultHeaders: getOpenRouterAttributionHeaders(),
  });
}

async function runFreeTerminalCompletion(args: {
  client: OpenAI;
  requestedModel: string;
  messages: z.infer<typeof chatRequestSchema>["messages"];
  sessionId?: string;
  temperature: number;
  max_tokens: number;
}) {
  const { client, requestedModel, messages, sessionId, temperature, max_tokens } = args;
  return client.chat.completions.create({
    model: requestedModel,
    temperature,
    max_tokens,
    session_id: sessionId,
    messages: [{ role: "system", content: freeTerminalSystemPrompt() }, ...messages],
  } as any);
}

function spinnerDirectoryCandidates() {
  return [
    path.join(process.cwd(), "client/public/free-terminal/spinners"),
    path.join(process.cwd(), "dist/public/free-terminal/spinners"),
  ];
}

function resolveSpinnerDirectory() {
  return spinnerDirectoryCandidates().find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || null;
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function readSpinnerPack(slug: string): SpinnerPack | null {
  const dir = resolveSpinnerDirectory();
  if (!dir) return null;
  const filePath = path.join(dir, `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    spinnerVerbs?: { verbs?: string[] };
    _attribution?: string;
    _source?: string;
  };
  const verbs = Array.isArray(raw.spinnerVerbs?.verbs)
    ? raw.spinnerVerbs?.verbs.filter((verb): verb is string => typeof verb === "string" && verb.trim().length > 0)
    : [];

  return {
    slug,
    title: titleFromSlug(slug),
    verbCount: verbs.length,
    sampleVerbs: verbs.slice(0, 4),
    verbs,
    attribution: typeof raw._attribution === "string" ? raw._attribution : null,
    source: typeof raw._source === "string" ? raw._source : null,
  };
}

function listSpinnerPacks() {
  const dir = resolveSpinnerDirectory();
  if (!dir) return [] as SpinnerPack[];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== "metadata.json")
    .map((file) => readSpinnerPack(file.replace(/\.json$/i, "")))
    .filter((pack): pack is SpinnerPack => Boolean(pack))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function freeTerminalSystemPrompt() {
  return [
    "You are Cheshire Free, the public terminal at cheshireterminal.ai/free.",
    "Be fast, playful, clear, and concise.",
    "Prefer terminal-native formatting: short paragraphs, flat bullets, tiny tables, and concrete commands.",
    "Avoid long essays unless the user explicitly asks for depth.",
    "If the user asks about models, mention OpenRouter free routing, :free variants, and openrouter/auto when useful.",
  ].join(" ");
}

router.get("/status", async (req: Request, res: Response) => {
  const apiKey = getOpenRouterApiKey();
  const spinnerPacks = listSpinnerPacks();
  if (!apiKey) {
    return res.status(503).json({
      configured: false,
      defaultModel: DEFAULT_MODEL,
      models: FREE_MODEL_OPTIONS,
      allowAutoRouter: AUTO_ROUTER_ENABLED,
      allowBodyBuilder: BODY_BUILDER_ENABLED,
      configuredFreeModelCount: getConfiguredFreeModels().length,
      spinnerPackCount: spinnerPacks.length,
      message: "OPENROUTER_API_KEY is not configured",
    });
  }

  try {
    const client = getOpenRouterClient();
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
      temperature: 0.1,
    });
    return res.json({
      configured: true,
      baseUrl: OPENROUTER_API_BASE_URL,
      appUrl: OPENROUTER_APP_URL,
      appAttribution: {
        url: OPENROUTER_APP_URL,
        title: OPENROUTER_APP_TITLE,
        categories: OPENROUTER_APP_CATEGORIES,
      },
      defaultModel: DEFAULT_MODEL,
      models: FREE_MODEL_OPTIONS,
      allowAutoRouter: AUTO_ROUTER_ENABLED,
      allowBodyBuilder: BODY_BUILDER_ENABLED,
      configuredFreeModelCount: getConfiguredFreeModels().length,
      spinnerPackCount: spinnerPacks.length,
      sample: response.choices[0]?.message?.content || "",
      routedModel: response.model || DEFAULT_MODEL,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(502).json({
      configured: true,
      defaultModel: DEFAULT_MODEL,
      models: FREE_MODEL_OPTIONS,
      allowAutoRouter: AUTO_ROUTER_ENABLED,
      allowBodyBuilder: BODY_BUILDER_ENABLED,
      configuredFreeModelCount: getConfiguredFreeModels().length,
      spinnerPackCount: spinnerPacks.length,
      message,
    });
  }
});

router.get("/models", (_req: Request, res: Response) => {
  res.json({
    defaultModel: DEFAULT_MODEL,
    models: FREE_MODEL_OPTIONS,
    allowAutoRouter: AUTO_ROUTER_ENABLED,
    allowBodyBuilder: BODY_BUILDER_ENABLED,
    configuredFreeModelCount: getConfiguredFreeModels().length,
  });
});

router.get("/spinners", (_req: Request, res: Response) => {
  const packs = listSpinnerPacks();
  res.json({
    count: packs.length,
    packs,
  });
});

router.get("/spinners/:slug", (req: Request, res: Response) => {
  const pack = readSpinnerPack(String(req.params.slug || ""));
  if (!pack) {
    return res.status(404).json({ error: "Spinner pack not found" });
  }
  res.json(pack);
});

router.post("/chat", requestLimiter, async (req: Request, res: Response) => {
  try {
    const { messages, model = DEFAULT_MODEL, sessionId, temperature = 0.65, max_tokens = 700 } = chatRequestSchema.parse(req.body);
    const requestedModel = assertPublicSafeModel(model);
    const client = getOpenRouterClient();
    const response = await runFreeTerminalCompletion({
      client,
      requestedModel,
      messages,
      sessionId,
      temperature,
      max_tokens,
    });

    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "free-terminal",
      model: response.model || requestedModel,
      route: "/api/free-terminal/chat",
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      metadata: { requestedModel, sessionId: sessionId || null },
    });

    res.json({
      content: response.choices[0]?.message?.content || "",
      model: response.model || requestedModel,
      sessionId: sessionId || null,
      usage: response.usage || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Free terminal chat failed", details: message });
  }
});

router.post("/chat/stream", requestLimiter, async (req: Request, res: Response) => {
  try {
    const { messages, model = DEFAULT_MODEL, sessionId, temperature = 0.65, max_tokens = 700 } = chatRequestSchema.parse(req.body);
    const requestedModel = assertPublicSafeModel(model);
    const client = getOpenRouterClient();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.write(`data: ${JSON.stringify({ type: "meta", requestedModel, sessionId: sessionId || null })}\n\n`);

    const stream = await client.chat.completions.create({
      model: requestedModel,
      temperature,
      max_tokens,
      session_id: sessionId,
      stream: true,
      messages: [{ role: "system", content: freeTerminalSystemPrompt() }, ...messages],
    } as any);

    let resolvedModel = model;
    let streamedText = "";

    for await (const chunk of stream as unknown as AsyncIterable<any>) {
      if (typeof chunk?.model === "string" && chunk.model.trim()) {
        resolvedModel = chunk.model;
      }
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (!delta) continue;
      streamedText += delta;
      res.write(`data: ${JSON.stringify({ type: "token", content: delta, model: resolvedModel })}\n\n`);
    }

    if (!streamedText.trim()) {
      const completion = await runFreeTerminalCompletion({
        client,
        requestedModel,
        messages,
        sessionId,
        temperature,
        max_tokens,
      });
      if (typeof completion?.model === "string" && completion.model.trim()) {
        resolvedModel = completion.model;
      }
      const fallbackText = completion.choices?.[0]?.message?.content || "";
      if (fallbackText) {
        streamedText = fallbackText;
        res.write(`data: ${JSON.stringify({ type: "token", content: fallbackText, model: resolvedModel })}\n\n`);
      }
    }

    if (!streamedText.trim()) {
      streamedText = [
        "The selected free OpenRouter model returned an empty response.",
        "Try again, or switch models with `model free4`, `model free5`, or another `:free` model.",
      ].join(" ");
      res.write(`data: ${JSON.stringify({ type: "token", content: streamedText, model: resolvedModel })}\n\n`);
    }

    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "free-terminal",
      model: resolvedModel,
      route: "/api/free-terminal/chat/stream",
      totalTokens: estimateTokensFromText(
        JSON.stringify(messages.map((message) => message.content)),
        streamedText,
      ),
      metadata: { requestedModel, sessionId: sessionId || null, streamed: true },
    });

    res.write(`data: ${JSON.stringify({ type: "done", model: resolvedModel, sessionId: sessionId || null })}\n\n`);
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Free terminal stream failed", details: message });
    }
    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    res.end();
  }
});

export default router;
