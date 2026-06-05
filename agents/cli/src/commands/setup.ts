import { execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  printSection,
  printOk,
  printInfo,
  printWarn,
  printDone,
} from "../banner.js";
import {
  CLAWD_PROJECT_ID,
  CLAWD_REASONING_ENGINE_URN,
  REGISTERED_ENDPOINTS,
} from "../registry-data.js";

function getSkillsSourceDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  const repoSkills = join(cliRoot, "../skills");
  if (existsSync(repoSkills)) return repoSkills;
  return join(cliRoot, "skills");
}

function installSkills(): void {
  const skillsDir = getSkillsSourceDir();
  const targetBase = join(homedir(), ".agents", "skills");
  mkdirSync(targetBase, { recursive: true });

  if (!existsSync(skillsDir)) {
    printWarn(`Skills source not found at ${skillsDir} — skipping local install`);
    printInfo("Running: npx -y skills@latest add https://github.com/Solizardking/solana-clawd/tree/newnew/agents/skills -y -g");
    spawnSync(
      "npx",
      ["-y", "skills@latest", "add", "https://github.com/Solizardking/solana-clawd/tree/newnew/agents/skills", "-y", "-g"],
      { stdio: "inherit" },
    );
    return;
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skillDirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith("clawd-agents-cli"))
    .map((e) => e.name);

  if (skillDirs.length === 0) {
    printWarn("No clawd-agents-cli-* skills found in source directory");
    return;
  }

  for (const skill of skillDirs) {
    const src = join(skillsDir, skill);
    const dst = join(targetBase, skill);
    cpSync(src, dst, { recursive: true });
    printOk(`~/.agents/skills/${skill}`);
  }
}

function checkNode(): boolean {
  try {
    const result = execSync("node --version", { encoding: "utf-8" }).trim();
    printOk(`Node.js ${result}`);
    return true;
  } catch {
    printWarn("Node.js not found — install from https://nodejs.org");
    return false;
  }
}

function checkGcloud(): void {
  try {
    const result = execSync("gcloud config get-value project 2>/dev/null", { encoding: "utf-8" }).trim();
    if (result) {
      printOk(`gcloud project: ${result}`);
    } else {
      printInfo(`gcloud found but no active project — run: gcloud config set project ${CLAWD_PROJECT_ID}`);
    }
  } catch {
    printInfo("gcloud not found — optional for Agent Registry. Install: https://cloud.google.com/sdk");
  }
}

export function runSetup(args: { global?: boolean }): void {
  printSection("1. Node.js");
  const nodeOk = checkNode();
  if (!nodeOk) process.exitCode = 1;

  printSection("2. gcloud (optional)");
  checkGcloud();

  printSection("3. Skills Installation");
  installSkills();

  printSection("4. Agent Registry");
  console.error(`\n  Project:          ${CLAWD_PROJECT_ID}`);
  console.error(`  Reasoning Engine: ${CLAWD_REASONING_ENGINE_URN}`);
  console.error(`\n  Registered endpoints (${REGISTERED_ENDPOINTS.length}):`);
  for (const ep of REGISTERED_ENDPOINTS) {
    console.error(`    ${ep.url}`);
  }

  printSection("5. Summary");
  printOk(`Auth:    https://x402.wtf/api/auth`);
  printOk(`Discovery: https://x402.wtf/.well-known/agent-auth.json`);
  printOk(`Catalog:   https://x402.wtf/api/agents/catalog`);
  if (args.global) printOk("Scope: global");

  printDone("Run `clawd-agents scaffold create <name> --agent perps` to start.");
}
