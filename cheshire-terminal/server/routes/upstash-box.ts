import { Router, type Request, type Response } from "express";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { Box } from "@upstash/box";
import { z } from "zod";

const router = Router();

const BOX_API_KEY = process.env.UPSTASH_BOX_API_KEY || process.env.NEONBOX_API_KEY || "";
const OPENCLAWD_BOX_ID = process.env.UPSTASH_BOX_OPENCLAWD_ID || "capital-sole-06685";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "";
const HONCHO_API_KEY = process.env.HONCHO_API_KEY || "";
const HONCHO_WORKSPACE_ID = process.env.HONCHO_WORKSPACE_ID || "cheshireterminal";

const AGENTS_DIR = join(process.cwd(), "Cladwbot-solana/agents/src");

type BoxSessionMessage = {
  id: string;
  sessionId: string;
  boxId: string;
  authorType: "human" | "agent" | "system";
  authorId: string;
  channel: "api" | "telegram" | "arena" | "box";
  content: string;
  createdAt: string;
  runId?: string;
  cost?: unknown;
};

type BoxSession = {
  id: string;
  boxId: string;
  humanId: string;
  channel: "api" | "telegram" | "arena" | "box";
  title: string;
  honchoPeerId?: string;
  createdAt: string;
  updatedAt: string;
  messages: BoxSessionMessage[];
};

const boxSessions = new Map<string, BoxSession>();

