import type {
  ChatModelAdapter,
  MessageStatus,
  ThreadAssistantMessagePart,
  ThreadMessage,
  ThreadUserMessage,
  ThreadUserMessagePart,
} from "@assistant-ui/react";
import { env } from "@/env";

enum Role {
  System = "system",
  User = "user",
  Assistant = "assistant",
}

async function extractTextFromPDF(base64Data: string): Promise<string> {
  // Only run on client side
  if (typeof window === "undefined") {
    return "[PDF text extraction is only available on client side]";
  }

  try {
    const pdfjsLib = await import("pdfjs-dist");

    // Configure worker path if not already set
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    // Extract text from all pages
    const textParts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if ("str" in item) {
            return item.str;
          }
          return "";
        })
        .join(" ");
      textParts.push(pageText);
    }

    return textParts.join("\n\n");
  } catch (error) {
    console.error("Failed to extract text from PDF:", error);
    return "[PDF text extraction failed]";
  }
}

interface OpenAIMessage {
  role: Role;
  content: OpenAIContent;
}

type OpenAIContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "auto" | "low" | "high" };
    };

type OpenAIContent = string | OpenAIContentPart[];

const mapThreadPartToOpenAI = async (
  part: ThreadMessage["content"][number],
): Promise<OpenAIContentPart | null> => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "image") {
    return {
      type: "image_url",
      image_url: { url: part.image, detail: "auto" },
    };
  }
  if (part.type === "file") {
    const mime = part.mimeType ?? "application/octet-stream";
    const label = part.filename ?? "file";
    // Handle PDF files - extract text
    if (mime === "application/pdf") {
      const base64Data = part.data.startsWith("data:")
        ? (part.data.split(",")[1] ?? part.data)
        : part.data;
      const pdfText = await extractTextFromPDF(base64Data);
      return {
        type: "text",
        text: `[file: "${label}" type="${mime}"]\n${pdfText}`,
      };
    }

    // For text-based files, decode base64 and send as readable text
    const isTextFile =
      mime.startsWith("text/") ||
      mime.endsWith("+xml") ||
      mime.endsWith("+json") ||
      mime.includes("json") ||
      mime.includes("xml") ||
      mime.includes("javascript") ||
      mime.includes("typescript") ||
      mime.includes("yaml") ||
      mime.includes("x-sh");

    if (isTextFile) {
      try {
        // Extract base64 data from data URL if needed
        const base64Data = part.data.startsWith("data:")
          ? (part.data.split(",")[1] ?? part.data)
          : part.data;

        const content = atob(base64Data);
        return {
          type: "text",
          text: `[file: "${label}" type="${mime}"]\n${content}`,
        };
      } catch (e) {
        console.warn("Failed to decode base64 file content", e);
      }
    }

    // For non-text binary files, only send metadata (LLM cannot process binary data)
    return {
      type: "text",
      text: `[file: "${label}" type="${mime}"]`,
    };
  }
  return null;
};

const combineContentWithAttachments = (
  message: ThreadMessage,
): ThreadMessage["content"] => {
  if (message.role !== "user") {
    return message.content;
  }

  const { attachments, content } = message as ThreadUserMessage;
  const userParts: ThreadUserMessagePart[] = [...content];

  for (const attachment of attachments) {
    if (attachment.content?.length) {
      userParts.push(...attachment.content);
    }
  }

  return userParts;
};

const toOpenAIContent = async (
  parts: ThreadMessage["content"],
): Promise<OpenAIContent | undefined> => {
  const mappedPromises = parts.map((part) => mapThreadPartToOpenAI(part));
  const mappedResults = await Promise.all(mappedPromises);
  const mapped = mappedResults.filter(
    (p): p is OpenAIContentPart => p !== null,
  );

  if (mapped.length === 0) {
    return undefined;
  }

  // If only one text part and no other media, send as string for compatibility.
  if (mapped.length === 1 && mapped[0]?.type === "text") {
    return mapped[0].text;
  }

  return mapped;
};

async function toOpenAIMessages(
  messages: ThreadMessage[],
): Promise<OpenAIMessage[]> {
  const result: OpenAIMessage[] = [];

  for (const message of messages) {
    if (message.role !== Role.User && message.role !== Role.Assistant) {
      continue;
    }

    const parts = combineContentWithAttachments(message);
    const content = await toOpenAIContent(parts);
    if (!content) continue;

    result.push({
      role: message.role === Role.User ? Role.User : Role.Assistant,
      content,
    });
  }

  return result;
}

