/**
 * ClawdRouter — OpenRouter-compatible types for the Solana-native LLM router
 * Part of the solana-clawd ecosystem
 */

// ── Provider Routing ──────────────────────────────────────────────────

export interface ProviderPreferences {
  /** List of provider slugs to try in order */
  order?: string[];
  /** Whether to allow backup providers when primary is unavailable */
  allow_fallbacks?: boolean;
  /** Only use providers that support all parameters */
  require_parameters?: boolean;
  /** Control data collection: "allow" or "deny" */
  data_collection?: "allow" | "deny";
  /** Restrict to ZDR endpoints only */
  zdr?: boolean;
  /** Restrict to models allowing text distillation */
  enforce_distillable_text?: boolean;
  /** Only allow these provider slugs */
  only?: string[];
  /** Ignore these provider slugs */
  ignore?: string[];
  /** Filter by quantization levels */
  quantizations?: string[];
  /** Sort providers by price, throughput, or latency */
  sort?: "price" | "throughput" | "latency" | ProviderSortConfig;
  /** Preferred minimum throughput (tokens/sec) */
  preferred_min_throughput?: number | PercentileThresholds;
  /** Preferred maximum latency (seconds) */
  preferred_max_latency?: number | PercentileThresholds;
  /** Maximum pricing to accept */
  max_price?: MaxPriceConfig;
}

export interface ProviderSortConfig {
  by: "price" | "throughput" | "latency";
  partition?: "model" | "none";
}

export interface PercentileThresholds {
  p50?: number;
  p75?: number;
  p90?: number;
  p99?: number;
}

export interface MaxPriceConfig {
  prompt?: number;
  completion?: number;
  request?: number;
  image?: number;
}

export type QuantizationLevel =
  | "int4"
  | "int8"
  | "fp4"
  | "fp6"
  | "fp8"
  | "fp16"
  | "bf16"
  | "fp32"
  | "unknown";

// ── Plugins ───────────────────────────────────────────────────────────

export interface PluginConfig {
  id: string;
  enabled?: boolean;
  // Web search plugin
  max_results?: number;
  search_prompt?: string;
  engine?: "native" | "exa" | "firecrawl" | "parallel" | "auto";
  include_domains?: string[];
  exclude_domains?: string[];
  // PDF / file parser
  pdf?: {
    engine?: "cloudflare-ai" | "mistral-ocr" | "native";
  };
  // Fusion plugin
  analysis_models?: string[];
  model?: string;
  max_tool_calls?: number;
}

// ── Server Tools ──────────────────────────────────────────────────────

export interface ServerTool {
  type:
    | "function"
    | "openrouter:web_search"
    | "openrouter:web_fetch"
    | "openrouter:datetime"
    | "openrouter:image_generation"
    | "openrouter:apply_patch"
    | "openrouter:fusion"
    | "openrouter:advisor"
    | "code_interpreter"
    | "web_search"
    | "x_search";
  function?: FunctionToolDef;
  parameters?: ServerToolParameters;
}

export interface FunctionToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface ServerToolParameters {
  engine?: string;
  max_results?: number;
  max_total_results?: number;
  search_context_size?: "low" | "medium" | "high";
  user_location?: UserLocation;
  allowed_domains?: string[];
  excluded_domains?: string[];
  blocked_domains?: string[];
  max_uses?: number;
  max_content_tokens?: number;
  max_completion_tokens?: number;
  timezone?: string;
  model?: string;
  quality?: string;
  size?: string;
  aspect_ratio?: string;
  background?: string;
  output_format?: string;
  output_compression?: number;
  moderation?: string;
  analysis_models?: string[];
  advisors?: AdvisorProfile[];
  instructions?: string;
  tools?: ServerTool[];
  forward_transcript?: boolean;
  temperature?: number;
  reasoning?: { effort?: string; max_tokens?: number };
}

