import { execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
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
import { withSpinner, spinSync } from "../ui/spinner.js";
import { solanaPulse, walletHeartbeat, blockFinality, pumpLoader } from "../ui/clawd-spinners.js";
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

  spinSync("Installing skills...", blockFinality, () => {
    for (const skill of skillDirs) {
      const src = join(skillsDir, skill);
      const dst = join(targetBase, skill);
      cpSync(src, dst, { recursive: true });
    }
  });

  for (const skill of skillDirs) {
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

const CLAWDROUTER_URL = "https://clawdrouter.fly.dev";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const OPENCLAWD_DIR = join(homedir(), ".openclawd");
const OPENCLAWD_ENV = join(OPENCLAWD_DIR, ".env");

interface RouterHealth {
  openRouter?: { enabled: boolean; configured: boolean };
  clawd?: { holderTier?: string; balance?: number; premiumModelsUnlocked?: boolean; maxRequestsPerHour?: number };
}

interface AgentKeyResponse {
  key: string;
  baseUrl: string;
  tier: string;
  rateLimitPerHour: number;
}

async function setupClawdRouter(): Promise<void> {
  printSection("4. ClawdRouter + $CLAWD Free LLM Access");

  // Check router health and $CLAWD status
  let routerOnline = false;
  let openRouterConfigured = false;
  let serverTier = "FREE";
  try {
    const healthRes = await withSpinner("Checking router health...", solanaPulse, () =>
      fetch(`${CLAWDROUTER_URL}/health`, { signal: AbortSignal.timeout(8000) })
    );
    if (healthRes.ok) {
      const h = (await healthRes.json()) as RouterHealth;
      routerOnline = true;
      openRouterConfigured = h.openRouter?.configured ?? false;
      serverTier = h.clawd?.holderTier ?? "FREE";
    }
  } catch { /* router unreachable — continue with offline setup */ }

  if (routerOnline) {
    printOk(`Router online:   ${CLAWDROUTER_URL}`);
    printOk(`OpenRouter key:  ${openRouterConfigured ? "configured (shared)" : "not configured"}`);
    printInfo(`Server $CLAWD tier: ${serverTier}`);
  } else {
    printWarn(`Router offline — will configure env anyway`);
  }

  // Provision a free agent key
  let freeKey = "";
  try {
    const keyRes = await withSpinner("Minting free agent key...", walletHeartbeat, () =>
      fetch(`${CLAWDROUTER_URL}/v1/agent-key`, { signal: AbortSignal.timeout(8000) })
    );
    if (keyRes.ok) {
      const k = (await keyRes.json()) as AgentKeyResponse;
      freeKey = k.key;
      printOk(`Free key minted: ${freeKey}`);
      printInfo(`Tier: ${k.tier} · ${k.rateLimitPerHour} req/hr · budget models`);
    }
  } catch { /* no key minted — use placeholder */ }

  // Write env to ~/.openclawd/.env
  mkdirSync(OPENCLAWD_DIR, { recursive: true });
  const envBlock = [
    `# ClawdRouter — free LLM routing powered by $CLAWD`,
    `OPENROUTER_BASE_URL=${CLAWDROUTER_URL}/v1`,
    `OPENROUTER_API_KEY=${freeKey || "clawd_free"}`,
    `# Upgrade: hold $CLAWD → https://pump.fun/coin/${CLAWD_MINT}`,
    "",
  ].join("\n");
  writeFileSync(OPENCLAWD_ENV, envBlock, { flag: "a" });
  printOk(`Saved:  ${OPENCLAWD_ENV}`);
  printInfo("Source in any agent: source ~/.openclawd/.env");

  // $CLAWD / clawd-pump upgrade tiers
  printSection("4b. $CLAWD Token — clawd-pump Access Tiers");
  console.error(`\n  Token:   $CLAWD  (${CLAWD_MINT.slice(0, 8)}...${CLAWD_MINT.slice(-4)})`);
  console.error(`  Buy:     https://pump.fun/coin/${CLAWD_MINT}`);
  console.error(`\n  Tiers (ClawdRouter):`);
  console.error(`    🐋 WHALE    1,000,000+ $CLAWD  → all models, no x402, unlimited`);
  console.error(`    💎 DIAMOND    100,000+ $CLAWD  → premium models, no x402, 500/hr`);
  console.error(`    🎫 HOLDER       1,000+ $CLAWD  → mid-tier models, 100/hr`);
  console.error(`    🆓 FREE               0 $CLAWD  → budget models, 20/hr (your current tier)`);
  console.error(`\n  Check your wallet: clawd-agents pump <wallet-address>`);
  console.error(`  Upgrade API key:   https://x402.wtf/profile/api`);
}

export async function runSetup(args: { global?: boolean }): Promise<void> {
  printSection("1. Node.js");
  const nodeOk = spinSync("Checking Node.js...", pumpLoader, checkNode);
  if (!nodeOk) process.exitCode = 1;

  printSection("2. gcloud (optional)");
  spinSync("Checking gcloud...", pumpLoader, checkGcloud);

  printSection("3. Skills Installation");
  installSkills();

  await setupClawdRouter();

  printSection("5. Agent Registry");
  console.error(`\n  Project:          ${CLAWD_PROJECT_ID}`);
  console.error(`  Reasoning Engine: ${CLAWD_REASONING_ENGINE_URN}`);
  console.error(`\n  Registered endpoints (${REGISTERED_ENDPOINTS.length}):`);
  for (const ep of REGISTERED_ENDPOINTS) {
    console.error(`    ${ep.url}`);
  }

  printSection("6. Summary");
  printOk(`Auth:      https://x402.wtf/api/auth`);
  printOk(`Discovery: https://x402.wtf/.well-known/agent-auth.json`);
  printOk(`Catalog:   https://x402.wtf/api/agents/catalog`);
  printOk(`Router:    ${CLAWDROUTER_URL}/v1`);
  if (args.global) printOk("Scope: global");

  printDone("Run `clawd-agents scaffold create <name> --agent perps` to start.");
}
