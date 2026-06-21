const runtimeConfig = {
  apiBaseUrl: "https://x402-model-kit-api.onrender.com",
  x402Home: "https://x402.wtf",
  modelsHome: "https://models.x402.wtf",
  registerHome: "https://register.x402.wtf",
  onchainHome: "https://onchain.x402.wtf",
  githubRepo: "https://github.com/solizardking/solana-clawd-ai-training",
  ...(window.MODEL_KIT_CONFIG || {}),
};

const lanes = {
  custom: {
    datasetRepo: "solanaclawd/solana-clawd-realtime-research-instruct",
    modelRepo: "solanaclawd/solana-clawd-custom-lora",
    baseModel: "Qwen/Qwen2.5-1.5B-Instruct",
  },
  "core-ai": {
    datasetRepo: "solanaclawd/solana-clawd-core-ai-instruct",
    modelRepo: "solanaclawd/solana-clawd-core-ai-1.5b-lora",
    baseModel: "Qwen/Qwen2.5-1.5B-Instruct",
  },
  "trading-factory": {
    datasetRepo: "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
    modelRepo: "solanaclawd/solana-nvidia-trading-factory-8b-lora",
    baseModel: "NousResearch/Hermes-3-Llama-3.1-8B",
  },
  perps: {
    datasetRepo: "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
    modelRepo: "solanaclawd/solana-clawd-perps-tools-lora",
    baseModel: "NousResearch/Hermes-3-Llama-3.1-8B",
  },
  "tx-foundation": {
    datasetRepo: "solanaclawd/solana-tx-foundation-cpt",
    modelRepo: "solanaclawd/solana-tx-foundation-1.5b",
    baseModel: "Qwen/Qwen2.5-1.5B-Instruct",
  },
};

const fallbackStatus = {
  protocol: "CAAP/1.0",
  constitution: {
    ok: true,
    id: "clawd-six-law-harness",
    three_laws_hash: "sha256:fa1c36ab5605df2880bedc495ddd4a3096c89ab8a749acf043ea53b2ab31c2bc",
    files: [
      { id: "constitution", path: "CONSTITUTION.md", sha256: "sha256:321a2e6ccb812464291ba3059a5f76633fc2194e4bb18a97f4b8b9f8289d9020" },
      { id: "three_laws", path: "three-laws.md", sha256: "sha256:fa1c36ab5605df2880bedc495ddd4a3096c89ab8a749acf043ea53b2ab31c2bc" },
      { id: "clawd_context", path: "CLAWD.md", sha256: "sha256:1d412ae61552a791b5392a94a7675ff258af61e568f427507c67f363bf6f820c" },
    ],
  },
  datasets: [
    { repo_id: "solanaclawd/solana-clawd-core-ai-instruct", rows: 35173, status: "published", lane: "core-ai", url: "https://huggingface.co/datasets/solanaclawd/solana-clawd-core-ai-instruct" },
    { repo_id: "solanaclawd/solana-clawd-realtime-research-instruct", rows: 29058, status: "published", lane: "custom", url: "https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct" },
    { repo_id: "solanaclawd/solana-clawd-nvidia-trading-factory-instruct", rows: 142, status: "published", lane: "trading-factory", url: "https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct" },
    { repo_id: "solanaclawd/solana-tx-foundation-cpt", rows: 19542, status: "published", lane: "tx-foundation", url: "https://huggingface.co/datasets/solanaclawd/solana-tx-foundation-cpt" },
  ],
  models: [
    { repo_id: "solanaclawd/solana-nvidia-trading-factory-8b-lora", base_model: "NousResearch/Hermes-3-Llama-3.1-8B", status: "complete", lane: "trading-factory", url: "https://huggingface.co/solanaclawd/solana-nvidia-trading-factory-8b-lora" },
    { repo_id: "solanaclawd/solana-clawd-core-ai-1.5b-lora", base_model: "Qwen/Qwen2.5-1.5B-Instruct", status: "recovery-running", lane: "core-ai", url: "https://huggingface.co/solanaclawd/solana-clawd-core-ai-1.5b-lora" },
    { repo_id: "solanaclawd/solana-tx-foundation-1.5b", base_model: "Qwen/Qwen2.5-1.5B-Instruct", status: "ready-to-register", lane: "tx-foundation", url: "https://huggingface.co/solanaclawd/solana-tx-foundation-1.5b" },
  ],
  jobs: [
    { id: "ordlibrary/6a35a2ce953ed90bfb945009", name: "Trading factory 8B LoRA", status: "complete", lane: "trading-factory" },
    { id: "ordlibrary/6a35a6833093dba73ce2a86b", name: "Core AI 1.5B LoRA recovery", status: "running", lane: "core-ai" },
  ],
};

