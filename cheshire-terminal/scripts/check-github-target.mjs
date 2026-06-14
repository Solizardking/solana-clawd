import { execFileSync } from "node:child_process";

const forbiddenRepos = new Set([
  "solizardking/solana-clawd",
  "x402agent/solana-clawd",
]);

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeRepo(input) {
  return input
    .trim()
    .replace(/^git@github\.com:/i, "")
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

function fail(message) {
  console.error(`[github-target] ${message}`);
  process.exit(1);
}

const expectedRepo = process.argv[2] || process.env.CHESHIRE_GITHUB_REPO || "";
const currentBranch = runGit(["branch", "--show-current"]);
const remoteUrl = runGit(["remote", "get-url", "--push", "origin"]);
const remoteRepo = normalizeRepo(remoteUrl);

if (!remoteUrl) fail("origin push URL is not configured.");

if (remoteRepo === "disabled") {
  fail("origin push URL is disabled. Set origin to the Cheshire Terminal public repo before pushing.");
}

if (forbiddenRepos.has(remoteRepo)) {
  fail(`origin points at ${remoteRepo}, which is a source/dependency repo. Set origin to the Cheshire Terminal public repo before pushing.`);
}

if (expectedRepo && remoteRepo !== normalizeRepo(expectedRepo)) {
  fail(`origin points at ${remoteRepo}, expected ${normalizeRepo(expectedRepo)}.`);
}

console.log(JSON.stringify({
  ok: true,
  branch: currentBranch,
  origin: remoteRepo,
  expected: expectedRepo ? normalizeRepo(expectedRepo) : null,
}, null, 2));
