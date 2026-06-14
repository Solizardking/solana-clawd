#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const baseUrl = (process.env.SMOKE_BASE_URL || process.argv[2] || "https://cheshireterminal.ai").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15_000);

function usablePostgresUrl(value) {
  if (!value || !/^postgres(ql)?:\/\//.test(value)) return "";
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || parsed.hostname === "host" || parsed.hostname === "CLOUD_SQL_PUBLIC_IP") return "";
    return value;
  } catch {
    return "";
  }
}

const databaseUrl =
  usablePostgresUrl(process.env.DATABASE_URL) ||
  usablePostgresUrl(process.env.NEON_DATABASE_URL) ||
  usablePostgresUrl(process.env.CONNECTION_STRING) ||
  usablePostgresUrl(process.env.PLATFORM_DATABASE_URL);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createSecret() {
  return `ct_sk_${crypto.randomBytes(32).toString("base64url")}`;
}

function keyPrefix(secret) {
  return secret.slice(0, 16);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, text, json };
}

function log(ok, message, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}${detail ? ` :: ${detail}` : ""}`);
}

if (!databaseUrl) {
  console.error("FAIL DATABASE_URL is required for API key lifecycle smoke.");
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
});

const startedAt = Date.now();
const unique = `api-smoke:${startedAt}:${crypto.randomBytes(4).toString("hex")}`;
const secret = createSecret();
let userId = null;
let apiKeyId = null;
let failed = false;

try {
  await client.connect();

  const userResult = await client.query(
    `insert into users ("openId", email, name, "loginMethod", role)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [unique, `${unique.replace(/[^a-zA-Z0-9]/g, "-")}@example.invalid`, "API Smoke User", "api-smoke", "user"],
  );
  userId = userResult.rows[0]?.id;
  if (!userId) throw new Error("temporary user insert did not return an id");
  log(true, "created temporary user", `id=${userId}`);

  const keyResult = await client.query(
    `insert into api_keys ("userId", name, key_prefix, key_hash, scopes)
     values ($1, $2, $3, $4, $5::jsonb)
     returning id`,
    [userId, "api lifecycle smoke", keyPrefix(secret), sha256(secret), JSON.stringify(["api:*"])],
  );
  apiKeyId = keyResult.rows[0]?.id;
  if (!apiKeyId) throw new Error("temporary API key insert did not return an id");
  log(true, "created temporary hashed API key", `id=${apiKeyId} prefix=${keyPrefix(secret)}`);

  const allowed = await fetchJson("/api/ai/welcome", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const allowOk = allowed.response.status !== 401 && allowed.response.status !== 403;
  log(allowOk, "temporary API key can pass the live API gate", `status=${allowed.response.status}`);
  if (!allowOk) failed = true;

  const [lastUsed] = (await client.query(
    `select last_used_at from api_keys where id = $1`,
    [apiKeyId],
  )).rows;
  const usedOk = Boolean(lastUsed?.last_used_at);
  log(usedOk, "API key use updates lastUsedAt");
  if (!usedOk) failed = true;

  await client.query(
    `update api_keys set "expiresAt" = now() where id = $1`,
    [apiKeyId],
  );
  log(true, "expired temporary API key");

  const denied = await fetchJson("/api/ai/welcome", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const denyOk = denied.response.status === 401 || denied.response.status === 403;
  log(denyOk, "expired API key is rejected by the live API gate", `status=${denied.response.status}`);
  if (!denyOk) failed = true;

  const audit = await client.query(
    `select event from api_key_audit_log where api_key_id = $1 order by created_at desc limit 5`,
    [apiKeyId],
  );
  const auditOk = audit.rows.some((row) => row.event === "used");
  log(auditOk, "API key audit log recorded live use");
  if (!auditOk) failed = true;
} catch (error) {
  failed = true;
  log(false, "API key lifecycle smoke failed", error instanceof Error ? error.message : String(error));
} finally {
  try {
    if (apiKeyId) {
      await client.query(`update api_keys set "expiresAt" = now() where id = $1`, [apiKeyId]);
    }
  } catch {}
  await client.end().catch(() => {});
}

if (failed) {
  process.exitCode = 1;
}
