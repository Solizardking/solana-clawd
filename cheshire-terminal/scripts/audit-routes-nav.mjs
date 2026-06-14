#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const app = readFileSync("client/src/App.tsx", "utf8");
const nav = readFileSync("client/src/components/Navigation.tsx", "utf8");

const staticRoutes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((route) => !route.includes(":"));

const navHrefs = new Set([
  ...[...nav.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]),
  ...[...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
]);

const missing = staticRoutes.filter((route) => !navHrefs.has(route)).sort();
const extras = [...navHrefs].filter((href) => !staticRoutes.includes(href)).sort();
const lazyImports = [...app.matchAll(/lazy\(\s*\(\)\s*=>\s*import\("([^"]+)"\)/g)].map((match) => match[1]);

function resolveImport(specifier) {
  const normalized = specifier
    .replace(/^@\//, "client/src/")
    .replace(/^\.\//, "client/src/");
  const candidates = [
    normalized,
    `${normalized}.tsx`,
    `${normalized}.ts`,
    `${normalized}.jsx`,
    `${normalized}.js`,
    path.join(normalized, "index.tsx"),
    path.join(normalized, "index.ts"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const resolvedImports = lazyImports.map((specifier) => ({
  specifier,
  resolved: resolveImport(specifier),
}));
const unresolvedImports = resolvedImports.filter((entry) => !entry.resolved);
const importedPages = new Set(
  resolvedImports
    .map((entry) => entry.resolved)
    .filter((resolved) => resolved?.startsWith("client/src/pages/"))
    .map((resolved) => path.basename(resolved)),
);
const pageFiles = readdirSync("client/src/pages")
  .filter((file) => /\.(tsx|ts)$/.test(file))
  .sort();
const unroutedPages = pageFiles.filter((file) => !importedPages.has(file));

if (missing.length || extras.length || unresolvedImports.length || unroutedPages.length) {
  if (missing.length) {
    console.error("Routes missing from navigation:");
    for (const route of missing) console.error(`  - ${route}`);
  }
  if (extras.length) {
    console.error("Navigation hrefs without matching static routes:");
    for (const href of extras) console.error(`  - ${href}`);
  }
  if (unresolvedImports.length) {
    console.error("Lazy imports that do not resolve:");
    for (const entry of unresolvedImports) console.error(`  - ${entry.specifier}`);
  }
  if (unroutedPages.length) {
    console.error("Page files not imported by App route surface:");
    for (const file of unroutedPages) console.error(`  - client/src/pages/${file}`);
  }
  process.exit(1);
}

console.log(
  `Route/nav audit passed: ${staticRoutes.length} static routes covered, ${pageFiles.length} page files routed, ${lazyImports.length} lazy imports resolved.`,
);
