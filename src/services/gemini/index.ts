/**
 * Google Gemini Provider for OpenClawd
 *
 * Integrates Gemini 3.5 Flash, Nano Banana image generation,
 * Veo video generation, and Google Search grounding
 * into the Leviathan agent runtime.
 *
 * Required env: GEMINI_API_KEY (https://aistudio.google.com/app/apikey)
 */

import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type Tool } from "@google/genai";

/** Request shape for the Gemini InferProvider adapter. */
export interface InferRequest {
  prompt: string;
  systemPrompt?: string;
  history?: Array<{ role: string; content: string }>;
  tools?: string[];
  thinkingLevel?: "high" | "low" | "minimal" | "medium";
  [key: string]: unknown;
}

/** Response shape for the Gemini InferProvider adapter. */
export interface InferResponse {
  text: string;
  model: string;
  groundingSources?: Array<{ title: string; url: string }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    thoughtsTokens?: number;
    totalTokens: number;
  };
  [key: string]: unknown;
}

/** Gemini-specific InferProvider shape (extends the Leviathan contract). */
export interface InferProvider {
  name: string;
  infer: (req: InferRequest) => Promise<InferResponse>;
  inferWithImage?: (req: InferRequest & { imageData: Buffer; imageMimeType: string }) => Promise<InferResponse>;
  costFor?: (tokensIn: number, tokensOut: number, model: string) => number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface GeminiConfig {
  apiKey: string;
  /** Default model for text generation */
  textModel?: string;
  /** Default model for image generation */
  imageModel?: string;
  /** Default model for thinking/reasoning */
  thinkingModel?: string;
  /** Default model for vision */
  visionModel?: string;
}

/** Available Gemini models */
export const GEMINI_MODELS = {
  /** Text: most intelligent Flash, sustained frontier performance */
  text: "gemini-3.5-flash",
  /** Text: fast, cost-efficient (alternative) */
  textLite: "gemini-3.1-flash-lite",
  /** Text: deep reasoning (alternative) */
  textPro: "gemini-3.1-pro-preview",
  /** Image: Nano Banana 2 — high-efficiency */
  image: "gemini-3.1-flash-image",
  /** Image: Nano Banana Pro — professional asset production */
  imagePro: "gemini-3-pro-image",
  /** Image: Nano Banana — speed/efficiency (legacy) */
  imageFlash: "gemini-2.5-flash-image",
  /** Video: Veo 3.1 Preview */
  video: "veo-3.1-generate-preview",
  /** Video: Veo 3.1 Fast */
  videoFast: "veo-3.1-fast-generate-preview",
  /** Video: Veo 3.1 Lite */
  videoLite: "veo-3.1-lite-generate-preview",
  /** Agents: Deep Research */
  deepResearch: "deep-research-preview-04-2026",
  /** Agents: Deep Research Max */
  deepResearchMax: "deep-research-max-preview-04-2026",
  /** Agents: Antigravity managed agent */
  antigravity: "antigravity-preview-05-2026",
  /** Computer Use */
  computerUse: "gemini-2.5-computer-use-preview-10-2025",
} as const;

/** Default configuration from environment */
function defaultConfig(): GeminiConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY || "",
    textModel: GEMINI_MODELS.text,
    imageModel: GEMINI_MODELS.image,
    thinkingModel: GEMINI_MODELS.textPro,
    visionModel: GEMINI_MODELS.text,
  };
}

// ─── GoogleGenAI Client Factory ──────────────────────────────────────────────

let _client: GoogleGenAI | null = null;
let _clientConfig: GeminiConfig | null = null;

export function getGeminiClient(config?: Partial<GeminiConfig>): GoogleGenAI {
  const cfg = { ...defaultConfig(), ...config };
  if (!cfg.apiKey && !process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/app/apikey"
    );
  }
  if (_client && _clientConfig?.apiKey === cfg.apiKey) {
    return _client;
  }
  _client = new GoogleGenAI({ apiKey: cfg.apiKey });
  _clientConfig = cfg;
  return _client;
}

