/**
 * Clawd Code — Model Registry
 * xAI Grok + Anthropic Claude + DeepSeek model definitions
 *
 * Default model: xAI Grok (grok-4.3 for code/REPL, grok-4.20-multi-agent for research).
 * Single source of truth used by cli.ts, modes/*, and the /inspect command.
 */

export type ClawdProvider = 'xai' | 'anthropic' | 'deepseek' | 'openrouter';

export interface ModelDefinition {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  inputPrice: number;   // per 1M tokens
  outputPrice: number;  // per 1M tokens
  reasoning?: boolean;
  multiAgent?: boolean;
  responsesOnly?: boolean;
  supportsClientTools?: boolean;
  reasoningEfforts?: string[];
  aliases?: string[];
  provider: ClawdProvider;
  streaming?: boolean;
  /** Best-fit mode for this model (used by `clawd-code inspect` recommendations). */
  bestFor?: 'code' | 'research' | 'voice' | 'image' | 'general';
}

// ─── Default model constants (single source of truth) ───────────────────────
/** General-purpose default (code mode, REPL, trade). Grok 4.3 — reasoning, tools, streaming. */
export const DEFAULT_MODEL = 'grok-4.3';
/** Default for research mode — multi-agent (responses API only, no client tools). */
export const DEFAULT_RESEARCH_MODEL = 'grok-4.20-multi-agent';
/** Default for image generation mode. */
export const DEFAULT_IMAGE_MODEL = 'grok-imagine-image-quality';
/** Default for voice agent mode (realtime voice). */
export const DEFAULT_VOICE_MODEL = 'grok-voice-think-fast-1.0';
/** Default for fast/cheap tasks (alt to grok-4.3). */
export const DEFAULT_FAST_MODEL = 'grok-4.3-fast';
/** Default provider (xAI / Grok). */
export const DEFAULT_PROVIDER: ClawdProvider = 'xai';

