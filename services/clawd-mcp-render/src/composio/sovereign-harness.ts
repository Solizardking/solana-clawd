import { createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, streamText, type LanguageModel, type ToolSet } from "ai";
import type { Composio } from "@composio/core";
import { createClawdSession, type CreateClawdComposioOptions } from "./sdk.js";
import { getClawdCustomTools } from "./custom-tools.js";
import type { ClaWDProvider } from "./clawd-provider.js";

export interface ClawdModelConfig {
  providerName: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface CreateSovereignHarnessOptions extends CreateClawdComposioOptions {
  toolkits?: string[];
  model?: Partial<ClawdModelConfig>;
  includeCustomTools?: boolean;
}

export interface ClawdSovereignHarness {
  composio: Composio<ClaWDProvider>;
  userId: string;
  sessionId: string;
  mcp: {
    type: string;
    url: string;
    headers?: Record<string, string>;
  };
  model: ClawdModelConfig;
  tools: ToolSet;
  run(prompt: string, maxSteps?: number): Promise<string>;
  stream(prompt: string, maxSteps?: number): AsyncIterable<string>;
  close(): Promise<void>;
}

export function getClawdModelConfig(overrides: Partial<ClawdModelConfig> = {}): ClawdModelConfig {
  const baseURL = overrides.baseURL ?? process.env.CLAWD_MODEL_BASE_URL;
  const apiKey = overrides.apiKey ?? process.env.CLAWD_MODEL_API_KEY;
  const model = overrides.model ?? process.env.CLAWD_MODEL ?? "solana-clawd";

  if (!baseURL) {
    throw new Error("CLAWD_MODEL_BASE_URL is required for the sovereign Clawd harness.");
  }
  if (!apiKey) {
    throw new Error("CLAWD_MODEL_API_KEY is required for the sovereign Clawd harness.");
  }

  return {
    providerName: overrides.providerName ?? process.env.CLAWD_MODEL_PROVIDER ?? "clawd",
    baseURL,
    apiKey,
    model,
  };
}

export function createClawdLanguageModel(config: ClawdModelConfig): LanguageModel {
  const provider = createOpenAICompatible({
    name: config.providerName,
    baseURL: config.baseURL.replace(/\/$/, ""),
    apiKey: config.apiKey,
  });
  return provider.chatModel(config.model);
}

export async function createClawdSovereignHarness(
  options: CreateSovereignHarnessOptions = {},
): Promise<ClawdSovereignHarness> {
  const modelConfig = getClawdModelConfig(options.model);
  const sessionConfig: Parameters<Composio<ClaWDProvider>["create"]>[1] = {
    toolkits: options.toolkits ?? ["github", "slack"],
    experimental: options.includeCustomTools === false ? undefined : {
      customTools: getClawdCustomTools(),
    },
  };

  const { composio, config, session } = await createClawdSession(sessionConfig, options);
  const client = await createMCPClient({
    clientName: "clawd-sovereign-harness",
    transport: {
      type: session.mcp.type,
      url: session.mcp.url,
      headers: session.mcp.headers,
    },
  });
  const tools = await client.tools();
  const model = createClawdLanguageModel(modelConfig);

  return {
    composio,
    userId: config.userId,
    sessionId: session.sessionId,
    mcp: {
      type: session.mcp.type,
      url: session.mcp.url,
      headers: session.mcp.headers,
    },
    model: modelConfig,
    tools,
    async run(prompt: string, maxSteps = 10): Promise<string> {
      const result = await generateText({
        model,
        prompt,
        tools,
        stopWhen: stepCountIs(maxSteps),
      });
      return result.text;
    },
    async *stream(prompt: string, maxSteps = 10): AsyncIterable<string> {
      const result = await streamText({
        model,
        prompt,
        tools,
        stopWhen: stepCountIs(maxSteps),
      });
      for await (const textPart of result.textStream) {
        yield textPart;
      }
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}
