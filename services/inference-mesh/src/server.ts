/**
 * Clawd Inference Mesh — API Server
 *
 * POST /inference          Run inference + generate ZK commitment + submit on-chain
 * POST /inference/async    Queue request, return job id (non-blocking)
 * GET  /inference/:jobId   Poll async result
 * GET  /health             Liveness check
 * GET  /mesh               Mesh peer info
 * GET  /models             Available Ollama models
 *
 * x402 payment header supported: Payment-Payload: <base64 signed USDC transfer>
 * $CLAWD gating: min balance check via on-chain token account
 *
 * Architecture:
 *   Client → this node → Ollama (local) → ZK prover → solana_bridge → on-chain
 *   OR
 *   Client → this node → bestPeer (6PN proxy) → remote node handles above
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { runInference, listAvailableModels, isOllamaReady } from "./inference.js";
import { buildCommitment } from "./zk_prover.js";
import { submitOnChain, getNodePubkey, subscribeToInferenceRequests } from "./solana_bridge.js";
import { startMeshServer, gossipToPeers, bestPeer, meshInfo, setSelfLoad, peerCount } from "./mesh.js";
import { handleAdminRoute, type AdminState } from "./admin.js";
import { recentFlow, recordFlow } from "./flow.js";
import { runSolGptChat, solGptStatus } from "./sol_gpt.js";

const PORT       = parseInt(process.env.PORT ?? "8080");
const NODE_PUBKEY = (() => { try { return getNodePubkey(); } catch { return "not-configured"; } })();

// In-memory job store (TODO: migrate to Light Protocol compressed accounts for persistence)
const jobs = new Map<string, { status: "pending" | "done" | "error"; result?: unknown; error?: string }>();

let activeRequests = 0;
const adminState: AdminState = {
  publicInferenceEnabled: process.env.PUBLIC_INFERENCE_ENABLED !== "false",
};

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
};

const PUBLIC_DIR = new URL("./public/", import.meta.url);
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

// ── HTTP helpers ────────────────────────────────────────────────────────────────

function json(res: ServerResponse, code: number, body: unknown): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": buf.length,
    "X-Mesh-Node": NODE_PUBKEY.slice(0, 8),
    ...CORS_HEADERS,
  });
  res.end(buf);
}

function html(res: ServerResponse, code: number, body: string): void {
  const buf = Buffer.from(body);
  res.writeHead(code, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    "X-Mesh-Node": NODE_PUBKEY.slice(0, 8),
    ...CORS_HEADERS,
  });
  res.end(buf);
}

function updateLoad(): void {
  setSelfLoad(Math.min(activeRequests / 10, 1));
}

function beginRequest(): void {
  activeRequests++;
  updateLoad();
}

function endRequest(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  updateLoad();
}

async function servePublicAsset(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname !== "/" && pathname !== "/sol-gpt" && pathname !== "/sol-gpt/" && !pathname.startsWith("/assets/")) return false;

  const relativePath = pathname === "/" || pathname === "/sol-gpt" || pathname === "/sol-gpt/"
    ? "index.html"
    : decodeURIComponent(pathname.slice(1));
  if (relativePath.includes("..")) return false;

  try {
    const fileUrl = new URL(relativePath, PUBLIC_DIR);
    const body = await readFile(fileUrl);
    const contentType = MIME_TYPES[relativePath.match(/\.[^.]+$/)?.[0] ?? ""] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": body.length,
      "Cache-Control": relativePath === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
      "X-Mesh-Node": NODE_PUBKEY.slice(0, 8),
      ...CORS_HEADERS,
    });
    if (method === "HEAD") res.end();
    else res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function visualizationState(): Promise<Record<string, unknown>> {
  const [ollamaOk, models] = await Promise.all([
    isOllamaReady(),
    listAvailableModels().catch(() => []),
  ]);
  return {
    ok: ollamaOk,
    node: NODE_PUBKEY.slice(0, 8),
    node_pubkey: NODE_PUBKEY,
    uptime_seconds: Math.floor(process.uptime()),
    active_reqs: activeRequests,
    public_inference_enabled: adminState.publicInferenceEnabled,
    ollama: {
      ready: ollamaOk,
      host: OLLAMA_HOST,
      models,
    },
    jobs: {
      total: jobs.size,
      counts: {
        pending: [...jobs.values()].filter(j => j.status === "pending").length,
        done: [...jobs.values()].filter(j => j.status === "done").length,
        error: [...jobs.values()].filter(j => j.status === "error").length,
      },
    },
    mesh: meshInfo(),
    peers: peerCount(),
    flow: recentFlow(80),
    now: Date.now(),
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

// ── Core inference handler ──────────────────────────────────────────────────────

async function handleInference(
  prompt:       string,
  system:       string | undefined,
  model:        string | undefined,
  trading:      boolean,
  requestId:    string,
  submitChain:  boolean,
): Promise<Record<string, unknown>> {
  beginRequest();

  try {
    // Check if a peer is less loaded
    if (submitChain) {
      const peer = await bestPeer(model);
      if (peer) {
        const proxyRes = await fetch(`http://${peer}:${PORT}/inference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, system, model, trading, requestId, _proxied: true }),
          signal: AbortSignal.timeout(120_000),
        });
        if (proxyRes.ok) return await proxyRes.json();
      }
    }

    // Run inference locally
    const result = await runInference({ requestId, prompt, system, model, trading });

    // Build ZK commitment
    const slot = BigInt(Math.floor(Date.now() / 400));  // ~slot estimate (real: read from RPC)
    const commitment = buildCommitment(
      result.model_cid,
      prompt,
      result.output,
      NODE_PUBKEY,
      slot,
    );

    let onChainResult: { ai_inference_sig: string; clawd_zk_sig: string; slot: bigint } | null = null;

    // Submit on-chain if requested (and node keypair configured)
    if (submitChain && NODE_PUBKEY !== "not-configured") {
      try {
        onChainResult = await submitOnChain(requestId, result.output, commitment);
      } catch (e) {
        console.warn("[server] on-chain submission failed (non-fatal):", (e as Error).message);
      }
    }

    return {
      request_id:        requestId,
      output:            result.output,
      model:             result.model,
      model_cid:         result.model_cid,
      zk: {
        version:         commitment.version,
        commitment:      commitment.commitment,
        input_hash:      commitment.input_hash,
        output_hash:     commitment.output_hash,
        node_pubkey:     commitment.node_pubkey,
        slot:            commitment.slot.toString(),
      },
      on_chain:          onChainResult ? {
        ai_inference_sig: onChainResult.ai_inference_sig,
        clawd_zk_sig:     onChainResult.clawd_zk_sig,
        slot:             onChainResult.slot.toString(),
      } : null,
      stats: {
        prompt_tokens:      result.prompt_tokens,
        completion_tokens:  result.completion_tokens,
        elapsed_ms:         result.elapsed_ms,
        peer_count:         peerCount(),
      },
    };
  } finally {
    endRequest();
  }
}

// ── Request router ─────────────────────────────────────────────────────────────

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url    = req.url ?? "/";
  const pathname = new URL(url, "http://localhost").pathname;
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const handledAdmin = await handleAdminRoute(req, res, pathname, {
    nodePubkey: NODE_PUBKEY,
    activeRequests: () => activeRequests,
    jobs,
    state: adminState,
    ollamaHost: OLLAMA_HOST,
    corsHeaders: CORS_HEADERS,
    isOllamaReady,
    listAvailableModels,
    meshInfo,
    peerCount,
    warmup: async (model, prompt) => {
      const requestId = `warmup-${Date.now()}`;
      const started = Date.now();
      recordFlow({ kind: "warmup", route: "/admin/api/warmup", status: "start", model, request_id: requestId });
      try {
        const result = await runInference({
          requestId,
          prompt: prompt ?? "Say ready in one short sentence.",
          model,
          maxTokens: 32,
          temperature: 0,
        });
        recordFlow({
          kind: "warmup",
          route: "/admin/api/warmup",
          status: "done",
          model,
          request_id: requestId,
          elapsed_ms: Date.now() - started,
        });
        return result;
      } catch (e) {
        recordFlow({
          kind: "warmup",
          route: "/admin/api/warmup",
          status: "error",
          model,
          request_id: requestId,
          elapsed_ms: Date.now() - started,
          error: (e as Error).message,
        });
        throw e;
      }
    },
  });
  if (handledAdmin) return;

  if (method === "GET" && (pathname === "/mesh/visualization" || pathname === "/status")) {
    return json(res, 200, await visualizationState());
  }

  if (method === "GET" && pathname === "/flow") {
    return json(res, 200, { flow: recentFlow(80), now: Date.now() });
  }

  if (method === "GET" && pathname === "/api/sol-gpt/status") {
    const models = await listAvailableModels();
    return json(res, 200, {
      ok: true,
      node: NODE_PUBKEY.slice(0, 8),
      public_inference_enabled: adminState.publicInferenceEnabled,
      ...solGptStatus(models),
    });
  }

  if (method === "POST" && (pathname === "/api/sol-gpt/chat" || pathname === "/sol-gpt/v1/chat/completions")) {
    if (!adminState.publicInferenceEnabled) {
      return json(res, 503, { error: "public inference disabled by admin" });
    }

    let body: Record<string, unknown>;
    try { body = await readBody(req) as Record<string, unknown>; }
    catch { return json(res, 400, { error: "invalid JSON" }); }

    const requestId = `solgpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const started = Date.now();
    const requestedModel = typeof body.model === "string" ? body.model : "sol-gpt/auto";
    recordFlow({ kind: "solgpt", route: pathname, status: "start", model: requestedModel, request_id: requestId });
    beginRequest();

    try {
      const models = await listAvailableModels();
      const result = await runSolGptChat(body, OLLAMA_HOST, models);
      const completion = {
        ...result.completion,
        sol_gpt: {
          provider: result.provider,
          model: result.model,
          fallback_used: result.fallback_used,
          attempts: result.attempts,
          node: NODE_PUBKEY.slice(0, 8),
        },
      };
      recordFlow({
        kind: "solgpt",
        route: pathname,
        status: "done",
        model: result.model,
        request_id: requestId,
        elapsed_ms: Date.now() - started,
      });
      return json(res, 200, completion);
    } catch (e) {
      recordFlow({
        kind: "solgpt",
        route: pathname,
        status: "error",
        model: requestedModel,
        request_id: requestId,
        elapsed_ms: Date.now() - started,
        error: (e as Error).message,
      });
      return json(res, 502, { error: (e as Error).message });
    } finally {
      endRequest();
    }
  }

  if (await servePublicAsset(req, res, pathname)) return;

  // Public status page for the bare Fly app URL.
  if (method === "GET" && pathname === "/") {
    const node = NODE_PUBKEY.slice(0, 8);
    const ollamaOk = await isOllamaReady();
    const mesh = meshInfo();
    return html(res, 200, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Clawd Inference Mesh</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1020; --panel:#121a2e; --line:#26334d; --text:#eef4ff; --muted:#93a4bd; --accent:#2dd4bf; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(760px, calc(100% - 32px)); border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 28px; }
    h1 { margin: 0 0 14px; font-size: 28px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
    .status { margin: 18px 0; font-size: 18px; color: var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 20px 0; }
    .metric { border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 6px; font-size: 18px; overflow-wrap: anywhere; }
    .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    a { color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; text-decoration: none; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } main { padding: 20px; } }
  </style>
</head>
<body>
  <main>
    <h1>Clawd Inference Mesh</h1>
    <p class="status">Mesh node <code>${node}</code> ${ollamaOk ? "online" : "starting"}</p>
    <div class="grid">
      <div class="metric"><span>Node Pubkey</span><strong>${NODE_PUBKEY}</strong></div>
      <div class="metric"><span>Region</span><strong>${mesh.region}</strong></div>
      <div class="metric"><span>Peers</span><strong>${peerCount()}</strong></div>
    </div>
    <p>OpenAI-compatible chat completions are available at <code>/v1/chat/completions</code>. Admin controls are protected by <code>MESH_ADMIN_KEY</code>.</p>
    <div class="links">
      <a href="/admin">Admin Console</a>
      <a href="/health">Health JSON</a>
      <a href="/models">Models JSON</a>
      <a href="/mesh">Mesh JSON</a>
    </div>
  </main>
</body>
</html>`);
  }

  // ── OpenAI-compatible proxy (for Studio + any OpenAI SDK client) ────────────

  // GET /api/tags → Ollama model list (Studio sidebar)
  if (method === "GET" && pathname === "/api/tags") {
    try {
      const upstream = await fetch(`${OLLAMA_HOST}/api/tags`);
      const body = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(body);
    } catch (e) {
      json(res, 502, { error: `Ollama unreachable: ${(e as Error).message}` });
    }
    return;
  }

  // POST /v1/chat/completions → streaming proxy to Ollama (Studio chat)
  if (method === "POST" && pathname === "/v1/chat/completions") {
    if (!adminState.publicInferenceEnabled) {
      return json(res, 503, { error: "public inference disabled by admin" });
    }

    let bodyStr = "";
    await new Promise<void>((resolve, reject) => {
      req.on("data", (c) => { bodyStr += c; });
      req.on("end", resolve);
      req.on("error", reject);
    });

    let chatModel: string | undefined;
    try {
      const parsed = JSON.parse(bodyStr) as { model?: unknown };
      chatModel = typeof parsed.model === "string" ? parsed.model : undefined;
    } catch {
      chatModel = undefined;
    }

    const started = Date.now();
    recordFlow({ kind: "chat", route: "/v1/chat/completions", status: "start", model: chatModel });
    beginRequest();

    try {
      const upstream = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
        body: bodyStr,
        signal: AbortSignal.timeout(300_000),
      });

      // Stream response directly to client
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      });

      if (!upstream.body) { res.end(); return; }
      const reader = upstream.body.getReader();
      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
        return pump();
      };
      await pump();
      recordFlow({
        kind: "chat",
        route: "/v1/chat/completions",
        status: upstream.ok ? "done" : "error",
        model: chatModel,
        elapsed_ms: Date.now() - started,
      });
    } catch (e) {
      recordFlow({
        kind: "chat",
        route: "/v1/chat/completions",
        status: "error",
        model: chatModel,
        elapsed_ms: Date.now() - started,
        error: (e as Error).message,
      });
      if (!res.headersSent) {
        json(res, 502, { error: `Ollama unreachable: ${(e as Error).message}` });
      }
    } finally {
      endRequest();
    }
    return;
  }

  // Health
  if (method === "GET" && pathname === "/health") {
    const ollamaOk = await isOllamaReady();
    const code = ollamaOk ? 200 : 503;
    return json(res, code, {
      ok:          ollamaOk,
      node:        NODE_PUBKEY.slice(0, 8),
      active_reqs: activeRequests,
      peers:       peerCount(),
      public_inference_enabled: adminState.publicInferenceEnabled,
    });
  }

  // Mesh info
  if (method === "GET" && pathname === "/mesh") {
    return json(res, 200, meshInfo());
  }

  // Model list
  if (method === "GET" && pathname === "/models") {
    return json(res, 200, { models: await listAvailableModels() });
  }

  // Sync inference
  if (method === "POST" && pathname === "/inference") {
    if (!adminState.publicInferenceEnabled) {
      return json(res, 503, { error: "public inference disabled by admin" });
    }

    let body: Record<string, unknown>;
    try { body = await readBody(req) as Record<string, unknown>; }
    catch { return json(res, 400, { error: "invalid JSON" }); }

    const prompt    = typeof body.prompt   === "string" ? body.prompt   : "";
    const system    = typeof body.system   === "string" ? body.system   : undefined;
    const model     = typeof body.model    === "string" ? body.model    : undefined;
    const trading   = body.trading === true;
    const requestId = typeof body.requestId === "string"
      ? body.requestId
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const noChain   = body._proxied === true || body.no_chain === true;

    if (!prompt) return json(res, 400, { error: "prompt is required" });

    const started = Date.now();
    recordFlow({ kind: "inference", route: "/inference", status: "start", model, request_id: requestId });

    try {
      const result = await handleInference(prompt, system, model, trading, requestId, !noChain);
      recordFlow({
        kind: "inference",
        route: "/inference",
        status: "done",
        model,
        request_id: requestId,
        elapsed_ms: Date.now() - started,
      });
      return json(res, 200, result);
    } catch (e) {
      console.error("[server] inference error:", e);
      recordFlow({
        kind: "inference",
        route: "/inference",
        status: "error",
        model,
        request_id: requestId,
        elapsed_ms: Date.now() - started,
        error: (e as Error).message,
      });
      return json(res, 500, { error: (e as Error).message });
    }
  }

  // Async inference
  if (method === "POST" && pathname === "/inference/async") {
    if (!adminState.publicInferenceEnabled) {
      return json(res, 503, { error: "public inference disabled by admin" });
    }

    let body: Record<string, unknown>;
    try { body = await readBody(req) as Record<string, unknown>; }
    catch { return json(res, 400, { error: "invalid JSON" }); }

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(jobId, { status: "pending" });

    // Fire and forget
    const prompt    = typeof body.prompt === "string" ? body.prompt : "";
    const system    = typeof body.system === "string" ? body.system : undefined;
    const model     = typeof body.model  === "string" ? body.model  : undefined;
    const trading   = body.trading === true;
    const started   = Date.now();
    recordFlow({ kind: "async", route: "/inference/async", status: "queued", model, request_id: jobId });

    handleInference(prompt, system, model, trading, jobId, true)
      .then(result => {
        jobs.set(jobId, { status: "done", result });
        recordFlow({
          kind: "async",
          route: "/inference/async",
          status: "done",
          model,
          request_id: jobId,
          elapsed_ms: Date.now() - started,
        });
      })
      .catch(e => {
        jobs.set(jobId, { status: "error", error: (e as Error).message });
        recordFlow({
          kind: "async",
          route: "/inference/async",
          status: "error",
          model,
          request_id: jobId,
          elapsed_ms: Date.now() - started,
          error: (e as Error).message,
        });
      });

    return json(res, 202, { job_id: jobId, status: "pending" });
  }

  // Poll async result
  const pollMatch = pathname.match(/^\/inference\/([^/]+)$/);
  if (method === "GET" && pollMatch) {
    const job = jobs.get(pollMatch[1]);
    if (!job) return json(res, 404, { error: "job not found" });
    return json(res, job.status === "pending" ? 202 : 200, job);
  }

  return json(res, 404, { error: "not found" });
}

// ── Boot ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[server] node pubkey: ${NODE_PUBKEY}`);

  // Start internal mesh gossip server
  startMeshServer();

  // Start HTTP API
  const server = createServer((req, res) => {
    route(req, res).catch(e => {
      console.error("[server] unhandled:", e);
      try { json(res, 500, { error: "internal error" }); } catch { /* already sent */ }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] inference API listening on :${PORT}`);
  });

  // Gossip to peers every 30s
  const models = await listAvailableModels();
  await gossipToPeers(models);
  setInterval(async () => {
    const m = await listAvailableModels();
    await gossipToPeers(m);
  }, 30_000);

  // Listen for on-chain inference requests (event-driven mode)
  if (NODE_PUBKEY !== "not-configured") {
    try {
      subscribeToInferenceRequests(async (requestId, input, modelCid) => {
        console.log(`[server] on-chain request: ${requestId} model=${modelCid}`);
        await handleInference(input, undefined, undefined, false, requestId, true);
      });
      console.log("[server] subscribed to on-chain InferenceRequested events");
    } catch (e) {
      console.warn("[server] could not subscribe to on-chain events:", (e as Error).message);
    }
  }

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("[server] SIGTERM — draining");
    server.close(() => process.exit(0));
  });
}

main().catch(e => { console.error("[server] fatal:", e); process.exit(1); });
