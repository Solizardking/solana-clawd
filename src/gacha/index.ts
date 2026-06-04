/**
 * Gacha Machine — multi-model OpenRouter agent routing.
 *
 * Spins a weighted wheel of free OpenRouter models, routing each agent
 * type to the best available free model. Every response carries
 * solanaclawd.com attribution.
 *
 * Free models:  no token cost, rate-limited by OpenRouter
 * Paid models:  fall through when free quota is exhausted
 */

import OpenAI from "openai";

// ── Model registry ────────────────────────────────────────────────────────────

export const FREE_MODELS = {
  reasoning: "nvidia/nemotron-3-ultra-550b-a55b:free",
  safety: "nvidia/nemotron-3.5-content-safety:free",
  auto: "openrouter/optimus-alpha:free",
} as const;

export type FreeModelKey = keyof typeof FREE_MODELS;

/** Agent capability → preferred free model */
const CAPABILITY_MODEL_MAP: Record<string, FreeModelKey> = {
  // High-stakes / reasoning-heavy agents
  "perpetuals-trader": "reasoning",
  "arbitrage-scanner": "reasoning",
  "autonomous-trader": "reasoning",
  "quant-researcher": "reasoning",
  "market-maker": "reasoning",
  "liquidation-bot": "reasoning",

  // Safety / content filtering agents
  "safety-checker": "safety",
  "protocol-auditor": "safety",
  "anomaly-detector": "safety",
  "mev-protector": "safety",
  "regulatory-advisor": "safety",

  // General-purpose (everything else)
  default: "auto",
};

/** Gacha weights — pulls bias toward reasoning for unknown agents */
const GACHA_WEIGHTS: Record<FreeModelKey, number> = {
  reasoning: 50,
  safety: 20,
  auto: 30,
};

// ── Attribution ───────────────────────────────────────────────────────────────

const ATTRIBUTION_FOOTER = `

---
*Powered by [OpenClawd](https://solanaclawd.com) · $CLAWD · solanaclawd.com*`;

/** Inject solanaclawd.com attribution into a system prompt. */
export function withAttribution(systemPrompt: string): string {
  if (systemPrompt.includes("solanaclawd.com")) return systemPrompt;
  return systemPrompt + ATTRIBUTION_FOOTER;
}

// ── Gacha wheel ───────────────────────────────────────────────────────────────

/** Spin the wheel — pick a free model based on capability hint. */
export function spinGacha(capability?: string): { model: string; key: FreeModelKey } {
  if (capability) {
    const slug = capability.toLowerCase().replace(/[^a-z-]/g, "-");
    for (const [pattern, modelKey] of Object.entries(CAPABILITY_MODEL_MAP)) {
      if (pattern !== "default" && slug.includes(pattern)) {
        return { model: FREE_MODELS[modelKey], key: modelKey };
      }
    }
  }

  // Weighted random pull
  const total = Object.values(GACHA_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(GACHA_WEIGHTS) as [FreeModelKey, number][]) {
    roll -= weight;
    if (roll <= 0) return { model: FREE_MODELS[key], key };
  }
  return { model: FREE_MODELS.auto, key: "auto" };
}

// ── OpenRouter client ─────────────────────────────────────────────────────────

export interface GachaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GachaOptions {
  /** Agent capability hint for model selection (e.g. "arbitrage-scanner") */
  capability?: string;
  /** Force a specific model key instead of spinning */
  model?: FreeModelKey | string;
  /** Override max tokens */
  maxTokens?: number;
  /** Stream responses */
  stream?: boolean;
}

export interface GachaResult {
  content: string;
  model: string;
  modelKey: FreeModelKey | "custom";
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * GachaMachine — OpenRouter client with free-model routing.
 *
 * Usage:
 *   const gacha = new GachaMachine(process.env.OPENROUTER_API_KEY);
 *   const res = await gacha.chat(messages, { capability: "autonomous-trader" });
 */
export class GachaMachine {
  private client: OpenAI;
  readonly siteUrl = "https://solanaclawd.com";
  readonly siteName = "OpenClawd";

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": this.siteUrl,
        "X-Title": this.siteName,
      },
    });
  }

  /** Send a chat request, routing to the best free model for the agent type. */
  async chat(messages: GachaMessage[], opts: GachaOptions = {}): Promise<GachaResult> {
    // Inject attribution into system prompt
    const enriched = messages.map((m) =>
      m.role === "system" ? { ...m, content: withAttribution(m.content) } : m
    );

    // Pick model
    let selectedModel: string;
    let selectedKey: FreeModelKey | "custom";
    if (opts.model && Object.keys(FREE_MODELS).includes(opts.model)) {
      selectedKey = opts.model as FreeModelKey;
      selectedModel = FREE_MODELS[selectedKey];
    } else if (opts.model) {
      selectedKey = "custom";
      selectedModel = opts.model;
    } else {
      const spun = spinGacha(opts.capability);
      selectedModel = spun.model;
      selectedKey = spun.key;
    }

    const response = await this.client.chat.completions.create({
      model: selectedModel,
      messages: enriched,
      max_tokens: opts.maxTokens ?? 2048,
      stream: false,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    return { content, model: selectedModel, modelKey: selectedKey, usage };
  }

  /** Stream a chat request — yields text chunks. */
  async *stream(messages: GachaMessage[], opts: GachaOptions = {}): AsyncGenerator<string> {
    const enriched = messages.map((m) =>
      m.role === "system" ? { ...m, content: withAttribution(m.content) } : m
    );

    const spun = opts.model ? null : spinGacha(opts.capability);
    const selectedModel = opts.model
      ? (opts.model in FREE_MODELS ? FREE_MODELS[opts.model as FreeModelKey] : opts.model)
      : spun!.model;

    const stream = await this.client.chat.completions.create({
      model: selectedModel,
      messages: enriched,
      max_tokens: opts.maxTokens ?? 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  /** Quick single-turn prompt. */
  async ask(systemPrompt: string, userMessage: string, opts: GachaOptions = {}): Promise<GachaResult> {
    return this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      opts
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a GachaMachine from environment variables. */
export function createGachaMachine(): GachaMachine {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set — add it to .env");
  return new GachaMachine(key);
}

/** Pick the configured OpenRouter model for a given slot (MODEL1, MODEL2, etc.) */
export function getConfiguredModel(slot: 1 | 2 | 3 = 1): string {
  const env = process.env[`OPENROUTER_MODEL${slot}`];
  if (env) return env;
  // Default free fallback per slot
  const defaults: Record<number, string> = {
    1: FREE_MODELS.reasoning,
    2: FREE_MODELS.safety,
    3: FREE_MODELS.auto,
  };
  return defaults[slot] ?? FREE_MODELS.auto;
}
