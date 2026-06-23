#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const SECRET_FILENAME_RE =
  /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.keystore|.*\.jks|.*\.asc|.*\.gpg|id_rsa(\..*)?|id_ed25519(\..*)?|id_ecdsa(\..*)?|.*keypair.*\.json|wallet\.json|.*-wallet\.json|agent-wallet\.json|id\.json|credentials\.json|service-account.*\.json|gcp-credentials.*\.json|google-credentials.*\.json|firebase-adminsdk.*\.json|aws-credentials|.*\.b58|.*\.b64\.key)$/i;
const ALLOWED_TEMPLATE_RE = /(^|\/)\.env\.(example|sample|template)$/i;
const SECRET_CONTENT_RE =
  /(BEGIN (RSA |EC |OPENSSH |DSA |PRIVATE )?KEY|PRIVATE KEY-----|sk_live_|ghp_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})/i;

const IGNORED_SECRET_EXAMPLES = [
  /OPEN_SOURCE\.md:/,
  /test_security\.py:/,
  /public-release-audit\.sh:/,
  /packages\/clawd-guard\/README\.md:/,
  /packages\/clawd-guard\/src\/scanner\.ts:/,
  /scripts\/audit-repo\.mjs:/,
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.allowFailure ? "pipe" : "inherit"],
  });
}

function listTrackedFiles() {
  return git(["ls-files"]).split("\n").filter(Boolean);
}

function findPackageJsons(dir = ROOT, depth = 0) {
  if (depth > 3) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".tmp") continue;
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === "package.json") out.push(full.replace(ROOT, "./"));
    if (entry.isDirectory()) out.push(...findPackageJsons(full, depth + 1));
  }
  return out.sort();
}

function trackedSecretFilenames(files) {
  return files.filter((file) => SECRET_FILENAME_RE.test(file) && !ALLOWED_TEMPLATE_RE.test(file));
}

function trackedSecretContentHits() {
  let output = "";
  try {
    output = git([
      "grep",
      "-n",
      "-I",
      "-i",
      "-E",
      SECRET_CONTENT_RE.source,
      "--",
      ":!pnpm-lock.yaml",
      ":!package-lock.json",
      ":!*.pdf",
      ":!*.png",
      ":!*.jpg",
      ":!*.jpeg",
      ":!*.webp",
      ":!*.gif",
    ]);
  } catch {
    return [];
  }

  return output
    .split("\n")
    .filter(Boolean)
    .filter((line) => !IGNORED_SECRET_EXAMPLES.some((re) => re.test(line)))
    .map((line) => {
      const match = line.match(/^(.+?):(\d+):/);
      return match ? `${match[1]}:${match[2]}:[redacted content match]` : "[redacted content match]";
    });
}

function main() {
  const files = listTrackedFiles();
  const packageJsons = findPackageJsons();
  const topLevelDirs = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => ![".git", "node_modules", ".tmp"].includes(name))
    .sort();

  const filenameHits = trackedSecretFilenames(files);
  const contentHits = trackedSecretContentHits();
  const hasInstall = existsSync(join(ROOT, "install.sh"));
  const installMode = hasInstall ? statSync(join(ROOT, "install.sh")).mode : 0;
  const installExecutable = Boolean(installMode & 0o111);

  console.log("OpenClawd repository audit");
  console.log(`- tracked files: ${files.length}`);
  console.log(`- top-level directories: ${topLevelDirs.length}`);
  console.log(`- package.json files: ${packageJsons.length}`);
  console.log(`- install.sh present: ${hasInstall ? "yes" : "no"}`);
  console.log(`- install.sh executable: ${installExecutable ? "yes" : "no"}`);
  console.log(`- tracked secret-like filenames: ${filenameHits.length}`);
  console.log(`- unapproved secret-pattern hits: ${contentHits.length}`);

  if (filenameHits.length) {
    console.log("\nTracked secret-like filenames:");
    for (const hit of filenameHits) console.log(`  ${hit}`);
  }

  if (contentHits.length) {
    console.log("\nUnapproved secret-pattern hits:");
    for (const hit of contentHits.slice(0, 50)) console.log(`  ${hit}`);
    if (contentHits.length > 50) console.log(`  ... ${contentHits.length - 50} more`);
  }

  if (!hasInstall || !installExecutable || filenameHits.length || contentHits.length) {
    process.exitCode = 1;
  }
}

main();
