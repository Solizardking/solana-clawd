import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VULCAN_CATALOG_PATH = join("vulcan-cli-master", "agents", "tool-catalog.json");

function hasVulcanCatalog(candidateRoot: string): boolean {
  return existsSync(join(candidateRoot, VULCAN_CATALOG_PATH));
}

export function resolveVulcanRoot(repoRoot: string): string {
  let current = resolve(repoRoot);

  while (true) {
    const candidates = [current, join(current, "src")];
    const root = candidates.find(hasVulcanCatalog);
    if (root) {
      return root;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(repoRoot);
    }
    current = parent;
  }
}

function walkUpForRepoRoot(startPath: string): string | undefined {
  let current = resolve(startPath);

  while (true) {
    if (hasVulcanCatalog(current)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function resolveClawdRepoRoot(startPath = process.cwd(), moduleUrl?: string): string {
  if (process.env.CLAWD_REPO_ROOT) {
    return resolve(process.env.CLAWD_REPO_ROOT);
  }

  const candidates = [startPath];
  if (moduleUrl) {
    candidates.push(dirname(fileURLToPath(moduleUrl)));
  }

  for (const candidate of candidates) {
    const root = walkUpForRepoRoot(candidate);
    if (root) {
      return root;
    }
  }

  return resolve(startPath);
}