// ─── Model catalog ──────────────────────────────────────────────────────────
export const MODELS: ModelDefinition[] = [
  // ── Anthropic Claude ──────────────────────────────────────────────────
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Anthropic flagship — best for code, reasoning, and agent tasks',
    contextWindow: 200_000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    reasoning: true,
    supportsClientTools: true,
    streaming: true,
    provider: 'anthropic',
    bestFor: 'code',
    aliases: ['sonnet', 'claude-sonnet', 'sonnet-4-6'],
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    description: 'Anthropic most capable — deep reasoning, complex synthesis',
    contextWindow: 200_000,
    inputPrice: 15.0,
    outputPrice: 75.0,
    reasoning: true,
    supportsClientTools: true,
    streaming: true,
    provider: 'anthropic',
    bestFor: 'research',
    aliases: ['opus', 'claude-opus', 'opus-4-8'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Anthropic fastest model — low latency, high throughput',
    contextWindow: 200_000,
    inputPrice: 0.8,
    outputPrice: 4.0,
    supportsClientTools: true,
    streaming: true,
    provider: 'anthropic',
    bestFor: 'general',
    aliases: ['haiku', 'claude-haiku', 'haiku-4-5'],
  },
  // ── DeepSeek ──────────────────────────────────────────────────────────
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'DeepSeek flagship reasoning/coding model with 1M context',
    contextWindow: 1_000_000,
    inputPrice: 0.435,
    outputPrice: 0.87,
    reasoning: true,
    supportsClientTools: true,
    provider: 'deepseek',
    bestFor: 'code',
    aliases: ['deepseek/pro', 'deepseek-v4-pro[1m]', 'v4-pro'],
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'DeepSeek fast model with 1M context and low token cost',
    contextWindow: 1_000_000,
    inputPrice: 0.14,
    outputPrice: 0.28,
    reasoning: true,
    supportsClientTools: true,
    provider: 'deepseek',
    bestFor: 'general',
    aliases: ['deepseek/flash', 'v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  },
  // ── xAI Grok (default) ────────────────────────────────────────────────
  {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    description: 'xAI flagship reasoning model — best for agent tasks, code, and market analysis. DEFAULT for code/REPL/trade.',
    contextWindow: 256_000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    reasoning: true,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'code',
    aliases: ['grok-4-1-fast', 'xai/grok-code-fast-1', 'grok', 'default'],
  },
  {
    id: 'grok-4.3-fast',
    name: 'Grok 4.3 Fast',
    description: 'Faster, cost-optimised Grok 4.3 — same family, lower latency, lower $/M tokens.',
    contextWindow: 256_000,
    inputPrice: 0.6,
    outputPrice: 2.5,
    reasoning: true,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'general',
    aliases: ['grok-fast', 'grok-4.3-fast-reasoning'],
  },
  {
    id: 'grok-4.20-non-reasoning',
    name: 'Grok 4.20 (Non-reasoning)',
    description: 'Fast, cost-effective Grok model without extended reasoning',
    contextWindow: 256_000,
    inputPrice: 2.0,
    outputPrice: 10.0,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'general',
    aliases: ['grok-4.20-0309-non-reasoning', 'x-ai/grok-3'],
  },
  {
    id: 'grok-4.20-multi-agent',
    name: 'Grok 4.20 Multi-Agent',
    description: 'Specialized Grok model for multi-agent orchestration — responses API only. DEFAULT for research mode.',
    contextWindow: 256_000,
    inputPrice: 2.0,
    outputPrice: 10.0,
    multiAgent: true,
    responsesOnly: true,
    supportsClientTools: false,
    streaming: true,
    provider: 'xai',
    bestFor: 'research',
    aliases: ['grok-4.20-multi-agent-0309', 'x-ai/grok-4.20-multi-agent-beta', 'multi-agent'],
  },
  {
    id: 'grok-4.20-reasoning',
    name: 'Grok 4.20 Reasoning',
    description: 'Grok model with extended chain-of-thought reasoning',
    contextWindow: 256_000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    reasoning: true,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'code',
    aliases: ['grok-4.20-0309-reasoning'],
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    description: 'Small, fast Grok model with configurable reasoning effort',
    contextWindow: 131_072,
    inputPrice: 0.3,
    outputPrice: 0.5,
    reasoning: true,
    supportsClientTools: true,
    streaming: true,
    reasoningEfforts: ['low', 'high'],
    provider: 'xai',
    bestFor: 'general',
    aliases: ['grok3-mini'],
  },
  {
    id: 'grok-3',
    name: 'Grok 3',
    description: 'Capable, balanced Grok model — strong at reasoning and tool use',
    contextWindow: 131_072,
    inputPrice: 3.0,
    outputPrice: 15.0,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'general',
    aliases: ['grok3'],
  },
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast',
    description: 'Grok model optimized for code generation and agentic coding',
    contextWindow: 256_000,
    inputPrice: 1.0,
    outputPrice: 5.0,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'code',
    aliases: ['grok-code', 'code-fast'],
  },
  {
    id: 'grok-imagine-image-quality',
    name: 'Grok Imagine Image Quality',
    description: 'xAI image generation & editing model — text-to-image and image-to-image via the xAI image API. DEFAULT for image mode.',
    contextWindow: 0,
    inputPrice: 0,
    outputPrice: 0,
    supportsClientTools: false,
    streaming: false,
    provider: 'xai',
    bestFor: 'image',
    aliases: ['grok-imagine', 'imagine', 'grok-image'],
  },
  {
    id: 'grok-voice-think-fast-1.0',
    name: 'Grok Voice Think Fast 1.0',
    description: 'xAI realtime voice model — for the voice agent REPL with Solana tools. DEFAULT for voice --agent mode.',
    contextWindow: 0,
    inputPrice: 0,
    outputPrice: 0,
    supportsClientTools: true,
    streaming: true,
    provider: 'xai',
    bestFor: 'voice',
    aliases: ['grok-voice', 'voice', 'voice-fast'],
  },
];

const MODEL_BY_ID = new Map<string, ModelDefinition>();
const ALIAS_MAP = new Map<string, string>();

for (const m of MODELS) {
  MODEL_BY_ID.set(m.id, m);
  ALIAS_MAP.set(m.id.toLowerCase(), m.id);
  for (const alias of m.aliases ?? []) {
    ALIAS_MAP.set(alias.toLowerCase(), m.id);
  }
}

export function getModel(id: string): ModelDefinition | undefined {
  const canonical = ALIAS_MAP.get(id.toLowerCase());
  return canonical ? MODEL_BY_ID.get(canonical) : MODEL_BY_ID.get(id);
}

export function normalizeModelId(id: string): string {
  return ALIAS_MAP.get(id.toLowerCase()) ?? id;
}

export function listModelIds(): string[] {
  return MODELS.map((m) => m.id);
}

