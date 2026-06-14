#!/usr/bin/env node

import { readFileSync } from "node:fs";

const routesSource = readFileSync("server/routes.ts", "utf8");
const smokeSource = readFileSync("scripts/smoke-api.mjs", "utf8");

const mountedApiPrefixes = [
  ...routesSource.matchAll(/app\.use\(\s*[`'"]([^`'"]+)[`'"]/g),
]
  .map((match) => match[1])
  .filter((prefix) => prefix.startsWith("/api/"));

const smokePaths = [
  ...smokeSource.matchAll(/path:\s*["'`]([^"'`]+)["'`]/g),
].map((match) => match[1]);

const uniquePrefixes = [...new Set(mountedApiPrefixes)].sort();
const missing = uniquePrefixes.filter(
  (prefix) =>
    !smokePaths.some(
      (smokePath) =>
        smokePath === prefix ||
        smokePath.startsWith(`${prefix}/`) ||
        smokePath.startsWith(`${prefix}?`),
    ),
);

if (missing.length > 0) {
  console.error("Mounted API prefixes missing from scripts/smoke-api.mjs:");
  for (const prefix of missing) console.error(`  - ${prefix}`);
  process.exit(1);
}

console.log(`API smoke coverage audit passed: ${uniquePrefixes.length} mounted API prefixes covered.`);
