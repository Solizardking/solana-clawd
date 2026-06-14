#!/usr/bin/env node

const env = process.env;
const baseUrl = (env.SMOKE_BASE_URL || process.argv[2] || "https://cheshireterminal.ai").replace(/\/$/, "");
const timeoutMs = Number(env.SMOKE_TIMEOUT_MS || 15_000);

function normalizeUrl(value) {
  return (value || "").trim().replace(/\/$/, "");
}

function clerkIssuer() {
  return normalizeUrl(
    env.CLERK_JWT_ISSUER ||
      env.CLERK_ISSUER_URL ||
      env.CLERK_ISSUER ||
      env.CLERK_FRONTEND_API ||
      env.CLERK_FRONTEND_API_URL ||
      env.CLERK_ACCOUNT_PORTAL_URL ||
      "https://clerk.cheshireterminal.ai",
  );
}

function clerkJwksUrl() {
  return normalizeUrl(env.CLERK_JWKS_URL) || `${clerkIssuer()}/.well-known/jwks.json`;
}

function log(ok, message, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
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
  } catch {}
  return { response, text, json };
}

const issuer = clerkIssuer();
const jwksUrl = clerkJwksUrl();

try {
  const jwks = await getJson(jwksUrl);
  const keys = Array.isArray(jwks.json?.keys) ? jwks.json.keys : [];
  log(jwks.response.ok && keys.length > 0, "Clerk JWKS is reachable", `keys=${keys.length}`);

  const status = await getJson(`${baseUrl}/api/developer/status`);
  const clerk = status.json?.auth?.clerkBearer;
  log(status.response.ok && clerk?.configured === true, "developer status reports Clerk bearer configured");
  log(
    typeof clerk?.issuer === "string" && normalizeUrl(clerk.issuer) === issuer,
    "developer status issuer matches smoke issuer",
    `issuer=${issuer}`,
  );
  log(
    typeof clerk?.jwksUrl === "string" && normalizeUrl(clerk.jwksUrl) === jwksUrl,
    "developer status JWKS URL matches smoke JWKS URL",
  );

  const invalid = await getJson(`${baseUrl}/api/developer/keys`, {
    headers: { Authorization: "Bearer invalid.clerk.jwt" },
  });
  log(
    invalid.response.status === 401 || invalid.response.status === 403,
    "invalid Clerk bearer token is rejected",
    `status=${invalid.response.status}`,
  );
} catch (error) {
  log(false, "Clerk auth smoke failed", error instanceof Error ? error.message : String(error));
}
