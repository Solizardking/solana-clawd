// @ts-nocheck
/**
 * Imagine Studio routes
 * - Prompt enhancement via Grok 4.3 (Clawd-as-Grok)
 * - Speech-to-text proxy to xAI /v1/stt
 * - Wallet-scoped generation library (DB-backed)
 */
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { userGenerations, insertUserGenerationSchema } from "@shared/schema";
import { openai, GrokModel } from "../lib/xai/grok";

const router = Router();
const XAI_BASE_URL = "https://api.x.ai/v1";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Prompt enhancement ───────────────────────────────────────────────────────
router.post("/expand-prompt", async (req, res) => {
  try {
    const { prompt, mode = "image" } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }
    const sys = mode === "video"
      ? "You are Clawd, a Grok-powered creative director for cinematic AI video. Rewrite the user's idea into a single vivid, cinematic prompt (1 paragraph, max 80 words) optimized for grok-imagine-video. Include camera motion, lighting, mood, and a $CLAWD lobster or Cheshire-grin cameo if it fits. Output only the improved prompt — no preamble."
      : "You are Clawd, a Grok-powered art director for AI images. Rewrite the user's idea into a single vivid prompt (max 60 words) optimized for grok-imagine-image. Include style, composition, lighting, color palette. If a $CLAWD lobster or Cheshire-cat motif fits, weave it in. Output only the improved prompt — no preamble, no quotes.";
    const r = await openai.chat.completions.create({
      model: GrokModel.GROK_4_3,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 280,
    });
    const enhanced = r.choices[0]?.message?.content?.trim() || prompt;
    res.json({ enhanced, original: prompt, model: GrokModel.GROK_4_3 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "expand failed" });
  }
});

// ── Speech-to-text proxy (xAI /v1/stt) ───────────────────────────────────────
router.post("/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "audio file required" });
    const language = (req.body?.language as string) || "en";
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
    form.append("file", blob, req.file.originalname || "audio.webm");
    form.append("language", language);

    const r = await fetch(`${XAI_BASE_URL}/stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: form as any,
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    const data = await r.json().catch(async () => ({ text: await r.text() }));
    res.json({ text: data.text || data.transcript || "", raw: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "stt failed" });
  }
});

// ── Library: list saved + recent for a wallet ────────────────────────────────
router.get("/library", async (req, res) => {
  try {
    const wallet = (req.query.wallet as string) || "";
    const savedOnly = req.query.savedOnly === "true";
    if (!wallet) return res.json({ items: [] });
    const where = savedOnly
      ? and(eq(userGenerations.walletAddress, wallet), eq(userGenerations.saved, true))
      : eq(userGenerations.walletAddress, wallet);
    const items = await db.select().from(userGenerations)
      .where(where)
      .orderBy(desc(userGenerations.createdAt))
      .limit(200);
    res.json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Record a generation (auto-recorded by image/video routes too) ────────────
const recordSchema = insertUserGenerationSchema.extend({
  walletAddress: z.string().min(20),
  prompt: z.string().min(1),
});
router.post("/record", async (req, res) => {
  try {
    const parsed = recordSchema.parse(req.body);
    const [row] = await db.insert(userGenerations).values(parsed).returning();
    res.json({ generation: row });
  } catch (e: any) {
    res.status(400).json({ error: e?.message });
  }
});

// ── Toggle "save" (floppy-disk button) ───────────────────────────────────────
router.post("/save", async (req, res) => {
  try {
    const { id, walletAddress, saved = true, galleryId, ...rest } = req.body || {};
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });

    if (id) {
      const [row] = await db.update(userGenerations)
        .set({ saved })
        .where(and(eq(userGenerations.id, Number(id)), eq(userGenerations.walletAddress, walletAddress)))
        .returning();
      return res.json({ generation: row });
    }
    // Save by gallery item: upsert if not yet recorded for this wallet
    if (galleryId) {
      const existing = await db.select().from(userGenerations)
        .where(and(
          eq(userGenerations.walletAddress, walletAddress),
          eq(userGenerations.galleryId, String(galleryId))
        )).limit(1);
      if (existing[0]) {
        const [row] = await db.update(userGenerations)
          .set({ saved })
          .where(eq(userGenerations.id, existing[0].id))
          .returning();
        return res.json({ generation: row });
      }
    }
    // Otherwise insert a fresh record
    const insert = insertUserGenerationSchema.parse({
      walletAddress,
      kind: rest.kind || "image",
      prompt: rest.prompt || "Saved generation",
      enhancedPrompt: rest.enhancedPrompt,
      mode: rest.mode || "t2i",
      model: rest.model || "grok-imagine-image",
      sourceUrl: rest.sourceUrl,
      bucketKey: rest.bucketKey,
      mediaUrl: rest.mediaUrl,
      thumbnail: rest.thumbnail,
      galleryId: galleryId ? String(galleryId) : undefined,
      metadata: rest.metadata,
      saved: true,
    });
    const [row] = await db.insert(userGenerations).values(insert).returning();
    res.json({ generation: row });
  } catch (e: any) {
    res.status(400).json({ error: e?.message });
  }
});

router.delete("/save/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const wallet = (req.query.wallet as string) || (req.body?.walletAddress as string);
    if (!wallet) return res.status(400).json({ error: "walletAddress required" });
    await db.delete(userGenerations)
      .where(and(eq(userGenerations.id, id), eq(userGenerations.walletAddress, wallet)));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

export default router;
