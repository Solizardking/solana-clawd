#!/usr/bin/env node

import { readFileSync } from "node:fs";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const cliBaseUrl = process.argv.slice(2).find((arg) => arg !== "--");
const baseUrl = (process.env.SMOKE_BASE_URL || cliBaseUrl || "http://127.0.0.1:5000").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12_000);
const concurrency = Number(process.env.SMOKE_CONCURRENCY || 8);

const routes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((route) => !route.includes(":"))
  .sort((a, b) => a.localeCompare(b));

if (routes.length === 0) {
  console.error("No static routes found in client/src/App.tsx");
  process.exit(1);
}

function hasSpaShell(text) {
  return /<div\s+id=["']root["']/.test(text);
}

function hasClientEntrypoint(text) {
  return text.includes("/assets/") || text.includes("/src/") || text.includes("/@vite/client");
}

function toUrl(path) {
  return `${baseUrl}${path === "/" ? "/" : path}`;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "cheshire-page-smoke/1.0",
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  return { response, text };
}

async function waitForShell() {
  const deadline = Date.now() + timeoutMs * 3;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const { response, text } = await fetchText(`${baseUrl}/`, { Accept: "text/html,*/*" });
      if (response.ok && hasSpaShell(text) && hasClientEntrypoint(text)) {
        return text;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`SPA shell did not become ready at ${baseUrl}: ${lastError}`);
}

async function verifyAssets(indexHtml) {
  const assetPaths = [
    ...indexHtml.matchAll(/\s(?:src|href)="([^"]+)"/g),
  ]
    .map((match) => match[1])
    .filter((asset) => asset.startsWith("/assets/"))
    .sort();

  const failures = [];
  await Promise.all(assetPaths.map(async (assetPath) => {
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}${assetPath}`, {
        method: "HEAD",
        headers: { "User-Agent": "cheshire-page-smoke/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        failures.push(`${response.status} ${assetPath}`);
      } else {
        console.log(`PASS ${String(response.status).padStart(3)} ${String(Date.now() - started).padStart(5)}ms asset ${assetPath}`);
      }
    } catch (error) {
      failures.push(`ERR ${assetPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  if (failures.length > 0) {
    throw new Error(`Asset smoke failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  }

  return assetPaths.length;
}

async function checkRoute(route) {
  const started = Date.now();
  try {
    const { response, text } = await fetchText(toUrl(route), { Accept: "text/html,*/*" });
    const elapsed = Date.now() - started;
    const ok =
      response.status === 200 &&
      hasSpaShell(text) &&
      hasClientEntrypoint(text);

    if (!ok) {
      return {
        route,
        ok: false,
        status: response.status,
        elapsed,
        detail: text.slice(0, 180).replace(/\s+/g, " ").trim(),
      };
    }

    return { route, ok: true, status: response.status, elapsed, detail: "" };
  } catch (error) {
    return {
      route,
      ok: false,
      status: "ERR",
      elapsed: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResult(result) {
  const marker = result.ok ? "PASS" : "FAIL";
  const suffix = result.ok ? "" : ` :: ${result.detail}`;
  console.log(`${marker} ${String(result.status).padStart(3)} ${String(result.elapsed).padStart(5)}ms ${result.route}${suffix}`);
}

const indexHtml = await waitForShell();
const assetCount = await verifyAssets(indexHtml);

const results = [];
let nextIndex = 0;

async function worker() {
  while (nextIndex < routes.length) {
    const index = nextIndex++;
    const result = await checkRoute(routes[index]);
    results[index] = result;
    printResult(result);
  }
}

await Promise.all(
  Array.from({ length: Math.max(1, Math.min(concurrency, routes.length)) }, () => worker()),
);

const failures = results.filter((result) => !result.ok);

console.log("");
console.log(`Smoke base: ${baseUrl}`);
console.log(`Routes passed: ${routes.length - failures.length}/${routes.length}`);
console.log(assetCount > 0 ? `Assets checked from shell: ${assetCount}` : "Assets checked from shell: dev server entrypoint");

if (failures.length > 0) {
  process.exitCode = 1;
}
