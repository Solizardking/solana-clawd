import { Router } from "express";
import type { Request, Response } from "express";
import { objectStore } from "../lib/objectStore";
import crypto from "crypto";

const router = Router();

const completedFalIds = new Set<string>();

const FAL_KEY = () => process.env.FAL_API_KEY || "";
const MODEL_T2V = process.env.FAL_SEE_MODEL2 || "bytedance/seedance-2.0/fast/text-to-video";
const MODEL_I2V = process.env.FAL_SEE_MODEL1 || "bytedance/seedance-2.0/image-to-video";

async function falPost(model: string, input: object) {
  const key = FAL_KEY();
  if (!key) throw new Error("FAL_API_KEY not configured");
  const r = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`FAL error ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

async function falStatus(model: string, requestId: string) {
  const key = FAL_KEY();
  const r = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
    headers: { "Authorization": `Key ${key}` },
  });
  if (!r.ok) throw new Error(`FAL status error ${r.status}`);
  return r.json();
}

async function falResult(model: string, requestId: string) {
  const key = FAL_KEY();
  const r = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
    headers: { "Authorization": `Key ${key}` },
  });
  if (!r.ok) throw new Error(`FAL result error ${r.status}`);
  return r.json();
}

// ─── POST /api/fal/text-to-video ─────────────────────────────────────────────
router.post("/text-to-video", async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      duration = "5",
      resolution = "720p",
      aspectRatio = "16:9",
      generateAudio = false,
    } = req.body;

    if (!prompt?.trim()) return res.status(400).json({ error: "prompt required" });

    const result = await falPost(MODEL_T2V, {
      prompt: prompt.trim(),
      duration: String(duration),
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    });

    return res.json({ success: true, requestId: result.request_id, model: MODEL_T2V });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/fal/image-to-video ────────────────────────────────────────────
router.post("/image-to-video", async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      imageUrl,
      duration = "5",
      resolution = "720p",
      generateAudio = false,
    } = req.body;

    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    if (!prompt?.trim()) return res.status(400).json({ error: "prompt required" });

    const result = await falPost(MODEL_I2V, {
      prompt: prompt.trim(),
      image_url: imageUrl,
      duration: String(duration),
      resolution,
      aspect_ratio: "auto",
      generate_audio: generateAudio,
    });

    return res.json({ success: true, requestId: result.request_id, model: MODEL_I2V });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/fal/status/:requestId ──────────────────────────────────────────
router.get("/status/:requestId", async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const model = (req.query.model as string) || MODEL_T2V;
    const prompt = (req.query.prompt as string) || '';
    const status = await falStatus(model, requestId);

    if (status.status === "COMPLETED") {
      const result = await falResult(model, requestId);
      const videoUrl =
        result?.video?.url ||
        result?.videos?.[0]?.url ||
        result?.output?.video_url;

      // Save to object store once per requestId
      if (videoUrl && !completedFalIds.has(requestId)) {
        completedFalIds.add(requestId);
        const item = objectStore.makeItem({
          id: requestId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || crypto.randomBytes(8).toString('hex'),
          type: 'video',
          title: prompt?.slice(0, 70) || 'FAL Video',
          prompt,
          sourceUrl: videoUrl,
          model: model.split('/').slice(-2).join('/'),
        });
        objectStore.saveGalleryItem(item).then(saved => {
          const broadcast = req.app.locals.broadcastGalleryItem as Function | undefined;
          broadcast?.(saved);
        }).catch(err => console.warn('[Gallery] FAL save error:', err));
      }

      return res.json({ status: "done", videoUrl, raw: result });
    }
    if (status.status === "FAILED") {
      return res.json({ status: "failed", error: status.error });
    }
    return res.json({ status: "pending", position: status.queue_position });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/fal/health ──────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  res.json({
    configured: !!FAL_KEY(),
    models: { textToVideo: MODEL_T2V, imageToVideo: MODEL_I2V },
  });
});

export default router;