let arenaProviders = [
  {
    id: "openrouter",
    label: "OpenRouter",
    adapter: "openai-compatible",
    base_url: "https://openrouter.ai/api/v1",
    api_key_env: "OPENROUTER_API_KEY",
    examples: ["nvidia/llama-nemotron-rerank-vl-1b-v2:free", "openrouter/fusion", "moonshotai/kimi-k2.7-code", "anthropic/claude-opus-4.8-fast"],
    model_presets: [
      { env: "OPENROUTER_DEFAULT_FREE_MODEL", label: "Default free", model: "nvidia/llama-nemotron-rerank-vl-1b-v2:free" },
      { env: "OPENROUTER_FUSION", label: "Fusion", model: "openrouter/fusion" },
      { env: "OPENROUTER_KIMI_MODEL", label: "Kimi code", model: "moonshotai/kimi-k2.7-code" },
      { env: "OPENROUTER_CLAWD_DEFAULT_MODEL", label: "Clawd default", model: "anthropic/claude-opus-4.8-fast" },
    ],
  },
  { id: "openai", label: "OpenAI", adapter: "openai-compatible", base_url: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY", examples: ["gpt-4.1-mini"] },
  { id: "xai", label: "xAI", adapter: "openai-compatible", base_url: "https://api.x.ai/v1", api_key_env: "XAI_API_KEY", examples: ["grok-4"] },
  { id: "groq", label: "Groq", adapter: "openai-compatible", base_url: "https://api.groq.com/openai/v1", api_key_env: "GROQ_API_KEY", examples: ["llama-3.3-70b-versatile"] },
  { id: "anthropic", label: "Anthropic", adapter: "anthropic", base_url: "https://api.anthropic.com/v1", api_key_env: "ANTHROPIC_API_KEY", examples: ["claude-3-5-sonnet-latest"] },
  { id: "gemini", label: "Google Gemini", adapter: "gemini", base_url: "https://generativelanguage.googleapis.com/v1beta", api_key_env: "GEMINI_API_KEY", examples: ["gemini-1.5-flash"] },
  { id: "custom-openai", label: "Custom OpenAI-compatible", adapter: "openai-compatible", base_url: "", api_key_env: "", examples: ["provider/model-id"] },
  { id: "mock", label: "Local mock", adapter: "mock", base_url: "", api_key_env: "", examples: ["mock-fast"] },
];

let arenaEventSource;
let activeArenaRun;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function defaultApiBase() {
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://127.0.0.1:8787";
  }
  return runtimeConfig.apiBaseUrl || "";
}

function currentApiBase() {
  return (localStorage.getItem("modelKitApiBase") || defaultApiBase()).replace(/\/$/, "");
}

function apiUrl(path) {
  const base = currentApiBase();
  if (!base) return path;
  return `${base}${path}`;
}

function wireApiBaseInput() {
  const inputs = $$("[data-api-base], #apiBase");
  if (!inputs.length) return;
  inputs.forEach((input) => {
    input.value = currentApiBase();
    input.addEventListener("change", () => {
      localStorage.setItem("modelKitApiBase", input.value.trim());
      inputs.forEach((peer) => {
        if (peer !== input) peer.value = input.value.trim();
      });
      updateEndpointLabels();
      loadStatus();
      loadArenaProviders();
    });
  });
}

function updateEndpointLabels() {
  const base = currentApiBase();
  const endpoints = {
    healthEndpoint: "/api/health",
    previewEndpoint: "/api/register/preview",
    registerEndpoint: "/api/register",
  };
  Object.entries(endpoints).forEach(([id, path]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = `${base}${path}`;
  });
}

function applyConfigLinks() {
  $$("[data-config-link]").forEach((link) => {
    const key = link.dataset.configLink;
    if (runtimeConfig[key]) link.href = runtimeConfig[key];
  });
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function jsonBlock(value) {
  return JSON.stringify(value, null, 2);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "readonly");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload.detail || payload.raw || response.statusText);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function inputArgs() {
  const inputs = $("#inputs");
  if (!inputs) return "";
  return inputs.value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(shellQuote)
    .join(" ");
}

