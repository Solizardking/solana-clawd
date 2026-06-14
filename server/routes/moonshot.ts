import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { rateLimit } from "../lib/rate-limit";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";

const router = Router();

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_COMPANION_MODEL = "deepseek-v4-pro";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const MODELS = [
  {
    id: DEFAULT_COMPANION_MODEL,
    name: "DeepSeek V4 Pro",
    description: "DeepSeek reasoning model used for the CLAWD companion.",
  },
] as const;

type CompanionMessage = {
  role: "user" | "assistant";
  content: string;
};

function deepseekClient() {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: DEEPSEEK_BASE_URL,
  });
}

function sanitizeMessages(input: unknown): CompanionMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((message): message is CompanionMessage => {
      if (!message || typeof message !== "object") return false;
      const candidate = message as Record<string, unknown>;
      return (
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2_000),
    }));
}

router.use(
  rateLimit({
    namespace: "moonshot:companion",
    windowMs: 60_000,
    max: 12,
    message: "CLAWD companion is cooling down. Try again in a minute.",
  }),
);

router.get("/models", (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
    baseUrl: DEEPSEEK_BASE_URL,
    models: MODELS,
  });
});

router.post("/chat", async (req: Request, res: Response) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({
      error: "DEEPSEEK_API_KEY is not configured.",
    });
  }

  const messages = sanitizeMessages(req.body?.messages);
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!lastUserMessage) {
    return res.status(400).json({ error: "A user message is required." });
  }

  const page = typeof req.body?.page === "string" ? req.body.page.slice(0, 160) : "/";
  const isAuthorized = req.session?.isAuthenticated === true;
  const isCompanionSurface = req.body?.surface === "clawd-companion";

  if (!isAuthorized) {
    return res.status(401).json({
      error: "Sign in to use the CLAWD companion.",
    });
  }

  if (!isCompanionSurface && req.session?.userRole !== "admin") {
    return res.status(403).json({
      error: "This CLAWD chat route is only available through the site companion.",
    });
  }

  const systemPrompt = `You are CLAWD, the floating lobster character agent for Cheshire Terminal.
You help visitors and signed-in users understand the site, registration, token-gated access, wallet safety, trading tools, and CLAWD agent features.
Current page: ${page}
Access rule: only the admin wallet and live $CLAWD holders can use gated app tools. Public visitors may register and ask you for guidance, but you must not claim they can bypass the gate.
CLAWD token mint: ${CLAWD_MINT}
Security rules: never ask for seed phrases, private keys, raw secret keys, or unattended wallet approval. Do not execute trades or swaps for the user. Give educational guidance, not financial advice.
Style: concise, sharp, technically useful, and in character without filler. Keep replies under 7 short sentences unless the user asks for detail.`;

  try {
    const completion = await deepseekClient().chat.completions.create({
      model: DEFAULT_COMPANION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 900,
      reasoning_effort: "high",
      extra_body: { thinking: { type: "enabled" } },
    } as any);

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return res.status(502).json({ error: "DeepSeek returned an empty response." });
    }

    const promptTokens =
      completion.usage?.prompt_tokens ??
      estimateTokensFromText(systemPrompt, ...messages.map((message) => message.content));
    const completionTokens =
      completion.usage?.completion_tokens ?? estimateTokensFromText(content);

    trackUsageFromRequest(req, {
      walletAddress: req.session?.walletAddress,
      eventType: "chat_message",
      productArea: "clawd_companion",
      model: DEFAULT_COMPANION_MODEL,
      route: "/api/moonshot/chat",
      units: 1,
      promptTokens,
      completionTokens,
      totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
      metadata: {
        provider: "deepseek",
        page,
        publicSurface: false,
      },
    });

    return res.json({
      message: content,
      model: DEFAULT_COMPANION_MODEL,
      provider: "deepseek",
      usage: completion.usage ?? {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: (promptTokens ?? 0) + (completionTokens ?? 0),
      },
    });
  } catch (error: any) {
    console.error("[deepseek] companion chat failed:", error?.message ?? error);
    return res.status(502).json({
      error: error?.message || "DeepSeek request failed.",
    });
  }
});

export default router;