export interface UserLocation {
  type: "approximate";
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

export interface AdvisorProfile {
  name: string;
  model?: string;
  instructions?: string;
  tools?: ServerTool[];
  max_tool_calls?: number;
  temperature?: number;
}

// ── Request Classification ────────────────────────────────────────────

export type RequestTier = "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING";

export type RoutingProfile = "eco" | "auto" | "premium" | "private";

export interface ScoredRequest {
  tier: RequestTier;
  scores: DimensionScores;
  totalScore: number;
  reasoning: string;
}

export interface DimensionScores {
  tokenCount: number;
  complexity: number;
  technicalDepth: number;
  codeGeneration: number;
  reasoning: number;
  creativity: number;
  multiStep: number;
  contextLength: number;
  toolUse: number;
  vision: number;
  mathScience: number;
  solanaSpecific: number;
  agentAutonomy: number;
  structuredOutput: number;
  latencySensitivity: number;
}

// ── Model Registry ────────────────────────────────────────────────────

export type ModelProvider =
  | "anthropic"
  | "clawdrouter"
  | "ollama"
  | "openai"
  | "google"
  | "xai"
  | "deepseek"
  | "nvidia"
  | "moonshot"
  | "minimax"
  | "sourceful"
  | "qwen"
  | "nex-agi"
  | "zai"
  | "redpill"
  | "solrouter"
  | "phala"
  | "nearai"
  | "chutes"
  | "tinfoil";

export type ModelFeature =
  | "reasoning"
  | "vision"
  | "agentic"
  | "tools"
  | "solana"
  | "code"
  | "tee"
  | "privacy"
  | "embedding";

export interface ModelEntry {
  id: string;
  provider: ModelProvider;
  name: string;
  inputPricePerM: number;
  outputPricePerM: number;
  contextWindow: number;
  features: ModelFeature[];
  tier: "budget" | "mid" | "premium";
  qualityScore: number;
  speedMs: number;
  enabled: boolean;
  free: boolean;
}

export interface TierMapping {
  eco: string;
  auto: string;
  premium: string;
  private: string;
}

// ── Proxy Server ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | AudioContentPart
  | VideoContentPart
  | FileContentPart;

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string; detail?: string };
}

export interface AudioContentPart {
  type: "input_audio";
  input_audio: { data: string; format: string };
}

export interface VideoContentPart {
  type: "video_url";
  video_url: { url: string };
}

export interface FileContentPart {
  type: "file";
  file: { filename: string; file_data: string };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatCompletionRequest {
  model: string;
  /** Array of models for fallback routing */
  models?: string[];
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ServerTool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  response_format?: ResponseFormatConfig;
  provider?: ProviderPreferences;
  plugins?: PluginConfig[];
  modalities?: string[];
  audio?: AudioConfig;
  /** Preset slug reference */
  preset?: string;
  /** Web search options for native providers */
  web_search_options?: { search_context_size?: "low" | "medium" | "high" };
  /** X search filters for xAI models */
  x_search_filter?: XSearchFilter;
  parallel_tool_calls?: boolean;
  seed?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
}

export interface ResponseFormatConfig {
  type: "text" | "json_object" | "json_schema";
  json_schema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
}

export interface AudioConfig {
  voice: string;
  format: string;
}

export interface XSearchFilter {
  allowed_x_handles?: string[];
  excluded_x_handles?: string[];
  from_date?: string;
  to_date?: string;
  enable_image_understanding?: boolean;
  enable_video_understanding?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: TokenUsage;
  x_clawdrouter?: RoutingMeta;
  openrouter_metadata?: RouterMetadata;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage & { annotations?: Annotation[] };
  finish_reason: string;
}

export interface Annotation {
  type: "url_citation" | "file";
  url_citation?: {
    url: string;
    title: string;
    content?: string;
    start_index?: number;
    end_index?: number;
  };
  file?: {
    hash: string;
    name?: string;
    content: ContentPart[];
  };
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Server tool usage counts */
  server_tool_use?: Record<string, number>;
}

export interface RoutingMeta {
  requestedModel: string;
  routedModel: string;
  tier: RequestTier;
  profile: RoutingProfile;
  routingTimeMs: number;
  estimatedCost: number;
  savings: number;
}

// ── Router Metadata (OpenRouter-compatible) ───────────────────────────

export interface RouterMetadata {
  requested: string;
  strategy: string;
  region?: string | null;
  summary: string;
  attempt: number;
  is_byok: boolean;
  endpoints: EndpointsMetadata;
  params?: RouterParams;
  attempts?: RouterAttempt[];
  pipeline?: PipelineStage[];
}

export interface EndpointsMetadata {
  total: number;
  available: EndpointCandidate[];
}

export interface EndpointCandidate {
  provider: string;
  model: string;
  selected: boolean;
}

export interface RouterParams {
  quality_floor?: number;
  throughput_floor?: number;
  sort?: string;
}

export interface RouterAttempt {
  provider: string;
  model: string;
  status: number;
}

export interface PipelineStage {
  type: string;
  name: string;
  guardrail_id?: string;
  guardrail_scope?: string;
  summary?: string;
  data?: Record<string, unknown>;
}

// ── Video Generation ──────────────────────────────────────────────────

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  size?: string;
  frame_images?: Array<{ type: "image_url"; image_url: { url: string }; frame_type: "first_frame" | "last_frame" }>;
  input_references?: Array<{ type: "image_url"; image_url: { url: string } }>;
  generate_audio?: boolean;
  seed?: number;
  callback_url?: string;
  provider?: { options?: Record<string, unknown> };
}

export interface VideoGenerationJob {
  id: string;
  generation_id?: string;
  polling_url: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  unsigned_urls?: string[];
  usage?: { cost: number; is_byok: boolean };
  error?: string;
  model?: string;
}

