import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const skippedDirectoryNames = new Set([
  ".anchor",
  ".clawd",
  ".convex",
  ".git",
  ".mypy_cache",
  ".next",
  ".pay",
  ".playwright-mcp",
  ".pnpm-store",
  ".venv",
  ".vercel",
  ".vercel-static",
  ".wrangler",
  "__pycache__",
  "Agent-Trading-Arena",
  "Agent-Trading-Arena-main",
  "Discord",
  "TradingView-API-main",
  "agent-minter",
  "attached_assets",
  "better-auth-main",
  "build",
  "candy",
  "caveman-agent",
  "cheshire-terminal",
  "coverage",
  "convex-helpers-main",
  "dist",
  "dynamic-bonding-curve-main",
  "gfx",
  "library",
  "livekit-agent",
  "m",
  "magicblock-engine-examples-main",
  "magicblock-gacha",
  "node_modules",
  "programs",
  "pump-public-docs-main",
  "solanastreaming",
  "staking",
  "target",
  "temp",
  "tmp",
  "wallets",
]);

const skippedRootFiles = new Set([
  ".DS_Store",
  "bun.lock",
  "bundle-stats.json",
  "db.txt",
  "dex-mobile-console.log",
  "dex-mobile-snapshot.md",
  "llm.txt",
  "package-lock.json",
  "pool.txt",
  "search.txt",
  "style.txt",
  "swap.txt",
]);

const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".lock",
  ".md",
  ".mjs",
  ".sample",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".template",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const forbiddenFileRules = [
  {
    name: "private-env-file",
    test: (relativePath, basename) => basename.startsWith(".env") && !isAllowedEnvExample(basename),
  },
  { name: "oauth-client-secret-json", test: (_relativePath, basename) => /^client_secret.*\.json$/i.test(basename) },
  { name: "wallet-or-keypair-json", test: (_relativePath, basename) => /(?:wallet|keypair).*\.json$/i.test(basename) },
  { name: "solana-id-json", test: (_relativePath, basename) => basename === "id.json" },
  { name: "service-account-json", test: (_relativePath, basename) => /(?:service-account|credentials|firebase-adminsdk).*\.json$/i.test(basename) },
  { name: "private-key-file", test: (_relativePath, basename) => /\.(?:pem|p12|pfx|keystore|jks|ppk|key)$/i.test(basename) },
  { name: "ssh-private-key-file", test: (_relativePath, basename) => /^id_(?:rsa|ed25519|ecdsa)(?:\..*)?$/i.test(basename) },
  { name: "encoded-secret-key-file", test: (_relativePath, basename) => /\.(?:b58|b64\.key)$/i.test(basename) },
];

const forbiddenContentRules = [
  { name: "absolute-local-user-path", pattern: /\/Users\/8bit\b/g },
  { name: "personal-handle", pattern: /\bbeetsbyj\b/gi },
  { name: "pem-private-key-block", pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { name: "openai-api-key", pattern: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "aws-secret-access-key", pattern: /\baws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{30,}/gi },
  { name: "vercel-token", pattern: /\bvercel_[A-Za-z0-9]{20,}\b/g },
];

const findings = [];
let scannedFiles = 0;
let skippedEntries = 0;

function isAllowedEnvExample(basename) {
  return [
    ".env.example",
    ".env.sample",
    ".env.template",
    ".env.vercel.example",
  ].includes(basename);
}

function toRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function shouldSkipRootFile(relativePath, basename) {
  if (relativePath.includes("/")) return false;
  if (skippedRootFiles.has(basename)) return true;
  return /\.(?:png|jpg|jpeg|gif|webp)$/i.test(basename);
}

function isTextCandidate(filePath, basename) {
  if (basename === ".gitignore" || basename === ".dockerignore" || basename === ".vercelignore" || basename === ".gitattributes") {
    return true;
  }
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function addFinding(relativePath, rule) {
  findings.push({ path: relativePath || ".", rule });
}

function auditFile(filePath) {
  const relativePath = toRelative(filePath);
  const basename = path.basename(filePath);

  if (shouldSkipRootFile(relativePath, basename)) {
    skippedEntries += 1;
    return;
  }

  for (const rule of forbiddenFileRules) {
    if (rule.test(relativePath, basename)) addFinding(relativePath, rule.name);
  }

  if (!isTextCandidate(filePath, basename)) return;

  const size = statSync(filePath).size;
  if (size > 1_500_000) {
    skippedEntries += 1;
    return;
  }

  let content = "";
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    addFinding(relativePath, "unreadable-text-file");
    return;
  }

  if (content.includes("\u0000")) return;
  scannedFiles += 1;

  for (const rule of forbiddenContentRules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) addFinding(relativePath, rule.name);
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    const relativePath = toRelative(child);
    const stat = lstatSync(child);

    if (stat.isSymbolicLink()) {
      skippedEntries += 1;
      continue;
    }

    if (entry.isDirectory()) {
      if (skippedDirectoryNames.has(entry.name)) {
        skippedEntries += 1;
        continue;
      }
      walk(child);
      continue;
    }

    if (entry.isFile()) auditFile(child);
    else skippedEntries += 1;
  }
}

walk(root);

if (findings.length > 0) {
  console.error("Open-source audit failed. No secret values are printed; paths and rule names only:");
  for (const finding of findings) {
    console.error(`- ${finding.path}: ${finding.rule}`);
  }
  process.exit(1);
}

console.log(`Open-source audit passed. Scanned ${scannedFiles} text files; skipped ${skippedEntries} ignored entries.`);
