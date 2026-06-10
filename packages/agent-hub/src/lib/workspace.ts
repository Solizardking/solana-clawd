import { existsSync } from "fs";
import { dirname, join, resolve } from "path";

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(join(dir, "agents", "src")) && existsSync(join(dir, "agents", "characters"));
}

export function resolveWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start);

  while (true) {
    if (isWorkspaceRoot(current)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return resolve(process.cwd());
}

export function resolveHubDataDir(): string {
  return join(resolveWorkspaceRoot(), ".spawn");
}
