import { toast } from "@/hooks/use-toast";

export interface DeepSeekMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface DeepSeekModelOption {
  id: string;
  name: string;
  description: string;
  contextWindow?: number;
  thinking?: boolean;
  /** kept for back-compat with consumers that look for `multimodal` */
  multimodal?: boolean;
}

export const AVAILABLE_MODELS: DeepSeekModelOption[] = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    description: "Default flagship reasoning model with thinking mode and tool calls",
    contextWindow: 1000000,
    thinking: true,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    description: "Fast, low-latency DeepSeek model with tool calls",
    contextWindow: 1000000,
    thinking: true,
  },
  {
    id: "MiniMax-M2.7",
    name: "MiniMax M2.7",
    description: "MiniMax reasoning model via MINIMAX_API_KEY",
    contextWindow: 204800,
    thinking: true,
  },
  {
    id: "MiniMax-M2.7-highspeed",
    name: "MiniMax M2.7 Highspeed",
    description: "Fast MiniMax M2.7 endpoint via MINIMAX_API_KEY",
    contextWindow: 204800,
    thinking: true,
  },
];

class DeepSeekClient {
  private _models: DeepSeekModelOption[] | null = null;

  async getAvailableModels(): Promise<DeepSeekModelOption[]> {
    if (this._models) return this._models;
    return this.fetchAvailableModels().catch(() => AVAILABLE_MODELS);
  }

  private async fetchAvailableModels(): Promise<DeepSeekModelOption[]> {
    try {
      const r = await fetch("/api/deepseek/models");
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

  async chat(
    messages: DeepSeekMessage[],
    model: string = "deepseek-v4-pro",
    options: { thinking?: boolean; reasoningEffort?: "low" | "medium" | "high" | "max" } = {},
  ): Promise<string> {
    try {
      const r = await fetch("/api/deepseek/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model,
          thinkingEnabled: options.thinking ?? true,
          reasoningEffort: options.reasoningEffort ?? "high",
          useTools: true,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `AI chat error ${r.status}`);
      }
      if (!r.body) return "";
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let error = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          const data = JSON.parse(dataStr);
          if (event === "text") text += data.content || "";
          if (event === "error") error = data.error || "AI chat failed";
        }
      }

      if (error) throw new Error(error);
      return text;
    } catch (e: any) {
      console.error("AI chat error:", e);
      toast({
        title: "AI chat error",
        description: e?.message || "Failed to reach the model",
        variant: "destructive",
      });
      throw e;
    }
  }

  /** DeepSeek is text-only — server proxies image analysis to xAI grok-4. */
  async analyzeImage(imageBase64: string, prompt: string): Promise<string> {
    const r = await fetch("/api/deepseek/analyze-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Image: imageBase64, prompt }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `Image analysis failed ${r.status}`);
    }
    const data = await r.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async generateTokenIdea(prompt: string, model: string = "deepseek-v4-pro"): Promise<any> {
    const r = await fetch("/api/deepseek/generate-token-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `DeepSeek token idea failed ${r.status}`);
    }
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    try {
      return JSON.parse(content);
    } catch {
      throw new Error("DeepSeek returned non-JSON token idea");
    }
  }
}

export const deepseek = new DeepSeekClient();

// Back-compat aliases (so existing imports keep working):
export const openRouter = deepseek;
export type OpenRouterMessage = DeepSeekMessage;
export type OpenRouterModelOption = DeepSeekModelOption;
