import * as fs from "node:fs/promises";
import * as path from "node:path";
import { OFFICIAL_SOLANA_MCP_ROOT } from "../paths.js";

const OFFICIAL_ROOT = OFFICIAL_SOLANA_MCP_ROOT;
const SOURCES_YAML = path.join(OFFICIAL_ROOT, "ingestion", "sources.yaml");

export interface OfficialSolanaSource {
  id: string;
  name: string;
  kind: "github" | "web" | "openapi" | string;
  enabled: boolean;
  sections: string[];
  useCases: string;
  primaryUrl: string;
}

export interface OfficialSolanaAsset {
  id: string;
  title: string;
  path: string;
  mimeType: string;
  description: string;
}

const ASSETS: OfficialSolanaAsset[] = [
  {
    id: "api-server",
    title: "Official API Server",
    path: "api/server.ts",
    mimeType: "text/typescript",
    description: "Vercel route adapter for the official Solana MCP handler.",
  },
  {
    id: "handler",
    title: "Official MCP Handler",
    path: "lib/handler.ts",
    mimeType: "text/typescript",
    description: "Request handler used by the official mcp-handler based server.",
  },
  {
    id: "mcp-index",
    title: "Official Tool Registration",
    path: "lib/index.ts",
    mimeType: "text/typescript",
    description: "Official Solana MCP tool registration entrypoint.",
  },
  {
    id: "cloudrun",
    title: "Official Cloud Run Entrypoint",
    path: "server/cloudrun.ts",
    mimeType: "text/typescript",
    description: "Standalone HTTP entrypoint for Cloud Run deployments.",
  },
  {
    id: "ingestion",
    title: "Official Ingestion Pipeline",
    path: "ingestion/crawl_and_index.py",
    mimeType: "text/x-python",
    description: "Crawler/indexer that builds the official Solana docs corpus.",
  },
  {
    id: "sources-yaml",
    title: "Official Source Corpus",
    path: "ingestion/sources.yaml",
    mimeType: "text/yaml",
    description: "Solana ecosystem source taxonomy used by official MCP docs tools.",
  },
  {
    id: "probe",
    title: "Official MCP Probe",
    path: "monitoring/mcp-probe/src/probe.ts",
    mimeType: "text/typescript",
    description: "Retrying health probe for Streamable HTTP MCP endpoints.",
  },
  {
    id: "dashboard",
    title: "Official Example Dashboard",
    path: "dashboards/solana_mcp.example.lvdash.json",
    mimeType: "application/json",
    description: "Example Lakeview dashboard for official MCP analytics.",
  },
];

let cachedSources: OfficialSolanaSource[] | null = null;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter(Boolean);
}

function normalizeSource(raw: Partial<OfficialSolanaSource>): OfficialSolanaSource | null {
  if (!raw.id || !raw.name || !raw.primaryUrl) return null;
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind ?? "web",
    enabled: raw.enabled ?? false,
    sections: raw.sections ?? [],
    useCases: raw.useCases ?? "",
    primaryUrl: raw.primaryUrl,
  };
}

export async function getOfficialSolanaSources(): Promise<OfficialSolanaSource[]> {
  if (cachedSources) return cachedSources;

  const yaml = await fs.readFile(SOURCES_YAML, "utf-8");
  const sources: OfficialSolanaSource[] = [];
  let current: Partial<OfficialSolanaSource> | null = null;

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- id:")) {
      const source = current ? normalizeSource(current) : null;
      if (source) sources.push(source);
      current = { id: unquote(trimmed.slice("- id:".length)) };
      continue;
    }

    if (!current) continue;
    const idx = trimmed.indexOf(":");
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1).trim();
    if (key === "name") current.name = unquote(value);
    if (key === "kind") current.kind = unquote(value);
    if (key === "enabled") current.enabled = value === "true";
    if (key === "sections") current.sections = parseList(value);
    if (key === "use_cases") current.useCases = unquote(value);
    if (key === "primary_url") current.primaryUrl = unquote(value);
  }

  const source = current ? normalizeSource(current) : null;
  if (source) sources.push(source);
  cachedSources = sources;
  return sources;
}

export function getOfficialSolanaAssets(): OfficialSolanaAsset[] {
  return ASSETS;
}

export async function readOfficialSolanaAsset(assetId: string): Promise<OfficialSolanaAsset & { text: string }> {
  const asset = ASSETS.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error(`Unknown official Solana MCP asset: ${assetId}`);
  }
  const text = await fs.readFile(path.join(OFFICIAL_ROOT, asset.path), "utf-8");
  return { ...asset, text };
}

export async function listOfficialSolanaSections(): Promise<string> {
  const sources = await getOfficialSolanaSources();
  const enabled = sources.filter((source) => source.enabled);
  const sectionMap = new Map<string, OfficialSolanaSource[]>();

  for (const source of enabled) {
    for (const section of source.sections) {
      const items = sectionMap.get(section) ?? [];
      items.push(source);
      sectionMap.set(section, items);
    }
  }

  const lines = [
    "# Official Solana MCP Source Index",
    "",
    `Enabled sources: ${enabled.length}`,
    `Total sources: ${sources.length}`,
    "",
    "## Sections",
    "",
  ];

  for (const [section, items] of [...sectionMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`### ${section}`);
    for (const source of items) {
      lines.push(`- ${source.id} - ${source.name}`);
      lines.push(`  use_cases: ${source.useCases}`);
      lines.push(`  primary: ${source.primaryUrl}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function searchOfficialSolanaSources(query: string, limit = 10): Promise<OfficialSolanaSource[]> {
  const q = query.toLowerCase();
  const sources = await getOfficialSolanaSources();
  const scored = sources
    .map((source) => {
      let score = 0;
      if (source.id.toLowerCase().includes(q)) score += 30;
      if (source.name.toLowerCase().includes(q)) score += 25;
      if (source.sections.some((section) => section.toLowerCase().includes(q))) score += 20;
      if (source.useCases.toLowerCase().includes(q)) score += 15;
      if (source.primaryUrl.toLowerCase().includes(q)) score += 5;
      return { source, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((item) => item.source);
}
