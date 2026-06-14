#!/usr/bin/env node

const env = process.env;

function present(name) {
  return Boolean(env[name]?.trim());
}

function isPostgresUrl(value) {
  return /^postgres(ql)?:\/\//.test(value || "");
}

function isUsablePostgresUrl(value) {
  if (!isPostgresUrl(value)) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.hostname && parsed.hostname !== "host" && parsed.hostname !== "CLOUD_SQL_PUBLIC_IP");
  } catch {
    return false;
  }
}

function databaseUrl() {
  return [env.DATABASE_URL, env.NEON_DATABASE_URL, env.CONNECTION_STRING, env.PLATFORM_DATABASE_URL].find(isUsablePostgresUrl) || "";
}

function normalizeUrl(value) {
  return (value || "").trim().replace(/\/$/, "");
}

const checks = [
  {
    name: "database api key storage",
    ok: Boolean(databaseUrl()),
    detail: "Set DATABASE_URL, NEON_DATABASE_URL, CONNECTION_STRING, or PLATFORM_DATABASE_URL to a usable postgres:// or postgresql:// URL for api_keys and audit logs.",
    required: true,
  },
  {
    name: "session secret",
    ok: (env.SESSION_SECRET || "").length >= 32,
    detail: "SESSION_SECRET must be at least 32 characters.",
    required: true,
  },
  {
    name: "public app origin",
    ok: /^https?:\/\//.test(normalizeUrl(env.APP_ORIGIN || env.VITE_APP_URL || env.BETTER_AUTH_URL)),
    detail: "Set APP_ORIGIN, VITE_APP_URL, or BETTER_AUTH_URL to the public app origin.",
    required: true,
  },
  {
    name: "clerk frontend",
    ok: present("VITE_CLERK_PUBLISHABLE_KEY") || present("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    detail: "VITE_CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY enables the hosted account portal.",
    required: true,
  },
  {
    name: "clerk jwt issuer",
    ok:
      present("CLERK_JWT_ISSUER") ||
      present("CLERK_ISSUER_URL") ||
      present("CLERK_ISSUER") ||
      present("CLERK_FRONTEND_API") ||
      present("CLERK_FRONTEND_API_URL") ||
      present("CLERK_ACCOUNT_PORTAL_URL"),
    detail: "Set CLERK_JWT_ISSUER, CLERK_ISSUER_URL, CLERK_ISSUER, CLERK_FRONTEND_API_URL, or CLERK_ACCOUNT_PORTAL_URL for server-side bearer verification.",
    required: true,
  },
  {
    name: "clerk jwks",
    ok:
      present("CLERK_JWKS_URL") ||
      present("CLERK_JWT_ISSUER") ||
      present("CLERK_ISSUER_URL") ||
      present("CLERK_ISSUER") ||
      present("CLERK_FRONTEND_API") ||
      present("CLERK_FRONTEND_API_URL") ||
      present("CLERK_ACCOUNT_PORTAL_URL"),
    detail: "Set CLERK_JWKS_URL or an issuer that exposes /.well-known/jwks.json.",
    required: true,
  },
  {
    name: "convex deployment",
    ok: present("CONVEX_URL") || present("VITE_CONVEX_URL") || present("CONVEX_SITE_URL") || present("VITE_CONVEX_SITE_URL"),
    detail: "Convex URL is needed for wallet auth proxy compatibility.",
    required: true,
  },
  {
    name: "agent discovery",
    ok: env.ENABLE_BETTER_AUTH === "true",
    detail: "ENABLE_BETTER_AUTH=true enables /.well-known/agent-configuration.",
    required: false,
  },
  {
    name: "better auth secret",
    ok: present("BETTER_AUTH_SECRET") || present("AUTH_SECRET"),
    detail: "Better Auth should have a stable secret when agent auth is enabled.",
    required: false,
  },
  {
    name: "telegram bot token",
    ok: present("TELEGRAM_BOT_TOKEN") || present("TELEGRAM_LOGIN_BOT_TOKEN"),
    detail: "TELEGRAM_BOT_TOKEN or TELEGRAM_LOGIN_BOT_TOKEN enables the production Telegram bot.",
    required: false,
  },
  {
    name: "honcho persistence",
    ok: present("HONCHO_API_KEY"),
    detail: "HONCHO_API_KEY enables persistent memory across Telegram, arena, agents, wallets, and trades.",
    required: false,
  },
  {
    name: "birdeye market data",
    ok: present("BIRDEYE_API_KEY"),
    detail: "BIRDEYE_API_KEY enables Telegram market commands, token analytics, wallet intelligence, and perps data.",
    required: false,
  },
];

let failedRequired = 0;
let failedOptional = 0;

for (const check of checks) {
  const marker = check.ok ? "PASS" : check.required ? "FAIL" : "WARN";
  if (!check.ok && check.required) failedRequired += 1;
  if (!check.ok && !check.required) failedOptional += 1;
  console.log(`${marker.padEnd(4)} ${check.name}${check.ok ? "" : ` :: ${check.detail}`}`);
}

console.log("");
console.log(`Required failures: ${failedRequired}`);
console.log(`Optional warnings: ${failedOptional}`);

if (failedRequired > 0) {
  process.exitCode = 1;
}
