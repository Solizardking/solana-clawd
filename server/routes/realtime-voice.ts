import { Router, Request, Response } from "express";

const router = Router();

/**
 * POST /api/realtime/voice/token
 *
 * Generates an ephemeral OpenAI Realtime API session token (client_secret).
 * The browser uses this token to establish a WebRTC connection directly
 * with OpenAI's Realtime API (gpt-realtime-2).
 *
 * Request body (optional):
 *   { "model": "gpt-realtime-2" | "gpt-realtime-1.5" }
 *
 * Response:
 *   { "client_secret": { "value": "ek_...", "expires_at": 1234567890 } }
 */
router.post("/token", async (_req: Request, res: Response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const model = _req.body?.model || "gpt-realtime-2";

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[realtime-voice] OpenAI error:", response.status, text);
      return res.status(response.status).json({ error: `OpenAI API error: ${response.status}`, detail: text });
    }

    const data = await response.json() as {
      client_secret: { value: string; expires_at: number };
    };

    return res.json(data);
  } catch (err: any) {
    console.error("[realtime-voice] token generation failed:", err);
    return res.status(500).json({ error: err.message || "Failed to generate token" });
  }
});

/**
 * GET /api/realtime/voice/status
 *
 * Returns whether the Realtime Voice API is configured on the server.
 */
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    configured: !!process.env.OPENAI_API_KEY,
    model: "gpt-realtime-2",
  });
});

export default router;
