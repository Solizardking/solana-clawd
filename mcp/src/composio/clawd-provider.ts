/**
 * ClaWD Composio Provider — Custom Agentic Provider for Solana Clawd
 *
 * Implements the Composio BaseAgenticProvider interface so that any
 * Composio-aware orchestrator can discover and invoke ClaWD tools:
 *
 *   - Wraps Composio tools into MCP-compatible ClaWDTool format
 *   - Exposes a runClaWDAgent() helper for prompt-driven orchestration
 *   - Bridges Composio toolkit calls (GitHub, Slack, etc.) through the
 *     ClaWD tool schema so they route via the MCP orchestrator
 *
 * Usage with Composio SDK:
 *
 *   import { Composio } from '@composio/core';
 *   import { ClaWDProvider } from './composio/clawd-provider.js';
 *
 *   const provider = new ClaWDProvider({ mcpEndpoint: 'http://localhost:3001' });
 *   const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY, provider });
 *   const session = await composio.create('clawd-agent');
 *   const tools = await session.tools();
 *   // tools is ClaWDToolkit — MCP-compatible, ready for clawd-code or the orchestrator
 *
 * Standalone usage (no Composio SDK required):
 *
 *   const provider = new ClaWDProvider({ mcpEndpoint: 'http://localhost:3001' });
 *   const toolkit = provider.buildNativeToolkit([...yourTools], execFn);
 *   await provider.runClaWDAgent(toolkit, 'Analyze SOL funding rates and suggest a trade');
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Composio core types — replicated here to avoid runtime dependency */
export interface ComposioTool {
  slug: string;
  name?: string;
  description?: string;
  inputParameters?: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ComposioExecuteFn = (
  slug: string,
  args: Record<string, unknown>,
) => Promise<{ successful: boolean; data?: unknown; error?: string }>;

/** MCP-compatible tool format used across the Solana Clawd stack */
export interface ClaWDTool {
  name: string;
  description: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  category: string;
  /** Execute the tool directly (agentic mode) */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ClaWDToolkit {
  tools: ClaWDTool[];
  /** Convert to MCP ListToolsResult format */
  toMCPToolDefs(): Array<{ name: string; description: string; inputSchema: ClaWDTool["schema"] }>;
  /** Execute a tool by name */
  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface ClaWDProviderConfig {
  /** MCP orchestrator HTTP endpoint (default: http://localhost:3001) */
  mcpEndpoint?: string;
  /** Optional: Anthropic API key for meta-agent reasoning */
  anthropicApiKey?: string;
  /** Optional: xAI API key for Grok-powered agents */
  xaiApiKey?: string;
  /** Log tool calls to stdout (default: false) */
  verbose?: boolean;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class ClaWDProvider {
  readonly name = "clawd-code";
  readonly version = "1.0.0";

  private readonly mcpEndpoint: string;
  private readonly verbose: boolean;
  private readonly anthropicApiKey?: string;
  private readonly xaiApiKey?: string;
  private readonly toolCache = new Map<string, ClaWDTool>();

  constructor(config: ClaWDProviderConfig = {}) {
    this.mcpEndpoint = (config.mcpEndpoint ?? process.env.SOLANA_CLAWD_MCP_URL ?? "http://localhost:3001").replace(/\/$/, "");
    this.verbose = config.verbose ?? false;
    this.anthropicApiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    this.xaiApiKey = config.xaiApiKey ?? process.env.XAI_API_KEY;
  }

  // ── Core Provider Methods (Composio BaseAgenticProvider interface) ──────────

  /** Transform a single Composio tool into ClaWD MCP format */
  wrapTool(tool: ComposioTool, executeToolFn: ComposioExecuteFn): ClaWDTool {
    const wrapped: ClaWDTool = {
      name: tool.slug,
      description: tool.description ?? tool.name ?? tool.slug,
      schema: {
        type: "object",
        properties: tool.inputParameters?.properties ?? {},
        required: tool.inputParameters?.required,
      },
      category: this.inferCategory(tool.slug),
      execute: async (args: Record<string, unknown>) => {
        if (this.verbose) {
          console.log(`[ClaWDProvider] Executing tool: ${tool.slug}`, args);
        }
        const result = await executeToolFn(tool.slug, args);
        if (!result.successful) {
          throw new Error(`Tool '${tool.slug}' failed: ${result.error ?? "unknown error"}`);
        }
        return result.data;
      },
    };
    this.toolCache.set(tool.slug, wrapped);
    return wrapped;
  }

  /** Transform a Composio tool collection into a ClaWDToolkit */
  wrapTools(tools: ComposioTool[], executeToolFn: ComposioExecuteFn): ClaWDToolkit {
    const claWDTools = tools.map((t) => this.wrapTool(t, executeToolFn));
    return this.buildToolkit(claWDTools);
  }

  // ── Standalone toolkit builder (no Composio SDK needed) ────────────────────

  /**
   * Build a ClaWDToolkit from raw tool definitions and an execute function.
   * Use this when integrating without the full Composio SDK.
   */
  buildNativeToolkit(
    tools: Array<{ name: string; description: string; schema?: Record<string, unknown> }>,
    executeFn: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ): ClaWDToolkit {
    const claWDTools: ClaWDTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      schema: {
        type: "object",
        properties: (t.schema as { properties?: Record<string, unknown> })?.properties ?? {},
        required: (t.schema as { required?: string[] })?.required,
      },
      category: this.inferCategory(t.name),
      execute: (args) => executeFn(t.name, args),
    }));
    return this.buildToolkit(claWDTools);
  }

  // ── MCP Orchestrator Bridge ────────────────────────────────────────────────

