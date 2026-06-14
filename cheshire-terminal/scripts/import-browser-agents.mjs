import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = process.env.CHESHIRETERMINAL_ROOT
  ? path.resolve(process.env.CHESHIRETERMINAL_ROOT)
  : path.resolve(scriptDir, "..");
const SOURCE_ROOT = process.env.BROWSER_AGENTS_ROOT
  ? path.resolve(process.env.BROWSER_AGENTS_ROOT)
  : path.resolve(APP_ROOT, "../browser/agents");
const PUBLIC_APP_ROOT = process.env.CHESHIRETERMINAL_PUBLIC_ROOT || "cheshireterminal";
const PUBLIC_SOURCE_ROOT = process.env.BROWSER_AGENTS_PUBLIC_ROOT || "browser-agents";
const SOURCE_SRC = path.join(SOURCE_ROOT, "src");
const SOURCE_CATALOG = path.join(SOURCE_ROOT, "agents-catalog.json");
const SOURCE_CHARACTERS = path.join(SOURCE_ROOT, "characters");
const SOURCE_TEMPLATES_DIR = path.join(SOURCE_ROOT, "templates");
const SOURCE_SKILLS_DIR = path.join(SOURCE_ROOT, "skills");
const SOURCE_DOCS_DIR = path.join(SOURCE_ROOT, "docs");
const SOURCE_LOCALES_DIR = path.join(SOURCE_ROOT, "locales");
const SOURCE_WELL_KNOWN_DIR = path.join(SOURCE_ROOT, ".well-known");
const SOURCE_PUBLIC_WELL_KNOWN_DIR = path.join(SOURCE_ROOT, "public", ".well-known");
const SOURCE_SCHEMA_DIR = path.join(SOURCE_ROOT, "schema");
const SOURCE_SCRIPTS_DIR = path.join(SOURCE_ROOT, "scripts");
const SOURCE_PUBLIC_DIR = path.join(SOURCE_ROOT, "public");
const SOURCE_CURSOR_DIR = path.join(SOURCE_ROOT, ".cursor");

const OUTPUT_FILE = path.join(APP_ROOT, "server/lib/clawd/browser-agents.generated.json");

const curatedStarterIds = [
  "solana-pumpfun-bot",
  "solana-vulcan-clawd-autonomous-perps",
  "solana-clawd-wallet-guardian",
  "solana-openclawd-orchestrator",
  "solana-helius-specialist",
  "solana-nemoclawd-yield-treasurer",
  "solana-x402-research-broker",
  "solana-clawd-payment-gateway",
];

const topLevelTemplates = [
  "agent-template.json",
  "agent-template-full.json",
  "agent-template-attested.json",
  "vault-agent.json",
];

const subprojectDescriptors = [
  ["agent-minter", "Agent Minter", "rust-workspace"],
  ["Agent-Staking_Unstaking_solana_metaplex_core", "Agent Staking / Unstaking", "anchor-program"],
  ["clawd-agents-perps", "Clawd Agents Perps", "frontend"],
  ["cloudflare-agent-api", "Cloudflare Agent API", "edge-api"],
  ["defi-agents", "DeFi Agents", "catalog-fork"],
  ["plugin.delivery", "Plugin Delivery", "plugin-index"],
  ["solana-gpt-oracle", "Solana GPT Oracle", "solana-program"],
  ["solana-pumpfun-bot-master", "Solana PumpFun Bot", "rust-bot"],
  ["lobster-council", "Lobster Council", "persona-pack"],
];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function maybeLoad(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function tryLoadJson(file) {
  try {
    return loadJson(file);
  } catch (error) {
    console.warn(`[import-browser-agents] skipping invalid JSON: ${file}`);
    return null;
  }
}

function uniqueStrings(values) {
  return Array.from(new Set((values ?? []).filter(Boolean)));
}

function summarizeText(raw, maxLines = 6) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("```"))
    .slice(0, maxLines)
    .join("\n");
}

