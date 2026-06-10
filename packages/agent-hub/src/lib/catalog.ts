import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { resolveWorkspaceRoot } from "./workspace.js";

export interface AgentTemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  avatar: string;
  paymentEnabled: boolean;
  protocols: string[];
  createdAt?: string;
  sourcePath: string;
}

export interface CharacterSummary {
  id: string;
  name: string;
  bio: string[];
  topics: string[];
  adjectives: string[];
  lore: string[];
  style: Record<string, unknown>;
  walletEndpoint?: string;
  sourcePath: string;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadSnapshot(): { templates: AgentTemplateSummary[]; characters: CharacterSummary[] } | null {
  const root = resolveWorkspaceRoot();
  const candidates = [
    join(root, "packages", "agent-hub", "public", "data", "spawn-snapshot.json"),
    join(root, "public", "data", "spawn-snapshot.json"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const snapshot = safeJsonParse<{
      templates?: AgentTemplateSummary[];
      characters?: CharacterSummary[];
    }>(readFileSync(file, "utf8"));
    if (snapshot?.templates && snapshot?.characters) {
      return { templates: snapshot.templates, characters: snapshot.characters };
    }
  }

  return null;
}

export function loadAgentTemplates(): AgentTemplateSummary[] {
  const root = resolveWorkspaceRoot();
  const dir = join(root, "agents", "src");
  if (!existsSync(dir)) {
    return loadSnapshot()?.templates ?? [];
  }
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  const templates: AgentTemplateSummary[] = [];

  for (const file of files) {
      const sourcePath = join(dir, file);
      const json = safeJsonParse<Record<string, any>>(readFileSync(sourcePath, "utf8"));
      if (!json) continue;

      templates.push({
        id: String(json.identifier ?? file.replace(/\.json$/, "")),
        name: String(json.meta?.title ?? json.identifier ?? file.replace(/\.json$/, "")),
        description: String(json.meta?.description ?? json.summary ?? "No description provided."),
        category: String(json.meta?.category ?? "uncategorized"),
        tags: Array.isArray(json.meta?.tags) ? json.meta.tags.map(String) : [],
        avatar: String(json.meta?.avatar ?? "🦞"),
        paymentEnabled: Boolean(json.config?.payment?.enabled),
        protocols: Array.isArray(json.config?.payment?.protocols)
          ? json.config.payment.protocols.map(String)
          : [],
        createdAt: typeof json.createdAt === "string" ? json.createdAt : undefined,
        sourcePath,
      });
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadCharacters(): CharacterSummary[] {
  const root = resolveWorkspaceRoot();
  const dirs = [join(root, "agents", "characters"), join(root, "characters")].filter((dir) =>
    existsSync(dir)
  );
  if (dirs.length === 0) {
    return loadSnapshot()?.characters ?? [];
  }

  const characters: CharacterSummary[] = [];

  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".json") && entry !== "package.json")) {
      const sourcePath = join(dir, file);
      const json = safeJsonParse<Record<string, any>>(readFileSync(sourcePath, "utf8"));
      if (!json) continue;

      const vaultService = Array.isArray(json.services)
        ? json.services.find((service) => service?.name === "vault")
        : undefined;

      characters.push({
        id: file.replace(/\.json$/, ""),
        name: String(json.name ?? file.replace(/\.json$/, "")),
        bio: Array.isArray(json.bio) ? json.bio.map(String) : [],
        topics: Array.isArray(json.topics) ? json.topics.map(String) : [],
        adjectives: Array.isArray(json.adjectives) ? json.adjectives.map(String) : [],
        lore: Array.isArray(json.lore) ? json.lore.map(String) : [],
        style: typeof json.style === "object" && json.style ? json.style : {},
        walletEndpoint: typeof vaultService?.endpoint === "string" ? vaultService.endpoint : undefined,
        sourcePath,
      });
    }
  }

  return characters
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
    .sort((a, b) => a.name.localeCompare(b.name));
}