// ── Wallet & Payments ─────────────────────────────────────────────────

export interface ClawdWallet {
  publicKey: string;
  secretKey: Uint8Array;
  mnemonic?: string;
}

export interface PaymentRecord {
  id: string;
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSDC: number;
  txSignature?: string;
  network: "solana-mainnet" | "solana-devnet";
}

export interface WalletBalance {
  sol: number;
  usdc: number;
  address: string;
  network: string;
}

// ── x402 Protocol ─────────────────────────────────────────────────────

export interface X402PaymentRequired {
  version: "1";
  amount: string;
  recipient: string;
  token: string;
  network: "solana-mainnet" | "solana-devnet";
  description: string;
  nonce: string;
  expires: number;
}

export interface X402PaymentHeader {
  version: "1";
  scheme: "exact";
  network: "solana-mainnet" | "solana-devnet";
  payload: string;
  sender: string;
}

// ── Configuration ─────────────────────────────────────────────────────

export interface ClawdRouterConfig {
  port: number;
  profile: RoutingProfile;
  solanaRpcUrl: string;
  network: "solana-mainnet" | "solana-devnet";
  maxPerRequest: number;
  maxPerSession: number;
  walletPath: string;
  excludedModels: string[];
  debug: boolean;
  upstreamUrl: string;

  // ── $CLAWD Token Integration
  clawdTokenMint: string;
  heliusApiKey: string;
  holderThresholds: {
    whale: number;
    diamond: number;
    holder: number;
  };

  // ── OpenRouter Integration
  openRouterApiKey: string;
  openRouterSiteTitle: string;
  openRouterSiteUrl: string;
  openRouterCategories: string[];
  openRouterEnabled: boolean;
  openRouterModelAliases: Record<string, string>;

  // ── Local Ollama Integration
  ollamaEnabled: boolean;
  ollamaHost: string;
  ollamaModelAliases: Record<string, string>;

  // ── x402 Payment Config
  x402PayTo: string;
  x402Price: string;
  x402Description: string;

  // ── Relay / Aggregation Config
  relayName: string;
  relayPublicUrl: string;
  x402ApiUrl: string;
  perpsSources: string[];
  perpsApiUrl: string;
  relayTimeoutMs: number;

  // ── Hosted x402.wtf Control Plane
  authMode: "local" | "platform";
  validationUrl: string;
  internalSecret: string;
  apiKeyStorePath: string;

  // ── Privacy / TEE Routing
  redpillApiKey: string;
  solrouterApiKey: string;
  privacyProvider: "redpill" | "solrouter" | "auto";

  // ── Response Caching
  cacheEnabled: boolean;
  cacheTtlSeconds: number;

  // ── Guardrails
  guardrailsEnabled: boolean;
  guardrailConfigs: GuardrailConfig[];

  // ── Fusion
  fusionPanelModels: string[];
  fusionJudgeModel: string;
  fusionMaxToolCalls: number;
}

export interface GuardrailConfig {
  id: string;
  name: string;
  prompt_injection_detection?: boolean;
  content_filter?: boolean;
  enforce_zdr_anthropic?: boolean;
  enforce_zdr_openai?: boolean;
  enforce_zdr_google?: boolean;
  enforce_zdr_other?: boolean;
  max_price?: MaxPriceConfig;
  allowed_providers?: string[];
  ignored_providers?: string[];
  require_parameters?: boolean;
}

// ── Presets ───────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  designated_version_id: string;
  created_at: string;
  updated_at: string;
  designated_version: PresetVersion;
}

export interface PresetVersion {
  id: string;
  version: number;
  system_prompt?: string;
  config: PresetConfig;
  created_at: string;
  updated_at: string;
}

export interface PresetConfig {
  model?: string;
  models?: string[];
  temperature?: number;
  provider?: ProviderPreferences;
  top_p?: number;
  max_tokens?: number;
  plugins?: PluginConfig[];
  tools?: ServerTool[];
  cache_enabled?: boolean;
  cache_ttl_seconds?: number;
}

// ── Usage Stats ───────────────────────────────────────────────────────

export interface UsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSDC: number;
  totalSavedUSDC: number;
  byModel: Record<string, ModelUsage>;
  byTier: Record<RequestTier, number>;
  sessionStart: number;
  cacheHits: number;
  cacheMisses: number;
  serverToolCalls: number;
}

export interface ModelUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUSDC: number;
}

// ── Slash Commands ────────────────────────────────────────────────────

export interface SlashCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  handler: (args: string[], ctx: CommandContext) => Promise<string>;
}

export interface CommandContext {
  config: ClawdRouterConfig;
  wallet: ClawdWallet | null;
  stats: UsageStats;
  registry: ModelEntry[];
}
