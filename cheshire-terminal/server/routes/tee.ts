/**
 * RedPill TEE Gateway routes
 * Privacy-first AI via GPU Trusted Execution Environments (TEE)
 * OpenAI-compatible base: https://api.redpill.ai/v1
 */

import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";
import {
  buildRedpillEvidenceRecord,
  ensureRedpillSasSetup,
  getSasLaunchConfig,
  issueRedpillEvidenceAttestation,
  sha256Hex,
  type RedpillEvidenceRecord,
} from "../lib/solana-attestation";

const router = Router();

const REDPILL_BASE = "https://api.redpill.ai/v1";
const DEFAULT_REDPILL_MODEL =
  process.env.REDPILL_MODEL ||
  process.env.REDPILLMODEL1 ||
  "deepseek/deepseek-v4-flash";
const SECONDARY_REDPILL_MODEL =
  process.env.REDPILL_MODEL2 ||
  process.env.REDPILLMODEL2 ||
  process.env.REDPILLMODEL3 ||
  "google/gemma-4-31b-it";

function formatModelName(modelId: string) {
  const shortName = modelId.split("/").pop() || modelId;
  return shortName
    .split("-")
    .filter(Boolean)
    .map((part) => part.toUpperCase() === "IT" ? "IT" : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTeeModels() {
  const models = [
    { id: DEFAULT_REDPILL_MODEL, name: formatModelName(DEFAULT_REDPILL_MODEL), provider: "RedPill GPU TEE", tee: true },
    { id: SECONDARY_REDPILL_MODEL, name: formatModelName(SECONDARY_REDPILL_MODEL), provider: "RedPill GPU TEE", tee: true },
    { id: "z-ai/glm-5.1", name: "GLM 5.1", provider: "Chutes GPU TEE", tee: true },
    { id: "z-ai/glm-5", name: "GLM 5", provider: "Near AI GPU TEE", tee: true },
    { id: "phala/qwen3.5-27b", name: "Qwen 3.5 27B", provider: "Phala GPU TEE", tee: true },
    { id: "phala/qwen3-vl-30b-a3b-instruct", name: "Qwen3 VL 30B", provider: "Phala GPU TEE", tee: true },
    { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic (TEE gateway)", tee: false },
    { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI (TEE gateway)", tee: false },
  ];
  return models.filter((model, index, list) => list.findIndex((item) => item.id === model.id) === index);
}

function getClient() {
  return new OpenAI({
    apiKey: process.env.REDPILL_API_KEY || "",
    baseURL: REDPILL_BASE,
  });
}

function publicEvidence(record: RedpillEvidenceRecord) {
  return {
    ...record,
    issued_at: record.issued_at.toString(),
  };
}

function requireSasAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SAS_ADMIN_SECRET || process.env.ADMIN_SECRET;
  if (!expected) {
    return res.status(503).json({
      error: "SAS_ADMIN_SECRET or ADMIN_SECRET is required for Solana attestation writes.",
    });
  }

  const provided =
    req.header("x-sas-admin-secret") ||
    req.header("x-admin-secret") ||
    (typeof req.query.secret === "string" ? req.query.secret : "");

  if (provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

async function fetchRedpillJson(path: string) {
  const response = await fetch(`${REDPILL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.REDPILL_API_KEY}`,
      Accept: "application/json",
    },
  });
  const body = await response.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = { raw: body };
  }
  if (!response.ok) {
    throw new Error(`RedPill verification endpoint failed (${response.status}): ${body.slice(0, 240)}`);
  }
  return json as Record<string, any>;
}

async function collectRedpillProof(model: string, requestId: string) {
  const signature = await fetchRedpillJson(`/signature/${encodeURIComponent(requestId)}?model=${encodeURIComponent(model)}`);
  const signingAddress = signature.signing_address || signature.signingAddress || signature.address || "";
  if (!signingAddress) {
    throw new Error("RedPill signature response did not include signing_address");
  }
  const nonce = cryptoRandomHex(32);
  const attestationReport = await fetchRedpillJson(
    `/attestation/report?model=${encodeURIComponent(model)}&nonce=${encodeURIComponent(nonce)}&signing_address=${encodeURIComponent(signingAddress)}`,
  );
  return { signature, signingAddress, nonce, attestationReport };
}

function cryptoRandomHex(bytes: number) {
  return crypto.randomBytes(bytes).toString("hex");
}

function buildFinalMessages(messages: any[], system?: string) {
  const finalMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (system) {
    finalMessages.push({ role: "system", content: system });
  }

  for (const m of messages) {
    if (m.role === "user" || m.role === "assistant" || m.role === "system") {
      finalMessages.push({ role: m.role, content: String(m.content ?? "") });
    }
  }

  return finalMessages;
}

// ─── Models list ───────────────────────────────────────────────────────────────
router.get("/models", (_req: Request, res: Response) => {
  res.json({
    models: buildTeeModels(),
    defaultModel: DEFAULT_REDPILL_MODEL,
    secondaryModel: SECONDARY_REDPILL_MODEL,
  });
});

// ─── Status / Health ───────────────────────────────────────────────────────────
router.get("/status", (_req: Request, res: Response) => {
  const configured = !!process.env.REDPILL_API_KEY;
  const sas = getSasLaunchConfig();
  res.json({
    configured,
    provider: "RedPill AI Gateway",
    teeEnabled: true,
    defaultModel: DEFAULT_REDPILL_MODEL,
    secondaryModel: SECONDARY_REDPILL_MODEL,
    solanaAttestation: {
      configured: Boolean(sas.authorityAddress && sas.payerAddress),
      programAddress: sas.programAddress,
      credentialName: sas.credentialName,
      schema: sas.schema,
    },
  });
});

// ─── RedPill → Solana Attestation Service bridge ─────────────────────────────
router.get("/attestation/config", (_req: Request, res: Response) => {
  const config = getSasLaunchConfig();
  res.json({
    redpillConfigured: !!process.env.REDPILL_API_KEY,
    sasSignerConfigured: Boolean(config.authorityAddress && config.payerAddress),
    config,
  });
});

router.post("/attestation/setup", requireSasAdmin, async (_req: Request, res: Response) => {
  try {
    const setup = await ensureRedpillSasSetup();
    res.json({ success: true, setup });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to setup SAS credential/schema" });
  }
});

router.post("/attestation/prepare", async (req: Request, res: Response) => {
  try {
    const {
      requestId,
      model = DEFAULT_REDPILL_MODEL,
      signingAddress,
      request,
      response,
      signature,
      attestationReport,
    } = req.body;
    if (!requestId || !request || !response) {
      return res.status(400).json({ error: "requestId, request, and response are required" });
    }
    const record = buildRedpillEvidenceRecord({
      requestId,
      model,
      signingAddress,
      request,
      response,
      signature,
      attestationReport,
    });
    res.json({
      success: true,
      evidence: publicEvidence(record),
      hashes: {
        signatureHash: signature ? sha256Hex(signature) : null,
        attestationReportHash: attestationReport ? sha256Hex(attestationReport) : null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to prepare RedPill evidence" });
  }
});

router.post("/attestation/issue", requireSasAdmin, async (req: Request, res: Response) => {
  try {
    const {
      requestId,
      model = DEFAULT_REDPILL_MODEL,
      signingAddress,
      request,
      response,
      signature,
      attestationReport,
    } = req.body;
    if (!requestId || !request || !response) {
      return res.status(400).json({ error: "requestId, request, and response are required" });
    }
    const record = buildRedpillEvidenceRecord({
      requestId,
      model,
      signingAddress,
      request,
      response,
      signature,
      attestationReport,
    });
    const attestation = await issueRedpillEvidenceAttestation(record);
    res.json({
      success: true,
      evidence: publicEvidence(record),
      attestation,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to issue Solana attestation" });
  }
});

router.post("/attestation/chat", requireSasAdmin, async (req: Request, res: Response) => {
  const {
    messages = [],
    model = DEFAULT_REDPILL_MODEL,
    temperature,
    max_tokens,
    system,
    submit = true,
    requireProviderEvidence = true,
  } = req.body;
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : DEFAULT_REDPILL_MODEL;

  if (!process.env.REDPILL_API_KEY) {
    return res.status(400).json({ error: "REDPILL_API_KEY not configured" });
  }

  try {
    const client = getClient();
    const finalMessages = buildFinalMessages(messages, system);
    const redpillRequest = {
      model: selectedModel,
      messages: finalMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048,
    };
    const completion = await client.chat.completions.create(redpillRequest);
    const requestId = completion.id;
    if (!requestId) throw new Error("RedPill response did not include request id");

    let proof: Awaited<ReturnType<typeof collectRedpillProof>> | null = null;
    try {
      proof = await collectRedpillProof(selectedModel, requestId);
    } catch (proofError) {
      if (requireProviderEvidence !== false) throw proofError;
    }

    const record = buildRedpillEvidenceRecord({
      requestId,
      model: selectedModel,
      signingAddress: proof?.signingAddress,
      request: redpillRequest,
      response: completion,
      signature: proof?.signature,
      attestationReport: proof?.attestationReport,
    });
    const attestation = submit === false ? null : await issueRedpillEvidenceAttestation(record);
    const content = completion.choices?.[0]?.message?.content || "";

    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: selectedModel,
      route: "/api/tee/attestation/chat",
      totalTokens: estimateTokensFromText(JSON.stringify(finalMessages), content),
      metadata: { tee: true, attested: Boolean(attestation), providerEvidence: Boolean(proof) },
    });

    res.json({
      success: true,
      model: selectedModel,
      requestId,
      content,
      evidence: publicEvidence(record),
      proof: proof
        ? {
            signingAddress: proof.signingAddress,
            nonce: proof.nonce,
            signatureHash: sha256Hex(proof.signature),
            attestationReportHash: sha256Hex(proof.attestationReport),
          }
        : null,
      attestation,
    });
  } catch (err: any) {
    console.error("[TEE] attested chat error:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to create attested RedPill completion" });
  }
});

// ─── Chat completions (streaming SSE) ─────────────────────────────────────────
router.post("/chat", async (req: Request, res: Response) => {
  const {
    messages = [],
    model = DEFAULT_REDPILL_MODEL,
    temperature,
    max_tokens,
    system,
  } = req.body;
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : DEFAULT_REDPILL_MODEL;

  if (!process.env.REDPILL_API_KEY) {
    return res.status(400).json({ error: "REDPILL_API_KEY not configured" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = getClient();
    const finalMessages = buildFinalMessages(messages, system);

    const stream = await client.chat.completions.create({
      model: selectedModel,
      messages: finalMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048,
      stream: true,
    });

    let fullContent = "";

    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;

      if (delta?.content) {
        fullContent += delta.content;
        send("text", { content: delta.content });
      }

      if (finishReason) {
        send("done", { finish_reason: finishReason, usage: chunk.usage ?? null, model: selectedModel });
      }
    }

    send("done", { finish_reason: "stop", usage: null, model: selectedModel });

    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: selectedModel,
      route: "/api/tee/chat",
      totalTokens: estimateTokensFromText(JSON.stringify(finalMessages), fullContent),
      metadata: { tee: true, streamed: true },
    });
  } catch (err: any) {
    console.error("[TEE] chat error:", err);
    send("error", { error: err?.message || "Unexpected error from RedPill gateway" });
  } finally {
    res.end();
  }
});

export default router;
