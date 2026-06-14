import type { UserAgent } from "@shared/schema";
import type { BrowserAgent, BrowserAgentRepoAsset } from "./browserAgents";
import { loadBrowserAgents } from "./browserAgents";
import { getImportedAgentRuntimeProfile, getUserAgentRuntimeProfile } from "./userAgentRuntime";

export interface ScopedRepoAssets {
  root: BrowserAgentRepoAsset[];
  schema: BrowserAgentRepoAsset[];
  scripts: BrowserAgentRepoAsset[];
  public: BrowserAgentRepoAsset[];
  cursor: BrowserAgentRepoAsset[];
}

function byFilename(items: BrowserAgentRepoAsset[], patterns: RegExp[]) {
  return items.filter((item) => patterns.some((pattern) => pattern.test(item.filename)));
}

function uniqueById(items: BrowserAgentRepoAsset[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function scopedForAdapter(adapter: string, relatedProjects: string[]): ScopedRepoAssets {
  const { repoAssets } = loadBrowserAgents();
  const rootBase = byFilename(repoAssets.root, [
    /^AGENTS\.md$/i,
    /^README\.md$/i,
    /^package\.json$/i,
    /^CLAUDE\.md$/i,
    /^GEMINI\.md$/i,
    /^SECURITY\.md$/i,
    /^CONTRIBUTING\.md$/i,
    /^\.eslintrc\.cjs$/i,
    /^\.editorconfig$/i,
    /^\.releaserc\.cjs$/i,
    /^\.vercel-deploy$/i,
  ]);

  if (adapter === "metaplex-mint") {
    return {
      root: rootBase,
      schema: repoAssets.schema,
      scripts: repoAssets.scripts,
      public: repoAssets.public,
      cursor: repoAssets.cursor,
    };
  }

  if (adapter === "cloudflare-agent-api") {
    return {
      root: uniqueById([...rootBase, ...byFilename(repoAssets.root, [/^humans\.txt$/i, /^CNAME$/i])]),
      schema: repoAssets.schema,
      scripts: repoAssets.scripts,
      public: repoAssets.public,
      cursor: repoAssets.cursor,
    };
  }

  if (adapter === "plugin-delivery") {
    return {
      root: uniqueById([...rootBase, ...byFilename(repoAssets.root, [/^LICENSE$/i])]),
      schema: [],
      scripts: repoAssets.scripts,
      public: repoAssets.public,
      cursor: repoAssets.cursor,
    };
  }

  if (adapter === "phoenix-perps-backend" || adapter === "pumpfun-rust-backend" || adapter === "solana-oracle") {
    return {
      root: rootBase,
      schema: relatedProjects.includes("schema") ? repoAssets.schema : repoAssets.schema,
      scripts: repoAssets.scripts,
      public: repoAssets.public,
      cursor: repoAssets.cursor,
    };
  }

  return {
    root: rootBase,
    schema: [],
    scripts: repoAssets.scripts,
    public: repoAssets.public,
    cursor: repoAssets.cursor,
  };
}

export function getRelevantRepoAssetsForImportedAgent(agent: BrowserAgent): ScopedRepoAssets {
  const runtimeProfile = getImportedAgentRuntimeProfile(agent);
  return scopedForAdapter(runtimeProfile.adapter, runtimeProfile.relatedProjects);
}

export function getRelevantRepoAssetsForUserAgent(agent: UserAgent): ScopedRepoAssets {
  const runtimeProfile = getUserAgentRuntimeProfile(agent);
  return scopedForAdapter(runtimeProfile.adapter, runtimeProfile.relatedProjects);
}