export function getGeminiConfig(): GeminiConfig {
  return { ...defaultConfig() };
}

// ─── Leviathan InferProvider Adapter ────────────────────────────────────────

/**
 * Gemini-backed InferProvider for the Leviathan agent loop.
 * Plug this into the runtime via:
 *
 *   import { createGeminiInferProvider } from "./services/gemini";
 *   const provider = createGeminiInferProvider();
 *   await tailFlick(provider, context);
 */
export function createGeminiInferProvider(
  config?: Partial<GeminiConfig>
): InferProvider {
  const client = getGeminiClient(config);
  const cfg = { ...defaultConfig(), ...config };

  return {
    name: "google-gemini",

    async infer(req: InferRequest): Promise<InferResponse> {
      const model = cfg.textModel || GEMINI_MODELS.text;
      const tools: Tool[] = [];

      // Enable Google Search grounding if requested
      if (req.tools?.includes("google_search")) {
        tools.push({ googleSearch: {} });
      }
      // Enable code execution if requested
      if (req.tools?.includes("code_execution")) {
        tools.push({ codeExecution: {} });
      }
      // Enable URL context if requested
      if (req.tools?.includes("url_context")) {
        tools.push({ urlContext: {} });
      }

      const genConfig: GenerateContentConfig = {
        systemInstruction: req.systemPrompt,
        temperature: undefined, // use defaults for Gemini 3.x
        topP: undefined,
        topK: undefined,
        thinkingConfig: req.thinkingLevel
          ? {
              thinkingLevel:
                req.thinkingLevel === "high"
                  ? ThinkingLevel.HIGH
                  : req.thinkingLevel === "low"
                    ? ThinkingLevel.LOW
                    : req.thinkingLevel === "minimal"
                      ? ThinkingLevel.MINIMAL
                      : ThinkingLevel.MEDIUM,
            }
          : undefined,
        tools: tools.length > 0 ? tools : undefined,
      };

      const contents: any[] = [];
      if (req.history) {
        for (const msg of req.history) {
          contents.push({
            role: msg.role,
            parts: [{ text: msg.content }],
          });
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: req.prompt }],
      });

      const response = await client.models.generateContent({
        model,
        contents,
        config: genConfig,
      });

      const text =
        response.candidates?.[0]?.content?.parts
          ?.filter((p: any) => p.text)
          ?.map((p: any) => p.text)
          ?.join("") || "";

      // Extract grounding metadata if available
      const groundingSources =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(
          (c: any) => ({
            title: c.web?.title || "",
            url: c.web?.uri || "",
          })
        ) || [];

      return {
        text,
        model: model,
        groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
          thoughtsTokens: response.usageMetadata?.thoughtsTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        },
      };
    },

    async inferWithImage(
      req: InferRequest & { imageData: Buffer; imageMimeType: string }
    ): Promise<InferResponse> {
      const model = cfg.visionModel || GEMINI_MODELS.text;

      const contents: any[] = [];
      if (req.history) {
        for (const msg of req.history) {
          contents.push({
            role: msg.role,
            parts: [{ text: msg.content }],
          });
        }
      }
      contents.push({
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: req.imageMimeType,
              data: req.imageData.toString("base64"),
            },
          },
          { text: req.prompt },
        ],
      });

      const response = await client.models.generateContent({
        model,
        contents,
      });

      const text =
        response.candidates?.[0]?.content?.parts
          ?.filter((p: any) => p.text)
          ?.map((p: any) => p.text)
          ?.join("") || "";

      return {
        text,
        model: model,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        },
      };
    },
  };
}

// ─── Image Generation (Nano Banana) ─────────────────────────────────────────

