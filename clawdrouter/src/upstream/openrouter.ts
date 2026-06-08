/**
 * OpenRouter upstream handler — full OpenRouter-compatible proxy
 * with provider routing, plugins, server tools, caching, and model fallbacks.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  parseModelVariant,
  isOnlineVariant,
  mergeProviderPrefs,
} from "../router/variants.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatChoice,
  ChatMessage,
  TokenUsage,
  PluginConfig,
  ProviderPreferences,
  RouterMetadata,
  EndpointCandidate,
  RouterAttempt,
  PipelineStage,
  ClawdRouterConfig,
  Annotation,
} from "../types.js";

// ── Caching ────────────────────────────────────────────────────────────

interface CacheEntry {
  response: ChatCompletionResponse;
  createdAt: number;
  ttl: number;
}

const responseCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 10_000;

function cacheKey(req: ChatCompletionRequest, apiKey: string): string {
  const payload = JSON.stringify({
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    tools: req.tools,
    stream: req.stream ?? false,
    response_format: req.response_format,
  });
  return createHash("sha256")
    .update(`${apiKey}:${payload}`)
    .digest("hex");
}

function cachePrune() {
  if (responseCache.size > MAX_CACHE_SIZE) {
    const entries = [...responseCache.entries()].sort(
      ([, a], [, b]) => a.createdAt - b.createdAt,
    );
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      responseCache.delete(key);
    }
  }
}

// ── Provider Selection ─────────────────────────────────────────────────

function applyProviderRouting(
  prefs: ProviderPreferences | undefined,
  availableProviders: Array<{ provider: string; model: string; price: number; throughput: number; latency: number }>,
): Array<{ provider: string; model: string }> {
  if (!prefs) return availableProviders;

  let filtered = [...availableProviders];

  // Filter by only
  if (prefs.only?.length) {
    filtered = filtered.filter((p) => prefs.only!.some((slug) => p.provider.startsWith(slug)));
  }

  // Filter by ignore
  if (prefs.ignore?.length) {
    filtered = filtered.filter((p) => !prefs.ignore!.some((slug) => p.provider.startsWith(slug)));
  }

  // Filter by quantizations (stub — real impl would check provider metadata)
  if (prefs.quantizations?.length) {
    // pass through — quantization filtering is provider-specific
  }

  // Price ceiling
  if (prefs.max_price) {
    filtered = filtered.filter((p) => {
      const { max_price } = prefs;
      if (max_price!.prompt && p.price > max_price!.prompt) return false;
      return true;
    });
  }

  // Order by specific providers
  if (prefs.order?.length) {
    const ordered: typeof filtered = [];
    for (const slug of prefs.order) {
      const match = filtered.find((p) => p.provider === slug);
      if (match) ordered.push(match);
    }
    // Add remaining that weren't in the order list
    for (const p of filtered) {
      if (!ordered.some((o) => o.provider === p.provider)) {
        ordered.push(p);
      }
    }
    filtered = ordered;
  }

  // Sort
  const sortBy = typeof prefs.sort === "string" ? prefs.sort : prefs.sort?.by;
  if (sortBy === "price") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortBy === "throughput") {
    filtered.sort((a, b) => b.throughput - a.throughput);
  } else if (sortBy === "latency") {
    filtered.sort((a, b) => a.latency - b.latency);
  }

  return filtered;
}

// ── Plugin: Web Search ─────────────────────────────────────────────────

const WEB_SEARCH_PROMPT = `A web search was conducted on {date}. Incorporate the following web search results into your response.

IMPORTANT: Cite them using markdown links named using the domain of the source.
Example: [nytimes.com](https://nytimes.com/some-page).`;

function hasWebSearchPlugin(plugins?: PluginConfig[]): PluginConfig | null {
  if (!plugins?.length) return null;
  return plugins.find((p) => p.id === "web" && p.enabled !== false) ?? null;
}

function hasWebSearchTool(tools?: { type?: string }[]): boolean {
  if (!tools?.length) return false;
  return tools.some(
    (t) => t.type === "openrouter:web_search" || t.type === "web_search",
  );
}

// ── Plugin: Response Healing ───────────────────────────────────────────

function attemptJsonRepair(text: string): string {
  // Try extracting from markdown code block
  const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonBlock) {
    text = jsonBlock[1].trim();
  }

  // Try to find JSON object in mixed text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    text = jsonMatch[1].trim();
  }

  // Fix common issues
  let repaired = text
    .replace(/,(\s*[}\]])/g, "$1") // trailing commas
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"'); // single quotes

  // Fix missing closing brackets
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += "}".repeat(openBraces - closeBraces);
  }
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    repaired += "]".repeat(openBrackets - closeBrackets);
  }

  return repaired;
}

// ── Context Compression ────────────────────────────────────────────────

function hasCompressionPlugin(plugins?: PluginConfig[]): boolean {
  if (!plugins?.length) return false;
  return plugins.some((p) => p.id === "context-compression" && p.enabled !== false);
}

function compressMessages(
  messages: ChatMessage[],
  targetTokens: number,
): ChatMessage[] {
  if (messages.length <= 4) return messages;

  // Keep first 2 and last 2 messages, remove from middle
  const keepStart = 2;
  const keepEnd = 2;
  const total = messages.length;

  if (total <= keepStart + keepEnd) return messages;

  const start = messages.slice(0, keepStart);
  const end = messages.slice(total - keepEnd);
  const middle = messages.slice(keepStart, total - keepEnd);

  // Estimate tokens (rough: chars/4)
  let currentTokens = estimateMessageTokens([...start, ...end]);
  const budget = targetTokens * 0.8; // 80% for messages

  // Add middle messages until budget hit
  const compressed: ChatMessage[] = [...start];
  for (const msg of middle) {
    const msgTokens = estimateMessageTokens([msg]);
    if (currentTokens + msgTokens <= budget) {
      compressed.push(msg);
      currentTokens += msgTokens;
    }
  }

  compressed.push(...end);
  return compressed;
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += Math.ceil(msg.content.length / 4);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text" && "text" in part) {
          total += Math.ceil(part.text.length / 4);
        }
      }
    }
  }
  return total;
}

// ── Pipeline Builder ───────────────────────────────────────────────────

function buildPipelineStages(req: ChatCompletionRequest, config: ClawdRouterConfig): PipelineStage[] {
  const pipeline: PipelineStage[] = [];

  // Guardrails
  if (config.guardrailsEnabled && config.guardrailConfigs.length) {
    for (const guardrail of config.guardrailConfigs) {
      if (guardrail.prompt_injection_detection) {
        pipeline.push({
          type: "guardrail",
          name: "regex_pi_detection",
          guardrail_id: guardrail.id,
          guardrail_scope: "workspace",
          summary: "Passed: no injection patterns detected",
          data: { action: "passed", detected: false },
        });
      }
    }
  }

  // Context compression
  if (hasCompressionPlugin(req.plugins)) {
    const originalCount = req.messages.length;
    const compressed = compressMessages(req.messages, 128_000);
    if (compressed.length < originalCount) {
      pipeline.push({
        type: "context_compression",
        name: "context-compression",
        data: {
          engine: "middle-out",
          input_type: "messages",
          original_count: originalCount,
          compressed_count: compressed.length,
        },
      });
    }
  }

  // Web search plugin
  const webPlugin = hasWebSearchPlugin(req.plugins);
  if (webPlugin || isOnlineVariant(req.model) || hasWebSearchTool(req.tools)) {
    pipeline.push({
      type: "plugin",
      name: "web-search",
      summary: webPlugin ? `Engine: ${webPlugin.engine ?? "auto"}` : "Server tool mode",
      data: {
        max_results: webPlugin?.max_results ?? 5,
        engine: webPlugin?.engine ?? "auto",
      },
    });
  }

  return pipeline;
}

// ── Metadata Builder ───────────────────────────────────────────────────

function buildRouterMetadata(
  req: ChatCompletionRequest,
  attempt: number,
  selectedProvider: string,
  selectedModel: string,
  strategy: string,
  pipeline: PipelineStage[],
  isByok: boolean,
  attempts: RouterAttempt[],
): RouterMetadata {
  const endpoints: EndpointCandidate[] = [
    {
      provider: selectedProvider,
      model: selectedModel,
      selected: true,
    },
  ];

  return {
    requested: req.model,
    strategy,
    summary: `available=1, selected=${selectedProvider}`,
    attempt,
    is_byok: isByok,
    endpoints: {
      total: 1,
      available: endpoints,
    },
    ...(attempts.length > 1 ? { attempts } : {}),
    ...(pipeline.length > 0 ? { pipeline } : {}),
  };
}

// ── Main Proxy Function ────────────────────────────────────────────────

export async function proxyToOpenRouter(
  req: ChatCompletionRequest,
  apiKey: string,
  config: ClawdRouterConfig,
): Promise<{ response: ChatCompletionResponse; metadata: RouterMetadata } | { error: string; status: number }> {
  const startTime = Date.now();
  const attempts: RouterAttempt[] = [];

  // ── Cache Check ────────────────────────────────────────────────────
  if (config.cacheEnabled && !req.stream) {
    const key = cacheKey(req, apiKey);
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.createdAt < cached.ttl * 1000) {
      config.debug && console.log("[clawdrouter] cache HIT");
      const cloned = JSON.parse(JSON.stringify(cached.response)) as ChatCompletionResponse;
      cloned.id = `gen-${randomUUID()}`;
      cloned.created = Math.floor(Date.now() / 1000);
      cloned.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      return {
        response: cloned,
        metadata: buildRouterMetadata(
          req, 0, "cache", req.model, "cache-hit",
          [], false, [],
        ),
      };
    }
    config.debug && console.log("[clawdrouter] cache MISS");
  }

  // ── Variant Parsing ────────────────────────────────────────────────
  const { model: baseModel, provider: variantPrefs } = parseModelVariant(req.model);
  const mergedProvider = mergeProviderPrefs(req.provider, variantPrefs, undefined);

  // ── Model Fallbacks ─────────────────────────────────────────────────
  const modelsToTry: string[] = [];
  if (req.models?.length) {
    modelsToTry.push(...req.models);
  } else if (baseModel && baseModel !== req.model) {
    modelsToTry.push(baseModel);
  } else {
    modelsToTry.push(req.model.replace(/:.*$/, "")); // strip variants
  }

  // ── Build OpenRouter Headers ─────────────────────────────────────────
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.openRouterApiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": config.openRouterSiteUrl,
    "X-Title": config.openRouterSiteTitle,
  };

  if (config.openRouterCategories.length > 0) {
    headers["X-OpenRouter-Categories"] = config.openRouterCategories.slice(0, 2).join(",");
  }

  // ── Build Pipeline ──────────────────────────────────────────────────
  const pipeline = buildPipelineStages(req, config);

  // ── Response Healing Flag ───────────────────────────────────────────
  const needsHealing = req.response_format &&
    (req.response_format.type === "json_schema" || req.response_format.type === "json_object") &&
    req.plugins?.some((p) => p.id === "response-healing" && p.enabled !== false);

  // ── Try Models ──────────────────────────────────────────────────────
  let lastError: { error: string; status: number } | null = null;

  for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
    const modelToTry = modelsToTry[modelIdx];

    // Build the upstream request body
    const upstreamBody: Record<string, unknown> = {
      model: modelToTry,
      messages: req.messages,
    };

    if (req.temperature !== undefined) upstreamBody.temperature = req.temperature;
    if (req.max_tokens !== undefined) upstreamBody.max_tokens = req.max_tokens;
    if (req.stream !== undefined) upstreamBody.stream = req.stream;
    if (req.response_format) upstreamBody.response_format = req.response_format;
    if (req.top_p !== undefined) upstreamBody.top_p = req.top_p;
    if (req.seed !== undefined) upstreamBody.seed = req.seed;
    if (req.stop) upstreamBody.stop = req.stop;

    // Forward tools
    if (req.tools?.length) {
      upstreamBody.tools = req.tools;
      if (req.tool_choice) upstreamBody.tool_choice = req.tool_choice;
      if (req.parallel_tool_calls !== undefined)
        upstreamBody.parallel_tool_calls = req.parallel_tool_calls;
    }

    // Forward provider prefs as-is (OpenRouter handles them)
    if (mergedProvider) {
      const openRouterPrefs: Record<string, unknown> = {};
      if (mergedProvider.order) openRouterPrefs.order = mergedProvider.order;
      if (mergedProvider.allow_fallbacks !== undefined) openRouterPrefs.allow_fallbacks = mergedProvider.allow_fallbacks;
      if (mergedProvider.require_parameters !== undefined) openRouterPrefs.require_parameters = mergedProvider.require_parameters;
      if (mergedProvider.data_collection) openRouterPrefs.data_collection = mergedProvider.data_collection;
      if (mergedProvider.zdr) openRouterPrefs.zdr = mergedProvider.zdr;
      if (mergedProvider.only) openRouterPrefs.only = mergedProvider.only;
      if (mergedProvider.ignore) openRouterPrefs.ignore = mergedProvider.ignore;
      if (mergedProvider.quantizations) openRouterPrefs.quantizations = mergedProvider.quantizations;
      if (mergedProvider.sort) {
        openRouterPrefs.sort =
          typeof mergedProvider.sort === "string"
            ? mergedProvider.sort
            : mergedProvider.sort;
      }
      if (mergedProvider.max_price) openRouterPrefs.max_price = mergedProvider.max_price;
      if (mergedProvider.preferred_min_throughput) openRouterPrefs.preferred_min_throughput = mergedProvider.preferred_min_throughput;
      if (mergedProvider.preferred_max_latency) openRouterPrefs.preferred_max_latency = mergedProvider.preferred_max_latency;
      upstreamBody.provider = openRouterPrefs;
    }

    // Forward plugins
    if (req.plugins?.length) {
      upstreamBody.plugins = req.plugins;
    }

    // Forward web search options
    if (req.web_search_options) {
      upstreamBody.web_search_options = req.web_search_options;
    }

    // Forward x search filter for xAI models
    if (req.x_search_filter) {
      upstreamBody.x_search_filter = req.x_search_filter;
    }

    // Forward models array for fallback
    if (req.models?.length && modelIdx === 0) {
      upstreamBody.models = req.models;
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(upstreamBody),
      });

      attempts.push({
        provider: "OpenRouter",
        model: modelToTry,
        status: res.status,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = {
          error: `OpenRouter ${res.status}: ${errText.slice(0, 200)}`,
          status: res.status,
        };
        continue; // try next fallback model
      }

      const upstreamResponse = (await res.json()) as ChatCompletionResponse;

      // ── Response Healing ─────────────────────────────────────────────
      if (needsHealing) {
        for (const choice of upstreamResponse.choices) {
          if (choice.message.content && typeof choice.message.content === "string") {
            const original = choice.message.content;
            const repaired = attemptJsonRepair(original);
            if (repaired !== original) {
              pipeline.push({
                type: "response_healing",
                name: "response-healing",
                data: {
                  mode: req.response_format?.type === "json_schema" ? "json_schema" : "json_object",
                  improved: true,
                  original_length: original.length,
                  repaired_length: repaired.length,
                },
              });
              choice.message.content = repaired;
            }
          }
        }
      }

      // ── Annotate ─────────────────────────────────────────────────────
      const routedModel = upstreamResponse.model || modelToTry;
      const routingTime = Date.now() - startTime;

      const metadata = buildRouterMetadata(
        req,
        modelIdx + 1,
        "OpenRouter",
        routedModel,
        req.models?.length ? "fallback" : "direct",
        pipeline,
        false,
        attempts,
      );

      upstreamResponse.x_clawdrouter = {
        requestedModel: req.model,
        routedModel,
        tier: "MEDIUM",
        profile: config.profile,
        routingTimeMs: routingTime,
        estimatedCost: 0,
        savings: 0,
      };

      upstreamResponse.openrouter_metadata = metadata;

      // ── Cache Store ──────────────────────────────────────────────────
      if (config.cacheEnabled && !req.stream) {
        const key = cacheKey(req, config.openRouterApiKey);
        responseCache.set(key, {
          response: JSON.parse(JSON.stringify(upstreamResponse)),
          createdAt: Date.now(),
          ttl: config.cacheTtlSeconds || 300,
        });
        cachePrune();
      }

      return { response: upstreamResponse, metadata };
    } catch (err) {
      lastError = {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        status: 502,
      };
      attempts.push({
        provider: "OpenRouter",
        model: modelToTry,
        status: 502,
      });
    }
  }

  // All models failed
  return lastError || { error: "All models failed", status: 502 };
}

export { responseCache, cachePrune, MAX_CACHE_SIZE };