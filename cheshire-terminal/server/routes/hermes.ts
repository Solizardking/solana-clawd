/**
 * Hermes (Nous Research) API routes
 * OpenAI-compatible inference at https://inference-api.nousresearch.com/v1
 * Models: Hermes-4.3-36B, Hermes-4-70B, Hermes-4-405B
 */

import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";

const router = Router();

const NOUS_BASE = "https://inference-api.nousresearch.com/v1";

function getClient() {
  return new OpenAI({
    apiKey: process.env.HERMES_API_KEY || "",
    baseURL: NOUS_BASE,
  });
}

// ─── Models ────────────────────────────────────────────────────────────────────
router.get("/models", (_req: Request, res: Response) => {
  res.json({
    models: [
      { id: "Hermes-4.3-36B", name: "Hermes 4.3 36B", description: "Flagship reasoning model" },
      { id: "Hermes-4-70B", name: "Hermes 4 70B", description: "Full-size reasoning" },
      { id: "Hermes-4-405B", name: "Hermes 4 405B", description: "Max intelligence with MoE" },
    ],
  });
});

// ─── Status / Health ───────────────────────────────────────────────────────────
router.get("/status", async (_req: Request, res: Response) => {
  try {
    if (!process.env.HERMES_API_KEY) {
      return res.json({
        status: "error",
        configured: false,
        message: "HERMES_API_KEY not set",
      });
    }
    // Quick ping to verify the API works
    const openai = getClient();
    const r = await openai.chat.completions.create({
      model: "Hermes-4.3-36B",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
      temperature: 0.1,
    });
    res.json({
      status: "success",
      configured: true,
      model: "Hermes-4.3-36B",
      message: "Nous Research Hermes ready",
      sample: r.choices[0]?.message?.content,
    });
  } catch (e: any) {
    res.json({
      status: "error",
      configured: !!process.env.HERMES_API_KEY,
      message: e?.message || "Status check failed",
    });
  }
});

// ─── Chat Completions (streaming SSE) ─────────────────────────────────────────
router.post("/chat", async (req: Request, res: Response) => {
  const {
    messages = [],
    model = "Hermes-4.3-36B",
    temperature,
    max_tokens,
    reasoning = false,
  } = req.body;

  if (!process.env.HERMES_API_KEY) {
    return res.status(400).json({ error: "HERMES_API_KEY not configured" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const openai = getClient();

    // Build system prompt with optional reasoning preamble
    let finalMessages = [...messages];
    if (reasoning) {
      // Prepend reasoning instructions for <think> tag output
      const reasoningSystemPrompt = {
        role: "system" as const,
        content: `You are a helpful AI assistant. When asked a complex question, reason step-by-step before giving your final answer. Enclose your chain-of-thought reasoning inside <think>...</think> tags. Example:

<think>
Let me break this down step by step.
1. First, I need to understand...
2. Then consider...
3. Therefore...
</think>

Final answer here.`,
      };
      finalMessages = [reasoningSystemPrompt, ...finalMessages];
    }

    const stream = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096,
      stream: true,
    });

    let fullContent = "";

    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;

      if (delta?.content) {
        fullContent += delta.content;
        send("text", { content: delta.content });
      }

      if (finishReason) {
        send("done", {
          finish_reason: finishReason,
          usage: chunk.usage || null,
          model,
        });
      }
    }

    // Ensure done event is sent
    send("done", { finish_reason: "stop", usage: null, model });
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model,
      route: "/api/hermes/chat",
      totalTokens: estimateTokensFromText(JSON.stringify(finalMessages), fullContent),
      metadata: { streamed: true, reasoning },
    });
  } catch (err: any) {
    console.error("[Hermes] chat error:", err);
    send("error", { error: err?.message || "Unexpected error" });
  } finally {
    res.end();
  }
});

// ─── Chat Completions (non-streaming, JSON) ───────────────────────────────────
router.post("/chat/completions", async (req: Request, res: Response) => {
  try {
    if (!process.env.HERMES_API_KEY) {
      return res.status(400).json({ error: "HERMES_API_KEY not configured" });
    }

    const { messages, model = "Hermes-4.3-36B", temperature, max_tokens, reasoning = false } = req.body;

    const openai = getClient();

    let finalMessages = [...(messages || [])];
    if (reasoning) {
      finalMessages = [
        {
          role: "system" as const,
          content: `You are a helpful AI assistant. When asked a complex question, reason step-by-step before giving your final answer. Enclose your chain-of-thought reasoning inside <think>...</think> tags.`,
        },
        ...finalMessages,
      ];
    }

    const r = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096,
    });
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: r.model ?? model,
      route: "/api/hermes/chat/completions",
      promptTokens: r.usage?.prompt_tokens,
      completionTokens: r.usage?.completion_tokens,
      totalTokens: r.usage?.total_tokens,
      metadata: { reasoning },
    });

    res.json({
      success: true,
      choices: r.choices,
      usage: r.usage,
      model: r.model,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "Chat completion failed" });
  }
});

// ─── Completions (legacy /completions endpoint) ────────────────────────────────
router.post("/completions", async (req: Request, res: Response) => {
  try {
    if (!process.env.HERMES_API_KEY) {
      return res.status(400).json({ error: "HERMES_API_KEY not configured" });
    }

    const { prompt, model = "Hermes-4.3-36B", max_tokens, temperature, stop, stream } = req.body;

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const openai = getClient();
      const streamResp = await openai.completions.create({
        model,
        prompt,
        max_tokens: max_tokens ?? 1024,
        temperature: temperature ?? 0.7,
        stop: stop || undefined,
        stream: true,
      });

      for await (const chunk of streamResp as any) {
        const text = chunk.choices?.[0]?.text || "";
        if (text) {
          res.write(`data: ${JSON.stringify({ choices: [{ text }] })}\n\n`);
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const openai = getClient();
    const r = await openai.completions.create({
      model,
      prompt,
      max_tokens: max_tokens ?? 1024,
      temperature: temperature ?? 0.7,
      stop: stop || undefined,
    });
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: r.model ?? model,
      route: "/api/hermes/completions",
      promptTokens: r.usage?.prompt_tokens,
      completionTokens: r.usage?.completion_tokens,
      totalTokens: r.usage?.total_tokens,
    });

    res.json({
      success: true,
      choices: r.choices,
      usage: r.usage,
      model: r.model,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || "Completion failed" });
  }
});

export default router;
