#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const args = new Set(process.argv.slice(2));
const summaryOnly = args.has("--summary");

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];

const dependencies = dependencySections.flatMap((section) =>
  Object.keys(packageJson[section] ?? {}).map((name) => ({ name, section })),
);

const excludedGlobs = [
  "!node_modules/**",
  "!**/node_modules/**",
  "!target/**",
  "!**/target/**",
  "!dist/**",
  "!**/dist/**",
  "!cheshire-terminal/**",
  "!m/**",
  "!dynamic-bonding-curve-main/**",
  "!staking/**",
  "!magicblock-gacha/**",
  "!better-auth-main/**",
  "!convex-helpers-main/**",
  "!TradingView-API-main/**",
  "!library/**",
  "!caveman-agent/**",
  "!CLEANUP_AUDIT.md",
  "!scripts/dependency-audit.mjs",
  "!package.json",
  "!package-lock.json",
  "!pnpm-lock.yaml",
  "!**/package.json",
  "!**/package-lock.json",
  "!**/pnpm-lock.yaml",
  "!**/*.log",
  "!**/*.png",
  "!**/*.jpg",
  "!**/*.jpeg",
  "!**/*.gif",
  "!**/*.svg",
  "!**/*.db",
];

const knownTooling = new Set([
  "autoprefixer",
  "drizzle-kit",
  "esbuild",
  "postcss",
  "tailwindcss",
  "tsx",
  "typescript",
  "vercel",
  "vite",
]);

const knownTypes = /^@types\//;

function rgFiles() {
  const args = [
    "--files",
    ...excludedGlobs.flatMap((glob) => ["--glob", glob]),
  ];

  try {
    return execFileSync("rg", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}

function packageRoot(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

const files = rgFiles().split("\n").filter(Boolean);
const imported = new Set();
const literalReferences = new Map();
const importReferenceRegex =
  /(?:import\s+(?:type\s+)?(?:[^"'()]+?\s+from\s+)?|export\s+(?:type\s+)?(?:[^"'()]+?\s+from\s+)|import\s*\(|require\s*\()\s*["'](@?[^"'./][^"']*)["']/g;

for (const file of files) {
  const absolute = resolve(root, file);
  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;

  let text;
  try {
    text = readFileSync(absolute, "utf8");
  } catch {
    continue;
  }

  for (const match of text.matchAll(importReferenceRegex)) {
    imported.add(packageRoot(match[1]));
  }

  const lines = text.split("\n");
  for (const { name } of dependencies) {
    if (!text.includes(name)) continue;
    const refs = literalReferences.get(name) ?? [];
    if (refs.length >= 3) continue;
    const index = lines.findIndex((line) => line.includes(name));
    if (index !== -1) refs.push(`${file}:${index + 1}:${lines[index].trim()}`);
    literalReferences.set(name, refs);
  }
}

const rows = dependencies.map(({ name, section }) => {
  const directImport = imported.has(name);
  const references = literalReferences.get(name) ?? [];

  let status = "candidate";
  if (directImport) {
    status = "imported";
  } else if (references.length > 0) {
    status = "referenced";
  } else if (knownTypes.test(name)) {
    status = "types";
  } else if (knownTooling.has(name)) {
    status = "tooling";
  }

  return {
    name,
    section,
    status,
    references,
  };
});

const groups = ["imported", "referenced", "types", "tooling", "candidate"];
for (const group of groups) {
  const items = rows.filter((row) => row.status === group);
  console.log(`## ${group} (${items.length})`);
  for (const item of items) {
    console.log(`${item.name} [${item.section}]`);
    if (!summaryOnly) {
      for (const reference of item.references) {
        console.log(`  ${reference}`);
      }
    }
  }
  console.log("");
}
