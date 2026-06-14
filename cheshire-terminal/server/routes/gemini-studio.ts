import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  getGoogleApiKey,
  getGoogleCloudLocation,
  getGoogleCloudProject,
  shouldUseGoogleVertex,
} from "../lib/google-env";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function getClient(): GoogleGenAI {
  const apiKey = getGoogleApiKey();
  if (apiKey) {
    return new GoogleGenAI({ vertexai: false, apiKey });
  }

  if (shouldUseGoogleVertex()) {
    const project = getGoogleCloudProject();
    if (!project) throw Object.assign(new Error("A Google Cloud project ID is required for Vertex AI"), { statusCode: 500 });
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: getGoogleCloudLocation(),
    });
  }

  throw Object.assign(new Error("Google Gemini API key is not configured"), { statusCode: 500 });
}

const imageRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().default("gemini-3.1-flash-image-preview"),
  aspectRatio: z.string().default("1:1"),
  imageSize: z.string().default("2K"),
  sourceImageUrls: z.array(z.string().url()).max(4).optional().default([]),
  useWebSearch: z.boolean().optional().default(false),
  useImageSearch: z.boolean().optional().default(false),
  includeThoughts: z.boolean().optional().default(false),
  thinkingLevel: z.enum(["minimal", "high"]).optional().default("minimal"),
});

const createCacheSchema = z.object({
  model: z.string().default("models/gemini-3-flash-preview"),
  displayName: z.string().optional(),
  systemInstruction: z.string().optional(),
  contents: z.string().min(1),
  ttl: z.string().optional(),
});

const updateCacheSchema = z.object({
  ttl: z.string().optional(),
  expireTime: z.string().optional(),
}).refine((value) => Boolean(value.ttl || value.expireTime), {
  message: "ttl or expireTime is required",
});

const generateFromCacheSchema = z.object({
  model: z.string().default("models/gemini-3-flash-preview"),
  cacheName: z.string().min(1),
  prompt: z.string().min(1),
});

// Raw REST fallback for cache operations not yet in the SDK
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODELS = ["veo-3.1-generate-preview", "veo-3.1-generate-fast-preview"];

const videoRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().default("veo-3.1-generate-preview"),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
});

const chatRequestSchema = z.object({
  model: z.string().default("gemini-2.5-flash"),
  messages: z.array(z.object({
    role: z.enum(["user", "model"]),
    text: z.string(),
  })).min(1),
  systemInstruction: z.string().optional(),
});

async function geminiFetch(path: string, init: RequestInit = {}) {
  const apiKey = getGoogleApiKey();
  if (!apiKey) throw Object.assign(new Error("Google Gemini API key is not configured"), { statusCode: 500 });
  const url = `${API_BASE}${path}${path.includes("?") ? "&" : "?"}key=${apiKey}`;
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Gemini API error (${response.status})`);
  }
  return response.json();
}

function guessMimeType(url: string, fallback?: string | null) {
  if (fallback?.startsWith("image/")) return fallback;
  const lower = url.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function urlToInlinePart(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch reference image: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return {
    inline_data: {
      mime_type: guessMimeType(url, response.headers.get("content-type")),
      data: base64,
    },
  };
}

router.post("/generate-image", async (req, res) => {
  try {
    const parsed = imageRequestSchema.parse(req.body || {});

    const parts: any[] = [{ text: parsed.prompt }];
    for (const sourceUrl of parsed.sourceImageUrls) {
      parts.push(await urlToInlinePart(sourceUrl));
    }

    const tools: any[] = [];
    if (parsed.useWebSearch || parsed.useImageSearch) {
      tools.push({
        googleSearch: {
          searchTypes: {
            ...(parsed.useWebSearch ? { webSearch: {} } : {}),
            ...(parsed.useImageSearch ? { imageSearch: {} } : {}),
          },
        },
      });
    }

    const client = getClient();
    const response = await client.models.generateContent({
      model: parsed.model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        ...(tools.length ? { tools } : {}),
        thinkingConfig: {
          thinkingBudget: parsed.thinkingLevel === "high" ? 8192 : 512,
          includeThoughts: parsed.includeThoughts,
        },
      },
    });

    const candidate = (response as any)?.candidates?.[0];
    const responseParts: any[] = candidate?.content?.parts ?? [];

    const images = responseParts
      .filter((p: any) => p?.inlineData?.data && !p?.thought)
      .map((p: any) => ({
        mimeType: p.inlineData.mimeType || "image/png",
        b64: p.inlineData.data,
        thoughtSignature: p.thoughtSignature,
      }));
    const thoughts = responseParts
      .filter((p: any) => p?.thought)
      .map((p: any) => ({ text: p.text || "", hasImage: Boolean(p.inlineData?.data) }));
    const text = responseParts
      .filter((p: any) => p?.text && !p?.thought)
      .map((p: any) => p.text)
      .join("\n")
      .trim();

    const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];

    res.json({
      model: parsed.model,
      text,
      images,
      thoughts,
      groundingMetadata: candidate?.groundingMetadata || null,
      groundingSources: groundingChunks
        .map((chunk: any) => chunk?.web || chunk)
        .filter((chunk: any) => chunk?.uri)
        .map((chunk: any) => ({
          uri: chunk.uri,
          title: chunk.title || chunk.uri,
          imageUri: chunk.imageUri || chunk.image_uri,
        })),
      usageMetadata: (response as any)?.usageMetadata || null,
    });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ error: error?.message || "Gemini image generation failed" });
  }
});

router.get("/caches", async (_req, res) => {
  try {
    const data = await geminiFetch("/cachedContents");
    res.json({ caches: data.cachedContents || [], nextPageToken: data.nextPageToken || null });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to list caches" });
  }
});

router.post("/caches", upload.single("file"), async (req, res) => {
  try {
    const parsed = createCacheSchema.parse({
      ...req.body,
      contents: req.body?.contents || req.body?.content,
    });

    const contentParts: any[] = [];
    if (req.file) {
      contentParts.push({
        inline_data: {
          mime_type: req.file.mimetype || "application/octet-stream",
          data: req.file.buffer.toString("base64"),
        },
      });
    }
    contentParts.push({ text: parsed.contents });

    const data = await geminiFetch("/cachedContents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: parsed.model,
        ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
        ...(parsed.systemInstruction
          ? {
              systemInstruction: {
                parts: [{ text: parsed.systemInstruction }],
                role: "system",
              },
            }
          : {}),
        contents: [{
          role: "user",
          parts: contentParts,
        }],
        ...(parsed.ttl ? { ttl: parsed.ttl } : {}),
      }),
    });
    res.json({ cache: data });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Failed to create cache" });
  }
});

router.patch("/caches/:cacheName", async (req, res) => {
  try {
    const parsed = updateCacheSchema.parse(req.body || {});
    const cacheName = decodeURIComponent(req.params.cacheName);
    const data = await geminiFetch(`/${cacheName}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(parsed.ttl ? { ttl: parsed.ttl } : {}),
        ...(parsed.expireTime ? { expireTime: parsed.expireTime } : {}),
      }),
    });
    res.json({ cache: data });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Failed to update cache" });
  }
});

