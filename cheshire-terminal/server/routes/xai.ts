/**
 * XAI (Grok) API routes — Grok 4.3 with full tool support
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import grokAI, {
  GrokModel,
  ChatMessage,
  GrokTool,
  openai,
  generateImage,
  startVideoGeneration,
  getVideoStatus,
} from "../lib/xai/grok";
import { getLogger } from "../lib/util";
import { objectStore, type GalleryItem } from "../lib/objectStore";
import { honchoAddMessages } from "../lib/honcho";
import { TRADING_TOOLS, executeTradingTool } from "./deepseek";

const router = Router();
const logger = getLogger("XAIRoutes");
const XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_MANAGEMENT_BASE_URL = "https://management-api.x.ai/v1";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const completedVideoIds = new Set<string>();
function persistAndBroadcast(req: any, item: GalleryItem) {
  objectStore.saveGalleryItem(item).then(saved => {
    const broadcast = req.app.locals.broadcastGalleryItem as ((i: GalleryItem) => void) | undefined;
    broadcast?.(saved);
  }).catch(err => logger.warn("[Gallery] xAI save error:", err?.message || err));
}

function xaiApiKey() {
  return process.env.XAI_API_KEY || "";
}

function xaiManagementApiKey() {
  return process.env.XAI_MANAGEMENT_API_KEY || process.env.XAI_API_KEY || "";
}

function requireXaiKey(res: Response) {
  const apiKey = xaiApiKey();
  if (!apiKey) {
    res.status(503).json({ success: false, error: "XAI_API_KEY is not configured on the server" });
    return null;
  }
  return apiKey;
}

function requireXaiManagementKey(res: Response) {
  const apiKey = xaiManagementApiKey();
  if (!apiKey) {
    res.status(503).json({ success: false, error: "XAI_MANAGEMENT_API_KEY is not configured on the server" });
    return null;
  }
  return apiKey;
}

async function readJsonOrText(response: globalThis.Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return { text: await response.text() };
}

function xaiJsonHeaders(apiKey: string, promptCacheKey?: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(promptCacheKey ? { "x-grok-conv-id": promptCacheKey } : {}),
  };
}

function appendUploadFile(form: FormData, fieldName: string, file: Express.Multer.File) {
  form.append(
    fieldName,
    new Blob([file.buffer as any], { type: file.mimetype || "application/octet-stream" }),
    file.originalname || "upload",
  );
}

function extractResponseText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("");
}

// ----------------------------------------------------------------
// Status
// ----------------------------------------------------------------
router.get("/ping", (_req, res) => {
  res.json({ status: "success", timestamp: new Date().toISOString() });
});

router.get("/status", async (_req, res) => {
  return res.json({
    status: process.env.XAI_API_KEY ? "success" : "error",
    configured: Boolean(process.env.XAI_API_KEY),
    managementConfigured: Boolean(process.env.XAI_MANAGEMENT_API_KEY || process.env.XAI_API_KEY),
    model: GrokModel.GROK_4_3,
    message: process.env.XAI_API_KEY ? "XAI_API_KEY is configured" : "XAI_API_KEY not set",
    capabilities: {
      chat: true,
      search: true,
      image: true,
      video: true,
      tts: true,
      stt: true,
      files: true,
      collections: Boolean(process.env.XAI_MANAGEMENT_API_KEY || process.env.XAI_API_KEY),
      compaction: true,
      promptCaching: true,
    },
  });
});

router.get("/models", (_req, res) => {
  res.json({
    models: [
      { id: GrokModel.GROK_4_3, name: "Grok 4.3", description: "Flagship reasoning + tools" },
      { id: GrokModel.GROK_MULTI_AGENT, name: "Grok 4.20 Multi-Agent", description: "Realtime multi-agent research" },
      { id: GrokModel.GROK_4, name: "Grok 4", description: "Vision + general" },
      { id: GrokModel.GROK_3, name: "Grok 3 Latest" },
      { id: GrokModel.GROK_3_FAST, name: "Grok 3 Fast" },
      { id: GrokModel.GROK_3_MINI, name: "Grok 3 Mini" },
      { id: GrokModel.GROK_3_MINI_FAST, name: "Grok 3 Mini Fast" },
    ],
    voices: ["eve", "ara", "rex", "sal", "leo"],
    image_model: GrokModel.GROK_IMAGINE_IMAGE,
    video_model: GrokModel.GROK_IMAGINE_VIDEO,
  });
});

// ----------------------------------------------------------------
// Chat completion (with optional tools: web_search / code_execution)
// ----------------------------------------------------------------
const toolSchema = z.object({
  type: z.enum(["web_search", "x_search", "code_execution"]),
}).passthrough();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.enum(["text", "image_url"]),
        text: z.string().optional(),
        image_url: z
          .object({ url: z.string(), detail: z.enum(["low", "high"]).optional() })
          .optional(),
      })
    ),
  ]),
});

const chatSchema = z.object({
  model: z.string().default(GrokModel.GROK_4_3),
  messages: z.array(messageSchema),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  response_format: z.object({ type: z.enum(["json_object", "text"]) }).optional(),
  tools: z.array(toolSchema).optional(),
  reasoning_effort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
  sessionId: z.string().optional(),
  walletAddress: z.string().optional(),
  prompt_cache_key: z.string().min(1).max(160).optional(),
});

const xaiMediaRefSchema = z.object({
  url: z.string().optional(),
  file_id: z.string().optional(),
}).refine((value) => Boolean(value.url || value.file_id), {
  message: "url or file_id is required",
});

const storageOptionsSchema = z.object({
  filename: z.string().min(1).max(160),
  expires_after: z.number().int().min(3600).max(2_592_000).optional(),
  public_url: z.union([
    z.boolean(),
    z.object({
      expires_after: z.number().int().min(3600).max(2_592_000).optional(),
    }),
  ]).optional(),
}).optional();

router.post("/chat", async (req, res) => {
  try {
    const v = chatSchema.parse(req.body);
    const peerId = v.walletAddress || "anon-grok";
    const sessionId = v.sessionId || `grok-${peerId}`;

    // Persist user turn to Honcho (fire-and-forget)
    const userMsgs = v.messages.filter((m) => m.role === "user").slice(-2);
    if (userMsgs.length) {
      honchoAddMessages(sessionId, peerId, userMsgs.map((m) => ({
        role: "user" as const,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }))).catch(() => {});
    }

    const result = await grokAI.generateCompletion({
      model: v.model,
      messages: v.messages as ChatMessage[],
      temperature: v.temperature,
      max_tokens: v.max_tokens,
      response_format: v.response_format,
      tools: v.tools as GrokTool[] | undefined,
      reasoning_effort: v.reasoning_effort,
      promptCacheKey: v.prompt_cache_key || v.sessionId,
    });

    // Persist assistant reply to Honcho (fire-and-forget)
    if (result.content) {
      honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: result.content }]).catch(() => {});
    }

    res.json({ success: true, ...result, response: result.content });
  } catch (e: any) {
    logger.error("chat error:", e);
    res.status(400).json({ success: false, error: e?.message || "chat failed" });
  }
});

router.post("/chat/stream", async (req, res) => {
  try {
    const v = chatSchema.parse(req.body);
    const peerId = v.walletAddress || "anon-grok";
    const sessionId = v.sessionId || `grok-${peerId}`;

    // Persist user turn to Honcho (fire-and-forget)
    const userMsgs = v.messages.filter((m) => m.role === "user").slice(-2);
    if (userMsgs.length) {
      honchoAddMessages(sessionId, peerId, userMsgs.map((m) => ({
        role: "user" as const,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }))).catch(() => {});
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = grokAI.generateCompletionStream({
      model: v.model,
      messages: v.messages as ChatMessage[],
      temperature: v.temperature,
      max_tokens: v.max_tokens,
      tools: v.tools as GrokTool[] | undefined,
      reasoning_effort: v.reasoning_effort,
      promptCacheKey: v.prompt_cache_key || v.sessionId,
    });
    let fullReply = "";
    for await (const part of stream) {
      res.write(`data: ${JSON.stringify(part)}\n\n`);
      // also emit a legacy "chunk" field for older clients consuming text only
      if (part.type === "text") {
        fullReply += (part as { type: "text"; text: string }).text || "";
        res.write(`data: ${JSON.stringify({ chunk: part.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
    // Persist completed assistant reply to Honcho (fire-and-forget)
    if (fullReply) {
      honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: fullReply }]).catch(() => {});
    }
  } catch (e: any) {
    logger.error("stream chat error:", e);
    if (!res.headersSent) {
      res.status(400).json({ success: false, error: e?.message || "stream failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: e?.message })}\n\n`);
      res.end();
    }
  }
});

// ----------------------------------------------------------------
// Grok trading chat using the same readonly/quote tools as /terminal
// ----------------------------------------------------------------
const tradingChatSchema = z.object({
  model: z.string().default(GrokModel.GROK_4_3),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "tool"]),
      content: z.string().default(""),
      tool_call_id: z.string().optional(),
      tool_calls: z.array(z.any()).optional(),
    }),
  ).default([]),
  sessionId: z.string().optional(),
  walletAddress: z.string().optional(),
  prompt_cache_key: z.string().min(1).max(160).optional(),
  max_loops: z.number().int().min(1).max(8).default(5),
});

const GROK_TRADING_TOOLS = TRADING_TOOLS.filter((tool) => {
  const name = (tool as any).function?.name;
  return !["mint_solana_agent", "register_solana_agent"].includes(name);
});

router.post("/trading-chat", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const v = tradingChatSchema.parse(req.body);
    const peerId = v.walletAddress || `grok-trader-${v.sessionId || "anon"}`;
    const sessionId = v.sessionId || `grok-trading-${Date.now().toString(36)}`;
    const lastUser = v.messages.filter((m) => m.role === "user").slice(-1)[0];

    const systemPrompt = [
      "You are Clawd Grok Trading, a natural-language Solana trading analyst inside Cheshire Terminal.",
      "Use the available tools for live token, wallet, priority-fee, Jupiter route, DFlow quote, prediction-market, and news checks.",
      "Never claim a trade is executed. Build or explain routes only; browser wallet confirmation is required for execution.",
      "When asked to buy, sell, swap, route, hedge, or size, call build_jupiter_swap_route or dflow_swap_quote before giving a plan.",
      "When asked for market context, combine get_trending_tokens, get_market_movers, get_crypto_news, and token/wallet tools as needed.",
      "Keep responses concise, cite tool freshness where possible, and call out liquidity, slippage, holder concentration, and invalidation risks.",
    ].join("\n");

    if (lastUser?.content) {
      honchoAddMessages(sessionId, peerId, [{ role: "user", content: lastUser.content }]).catch(() => {});
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...v.messages.map((message) => {
        if (message.role === "tool") {
          return { role: "tool", tool_call_id: message.tool_call_id, content: message.content };
        }
        return {
          role: message.role,
          content: message.content,
          ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
        };
      }),
    ];

    let finalContent = "";
    let loopCount = 0;
    let totalUsage: any = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    while (loopCount < v.max_loops) {
      loopCount++;
      const stream: any = await openai.chat.completions.create({
        model: v.model,
        messages,
        stream: true,
        tools: GROK_TRADING_TOOLS,
        tool_choice: "auto",
      } as any, v.prompt_cache_key || v.sessionId ? {
        headers: { "x-grok-conv-id": v.prompt_cache_key || v.sessionId },
      } : undefined);

      let fullContent = "";
      const toolCalls: any[] = [];
      let finishReason = "";

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        finishReason = choice?.finish_reason || finishReason;
        if (chunk.usage) {
          totalUsage = {
            prompt_tokens: (totalUsage.prompt_tokens || 0) + (chunk.usage.prompt_tokens || 0),
            completion_tokens: (totalUsage.completion_tokens || 0) + (chunk.usage.completion_tokens || 0),
            total_tokens: (totalUsage.total_tokens || 0) + (chunk.usage.total_tokens || 0),
          };
        }
        if (!delta) continue;
        if (delta.content) {
          fullContent += delta.content;
          finalContent += delta.content;
          send("text", { content: delta.content });
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            if (!toolCalls[index]) {
              toolCalls[index] = { id: "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCalls[index].id = tc.id;
            if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
          }
        }
      }

      messages.push({
        role: "assistant",
        content: fullContent || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });

      if (finishReason !== "tool_calls" || toolCalls.length === 0) break;

      for (const tc of toolCalls) {
        const toolName = tc.function?.name || "";
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(tc.function?.arguments || "{}");
        } catch {}
        const toolCallId = tc.id || `grok-tool-${loopCount}-${Math.random().toString(36).slice(2, 8)}`;
        send("tool_call", { id: toolCallId, name: toolName, args: parsedArgs });
        const result = await executeTradingTool(toolName, parsedArgs);
        send("tool_result", { id: toolCallId, name: toolName, result });
        messages.push({ role: "tool", tool_call_id: toolCallId, content: result });
      }
    }

    if (finalContent) {
      honchoAddMessages(sessionId, peerId, [{ role: "assistant", content: finalContent }]).catch(() => {});
    }
    send("done", { sessionId, usage: totalUsage });
  } catch (e: any) {
    logger.error("trading chat error:", e);
    send("error", { error: e?.message || "Trading chat failed" });
  } finally {
    res.end();
  }
});

// ----------------------------------------------------------------
// Web Search / Code Execution shortcuts
// ----------------------------------------------------------------
const toolShortcutSchema = z.object({
  query: z.string(),
  model: z.string().default(GrokModel.GROK_4_3),
  reasoning_effort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
});

router.post("/web-search", async (req, res) => {
  try {
    const { query, model, reasoning_effort } = toolShortcutSchema.parse(req.body);
    const result = await grokAI.generateCompletion({
      model,
      messages: [{ role: "user", content: query }],
      tools: [{ type: "web_search" }],
      reasoning_effort,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message });
  }
});

router.post("/x-search", async (req, res) => {
  try {
    const {
      query,
      model,
      reasoning_effort,
      allowed_x_handles,
      excluded_x_handles,
      from_date,
      to_date,
      enable_image_understanding,
      enable_video_understanding,
    } = toolShortcutSchema.extend({
      allowed_x_handles: z.array(z.string()).max(20).optional(),
      excluded_x_handles: z.array(z.string()).max(20).optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      enable_image_understanding: z.boolean().optional(),
      enable_video_understanding: z.boolean().optional(),
    }).parse(req.body);
    const tool: GrokTool = {
      type: "x_search",
      allowed_x_handles,
      excluded_x_handles,
      from_date,
      to_date,
      enable_image_understanding,
      enable_video_understanding,
    };
    const result = await grokAI.generateCompletion({
      model,
      messages: [{ role: "user", content: query }],
      tools: [tool],
      reasoning_effort,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message });
  }
});

router.post("/code-exec", async (req, res) => {
  try {
    const { query, model, reasoning_effort } = toolShortcutSchema.parse(req.body);
    const result = await grokAI.generateCompletion({
      model,
      messages: [{ role: "user", content: query }],
      tools: [{ type: "code_execution" }],
      reasoning_effort: reasoning_effort ?? "medium",
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message });
  }
});

// ----------------------------------------------------------------
// Responses API: chat with files, code interpreter, collection search, cache
// ----------------------------------------------------------------
const responseRequestSchema = z.object({
  model: z.string().default(GrokModel.GROK_4_3),
  input: z.array(z.any()).min(1),
  tools: z.array(z.any()).optional(),
  previous_response_id: z.string().optional(),
  prompt_cache_key: z.string().min(1).max(160).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().positive().optional(),
  reasoning: z.any().optional(),
  include: z.array(z.string()).optional(),
  store: z.boolean().optional(),
  stream: z.boolean().optional(),
}).passthrough();

function responsesBody(v: z.infer<typeof responseRequestSchema>, stream?: boolean) {
  const { prompt_cache_key, ...body } = v;
  return {
    ...body,
    ...(prompt_cache_key ? { prompt_cache_key } : {}),
    ...(typeof stream === "boolean" ? { stream } : {}),
  };
}

router.post("/responses", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const v = responseRequestSchema.parse(req.body);
    const response = await fetch(`${XAI_BASE_URL}/responses`, {
      method: "POST",
      headers: xaiJsonHeaders(apiKey, v.prompt_cache_key),
      body: JSON.stringify(responsesBody(v, false)),
    });
    const data = await readJsonOrText(response);
    if (!response.ok) return res.status(response.status).json({ success: false, error: data });
    return res.json({ success: true, output_text: extractResponseText(data), response: data });
  } catch (e: any) {
    logger.error("responses error:", e);
    return res.status(400).json({ success: false, error: e?.message || "Responses request failed" });
  }
});

router.post("/responses/stream", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const v = responseRequestSchema.parse(req.body);
    const response = await fetch(`${XAI_BASE_URL}/responses`, {
      method: "POST",
      headers: xaiJsonHeaders(apiKey, v.prompt_cache_key),
      body: JSON.stringify(responsesBody(v, true)),
    });
    if (!response.ok || !response.body) {
      const data = await readJsonOrText(response);
      return res.status(response.status || 502).json({ success: false, error: data });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (e: any) {
    logger.error("responses stream error:", e);
    if (!res.headersSent) {
      return res.status(400).json({ success: false, error: e?.message || "Responses stream failed" });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message || "Responses stream failed" })}\n\n`);
    res.end();
  }
});

const compactSchema = z.object({
  model: z.string().default(GrokModel.GROK_4_3),
  input: z.array(z.any()).min(1),
  prompt_cache_key: z.string().min(1).max(160).optional(),
}).passthrough();

router.post("/responses/compact", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const v = compactSchema.parse(req.body);
    const { prompt_cache_key, ...body } = v;
    const response = await fetch(`${XAI_BASE_URL}/responses/compact`, {
      method: "POST",
      headers: xaiJsonHeaders(apiKey, prompt_cache_key),
      body: JSON.stringify(body),
    });
    const data = await readJsonOrText(response);
    if (!response.ok) return res.status(response.status).json({ success: false, error: data });
    return res.json({ success: true, compaction: data });
  } catch (e: any) {
    logger.error("compaction error:", e);
    return res.status(400).json({ success: false, error: e?.message || "Compaction failed" });
  }
});

// ----------------------------------------------------------------
// Files API and Collections wrappers
// ----------------------------------------------------------------
router.post("/files/upload", upload.single("file"), async (req: Request, res: Response) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;
  if (!req.file) return res.status(400).json({ success: false, error: "file is required" });

  try {
    const form = new FormData();
    form.append("purpose", String(req.body?.purpose || "assistants"));
    if (req.body?.expires_after) form.append("expires_after", String(req.body.expires_after));
    appendUploadFile(form, "file", req.file);

    const response = await fetch(`${XAI_BASE_URL}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form as any,
    });
    const data = await readJsonOrText(response);
    if (!response.ok) return res.status(response.status).json({ success: false, error: data });
    return res.json({ success: true, file: data });
  } catch (e: any) {
    logger.error("file upload error:", e);
    return res.status(500).json({ success: false, error: e?.message || "File upload failed" });
  }
});

router.get("/files", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const url = new URL(`${XAI_BASE_URL}/files`);
    for (const key of ["after", "limit", "order", "purpose", "filter"]) {
      const value = req.query[key];
      if (typeof value === "string" && value) url.searchParams.set(key, value);
    }
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || "File list failed" });
  }
});

router.get("/files/:fileId/content", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const response = await fetch(`${XAI_BASE_URL}/files/${encodeURIComponent(req.params.fileId)}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const data = await readJsonOrText(response);
      return res.status(response.status).json({ success: false, error: data });
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    const buf = Buffer.from(await response.arrayBuffer());
    return res.end(buf);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || "File content fetch failed" });
  }
});

router.post("/files/:fileId/public-url", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const body = z.object({
      expires_after: z.number().int().min(3600).max(2_592_000).optional(),
    }).parse(req.body || {});
    const response = await fetch(`${XAI_BASE_URL}/files/${encodeURIComponent(req.params.fileId)}/public-url`, {
      method: "POST",
      headers: xaiJsonHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "Public URL creation failed" });
  }
});

router.post("/files/:fileId/public-url/revoke", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const response = await fetch(`${XAI_BASE_URL}/files/${encodeURIComponent(req.params.fileId)}/public-url/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || "Public URL revoke failed" });
  }
});

router.get("/files/:fileId", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const response = await fetch(`${XAI_BASE_URL}/files/${encodeURIComponent(req.params.fileId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || "File metadata fetch failed" });
  }
});

const collectionFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  inject_into_chunk: z.boolean().optional(),
});

router.get("/collections", async (_req, res) => {
  const apiKey = requireXaiManagementKey(res);
  if (!apiKey) return;

  try {
    const response = await fetch(`${XAI_MANAGEMENT_BASE_URL}/collections`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || "Collection list failed" });
  }
});

router.post("/collections", async (req, res) => {
  const apiKey = requireXaiManagementKey(res);
  if (!apiKey) return;

  try {
    const body = z.object({
      collection_name: z.string().min(1),
      field_definitions: z.array(collectionFieldDefinitionSchema).optional(),
    }).parse(req.body || {});
    const response = await fetch(`${XAI_MANAGEMENT_BASE_URL}/collections`, {
      method: "POST",
      headers: xaiJsonHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "Collection creation failed" });
  }
});

router.post("/collections/:collectionId/documents", upload.single("file"), async (req: Request, res: Response) => {
  const apiKey = requireXaiManagementKey(res);
  if (!apiKey) return;
  if (!req.file) return res.status(400).json({ success: false, error: "file is required" });

  try {
    const form = new FormData();
    form.append("name", String(req.body?.name || req.file.originalname || "document"));
    form.append("content_type", String(req.body?.content_type || req.file.mimetype || "application/octet-stream"));
    if (req.body?.fields) form.append("fields", typeof req.body.fields === "string" ? req.body.fields : JSON.stringify(req.body.fields));
    appendUploadFile(form, "data", req.file);

    const response = await fetch(`${XAI_MANAGEMENT_BASE_URL}/collections/${encodeURIComponent(req.params.collectionId)}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form as any,
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    logger.error("collection document upload error:", e);
    return res.status(500).json({ success: false, error: e?.message || "Collection document upload failed" });
  }
});

router.post("/documents/search", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const body = z.object({
      query: z.string().min(1),
      source: z.object({ collection_ids: z.array(z.string()).min(1) }),
      filter: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(req.body || {});
    const response = await fetch(`${XAI_BASE_URL}/documents/search`, {
      method: "POST",
      headers: xaiJsonHeaders(apiKey),
      body: JSON.stringify(body),
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "Document search failed" });
  }
});

// ----------------------------------------------------------------
// Vision
// ----------------------------------------------------------------
router.post("/vision", async (req, res) => {
  try {
    const { image_url, prompt, model } = z
      .object({
        image_url: z.string(),
        prompt: z.string().optional(),
        model: z.string().optional(),
      })
      .parse(req.body);
    const analysis = await grokAI.analyzeImage(
      image_url,
      prompt || "Analyze this image and describe what you see in detail.",
      model
    );
    res.json({ success: true, analysis });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message });
  }
});

router.post("/analyze-image", async (req, res) => {
  try {
    const { base64Image, prompt, model = GrokModel.GROK_VISION, max_tokens = 1500 } =
      req.body;
    const imageUrl = base64Image.startsWith("data:")
      ? base64Image
      : `data:image/jpeg;base64,${base64Image}`;
    const r = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a financial and blockchain data analysis expert. Analyze screenshots with precise attention to detail.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: prompt || "Analyze this image." },
          ] as any,
        },
      ],
      max_tokens,
      temperature: 0.3,
    });
    const analysis = r.choices[0]?.message?.content || "No analysis available";
    res.json({ success: true, choices: [{ message: { content: analysis } }] });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message });
  }
});

// ----------------------------------------------------------------
// JSON Generation
// ----------------------------------------------------------------
router.post("/json", async (req, res) => {
  try {
    const { prompt, system_prompt } = z
      .object({ prompt: z.string(), system_prompt: z.string().optional() })
      .parse(req.body);
    const data = await grokAI.generateJson(prompt, system_prompt);
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message });
  }
});

// ----------------------------------------------------------------
// Image Generation (grok-imagine-image-quality)
// ----------------------------------------------------------------
router.post("/image-gen", async (req, res) => {
  try {
    const opts = z
      .object({
        prompt: z.string(),
        n: z.number().int().min(1).max(4).optional(),
        aspect_ratio: z.string().optional(),
        resolution: z.enum(["1k", "2k"]).optional(),
        response_format: z.enum(["url", "b64_json"]).optional(),
        image_url: z.string().optional(),
        image_urls: z.array(z.string()).optional(),
        image_file_id: z.string().optional(),
        image_file_ids: z.array(z.string()).optional(),
        images: z.array(xaiMediaRefSchema).optional(),
        storage_options: storageOptionsSchema,
        creator: z.string().optional(),
        save_to_feed: z.boolean().default(true),
      })
      .parse(req.body);
    const images = await generateImage(opts);

    // Persist every generated image to the realtime feed (object store + WS broadcast)
    if (opts.save_to_feed !== false) {
      const isEdit = !!opts.image_url || !!opts.image_urls?.length || !!opts.image_file_id || !!opts.image_file_ids?.length || !!opts.images?.length;
      for (const img of images) {
        if (!img.url && !img.b64_json) continue;
        const sourceUrl = img.url || `data:image/png;base64,${img.b64_json}`;
        const item = objectStore.makeItem({
          type: "image",
          title: opts.prompt.slice(0, 70),
          prompt: opts.prompt,
          sourceUrl,
          model: GrokModel.GROK_IMAGINE_IMAGE,
          creator: opts.creator,
          metadata: {
            mode: isEdit ? "image-edit" : "text-to-image",
            aspect_ratio: opts.aspect_ratio,
            resolution: opts.resolution,
            ref_images: opts.image_urls || (opts.image_url ? [opts.image_url] : undefined),
            ref_file_ids: opts.image_file_ids || (opts.image_file_id ? [opts.image_file_id] : undefined),
            file_output: img.file_output,
          },
        });
        persistAndBroadcast(req, item);
      }
    }

    res.json({ success: true, images });
  } catch (e: any) {
    logger.error("image-gen error:", e);
    res.status(500).json({ success: false, error: e?.message });
  }
});

// ----------------------------------------------------------------
// Video Generation (grok-imagine-video) — async
// ----------------------------------------------------------------
// Stash original request opts per requestId so the status route can persist
// the right metadata (prompt, mode, refs) when the video completes.
const videoJobMeta = new Map<string, {
  prompt: string;
  mode?: "edit" | "extend" | "reference";
  refImage?: string;
  refImages?: string[];
  refVideo?: string;
  refImageFileId?: string;
  refImageFileIds?: string[];
  refVideoFileId?: string;
  creator?: string;
  aspect_ratio?: string;
  resolution?: string;
}>();

router.post("/video-gen", async (req, res) => {
  try {
    const opts = z
      .object({
        prompt: z.string(),
        duration: z.number().int().min(1).max(15).optional(),
        aspect_ratio: z
          .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"])
          .optional(),
        resolution: z.enum(["480p", "720p"]).optional(),
        image_url: z.string().optional(),
        image_file_id: z.string().optional(),
        video_url: z.string().optional(),
        video_file_id: z.string().optional(),
        reference_image_urls: z.array(z.string()).optional(),
        reference_image_file_ids: z.array(z.string()).optional(),
        reference_images: z.array(xaiMediaRefSchema).optional(),
        storage_options: storageOptionsSchema,
        mode: z.enum(["edit", "extend", "reference"]).optional(),
        creator: z.string().optional(),
      })
      .parse(req.body);
    const { request_id } = await startVideoGeneration(opts);
    videoJobMeta.set(request_id, {
      prompt: opts.prompt,
      mode: opts.mode,
      refImage: opts.image_url,
      refImages: opts.reference_image_urls,
      refVideo: opts.video_url,
      refImageFileId: opts.image_file_id,
      refImageFileIds: opts.reference_image_file_ids,
      refVideoFileId: opts.video_file_id,
      creator: opts.creator,
      aspect_ratio: opts.aspect_ratio,
      resolution: opts.resolution,
    });
    res.json({ requestId: request_id, status: "pending" });
  } catch (e: any) {
    logger.error("video-gen error:", e);
    res.status(500).json({ error: e?.message });
  }
});

router.get("/video-status/:requestId", async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const data = await getVideoStatus(requestId);

    // When done, persist to object store + emit WS feed event (once)
    if (data.status === "done" && data.video?.url && !completedVideoIds.has(requestId)) {
      completedVideoIds.add(requestId);
      const meta = videoJobMeta.get(requestId);
      const item = objectStore.makeItem({
        type: "video",
        title: meta?.prompt?.slice(0, 70) || "Grok Video",
        prompt: meta?.prompt,
        sourceUrl: data.video.url,
        model: data.model || GrokModel.GROK_IMAGINE_VIDEO,
        creator: meta?.creator,
        metadata: {
          mode: meta?.mode || (meta?.refImage ? "image-to-video" : "text-to-video"),
          duration: data.video.duration,
          aspect_ratio: meta?.aspect_ratio,
          resolution: meta?.resolution,
          ref_image: meta?.refImage,
          ref_images: meta?.refImages,
          ref_video: meta?.refVideo,
          ref_image_file_id: meta?.refImageFileId,
          ref_image_file_ids: meta?.refImageFileIds,
          ref_video_file_id: meta?.refVideoFileId,
          file_output: data.video.file_output,
        },
      });
      persistAndBroadcast(req, item);
      videoJobMeta.delete(requestId);
    }

    res.json({
      status: data.status,
      videoUrl: data.video?.url,
      duration: data.video?.duration,
      file_output: data.video?.file_output,
      publicUrl: data.video?.file_output?.public_url,
      model: data.model,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ----------------------------------------------------------------
// Speech: STT, TTS, voices, and ephemeral realtime voice sessions
// ----------------------------------------------------------------
router.post("/stt", upload.single("file"), async (req: Request, res: Response) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;
  if (!req.file) return res.status(400).json({ success: false, error: "file is required" });

  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(req.body || {})) {
      if (typeof value === "string" && value) form.append(key, value);
    }
    appendUploadFile(form, "file", req.file);

    const response = await fetch(`${XAI_BASE_URL}/stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form as any,
    });
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (e: any) {
    logger.error("stt error:", e);
    return res.status(500).json({ success: false, error: e?.message || "Speech transcription failed" });
  }
});

const ttsSchema = z.object({
  text: z.string().min(1).max(15_000),
  voice_id: z.string().min(1).default("eve"),
  language: z.string().min(2).max(16).default("en"),
  speed: z.number().min(0.7).max(1.5).optional(),
  optimize_streaming_latency: z.number().int().min(0).max(2).optional(),
  text_normalization: z.boolean().optional(),
  with_timestamps: z.boolean().optional(),
  output_format: z.object({
    type: z.enum(["mp3", "wav", "pcm", "mulaw", "alaw"]).optional(),
    sample_rate: z.number().int().optional(),
    bit_rate: z.number().int().optional(),
  }).optional(),
});

router.post("/tts", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const body = ttsSchema.parse(req.body || {});
    const r = await fetch(`${XAI_BASE_URL}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    res.setHeader("Content-Type", r.headers.get("content-type") || (body.with_timestamps ? "application/json" : "audio/mpeg"));
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "TTS failed" });
  }
});

router.get("/tts/voices", async (_req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const r = await fetch(`${XAI_BASE_URL}/tts/voices`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return res.json({ voices: [] });
    res.json(await r.json());
  } catch {
    res.json({ voices: [] });
  }
});

// ----------------------------------------------------------------
// Ephemeral session token for browser voice agent
// ----------------------------------------------------------------
router.post("/session", async (req, res) => {
  const apiKey = requireXaiKey(res);
  if (!apiKey) return;

  try {
    const {
      expires_seconds = 300,
      model = "grok-voice-latest",
      conversation_id,
      voice = "eve",
      instructions,
    } = z.object({
      expires_seconds: z.number().int().min(30).max(600).optional(),
      model: z.string().optional(),
      conversation_id: z.string().optional(),
      voice: z.string().optional(),
      instructions: z.string().optional(),
    }).parse(req.body || {});
    const r = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: expires_seconds } }),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    const secret = await r.json();
    const wsUrl = new URL(`${XAI_BASE_URL.replace("https://", "wss://")}/realtime`);
    wsUrl.searchParams.set("model", model);
    if (conversation_id) wsUrl.searchParams.set("conversation_id", conversation_id);
    res.json({
      ...secret,
      websocket_url: wsUrl.toString(),
      protocol_prefix: "xai-client-secret.",
      recommended_session: {
        voice,
        instructions: instructions || "You are Clawd Grok, a concise voice agent for Cheshire Terminal.",
        turn_detection: { type: "server_vad" },
        resumption: { enabled: true },
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

export default router;
