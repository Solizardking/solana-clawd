import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function findAncestor(startDir: string, matches: (dir: string) => boolean): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (matches(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function hasPackageName(dir: string, packageName: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8")) as { name?: string };
    return pkg.name === packageName;
  } catch {
    return false;
  }
}

function firstExisting(candidates: string[], fallback: string): string {
  return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const MCP_PACKAGE_ROOT =
  findAncestor(currentDir, (dir) => hasPackageName(dir, "solana-clawd-mcp")) ??
  path.resolve(currentDir, "..");

export const REPO_ROOT =
  findAncestor(MCP_PACKAGE_ROOT, (dir) =>
    existsSync(path.join(dir, "AGENTS.md")) &&
    existsSync(path.join(dir, "skills")) &&
    existsSync(path.join(dir, "mcp")),
  ) ??
  path.resolve(MCP_PACKAGE_ROOT, "..", "..");

export const OFFICIAL_SOLANA_MCP_ROOT = firstExisting(
  [
    path.join(MCP_PACKAGE_ROOT, "solana-mcp-official-main"),
    path.join(REPO_ROOT, "mcp", "solana-mcp-official-main"),
    path.join(REPO_ROOT, "solana-mcp-official-main"),
  ],
  path.join(MCP_PACKAGE_ROOT, "solana-mcp-official-main"),
);

export function repoPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

export function mcpPackagePath(...segments: string[]): string {
  return path.join(MCP_PACKAGE_ROOT, ...segments);
}
