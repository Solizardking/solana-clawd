#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(ROOT, "..");
const HOST = "https://x402.wtf";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExists(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  assert(fs.existsSync(fullPath), `missing ${relativePath}`);
  return fullPath;
}

function assertHostUrl(value, label, prefix = HOST) {
  assert(typeof value === "string" && value.startsWith(prefix), `${label} must start with ${prefix}`);
}

const cname = readText(assertExists("agents/CNAME")).trim();
assert(cname === "x402.wtf", `agents/CNAME must be x402.wtf, got ${cname}`);

const requiredAgentPaths = [
  "agents",
  "agents/.cursor",
  "agents/.github",
  "agents/.vercel",
  "agents/.well-known",
  "agents/agent-minter",
  "agents/Agent-Staking_Unstaking_solana_metaplex_core",
  "agents/characters",
  "agents/clawd-code",
  "agents/clawd-perps-agent",
  "agents/clawdbot-pumpfun",
  "agents/cli",
  "agents/cloudflare-agent-api",
  "agents/docs",
  "agents/locales",
  "agents/minted",
  "agents/public",
  "agents/scripts",
  "agents/solana-gpt-oracle",
  "agents/src",
  "agents/.editorconfig",
  "agents/.eslintrc.cjs",
  "agents/.gitattributes",
  "agents/.gitignore",
  "agents/.i18nignore",
  "agents/.i18nrc.js",
  "agents/.npmrc",
  "agents/.releaserc.cjs",
  "agents/.vercel-deploy",
  "agents/agent-template-attested.json",
  "agents/agent-template-full.json",
  "agents/agent-template.json",
  "agents/agents-catalog.json",
  "agents/agents-manifest.json",
  "agents/AGENTS.md",
  "agents/build-catalog.cjs",
  "agents/bun.lock",
  "agents/CHANGELOG.md",
  "agents/CITATION.cff",
  "agents/CNAME",
  "agents/CODE_OF_CONDUCT.md",
  "agents/CONTRIBUTING.md",
  "agents/gateway.txt",
  "agents/GEMINI.md",
  "agents/humans.txt",
  "agents/LICENSE",
  "agents/meta.json",
  "agents/nich.jpg",
  "agents/package.json",
  "agents/README.md",
  "agents/SECURITY.md",
  "agents/soltoshi.json",
];

for (const relativePath of requiredAgentPaths) {
  assertExists(relativePath);
}

const plugin = readJson(assertExists("agents/.well-known/ai-plugin.json"));
assert(plugin.api?.url === `${HOST}/api/agents`, "ai-plugin api.url must use https://x402.wtf/api/agents");
assert(plugin.logo_url === `${HOST}/nich.jpg`, "ai-plugin logo_url must use https://x402.wtf/nich.jpg");
assert(plugin.agent_registry?.hub === `${HOST}/agents`, "ai-plugin missing x402 agents hub");
assert(plugin.skill_registry?.hub === `${HOST}/skills`, "ai-plugin missing x402 skills hub");
assert(plugin.gateway?.hub === `${HOST}/gateway`, "ai-plugin missing x402 gateway hub");
assert(plugin.gateway?.telegram_webhook === `${HOST}/telegram/webhook`, "ai-plugin missing x402 Telegram webhook");
assert(plugin.staking?.hub === `${HOST}/staking`, "ai-plugin missing x402 staking hub");
assert(plugin.staking?.portfolio === `${HOST}/api/staking/portfolio/{owner}`, "ai-plugin missing staking portfolio route");
assert(plugin.staking?.assets === `${HOST}/api/staking/assets/{owner}`, "ai-plugin missing staking assets route");
assert(plugin.staking?.asset === `${HOST}/api/staking/agent/{assetId}`, "ai-plugin missing staking asset route");
assert(Array.isArray(plugin.staking?.das_methods) && plugin.staking.das_methods.includes("getAssetsByOwner"), "ai-plugin missing Helius DAS methods");

