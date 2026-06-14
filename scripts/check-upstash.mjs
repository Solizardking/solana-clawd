import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";
import { Client } from "@upstash/qstash";
import { Box } from "@upstash/box";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true, quiet: true });

const PROBE_TIMEOUT_MS = 10_000;

function hasEnv(name) {
  return Boolean((process.env[name] ?? "").trim());
}

function requireEnv(names) {
  const missing = names.filter((name) => !hasEnv(name));
  if (missing.length > 0) {
    throw new Error(`missing ${missing.join(", ")}`);
  }
}

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), PROBE_TIMEOUT_MS).unref();
    }),
  ]);
}

function formatError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9+/_=-]{32,}/g, "[redacted]");
}

async function checkRedis() {
  requireEnv(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
  });

  const key = `cheshire:upstash:check:${Date.now()}`;
  await withTimeout(redis.set(key, "ok", { ex: 60 }), "Redis set");
  const value = await withTimeout(redis.get(key), "Redis get");
  await redis.del(key).catch(() => {});

  if (value !== "ok") {
    throw new Error("Redis read returned an unexpected value");
  }
}

async function checkQstash() {
  requireEnv(["QSTASH_TOKEN"]);

  const qstash = new Client({
    token: process.env.QSTASH_TOKEN.trim(),
    ...(hasEnv("QSTASH_URL") ? { baseUrl: process.env.QSTASH_URL.trim() } : {}),
  });

  const response = await withTimeout(qstash.logs({ count: 1 }), "QStash logs");
  if (!Array.isArray(response.logs)) {
    throw new Error("QStash logs returned an unexpected response");
  }

  requireEnv(["QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"]);
}

async function checkBox() {
  const apiKey = process.env.UPSTASH_BOX_API_KEY || process.env.NEONBOX_API_KEY;
  if (!apiKey?.trim()) {
    return "skipped";
  }

  await withTimeout(Box.list({ apiKey: apiKey.trim() }), "Upstash Box list");
  return "ok";
}

const checks = [
  ["Redis REST", checkRedis],
  ["QStash", checkQstash],
  ["Upstash Box", checkBox],
];

let failed = false;

for (const [label, check] of checks) {
  try {
    const result = await check();
    if (result === "skipped") {
      console.log(`[upstash] ${label}: skipped (not configured)`);
    } else {
      console.log(`[upstash] ${label}: connected`);
    }
  } catch (error) {
    failed = true;
    console.error(`[upstash] ${label}: failed - ${formatError(error)}`);
  }
}

process.exitCode = failed ? 1 : 0;