function normalizeAgent(raw, catalogEntry) {
  const capabilities = uniqueStrings([
    ...(raw.capabilities ?? []),
    ...(raw.solana?.capabilities ?? []),
  ]);

  const metaplexSkills = uniqueStrings([
    ...(raw.metaplexSkills ?? []),
    ...(raw.solana?.metaplexSkills ?? []),
  ]);

  const vulcanSkills = uniqueStrings(raw.solana?.vulcanSkills ?? []);
  const skillPaths = uniqueStrings(raw.solana?.skillPaths ?? []);

  return {
    id: raw.identifier,
    title: raw.meta?.title ?? raw.identifier,
    description: raw.meta?.description ?? "",
    category: raw.meta?.category ?? "trading",
    avatar: raw.meta?.avatar ?? "🤖",
    tags: uniqueStrings(raw.meta?.tags ?? []),
    featured: Boolean(raw.featured || raw.meta?.featured),
    oneShot: Boolean(raw.oneShot),
    tokenUsage: raw.tokenUsage ?? null,
    openingMessage: raw.config?.openingMessage ?? "",
    openingQuestions: raw.config?.openingQuestions ?? [],
    persona: raw.config?.systemRole ?? "",
    capabilities,
    metaplexSkills,
    vulcanSkills,
    skillPaths,
    source: {
      repoRoot: SOURCE_ROOT,
      file: path.join(SOURCE_SRC, `${raw.identifier}.json`),
      homepage: raw.homepage ?? "",
      author: raw.author ?? "",
      createdAt: raw.createdAt ?? "",
      deploy: catalogEntry?.deploy ?? null,
    },
  };
}

function normalizeAgentWithLocale(raw, catalogEntry, localeEntry) {
  const agent = normalizeAgent(raw, catalogEntry);
  return {
    ...agent,
    localeCoverage: localeEntry
      ? {
          localeCount: localeEntry.localeCount,
          locales: localeEntry.locales,
          defaultTitle: localeEntry.defaultTitle,
          defaultDescription: localeEntry.defaultDescription,
        }
      : null,
  };
}

function normalizeTemplate(filename, raw) {
  return {
    id: filename.replace(/\.json$/, ""),
    filename,
    description:
      raw.description ??
      raw.meta?.description ??
      raw.metadata?.category ??
      "",
    raw,
  };
}

function normalizeCharacter(filename, raw) {
  return {
    id: filename.replace(/\.json$/, ""),
    name: raw.name ?? filename.replace(/\.json$/, ""),
    bio: raw.bio ?? [],
    lore: raw.lore ?? [],
    adjectives: raw.adjectives ?? [],
    topics: raw.topics ?? [],
    style: raw.style ?? {},
  };
}

function normalizeSkill(dirName, rawText) {
  const lines = rawText.split("\n");
  const titleLine = lines.find((line) => line.startsWith("# "));
  const descriptionLine = lines.find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("---"));
  return {
    id: dirName,
    title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : dirName,
    summary: (descriptionLine ?? "").trim(),
    file: path.join(SOURCE_SKILLS_DIR, dirName, "SKILL.md"),
  };
}

function normalizeDoc(filename, rawText) {
  const lines = rawText.split("\n");
  const titleLine = lines.find((line) => line.startsWith("# "));
  return {
    id: filename.replace(/\.[^.]+$/, "").toLowerCase(),
    filename,
    title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : filename,
    summary: summarizeText(rawText, 5),
    file: path.join(SOURCE_DOCS_DIR, filename),
  };
}

function normalizeLocale(dirName) {
  const dir = path.join(SOURCE_LOCALES_DIR, dirName);
  const files = fs.readdirSync(dir).filter((filename) => filename.endsWith(".json"));
  const locales = files
    .map((filename) => {
      const match = filename.match(/^index(?:\.([^.]+))?\.json$/);
      return match ? match[1] ?? "default" : null;
    })
    .filter(Boolean);

  const baseFile = path.join(dir, "index.json");
  const base = fs.existsSync(baseFile) ? tryLoadJson(baseFile) : null;

  return {
    id: dirName,
    localeCount: locales.length,
    locales,
    defaultTitle: base?.meta?.title ?? dirName,
    defaultDescription: base?.meta?.description ?? "",
    openingMessage: base?.config?.openingMessage ?? "",
    openingQuestions: base?.config?.openingQuestions ?? [],
    fileCount: files.length,
    baseFile,
  };
}

function normalizeWellKnown(scope, filename, raw) {
  return {
    id: `${scope}:${filename.replace(/\.json$/, "")}`,
    scope,
    filename,
    summary:
      raw?.name_for_human ||
      raw?.name ||
      raw?.schemaVersion ||
      raw?.protocol ||
      filename,
    raw,
  };
}

function normalizeSubproject(dirName, title, kind) {
  const root = path.join(SOURCE_ROOT, dirName);
  const packageJson = fs.existsSync(path.join(root, "package.json"))
    ? tryLoadJson(path.join(root, "package.json"))
    : null;
  const readmeText = ["README.md", "README.zh-CN.md"]
    .map((filename) => path.join(root, filename))
    .find((filename) => fs.existsSync(filename));
  const summary = readmeText
    ? summarizeText(fs.readFileSync(readmeText, "utf8"), 8)
    : packageJson?.description || `${title} imported from browser-agents.`;

  return {
    id: dirName,
    title,
    kind,
    path: root,
    packageName: packageJson?.name ?? null,
    homepage: packageJson?.homepage ?? packageJson?.repository?.url ?? "",
    summary,
  };
}

