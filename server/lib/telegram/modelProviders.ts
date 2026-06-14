import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  GOOGLE_AI_KEY_ENV_NAMES,
  GOOGLE_PROJECT_ENV_NAMES,
  getGoogleApiKey,
  getGoogleCloudLocation,
  getGoogleCloudProject,
  isGoogleVertexExplicitlyEnabled,
  shouldUseGoogleVertex,
} from "../google-env";
import { OPENROUTER_API_BASE_URL, getOpenRouterAttributionHeaders } from "../openrouter-attribution";

export type TelegramProviderId = "google" | "openai" | "xai" | "openrouter" | "deepseek";

export interface TelegramModelSelection {
  provider: TelegramProviderId;
  model: string;
}

export interface TelegramModelOption {
  id: string;
  label: string;
  text: boolean;
  vision: boolean;
  documents?: boolean;
}

export interface TelegramProviderStatus {
  id: TelegramProviderId;
  label: string;
  configured: boolean;
  keyNames: string[];
  defaultTextModel: string;
  defaultVisionModel?: string;
  models: TelegramModelOption[];
}

export interface TelegramMediaInput {
  data: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface TelegramProviderResult {
  provider: TelegramProviderId;
  providerLabel: string;
  model: string;
  text: string;
  usedFallback?: boolean;
}

const PROVIDER_ORDER: TelegramProviderId[] = ["google", "openrouter", "xai", "openai", "deepseek"];

const DEFAULT_TEXT_SYSTEM =
  "You are CLAWD, a concise AI assistant inside Cheshire Terminal's Telegram bot. " +
  "Answer directly, preserve useful numbers, and keep the response readable on mobile.";

const DEFAULT_VISION_SYSTEM =
  "You are CLAWD, a multimodal assistant inside Cheshire Terminal's Telegram bot. " +
  "For screenshots, charts, documents, and images, extract the important details, explain what matters, " +
  "and call out uncertainty instead of inventing missing data.";

function googleConfigured(): boolean {
  return Boolean(
    getGoogleApiKey() ||
    getGoogleCloudProject() ||
    isGoogleVertexExplicitlyEnabled(),
  );
}

function googleClient(): GoogleGenAI {
  const apiKey = getGoogleApiKey();
  if (apiKey) {
    return new GoogleGenAI({ vertexai: false, apiKey });
  }

  if (shouldUseGoogleVertex()) {
    const project = getGoogleCloudProject();
    if (!project) throw new Error("A Google Cloud project ID is required for Vertex AI");
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: getGoogleCloudLocation(),
    });
  }

  throw new Error("Google Gemini API key is not configured");
}

