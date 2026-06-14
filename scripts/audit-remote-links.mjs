#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const routeSource = readFileSync("client/src/App.tsx", "utf8");
const remoteFiles = [
  "client/src/pages/RemoteControlPage.tsx",
  "client/src/pages/terminal.tsx",
  "client/src/components/TelegramMiniApp.tsx",
  "client/src/pages/AccountPage.tsx",
  "client/src/pages/TelegramLinkPage.tsx",
].filter((file) => existsSync(file));

const routePaths = [...routeSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);

function routeToRegex(route) {
  const escaped = route
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:([A-Za-z0-9_]+)/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

const exactRoutes = new Set(routePaths.filter((route) => !route.includes(":")));
const dynamicRoutes = routePaths.filter((route) => route.includes(":")).map(routeToRegex);

function normalizePath(value) {
  if (!value || value.startsWith("http") || value.startsWith("mailto:") || value.startsWith("#")) return null;
  const path = value.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path.startsWith("/") ? path : null;
}

function isCovered(path) {
  if (path.startsWith("/api/")) return true;
  if (exactRoutes.has(path)) return true;
  return dynamicRoutes.some((route) => route.test(path));
}

function extractRemoteLinks(file, source) {
  const links = [];
  const patterns = [
    /href:\s*["']([^"']+)["']/g,
    /href=["']([^"']+)["']/g,
    /<Link[^>]*href=["']([^"']+)["']/g,
    /openPath\(\s*["']([^"']+)["']/g,
    /path:\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const path = normalizePath(match[1]);
      if (!path) continue;
      links.push({ file, value: match[1], path });
    }
  }
  return links;
}

const links = remoteFiles.flatMap((file) => extractRemoteLinks(file, readFileSync(file, "utf8")));
const failures = links.filter((entry) => !isCovered(entry.path));

if (failures.length) {
  console.error("Remote-control links without matching React routes:");
  for (const failure of failures) {
    console.error(`  - ${failure.file}: ${failure.value} -> ${failure.path}`);
  }
  process.exit(1);
}

const uniqueCount = new Set(links.map((entry) => entry.path)).size;
console.log(`Remote link audit passed: ${uniqueCount} unique remote-control routes covered.`);
