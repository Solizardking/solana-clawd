/**
 * Legacy /api/openrouter mount — now backed by DeepSeek V4 directly.
 * The route prefix is kept for back-compat with older clients.
 * For new code, prefer the dedicated /api/deepseek-studio endpoints below.
 */
import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { trackUsageFromRequest } from "../lib/usage";

const router = Router();

const DEEPSEEK_BASE = "https://api.deepseek.com";
const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1";
const _MINIMODEL = (process.env.MINIMODEL ?? "").toLowerCase();
const USE_MINIMAX = (_MINIMODEL.includes("minimax") || _MINIMODEL.includes("mini")) && !!process.env.MINIMAX_API_KEY;

const DEFAULT_MODEL = USE_MINIMAX ? "MiniMax-M3" : "deepseek-v4-pro";
const FLASH_MODEL = USE_MINIMAX ? "MiniMax-M3" : "deepseek-v4-flash";
const API_BASE = USE_MINIMAX ? MINIMAX_BASE : DEEPSEEK_BASE;

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${USE_MINIMAX ? (process.env.MINIMAX_API_KEY ?? "") : (process.env.DEEPSEEK_API_KEY ?? "")}`,
});

const chatCompletionSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  thinking: z.boolean().optional(),
  reasoning_effort: z.enum(["low", "medium", "high", "max"]).optional(),
  json_mode: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
});

const tokenIdeaSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),
});

router.get("/status", async (_req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({
      status: "error",
      configured: false,
      message: "DEEPSEEK_API_KEY is not configured",
    });
  }
  try {
    await axios.post(
      `${API_BASE}/chat/completions`,
      {
        model: FLASH_MODEL,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      },
      { headers: headers(), timeout: 10000 },
    );
    return res.json({
      status: "success",
      configured: true,
      message: "DeepSeek API is configured and reachable",
    });
  } catch {
    return res.status(401).json({
      status: "error",
      configured: true,
      valid: false,
      message: "DeepSeek API key invalid or unreachable",
    });
  }
});

router.get("/models", async (_req, res) => {
  return res.json({
    models: [
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "Flagship reasoning model — thinking mode + tool calling",
        contextWindow: 128000,
        thinking: true,
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        description: "Fast, cheap, low-latency model for high-throughput tasks",
        contextWindow: 64000,
        thinking: false,
      },
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat (legacy)",
        description: "Legacy chat alias",
        contextWindow: 64000,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner (legacy)",
        description: "Legacy reasoning alias",
        contextWindow: 64000,
        thinking: true,
      },
    ],
  });
});

router.post("/chat", async (req, res) => {
  try {
    const {
      messages,
      model = DEFAULT_MODEL,
      temperature = 0.7,
      max_tokens = 1500,
      thinking = false,
      reasoning_effort,
      json_mode = false,
      tools,
    } = chatCompletionSchema.parse(req.body);

    const body: any = { model, messages, temperature, max_tokens };
    if (json_mode) body.response_format = { type: "json_object" };
    if (tools && tools.length) body.tools = tools;
    if (thinking) {
      body.extra_body = { thinking: { type: "enabled" } };
      body.reasoning_effort = reasoning_effort || "high";
    }

    const r = await axios.post(`${API_BASE}/chat/completions`, body, {
      headers: headers(),
    });
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model,
      route: "/api/openrouter/chat",
      promptTokens: r.data?.usage?.prompt_tokens,
      completionTokens: r.data?.usage?.completion_tokens,
      totalTokens: r.data?.usage?.total_tokens,
      metadata: { thinking, json_mode, tools: Boolean(tools?.length) },
    });
    return res.json(r.data);
  } catch (error: any) {
    console.error("DeepSeek chat error:", error?.response?.data || error.message);
    if (axios.isAxiosError(error) && error.response) {
      return res
        .status(error.response.status)
        .json({ error: "DeepSeek API error", details: error.response.data });
    }
    return res.status(500).json({ error: "Failed to get chat completion" });
  }
});

router.post("/generate-token-idea", async (req, res) => {
  try {
    const { prompt, model = DEFAULT_MODEL } = tokenIdeaSchema.parse(req.body);
    const systemPrompt = `You are an expert Solana meme-token designer powered by Deep CLAWD.
