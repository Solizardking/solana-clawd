/**
 * Legacy shim — OpenRouter has been replaced by DeepSeek V4.
 * This module re-exports the DeepSeek client under the old names so existing
 * imports (`openRouter`, `OpenRouterMessage`, `OpenRouterModelOption`,
 * `AVAILABLE_MODELS`) keep working.
 */
export {
  deepseek as openRouter,
  AVAILABLE_MODELS,
  type DeepSeekMessage as OpenRouterMessage,
  type DeepSeekModelOption as OpenRouterModelOption,
} from "./deepseek";