export function listModelsByProvider(provider: ClawdProvider): ModelDefinition[] {
  return MODELS.filter((m) => m.provider === provider);
}

/** Best default model for a given mode. */
export function defaultModelFor(mode: 'code' | 'research' | 'voice' | 'image' | 'general' | 'repl' | 'trade'): string {
  switch (mode) {
    case 'research': return DEFAULT_RESEARCH_MODEL;
    case 'image':    return DEFAULT_IMAGE_MODEL;
    case 'voice':    return DEFAULT_VOICE_MODEL;
    case 'code':
    case 'repl':
    case 'trade':
    case 'general':
    default:         return DEFAULT_MODEL;
  }
}

export function getSupportedReasoningEfforts(id: string): string[] {
  return getModel(id)?.reasoningEfforts ?? [];
}

export function getEffectiveReasoningEffort(id: string, effort?: string): string | undefined {
  const supported = getSupportedReasoningEfforts(id);
  if (supported.length === 0) return undefined;
  if (effort && supported.includes(effort)) return effort;
  return undefined;
}

export function isMultiAgentModel(id: string): boolean {
  return getModel(id)?.multiAgent === true;
}

export function isResponsesOnlyModel(id: string): boolean {
  return getModel(id)?.responsesOnly === true;
}

export function isStreamingSupported(id: string): boolean {
  return getModel(id)?.streaming === true;
}

/**
 * If the requested model is not usable for the given mode (e.g. responses-only
 * models can't do client-side tool calls in code mode), return a sensible
 * fallback. Otherwise return the requested id unchanged.
 */
export function resolveModelForMode(
  requested: string,
  mode: 'code' | 'repl' | 'trade' | 'research' | 'voice' | 'image' | 'general',
): string {
  if (mode !== 'research' && isResponsesOnlyModel(requested)) {
    return DEFAULT_MODEL;
  }
  return normalizeModelId(requested) || DEFAULT_MODEL;
}

export function printModelsTable(): void {
  const providers: ClawdProvider[] = ['xai', 'anthropic', 'deepseek', 'openrouter'];
  const labels: Record<ClawdProvider, string> = {
    xai: 'xAI Grok  ⭐ default',
    anthropic: 'Anthropic Claude',
    deepseek: 'DeepSeek',
    openrouter: 'OpenRouter',
  };

  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  CLAWD CODE — MODEL REGISTRY (xAI Grok is the default provider)            ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  ID                              │  Provider   │  Ctx   │  $/1M in/out  │ M ║');
  console.log('╠════════════════════════════════════════════════════════════════════════════╣');

  for (const provider of providers) {
    const group = MODELS.filter((m) => m.provider === provider);
    if (group.length === 0) continue;
    console.log(`║  ── ${labels[provider].padEnd(72)}║`);
    for (const m of group) {
      const ctx = m.contextWindow >= 1_000_000
        ? `${(m.contextWindow / 1_000_000).toFixed(0)}M`
        : m.contextWindow >= 1000
          ? `${(m.contextWindow / 1000).toFixed(0)}K`
          : '—';
      const price = m.inputPrice || m.outputPrice ? `$${m.inputPrice}/$${m.outputPrice}` : 'see xAI';
      const stream = m.streaming ? '~' : ' ';
      const best = m.bestFor ? m.bestFor[0].toUpperCase() : ' ';
      console.log(`║  ${stream}${(m.id.padEnd(32))} │  ${(provider.padEnd(10))} │  ${ctx.padStart(5)} │  ${price.padStart(12)}  │ ${best} ║`);
    }
  }

  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('  ~ = streaming supported    M = best-fit mode (C=code, R=research, V=voice, I=image, G=general)');
  console.log(`\n  Default provider: ${DEFAULT_PROVIDER}    Default model: ${DEFAULT_MODEL}`);
  console.log(`  Research default: ${DEFAULT_RESEARCH_MODEL}    Voice default: ${DEFAULT_VOICE_MODEL}    Image default: ${DEFAULT_IMAGE_MODEL}`);
  console.log('  Override: CLAWD_MODEL=<id>  |  CLAWD_PROVIDER=xai|anthropic|openrouter|deepseek');
  console.log('  API keys: XAI_API_KEY | ANTHROPIC_API_KEY | DEEPSEEK_API_KEY | OPENROUTER_API_KEY');
}