function normalizeRepoAsset(scope, filename, filePath) {
  const rawText = maybeLoad(filePath);
  return {
    id: `${scope}:${filename.replace(/\.[^.]+$/, "").toLowerCase()}`,
    scope,
    filename,
    file: filePath,
    summary: summarizeText(rawText || filename, 6),
  };
}

function sanitizeGeneratedValue(value) {
  if (typeof value === "string") {
    return value
      .split(SOURCE_ROOT).join(PUBLIC_SOURCE_ROOT)
      .split(APP_ROOT).join(PUBLIC_APP_ROOT);
  }
  if (Array.isArray(value)) return value.map(sanitizeGeneratedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeGeneratedValue(item)]),
    );
  }
  return value;
}

const locales = fs.existsSync(SOURCE_LOCALES_DIR)
  ? fs.readdirSync(SOURCE_LOCALES_DIR)
      .filter((entry) => fs.statSync(path.join(SOURCE_LOCALES_DIR, entry)).isDirectory())
      .map((entry) => normalizeLocale(entry))
  : [];

const localeById = new Map(locales.map((entry) => [entry.id, entry]));

const catalog = loadJson(SOURCE_CATALOG);
const catalogEntries = catalog.agents ?? [];
const catalogById = new Map(catalogEntries.map((agent) => [agent.identifier, agent]));

const agents = catalogEntries
  .map((entry) => {
    const sourceFile = path.join(SOURCE_SRC, `${entry.identifier}.json`);
    if (!fs.existsSync(sourceFile)) return null;
    const raw = loadJson(sourceFile);
    return normalizeAgentWithLocale(raw, entry, localeById.get(entry.identifier) ?? null);
  })
  .filter(Boolean);

const templates = topLevelTemplates
  .filter((filename) => fs.existsSync(path.join(SOURCE_ROOT, filename)))
  .map((filename) => normalizeTemplate(filename, loadJson(path.join(SOURCE_ROOT, filename))));

const browserTemplates = fs.existsSync(SOURCE_TEMPLATES_DIR)
  ? fs.readdirSync(SOURCE_TEMPLATES_DIR)
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) => {
        const raw = tryLoadJson(path.join(SOURCE_TEMPLATES_DIR, filename));
        return raw ? normalizeTemplate(filename, raw) : null;
      })
      .filter(Boolean)
  : [];

const characters = fs.existsSync(SOURCE_CHARACTERS)
  ? fs.readdirSync(SOURCE_CHARACTERS)
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) => {
        const raw = tryLoadJson(path.join(SOURCE_CHARACTERS, filename));
        return raw ? normalizeCharacter(filename, raw) : null;
      })
      .filter(Boolean)
  : [];

const skills = fs.existsSync(SOURCE_SKILLS_DIR)
  ? fs.readdirSync(SOURCE_SKILLS_DIR)
      .filter((entry) => fs.existsSync(path.join(SOURCE_SKILLS_DIR, entry, "SKILL.md")))
      .map((entry) => normalizeSkill(entry, maybeLoad(path.join(SOURCE_SKILLS_DIR, entry, "SKILL.md"))))
  : [];

const docs = fs.existsSync(SOURCE_DOCS_DIR)
  ? fs.readdirSync(SOURCE_DOCS_DIR)
      .filter((filename) => /\.(md|cjs)$/i.test(filename))
      .map((filename) => normalizeDoc(filename, maybeLoad(path.join(SOURCE_DOCS_DIR, filename))))
  : [];

const wellKnown = [
  fs.existsSync(SOURCE_WELL_KNOWN_DIR)
    ? fs.readdirSync(SOURCE_WELL_KNOWN_DIR)
        .filter((filename) => filename.endsWith(".json"))
        .map((filename) => normalizeWellKnown("root", filename, tryLoadJson(path.join(SOURCE_WELL_KNOWN_DIR, filename))))
        .filter(Boolean)
    : [],
  fs.existsSync(SOURCE_PUBLIC_WELL_KNOWN_DIR)
    ? fs.readdirSync(SOURCE_PUBLIC_WELL_KNOWN_DIR)
        .filter((filename) => filename.endsWith(".json"))
        .map((filename) => normalizeWellKnown("public", filename, tryLoadJson(path.join(SOURCE_PUBLIC_WELL_KNOWN_DIR, filename))))
        .filter(Boolean)
    : [],
].flat();

