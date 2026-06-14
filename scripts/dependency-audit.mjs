#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

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

function rg(pattern) {
  const args = [
    "--fixed-strings",
    "--no-heading",
    "--line-number",
    ...excludedGlobs.flatMap((glob) => ["--glob", glob]),
    pattern,
    ".",
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

const importLines = rg("from ")
  + rg("import(")
  + rg("import ")
  + rg("require(");

const imported = new Set();
for (const match of importLines.matchAll(/["'](@?[^"'./][^"']*)["']/g)) {
  imported.add(packageRoot(match[1]));
}

const rows = dependencies.map(({ name, section }) => {
  const directImport = imported.has(name);
  const literalReferences = rg(name)
    .split("\n")
    .filter(Boolean)
    .filter((line) => !line.includes("package.json"))
    .filter((line) => !line.includes("pnpm-lock.yaml"))
    .filter((line) => !line.includes("package-lock.json"))
    .filter((line) => !line.includes("CLEANUP_AUDIT.md"))
    .filter((line) => !line.includes("dependency-audit.mjs"));

  let status = "candidate";
  if (directImport) {
    status = "imported";
  } else if (literalReferences.length > 0) {
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
    references: literalReferences.slice(0, 3),
  };
});

const groups = ["imported", "referenced", "types", "tooling", "candidate"];
for (const group of groups) {
  const items = rows.filter((row) => row.status === group);
  console.log(`## ${group} (${items.length})`);
  for (const item of items) {
    console.log(`${item.name} [${item.section}]`);
    for (const reference of item.references) {
      console.log(`  ${reference}`);
    }
  }
  console.log("");
}