export interface ImageGenOptions {
  /** Resolution: "512", "1K", "2K", "4K". Default "1K" */
  resolution?: "512" | "1K" | "2K" | "4K";
  /** Aspect ratio e.g., "1:1", "16:9", "9:16", "4:3" */
  aspectRatio?:
    | "1:1"
    | "1:4"
    | "1:8"
    | "2:3"
    | "3:2"
    | "3:4"
    | "4:1"
    | "4:3"
    | "4:5"
    | "5:4"
    | "8:1"
    | "9:16"
    | "16:9"
    | "21:9";
  /** Model override */
  model?: string;
  /** Enable Google Search grounding for real-time data */
  enableSearchGrounding?: boolean;
  /** Enable Image Search grounding */
  enableImageSearch?: boolean;
  /** Enable Google Search for facts */
  enableWebSearch?: boolean;
  /** Thinking level: "minimal" (default for flash) or "high" */
  thinkingLevel?: "minimal" | "high";
  /** Include thought process in response */
  includeThoughts?: boolean;
  /** Output type: "TEXT_AND_IMAGE" (default) or "IMAGE" only */
  outputType?: "TEXT_AND_IMAGE" | "IMAGE";
}

export interface ImageGenResult {
  /** Saved file path */
  filePath: string;
  /** Image bytes */
  imageData: Buffer;
  /** MIME type */
  mimeType: string;
  /** Model used */
  model: string;
  /** Resolution */
  resolution: string;
  /** Grounding sources if search was enabled */
  groundingSources?: Array<{ title: string; url: string }>;
  /** Any text response */
  textResponse?: string;
  /** Total tokens used */
  totalTokens?: number;
}

/**
 * Generate an image using Nano Banana (Gemini 3.1 Flash Image).
 *
 * @param prompt - Detailed image description
 * @param outputPath - File path to save generated image
 * @param options - Generation options
 */
export async function generateImage(
  prompt: string,
  outputPath: string,
  options?: ImageGenOptions
): Promise<ImageGenResult> {
  const client = getGeminiClient();
  const model = options?.model || GEMINI_MODELS.image;
  const resolution = options?.resolution || "1K";
  const aspectRatio = options?.aspectRatio || "1:1";

  const tools: Tool[] = [];
  if (options?.enableSearchGrounding || options?.enableWebSearch) {
    const searchConfig: any = {};
    if (options.enableImageSearch) {
      searchConfig.searchTypes = {
        webSearch: {},
        imageSearch: {},
      };
    }
    tools.push({ googleSearch: searchConfig });
  }

  const config: GenerateContentConfig = {
    responseModalities:
      options?.outputType === "IMAGE" ? ["IMAGE"] : ["TEXT", "IMAGE"],
    ...(({
      responseFormat: {
        image: { aspectRatio, imageSize: resolution },
      },
    }) as any),
    tools: tools.length > 0 ? tools : undefined,
    thinkingConfig:
      options?.thinkingLevel
        ? {
            thinkingLevel: options.thinkingLevel === "high" ? ThinkingLevel.HIGH : ThinkingLevel.MINIMAL,
            includeThoughts: options?.includeThoughts || false,
          }
        : undefined,
  };

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config,
  });

  let imageData: Buffer | null = null;
  let mimeType = "image/png";
  let textResponse = "";

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageData = Buffer.from(part.inlineData.data!, "base64");
      mimeType = part.inlineData.mimeType || "image/png";
    } else if (part.text) {
      textResponse += part.text;
    }
  }

  if (!imageData) {
    throw new Error("No image data in response");
  }

  const fs = await import("fs/promises");
  const path = await import("path");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, imageData);

  const groundingSources =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(
      (c: any) => ({
        title: c.web?.title || "",
        url: c.web?.uri || "",
      })
    ) || [];

  return {
    filePath: outputPath,
    imageData,
    mimeType,
    model,
    resolution,
    groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
    textResponse: textResponse || undefined,
    totalTokens: response.usageMetadata?.totalTokenCount,
  };
}

/**
 * Edit an existing image using Nano Banana.
 *
 * @param prompt - Edit instructions
 * @param inputImagePath - Path to source image
 * @param outputPath - Path to save edited image
 * @param options - Generation options
 */