const publicPlugin = readJson(assertExists("agents/public/.well-known/ai-plugin.json"));
assert(publicPlugin.api?.url === plugin.api.url, "public ai-plugin copy is stale; run node build-catalog.cjs");
assert(JSON.stringify(publicPlugin.staking) === JSON.stringify(plugin.staking), "public ai-plugin staking copy is stale");

const catalog = readJson(assertExists("agents/agents-catalog.json"));
assert(catalog.hub?.gallery === `${HOST}/agents`, "catalog hub.gallery must use x402.wtf/agents");
assert(catalog.hub?.mint === `${HOST}/agents/mint`, "catalog hub.mint must use x402.wtf/agents/mint");
assert(catalog.hub?.registry === `${HOST}/api/agents/registry`, "catalog hub.registry must use x402 API");
assert(catalog.hub?.api === `${HOST}/api/agents`, "catalog hub.api must use x402 API");
assert(catalog.stats?.totalAgents > 0, "catalog must include agents");

for (const agent of catalog.agents ?? []) {
  assert(agent.identifier, "catalog agent missing identifier");
  assert(agent.deploy?.json === `/api/agents/catalog/${encodeURIComponent(agent.identifier)}.json`, `${agent.identifier} bad catalog route`);
  assert(agent.deploy?.registration === `/api/agents/registry/${encodeURIComponent(agent.identifier)}.json`, `${agent.identifier} bad registry route`);
  assertExists(`agents/public/api/agents/catalog/${agent.identifier}.json`);
  assertExists(`agents/public/api/agents/registry/${agent.identifier}.json`);
}

const acp = readJson(assertExists("agents/public/api/agents/acp-registry.json"));
assert(acp.host === HOST, "ACP registry host must be x402.wtf");
assert(acp.discover?.catalog === `${HOST}/api/agents/catalog`, "ACP catalog discovery must use x402");
assert(acp.discover?.wellKnown === `${HOST}/.well-known/acp.json`, "ACP well-known discovery must use x402");

const skillsCatalog = readJson(assertExists("skills/catalog.json"));
assert(Array.isArray(skillsCatalog) && skillsCatalog.length > 0, "skills/catalog.json must contain skills");
for (const entry of skillsCatalog) {
  assert(entry.slug, "skill catalog entry missing slug");
  assertHostUrl(entry.homepage, `${entry.slug} homepage`, `${HOST}/skills/`);
  assertHostUrl(entry.manifest, `${entry.slug} manifest`, `${HOST}/skills/`);
}

const installSh = readText(assertExists("install.sh"));
for (const needle of ["--x402", "--gateway", "https://x402.wtf/agents", "https://x402.wtf/skills", "https://x402.wtf/gateway"]) {
  assert(installSh.includes(needle), `install.sh missing ${needle}`);
}
assert(installSh.includes("npm run smoke:x402"), "install.sh --gateway must run the x402 gateway smoke test");

const gatewayIndex = readText(assertExists("gateway/src/index.ts"));
assert(gatewayIndex.includes("app.use('/', agentRegistryRouter)"), "gateway must mount agent registry router");
assert(gatewayIndex.includes("app.use('/', skillHubRouter)"), "gateway must mount skill hub router");
assert(gatewayIndex.includes("POST /telegram/webhook") || gatewayIndex.includes("/telegram/webhook"), "gateway must expose Telegram webhook");

const agentRegistry = readText(assertExists("gateway/src/agentRegistry.ts"));
for (const route of ["/api/agents/catalog", "/api/agents/registry", "/api/agents/templates", "/.well-known/ai-plugin.json"]) {
  assert(agentRegistry.includes(route), `agentRegistry missing ${route}`);
}

const skillHub = readText(assertExists("gateway/src/skillHub.ts"));
for (const route of ["/api/skills", "/api/skills/catalog", "/api/skills/slug/:slug"]) {
  assert(skillHub.includes(route), `skillHub missing ${route}`);
}

const workflow = readText(assertExists("agents/.github/workflows/test.yml"));
assert(workflow.includes("bun run test"), "GitHub test workflow must run package tests");
assert(workflow.includes("bun run build"), "GitHub test workflow must run package build");

console.log(`x402 setup OK: ${catalog.stats.totalAgents} agents, ${skillsCatalog.length} skills`);
