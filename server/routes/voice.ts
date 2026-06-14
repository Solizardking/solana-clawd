import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ASSEMBLY_REST_BASE = "https://api.assemblyai.com";
const ASSEMBLY_LLM_BASE = "https://llm-gateway.assemblyai.com/v1";
const ASSEMBLY_STREAMING_BASE = "https://streaming.assemblyai.com";
const ASSEMBLY_AGENTS_BASE = "https://agents.assemblyai.com";
const DEFAULT_LLM_MODEL = process.env.ASSEMBLY_LLM_MODEL || "claude-sonnet-4-6";

function assemblyApiKey() {
  return process.env.ASSEMBLY_API_KEY || process.env.ASSEMBLYAI_API_KEY || "";
}

function requireAssemblyKey(res: Response) {
  const key = assemblyApiKey();
  if (!key) {
    res.status(500).json({
      error: "ASSEMBLY_API_KEY is not configured on the server",
    });
    return null;
  }
  return key;
}

async function readJsonOrText(response: globalThis.Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return { text: await response.text() };
}

async function assemblyFetch(
  url: string,
  init: RequestInit = {},
  apiKey = assemblyApiKey(),
) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: apiKey,
      ...(init.headers || {}),
    },
  });
}

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(z.unknown())]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

const chatSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  messages: z.array(chatMessageSchema).optional(),
  max_tokens: z.number().int().positive().max(8000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  response_format: z.unknown().optional(),
  fallbacks: z.array(z.unknown()).optional(),
  fallback_config: z.unknown().optional(),
  post_processing_steps: z.array(z.object({ type: z.literal("json-repair") })).optional(),
});

async function createAssemblyChatCompletion(input: z.infer<typeof chatSchema>) {
  const key = assemblyApiKey();
  const body = {
    ...input,
    model: input.model || DEFAULT_LLM_MODEL,
    max_tokens: input.max_tokens ?? 1000,
  };

  const response = await assemblyFetch(`${ASSEMBLY_LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, key);

  const data = await readJsonOrText(response);
  if (!response.ok) {
    const detail = typeof data === "object" ? data : { error: String(data) };
    throw Object.assign(new Error(`AssemblyAI LLM Gateway error: ${response.status}`), {
      status: response.status,
      detail,
    });
  }

  return data;
}

async function uploadAudioToAssembly(file: Express.Multer.File, apiKey: string) {
  const response = await assemblyFetch(`${ASSEMBLY_REST_BASE}/v2/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: file.buffer as any,
  }, apiKey);

  const data = await readJsonOrText(response);
  if (!response.ok) {
    throw Object.assign(new Error(`AssemblyAI upload failed: ${response.status}`), {
      status: response.status,
      detail: data,
    });
  }

  const uploadUrl = (data as any).upload_url;
  if (!uploadUrl) throw new Error("AssemblyAI upload response did not include upload_url");
  return uploadUrl as string;
}

