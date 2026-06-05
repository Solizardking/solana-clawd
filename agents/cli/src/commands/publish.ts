import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { printOk, printInfo, printWarn } from "../banner.js";

function getCatalogSrcDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  return join(cliRoot, "../src");
}

function getBuildScript(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  return join(cliRoot, "../build-catalog.cjs");
}

export function runPublish(agentPath: string, opts: { dryRun?: boolean; skipBuild?: boolean }): void {
  if (!existsSync(agentPath)) {
    throw new Error(`File not found: ${agentPath}`);
  }

  let agent: Record<string, unknown>;
  try {
    agent = JSON.parse(readFileSync(agentPath, "utf-8")) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid JSON: ${String(err)}`);
  }

  const identifier = agent["identifier"] as string | undefined;
  if (!identifier) {
    throw new Error("Agent JSON must have an 'identifier' field to publish.");
  }

  const catalogSrc = getCatalogSrcDir();
  const dest = join(catalogSrc, `${identifier}.json`);

  if (existsSync(dest)) {
    printWarn(`${dest} already exists — will overwrite`);
  }

  if (opts.dryRun) {
    printInfo(`Would copy ${agentPath} → ${dest}`);
    printInfo(`Would run: node build-catalog.cjs`);
    return;
  }

  if (!existsSync(catalogSrc)) {
    throw new Error(`Catalog src directory not found: ${catalogSrc}`);
  }

  copyFileSync(agentPath, dest);
  printOk(`Copied → ${dest}`);

  if (!opts.skipBuild) {
    const buildScript = getBuildScript();
    if (!existsSync(buildScript)) {
      printWarn(`build-catalog.cjs not found at ${buildScript} — skipping catalog rebuild`);
    } else {
      printInfo("Rebuilding catalog...");
      execSync(`node "${buildScript}"`, { stdio: "inherit", cwd: dirname(buildScript) });
      printOk("Catalog rebuilt");
    }
  }

  printOk(`Published: ${identifier}`);
  console.error(`\n  Visible at: https://x402.wtf/api/agents/catalog`);
  console.error(`  Direct:     https://x402.wtf/api/agents/${identifier}`);
}