const schemaAssets = fs.existsSync(SOURCE_SCHEMA_DIR)
  ? fs.readdirSync(SOURCE_SCHEMA_DIR)
      .filter((filename) => /\.(json|ts|js|md|sql)$/i.test(filename))
      .map((filename) => normalizeRepoAsset("schema", filename, path.join(SOURCE_SCHEMA_DIR, filename)))
  : [];

const scriptAssets = fs.existsSync(SOURCE_SCRIPTS_DIR)
  ? fs.readdirSync(SOURCE_SCRIPTS_DIR)
      .filter((filename) => /\.(js|mjs|cjs|ts|sh|md)$/i.test(filename))
      .map((filename) => normalizeRepoAsset("scripts", filename, path.join(SOURCE_SCRIPTS_DIR, filename)))
  : [];

const publicAssets = fs.existsSync(SOURCE_PUBLIC_DIR)
  ? fs.readdirSync(SOURCE_PUBLIC_DIR)
      .filter((filename) => filename !== ".well-known")
      .filter((filename) => fs.statSync(path.join(SOURCE_PUBLIC_DIR, filename)).isFile())
      .map((filename) => normalizeRepoAsset("public", filename, path.join(SOURCE_PUBLIC_DIR, filename)))
  : [];

const cursorAssets = fs.existsSync(SOURCE_CURSOR_DIR)
  ? fs.readdirSync(SOURCE_CURSOR_DIR)
      .filter((filename) => fs.statSync(path.join(SOURCE_CURSOR_DIR, filename)).isFile())
      .map((filename) => normalizeRepoAsset(".cursor", filename, path.join(SOURCE_CURSOR_DIR, filename)))
  : [];

const rootAssetFiles = [
  "AGENTS.md",
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "LICENSE",
  "CODE_OF_CONDUCT.md",
  "CITATION.cff",
  "humans.txt",
  "CNAME",
  "package.json",
  "bun.lock",
  ".editorconfig",
  ".eslintrc.cjs",
  ".gitattributes",
  ".gitignore",
  ".i18nignore",
  ".i18nrc.js",
  ".npmrc",
  ".releaserc.cjs",
  ".vercel-deploy",
];

const rootAssets = rootAssetFiles
  .filter((filename) => fs.existsSync(path.join(SOURCE_ROOT, filename)))
  .map((filename) => normalizeRepoAsset("root", filename, path.join(SOURCE_ROOT, filename)));

const projects = subprojectDescriptors
  .filter(([dirName]) => fs.existsSync(path.join(SOURCE_ROOT, dirName)))
  .map(([dirName, title, kind]) => normalizeSubproject(dirName, title, kind));

const starters = curatedStarterIds
  .map((id) => agents.find((agent) => agent.id === id))
  .filter(Boolean);

const payload = {
  importedAt: new Date().toISOString(),
  sourceRoot: SOURCE_ROOT,
  catalogMeta: {
    apiVersion: catalog.apiVersion ?? "",
    generatedAt: catalog.generatedAt ?? "",
    stats: catalog.stats ?? {},
    categories: catalog.categories ?? [],
    deployPaths: catalog.deployPaths ?? [],
    hub: catalog.hub ?? {},
    metaplexSkill: catalog.metaplexSkill ?? {},
  },
  manifest: tryLoadJson(path.join(SOURCE_ROOT, "agents-manifest.json")) ?? {},
  meta: tryLoadJson(path.join(SOURCE_ROOT, "meta.json")) ?? {},
  clawd: tryLoadJson(path.join(SOURCE_ROOT, "clawd.json")) ?? {},
  starters: {
    ids: curatedStarterIds,
    count: starters.length,
    agents: starters,
  },
  templates,
  browserTemplates,
  characters,
  skills,
  docs,
  locales,
  wellKnown,
  repoAssets: {
    schema: schemaAssets,
    scripts: scriptAssets,
    public: publicAssets,
    cursor: cursorAssets,
    root: rootAssets,
  },
  projects,
  agents,
};

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(sanitizeGeneratedValue(payload), null, 2)}\n`);
console.log(
  `Wrote ${agents.length} agents, ${starters.length} starters, ${templates.length} top-level templates, ${browserTemplates.length} browser templates, ${characters.length} characters, ${skills.length} skills, ${docs.length} docs, ${locales.length} locales, ${wellKnown.length} well-known records, ${schemaAssets.length} schema assets, ${scriptAssets.length} script assets, ${publicAssets.length} public assets, ${cursorAssets.length} cursor assets, ${rootAssets.length} root assets, and ${projects.length} subprojects to ${OUTPUT_FILE}`,
);
