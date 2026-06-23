import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "z-ai/glm-5.2";

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role?: string;
  content?: unknown;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  systemPrompt?: string;
}

interface OpenRouterChunk {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ text?: string }>;
    };
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
  usage?: {
    reasoningTokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  };
}

function getDefaultModel(): string {
  return process.env.OPENROUTER_GLM?.trim() || DEFAULT_OPENROUTER_MODEL;
}

function resolveModel(model: unknown): string {
  if (typeof model !== "string") return getDefaultModel();
  const trimmed = model.trim();
  if (!trimmed || trimmed.startsWith("claude-")) return getDefaultModel();
  return trimmed;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (
          block &&
          typeof block === "object" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          return block.text;
        }
        if (
          block &&
          typeof block === "object" &&
          "content" in block &&
          typeof block.content === "string"
        ) {
          return block.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content == null) return "";
  return String(content);
}

function normalizeRole(role: string | undefined): ChatRole | null {
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }
  return null;
}

function normalizeMessages(body: ChatRequestBody): Array<{
  role: ChatRole;
  content: string;
}> {
  const messages = (body.messages ?? [])
    .map((message) => {
      const role = normalizeRole(message.role);
      const content = contentToText(message.content).trim();
      return role && content ? { role, content } : null;
    })
    .filter((message): message is { role: ChatRole; content: string } =>
      Boolean(message)
    );

  const systemPrompt = (body.systemPrompt ?? body.system)?.trim();
  if (systemPrompt) {
    messages.unshift({ role: "system", content: systemPrompt });
  }

  return messages;
}

function extractChunkText(chunk: OpenRouterChunk): string {
  const content =
    chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("");
  }
  return "";
}

function createErrorResponse(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function toSseData(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function openRouterToClawdStream(
  upstreamBody: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const reader = upstreamBody.getReader();
  let buffer = "";
  let closed = false;
  let lastUsage: OpenRouterChunk["usage"] | undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(toSseData(payload));
      const close = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      const handleLine = (line: string): boolean => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
          return false;
        }

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          send({ type: "done", usage: lastUsage });
          close();
          return true;
        }

        let chunk: OpenRouterChunk;
        try {
          chunk = JSON.parse(data) as OpenRouterChunk;
        } catch {
          return false;
        }

        if (chunk.error?.message) {
          send({ type: "error", error: chunk.error.message });
          return false;
        }

        if (chunk.usage) {
          lastUsage = chunk.usage;
        }

        const text = extractChunkText(chunk);
        if (text) {
          send({ type: "text", content: text });
        }

        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (handleLine(line)) return;
          }
        }

        if (buffer.trim()) {
          handleLine(buffer);
        }

        send({ type: "done", usage: lastUsage });
        close();
      } catch (error) {
        send({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "OpenRouter stream failed",
        });
        close();
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });
}

export async function GET() {
  return NextResponse.json({
    provider: "openrouter",
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    model: getDefaultModel(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return createErrorResponse("OPENROUTER_API_KEY is not configured", 500);
    }

    const body = (await req.json()) as ChatRequestBody;
    const messages = normalizeMessages(body);
    if (messages.length === 0) {
      return createErrorResponse("At least one chat message is required", 400);
    }

    const model = resolveModel(body.model);
    const wantsStream = body.stream !== false;
    const referer =
      process.env.OPENROUTER_SITE_URL ??
      req.headers.get("origin") ??
      "http://localhost:3000";

    const upstreamBody = {
      model,
      messages,
      stream: wantsStream,
      ...(body.max_tokens || body.maxTokens
        ? { max_tokens: body.max_tokens ?? body.maxTokens }
        : {}),
      ...(typeof body.temperature === "number"
        ? { temperature: body.temperature }
        : {}),
    };

    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": referer,
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Clawd Code Web",
      },
      body: JSON.stringify(upstreamBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return createErrorResponse(
        errorBody || `OpenRouter request failed with ${response.status}`,
        response.status
      );
    }

    if (!wantsStream) {
      const result = (await response.json()) as OpenRouterChunk;
      const text = extractChunkText(result);
      return NextResponse.json({
        type: "text",
        content: text,
        model,
        usage: result.usage,
      });
    }

    if (!response.body) {
      return createErrorResponse("OpenRouter response did not include a stream");
    }

    return new NextResponse(openRouterToClawdStream(response.body), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