function openAiCompatibleClient(provider: TelegramProviderId): OpenAI {
  if (provider === "xai") {
    if (!process.env.XAI_API_KEY) throw new Error("XAI_API_KEY is not configured");
    return new OpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY,
    });
  }

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CLAWDROUTER_OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
    return new OpenAI({
      baseURL: OPENROUTER_API_BASE_URL,
      apiKey,
      defaultHeaders: getOpenRouterAttributionHeaders(),
    });
  }

  if (provider === "deepseek") {
    if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured");
    return new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }

  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function getTelegramProviderCatalog(): TelegramProviderStatus[] {
  const googleText = process.env.TELEGRAM_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const googleVision = process.env.TELEGRAM_GEMINI_VISION_MODEL || googleText;
  const openAiText = process.env.TELEGRAM_OPENAI_MODEL || "gpt-4o-mini";
  const openAiVision = process.env.TELEGRAM_OPENAI_VISION_MODEL || openAiText;
  const xaiText = process.env.TELEGRAM_GROK_MODEL || process.env.XAI_GROK_MODEL || "grok-4.3";
  const xaiVision = process.env.TELEGRAM_GROK_VISION_MODEL || xaiText;
  const openRouterText = process.env.TELEGRAM_OPENROUTER_MODEL || "google/gemini-2.5-flash";
  const openRouterVision = process.env.TELEGRAM_OPENROUTER_VISION_MODEL || openRouterText;
  const deepSeekText = process.env.TELEGRAM_DEEPSEEK_MODEL || "deepseek-chat";

  return [
    {
      id: "google",
      label: "Google Gemini",
      configured: googleConfigured(),
      keyNames: [...GOOGLE_AI_KEY_ENV_NAMES, ...GOOGLE_PROJECT_ENV_NAMES, "GOOGLE_GENAI_USE_VERTEXAI"],
      defaultTextModel: googleText,
      defaultVisionModel: googleVision,
      models: uniqueModels([
        { id: googleText, label: googleText, text: true, vision: true, documents: true },
        { id: googleVision, label: `${googleVision} vision`, text: true, vision: true, documents: true },
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", text: true, vision: true, documents: true },
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", text: true, vision: true, documents: true },
        { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", text: true, vision: true, documents: true },
      ]),
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      configured: Boolean(process.env.OPENROUTER_API_KEY || process.env.CLAWDROUTER_OPENROUTER_API_KEY),
      keyNames: ["OPENROUTER_API_KEY", "CLAWDROUTER_OPENROUTER_API_KEY"],
      defaultTextModel: openRouterText,
      defaultVisionModel: openRouterVision,
      models: uniqueModels([
        { id: openRouterText, label: openRouterText, text: true, vision: true, documents: false },
        { id: openRouterVision, label: `${openRouterVision} vision`, text: true, vision: true, documents: false },
        { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", text: true, vision: true, documents: false },
        { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", text: true, vision: true, documents: false },
        { id: "x-ai/grok-4", label: "Grok 4", text: true, vision: true, documents: false },
      ]),
    },
    {
      id: "xai",
      label: "xAI Grok",
      configured: Boolean(process.env.XAI_API_KEY),
      keyNames: ["XAI_API_KEY"],
      defaultTextModel: xaiText,
      defaultVisionModel: xaiVision,
      models: uniqueModels([
        { id: xaiText, label: xaiText, text: true, vision: true, documents: false },
        { id: xaiVision, label: `${xaiVision} vision`, text: true, vision: true, documents: false },
        { id: "grok-4.3", label: "Grok 4.3", text: true, vision: true, documents: false },
        { id: "grok-4", label: "Grok 4", text: true, vision: true, documents: false },
      ]),
    },
    {
      id: "openai",
      label: "OpenAI",
      configured: Boolean(process.env.OPENAI_API_KEY),
      keyNames: ["OPENAI_API_KEY"],
      defaultTextModel: openAiText,
      defaultVisionModel: openAiVision,
      models: uniqueModels([
        { id: openAiText, label: openAiText, text: true, vision: true, documents: false },
        { id: openAiVision, label: `${openAiVision} vision`, text: true, vision: true, documents: false },
        { id: "gpt-4o-mini", label: "GPT-4o Mini", text: true, vision: true, documents: false },
        { id: "gpt-4o", label: "GPT-4o", text: true, vision: true, documents: false },
      ]),
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      keyNames: ["DEEPSEEK_API_KEY"],
      defaultTextModel: deepSeekText,
      models: uniqueModels([
        { id: deepSeekText, label: deepSeekText, text: true, vision: false },
        { id: "deepseek-chat", label: "DeepSeek Chat", text: true, vision: false },
        { id: "deepseek-reasoner", label: "DeepSeek Reasoner", text: true, vision: false },
      ]),
    },
  ];
}

function uniqueModels(models: TelegramModelOption[]): TelegramModelOption[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export function getProviderStatus(providerId: TelegramProviderId): TelegramProviderStatus | undefined {
  return getTelegramProviderCatalog().find((provider) => provider.id === providerId);
}

export function getDefaultTelegramSelection(): TelegramModelSelection {
  const catalog = getTelegramProviderCatalog();
  const provider = PROVIDER_ORDER.map((id) => catalog.find((entry) => entry.id === id))
    .find((entry): entry is TelegramProviderStatus => Boolean(entry?.configured));

  if (!provider) {
    return { provider: "google", model: process.env.TELEGRAM_GEMINI_MODEL || "gemini-2.5-flash" };
  }

  return { provider: provider.id, model: provider.defaultTextModel };
}

export function normalizeTelegramSelection(selection?: Partial<TelegramModelSelection> | null): TelegramModelSelection {
  const fallback = getDefaultTelegramSelection();
  const providerId = selection?.provider || fallback.provider;
  const provider = getProviderStatus(providerId) || getProviderStatus(fallback.provider);
  if (!provider) return fallback;

  const selectedModel = selection?.model || provider.defaultTextModel;
  const knownModel = provider.models.find((model) => model.id === selectedModel);
  return {
    provider: provider.id,
    model: knownModel?.id || provider.defaultTextModel,
  };
}

export function providerLabel(providerId: TelegramProviderId): string {
  return getProviderStatus(providerId)?.label || providerId;
}

export function modelCapabilities(selection: TelegramModelSelection): TelegramModelOption | undefined {
  const provider = getProviderStatus(selection.provider);
  return provider?.models.find((model) => model.id === selection.model);
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

export function isTextLikeMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return lower.startsWith("text/") ||
    lower === "application/json" ||
    lower === "application/csv" ||
    lower === "application/x-ndjson" ||
    lower === "application/xml" ||
    lower === "application/javascript";
}

export function canHandleDocumentInline(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return isImageMime(lower) ||
    isTextLikeMime(lower) ||
    lower === "application/pdf" ||
    lower === "text/csv";
}

export async function runTelegramText(
  selection: Partial<TelegramModelSelection> | null | undefined,
  prompt: string,
  system?: string,
): Promise<TelegramProviderResult> {
  const resolved = normalizeTelegramSelection(selection);
  const provider = getProviderStatus(resolved.provider);
  if (!provider?.configured) {
    throw new Error(`${provider?.label || resolved.provider} is not configured. Add ${provider?.keyNames.join(" or ") || "an API key"}.`);
  }

  if (resolved.provider === "google") {
    const text = await runGoogleText(resolved.model, prompt, system);
    return toResult(resolved, text);
  }

  const text = await runOpenAiCompatibleText(resolved.provider, resolved.model, prompt, system);
  return toResult(resolved, text);
}

export async function runTelegramVision(
  selection: Partial<TelegramModelSelection> | null | undefined,
  prompt: string,
  media: TelegramMediaInput,
  system?: string,
): Promise<TelegramProviderResult> {
  const requested = normalizeTelegramSelection(selection);
  const resolved = resolveVisionSelection(requested, media.mimeType);
  const usedFallback = resolved.provider !== requested.provider || resolved.model !== requested.model;
  const provider = getProviderStatus(resolved.provider);
  if (!provider?.configured) {
    throw new Error(`${provider?.label || resolved.provider} is not configured for vision.`);
  }

  if (!isImageMime(media.mimeType) && !canHandleDocumentInline(media.mimeType)) {
    throw new Error(`Unsupported document type: ${media.mimeType || "unknown"}`);
  }

  if (resolved.provider === "google") {
    const text = await runGoogleVision(resolved.model, prompt, media, system);
    return toResult(resolved, text, usedFallback);
  }

  if (!isImageMime(media.mimeType)) {
    throw new Error(`${provider.label} vision only supports image uploads in this Telegram flow. Switch to Google Gemini for documents.`);
  }

  const text = await runOpenAiCompatibleVision(resolved.provider, resolved.model, prompt, media, system);
  return toResult(resolved, text, usedFallback);
}

function resolveVisionSelection(selection: TelegramModelSelection, mimeType: string): TelegramModelSelection {
  const provider = getProviderStatus(selection.provider);
  const model = modelCapabilities(selection);
  const image = isImageMime(mimeType);

  if (provider?.configured && model?.vision && (image || model.documents)) {
    return selection;
  }

  const google = getProviderStatus("google");
  if (google?.configured) {
    return { provider: "google", model: google.defaultVisionModel || google.defaultTextModel };
  }

  if (image) {
    const fallback = getTelegramProviderCatalog().find((entry) =>
      entry.configured && entry.models.some((modelOption) => modelOption.vision),
    );
    if (fallback) {
      const visionModel = fallback.models.find((modelOption) => modelOption.vision);
      return { provider: fallback.id, model: visionModel?.id || fallback.defaultVisionModel || fallback.defaultTextModel };
    }
  }

  return selection;
}

async function runGoogleText(model: string, prompt: string, system?: string): Promise<string> {
  const response = await googleClient().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: system || DEFAULT_TEXT_SYSTEM,
      temperature: 0.6,
      maxOutputTokens: 1400,
    },
  });

  return extractGeminiText(response);
}

async function runGoogleVision(
  model: string,
  prompt: string,
  media: TelegramMediaInput,
  system?: string,
): Promise<string> {
  const parts: any[] = [{ text: buildMediaPrompt(prompt, media) }];

  if (isTextLikeMime(media.mimeType) && media.data.length <= 750_000) {
    parts.push({ text: media.data.toString("utf8") });
  } else {
    parts.push({
      inlineData: {
        mimeType: media.mimeType || "application/octet-stream",
        data: media.data.toString("base64"),
      },
    });
  }

  const response = await googleClient().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system || DEFAULT_VISION_SYSTEM,
      temperature: 0.3,
      maxOutputTokens: 1800,
    },
  });

  return extractGeminiText(response);
}