export async function editImage(
  prompt: string,
  inputImagePath: string,
  outputPath: string,
  options?: ImageGenOptions
): Promise<ImageGenResult> {
  const client = getGeminiClient();
  const model = options?.model || GEMINI_MODELS.image;
  const resolution = options?.resolution || "1K";
  const aspectRatio = options?.aspectRatio || "1:1";

  const fs = await import("fs/promises");
  const imageBytes = await fs.readFile(inputImagePath);
  const mimeType = inputImagePath.endsWith(".jpg") || inputImagePath.endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";

  const config: GenerateContentConfig = {
    responseModalities:
      options?.outputType === "IMAGE" ? ["IMAGE"] : ["TEXT", "IMAGE"],
    ...(({ responseFormat: { image: { aspectRatio, imageSize: resolution } } }) as any),
  };

  const response = await client.models.generateContent({
    model,
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: imageBytes.toString("base64"),
        },
      },
    ],
    config,
  });

  let imageData: Buffer | null = null;
  let textResponse = "";

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageData = Buffer.from(part.inlineData.data!, "base64");
    } else if (part.text) {
      textResponse += part.text;
    }
  }

  if (!imageData) {
    throw new Error("No image data in response");
  }

  const path = await import("path");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, imageData);

  return {
    filePath: outputPath,
    imageData,
    mimeType: "image/png",
    model,
    resolution,
    textResponse: textResponse || undefined,
    totalTokens: response.usageMetadata?.totalTokenCount,
  };
}

// ─── Video Generation (Veo) ─────────────────────────────────────────────────

export interface VideoGenOptions {
  /** Model override */
  model?: string;
  /** Duration: "4", "6", or "8" seconds */
  durationSeconds?: "4" | "6" | "8";
  /** Aspect ratio */
  aspectRatio?: "16:9" | "9:16";
  /** Resolution */
  resolution?: "720p" | "1080p" | "4k";
  /** Number of videos to generate */
  numberOfVideos?: number;
  /** Optional starting image */
  image?: Buffer;
  /** Optional starting image MIME type */
  imageMimeType?: string;
  /** Optional last frame for interpolation */
  lastFrame?: Buffer;
  /** Optional video for extension (from previous Veo generation) */
  videoForExtension?: {
    videoBytes: Buffer;
    mimeType: string;
  };
  /** Reference images (up to 3 for Veo 3.1) */
  referenceImages?: Array<{
    image: Buffer;
    mimeType: string;
    type?: "asset";
  }>;
  /** Poll interval in ms */
  pollIntervalMs?: number;
  /** Timeout in ms */
  timeoutMs?: number;
}

export interface VideoGenResult {
  /** Saved file path */
  filePath: string;
  /** Video bytes */
  videoData: Buffer;
  /** MIME type */
  mimeType: string;
  /** Model used */
  model: string;
}

/**
 * Generate a video using Veo 3.1.
 * Note: This is a long-running operation (11s to 6min).
 */
export async function generateVideo(
  prompt: string,
  outputPath: string,
  options?: VideoGenOptions
): Promise<VideoGenResult> {
  const client = getGeminiClient();
  const model = options?.model || GEMINI_MODELS.video;

  // Video generation is async — use the generateVideos operation
  const operation = await client.models.generateVideos({
    model,
    prompt,
    config: {
      aspectRatio: options?.aspectRatio || "16:9",
      resolution: options?.resolution || "720p",
      numberOfVideos: options?.numberOfVideos || 1,
    },
  });

  const pollMs = options?.pollIntervalMs || 10_000;
  const timeoutMs = options?.timeoutMs || 6 * 60 * 1000;
  const startTime = Date.now();

  // Poll until complete
  let currentOp = operation;
  while (!currentOp.done) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Video generation timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    currentOp = await client.operations.getVideosOperation({
      operation: currentOp,
    });
  }

  const generatedVideo = currentOp.response?.generatedVideos?.[0];
  if (!generatedVideo?.video) {
    throw new Error("No video in generation response");
  }

  const videoBytes = generatedVideo.video.videoBytes;
  if (!videoBytes) {
    throw new Error("No video bytes in generation response");
  }

  const buffer = Buffer.from(videoBytes);
  const fs = await import("fs/promises");
  const path = await import("path");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);

  return {
    filePath: outputPath,
    videoData: buffer,
    mimeType: "video/mp4",
    model,
  };
}

