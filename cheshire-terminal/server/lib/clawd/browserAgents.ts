import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BrowserAgent {
  id: string;
  title: string;
  description: string;
  category: string;
  avatar: string;
  tags: string[];
  featured: boolean;
  oneShot: boolean;
  tokenUsage: number | null;
  openingMessage: string;
  openingQuestions: string[];
  persona: string;
  capabilities: string[];
  metaplexSkills: string[];
  vulcanSkills: string[];
  skillPaths: string[];
  localeCoverage: {
    localeCount: number;
    locales: string[];
    defaultTitle: string;
    defaultDescription: string;
  } | null;
  source: {
    repoRoot: string;
    file: string;
    homepage: string;
    author: string;
    createdAt: string;
    deploy: Record<string, unknown> | null;
  };
}

export interface BrowserAgentTemplate {
  id: string;
  filename: string;
  description: string;
  raw: Record<string, unknown>;
}

export interface BrowserAgentCharacter {
  id: string;
  name: string;
  bio: string[];
  lore: string[];
  adjectives: string[];
  topics: string[];
  style: Record<string, unknown>;
}

export interface BrowserAgentSkill {
  id: string;
  title: string;
  summary: string;
  file: string;
}

export interface BrowserAgentProject {
  id: string;
  title: string;
  kind: string;
  path: string;
  packageName: string | null;
  homepage: string;
  summary: string;
}

export interface BrowserAgentDoc {
  id: string;
  filename: string;
  title: string;
  summary: string;
  file: string;
}

export interface BrowserAgentLocale {
  id: string;
  localeCount: number;
  locales: string[];
  defaultTitle: string;
  defaultDescription: string;
  openingMessage: string;
  openingQuestions: string[];
  fileCount: number;
  baseFile: string;
}

export interface BrowserAgentWellKnown {
  id: string;
  scope: string;
  filename: string;
  summary: string;
  raw: Record<string, unknown> | null;
}

export interface BrowserAgentRepoAsset {
  id: string;
  scope: string;
  filename: string;
  file: string;
  summary: string;
}

interface BrowserAgentsPayload {
  importedAt: string;
  sourceRoot: string;
  catalogMeta: {
    apiVersion: string;
    generatedAt: string;
    stats: Record<string, unknown>;
    categories: Array<Record<string, unknown>>;
    deployPaths: Array<Record<string, unknown>>;
    hub: Record<string, unknown>;
    metaplexSkill: Record<string, unknown>;
  };
  manifest: Record<string, unknown>;
  meta: Record<string, unknown>;
  clawd: Record<string, unknown>;
  starters: {
    ids: string[];
    count: number;
    agents: BrowserAgent[];
  };
  templates: BrowserAgentTemplate[];
  browserTemplates: BrowserAgentTemplate[];
  characters: BrowserAgentCharacter[];
  skills: BrowserAgentSkill[];
  docs: BrowserAgentDoc[];
  locales: BrowserAgentLocale[];
  wellKnown: BrowserAgentWellKnown[];
  repoAssets: {
    schema: BrowserAgentRepoAsset[];
    scripts: BrowserAgentRepoAsset[];
    public: BrowserAgentRepoAsset[];
    cursor: BrowserAgentRepoAsset[];
    root: BrowserAgentRepoAsset[];
  };
  projects: BrowserAgentProject[];
  agents: BrowserAgent[];
}

let cache: BrowserAgentsPayload | null = null;

export function loadBrowserAgents(): BrowserAgentsPayload {
  if (cache) return cache;
  const file = path.join(__dirname, "browser-agents.generated.json");
  if (!fs.existsSync(file)) {
    cache = {
      importedAt: "",
      sourceRoot: "",
      catalogMeta: {
        generatedAt: "",
        apiVersion: "",
        stats: {},
        categories: [],
        deployPaths: [],
        hub: {},
        metaplexSkill: {},
      },
      manifest: {},
      meta: {},
      clawd: {},
      starters: {
        ids: [],
        count: 0,
        agents: [],
      },
      templates: [],
      browserTemplates: [],
      characters: [],
      skills: [],
      docs: [],
      locales: [],
      wellKnown: [],
      repoAssets: {
        schema: [],
        scripts: [],
        public: [],
        cursor: [],
        root: [],
      },
      projects: [],
      agents: [],
    };
    return cache;
  }
  cache = JSON.parse(fs.readFileSync(file, "utf8")) as BrowserAgentsPayload;
  return cache;
}

export function getBrowserAgent(id: string): BrowserAgent | null {
  return loadBrowserAgents().agents.find((agent) => agent.id === id) ?? null;
}

export function getBrowserAgentTemplate(id: string): BrowserAgentTemplate | null {
  return loadBrowserAgents().templates.find((template) => template.id === id) ?? null;
}

export function getBrowserCharacter(id: string): BrowserAgentCharacter | null {
  return loadBrowserAgents().characters.find((character) => character.id === id) ?? null;
}

export function getBrowserTemplate(id: string): BrowserAgentTemplate | null {
  return loadBrowserAgents().browserTemplates.find((template) => template.id === id) ?? null;
}

export function getBrowserLocale(id: string): BrowserAgentLocale | null {
  return loadBrowserAgents().locales.find((locale) => locale.id === id) ?? null;
}
