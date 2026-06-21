import { IncomingMessage, ServerResponse } from "node:http";

type JobSnapshot = {
  id: string;
  status: string;
  has_result: boolean;
  error?: string;
};

export type AdminState = {
  publicInferenceEnabled: boolean;
};

export type AdminContext = {
  nodePubkey: string;
  activeRequests: () => number;
  jobs: Map<string, { status: "pending" | "done" | "error"; result?: unknown; error?: string }>;
  state: AdminState;
  ollamaHost: string;
  corsHeaders: Record<string, string>;
  isOllamaReady: () => Promise<boolean>;
  listAvailableModels: () => Promise<string[]>;
  meshInfo: () => unknown;
  peerCount: () => number;
  warmup: (model?: string, prompt?: string) => Promise<unknown>;
};

const ADMIN_KEY = process.env.MESH_ADMIN_KEY || process.env.ADMIN_KEY || "";
const STARTED_AT = Date.now();

function writeText(
  res: ServerResponse,
  code: number,
  contentType: string,
  body: string,
  corsHeaders: Record<string, string>,
): void {
  const buf = Buffer.from(body);
  res.writeHead(code, {
    "Content-Type": contentType,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    ...corsHeaders,
  });
  res.end(buf);
}

function json(
  res: ServerResponse,
  code: number,
  body: unknown,
  corsHeaders: Record<string, string>,
): void {
  writeText(res, code, "application/json", JSON.stringify(body), corsHeaders);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      if (!data.trim()) return resolve({});
      try { resolve(JSON.parse(data) as Record<string, unknown>); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function headerValue(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function suppliedAdminKey(req: IncomingMessage): string {
  const auth = headerValue(req, "authorization");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headerValue(req, "x-admin-key").trim();
}

function requireAdmin(req: IncomingMessage, res: ServerResponse, ctx: AdminContext): boolean {
  if (!ADMIN_KEY) {
    json(res, 503, { error: "admin API disabled; set MESH_ADMIN_KEY" }, ctx.corsHeaders);
    return false;
  }

  const key = suppliedAdminKey(req);
  if (!key || !timingSafeEqual(key, ADMIN_KEY)) {
    json(res, 401, { error: "admin key required" }, ctx.corsHeaders);
    return false;
  }

  return true;
}

function jobList(ctx: AdminContext): JobSnapshot[] {
  return [...ctx.jobs.entries()].map(([id, job]) => ({
    id,
    status: job.status,
    has_result: job.result !== undefined,
    ...(job.error ? { error: job.error } : {}),
  }));
}

function jobCounts(ctx: AdminContext): Record<string, number> {
  const counts: Record<string, number> = { pending: 0, done: 0, error: 0 };
  for (const job of ctx.jobs.values()) counts[job.status] = (counts[job.status] ?? 0) + 1;
  return counts;
}

async function ollamaJson(
  ctx: AdminContext,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${ctx.ollamaHost}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(600_000),
  });

  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = { raw: text }; }
  }

  if (!res.ok) {
    const detail = typeof body === "object" && body && "error" in body
      ? String((body as { error: unknown }).error)
      : text;
    throw new Error(`Ollama ${res.status}: ${detail}`);
  }

  return body;
}

async function statusPayload(ctx: AdminContext): Promise<Record<string, unknown>> {
  const [ollamaReady, models] = await Promise.all([
    ctx.isOllamaReady(),
    ctx.listAvailableModels(),
  ]);

  return {
    ok: ollamaReady,
    node: ctx.nodePubkey.slice(0, 8),
    node_pubkey: ctx.nodePubkey,
    uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    active_reqs: ctx.activeRequests(),
    peers: ctx.peerCount(),
    public_inference_enabled: ctx.state.publicInferenceEnabled,
    ollama: {
      ready: ollamaReady,
      host: ctx.ollamaHost,
      models,
    },
    jobs: {
      total: ctx.jobs.size,
      counts: jobCounts(ctx),
    },
    mesh: ctx.meshInfo(),
    admin_enabled: Boolean(ADMIN_KEY),
  };
}

function adminPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Clawd Mesh Admin</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1020; --panel:#121a2e; --muted:#93a4bd; --line:#26334d; --text:#eef4ff; --accent:#2dd4bf; --warn:#f59e0b; --bad:#f87171; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--line); background: rgba(11,16,32,.96); }
    main, header > div { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
    header > div { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 15px; letter-spacing: 0; }
    main { padding: 24px 0 40px; display: grid; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .panel, .metric { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 16px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 6px; font-size: 22px; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    input, textarea, select, button { border-radius: 6px; border: 1px solid var(--line); background: #0f172a; color: var(--text); font: inherit; }
    input, textarea, select { padding: 10px 12px; min-height: 40px; }
    input { min-width: min(340px, 100%); }
    textarea { width: 100%; min-height: 92px; resize: vertical; }
    button { min-height: 40px; padding: 0 14px; cursor: pointer; }
    button.primary { background: #0f766e; border-color: #0f766e; }
    button.warn { background: #92400e; border-color: #92400e; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { margin: 0; overflow: auto; white-space: pre-wrap; color: #cbd5e1; }
    .muted { color: var(--muted); }
    .ok { color: var(--accent); }
    .bad { color: var(--bad); }
    .warnText { color: var(--warn); }
    .stack { display: grid; gap: 10px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .model-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; color: #cbd5e1; font-size: 12px; }
    @media (max-width: 860px) { .grid, .split { grid-template-columns: 1fr; } header > div { align-items: flex-start; flex-direction: column; padding: 14px 0; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div>
        <h1>Clawd Mesh Admin</h1>
        <div id="subtitle" class="muted">Admin API requires <code>MESH_ADMIN_KEY</code></div>
      </div>
      <div class="row">
        <input id="adminKey" type="password" autocomplete="current-password" placeholder="Admin key" />
        <button id="saveKey">Use Key</button>
        <button id="refresh" class="primary">Refresh</button>
      </div>
    </div>
  </header>

  <main>
    <section class="grid">
      <div class="metric"><span>Ollama</span><strong id="ollama">-</strong></div>
      <div class="metric"><span>Active Requests</span><strong id="active">-</strong></div>
      <div class="metric"><span>Peers</span><strong id="peers">-</strong></div>
      <div class="metric"><span>Public Inference</span><strong id="traffic">-</strong></div>
    </section>

    <section class="panel stack">
      <h2>Traffic Control</h2>
      <div class="row">
        <button id="enableTraffic" class="primary">Enable Public Inference</button>
        <button id="disableTraffic" class="warn">Disable Public Inference</button>
      </div>
      <div class="muted">Disabling public inference rejects <code>/inference</code>, <code>/inference/async</code>, and <code>/v1/chat/completions</code>. Admin APIs stay available.</div>
    </section>

    <section class="split">
      <div class="panel stack">
        <h2>Models</h2>
        <div id="models" class="model-list"></div>
        <div class="row">
          <input id="modelName" placeholder="8bit/solana-clawd-core-ai:latest" />
          <button id="pullModel" class="primary">Pull</button>
          <button id="deleteModel">Delete</button>
        </div>
      </div>

      <div class="panel stack">
        <h2>Warmup</h2>
        <input id="warmupModel" placeholder="Model (optional)" />
        <textarea id="warmupPrompt">Say ready in one short sentence.</textarea>
        <button id="warmup" class="primary">Run Warmup</button>
      </div>
    </section>

    <section class="split">
      <div class="panel stack">
        <h2>Jobs</h2>
        <div class="row">
          <button id="loadJobs">Load Jobs</button>
          <button id="clearJobs">Clear Finished Jobs</button>
        </div>
        <pre id="jobs">{}</pre>
      </div>

      <div class="panel stack">
        <h2>Response</h2>
        <pre id="output">Waiting for admin key.</pre>
      </div>
    </section>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const output = $("output");
    const keyInput = $("adminKey");
    keyInput.value = sessionStorage.getItem("meshAdminKey") || "";

    function key() { return keyInput.value.trim(); }
    function headers() { return { "Content-Type": "application/json", "Authorization": "Bearer " + key() }; }
    function show(value) { output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); }

    async function api(path, options = {}) {
      if (!key()) throw new Error("Admin key is required");
      const res = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "HTTP " + res.status);
      return body;
    }

    async function refresh() {
      try {
        const status = await api("/admin/api/status");
        $("ollama").textContent = status.ollama.ready ? "online" : "offline";
        $("ollama").className = status.ollama.ready ? "ok" : "bad";
        $("active").textContent = status.active_reqs;
        $("peers").textContent = status.peers;
        $("traffic").textContent = status.public_inference_enabled ? "enabled" : "disabled";
        $("traffic").className = status.public_inference_enabled ? "ok" : "warnText";
        $("subtitle").textContent = status.node + " · uptime " + status.uptime_seconds + "s";
        $("models").innerHTML = "";
        for (const model of status.ollama.models || []) {
          const span = document.createElement("span");
          span.className = "pill";
          span.textContent = model;
          span.onclick = () => { $("modelName").value = model; $("warmupModel").value = model; };
          $("models").appendChild(span);
        }
        show(status);
      } catch (e) {
        show(e.message || String(e));
      }
    }

    $("saveKey").onclick = () => { sessionStorage.setItem("meshAdminKey", key()); refresh(); };
    $("refresh").onclick = refresh;
    $("enableTraffic").onclick = async () => show(await api("/admin/api/traffic", { method: "POST", body: JSON.stringify({ enabled: true }) }).then(x => (refresh(), x)));
    $("disableTraffic").onclick = async () => show(await api("/admin/api/traffic", { method: "POST", body: JSON.stringify({ enabled: false }) }).then(x => (refresh(), x)));
    $("pullModel").onclick = async () => show(await api("/admin/api/models/pull", { method: "POST", body: JSON.stringify({ model: $("modelName").value.trim() }) }).then(x => (refresh(), x)));
    $("deleteModel").onclick = async () => show(await api("/admin/api/models/delete", { method: "POST", body: JSON.stringify({ model: $("modelName").value.trim() }) }).then(x => (refresh(), x)));
    $("warmup").onclick = async () => show(await api("/admin/api/warmup", { method: "POST", body: JSON.stringify({ model: $("warmupModel").value.trim() || undefined, prompt: $("warmupPrompt").value }) }));
    $("loadJobs").onclick = async () => { const jobs = await api("/admin/api/jobs"); $("jobs").textContent = JSON.stringify(jobs, null, 2); };
    $("clearJobs").onclick = async () => { const result = await api("/admin/api/jobs/clear", { method: "POST" }); show(result); $("loadJobs").click(); };

    if (key()) refresh();
  </script>
</body>
</html>`;
}

export async function handleAdminRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  ctx: AdminContext,
): Promise<boolean> {
  const method = req.method ?? "GET";

  if (method === "GET" && pathname === "/admin") {
    writeText(res, 200, "text/html; charset=utf-8", adminPage(), ctx.corsHeaders);
    return true;
  }

  if (!pathname.startsWith("/admin/api")) return false;

  if (!requireAdmin(req, res, ctx)) return true;

  try {
    if (method === "GET" && pathname === "/admin/api/status") {
      return json(res, 200, await statusPayload(ctx), ctx.corsHeaders), true;
    }

    if (method === "GET" && pathname === "/admin/api/jobs") {
      return json(res, 200, { jobs: jobList(ctx), counts: jobCounts(ctx) }, ctx.corsHeaders), true;
    }

    if (method === "POST" && pathname === "/admin/api/jobs/clear") {
      let cleared = 0;
      for (const [id, job] of ctx.jobs.entries()) {
        if (job.status !== "pending") {
          ctx.jobs.delete(id);
          cleared++;
        }
      }
      return json(res, 200, { ok: true, cleared, remaining: ctx.jobs.size }, ctx.corsHeaders), true;
    }

    if (method === "POST" && pathname === "/admin/api/traffic") {
      const body = await readJson(req);
      if (typeof body.enabled !== "boolean") {
        return json(res, 400, { error: "enabled boolean is required" }, ctx.corsHeaders), true;
      }
      ctx.state.publicInferenceEnabled = body.enabled;
      return json(res, 200, {
        ok: true,
        public_inference_enabled: ctx.state.publicInferenceEnabled,
      }, ctx.corsHeaders), true;
    }

    if (method === "POST" && pathname === "/admin/api/models/pull") {
      const body = await readJson(req);
      const model = typeof body.model === "string" ? body.model.trim() : "";
      if (!model) return json(res, 400, { error: "model is required" }, ctx.corsHeaders), true;
      const result = await ollamaJson(ctx, "/api/pull", {
        method: "POST",
        body: JSON.stringify({ name: model, stream: false }),
      });
      return json(res, 200, { ok: true, model, result }, ctx.corsHeaders), true;
    }

    if (method === "POST" && pathname === "/admin/api/models/delete") {
      const body = await readJson(req);
      const model = typeof body.model === "string" ? body.model.trim() : "";
      if (!model) return json(res, 400, { error: "model is required" }, ctx.corsHeaders), true;
      const result = await ollamaJson(ctx, "/api/delete", {
        method: "DELETE",
        body: JSON.stringify({ name: model }),
      });
      return json(res, 200, { ok: true, model, result }, ctx.corsHeaders), true;
    }

    if (method === "POST" && pathname === "/admin/api/warmup") {
      const body = await readJson(req);
      const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
      const prompt = typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "Say ready in one short sentence.";
      const result = await ctx.warmup(model, prompt);
      return json(res, 200, { ok: true, result }, ctx.corsHeaders), true;
    }
  } catch (e) {
    return json(res, 500, { error: (e as Error).message }, ctx.corsHeaders), true;
  }

  json(res, 404, { error: "admin route not found" }, ctx.corsHeaders);
  return true;
}