function buildCommand() {
  const lane = $("#lane");
  const output = $("#commandOutput");
  if (!lane || !output) return;

  const parts = [
    "ai-training/model-kit/bin/clawd-model-kit",
    "one-shot",
    inputArgs(),
    "--lane",
    lane.value,
    "--dataset-repo",
    shellQuote($("#datasetRepo").value.trim()),
    "--hub-model-id",
    shellQuote($("#modelRepo").value.trim()),
    "--output-prefix",
    shellQuote($("#outputPrefix").value.trim()),
    "--endpoint",
    shellQuote($("#endpoint").value.trim()),
  ].filter(Boolean);

  if ($("#pushDataset").checked) parts.push("--push-dataset");
  if ($("#train").checked) parts.push("--train");
  if ($("#remoteTrain").checked) parts.push("--remote-train");
  if ($("#pushModel").checked) parts.push("--push-model");
  if ($("#register").checked) parts.push("--register");
  if ($("#liveRegister").checked) parts.push("--live-register");
  if ($("#trainDryRun").checked) parts.push("--train-dry-run");
  if ($("#yes").checked) parts.push("--yes");

  const modelRepo = $("#modelRepo").value.trim();
  const manifest = `${$("#outputPrefix").value.trim()}_manifest.json`;
  const lines = [
    "cd /Users/8bit/Downloads/solana-clawd",
    parts.join(" \\\n  "),
    "",
    "# Verify local artifacts",
    "ai-training/model-kit/bin/clawd-model-kit constitution --strict",
    "ai-training/model-kit/bin/clawd-model-kit doctor --strict",
    `ai-training/model-kit/bin/clawd-model-kit verify --path ${shellQuote(manifest)}`,
    "",
    "# Dry-run the CAAP payload",
    `ai-training/model-kit/bin/clawd-model-kit register --hf-model ${shellQuote(modelRepo)} --manifest ${shellQuote(manifest)}`,
    "",
    "# Open the registration page",
    runtimeConfig.registerHome,
  ];
  output.textContent = lines.join("\n");
}

function initBuilder() {
  const lane = $("#lane");
  if (!lane) return;

  lane.addEventListener("change", () => {
    const next = lanes[lane.value];
    $("#datasetRepo").value = next.datasetRepo;
    $("#modelRepo").value = next.modelRepo;
    buildCommand();
  });

  [
    "#inputs",
    "#datasetRepo",
    "#modelRepo",
    "#outputPrefix",
    "#endpoint",
    "#pushDataset",
    "#train",
    "#remoteTrain",
    "#pushModel",
    "#register",
    "#liveRegister",
    "#trainDryRun",
    "#yes",
  ].forEach((selector) => {
    const node = $(selector);
    if (node) node.addEventListener("input", buildCommand);
  });

  $("#generate")?.addEventListener("click", buildCommand);
  $("#copy")?.addEventListener("click", () => copyText($("#commandOutput").textContent));
  buildCommand();
}

function resourceItem(item, type) {
  const href = item.url || "#";
  const meta = type === "dataset" ? `${Number(item.rows || 0).toLocaleString()} rows` : item.base_model || item.id || "";
  return `
    <a class="resource-item" href="${href}" target="_blank" rel="noreferrer">
      <span>
        <strong>${item.repo_id || item.name || item.id}</strong>
        <small>${item.lane || type} - ${meta}</small>
      </span>
      <em>${item.status || "ready"}</em>
    </a>
  `;
}

function shortHash(value) {
  const raw = String(value || "").replace(/^sha256:/, "");
  return raw ? `${raw.slice(0, 8)}...${raw.slice(-6)}` : "-";
}

