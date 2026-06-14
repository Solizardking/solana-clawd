/**
 * XAI (Grok) AI service integration — Grok 4.3 + tools
 *
 * Wraps the xAI REST API (chat completions + responses + image + video + tts).
 * Adds support for:
 *  - Grok 4.3 natural-language responses (with reasoning_effort)
 *  - Built-in agentic tools: web_search, code_execution
 *  - Vision (image_url content parts)
 *  - Image generation (grok-imagine-image-quality)
 *  - Video generation (grok-imagine-video) — async polling helpers
 *  - Multi-agent (grok-4.20-multi-agent)
 */

import OpenAI from "openai";
import { getLogger } from "../util";

const logger = getLogger("GrokAI");

const XAI_BASE_URL = "https://api.x.ai/v1";

export const openai = new OpenAI({
  baseURL: XAI_BASE_URL,
  apiKey: process.env.XAI_API_KEY,
});

export enum GrokModel {
  GROK_4_3 = "grok-4.3",
  GROK_4 = "grok-4",
  GROK_3 = "grok-3-latest",
  GROK_3_FAST = "grok-3-fast-latest",
  GROK_3_MINI = "grok-3-mini-beta",
  GROK_3_MINI_FAST = "grok-3-mini-fast-beta",
  GROK_VISION = "grok-4",
  GROK_MULTI_AGENT = "grok-4.20-multi-agent",
  GROK_IMAGINE_IMAGE = "grok-imagine-image-quality",
  GROK_IMAGINE_VIDEO = "grok-imagine-video",
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ChatSystemMessage {
  role: "system";
  content: string;
}
export interface ChatUserTextMessage {
  role: "user";
  content: string;
}
export interface ChatUserImageMessage {
  role: "user";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" } }
  >;
}
export interface ChatAssistantMessage {
  role: "assistant";
  content: string;
}
export type ChatMessage =
  | ChatSystemMessage
  | ChatUserTextMessage
  | ChatUserImageMessage
  | ChatAssistantMessage;

export type GrokTool =
  | {
      type: "web_search";
      filters?: {
        allowed_domains?: string[];
        excluded_domains?: string[];
      };
      enable_image_understanding?: boolean;
      enable_image_search?: boolean;
    }
  | {
      type: "x_search";
      allowed_x_handles?: string[];
      excluded_x_handles?: string[];
      from_date?: string;
      to_date?: string;
      enable_image_understanding?: boolean;
      enable_video_understanding?: boolean;
    }
  | { type: "code_execution" };

export interface ChatCompletionOptions {
  model?: GrokModel | string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "json_object" } | { type: "text" };
  tools?: GrokTool[];
  reasoning_effort?: ReasoningEffort;
  promptCacheKey?: string;
}

/** Build the request body shared by chat & streaming. */
function buildBody(options: ChatCompletionOptions) {
  const body: any = {
    model: options.model ?? GrokModel.GROK_4_3,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
  };
  if (options.max_tokens) body.max_tokens = options.max_tokens;
  if (options.response_format) body.response_format = options.response_format;
  if (options.tools && options.tools.length > 0) body.tools = options.tools;
  if (options.reasoning_effort) {
    body.reasoning_effort = options.reasoning_effort;
  }
  return body;
}

function requestOptions(options: Pick<ChatCompletionOptions, "promptCacheKey">) {
  const promptCacheKey = options.promptCacheKey?.trim();
  if (!promptCacheKey) return undefined;
  return { headers: { "x-grok-conv-id": promptCacheKey } };
}

export async function generateCompletion(
  options: ChatCompletionOptions
): Promise<{
  content: string;
  citations?: any[];
  tool_calls?: any[];
  usage?: any;
}> {
  logger.info(`Generating completion with model: ${options.model ?? GrokModel.GROK_4_3}`);
  const body = buildBody(options);
  const completion = await openai.chat.completions.create(body, requestOptions(options) as any);
  const message: any = completion.choices[0].message;
  return {
    content: message.content || "",
    citations: (completion as any).citations,
    tool_calls: message.tool_calls,
    usage: completion.usage,
  };
}

