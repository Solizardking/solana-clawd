#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const componentRoot = "client/src/components";
const extensions = ["", ".tsx", ".ts", ".jsx", ".js", ".json", ".css", ".png", ".jpg", ".jpeg", ".svg"];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...walk(fullPath));
    } else if (/\.(tsx|ts)$/.test(name)) {
      entries.push(fullPath);
    }
  }
  return entries.sort();
}

function normalizeSpecifier(specifier, fromFile) {
  const clean = specifier.split("?")[0];
  if (clean.startsWith("@/")) return path.join("client/src", clean.slice(2));
  if (clean.startsWith("@shared/")) return path.join("shared", clean.slice("@shared/".length));
  if (clean.startsWith(".")) return path.normalize(path.join(path.dirname(fromFile), clean));
  return null;
}

function resolveLocalImport(specifier, fromFile) {
  const base = normalizeSpecifier(specifier, fromFile);
  if (!base) return true;

  const candidates = [
    ...extensions.map((ext) => `${base}${ext}`),
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
    path.join(base, "index.jsx"),
    path.join(base, "index.js"),
  ];
  return candidates.some((candidate) => existsSync(candidate));
}

const componentFiles = walk(componentRoot);
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const includesClientSrc = Array.isArray(tsconfig.include) && tsconfig.include.includes("client/src/**/*");
const excludesComponents =
  Array.isArray(tsconfig.exclude) &&
  tsconfig.exclude.some((entry) => entry.replace(/\\/g, "/").startsWith(componentRoot));

const unresolved = [];
for (const file of componentFiles) {
  const source = readFileSync(file, "utf8");
  const imports = [
    ...source.matchAll(/from\s+["']([^"']+)["']/g),
    ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);

  for (const specifier of imports) {
    if (!resolveLocalImport(specifier, file)) {
      unresolved.push(`${file} -> ${specifier}`);
    }
  }
}

if (!includesClientSrc || excludesComponents || unresolved.length > 0) {
  if (!includesClientSrc) {
    console.error("tsconfig.json does not include client/src/**/*, so component typecheck coverage is incomplete.");
  }
  if (excludesComponents) {
    console.error("tsconfig.json excludes client/src/components, so component typecheck coverage is incomplete.");
  }
  if (unresolved.length > 0) {
    console.error("Component files with unresolved local imports:");
    for (const item of unresolved) console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log(`Component surface audit passed: ${componentFiles.length} component TS/TSX files covered by typecheck and local import resolution.`);
