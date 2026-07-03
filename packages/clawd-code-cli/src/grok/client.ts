import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

export type GrokMessage = ChatCompletionMessageParam;

export interface GrokTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface GrokToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface SearchParameters {
  mode?: "auto" | "on" | "off";
  // sources removed - let API use default sources to avoid format issues
}

export interface SearchOptions {
  searchMode?: SearchParameters["mode"];
}

export interface GrokResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
}

export class GrokClient {
  private client: OpenAI;
  private currentModel: string = "grok-code-fast-1";
  private defaultMaxTokens: number;
  private isOllama: boolean = false;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    // Check if using Ollama
    const resolvedBaseURL = baseURL || process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
    this.isOllama = resolvedBaseURL.includes("localhost:11434") || 
                    resolvedBaseURL.includes("ollama");

    // Ollama doesn't require API key, use a placeholder
    this.client = new OpenAI({
      apiKey: this.isOllama ? "ollama" : apiKey,
      baseURL: resolvedBaseURL,
      timeout: 360000,
    });
    const envMax = Number(process.env.CLAWD_MAX_TOKENS || process.env.GROK_MAX_TOKENS);
    this.defaultMaxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 1536;
    if (model) {
      this.currentModel = model;
    }
  }

  /**
   * Set Ollama base URL and update client
   */
  public setOllamaURL(url: string): void {
    this.isOllama = true;
    this.client = new OpenAI({
      apiKey: "ollama",
      baseURL: url,
      timeout: 360000,
    });
  }

  /**
   * Set Grok API and update client
   */
  public setGrokAPI(apiKey: string, baseURL?: string): void {
    this.isOllama = false;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || "https://api.x.ai/v1",
      timeout: 360000,
    });
  }

  /**
   * Reconfigure client with new provider credentials.
   * Used when switching between Grok / OpenRouter / OpenAI / Ollama / custom.
   */
  public setProvider(apiKey: string, baseURL: string): void {
    this.isOllama =
      baseURL.includes("localhost:11434") || baseURL.includes("ollama");
    this.client = new OpenAI({
      apiKey: this.isOllama ? apiKey || "ollama" : apiKey,
      baseURL,
      timeout: 360000,
    });
  }

  /**
   * Check if currently using Ollama
   */
  public isUsingOllama(): boolean {
    return this.isOllama;
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  /**
   * Strip a provider prefix ("ollama/", "zai/", "openrouter/", "openai/", "custom/")
   * from a model id before sending to the underlying API.
   */
  private resolveApiModel(model: string): string {
    const prefixes = ["ollama/", "zai/", "openrouter/", "openai/", "custom/"];
    for (const p of prefixes) {
      if (model.startsWith(p)) return model.substring(p.length);
    }
    return model;
  }

  private isOpenRouterModel(model: string): boolean {
    return model.startsWith("openrouter/");
  }

  private isZaiModel(model: string): boolean {
    return model.startsWith("zai/") || model.startsWith("glm-");
  }

  private isGrokModel(model: string): boolean {
    return model.startsWith("grok");
  }

  private buildZaiWebSearchTool(): Record<string, unknown> {
    const count = Number.parseInt(process.env.ZAI_WEB_SEARCH_COUNT || "5", 10);
    return {
      type: "web_search",
      web_search: {
        enable: "True",
        search_engine: process.env.ZAI_WEB_SEARCH_ENGINE || "search-prime",
        search_result: "True",
        count: String(Number.isFinite(count) && count > 0 ? count : 5),
        search_recency_filter: process.env.ZAI_WEB_SEARCH_RECENCY || "noLimit",
        content_size: process.env.ZAI_WEB_SEARCH_CONTENT_SIZE || "medium",
      },
    };
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async chat(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    searchOptions?: SearchOptions
  ): Promise<GrokResponse> {
    try {
      const activeModel = model || this.currentModel;
      // Use Agent Tools API (web_search + x_search) for Grok models when search is enabled.
      // The old `search_parameters` is deprecated (returns 410).
      const useSearch = searchOptions?.searchMode !== "off";
      const allTools: any[] = [...(tools || [])];
      if (useSearch && !this.isOpenRouterModel(activeModel) && this.isGrokModel(activeModel)) {
        allTools.push({ type: "web_search" } as any);
        allTools.push({ type: "x_search" } as any);
      } else if (useSearch && this.isZaiModel(activeModel) && process.env.ZAI_WEB_SEARCH !== "false") {
        allTools.push(this.buildZaiWebSearchTool());
      }

      const requestPayload: any = {
        model: this.resolveApiModel(activeModel),
        messages,
        tools: allTools,
        tool_choice: allTools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
      };

      // OpenRouter reasoning passthrough — no-op for non-reasoning models.
      // Disable by setting OPENROUTER_REASONING=false.
      if (this.isOpenRouterModel(activeModel) && process.env.OPENROUTER_REASONING !== "false") {
        requestPayload.reasoning = { enabled: true };
      }

      if (this.isZaiModel(activeModel)) {
        const reasoningEffort = process.env.ZAI_REASONING_EFFORT;
        if (reasoningEffort) requestPayload.reasoning_effort = reasoningEffort;
        if (process.env.ZAI_ENABLE_THINKING === "false") {
          requestPayload.enable_thinking = false;
        }
      }

      const response =
        await this.client.chat.completions.create(requestPayload);

      return response as GrokResponse;
    } catch (error: any) {
      throw new Error(`API error: ${error.message}`);
    }
  }

  async *chatStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    searchOptions?: SearchOptions
  ): AsyncGenerator<any, void, unknown> {
    try {
      const activeModel = model || this.currentModel;
      // Use Agent Tools API (web_search + x_search) for Grok models when search is enabled.
      const useSearch = searchOptions?.searchMode !== "off";
      const allTools: any[] = [...(tools || [])];
      if (useSearch && !this.isOpenRouterModel(activeModel) && this.isGrokModel(activeModel)) {
        allTools.push({ type: "web_search" } as any);
        allTools.push({ type: "x_search" } as any);
      } else if (useSearch && this.isZaiModel(activeModel) && process.env.ZAI_WEB_SEARCH !== "false") {
        allTools.push(this.buildZaiWebSearchTool());
      }

      const requestPayload: any = {
        model: this.resolveApiModel(activeModel),
        messages,
        tools: allTools,
        tool_choice: allTools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
        stream: true,
      };

      if (this.isOpenRouterModel(activeModel) && process.env.OPENROUTER_REASONING !== "false") {
        requestPayload.reasoning = { enabled: true };
      }

      if (this.isZaiModel(activeModel)) {
        const reasoningEffort = process.env.ZAI_REASONING_EFFORT;
        if (reasoningEffort) requestPayload.reasoning_effort = reasoningEffort;
        if (process.env.ZAI_ENABLE_THINKING === "false") {
          requestPayload.enable_thinking = false;
        }
      }

      const stream = (await this.client.chat.completions.create(
        requestPayload
      )) as any;

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      throw new Error(`API error: ${error.message}`);
    }
  }

  async search(
    query: string,
    searchParameters?: SearchParameters
  ): Promise<GrokResponse> {
    const searchMessage: GrokMessage = {
      role: "user",
      content: query,
    };

    const searchOptions: SearchOptions = {
      searchMode: searchParameters?.mode || "on",
    };

    return this.chat([searchMessage], [], undefined, searchOptions);
  }
}