async function createTranscript(uploadUrl: string, apiKey: string, language?: string) {
  const body: Record<string, unknown> = {
    audio_url: uploadUrl,
    speech_model: "universal",
  };
  if (language && language !== "auto") body.language_code = language;

  const response = await assemblyFetch(`${ASSEMBLY_REST_BASE}/v2/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, apiKey);

  const data = await readJsonOrText(response);
  if (!response.ok) {
    throw Object.assign(new Error(`AssemblyAI transcript creation failed: ${response.status}`), {
      status: response.status,
      detail: data,
    });
  }

  const id = (data as any).id;
  if (!id) throw new Error("AssemblyAI transcript response did not include id");
  return id as string;
}

async function pollTranscript(transcriptId: string, apiKey: string, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await assemblyFetch(`${ASSEMBLY_REST_BASE}/v2/transcript/${transcriptId}`, {}, apiKey);
    const data = await readJsonOrText(response);
    if (!response.ok) {
      throw Object.assign(new Error(`AssemblyAI transcript polling failed: ${response.status}`), {
        status: response.status,
        detail: data,
      });
    }

    const status = (data as any).status;
    if (status === "completed") return data as any;
    if (status === "error") {
      throw Object.assign(new Error((data as any).error || "AssemblyAI transcription failed"), {
        status: 502,
        detail: data,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw Object.assign(new Error("AssemblyAI transcription timed out"), { status: 504 });
}

router.get("/status", (_req, res) => {
  res.json({
    configured: !!assemblyApiKey(),
    env: process.env.ASSEMBLY_API_KEY ? "ASSEMBLY_API_KEY" : process.env.ASSEMBLYAI_API_KEY ? "ASSEMBLYAI_API_KEY" : null,
    defaultModel: DEFAULT_LLM_MODEL,
    endpoints: {
      llmGateway: ASSEMBLY_LLM_BASE,
      streaming: ASSEMBLY_STREAMING_BASE,
      voiceAgent: ASSEMBLY_AGENTS_BASE,
    },
  });
});

router.get("/streaming-token", async (req, res) => {
  const key = requireAssemblyKey(res);
  if (!key) return;

  const expires = Number(req.query.expires_in_seconds || 60);
  const maxSession = Number(req.query.max_session_duration_seconds || 3600);
  const url = new URL(`${ASSEMBLY_STREAMING_BASE}/v3/token`);
  url.searchParams.set("expires_in_seconds", String(Math.min(Math.max(expires, 30), 600)));
  url.searchParams.set("max_session_duration_seconds", String(Math.min(Math.max(maxSession, 60), 10800)));

  try {
    const response = await assemblyFetch(url.toString(), {}, key);
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error("[voice] streaming token failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to create streaming token" });
  }
});

router.get("/agent-token", async (req, res) => {
  const key = requireAssemblyKey(res);
  if (!key) return;

  const expires = Number(req.query.expires_in_seconds || 60);
  const maxSession = Number(req.query.max_session_duration_seconds || 3600);
  const url = new URL(`${ASSEMBLY_AGENTS_BASE}/v1/token`);
  url.searchParams.set("expires_in_seconds", String(Math.min(Math.max(expires, 30), 600)));
  url.searchParams.set("max_session_duration_seconds", String(Math.min(Math.max(maxSession, 60), 10800)));

  try {
    const response = await assemblyFetch(url.toString(), {}, key);
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error("[voice] agent token failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to create voice agent token" });
  }
});

router.post("/chat", async (req, res) => {
  const key = requireAssemblyKey(res);
  if (!key) return;

  try {
    const parsed = chatSchema.parse(req.body || {});
    if (!parsed.prompt && !parsed.messages?.length) {
      return res.status(400).json({ error: "prompt or messages is required" });
    }
    if (parsed.stream) {
      return res.status(400).json({ error: "Use non-streaming chat through this endpoint" });
    }

    const data = await createAssemblyChatCompletion(parsed);
    return res.json(data);
  } catch (error: any) {
    console.error("[voice] chat completion failed:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "AssemblyAI chat completion failed",
      detail: error?.detail,
    });
  }
});

router.post("/understanding", async (req, res) => {
  const key = requireAssemblyKey(res);
  if (!key) return;

  try {
    const response = await assemblyFetch(`${ASSEMBLY_LLM_BASE}/understanding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    }, key);
    const data = await readJsonOrText(response);
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error("[voice] understanding failed:", error);
    return res.status(500).json({ error: error?.message || "Speech understanding failed" });
  }
});

router.post("/transcribe", upload.single("audio"), async (req: Request, res: Response) => {
  const key = requireAssemblyKey(res);
  if (!key) return;
  if (!req.file) return res.status(400).json({ error: "audio file required" });

  try {
    const language = typeof req.body?.language === "string" ? req.body.language : "en";
    const uploadUrl = await uploadAudioToAssembly(req.file, key);
    const transcriptId = await createTranscript(uploadUrl, key, language);
    const transcript = await pollTranscript(transcriptId, key);

    return res.json({
      text: transcript.text || "",
      transcriptId,
      words: transcript.words || [],
      utterances: transcript.utterances || [],
      raw: transcript,
    });
  } catch (error: any) {
    console.error("[voice] transcription failed:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "AssemblyAI transcription failed",
      detail: error?.detail,
    });
  }
});

router.post("/prompt", upload.single("audio"), async (req: Request, res: Response) => {
  const key = requireAssemblyKey(res);
  if (!key) return;
  if (!req.file) return res.status(400).json({ error: "audio file required" });

  try {
    const mode = typeof req.body?.mode === "string" ? req.body.mode : "chat";
    const context = typeof req.body?.context === "string" ? req.body.context : "";
    const language = typeof req.body?.language === "string" ? req.body.language : "en";

    const uploadUrl = await uploadAudioToAssembly(req.file, key);
    const transcriptId = await createTranscript(uploadUrl, key, language);
    const transcript = await pollTranscript(transcriptId, key);
    const text = String(transcript.text || "").trim();

    if (!text) {
      return res.json({
        text: "",
        transcriptId,
        intent: null,
        response: null,
      });
    }

    const data = await createAssemblyChatCompletion({
      model: DEFAULT_LLM_MODEL,
      messages: [
        {
          role: "system",
          content: `You convert voice transcripts into safe Cheshire Terminal actions.
Modes include chat, token, trading, swap, market, and navigation.
For trading or swap language, extract the intent but do not claim a transaction was executed.
Return concise JSON only.`,
        },
        {
          role: "user",
          content: JSON.stringify({ mode, transcript: text, context }),
        },
      ],
      max_tokens: 800,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "voice_prompt",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              prompt: { type: "string" },
              mode: { type: "string" },
              intent: { type: "string" },
              safety_note: { type: "string" },
            },
            required: ["prompt", "mode", "intent", "safety_note"],
          },
        },
      },
      post_processing_steps: [{ type: "json-repair" }],
    });

    const content = (data as any).choices?.[0]?.message?.content || "{}";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { prompt: text, mode, intent: "chat", safety_note: "" };
    }

    return res.json({
      text,
      transcriptId,
      intent: parsed,
      response: data,
    });
  } catch (error: any) {
    console.error("[voice] prompt processing failed:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "AssemblyAI voice prompt failed",
      detail: error?.detail,
    });
  }
});

export default router;
