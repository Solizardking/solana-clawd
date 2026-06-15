import { BaseAgenticProvider } from "@composio/core";
import type { ExecuteToolFn, Tool } from "@composio/core";

export interface ClaWDTool {
  name: string;
  description: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  category: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ClaWDToolkit {
  tools: ClaWDTool[];
  toMCPToolDefs(): Array<{
    name: string;
    description: string;
    inputSchema: ClaWDTool["schema"];
  }>;
  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface ClaWDProviderConfig {
  verbose?: boolean;
}

export class ClaWDProvider extends BaseAgenticProvider<ClaWDToolkit, ClaWDTool, unknown> {
  readonly name = "clawd-sovereign";
  readonly version = "2.0.0";

  private readonly verbose: boolean;
  private readonly toolCache = new Map<string, ClaWDTool>();

  constructor(config: ClaWDProviderConfig = {}) {
    super();
    this.verbose = config.verbose ?? false;
  }

  override wrapTool(tool: Tool, executeTool: ExecuteToolFn): ClaWDTool {
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
          console.log(`[ClaWDProvider] Executing ${tool.slug}`, args);
        }
        const result = await executeTool(tool.slug, args);
        if (!result.successful) {
          throw new Error(`Tool '${tool.slug}' failed: ${result.error ?? "unknown error"}`);
        }
        return result.data;
      },
    };
    this.toolCache.set(tool.slug, wrapped);
    return wrapped;
  }

  override wrapTools(tools: Tool[], executeTool: ExecuteToolFn): ClaWDToolkit {
    return this.buildToolkit(tools.map((tool) => this.wrapTool(tool, executeTool)));
  }

  buildNativeToolkit(
    tools: Array<{ name: string; description: string; schema?: Record<string, unknown> }>,
    executeFn: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ): ClaWDToolkit {
    return this.buildToolkit(
      tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        schema: {
          type: "object",
          properties: (tool.schema as { properties?: Record<string, unknown> })?.properties ?? {},
          required: (tool.schema as { required?: string[] })?.required,
        },
        category: this.inferCategory(tool.name),
        execute: (args) => executeFn(tool.name, args),
      })),
    );
  }

  private buildToolkit(tools: ClaWDTool[]): ClaWDToolkit {
    const verbose = this.verbose;
    return {
      tools,
      toMCPToolDefs() {
        return tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.schema,
        }));
      },
      async call(toolName: string, args: Record<string, unknown>) {
        const tool = tools.find((item) => item.name === toolName);
        if (!tool) throw new Error(`Tool '${toolName}' not found in ClaWD toolkit.`);
        if (verbose) console.log(`[ClaWDProvider] Calling ${toolName}`, args);
        return tool.execute(args);
      },
    };
  }

  private inferCategory(slug: string): string {
    const normalized = slug.toLowerCase();
    if (normalized.includes("github") || normalized.includes("git")) return "dev";
    if (normalized.includes("vulcan") || normalized.includes("phoenix") || normalized.includes("perp")) return "trading";
    if (normalized.includes("solana") || normalized.includes("wallet") || normalized.includes("token")) return "solana";
    if (normalized.includes("trade") || normalized.includes("market")) return "trading";
    if (normalized.includes("slack") || normalized.includes("telegram") || normalized.includes("mail")) return "messaging";
    if (normalized.includes("agent") || normalized.includes("clawd")) return "agents";
    return "general";
  }
}

export const claWDProvider = new ClaWDProvider();
