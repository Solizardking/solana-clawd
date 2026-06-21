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
  const input = $("#apiBase");
  if (!input) return;
  input.value = currentApiBase();
  input.addEventListener("change", () => {
    localStorage.setItem("modelKitApiBase", input.value.trim());
    updateEndpointLabels();
    loadStatus();
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

function renderStatus(status) {
  const datasets = status.datasets || fallbackStatus.datasets;
  const models = status.models || fallbackStatus.models;
  const jobs = status.jobs || fallbackStatus.jobs;
  const fields = {
    protocol: status.protocol || "CAAP/1.0",
    datasetCount: datasets.length,
    modelCount: models.length,
    jobCount: jobs.length,
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
initRegister();
loadStatus();
