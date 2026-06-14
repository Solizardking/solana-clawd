import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { resolveClawdRepoRoot } from "./paths.js";

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))];
}

function applyEnvFile(path: string, protectedKeys: Set<string>): void {
  if (!existsSync(path)) {
    return;
  }

  const parsed = parse(readFileSync(path));
  for (const [key, value] of Object.entries(parsed)) {
    if (!value) {
      continue;
    }
    if (!protectedKeys.has(key)) {
      process.env[key] = value;
    }
  }
}

export function loadClawdPerpsEnv(moduleUrl?: string): void {
  const protectedKeys = new Set(
    Object.entries(process.env)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key),
  );
  const repoRoot = resolveClawdRepoRoot(process.cwd(), moduleUrl);
  const moduleDir = moduleUrl ? dirname(fileURLToPath(moduleUrl)) : process.cwd();
  const packageRoot = resolve(moduleDir, "..");

  for (const path of uniquePaths([
    join(repoRoot, ".env"),
    join(repoRoot, ".env.local"),
    join(packageRoot, ".env"),
    join(process.cwd(), ".env"),
    join(process.cwd(), ".env.local"),
  ])) {
    applyEnvFile(path, protectedKeys);
  }
}