function extractTextFromContent(content: unknown): string {
  if (!content) return "";

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if ("text" in item && typeof item.text === "string") {
          return item.text;
        }
        if (
          "type" in item &&
          item.type === "output_text" &&
          typeof item.text === "string"
        ) {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  if (
    typeof content === "object" &&
    "text" in (content as Record<string, unknown>)
  ) {
    const value = (content as { text?: unknown }).text;
    return typeof value === "string" ? value : "";
  }

  return "";
}

function extractReasoningContent(reasoning: unknown): string {
  if (!reasoning) return "";

  if (typeof reasoning === "string") {
    return reasoning;
  }

  if (Array.isArray(reasoning)) {
    return reasoning
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if ("text" in item && typeof item.text === "string") {
          return item.text;
        }
        if (
          "type" in item &&
          typeof item.type === "string" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  if (
    typeof reasoning === "object" &&
    "text" in (reasoning as Record<string, unknown>)
  ) {
    const value = (reasoning as { text?: unknown }).text;
    return typeof value === "string" ? value : "";
  }

  return "";
}

function createAssistantParts(
  text: string,
  reasoning: string,
): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = [];

  if (reasoning.length > 0) {
    parts.push({
      type: "reasoning",
      text: reasoning,
    });
  }

  if (text.length > 0) {
    parts.push({
      type: "text",
      text,
    });
  }

  return parts;
}

function mapFinishReason(finishReason: string | undefined): MessageStatus {
  switch (finishReason) {
    case "stop":
      return { type: "complete", reason: "stop" };
    case "length":
      return { type: "incomplete", reason: "length" };
    case "content_filter":
      return { type: "incomplete", reason: "content-filter" };
    case "tool_calls":
      return { type: "requires-action", reason: "tool-calls" };
    default:
      return { type: "complete", reason: "unknown" };
  }
}

export interface CreateOpenAICompatibleAdapterOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

export function createOpenAICompatibleAdapter({
  apiKey = "",
  endpoint = `${env.NEXT_PUBLIC_REDPILL_API_URL}/v1/chat/completions`,
  model,
}: CreateOpenAICompatibleAdapterOptions = {}): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal, context }) {
      const payloadMessages = await toOpenAIMessages([...messages]);

      if (
        typeof context.system === "string" &&
        context.system.trim().length > 0
      ) {
        payloadMessages.unshift({
          role: Role.System,
          content: context.system.trim(),
        });
      }

      if (payloadMessages.length === 0) {
        yield { content: [], status: mapFinishReason("stop") };
        return;
      }

      if (!model) {
        throw new Error(
          "No model selected. Please select a model to continue.",
        );
      }

      const body: Record<string, unknown> = {
        model,
        messages: payloadMessages,
        stream: true,
      };

      const callSettings = context.callSettings ?? {};
      if (typeof callSettings.temperature === "number") {
        body.temperature = callSettings.temperature;
      }
      if (typeof callSettings.maxTokens === "number") {
        if (model.startsWith("openai")) {
          body.max_completion_tokens = callSettings.maxTokens;
        } else {
          body.max_tokens = callSettings.maxTokens;
        }
      }
      if (typeof callSettings.topP === "number") {
        body.top_p = callSettings.topP;
      }
      if (typeof callSettings.presencePenalty === "number") {
        body.presence_penalty = callSettings.presencePenalty;
      }
      if (typeof callSettings.frequencyPenalty === "number") {
        body.frequency_penalty = callSettings.frequencyPenalty;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        const completion = await response.json();
        const choice = completion?.choices?.[0];
        const message = choice?.message;
        const text = extractTextFromContent(
          message?.content ??
            message?.output_text ??
            choice?.output_text ??
            choice?.delta?.content,
        );
        const reasoning = extractReasoningContent(
          message?.reasoning_content ??
            message?.reasoning ??
            choice?.reasoning ??
            choice?.delta?.reasoning,
        );
        const finishReason: string | undefined = choice?.finish_reason;
        yield {
          content: createAssistantParts(text, reasoning),
          status: mapFinishReason(finishReason ?? "stop"),
        };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let messageId = "";
      let buffer = "";
      let textBuffer = "";
      let reasoningBuffer = "";
      let finishReason: string | undefined;
      let doneStreaming = false;

      const processPayload = (
        payload: string,
      ): { updated: boolean; done: boolean } => {
        if (!payload) {
          return { updated: false, done: false };
        }

        if (payload === "[DONE]") {
          return { updated: false, done: true };
        }

        try {
          const parsed = JSON.parse(payload);
          messageId = parsed?.id;
          const choice = parsed?.choices?.[0];
          if (!choice) {
            return { updated: false, done: false };
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          const delta = choice.delta ?? {};
          const deltaText = extractTextFromContent(
            delta.content ?? delta.output_text ?? delta.text,
          );
          const deltaReasoning = extractReasoningContent(
            delta.reasoning_content ??
              delta.reasoning ??
              delta.thinking ??
              delta.decision,
          );

          if (!deltaText && !deltaReasoning) {
            return { updated: false, done: false };
          }

          if (deltaText) {
            textBuffer += deltaText;
          }

          if (deltaReasoning) {
            reasoningBuffer += deltaReasoning;
          }

          return { updated: true, done: false };
        } catch (error) {
          console.warn("Failed to parse streaming chunk", error);
          return { updated: false, done: false };
        }
      };

      while (!doneStreaming) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(0), { stream: !done });

        let delimiterIndex = buffer.indexOf("\n\n");
        while (delimiterIndex !== -1) {
          const eventChunk = buffer.slice(0, delimiterIndex);
          buffer = buffer.slice(delimiterIndex + 2);
          delimiterIndex = buffer.indexOf("\n\n");

          const dataLines = eventChunk
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"));

          for (const line of dataLines) {
            const { updated, done: payloadDone } = processPayload(
              line.slice(5).trim(),
            );
            if (updated) {
              yield {
                content: createAssistantParts(textBuffer, reasoningBuffer),
                status: { type: "running" },
              };
            }
            if (payloadDone) {
              doneStreaming = true;
              break;
            }
          }

          if (doneStreaming) break;
        }

        if (done) {
          if (buffer.trim().length > 0) {
            const trailingLines = buffer
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.startsWith("data:"));

            for (const line of trailingLines) {
              if (doneStreaming) break;
              const { updated, done: payloadDone } = processPayload(
                line.slice(5).trim(),
              );
              if (updated) {
                yield {
                  content: createAssistantParts(textBuffer, reasoningBuffer),
                  status: { type: "running" },
                };
              }
              if (payloadDone) {
                doneStreaming = true;
              }
            }
          }
          break;
        }
      }

      yield {
        content: createAssistantParts(textBuffer, reasoningBuffer),
        status: mapFinishReason(finishReason ?? "stop"),
        metadata: {
          custom: {
            messageId,
            model,
          },
        },
      };
    },
  };
}
