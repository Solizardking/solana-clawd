#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const routeSource = readFileSync("client/src/App.tsx", "utf8");
const telegramFiles = [
  "server/lib/telegram/bot.ts",
  "server/lib/telegram/agentSpawner.ts",
  "server/lib/telegram/tradingIntent.ts",
  "server/routes/telegram.ts",
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

function normalizePath(path) {
  const withoutOrigin = path.replace(/^https?:\/\/[^/]+/i, "");
  const pathOnly = withoutOrigin.split(/[?#]/)[0] || "/";
  return pathOnly.replace(/\$\{[^}]+\}/g, "__dynamic__").replace(/\/+$/, "") || "/";
}

function isCovered(path) {
  if (path.startsWith("/api/")) return true;
  if (exactRoutes.has(path)) return true;
  return dynamicRoutes.some((route) => route.test(path));
}

function extractPaths(file, source) {
  const paths = [];
  const patterns = [
    /\$\{this\.getAppUrl\(\)\}(\/[^`"'<\s]*)/g,
    /appPath\(\s*["']([^"']+)["']/g,
    /appPath\(\s*`([^`]+)`/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1];
      if (!value || !value.startsWith("/")) continue;
      paths.push({ file, value, path: normalizePath(value) });
    }
  }

  return paths;
}

const extracted = telegramFiles.flatMap((file) => extractPaths(file, readFileSync(file, "utf8")));
const failures = extracted.filter((entry) => !isCovered(entry.path));

if (failures.length > 0) {
  console.error("Telegram web-app URLs without matching React routes:");
  for (const failure of failures) {
    console.error(`  - ${failure.file}: ${failure.value} -> ${failure.path}`);
  }
  process.exit(1);
}

const uniqueCount = new Set(extracted.map((entry) => entry.path)).size;
console.log(`Telegram route audit passed: ${uniqueCount} unique Telegram/appPath routes covered.`);
