import type { RouterMessage, RouterResponse } from "../types.js";

export class ClawdRouterClient {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = "http://localhost:8402", model = "auto") {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async chat(
    messages: RouterMessage[],
    opts?: { model?: string; stream?: boolean; temperature?: number }
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts?.model ?? this.model,
        messages,
        temperature: opts?.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ClawdRouter ${res.status}: ${text}`);
    }

    const data = (await res.json()) as RouterResponse;
    return data.choices[0]?.message?.content ?? "";
  }

  async chatStream(
    messages: RouterMessage[],
    onChunk: (chunk: string) => void,
    opts?: { model?: string }
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts?.model ?? this.model,
        messages,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`ClawdRouter stream ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.replace(/^data: /, "").trim();
        if (!trimmed || trimmed === "[DONE]") continue;
        try {
          const chunk = JSON.parse(trimmed) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          const content = chunk.choices[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
