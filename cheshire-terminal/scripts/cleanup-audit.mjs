#!/usr/bin/env node
import { existsSync, rmSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const sets = {
  deps: [
    "node_modules",
    "cheshire-terminal/node_modules",
    "dynamic-bonding-curve-main/meteora-invent-main/node_modules",
    "workers/browser-run/node_modules",
    "staking/node_modules",
    "dynamic-bonding-curve-main/node_modules",
  ],
  targets: [
    "dynamic-bonding-curve-main/target",
    "magicblock-gacha/target",
    "staking/target",
    "programs/cheshire-launchpad/target",
    "agent-minter/target",
    "m/agent-minter/target",
  ],
  caches: [
    ".mypy_cache",
    ".playwright-mcp",
    "dist",
    ".vercel",
    ".vercel-static",
  ],
  logs: [
    ".playwright-mcp/console-2026-06-13T22-26-13-406Z.log",
    "dex-mobile-console.log",
    "caveman-agent/.google-agents-cli/run_server.log",
    "solanastreaming/.DS_Store",
    "solanastreaming/googlevoice-main/.DS_Store",
    "dynamic-bonding-curve-main/.anchor/program-logs/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN.dynamic_bonding_curve.log",
  ],
};

sets.generated = [...sets.deps, ...sets.targets, ...sets.caches];
sets.all = [...sets.generated, ...sets.logs];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const listSets = args.has("--list");
const selected = [...args].filter((arg) => !arg.startsWith("--"));

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/cleanup-audit.mjs [--list] [--apply] <set...>

Sets:
${Object.keys(sets).map((name) => `  ${name}`).join("\n")}

Default mode is dry-run. Use --apply only after explicit approval.`);
  process.exit(exitCode);
}

if (listSets) {
  for (const [name, paths] of Object.entries(sets)) {
    console.log(`${name}:`);
    for (const path of paths) console.log(`  ${path}`);
  }
  process.exit(0);
}

if (selected.length === 0) usage(1);

const unknown = selected.filter((name) => !(name in sets));
if (unknown.length > 0) {
  console.error(`Unknown set(s): ${unknown.join(", ")}`);
  usage(1);
}

const paths = [...new Set(selected.flatMap((name) => sets[name]))];
let missing = 0;
let present = 0;

for (const path of paths) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Refusing path outside workspace: ${path}`);
  }

  if (!existsSync(absolute)) {
    missing += 1;
    console.log(`missing  ${path}`);
    continue;
  }

  present += 1;
  const stat = statSync(absolute);
  const kind = stat.isDirectory() ? "dir" : "file";
  console.log(`${apply ? "delete " : "would  "} ${kind} ${path}`);

  if (apply) {
    rmSync(absolute, { recursive: true, force: false });
  }
}

console.log("");
console.log(`${apply ? "Deleted" : "Dry run"}: ${present} present, ${missing} missing`);