function renderStatus(status) {
  const datasets = status.datasets || fallbackStatus.datasets;
  const models = status.models || fallbackStatus.models;
  const jobs = status.jobs || fallbackStatus.jobs;
  const constitution = status.constitution || fallbackStatus.constitution;
  const fields = {
    protocol: status.protocol || "CAAP/1.0",
    datasetCount: datasets.length,
    modelCount: models.length,
    jobCount: jobs.length,
    constitutionGate: constitution.ok ? "OK" : "check",
    threeLawsHash: shortHash(constitution.three_laws_hash),
  };

  Object.entries(fields).forEach(([key, value]) => {
    const node = $(`[data-status-field="${key}"]`);
    if (node) node.textContent = String(value);
  });

  const datasetList = $("#datasetList");
  if (datasetList) datasetList.innerHTML = datasets.map((item) => resourceItem(item, "dataset")).join("");

  const modelList = $("#modelList");
  if (modelList) modelList.innerHTML = models.map((item) => resourceItem(item, "model")).join("");

  const jobList = $("#jobList");
  if (jobList) jobList.innerHTML = jobs.map((item) => resourceItem(item, "job")).join("");

  const constitutionList = $("#constitutionFiles");
  if (constitutionList) {
    const files = constitution.files || [];
    constitutionList.innerHTML = files.map((item) => {
      const label = item.id || item.path || "file";
      return `<code>${escapeHtml(label)} ${escapeHtml(shortHash(item.sha256))}</code>`;
    }).join("");
  }
}

async function loadStatus() {
  updateEndpointLabels();
  const statusNode = $("#apiStatus");
  try {
    const status = await requestJson("/api/model-kit/status");
    renderStatus(status);
    if (statusNode) statusNode.textContent = `Connected to ${currentApiBase()}.`;
  } catch (error) {
    renderStatus(fallbackStatus);
    if (statusNode) statusNode.textContent = `Using bundled metadata. ${error.message}`;
  }
}

function providerById(id) {
  return arenaProviders.find((provider) => provider.id === id) || arenaProviders[0];
}

function providerModels(provider) {
  if (Array.isArray(provider?.model_presets) && provider.model_presets.length) {
    return provider.model_presets.map((preset) => preset.model).filter(Boolean);
  }
  return (provider?.examples || []).filter(Boolean);
}

function populateArenaModelDatalist() {
  const datalist = $("#arenaModelPresets");
  if (!datalist) return;
  const seen = new Set();
  const options = [];
  arenaProviders.forEach((provider) => {
    const presets = Array.isArray(provider.model_presets) && provider.model_presets.length
      ? provider.model_presets
      : (provider.examples || []).map((model) => ({ label: provider.label, model, env: "" }));
    presets.forEach((preset) => {
      if (!preset.model || seen.has(preset.model)) return;
      seen.add(preset.model);
      const label = [provider.label, preset.env || preset.label].filter(Boolean).join(" - ");
      options.push(`<option value="${escapeHtml(preset.model)}" label="${escapeHtml(label)}"></option>`);
    });
  });
  datalist.innerHTML = options.join("");
}

function populateArenaProviders() {
  $$("[data-model-field='provider']").forEach((select) => {
    const current = select.value || select.dataset.defaultProvider || "openrouter";
    select.innerHTML = arenaProviders
      .map((provider) => `<option value="${provider.id}">${provider.label}</option>`)
      .join("");
    select.value = arenaProviders.some((provider) => provider.id === current) ? current : arenaProviders[0].id;
    applyProviderDefaults(select.closest(".arena-model-card"));
  });
  populateArenaModelDatalist();
}

async function loadArenaProviders() {
  if (!$("#arenaForm")) return;
  try {
    const payload = await requestJson("/api/arena/providers");
    if (Array.isArray(payload.providers) && payload.providers.length) {
      arenaProviders = payload.providers;
    }
  } catch {
    // Bundled providers keep the arena usable when the API is offline.
  }
  populateArenaProviders();
}

function modelField(card, field) {
  return $(`[data-model-field="${field}"]`, card);
}

function applyProviderDefaults(card) {
  if (!card) return;
  const provider = providerById(modelField(card, "provider")?.value);
  const base = modelField(card, "base_url");
  const env = modelField(card, "api_key_env");
  const model = modelField(card, "model");
  if (base && !base.value.trim()) base.placeholder = provider.base_url || "provider default";
  if (env && !env.value.trim()) env.placeholder = provider.api_key_env || "optional";
  const examples = providerModels(provider);
  if (model && !model.value.trim() && examples[0]) model.value = examples[0];
}

function setArenaMode() {
  const mode = $("#arenaMode")?.value || "chat";
  const codeFields = $("#arenaCodeFields");
  if (codeFields) codeFields.hidden = mode !== "code";
}

