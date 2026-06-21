type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface SolGptAttempt {
  provider: "mesh" | "openrouter";
  model?: string;
  ok: boolean;
  status?: number;
  elapsed_ms: number;
  error?: string;
}

export interface SolGptResult {
  completion: Record<string, unknown>;
  provider: "mesh" | "openrouter";
  model: string;
  fallback_used: boolean;
  attempts: SolGptAttempt[];
}

const DEFAULT_SYSTEM = [
  "You are Sol GPT, a fast Solana-native assistant powered by the Clawd inference mesh.",
  "Answer clearly and directly. Prefer practical Solana, DeFi, token, wallet, and developer context when relevant.",
  "Do not claim to have performed on-chain actions unless the user explicitly provides verified transaction data.",
].join(" ");

const DEFAULT_OPENROUTER_FREE_MODELS = [
  "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
  "nex-agi/nex-n2-pro:free",
  "nvidia/nemotron-3.5-content-safety:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

const DEFAULT_LOCAL_MODELS = [
  process.env.SOL_GPT_DEFAULT_MODEL,
  "qwen2.5:1.5b",
  "8bit/solana-clawd-core-ai:latest",
  "8bit/DeepSolana:latest",
  "hermes3:8b",
  "8bit/solana-clawd-core-ai:preview",
].filter(Boolean) as string[];

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function csv(value: string | undefined): string[] {
  return value?.split(",").map(v => v.trim()).filter(Boolean) ?? [];
}

function envModel(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function localModelPreferences(): string[] {
  return unique([
    ...csv(process.env.SOL_GPT_LOCAL_MODELS),
    ...DEFAULT_LOCAL_MODELS,
  ]);
}

export function openRouterFallbackModels(): string[] {
  const configured = csv(process.env.OPENROUTER_FALLBACK_MODELS);
  const models = unique([
    ...configured,
    envModel("OPENROUTER_DEFAULT_FREE_MODEL"),
    envModel("OPENROUTER_FREE_MODEL1"),
    envModel("OPENROUTER_FREE_MODEL2"),
    envModel("OPENROUTER_NVIDIA_FREE_MODEL"),
    envModel("OPENROUTER_NVIDIA_FREE_MODEL2"),
    envModel("OPENROUTER_NVIDIA_FREEMODEL3"),
    envModel("OPENROUTER_NVIDIA_FREE_SAFE"),
    envModel("OPENROUTER_NEMO_ULTRA"),
    envModel("OPENROUTER_HERMES"),
    ...DEFAULT_OPENROUTER_FREE_MODELS,
  ]);

  if (process.env.OPENROUTER_ALLOW_PAID_FALLBACKS === "true") return models;
  return models.filter(model => model.endsWith(":free"));
}

export function solGptStatus(availableModels: string[]): Record<string, unknown> {
  return {
    default_local_model: selectLocalModel(undefined, availableModels),
    local_models: availableModels,
    local_preferences: localModelPreferences(),
    openrouter: {
      enabled: Boolean(process.env.OPENROUTER_API_KEY),
      free_only: process.env.OPENROUTER_ALLOW_PAID_FALLBACKS !== "true",
      fallback_models: openRouterFallbackModels(),
    },
  };
}

function selectLocalModel(requested: string | undefined, availableModels: string[]): string | undefined {
  if (requested && availableModels.includes(requested)) return requested;
  const preferences = localModelPreferences();
  return preferences.find(model => availableModels.includes(model)) ?? availableModels[0] ?? preferences[0];
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ChatMessage[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role;
    const content = rec.content;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    messages.push({ role, content: content.slice(0, 16_000) });
  }

  return messages.slice(-32);
}

function withSolGptSystem(messages: ChatMessage[]): ChatMessage[] {
  if (messages.some(message => message.role === "system")) return messages;
  return [{ role: "system", content: DEFAULT_SYSTEM }, ...messages];
}

function requestMessages(body: Record<string, unknown>): ChatMessage[] {
  const messages = sanitizeMessages(body.messages);
  if (messages.length > 0) return withSolGptSystem(messages);

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return [];
  return withSolGptSystem([{ role: "user", content: prompt.slice(0, 16_000) }]);
}

function numberOption(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function buildChatBody(body: Record<string, unknown>, model: string, messages: ChatMessage[]): Record<string, unknown> {
  return {
    model,
    messages,
    stream: false,
    temperature: numberOption(body.temperature, 0.7, 0, 2),
    max_tokens: Math.round(numberOption(body.max_tokens, 512, 1, 2048)),
  };
}

async function parseCompletionResponse(res: Response): Promise<Record<string, unknown>> {
  const parsed = await res.json().catch(async () => ({ error: await res.text().catch(() => "") }));
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as Record<string, unknown>;
}

async function callMesh(
  ollamaHost: string,
  body: Record<string, unknown>,
  model: string,
  messages: ChatMessage[],
): Promise<Record<string, unknown>> {
  const timeoutMs = Number.parseInt(process.env.SOL_GPT_LOCAL_TIMEOUT_MS ?? "45000", 10);
  const res = await fetch(`${ollamaHost}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify(buildChatBody(body, model, messages)),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 45_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`mesh ${res.status}: ${text.slice(0, 240)}`);
  }

  return parseCompletionResponse(res);
}

async function callOpenRouter(
  body: Record<string, unknown>,
  model: string,
  messages: ChatMessage[],
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const timeoutMs = Number.parseInt(process.env.SOL_GPT_OPENROUTER_TIMEOUT_MS ?? "60000", 10);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://clawd-inference-mesh.fly.dev/sol-gpt",
      "X-Title": process.env.OPENROUTER_SITE_TITLE ?? "Sol GPT",
    },
    body: JSON.stringify(buildChatBody(body, model, messages)),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openrouter ${res.status}: ${text.slice(0, 240)}`);
  }

  return parseCompletionResponse(res);
}

export async function runSolGptChat(
  rawBody: Record<string, unknown>,
  ollamaHost: string,
  availableModels: string[],
): Promise<SolGptResult> {
  const messages = requestMessages(rawBody);
  if (messages.length === 0) throw new Error("messages or prompt is required");

  const requestedModel = typeof rawBody.model === "string" && !rawBody.model.startsWith("sol-gpt/")
    ? rawBody.model
    : undefined;
  const attempts: SolGptAttempt[] = [];
  const localModel = selectLocalModel(requestedModel, availableModels);

  if (localModel) {
    const start = Date.now();
    try {
      const completion = await callMesh(ollamaHost, rawBody, localModel, messages);
      attempts.push({ provider: "mesh", model: localModel, ok: true, elapsed_ms: Date.now() - start });
      return { completion, provider: "mesh", model: localModel, fallback_used: false, attempts };
    } catch (e) {
      attempts.push({
        provider: "mesh",
        model: localModel,
        ok: false,
        elapsed_ms: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  for (const model of openRouterFallbackModels()) {
    const start = Date.now();
    try {
      const completion = await callOpenRouter(rawBody, model, messages);
      attempts.push({ provider: "openrouter", model, ok: true, elapsed_ms: Date.now() - start });
      return { completion, provider: "openrouter", model, fallback_used: true, attempts };
    } catch (e) {
      attempts.push({
        provider: "openrouter",
        model,
        ok: false,
        elapsed_ms: Date.now() - start,
        error: (e as Error).message,
      });
      if (!process.env.OPENROUTER_API_KEY) break;
    }
  }

  const lastError = attempts.at(-1)?.error ?? "no Sol GPT provider is available";
  throw new Error(lastError);
}