// ─── Deep Research Agent ─────────────────────────────────────────────────────

export interface DeepResearchOptions {
  /** Model: "deep-research" or "deep-research-max" */
  model?: string;
  /** Enable collaborative planning */
  collaborativePlanning?: boolean;
  /** Enable visualizations */
  visualization?: "auto" | "off";
  /** Enable thinking summaries in stream */
  thinkingSummaries?: "auto" | "none";
  /** Poll interval in ms */
  pollIntervalMs?: number;
  /** Timeout in ms (max 60 min research time) */
  timeoutMs?: number;
}

export interface DeepResearchResult {
  /** Final research output text */
  outputText: string;
  /** All interaction steps */
  steps: Array<{
    type: string;
    content?: Array<{ type: string; text?: string; data?: string }>;
    arguments?: any;
    result?: any;
  }>;
  /** Citations from research */
  citations?: Array<{ title: string; url: string }>;
  /** Number of search queries used */
  searchQueryCount?: number;
  /** Interaction ID */
  interactionId: string;
}

/**
 * Run a deep research task using Gemini Deep Research Agent.
 * This is a long-running operation (typically 5-20 minutes).
 */
export async function deepResearch(
  query: string,
  options?: DeepResearchOptions
): Promise<DeepResearchResult> {
  const client = getGeminiClient();
  const model = options?.model || GEMINI_MODELS.deepResearch;

  // Start background interaction
  const interaction = await (client.interactions.create as any)({
    agent: model,
    input: query,
    background: true,
    agentConfig: {
      type: "deep-research",
      thinkingSummaries: options?.thinkingSummaries || "auto",
      visualization: options?.visualization || "auto",
      collaborativePlanning: options?.collaborativePlanning || false,
    },
  });

  const pollMs = options?.pollIntervalMs || 10_000;
  const timeoutMs = options?.timeoutMs || 60 * 60 * 1000;
  const startTime = Date.now();

  // Poll until complete
  let result: any = interaction;
  while (result.status !== "completed" && result.status !== "failed") {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Deep research timed out (60 min max)");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    result = await client.interactions.get(interaction.id!);
  }

  if (result.status === "failed") {
    throw new Error(
      `Deep research failed: ${result.error || "Unknown error"}`
    );
  }

  // Extract citations from steps
  const citations: Array<{ title: string; url: string }> = [];
  let searchQueryCount = 0;

  for (const step of result.steps || []) {
    if (step.type === "google_search_call") {
      searchQueryCount += (step.arguments?.queries || []).length;
    }
    if (step.type === "model_output") {
      for (const content of step.content || []) {
        if (content.annotations) {
          for (const ann of content.annotations) {
            if (ann.type === "url_citation") {
              citations.push({ title: ann.title || "", url: ann.url || "" });
            }
          }
        }
      }
    }
  }

  return {
    outputText:
      result.outputText ||
      result.steps
        ?.filter((s: any) => s.type === "model_output")
        ?.flatMap((s: any) => s.content || [])
        ?.filter((c: any) => c.type === "text")
        ?.map((c: any) => c.text)
        ?.join("") ||
      "",
    steps: result.steps || [],
    citations: citations.length > 0 ? citations : undefined,
    searchQueryCount,
    interactionId: result.id || "",
  };
}

// ─── Managed Agents (Antigravity) ────────────────────────────────────────────

export interface ManagedAgentOptions {
  /** System instruction override */
  systemInstruction?: string;
  /** Tools override */
  tools?: Array<{ type: string; [key: string]: any }>;
  /** Environment sources */
  sources?: Array<{
    type: "inline" | "repository" | "gcs";
    target: string;
    content?: string;
    source?: string;
  }>;
  /** Network rules */
  network?: {
    allowlist?: Array<{
      domain: string;
      transform?: Record<string, string>;
    }>;
    disabled?: boolean;
  };
}

/**
 * Run a task using the Antigravity managed agent.
 * The agent provisions a Linux sandbox, runs the agent loop, and returns results.
 */