function arenaModelsFromForm() {
  return $$(".arena-model-card")
    .filter((card) => modelField(card, "enabled")?.checked)
    .map((card, index) => {
      const provider = providerById(modelField(card, "provider").value);
      const payload = {
        label: modelField(card, "label").value.trim() || `Model ${index + 1}`,
        provider: provider.id,
        model: modelField(card, "model").value.trim() || providerModels(provider)[0] || "model",
        temperature: 0.2,
        max_tokens: 1024,
      };
      const baseUrl = modelField(card, "base_url").value.trim();
      const apiKey = modelField(card, "api_key").value.trim();
      const apiKeyEnv = modelField(card, "api_key_env").value.trim();
      if (baseUrl) payload.base_url = baseUrl;
      if (apiKey) payload.api_key = apiKey;
      if (apiKeyEnv) payload.api_key_env = apiKeyEnv;
      return payload;
    });
}

function arenaPayload() {
  const mode = $("#arenaMode")?.value || "chat";
  return {
    mode,
    prompt: $("#arenaPrompt").value.trim(),
    system_prompt: $("#arenaSystemPrompt").value.trim(),
    models: arenaModelsFromForm(),
    stdin: mode === "code" ? $("#arenaStdin").value : "",
    expected_stdout: mode === "code" ? $("#arenaExpectedStdout").value : null,
    share_base_url: `${window.location.origin}${window.location.pathname}`,
  };
}

