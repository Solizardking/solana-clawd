import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { printOk, printInfo, printWarn } from "../banner.js";

const AGENT_TEMPLATES: Record<string, string> = {
  perps: "clawd-perps-agent",
  base: "clawd-base-agent",
};

function getTemplatesDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  return join(cliRoot, "..");
}

function validateName(name: string): void {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) {
    throw new Error("Project name must be 1-40 chars, lowercase letters, numbers, and hyphens only.");
  }
}

export function runScaffoldCreate(
  name: string,
  opts: { agent?: string; prototype?: boolean; auth?: boolean; payments?: boolean },
): void {
  validateName(name);
  const templateName = AGENT_TEMPLATES[opts.agent ?? "perps"] ?? AGENT_TEMPLATES["perps"];
  const templatesDir = getTemplatesDir();
  const templatePath = join(templatesDir, templateName);

  if (!existsSync(templatePath)) {
    throw new Error(
      `Template '${templateName}' not found at ${templatePath}.\n` +
      `Available: ${Object.keys(AGENT_TEMPLATES).join(", ")}`,
    );
  }

  if (existsSync(name)) {
    throw new Error(`Directory '${name}' already exists. Choose a different name.`);
  }

  printInfo(`Template:  ${templateName}`);
  printInfo(`Target:    ./${name}`);

  cpSync(templatePath, name, {
    recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.includes("/dist/"),
  });

  // Patch package.json
  const pkgPath = join(name, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    pkg["name"] = `@solanaclawd/${name}`;
    pkg["version"] = "0.1.0";
    const binKey = basename(name);
    pkg["bin"] = { [binKey]: "dist/cli.js" };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    printOk(`package.json → name: @solanaclawd/${name}`);
  }

  // Patch clawd.json
  const clawdPath = join(name, "clawd.json");
  if (existsSync(clawdPath)) {
    const clawd = JSON.parse(readFileSync(clawdPath, "utf-8")) as Record<string, unknown>;
    clawd["name"] = name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    writeFileSync(clawdPath, JSON.stringify(clawd, null, 2) + "\n");
    printOk(`clawd.json → name: ${String(clawd["name"])}`);
  }

  // Create .env from template
  const envSrc = join(name, ".env");
  const envDst = join(name, ".env.local");
  if (existsSync(envSrc) && !existsSync(envDst)) {
    cpSync(envSrc, envDst);
    printOk(`.env.local created from .env template`);
  }

  if (opts.auth) {
    printInfo("--auth: CAAP/1.0 agentAuth block already included via clawd-perps-agent template");
  }
  if (opts.payments) {
    printInfo("--payments: Add NEXT_PUBLIC_CLAWD_X402=true to .env.local and wire x402 middleware");
  }

  printOk(`Created ./${name}`);
  console.error(`\n  Next steps:`);
  console.error(`    cd ${name}`);
  console.error(`    npm install`);
  console.error(`    npm run build`);
  console.error(`    clawd-agents eval clawd.json`);
}

export function runScaffoldEnhance(
  dir: string,
  opts: { auth?: boolean; payments?: boolean; telegram?: boolean; registry?: boolean },
): void {
  if (!existsSync(dir)) {
    throw new Error(`Directory '${dir}' does not exist.`);
  }

  printInfo(`Enhancing: ${dir}`);

  if (opts.auth) {
    printInfo("--auth: Ensure CAAP/1.0 block is in clawd.json:");
    printInfo('  "agentAuth": { "protocol": "CAAP/1.0", "discovery": "https://x402.wtf/.well-known/agent-auth.json", ... }');
  }

  if (opts.telegram) {
    printInfo("--telegram: Add TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_CHATS to .env.local");
    printInfo("  Wire handleTelegramPerpsCommand() from src/telegram.ts");
  }

  if (opts.payments) {
    printInfo("--payments: x402 payment middleware — install @x402/next and wrap API routes");
    printInfo('  import { withX402 } from "@x402/next"');
  }

  if (opts.registry) {
    printInfo("--registry: Run `clawd-agents registry register` to add to Google Agent Registry");
  }

  if (!opts.auth && !opts.telegram && !opts.payments && !opts.registry) {
    printWarn("No enhancement flags specified. Use --auth, --telegram, --payments, or --registry.");
  }
}

export function runScaffoldUpgrade(dir: string, opts: { dryRun?: boolean; autoApprove?: boolean }): void {
  printInfo(`Checking ${dir} for upgrades...`);
  if (opts.dryRun) {
    printInfo("--dry-run: showing changes without applying");
  }
  printInfo("Auth module: agents/auth/ → check for @auth/agent@latest and @better-auth/agent-auth@latest");
  printInfo("Templates:   agent-template-attested.json + agent-template-full.json — check agentAuth block");
  if (!opts.dryRun) {
    printInfo("Run `npm install @auth/agent@latest @better-auth/agent-auth@latest` to upgrade deps");
  }
}
