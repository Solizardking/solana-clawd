import "dotenv/config";
import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import {
  getApp,
  getInstallationOctokit,
  getPRFiles,
  createCheckRun,
  postPRComment,
  postCleanComment,
} from "./github.js";
import { scanDiff, formatFindingsForComment } from "./scanner.js";
import { analyzeFullDiff, formatGrokFindings } from "./grok.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
app.use(express.json({ limit: "10mb" }));

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "clawd-guard", version: "1.0.0" });
});

// ── Webhook signature verification ───────────────────────────────────────────

function verifySignature(secret: string, payload: string, sig: string): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expected = Buffer.from("sha256=" + hmac.digest("hex"));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ── Main webhook handler ──────────────────────────────────────────────────────

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  const event = req.headers["x-github-event"] as string | undefined;
  const deliveryId = req.headers["x-github-delivery"] as string | undefined;

  console.log(`[clawd-guard] Event: ${event} | Delivery: ${deliveryId}`);

  if (!sig) {
    return res.status(401).json({ error: "Missing signature" });
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[clawd-guard] GITHUB_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const rawBody = req.body as Buffer;
  if (!verifySignature(webhookSecret, rawBody.toString(), sig)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  // Acknowledge immediately to avoid GitHub timeout
  res.status(202).json({ received: true });

  // Process asynchronously
  try {
    if (event === "pull_request") {
      await handlePullRequestEvent(payload);
    } else if (event === "push") {
      await handlePushEvent(payload);
    }
  } catch (err) {
    console.error("[clawd-guard] Handler error:", err);
  }
});

// ── Pull Request handler ──────────────────────────────────────────────────────

async function handlePullRequestEvent(payload: Record<string, unknown>) {
  const action = payload.action as string;

  // Only scan on open/synchronize (new commits pushed to PR)
  if (action !== "opened" && action !== "synchronize" && action !== "reopened") {
    return;
  }

  const pr = payload.pull_request as Record<string, unknown>;
  const repo = payload.repository as Record<string, unknown>;
  const installation = payload.installation as Record<string, unknown> | undefined;

  if (!installation?.id) {
    console.warn("[clawd-guard] No installation ID in PR event");
    return;
  }

  const installationId = installation.id as number;
  const owner = (repo.owner as Record<string, unknown>).login as string;
  const repoName = repo.name as string;
  const pullNumber = pr.number as number;
  const headSha = (pr.head as Record<string, unknown>).sha as string;

  console.log(`[clawd-guard] Scanning PR #${pullNumber} in ${owner}/${repoName} @ ${headSha}`);

  const octokit = await getInstallationOctokit(installationId);
  const files = await getPRFiles(octokit, owner, repoName, pullNumber);

  // Filter to added/modified files with diffs, skip binary and deleted
  const scannable = files.filter(
    (f) => f.patch && f.status !== "removed" && f.additions > 0
  );

  // Regex scan
  const regexResults = scannable.map((f) => ({
    file: f.filename,
    result: scanDiff(f.patch ?? ""),
  }));

  const totalRegexFindings = regexResults.reduce(
    (sum, r) => sum + r.result.findings.length,
    0
  );

  // Grok AI scan (runs in parallel with regex)
  let grokSection = "";
  if (process.env.XAI_API_KEY) {
    try {
      const grokAnalyses = await analyzeFullDiff(
        scannable.map((f) => ({ filename: f.filename, patch: f.patch }))
      );
      grokSection = formatGrokFindings(grokAnalyses);
    } catch (err) {
      console.error("[clawd-guard] Grok scan failed:", err);
    }
  }

  const hasFindings = totalRegexFindings > 0 || grokSection.length > 0;

  if (hasFindings) {
    const regexComment = formatFindingsForComment(regexResults);
    const fullComment = regexComment + grokSection;

    await postPRComment(octokit, owner, repoName, pullNumber, fullComment);
    await createCheckRun(
      octokit,
      owner,
      repoName,
      headSha,
      "failure",
      `${totalRegexFindings} secret(s) detected`,
      `Clawd Guard found ${totalRegexFindings} potential secret(s) in this PR. Review the PR comment for details.`
    );

    console.log(
      `[clawd-guard] PR #${pullNumber}: FAILED — ${totalRegexFindings} regex findings`
    );
  } else {
    await postCleanComment(octokit, owner, repoName, pullNumber);
    await createCheckRun(
      octokit,
      owner,
      repoName,
      headSha,
      "success",
      "No secrets detected",
      `Clawd Guard scanned ${scannable.length} file(s) and found no secrets or private keys.`
    );

    console.log(`[clawd-guard] PR #${pullNumber}: PASSED — ${scannable.length} files clean`);
  }
}

// ── Push handler (direct pushes to protected branches) ────────────────────────

async function handlePushEvent(payload: Record<string, unknown>) {
  const ref = payload.ref as string;
  const installation = payload.installation as Record<string, unknown> | undefined;

  // Only scan pushes to main/master/develop
  const protectedBranches = (process.env.PROTECTED_BRANCHES ?? "main,master,develop").split(",");
  const branch = ref.replace("refs/heads/", "");
  if (!protectedBranches.includes(branch)) return;

  if (!installation?.id) return;

  const repo = payload.repository as Record<string, unknown>;
  const owner = (repo.owner as Record<string, unknown>).login as string;
  const repoName = repo.name as string;
  const commits = payload.commits as Array<{ id: string; added: string[]; modified: string[]; message: string }>;

  if (!commits?.length) return;

  const octokit = await getInstallationOctokit(installation.id as number);

  for (const commit of commits.slice(0, 5)) {
    const changedFiles = [...(commit.added ?? []), ...(commit.modified ?? [])];
    for (const file of changedFiles) {
      try {
        const { data } = await (octokit as any).repos.getContent({
          owner,
          repo: repoName,
          path: file,
          ref: commit.id,
        });

        if (data.type !== "file" || !data.content) continue;

        const content = Buffer.from(data.content, "base64").toString("utf8");
        // Wrap as a diff-like format for the scanner
        const pseudoDiff = content
          .split("\n")
          .map((l) => "+" + l)
          .join("\n");

        const { scanDiff } = await import("./scanner.js");
        const result = scanDiff(pseudoDiff);

        if (!result.clean) {
          console.warn(
            `[clawd-guard] PUSH to ${branch}: secrets found in ${file} at commit ${commit.id}`
          );
          // Post to commit status
          await (octokit as any).repos.createCommitStatus({
            owner,
            repo: repoName,
            sha: commit.id,
            state: "failure",
            description: `Secret detected in ${file}`,
            context: "clawd-guard/secret-scan",
          });
        }
      } catch {
        // File may be binary or not readable — skip
      }
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[clawd-guard] Webhook server running on port ${PORT}`);
  // Validate critical env vars on startup
  const required = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[clawd-guard] Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (!process.env.XAI_API_KEY) {
    console.warn("[clawd-guard] XAI_API_KEY not set — Grok AI analysis disabled, regex-only mode");
  }
});

export default app;
