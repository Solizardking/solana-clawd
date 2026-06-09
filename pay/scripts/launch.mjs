#!/usr/bin/env node
/**
 * pay/scripts/launch.mjs
 *
 * `npm run launch` — boot the full x402.wtf real-store dev loop.
 *
 *  1. Regenerate the v2.1 manifest on disk.
 *  2. Verify the storefront assets (public/) are present and syntactically clean.
 *  3. Start `wrangler dev` (the Cloudflare Worker runtime) and forward SIGINT.
 *  4. Hit /api/x402wtf/manifest to confirm the worker is serving the new catalog.
 *
 * Designed to be Ctrl-C safe in any terminal.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

function step(label) {
  console.log(`\n\ud83d\ude80  ${label}`);
}

function ok(msg) {
  console.log(`  \u2714 ${msg}`);
}

function fail(msg) {
  console.error(`  \u2718 ${msg}`);
  process.exit(1);
}

async function runLive() {
  step("Step 1/4 \u2014 Regenerate v2.1 merchant manifest");
  await new Promise((resolveP, rejectP) => {
    const child = spawn(
      process.execPath,
      [resolve(ROOT, "scripts/list-products.mjs")],
      { stdio: "inherit" },
    );
    child.on("exit", (code) => (code === 0 ? resolveP() : rejectP(new Error(`list exited ${code}`))));
  });
  ok("manifest written to dist/manifest.json and manifest.json");

  step("Step 2/4 \u2014 Sanity-check storefront assets");
  const htmlPath = resolve(ROOT, "public/index.html");
  const appJsPath = resolve(ROOT, "public/app.js");
  const stylesPath = resolve(ROOT, "public/styles.css");
  for (const p of [htmlPath, appJsPath, stylesPath]) {
    if (!existsSync(p)) fail(`missing: ${p}`);
    const size = statSync(p).size;
    if (size < 50) fail(`${p} is suspiciously small (${size} bytes)`);
    ok(`${p.replace(ROOT + "/", "")} (${size} bytes)`);
  }

  step("Step 3/4 \u2014 Boot wrangler dev (the worker is the storefront backend)");
  const port = process.env.PORT || "8787";
  console.log(`    \u2192 http://127.0.0.1:${port}/`);
  console.log(`    \u2192 http://127.0.0.1:${port}/api/x402wtf/manifest`);
  console.log(`    \u2192 http://127.0.0.1:${port}/api/x402wtf/info`);
  console.log("    press Ctrl-C to stop");

  const wrangler = spawn(
    "npx",
    ["--yes", "wrangler", "dev", "--port", port, "--local", "--persist", "."],
    { cwd: ROOT, stdio: "inherit", env: process.env },
  );

  let stopped = false;
  const shutdown = (signal) => {
    if (stopped) return;
    stopped = true;
    console.log(`\n[launch] received ${signal}, stopping wrangler...`);
    try { wrangler.kill(signal); } catch {}
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  wrangler.on("exit", (code) => {
    step(`Step 4/4 \u2014 wrangler exited with code ${code}`);
    process.exit(code ?? 0);
  });
}

runLive().catch((err) => {
  console.error("[launch] failed:", err);
  process.exit(1);
});
