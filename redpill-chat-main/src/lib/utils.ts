import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Check if a model is using GPU TEE (Trusted Execution Environment)
 * @param providers - Array of provider names (strings) or provider objects with name field
 * @returns True if any provider is a GPU TEE provider
 */
export function isGpuTeeModel(
  providers: string[] | Array<{ name: string }>,
): boolean {
  const GPU_TEE_PROVIDERS = ["phala", "tinfoil", "near-ai"];

  if (!providers || providers.length === 0) {
    return false;
  }

  // Handle string array
  if (typeof providers[0] === "string") {
    return providers.some((provider) =>
      GPU_TEE_PROVIDERS.includes((provider as string).toLowerCase()),
    );
  }

  // Handle object array with name field
  return providers.some((provider) =>
    GPU_TEE_PROVIDERS.includes(
      (provider as { name: string }).name.toLowerCase(),
    ),
  );
}

/**
 * Get model provider icon URL using Google's favicon service
 */
export function getModelProviderIcon(providerName: string): string {
  const getGstaticUrl = (url: string, size = 32) => {
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=${size}`;
  };

  const lowercaseName = providerName.toLowerCase();

  switch (lowercaseName) {
    case "openai":
      return getGstaticUrl("https://openai.com/");
    case "anthropic":
      return getGstaticUrl("https://anthropic.com/");
    case "google":
      return getGstaticUrl("https://ai.google/");
    case "mistral":
      return getGstaticUrl("https://mistral.ai/");
    case "cohere":
      return getGstaticUrl("https://cohere.com/");
    case "groq":
      return getGstaticUrl("https://groq.com/");
    case "together":
      return getGstaticUrl("https://www.together.xyz/");
    case "replicate":
      return getGstaticUrl("https://replicate.com/");
    case "deepseek":
      return getGstaticUrl("https://deepseek.com/");
    case "meta-llama":
    case "meta":
      return getGstaticUrl("https://ai.meta.com/");
    case "qwen":
      return getGstaticUrl("https://qwenlm.github.io/");
    case "phala":
      return getGstaticUrl("https://phala.network/");
    case "near-ai":
      return getGstaticUrl("https://near.ai/");
    case "tinfoil":
      return getGstaticUrl("https://tinfoil.sh/");
    case "z-ai":
      return getGstaticUrl("https://chat.z.ai/");
    case "x-ai":
      return getGstaticUrl("https://x.ai/");
    case "redpill":
      return "/favicon-32x32.png";
    default:
      return getGstaticUrl("https://huggingface.co/");
  }
}
