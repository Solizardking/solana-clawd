#!/usr/bin/env node

const disabled = process.env.CLAWD_DISABLE_TRACKING === "true";
if (disabled) process.exit(0);

const endpoint = process.env.CLAWD_TRACKING_URL || "https://x402.wtf/api/track/install";
const target = process.argv[2] || "agents";
const version = process.argv[3] || "unknown";

const headers = { "content-type": "application/json" };
if (process.env.CLAWD_TRACKING_TOKEN) {
  headers["x-clawd-track-token"] = process.env.CLAWD_TRACKING_TOKEN;
}

fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify({
    event: "agent_install",
    source: "github",
    packageName: "solana-clawd-agents",
    target,
    version,
    gitRef: process.env.GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    installer: "agents/scripts/track-install.mjs",
    runtime: "node",
    platform: process.platform,
    nodeVersion: process.version,
  }),
}).catch(() => {});
