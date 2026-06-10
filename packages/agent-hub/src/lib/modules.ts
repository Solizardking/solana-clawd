import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { resolveWorkspaceRoot } from "./workspace.js";

export interface RepoModule {
  id: string;
  name: string;
  path: string;
  description: string;
  kind: "knowledge" | "runtime" | "protocol" | "package";
  entries: number;
  exists: boolean;
}

const MODULES: Array<Omit<RepoModule, "entries" | "exists">> = [
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

function countEntries(absPath: string): number {
  if (!existsSync(absPath)) {
    return 0;
  }

  try {
    return readdirSync(absPath).filter((entry) => {
      try {
        return statSync(join(absPath, entry)).isDirectory() || statSync(join(absPath, entry)).isFile();
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

export function loadRepoModules(): RepoModule[] {
  const root = resolveWorkspaceRoot();
  return MODULES.map((module) => {
    const absPath = join(root, module.path);
    return {
      ...module,
      exists: existsSync(absPath),
      entries: countEntries(absPath),
    };
  });
}