router.delete("/caches/:cacheName", async (req, res) => {
  try {
    const cacheName = decodeURIComponent(req.params.cacheName);
    await geminiFetch(`/${cacheName}`, { method: "DELETE" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Failed to delete cache" });
  }
});

router.post("/caches/generate", async (req, res) => {
  try {
    const parsed = generateFromCacheSchema.parse(req.body || {});
    const modelName = parsed.model.replace(/^models\//, "");

    const client = getClient();
    const response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: parsed.prompt }] }],
      config: { cachedContent: parsed.cacheName } as any,
    });

    const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p: any) => p?.text)
      .map((p: any) => p.text)
      .join("\n")
      .trim();

    res.json({
      text,
      usageMetadata: (response as any)?.usageMetadata || null,
      raw: response,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Failed to generate from cache" });
  }
});

// ── Veo 3.1 video generation ────────────────────────────────────────────────

router.post("/generate-video", async (req, res) => {
  try {
    const parsed = videoRequestSchema.parse(req.body || {});
    const apiKey = getGoogleApiKey();
    if (!apiKey) return res.status(500).json({ error: "Google Gemini API key is not configured" });

    const model = VEO_MODELS.includes(parsed.model) ? parsed.model : "veo-3.1-generate-preview";

    const response = await fetch(
      `${API_BASE}/models/${model}:predictLongRunning?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: parsed.prompt }],
          parameters: {
            aspectRatio: parsed.aspectRatio,
            resolution: parsed.resolution,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text || "Veo API error" });
    }

    const data = await response.json();
    res.json({ operationName: data.name });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ error: error?.message || "Video generation failed" });
  }
});

router.get("/video-status/:operationName(*)", async (req, res) => {
  try {
    const apiKey = getGoogleApiKey();
    if (!apiKey) return res.status(500).json({ error: "Google Gemini API key is not configured" });

    const operationName = req.params.operationName;
    const response = await fetch(`${API_BASE}/${operationName}?key=${apiKey}`);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text || "Poll failed" });
    }

    const data = await response.json();
    if (!data.done) return res.json({ done: false });

    const sample = data.response?.generateVideoResponse?.generatedSamples?.[0];
    if (!sample?.video?.uri) return res.json({ done: true, error: "No video in response" });

    // Proxy-download the video so the client gets it without exposing the API key
    const videoResp = await fetch(`${sample.video.uri}&key=${apiKey}`);
    if (!videoResp.ok) return res.status(500).json({ error: "Failed to download generated video" });

    const arrayBuffer = await videoResp.arrayBuffer();
    const b64 = Buffer.from(arrayBuffer).toString("base64");
    res.json({ done: true, videoB64: b64, mimeType: "video/mp4" });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Poll failed" });
  }
});

// ── Text / Chat generation ───────────────────────────────────────────────────

router.post("/chat", async (req, res) => {
  try {
    const parsed = chatRequestSchema.parse(req.body || {});
    const client = getClient();

    const contents = parsed.messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const response = await client.models.generateContent({
      model: parsed.model,
      contents,
      config: {
        ...(parsed.systemInstruction
          ? { systemInstruction: parsed.systemInstruction }
          : {}),
      },
    });

    const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p: any) => p?.text && !p?.thought)
      .map((p: any) => p.text)
      .join("\n")
      .trim();

    res.json({ text, usageMetadata: (response as any)?.usageMetadata || null });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({ error: error?.message || "Chat failed" });
  }
});

export default router;
