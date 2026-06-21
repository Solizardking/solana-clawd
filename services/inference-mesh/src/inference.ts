/**
 * Ollama inference runner.
 * Handles model routing (core vs trading), streaming, and pull-on-demand.
 */
import { hashBytes } from "./zk_prover.js";

const OLLAMA_HOST   = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const CORE_MODEL    = process.env.DEFAULT_INFERENCE_MODEL ?? "8bit/solana-clawd-core-ai";
const TRADING_MODEL = process.env.TRADING_INFERENCE_MODEL ?? "8bit/solana-trading-factory";

export interface InferenceRequest {
  requestId:    string;
  prompt:       string;
  system?:      string;
  model?:       string;
  maxTokens?:   number;
  temperature?: number;
  trading?:     boolean;
}

export interface InferenceResult {
  output:      string;
  model:       string;
  model_cid:   string;   // SHA-256 of model name — stable identifier for on-chain use
  prompt_tokens:    number;
  completion_tokens: number;
  elapsed_ms:  number;
}

export async function runInference(req: InferenceRequest): Promise<InferenceResult> {
  const model = req.model ?? (req.trading ? TRADING_MODEL : CORE_MODEL);
  const t0 = Date.now();

  const messages: Array<{ role: string; content: string }> = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.prompt });

  const body = {
    model,
    messages,
    stream: false,
    options: {
      num_predict: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.7,
    },
  };

  let res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  // If model not found, pull it and retry once
  if (res.status === 404) {
    console.log(`[inference] model ${model} not found — pulling...`);
    await pullModel(model);
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json() as {
    message: { content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  const output          = data.message.content;
  const prompt_tokens   = data.prompt_eval_count ?? 0;
  const completion_tokens = data.eval_count ?? 0;
  const model_cid       = hashBytes(model).toString("hex").slice(0, 16);

  return {
    output,
    model,
    model_cid,
    prompt_tokens,
    completion_tokens,
    elapsed_ms: Date.now() - t0,
  };
}

async function pullModel(model: string): Promise<void> {
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: false }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`Failed to pull ${model}: HTTP ${res.status}`);
}

export async function listAvailableModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await res.json() as { models: Array<{ name: string }> };
    return data.models.map(m => m.name);
  } catch {
    return [];
  }
}

export async function isOllamaReady(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`,
      { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