function setArenaStatus(run) {
  const summary = run?.summary || {};
  const values = {
    status: run?.status || "idle",
    winner: summary.winner || summary.fastest || "-",
    completed: summary.models_completed || (run?.results || []).filter((item) => item.ok).length || 0,
    codePasses: summary.code_passes || 0,
    tokens: summary.total_tokens || (run?.results || []).reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
  };
  Object.entries(values).forEach(([key, value]) => {
    const node = $(`[data-arena-field="${key}"]`);
    if (node) node.textContent = String(value);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resultBadge(result) {
  if (!result.ok) return `<em class="badge bad">failed</em>`;
  const execution = result.execution;
  if (execution) return `<em class="badge ${execution.passed ? "good" : "bad"}">${execution.passed ? "passed" : "failed"}</em>`;
  return `<em class="badge good">complete</em>`;
}

function renderArenaResult(result) {
  const execution = result.execution;
  const output = result.ok ? result.content : result.error;
  const codeBlock = result.code ? `<details><summary>Code</summary><pre>${escapeHtml(result.code)}</pre></details>` : "";
  const execBlock = execution
    ? `<div class="arena-exec">
        <span>return ${execution.return_code ?? "-"}</span>
        <span>${Number(execution.latency_ms || 0).toLocaleString()} ms exec</span>
        <details>
          <summary>stdout/stderr</summary>
          <pre>${escapeHtml((execution.stdout || "").trim() || "(no stdout)")}</pre>
          <pre>${escapeHtml((execution.stderr || "").trim() || "(no stderr)")}</pre>
        </details>
      </div>`
    : "";
  return `
    <article class="arena-result-card">
      <header>
        <span>
          <strong>${escapeHtml(result.label)}</strong>
          <small>${escapeHtml(result.provider)} / ${escapeHtml(result.model)}</small>
        </span>
        ${resultBadge(result)}
      </header>
      <div class="arena-result-metrics">
        <span>${Number(result.latency_ms || 0).toLocaleString()} ms</span>
        <span>${Number(result.total_tokens || 0).toLocaleString()} tokens</span>
        <span>${Number(result.chars_per_second || 0).toLocaleString()} cps</span>
      </div>
      <pre>${escapeHtml(output || "")}</pre>
      ${codeBlock}
      ${execBlock}
    </article>
  `;
}

function renderArenaRun(run) {
  activeArenaRun = run;
  setArenaStatus(run);
  const list = $("#arenaResultList");
  if (list) {
    const results = run?.results || [];
    list.innerHTML = results.length
      ? results.map(renderArenaResult).join("")
      : `<article class="arena-empty"><strong>${escapeHtml(run?.status || "queued")}</strong><span>Waiting for model results.</span></article>`;
  }
  if (run?.status === "completed") {
    saveArenaRecent(run);
    loadArenaShare(run.id);
  }
}

function appendArenaEvent(event) {
  const log = $("#arenaEvents");
  if (!log) return;
  const line = `[${event.time || new Date().toISOString()}] ${event.type || "event"}: ${event.message || ""}`;
  log.textContent = log.textContent === "Waiting for a run..." ? line : `${log.textContent}\n${line}`;
  log.scrollTop = log.scrollHeight;
}

async function refreshArenaRun(runId) {
  const payload = await requestJson(`/api/arena/runs/${encodeURIComponent(runId)}`);
  renderArenaRun(payload.run);
  return payload.run;
}

function subscribeArenaRun(runId) {
  if (arenaEventSource) arenaEventSource.close();
  const source = new EventSource(apiUrl(`/api/arena/runs/${encodeURIComponent(runId)}/events`));
  arenaEventSource = source;
  const eventTypes = ["queued", "run_started", "model_started", "model_completed", "model_failed", "run_completed", "log_failed", "error"];
  eventTypes.forEach((type) => {
    source.addEventListener(type, (message) => {
      const event = JSON.parse(message.data);
      appendArenaEvent(event);
      if (["model_completed", "model_failed", "run_completed"].includes(type)) {
        refreshArenaRun(runId).catch((error) => appendArenaEvent({ type: "refresh_failed", message: error.message }));
      }
      if (type === "run_completed") source.close();
    });
  });
  source.onerror = () => {
    appendArenaEvent({ type: "stream_closed", message: "Arena event stream closed." });
    source.close();
  };
}

async function runArena(event) {
  event.preventDefault();
  const payload = arenaPayload();
  if (!payload.prompt) throw new Error("Prompt is required.");
  if (payload.models.length < 1) throw new Error("Enable at least one model.");
  $("#arenaEvents").textContent = "Submitting arena run...";
  $("#shareArenaX")?.classList.add("disabled-link");
  const response = await requestJson("/api/arena/runs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  renderArenaRun(response.run);
  subscribeArenaRun(response.run.id);
}

async function loadArenaShare(runId) {
  const link = $("#shareArenaX");
  if (!link) return;
  try {
    const payload = await requestJson(`/api/arena/runs/${encodeURIComponent(runId)}/share`);
    link.href = payload.x_intent_url;
    link.classList.remove("disabled-link");
    link.setAttribute("aria-disabled", "false");
  } catch {
    link.href = "https://twitter.com/intent/tweet";
  }
}

function arenaRecent() {
  try {
    return JSON.parse(localStorage.getItem("modelArenaRecentRuns") || "[]");
  } catch {
    return [];
  }
}

function saveArenaRecent(run) {
  mergeArenaRecentRuns([run]);
}

function recentFromRun(run) {
  return {
    id: run.id,
    status: run.status,
    mode: run.request?.mode,
    created_at: run.created_at,
    winner: run.summary?.winner || run.summary?.fastest || "-",
    completed: run.summary?.models_completed || 0,
  };
}

function mergeArenaRecentRuns(runs) {
  const recent = arenaRecent();
  runs.forEach((run) => {
    const item = recentFromRun(run);
    const index = recent.findIndex((existing) => existing.id === item.id);
    if (index >= 0) recent.splice(index, 1);
    recent.unshift(item);
  });
  localStorage.setItem("modelArenaRecentRuns", JSON.stringify(recent.slice(0, 8)));
  renderArenaRecent();
}

async function loadArenaRecentFromApi() {
  if (!$("#arenaRecentRuns")) return;
  try {
    const payload = await requestJson("/api/arena/runs");
    if (Array.isArray(payload.runs) && payload.runs.length) {
      mergeArenaRecentRuns(payload.runs.slice(0, 8));
    }
  } catch {
    renderArenaRecent();
  }
}

function renderArenaRecent() {
  const list = $("#arenaRecentRuns");
  if (!list) return;
  const recent = arenaRecent();
  list.innerHTML = recent.length
    ? recent
        .map(
          (run) => `
            <button class="resource-item recent-run" type="button" data-run-id="${escapeHtml(run.id)}">
              <span>
                <strong>${escapeHtml(run.winner || "-")}</strong>
                <small>${escapeHtml(run.mode || "chat")} - ${escapeHtml(run.id)}</small>
              </span>
              <em>${Number(run.completed || 0)} done</em>
            </button>
          `,
        )
        .join("")
    : `<article class="arena-empty"><strong>No recent runs</strong><span>Completed arena runs appear here.</span></article>`;
  $$(".recent-run", list).forEach((button) => {
    button.addEventListener("click", () => refreshArenaRun(button.dataset.runId).catch((error) => appendArenaEvent({ type: "load_failed", message: error.message })));
  });
}

function copyArenaJson() {
  const payload = activeArenaRun || arenaPayload();
  copyText(jsonBlock(payload));
}

function initArena() {
  const form = $("#arenaForm");
  if (!form) return;
  populateArenaProviders();
  loadArenaProviders();
  setArenaMode();
  $("#arenaMode")?.addEventListener("change", setArenaMode);
  $$(".arena-model-card").forEach((card) => {
    modelField(card, "provider")?.addEventListener("change", () => applyProviderDefaults(card));
  });
  form.addEventListener("submit", (event) => {
    runArena(event).catch((error) => appendArenaEvent({ type: "run_failed", message: error.payload?.detail || error.message }));
  });
  $("#copyArenaJson")?.addEventListener("click", copyArenaJson);
  renderArenaRecent();
  loadArenaRecentFromApi();
  setArenaStatus(null);
  const sharedRunId = new URLSearchParams(window.location.search).get("arenaRun");
  if (sharedRunId) {
    refreshArenaRun(sharedRunId)
      .then((run) => {
        if (!["completed", "failed"].includes(run.status)) subscribeArenaRun(run.id);
      })
      .catch((error) => appendArenaEvent({ type: "shared_run_missing", message: error.message }));
  }
}

function registrationPayload(live = false) {
  const hash = $("#modelHash").value.trim();
  const wandb = $("#wandbRun").value.trim();
  const payload = {
    hf_model_id: $("#hfModelId").value.trim(),
    model_type: $("#modelType").value,
    api_endpoint: $("#apiEndpoint").value.trim(),
    dataset_size: Number($("#datasetSize").value || 0),
    eval_accuracy: Number($("#evalAccuracy").value || 0),
    cluster: $("#cluster").value,
    live,
    allow_generated_hash: $("#allowGeneratedHash").checked,
    metadata: {
      models_home: runtimeConfig.modelsHome,
      register_home: runtimeConfig.registerHome,
      github_repo: runtimeConfig.githubRepo,
    },
  };
  if (hash) payload.model_hash = hash;
  if (wandb) payload.wandb_run = wandb;
  return payload;
}

function renderRegistrationOutput(title, payload) {
  const output = $("#registrationOutput");
  if (!output) return;
  output.textContent = `${title}\n\n${jsonBlock(payload)}`;
}

function registrationHeaders() {
  const token = $("#requestToken").value.trim();
  if (!token) return {};
  return { Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}` };
}

async function previewRegistration() {
  const result = await requestJson("/api/register/preview", {
    method: "POST",
    body: JSON.stringify(registrationPayload(false)),
  });
  window.lastRegistrationPayload = result.payload;
  renderRegistrationOutput("Dry-run payload", result);
}

async function submitRegistration(event) {
  event.preventDefault();
  const live = $("#live").checked;
  const result = await requestJson("/api/register", {
    method: "POST",
    headers: registrationHeaders(),
    body: JSON.stringify(registrationPayload(live)),
  });
  window.lastRegistrationPayload = result.payload;
  renderRegistrationOutput(live ? "Live registration response" : "Dry-run registration response", result);
}

function copyRegistrationCurl() {
  const payload = window.lastRegistrationPayload || registrationPayload(false);
  const curl = [
    "curl -X POST https://onchain.x402.wtf/api/register \\",
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: Bearer $HF_TOKEN" \\',
    `  -d ${shellQuote(JSON.stringify(payload, null, 2))}`,
  ].join("\n");
  copyText(curl);
  renderRegistrationOutput("Copied curl command", { command: curl, payload });
}

function initRegister() {
  const form = $("#registerForm");
  if (!form) return;
  $("#previewRegistration")?.addEventListener("click", () => {
    previewRegistration().catch((error) => renderRegistrationOutput("Preview failed", error.payload || { error: error.message }));
  });
  form.addEventListener("submit", (event) => {
    submitRegistration(event).catch((error) => renderRegistrationOutput("Registration failed", error.payload || { error: error.message }));
  });
  $("#copyRegistrationCurl")?.addEventListener("click", copyRegistrationCurl);
  renderRegistrationOutput("Payload preview", registrationPayload(false));
}

applyConfigLinks();
wireApiBaseInput();
initBuilder();
initArena();
initRegister();
loadStatus();