Generate a viral, marketable token concept. Return ONLY valid JSON with:
name (string), symbol (3-5 chars), description (string),
initialBuyAmount (number, in SOL), totalSupply (string),
marketingPoints (array of 3 strings), viralPotential ("High"|"Medium"|"Low"), theme (string).`;

    const r = await axios.post(
      `${API_BASE}/chat/completions`,
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 800,
        response_format: { type: "json_object" },
      },
      { headers: headers() },
    );
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model,
      route: "/api/openrouter/generate-token-idea",
      promptTokens: r.data?.usage?.prompt_tokens,
      completionTokens: r.data?.usage?.completion_tokens,
      totalTokens: r.data?.usage?.total_tokens,
      metadata: { kind: "token_idea" },
    });
    return res.json(r.data);
  } catch (error: any) {
    console.error("DeepSeek token-idea error:", error?.response?.data || error.message);
    if (axios.isAxiosError(error) && error.response) {
      return res
        .status(error.response.status)
        .json({ error: "DeepSeek API error", details: error.response.data });
    }
    return res.status(500).json({ error: "Failed to generate token idea" });
  }
});

const proofGenerationSchema = z.object({
  problem: z.string(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  thinking: z.boolean().optional(),
});

router.post("/generate-proof", async (req, res) => {
  try {
    const {
      problem,
      temperature = 0.3,
      max_tokens = 2500,
      thinking = true,
    } = proofGenerationSchema.parse(req.body);

    const systemPrompt = `You are Deep CLAWD — a mathematical reasoning expert powered by DeepSeek V4 Pro.
Provide rigorous, step-by-step proofs:
- State exactly what is being proven.
- Use formal notation (∧ ∨ → ↔ ¬ ∀ ∃) where helpful.
- Number each step and explain its logical justification.
- Conclude with a clear QED.`;

    const body: any = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: problem },
      ],
      temperature,
      max_tokens,
    };
    if (thinking) {
      body.extra_body = { thinking: { type: "enabled" } };
      body.reasoning_effort = "max";
    }

    const r = await axios.post(`${API_BASE}/chat/completions`, body, {
      headers: headers(),
    });
    return res.json(r.data);
  } catch (error: any) {
    console.error("DeepSeek prover error:", error?.response?.data || error.message);
    if (axios.isAxiosError(error) && error.response) {
      return res
        .status(error.response.status)
        .json({ error: "DeepSeek API error", details: error.response.data });
    }
    return res.status(500).json({ error: "Failed to generate proof" });
  }
});

const tokenAnalysisSchema = z.object({
  address: z.string(),
  tokenData: z.any().optional(),
  analysisType: z.enum(["security", "technical", "investment"]).optional(),
  thinking: z.boolean().optional(),
});

router.post("/analyze-token", async (req, res) => {
  try {
    const {
      address,
      tokenData = {},
      analysisType = "security",
      thinking = true,
    } = tokenAnalysisSchema.parse(req.body);

    const personas: Record<string, string> = {
      security:
        "You are Deep CLAWD's security analyst. Audit the token for honeypot traits, mint authority risks, freeze authority, LP locks, and on-chain red flags.",
      technical:
        "You are Deep CLAWD's technical analyst. Examine tokenomics, supply distribution, transaction patterns, and contract implementation quality.",
      investment:
        "You are Deep CLAWD's investment analyst. Provide a risk/reward profile, market positioning, comparable tokens, and warning signs vs quality indicators.",
    };

    const userPrompt = `Token address: ${address}
On-chain data: ${JSON.stringify(tokenData, null, 2)}

Provide:
1. Overview
2. Key Metrics
3. Risk Assessment
4. Technical Evaluation
5. Recommendations`;

    const body: any = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: personas[analysisType] },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    };
    if (thinking) {
      body.extra_body = { thinking: { type: "enabled" } };
      body.reasoning_effort = "high";
    }

    const r = await axios.post(`${API_BASE}/chat/completions`, body, {
      headers: headers(),
    });
    return res.json(r.data);
  } catch (error: any) {
    console.error("DeepSeek analyze-token error:", error?.response?.data || error.message);
    if (axios.isAxiosError(error) && error.response) {
      return res
        .status(error.response.status)
        .json({ error: "DeepSeek API error", details: error.response.data });
    }
    return res.status(500).json({ error: "Failed to analyze token" });
  }
});

// DeepSeek is text-only — proxy image analysis to xAI grok-4 vision.
router.post("/analyze-image", async (req, res) => {
  try {
    const { base64Image, prompt = "Analyze this image in detail" } = req.body || {};
    if (!base64Image) return res.status(400).json({ error: "base64Image required" });
    if (!process.env.XAI_API_KEY) {
      return res
        .status(501)
        .json({ error: "Image analysis requires XAI_API_KEY (DeepSeek is text-only)" });
    }
    const r = await axios.post(
      "https://api.x.ai/v1/chat/completions",
      {
        model: "grok-4",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: base64Image.startsWith("data:")
                    ? base64Image
                    : `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 600,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
      },
    );
    return res.json(r.data);
  } catch (error: any) {
    console.error("Image analysis error:", error?.response?.data || error.message);
    return res.status(500).json({ error: "Failed to analyze image" });
  }
});

export default router;
