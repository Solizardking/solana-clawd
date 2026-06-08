/**
 * Model variant parsing — OpenRouter-compatible virtual variant suffixes.
 * e.g. "openai/gpt-5.2:nitro" -> sort by throughput
 */

import type { ProviderPreferences, ProviderSortConfig } from "../types.js";

/** Parse a model slug for variant suffixes and return the cleaned model ID + provider prefs. */
export function parseModelVariant(model: string): {
  model: string;
  provider?: ProviderPreferences;
} {
  let cleaned = model;
  const provider: ProviderPreferences = {};

  // :nitro — sort by throughput
  if (cleaned.endsWith(":nitro")) {
    cleaned = cleaned.slice(0, -":nitro".length);
    provider.sort = "throughput";
  }

  // :floor — sort by price
  if (cleaned.endsWith(":floor")) {
    cleaned = cleaned.slice(0, -":floor".length);
    provider.sort = "price";
  }

  // :free — free tier only
  if (cleaned.endsWith(":free")) {
    cleaned = cleaned.slice(0, -":free".length);
    provider.sort = "price";
    // mark as free-filtered (handled by model registry)
  }

  // :extended — extended context windows
  if (cleaned.endsWith(":extended")) {
    cleaned = cleaned.slice(0, -":extended".length);
    // preference for extended context, implement in provider selector
  }

  // :exacto — quality-first provider sorting for tool use
  if (cleaned.endsWith(":exacto")) {
    cleaned = cleaned.slice(0, -":exacto".length);
    provider.sort = {
      by: "throughput",
      partition: "none",
    } satisfies ProviderSortConfig;
    // Also applies tool-calling quality signals (Auto Exacto)
  }

  // :online — enable web search (handled by plugin injection)
  if (cleaned.endsWith(":online")) {
    cleaned = cleaned.slice(0, -":online".length);
  }

  if (Object.keys(provider).length === 0) {
    return { model: cleaned };
  }
  return { model: cleaned, provider };
}

/** Detect if a model slug is using any variant suffix */
export function hasVariantSuffix(model: string): boolean {
  const variants = [":nitro", ":floor", ":free", ":extended", ":exacto", ":online"];
  return variants.some((v) => model.endsWith(v));
}

/** Strip all variant suffixes */
export function stripVariantSuffix(model: string): string {
  return parseModelVariant(model).model;
}

/**
 * Merge provider preferences from multiple sources.
 * Precedence: explicit request provider > variant suffix > defaults
 */
export function mergeProviderPrefs(
  requestProvider: ProviderPreferences | undefined,
  variantProvider: ProviderPreferences | undefined,
  defaults: ProviderPreferences | undefined,
): ProviderPreferences | undefined {
  const merged: ProviderPreferences = {};

  if (defaults) Object.assign(merged, defaults);
  if (variantProvider) Object.assign(merged, variantProvider);
  if (requestProvider) Object.assign(merged, requestProvider);

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Check if a model slug includes the :online variant */
export function isOnlineVariant(model: string): boolean {
  return model.endsWith(":online") || model.endsWith(":free:online");
}