async function runOpenAiCompatibleText(
  provider: TelegramProviderId,
  model: string,
  prompt: string,
  system?: string,
): Promise<string> {
  const completion = await openAiCompatibleClient(provider).chat.completions.create({
    model,
    messages: [
      { role: "system", content: system || DEFAULT_TEXT_SYSTEM },
      { role: "user", content: prompt },
    ],
    max_tokens: 1200,
    temperature: 0.6,
  } as any);

  return completion.choices[0]?.message?.content?.trim() || "No response.";
}

async function runOpenAiCompatibleVision(
  provider: TelegramProviderId,
  model: string,
  prompt: string,
  media: TelegramMediaInput,
  system?: string,
): Promise<string> {
  const completion = await openAiCompatibleClient(provider).chat.completions.create({
    model,
    messages: [
      { role: "system", content: system || DEFAULT_VISION_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: buildMediaPrompt(prompt, media) },
          {
            type: "image_url",
            image_url: {
              url: `data:${media.mimeType};base64,${media.data.toString("base64")}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1600,
    temperature: 0.35,
  } as any);

  return completion.choices[0]?.message?.content?.trim() || "No response.";
}

function buildMediaPrompt(prompt: string, media: TelegramMediaInput): string {
  const label = media.fileName ? `File: ${media.fileName}\n` : "";
  return `${label}MIME type: ${media.mimeType || "unknown"}\n\n${prompt}`;
}

function extractGeminiText(response: unknown): string {
  const directText = (response as { text?: string })?.text;
  if (typeof directText === "string" && directText.trim()) return directText.trim();

  const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((part: any) => part?.text && !part?.thought)
    .map((part: any) => part.text)
    .join("\n")
    .trim();
  return text || "No response.";
}

function toResult(selection: TelegramModelSelection, text: string, usedFallback = false): TelegramProviderResult {
  return {
    provider: selection.provider,
    providerLabel: providerLabel(selection.provider),
    model: selection.model,
    text,
    usedFallback,
  };
}