function loadAgentCatalog() {
  try {
    const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => {
      try {
        const raw = readFileSync(join(AGENTS_DIR, f), "utf-8");
        const data = JSON.parse(raw);
        return {
          id: data.identifier || f.replace(".json", ""),
          title: data.meta?.title || data.identifier,
          description: data.meta?.description || "",
          avatar: data.meta?.avatar || "🤖",
          category: data.meta?.category || "general",
          tags: data.meta?.tags || [],
          featured: data.featured || false,
          oneShot: data.oneShot || false,
          openingMessage: data.config?.openingMessage || "",
          openingQuestions: data.config?.openingQuestions || [],
          systemRole: data.config?.systemRole || "",
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function resolveAgentConfig(harness: string, model: string, systemPrompt?: string) {
  const apiKey =
    harness === "codex"
      ? OPENAI_API_KEY
      : harness === "opencode"
        ? OPENCODE_API_KEY
        : ANTHROPIC_API_KEY;
  return {
    harness: harness as any,
    model,
    apiKey,
    ...(systemPrompt ? { options: { systemPrompt } } : {}),
  };
}

function publicOrigin(req?: Request) {
  const configured = process.env.APP_ORIGIN || process.env.VITE_APP_URL || process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (!req) return "https://cheshireterminal.ai";
  const forwardedProto = req.headers["x-forwarded-proto"]?.toString().split(",")[0]?.trim();
  const forwardedHost = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || "localhost:5000";
  const proto = forwardedProto || (host.includes("localhost") || host.startsWith("127.") ? "http" : req.protocol || "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

function asStringRecord(value: unknown) {
  if (!isRecord(value)) return undefined;
  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") record[key] = item;
  }
  return record;
}

function normalizeMcpServers(req: Request, value: unknown, attachCheshireMcp: boolean) {
  const servers = Array.isArray(value) ? value.filter(isRecord).map((server) => ({ ...server })) : [];
  if (!attachCheshireMcp) return servers;

  const hasCheshire = servers.some((server) => server.name === "cheshire-terminal");
  if (hasCheshire) return servers;

  const apiKey = String(req.body?.cheshireApiKey || process.env.CHESHIRE_API_KEY || process.env.CLAWD_API_KEY || "").trim();
  servers.unshift({
    name: "cheshire-terminal",
    url: `${publicOrigin(req)}/mcp`,
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
  });
  return servers;
}

async function persistBoxSessionMessage(session: BoxSession, message: BoxSessionMessage) {
  if (!HONCHO_API_KEY) return;
  try {
    await fetch("https://api.honcho.dev/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${HONCHO_API_KEY}`,
      },
      body: JSON.stringify({
        workspace_id: HONCHO_WORKSPACE_ID,
        session_id: session.id,
        peer_id: session.honchoPeerId || session.humanId,
        metadata: {
          boxId: session.boxId,
          channel: message.channel,
          authorType: message.authorType,
          authorId: message.authorId,
        },
        content: message.content,
      }),
    });
  } catch (error) {
    console.warn("[upstash-box] Honcho persistence failed:", error);
  }
}

function summarizeSession(session: BoxSession) {
  return {
    ...session,
    messages: session.messages.slice(-50),
    messageCount: session.messages.length,
    honchoConfigured: Boolean(HONCHO_API_KEY),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!isRecord(schema)) return z.any();

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum.filter((value): value is string => typeof value === "string");
    if (values.length === schema.enum.length && values.length > 0) {
      return z.enum(values as [string, ...string[]]);
    }
  }

  if (schema.type === "string") return z.string();
  if (schema.type === "number") return z.number();
  if (schema.type === "integer") return z.number().int();
  if (schema.type === "boolean") return z.boolean();

  if (schema.type === "array") {
    return z.array(jsonSchemaToZod(schema.items));
  }

  if (schema.type === "object" || schema.properties || schema.required) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? new Set(schema.required.filter((value): value is string => typeof value === "string"))
      : new Set<string>();

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(properties)) {
      const field = jsonSchemaToZod(value);
      shape[key] = required.has(key) ? field : field.optional();
    }
    return z.object(shape);
  }

  return z.any();
}

function buildResponseSchema(schema: unknown) {
  if (!isRecord(schema)) return undefined;
  return jsonSchemaToZod(schema);
}

function buildRunConfig(body: Record<string, unknown>) {
  const runConfig: Record<string, unknown> = {
    prompt: body.prompt,
  };

  if (isRecord(body.options)) runConfig.options = body.options;

  const timeout = parseOptionalNumber(body.timeout);
  if (timeout !== undefined) runConfig.timeout = timeout;

  const maxRetries = parseOptionalNumber(body.maxRetries);
  if (maxRetries !== undefined) runConfig.maxRetries = maxRetries;

  const responseSchema = buildResponseSchema(body.responseSchema);
  if (responseSchema) runConfig.responseSchema = responseSchema;

  return runConfig;
}

function buildStreamConfig(body: Record<string, unknown>) {
  const streamConfig: Record<string, unknown> = {
    prompt: body.prompt,
  };

  if (isRecord(body.options)) streamConfig.options = body.options;

  const timeout = parseOptionalNumber(body.timeout);
  if (timeout !== undefined) streamConfig.timeout = timeout;

  return streamConfig;
}

async function getBox(id: string, agentCfg?: ReturnType<typeof resolveAgentConfig>) {
  return Box.get(id, {
    apiKey: BOX_API_KEY,
    ...(agentCfg ? { agent: agentCfg } : {}),
  } as any);
}

// ── Agent catalog ─────────────────────────────────────────────────────────────

router.get("/agents", (_req, res) => {
  res.json({ agents: loadAgentCatalog() });
});

router.get("/agents/:id", (req, res) => {
  const agent = loadAgentCatalog().find((a: any) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
});

// ── Pinned openclawd box ──────────────────────────────────────────────────────

router.get("/openclawd", async (_req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const box = await getBox(OPENCLAWD_BOX_ID);
    const b = box as unknown as Record<string, unknown>;
    res.json({ id: b.id, name: b.name, size: b.size, runtime: b.runtime, pinned: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── List / create boxes ───────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const boxes = await Box.list({ apiKey: BOX_API_KEY });
    res.json({ boxes: boxes || [], openclawdBoxId: OPENCLAWD_BOX_ID });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/create", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const {
    runtime = "node",
    size = "small",
    name,
    agentId,
    agentHarness = "claude-code",
    agentModel = "anthropic/claude-sonnet-4-6",
    prompt,
    keepAlive = false,
    gitToken,
    gitRepo,
    env,
    skills,
    mcpServers,
    attachCheshireMcp = true,
  } = req.body;

  try {
    let systemPrompt: string | undefined;
    if (agentId) {
      const tpl = loadAgentCatalog().find((a: any) => a.id === agentId);
      if (tpl) systemPrompt = (tpl as any).systemRole;
    }

    const agentCfg = resolveAgentConfig(agentHarness, agentModel, systemPrompt);
    const normalizedMcpServers = normalizeMcpServers(req, mcpServers, attachCheshireMcp !== false);
    const normalizedEnv = asStringRecord(env);

    const box = await Box.create({
      runtime,
      size,
      name,
      keepAlive,
      agent: agentCfg,
      ...(normalizedEnv ? { env: normalizedEnv } : {}),
      ...(Array.isArray(skills) ? { skills: skills.filter((skill: unknown): skill is string => typeof skill === "string") } : {}),
      ...(normalizedMcpServers.length ? { mcpServers: normalizedMcpServers } : {}),
      ...(gitToken ? { git: { token: gitToken } } : {}),
      apiKey: BOX_API_KEY,
    } as any);

    // Clone repo if provided
    if (gitRepo) {
      try { await (box as any).git.clone({ repo: gitRepo }); } catch {}
    }

    let runResult: any = null;
    if (prompt) {
      try { runResult = await (box.agent as any).run({ prompt }); } catch (e: any) {
        runResult = { error: e.message };
      }
    }

    const b = box as unknown as Record<string, unknown>;
    res.json({
      box: { id: b.id, name: b.name, status: b.status, size: b.size, runtime },
      runResult,
      mcpServers: normalizedMcpServers.map((server) => ({ name: server.name, url: server.url, package: server.package })),
      session: {
        create: `/api/boxes/${String(b.id)}/sessions`,
        messages: `/api/boxes/${String(b.id)}/sessions/{sessionId}/messages`,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Human/agent sessions ──────────────────────────────────────────────────────

router.post("/:id/sessions", async (req, res) => {
  const principalFallback =
    req.apiPrincipal?.type === "api-key"
      ? req.apiPrincipal.keyPrefix
      : req.apiPrincipal?.userId;
  const humanId = String(req.body?.humanId || req.body?.telegramUserId || principalFallback || "human").slice(0, 120);
  const channel = ["api", "telegram", "arena", "box"].includes(req.body?.channel) ? req.body.channel : "api";
  const now = new Date().toISOString();
  const session: BoxSession = {
    id: `boxsess_${randomUUID()}`,
    boxId: req.params.id,
    humanId,
    channel,
    title: String(req.body?.title || `Box ${req.params.id} chat`).slice(0, 160),
    honchoPeerId: String(req.body?.honchoPeerId || humanId).slice(0, 160),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  boxSessions.set(session.id, session);

  const systemMessage: BoxSessionMessage = {
    id: `msg_${randomUUID()}`,
    sessionId: session.id,
    boxId: session.boxId,
    authorType: "system",
    authorId: "cheshire-terminal",
    channel,
    content: `Session opened for box ${session.boxId}. Humans can send messages through API or Telegram bridge routes.`,
    createdAt: now,
  };
  session.messages.push(systemMessage);
  await persistBoxSessionMessage(session, systemMessage);

  res.status(201).json({ session: summarizeSession(session) });
});

router.get("/:id/sessions/:sessionId", (req, res) => {
  const session = boxSessions.get(req.params.sessionId);
  if (!session || session.boxId !== req.params.id) return res.status(404).json({ error: "Box session not found" });
  res.json({ session: summarizeSession(session) });
});

router.post("/:id/sessions/:sessionId/messages", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const session = boxSessions.get(req.params.sessionId);
  if (!session || session.boxId !== req.params.id) return res.status(404).json({ error: "Box session not found" });

  const content = String(req.body?.content || "").trim().slice(0, 4000);
  if (!content) return res.status(400).json({ error: "content is required" });

  const channel = ["api", "telegram", "arena", "box"].includes(req.body?.channel) ? req.body.channel : session.channel;
  const authorType = req.body?.authorType === "agent" || req.body?.authorType === "system" ? req.body.authorType : "human";
  const authorId = String(req.body?.authorId || session.humanId || "human").slice(0, 160);
  const now = new Date().toISOString();
  const message: BoxSessionMessage = {
    id: `msg_${randomUUID()}`,
    sessionId: session.id,
    boxId: session.boxId,
    authorType,
    authorId,
    channel,
    content,
    createdAt: now,
  };
  session.messages.push(message);
  session.updatedAt = now;
  await persistBoxSessionMessage(session, message);

  let agentReply: BoxSessionMessage | null = null;
  if (req.body?.runAgent !== false && authorType === "human") {
    const box = await getBox(req.params.id, resolveAgentConfig(
      String(req.body?.agentHarness || "claude-code"),
      String(req.body?.agentModel || "anthropic/claude-sonnet-4-6"),
    ));
    const transcript = session.messages
      .slice(-20)
      .map((item) => `${item.authorType}:${item.authorId}: ${item.content}`)
      .join("\n");
    const run = await (box.agent as any).run({
      prompt: `You are a Cheshire Terminal box agent in session ${session.id}.
Reply to the latest human message. Use attached MCP tools if useful.

Recent transcript:
${transcript}`,
    });
    agentReply = {
      id: `msg_${randomUUID()}`,
      sessionId: session.id,
      boxId: session.boxId,
      authorType: "agent",
      authorId: req.params.id,
      channel: "box",
      content: String(run.result || ""),
      createdAt: new Date().toISOString(),
      runId: run.id,
      cost: run.cost,
    };
    session.messages.push(agentReply);
    session.updatedAt = agentReply.createdAt;
    await persistBoxSessionMessage(session, agentReply);
  }

  res.status(201).json({ message, agentReply, session: summarizeSession(session) });
});

// ── Box info ──────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const box = await getBox(req.params.id);
    const b = box as unknown as Record<string, unknown>;
    let status = b.status as string;
    try {
      const s = await (box as unknown as { getStatus(): Promise<{ status: string }> }).getStatus();
      status = s.status;
    } catch {}
    res.json({ id: b.id, name: b.name, status, size: b.size, runtime: b.runtime, pinned: req.params.id === OPENCLAWD_BOX_ID });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Agent run (structured output) ─────────────────────────────────────────────

router.post("/:id/run", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { prompt, agentId, agentHarness = "claude-code", agentModel = "anthropic/claude-sonnet-4-6" } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  try {
    let systemPrompt: string | undefined;
    if (agentId) {
      const tpl = loadAgentCatalog().find((a: any) => a.id === agentId);
      if (tpl) systemPrompt = (tpl as any).systemRole;
    }

    const box = await getBox(req.params.id, resolveAgentConfig(agentHarness, agentModel, systemPrompt));
    const toolUses: Array<{ name: string; input: Record<string, unknown> }> = [];
    const run = await (box.agent as any).run({
      ...buildRunConfig(req.body),
      onToolUse: (tool: { name: string; input: Record<string, unknown> }) => {
        toolUses.push(tool);
      },
    });
    res.json({ result: run.result, status: run.status, cost: run.cost, toolUses });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Agent stream (SSE) ────────────────────────────────────────────────────────

router.post("/:id/stream", async (req: Request, res: Response) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { prompt, agentId, agentHarness = "claude-code", agentModel = "anthropic/claude-sonnet-4-6" } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let systemPrompt: string | undefined;
    if (agentId) {
      const tpl = loadAgentCatalog().find((a: any) => a.id === agentId);
      if (tpl) systemPrompt = (tpl as any).systemRole;
    }

    const box = await getBox(req.params.id, resolveAgentConfig(agentHarness, agentModel, systemPrompt));
    const stream = await (box.agent as any).stream(buildStreamConfig(req.body));

    for await (const part of stream) {
      if (part.type === "text-delta") {
        send({ type: "text", text: part.text });
      } else if (part.type === "tool_use") {
        send({ type: "tool", name: part.name, input: part.input ?? {} });
      }
    }

    send({ type: "done", status: stream.status, cost: stream.cost });
  } catch (e: any) {
    send({ type: "error", message: e.message });
  } finally {
    res.end();
  }
});

// ── Shell command ─────────────────────────────────────────────────────────────

router.post("/:id/exec", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "command is required" });

  try {
    const box = await getBox(req.params.id);
    const run = await box.exec.command(command);
    res.json({ result: run.result, status: run.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Code execution ────────────────────────────────────────────────────────────

router.post("/:id/exec-code", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { code, lang = "js", timeout } = req.body;
  if (!code) return res.status(400).json({ error: "code is required" });

  try {
    const box = await getBox(req.params.id);
    const run = await box.exec.code({ code, lang, ...(timeout ? { timeout } : {}) });
    res.json({ result: (run as any).result ?? (run as any).output, exitCode: (run as any).exit_code ?? (run as any).exitCode, status: (run as any).status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── File operations ───────────────────────────────────────────────────────────

router.get("/:id/files", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { path: dirPath = "/" } = req.query;
  try {
    const box = await getBox(req.params.id);
    const files = await (box as any).files.list(dirPath);
    res.json({ files });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/files/read", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: "path query param required" });
  try {
    const box = await getBox(req.params.id);
    const content = await (box as any).files.read(filePath as string);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/files/write", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: "path and content required" });
  try {
    const box = await getBox(req.params.id);
    await (box as any).files.write({ path: filePath, content });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Git operations ────────────────────────────────────────────────────────────

router.post("/:id/git/clone", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { repo, token } = req.body;
  if (!repo) return res.status(400).json({ error: "repo is required" });
  try {
    const box = await Box.get(req.params.id, {
      apiKey: BOX_API_KEY,
      ...(token ? { git: { token } } : {}),
    } as any);
    await (box as any).git.clone({ repo });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/git/pr", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  const { title, base = "main", body: prBody, token } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  try {
    const box = await Box.get(req.params.id, {
      apiKey: BOX_API_KEY,
      ...(token ? { git: { token } } : {}),
    } as any);
    const pr = await (box as any).git.createPR({ title, base, body: prBody });
    res.json({ url: pr.url, number: pr.number });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/git/diff", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const box = await getBox(req.params.id);
    const diff = await (box as any).git.diff();
    res.json({ diff });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

router.post("/:id/pause", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const box = await getBox(req.params.id);
    await box.pause();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/resume", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const box = await getBox(req.params.id);
    await box.resume();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  if (!BOX_API_KEY) return res.status(500).json({ error: "UPSTASH_BOX_API_KEY not configured" });
  try {
    const box = await getBox(req.params.id);
    await box.delete();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
