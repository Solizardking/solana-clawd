import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findWorkspaceRoot(start) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "agents", "src")) && existsSync(join(current, "characters"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }
    current = parent;
  }
}

function readJsonFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== "package.json")
    .flatMap((file) => {
      try {
        return [{ file, data: JSON.parse(readFileSync(join(dir, file), "utf8")) }];
      } catch {
        return [];
      }
    });
}

function summarizeTemplate(file, data) {
  return {
    id: String(data.identifier ?? file.replace(/\.json$/, "")),
    name: String(data.meta?.title ?? data.identifier ?? file.replace(/\.json$/, "")),
    description: String(data.meta?.description ?? data.summary ?? "No description provided."),
    category: String(data.meta?.category ?? "uncategorized"),
    tags: Array.isArray(data.meta?.tags) ? data.meta.tags.map(String) : [],
    avatar: String(data.meta?.avatar ?? "CLAWD"),
    paymentEnabled: Boolean(data.config?.payment?.enabled),
    protocols: Array.isArray(data.config?.payment?.protocols) ? data.config.payment.protocols.map(String) : [],
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    sourcePath: `snapshot:${file}`,
  };
}

function summarizeCharacter(file, data) {
  const vaultService = Array.isArray(data.services)
    ? data.services.find((service) => service?.name === "vault")
    : undefined;

  return {
    id: file.replace(/\.json$/, ""),
    name: String(data.name ?? file.replace(/\.json$/, "")),
    bio: Array.isArray(data.bio) ? data.bio.map(String) : [],
    topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
    adjectives: Array.isArray(data.adjectives) ? data.adjectives.map(String) : [],
    lore: Array.isArray(data.lore) ? data.lore.map(String) : [],
    style: typeof data.style === "object" && data.style ? data.style : {},
    walletEndpoint: typeof vaultService?.endpoint === "string" ? vaultService.endpoint : undefined,
    sourcePath: `snapshot:${file}`,
  };
}

const MODULES = [
  { id: "knowledge", name: "Knowledge", path: "knowledge", description: "Knowledge packs, source material, and indexed operator context.", kind: "knowledge" },
  { id: "library", name: "Library", path: "library", description: "OpenClawd library assets and runtime-facing packaged surfaces.", kind: "package" },
  { id: "hedge", name: "Hedge", path: "hedge", description: "Hedge strategy manifests and portfolio system assets.", kind: "runtime" },
  { id: "goals", name: "Goals", path: "goals", description: "Goal tracking UX and runtime goal surfaces.", kind: "runtime" },
  { id: "gateway", name: "Gateway", path: "gateway", description: "HTTP and Telegram gateway services for the agent stack.", kind: "runtime" },
  { id: "formal-verification", name: "Formal Verification", path: "formal_verification", description: "Formal methods and verification support for Solana agent safety.", kind: "protocol" },
  { id: "packages", name: "Packages", path: "packages", description: "Monorepo packages including hub, wallet, registry, SDK, and agent tooling.", kind: "package" },
  { id: "programs", name: "Programs", path: "programs", description: "On-chain Solana programs and clients.", kind: "protocol" },
  { id: "skills", name: "Skills", path: "skills", description: "Composable agent skills used across spawn templates and operator flows.", kind: "knowledge" },
  { id: "spinners", name: "Spinners", path: "spinners", description: "UX and launch animation surfaces for operator-facing flows.", kind: "runtime" },
  { id: "staking", name: "Staking", path: "staking", description: "Agent staking protocol, lock state, and lifecycle economics.", kind: "protocol" },
  { id: "src", name: "Core Src", path: "src", description: "Primary OpenClawd source tree for runtime and services.", kind: "runtime" },
];

function countEntries(absPath) {
  if (!existsSync(absPath)) {
    return 0;
  }

  try {
    return readdirSync(absPath).length;
  } catch {
    return 0;
  }
}

function summarizeModules(root) {
  return MODULES.map((module) => {
    const absPath = join(root, module.path);
    return {
      ...module,
      exists: existsSync(absPath),
      entries: countEntries(absPath),
    };
  });
}

const packageRoot = resolve(process.cwd());
const workspaceRoot = findWorkspaceRoot(packageRoot);
const publicDir = join(packageRoot, "public");
const dataDir = join(publicDir, "data");
mkdirSync(dataDir, { recursive: true });

// On Vercel only the package directory is uploaded; skip regenerating the snapshot
// so the pre-built committed version is preserved.
const agentsSrcDir = join(workspaceRoot, "agents", "src");
if (!existsSync(agentsSrcDir)) {
  console.log("agents/src not found — skipping snapshot regeneration (using committed snapshot).");
  process.exit(0);
}

const templates = [
  ...readJsonFiles(join(workspaceRoot, "agents", "src")),
  ...readJsonFiles(join(workspaceRoot, "box", "agents")),
]
  .map(({ file, data }) => summarizeTemplate(file, data))
  .filter((entry, index, all) => all.findIndex((t) => t.id === entry.id) === index)
  .sort((a, b) => a.name.localeCompare(b.name));

const characters = [
  ...readJsonFiles(join(workspaceRoot, "agents", "characters")),
  ...readJsonFiles(join(workspaceRoot, "characters")),
]
  .map(({ file, data }) => summarizeCharacter(file, data))
  .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
  .sort((a, b) => a.name.localeCompare(b.name));

const modules = summarizeModules(workspaceRoot);

writeFileSync(
  join(dataDir, "spawn-snapshot.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), templates, characters, modules }, null, 2)
);

const runtimeSource = join(workspaceRoot, "dist-web");
const runtimeTarget = join(publicDir, "runtime");
if (existsSync(runtimeSource)) {
  rmSync(runtimeTarget, { recursive: true, force: true });
  cpSync(runtimeSource, runtimeTarget, { recursive: true });
}
