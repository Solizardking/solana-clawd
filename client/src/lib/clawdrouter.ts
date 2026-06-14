/**
 * CLAWD Router client library.
 *
 * Talks to the server-side clawdrouter proxy at /api/clawdrouter,
 * which forwards requests through the configured CLAWD Router gateway → OpenRouter
 * with full app attribution (HTTP-Referer, X-OpenRouter-Title, X-OpenRouter-Categories).
 *
 * This means all usage through this client appears in OpenRouter's public rankings,
 * model-specific "Apps" tabs, and detailed analytics under "Cheshire Terminal".
 */

import { toast } from "@/hooks/use-toast";

export interface ClawdRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ClawdRouterModelOption {
  id: string;
  name: string;
  description: string;
  free?: boolean;
}

export const AVAILABLE_MODELS: ClawdRouterModelOption[] = [
  { id: "clawdrouter/auto", name: "CLAWD Router Auto", description: "Auto-selects best model for your tier" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano", description: "Latest nano model" },
  { id: "xai/grok-4-fast", name: "Grok 4 Fast", description: "Fast Grok inference" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", description: "DeepSeek V3 chat" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Google's fast model" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", description: "Fast Anthropic model" },
  { id: "nvidia/nemotron-super-49b", name: "Nemotron Super 49B", description: "Free NVIDIA model" },
];

export const FREE_AVAILABLE_MODELS: ClawdRouterModelOption[] = [
  {
    id: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    name: "NVIDIA Llama Nemotron Rerank VL 1B",
    description: "Free lightweight NVIDIA ranking and vision-language model.",
    free: true,
  },
  {
    id: "~anthropic/claude-fable-latest",
    name: "Claude Fable Latest",
    description: "Anthropic Fable latest alias for public lightweight creative chats.",
    free: true,
  },
  {
    id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    description: "Anthropic Fable 5 for broader public reasoning coverage.",
    free: true,
  },
  {
    id: "nex-agi/nex-n2-pro:free",
    name: "NEX N2 Pro",
    description: "Free NEX-AGI general-purpose assistant model.",
    free: true,
  },
  {
    id: "sourceful/riverflow-v2.5-fast",
    name: "Riverflow v2.5 Fast",
    description: "Fast Sourceful model for quick public terminal responses.",
    free: true,
  },
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    name: "Nemotron 3.5 Content Safety",
    description: "Free NVIDIA safety-specialized model for guardrail-heavy prompts.",
    free: true,
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra 550B",
    description: "Free large NVIDIA reasoning model for longer-form responses.",
    free: true,
  },
];

class ClawdRouterClient {
  private _models: ClawdRouterModelOption[] | null = null;
  private _freeModels: ClawdRouterModelOption[] | null = null;

  constructor() {
    this.fetchAvailableModels().catch(() => {});
  }

  async getAvailableModels(): Promise<ClawdRouterModelOption[]> {
    if (this._models) return this._models;
    return this.fetchAvailableModels().catch(() => AVAILABLE_MODELS);
  }

  async getFreeModels(): Promise<ClawdRouterModelOption[]> {
    if (this._freeModels) return this._freeModels;
    return this.fetchFreeModels().catch(() => FREE_AVAILABLE_MODELS);
  }

  private async fetchAvailableModels(): Promise<ClawdRouterModelOption[]> {
    try {
      const r = await fetch("/api/clawdrouter/models");
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (Array.isArray(d.models) && d.models.length) {
        this._models = d.models;
        return d.models;
      }
      return AVAILABLE_MODELS;
    } catch {
      return AVAILABLE_MODELS;
    }
  }

  private async fetchFreeModels(): Promise<ClawdRouterModelOption[]> {
    try {
      const r = await fetch("/api/clawdrouter/free-models");
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (Array.isArray(d.models) && d.models.length) {
        const mapped = d.models.map((model: ClawdRouterModelOption) => ({ ...model, free: true }));
        this._freeModels = mapped;
        return mapped;
      }
      return FREE_AVAILABLE_MODELS;
    } catch {
      return FREE_AVAILABLE_MODELS;
    }
  }

  /**
   * Standard (non-streaming) chat completion.
   * Attribution headers are set server-side by the clawdrouter proxy.
   */
  async chat(
    messages: ClawdRouterMessage[],
    model: string = "openai/gpt-4o-mini",
    options: { max_tokens?: number; temperature?: number } = {},
  ): Promise<string> {
    try {
      const r = await fetch("/api/clawdrouter/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model,
          max_tokens: options.max_tokens,
          temperature: options.temperature ?? 0.7,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `CLAWD Router error ${r.status}`);
      }
      const data = await r.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (e: any) {
      console.error("CLAWD Router chat error:", e);
      toast({
        title: "CLAWD Router error",
        description: e?.message || "Failed to reach CLAWD Router",
        variant: "destructive",
      });
      throw e;
    }
  }

  /**
   * Streaming chat completion via SSE.
   * Yields parsed delta chunks as they arrive.
   */
  async *chatStream(
    messages: ClawdRouterMessage[],
    model: string = "openai/gpt-4o-mini",
    options: { max_tokens?: number; temperature?: number } = {},
  ): AsyncGenerator<string, void, unknown> {
    const r = await fetch("/api/clawdrouter/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        model,
        max_tokens: options.max_tokens,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `CLAWD Router stream error ${r.status}`);
    }

    const reader = r.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed chunks
        }
      }
    }
  }

  async *freeChatStream(
    messages: ClawdRouterMessage[],
    model: string = FREE_AVAILABLE_MODELS[0].id,
    options: { max_tokens?: number; temperature?: number } = {},
  ): AsyncGenerator<string, void, unknown> {
    const r = await fetch("/api/clawdrouter/free-chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        model,
        max_tokens: options.max_tokens,
        temperature: options.temperature ?? 0.6,
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `CLAWD Router free stream error ${r.status}`);
    }

    const reader = r.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed chunks
        }
      }
    }
  }

  /** Health check — returns status and attribution config from the proxy. */
  async status(): Promise<any> {
    const r = await fetch("/api/clawdrouter/status");
    return r.json();
  }
}

export const clawdRouter = new ClawdRouterClient();