export async function runManagedAgent(
  task: string,
  options?: ManagedAgentOptions
): Promise<{
  outputText: string;
  interactionId: string;
  environmentId: string;
  steps: any[];
}> {
  const client = getGeminiClient();

  const interaction: any = await (client.interactions.create as any)({
    agent: GEMINI_MODELS.antigravity,
    input: task,
    system_instruction: options?.systemInstruction,
    environment: {
      type: "remote",
      sources: options?.sources,
      network: options?.network,
    },
    tools: options?.tools,
  });

  return {
    outputText: interaction.outputText || "",
    interactionId: interaction.id || "",
    environmentId: interaction.environmentId || "",
    steps: interaction.steps || [],
  };
}

// ─── Computer Use ────────────────────────────────────────────────────────────

export interface ComputerUseStep {
  type: string;
  name?: string;
  arguments?: Record<string, any>;
  text?: string;
  safetyDecision?: {
    decision: string;
    explanation: string;
  };
}

/**
 * Start a Computer Use session.
 * Returns an interaction that the caller polls for function calls.
 */
export async function startComputerUse(
  goal: string,
  initialScreenshot?: { data: Buffer; mimeType: string },
  options?: {
    model?: string;
    systemInstruction?: string;
    excludedActions?: string[];
    environment?: "browser";
  }
): Promise<{
  interaction: any;
  steps: ComputerUseStep[];
}> {
  const client = getGeminiClient();
  const model = options?.model || GEMINI_MODELS.computerUse;

  const input: any[] = [{ type: "text", text: goal }];
  if (initialScreenshot) {
    input.push({
      type: "image",
      data: initialScreenshot.data.toString("base64"),
      mimeType: initialScreenshot.mimeType,
    });
  }

  const tools: any[] = [
    {
      type: "computer_use",
      environment: options?.environment || "browser",
      excludedPredefinedFunctions: options?.excludedActions,
    },
  ];

  const interaction: any = await (client.interactions.create as any)({
    model,
    input,
    system_instruction: options?.systemInstruction,
    tools,
  });

  const steps: ComputerUseStep[] = [];
  for (const step of (interaction.steps || []) as any[]) {
    steps.push({
      type: step.type,
      name: step.name,
      arguments: step.arguments,
      text: step.content
        ?.filter((c: any) => c.type === "text")
        ?.map((c: any) => c.text)
        ?.join(""),
    });
  }

  return { interaction, steps };
}

/**
 * Continue a Computer Use session with new screenshot.
 */
export async function continueComputerUse(
  previousInteractionId: string,
  goal: string,
  screenshot: { data: Buffer; mimeType: string },
  options?: {
    model?: string;
    systemInstruction?: string;
    excludedActions?: string[];
    environment?: "browser";
  }
): Promise<{
  interaction: any;
  steps: ComputerUseStep[];
}> {
  const client = getGeminiClient();
  const model = options?.model || GEMINI_MODELS.computerUse;

  const tools: any[] = [
    {
      type: "computer_use",
      environment: options?.environment || "browser",
      excludedPredefinedFunctions: options?.excludedActions,
    },
  ];

  const interaction: any = await (client.interactions.create as any)({
    model,
    input: [
      { type: "text", text: goal },
      {
        type: "image",
        data: screenshot.data.toString("base64"),
        mimeType: screenshot.mimeType,
      },
    ],
    system_instruction: options?.systemInstruction,
    previousInteractionId,
    tools,
  });

  const steps: ComputerUseStep[] = [];
  for (const step of (interaction.steps || []) as any[]) {
    steps.push({
      type: step.type,
      name: step.name,
      arguments: step.arguments,
      text: step.content
        ?.filter((c: any) => c.type === "text")
        ?.map((c: any) => c.text)
        ?.join(""),
    });
  }

  return { interaction, steps };
}

// ─── Utility: Check API Key ──────────────────────────────────────────────────

export function checkGeminiApiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY);
}

export function getGeminiApiKeySetupUrl(): string {
  return "https://aistudio.google.com/app/apikey";
}