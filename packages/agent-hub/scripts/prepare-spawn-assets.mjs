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

const packageRoot = resolve(process.cwd());
const workspaceRoot = findWorkspaceRoot(packageRoot);
const publicDir = join(packageRoot, "public");
const dataDir = join(publicDir, "data");
mkdirSync(dataDir, { recursive: true });

const templates = readJsonFiles(join(workspaceRoot, "agents", "src"))
  .map(({ file, data }) => summarizeTemplate(file, data))
  .sort((a, b) => a.name.localeCompare(b.name));

const characters = [
  ...readJsonFiles(join(workspaceRoot, "agents", "characters")),
  ...readJsonFiles(join(workspaceRoot, "characters")),
]
  .map(({ file, data }) => summarizeCharacter(file, data))
  .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  join(dataDir, "spawn-snapshot.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), templates, characters }, null, 2)
);

const runtimeSource = join(workspaceRoot, "dist-web");
const runtimeTarget = join(publicDir, "runtime");
if (existsSync(runtimeSource)) {
  rmSync(runtimeTarget, { recursive: true, force: true });
  cpSync(runtimeSource, runtimeTarget, { recursive: true });
}