export async function* generateCompletionStream(options: ChatCompletionOptions) {
  logger.info(
    `Streaming completion with model: ${options.model ?? GrokModel.GROK_4_3}`
  );
  const body = { ...buildBody(options), stream: true };
  const stream: any = await openai.chat.completions.create(body, requestOptions(options) as any);
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) yield { type: "text", text: delta.content };
    if ((delta as any).reasoning_content)
      yield { type: "reasoning", text: (delta as any).reasoning_content };
    if (delta.tool_calls)
      yield { type: "tool_calls", tool_calls: delta.tool_calls };
  }
}

export async function analyzeImage(
  imageUrl: string,
  prompt: string,
  model: string = GrokModel.GROK_VISION
): Promise<string> {
  logger.info("Analyzing image with Grok vision model");
  const message: ChatUserImageMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: prompt || "Analyze this image and describe what you see in detail.",
      },
      { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
    ],
  };
  const response = await openai.chat.completions.create({
    model,
    messages: [message] as any,
    max_tokens: 1500,
  });
  return response.choices[0].message.content || "";
}

export async function generateJson<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T> {
  const messages: ChatMessage[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  const completion = await openai.chat.completions.create({
    model: GrokModel.GROK_4_3,
    messages: messages as any,
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return JSON.parse(completion.choices[0].message.content || "{}") as T;
}

export interface ReasoningCompletionOptions {
  model?: GrokModel.GROK_3_MINI | GrokModel.GROK_3_MINI_FAST | GrokModel.GROK_4_3;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: ReasoningEffort;
}

export async function generateReasoningCompletion(
  options: ReasoningCompletionOptions
): Promise<{
  content: string;
  reasoning_content: string;
  completion_tokens?: number;
  reasoning_tokens?: number;
}> {
  const body: any = {
    model: options.model ?? GrokModel.GROK_4_3,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 1500,
    reasoning_effort: options.reasoning_effort ?? "high",
  };
  const completion = await openai.chat.completions.create(body);
  const message: any = completion.choices[0].message;
  return {
    content: message.content || "",
    reasoning_content: message.reasoning_content || "",
    completion_tokens: completion.usage?.completion_tokens,
    reasoning_tokens: (completion.usage as any)?.completion_tokens_details
      ?.reasoning_tokens,
  };
}

// ----------------------- Image Generation -----------------------

export interface ImageGenOptions {
  prompt: string;
  n?: number;
  aspect_ratio?: string;
  resolution?: "1k" | "2k";
  response_format?: "url" | "b64_json";
  image_url?: string;
  image_urls?: string[];
  image_file_id?: string;
  image_file_ids?: string[];
  images?: Array<{ url?: string; file_id?: string }>;
  storage_options?: {
    filename: string;
    expires_after?: number;
    public_url?: boolean | { expires_after?: number };
  };
}

type XaiMediaRef = { url?: string; file_id?: string };

function hasXaiMediaRef(item: XaiMediaRef): item is XaiMediaRef {
  return Boolean(item.url || item.file_id);
}

export async function generateImage(opts: ImageGenOptions) {
  const imageInputs = ([
    ...(opts.images ?? []),
    ...(opts.image_urls ?? []).map((url) => ({ url })),
    ...(opts.image_file_ids ?? []).map((file_id) => ({ file_id })),
    ...(opts.image_url ? [{ url: opts.image_url }] : []),
    ...(opts.image_file_id ? [{ file_id: opts.image_file_id }] : []),
  ] as XaiMediaRef[]).filter(hasXaiMediaRef);
  const isEdit = imageInputs.length > 0;
  const body: any = {
    model: GrokModel.GROK_IMAGINE_IMAGE,
    prompt: opts.prompt,
    response_format: opts.response_format ?? "url",
  };
  if (!isEdit) body.n = Math.min(Math.max(1, opts.n ?? 1), 4);
  if (opts.aspect_ratio) body.aspect_ratio = opts.aspect_ratio;
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.storage_options) body.storage_options = opts.storage_options;
  if (isEdit) {
    if (imageInputs.length === 1) body.image = imageInputs[0];
    else body.images = imageInputs;
  }

  const r = await fetch(`${XAI_BASE_URL}/images/${isEdit ? "edits" : "generations"}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Image gen failed (${r.status}): ${err}`);
  }
  const data = (await r.json()) as { data: any[] };
  return data.data.map((img: any) => ({
    url: img.url,
    b64_json: img.b64_json,
    revisedPrompt: img.revised_prompt,
    file_output: img.file_output,
    public_url: img.public_url ?? img.file_output?.public_url,
    public_url_error: img.public_url_error ?? img.file_output?.public_url_error,
    model: img.model,
  }));
}

// ----------------------- Video Generation -----------------------

export interface VideoGenOptions {
  prompt: string;
  duration?: number;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  resolution?: "480p" | "720p";
  image_url?: string;
  image_file_id?: string;
  video_url?: string;
  video_file_id?: string;
  reference_image_urls?: string[];
  reference_image_file_ids?: string[];
  reference_images?: Array<{ url?: string; file_id?: string }>;
  storage_options?: {
    filename: string;
    expires_after?: number;
    public_url?: boolean | { expires_after?: number };
  };
  mode?: "edit" | "extend" | "reference";
}

function mediaRef(url?: string, fileId?: string) {
  if (fileId) return { file_id: fileId };
  if (url) return { url };
  return null;
}

export async function startVideoGeneration(opts: VideoGenOptions) {
  let endpoint = `${XAI_BASE_URL}/videos/generations`;
  const body: any = {
    model: GrokModel.GROK_IMAGINE_VIDEO,
    prompt: opts.prompt,
  };
  if (opts.duration) body.duration = opts.duration;
  if (opts.aspect_ratio) body.aspect_ratio = opts.aspect_ratio;
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.storage_options) body.storage_options = opts.storage_options;

  const video = mediaRef(opts.video_url, opts.video_file_id);
  const image = mediaRef(opts.image_url, opts.image_file_id);
  const referenceImages = ([
    ...(opts.reference_images ?? []),
    ...(opts.reference_image_urls ?? []).map((url) => ({ url })),
    ...(opts.reference_image_file_ids ?? []).map((file_id) => ({ file_id })),
  ] as XaiMediaRef[]).filter(hasXaiMediaRef);

  if (opts.mode === "edit" && video) {
    endpoint = `${XAI_BASE_URL}/videos/edits`;
    body.video = video;
    delete body.duration;
    delete body.aspect_ratio;
    delete body.resolution;
  } else if (opts.mode === "extend" && video) {
    endpoint = `${XAI_BASE_URL}/videos/extensions`;
    body.video = video;
  } else if ((opts.mode === "reference" || referenceImages.length > 0) && referenceImages.length) {
    body.reference_images = referenceImages;
  } else if (image) {
    body.image = image;
  }

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Video start failed (${r.status}): ${err}`);
  }
  return (await r.json()) as { request_id: string };
}

export async function getVideoStatus(requestId: string) {
  const r = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Status check failed (${r.status})`);
  return (await r.json()) as {
    status: "pending" | "done" | "expired" | "failed";
    video?: {
      url: string;
      duration: number;
      file_output?: {
        file_id?: string;
        filename?: string;
        public_url?: string;
        public_url_error?: string;
      };
    };
    model?: string;
  };
}

export default {
  GrokModel,
  generateCompletion,
  generateCompletionStream,
  analyzeImage,
  generateJson,
  generateReasoningCompletion,
  generateImage,
  startVideoGeneration,
  getVideoStatus,
};