  /**
   * Call a tool on the connected MCP orchestrator.
   * Routes through the HTTP endpoint if the orchestrator is running.
   */
  async callMCPTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const url = `${this.mcpEndpoint}/tools/${encodeURIComponent(toolName)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arguments: args }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`MCP tool '${toolName}' returned HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) throw new Error(`MCP tool error: ${json.error}`);
    return json.result;
  }

  /**
   * Fetch all tools from the connected MCP orchestrator and wrap them.
   */
  async fetchMCPToolkit(): Promise<ClaWDToolkit> {
    const res = await fetch(`${this.mcpEndpoint}/tools`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`MCP /tools returned HTTP ${res.status}`);
    const data = (await res.json()) as { tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> };
    const tools = (data.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      schema: (t.inputSchema as { properties?: Record<string, unknown>; required?: string[] }) ?? {},
    }));
    return this.buildNativeToolkit(tools, (name, args) => this.callMCPTool(name, args));
  }

  // ── Agent Runner ───────────────────────────────────────────────────────────

  /**
   * Run a Clawd agent with the given toolkit and prompt.
   * Uses xAI Grok or Anthropic Claude to drive tool calling.
   */
  async runClaWDAgent(toolkit: ClaWDToolkit, prompt: string): Promise<string> {
    const toolDefs = toolkit.toMCPToolDefs();

    if (this.xaiApiKey) {
      return this.runWithXAI(toolkit, toolDefs, prompt);
    } else if (this.anthropicApiKey) {
      return this.runWithAnthropic(toolkit, toolDefs, prompt);
    } else {
      // No LLM configured — just execute the first tool if there's only one
      if (toolDefs.length === 1) {
        const result = await toolkit.call(toolDefs[0].name, {});
        return JSON.stringify(result, null, 2);
      }
      throw new Error(
        "ClaWDProvider: No AI key configured. Set XAI_API_KEY or ANTHROPIC_API_KEY, or call toolkit.call() directly.",
      );
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private buildToolkit(tools: ClaWDTool[]): ClaWDToolkit {
    const self = this;
    return {
      tools,
      toMCPToolDefs() {
        return tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.schema,
        }));
      },
      async call(toolName: string, args: Record<string, unknown>) {
        const tool = tools.find((t) => t.name === toolName);
        if (!tool) throw new Error(`Tool '${toolName}' not found in ClaWD toolkit.`);
        if (self.verbose) console.log(`[ClaWDProvider] Calling ${toolName}`, args);
        return tool.execute(args);
      },
    };
  }

  private inferCategory(slug: string): string {
    if (slug.includes("github") || slug.includes("git")) return "dev";
    if (slug.includes("solana") || slug.includes("wallet") || slug.includes("token")) return "solana";
    if (slug.includes("trade") || slug.includes("perp") || slug.includes("market")) return "trading";
    if (slug.includes("slack") || slug.includes("telegram") || slug.includes("mail")) return "messaging";
    if (slug.includes("arena") || slug.includes("agent")) return "agents";
    return "general";
  }

  private async runWithXAI(
    toolkit: ClaWDToolkit,
    toolDefs: ClaWDToolkit extends { toMCPToolDefs(): infer R } ? R : never,
    prompt: string,
  ): Promise<string> {
    const SYSTEM = `You are ClaWD — the sovereign Solana AI agent. Use the available tools to fulfill the user request. Think step by step, call tools as needed, and return a concise final answer.`;
    const messages: Array<{ role: string; content: string | unknown[] }> = [
      { role: "user", content: prompt },
    ];

    const xaiTools = toolDefs.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    let iterations = 0;
    const MAX_ITER = 10;

    while (iterations++ < MAX_ITER) {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.xaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-4",
          system: SYSTEM,
          messages,
          tools: xaiTools,
          tool_choice: "auto",
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) throw new Error(`xAI API error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        choices: Array<{
          finish_reason: string;
          message: {
            role: string;
            content: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };

      const choice = data.choices[0];
      const msg = choice.message;
      messages.push({ role: msg.role, content: msg.content ?? msg.tool_calls ?? "" });

      if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
        return typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      }

      // Execute tool calls
      for (const tc of msg.tool_calls ?? []) {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        let toolResult: unknown;
        try {
          toolResult = await toolkit.call(tc.function.name, args);
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : String(err) };
        }
        messages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
        });
      }
    }

    return "Max iterations reached. Last model output was logged.";
  }

  private async runWithAnthropic(
    toolkit: ClaWDToolkit,
    toolDefs: ClaWDToolkit extends { toMCPToolDefs(): infer R } ? R : never,
    prompt: string,
  ): Promise<string> {
    const anthropicTools = toolDefs.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    const messages: Array<{ role: string; content: string | unknown[] }> = [
      { role: "user", content: prompt },
    ];

    let iterations = 0;
    const MAX_ITER = 10;

    while (iterations++ < MAX_ITER) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.anthropicApiKey!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system:
            "You are ClaWD — the sovereign Solana AI agent. Use the available tools to fulfill the user request. Think step by step and return a concise final answer.",
          messages,
          tools: anthropicTools,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        stop_reason: string;
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      };

      messages.push({ role: "assistant", content: data.content });

      if (data.stop_reason === "end_turn") {
        const textBlock = data.content.find((b) => b.type === "text");
        return textBlock?.text ?? "";
      }

      if (data.stop_reason !== "tool_use") break;

      // Execute tool calls
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      for (const block of data.content) {
        if (block.type !== "tool_use" || !block.id || !block.name) continue;
        let result: unknown;
        try {
          result = await toolkit.call(block.name, block.input ?? {});
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return "Agent run complete.";
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const claWDProvider = new ClaWDProvider();
