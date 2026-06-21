/**
 * Ollama upstream handler.
 * Uses Ollama's OpenAI-compatible /v1/chat/completions API.
 */

import type { ChatCompletionRequest } from "../types.js";

export interface OllamaConfig {
  host: string;
}

export interface OllamaModelTag {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: Record<string, unknown>;
}

export function toOllamaModelId(model: string): string {
  return model.replace(/^ollama\//, "");
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

function buildOllamaBody(request: ChatCompletionRequest, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    stream: request.stream ?? false,
  };

  if (request.temperature !== undefined) body["temperature"] = request.temperature;
  if (request.max_tokens !== undefined) body["max_tokens"] = request.max_tokens;
  if (request.top_p !== undefined) body["top_p"] = request.top_p;
  if (request.frequency_penalty !== undefined) body["frequency_penalty"] = request.frequency_penalty;
  if (request.presence_penalty !== undefined) body["presence_penalty"] = request.presence_penalty;
  if (request.stop !== undefined) body["stop"] = request.stop;
  if (request.seed !== undefined) body["seed"] = request.seed;
  if (request.tools !== undefined) body["tools"] = request.tools;
  if (request.tool_choice !== undefined) body["tool_choice"] = request.tool_choice;
  if (request.response_format !== undefined) body["response_format"] = request.response_format;

  return body;
}

export async function proxyToOllama(
  request: ChatCompletionRequest,
  config: OllamaConfig,
): Promise<Response> {
  const host = normalizeHost(config.host);
  const model = toOllamaModelId(request.model);

  return fetch(`${host}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer ollama",
    },
    body: JSON.stringify(buildOllamaBody(request, model)),
    signal: AbortSignal.timeout(300_000),
  });
}

export async function listOllamaModels(host: string): Promise<OllamaModelTag[]> {
  const resp = await fetch(`${normalizeHost(host)}/api/tags`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) throw new Error(`Ollama model list failed: HTTP ${resp.status}`);
  const data = await resp.json() as { models?: OllamaModelTag[] };
  return data.models ?? [];
}

export async function isOllamaReady(host: string): Promise<boolean> {
  try {
    const resp = await fetch(`${normalizeHost(host)}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
