import { App } from "@octokit/app";
import type { Octokit } from "@octokit/rest";

let _app: App | null = null;

export function getApp(): App {
  if (_app) return _app;

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!appId) throw new Error("GITHUB_APP_ID is required");
  if (!privateKey) throw new Error("GITHUB_APP_PRIVATE_KEY is required");
  if (!webhookSecret) throw new Error("GITHUB_WEBHOOK_SECRET is required");

  _app = new App({
    appId,
    privateKey,
    webhooks: { secret: webhookSecret },
  });

  return _app;
}

export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  const app = getApp();
  return app.getInstallationOctokit(installationId) as unknown as Octokit;
}

export interface PRFile {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
}

export async function getPRFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number
): Promise<PRFile[]> {
  const { data } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
    per_page: 100,
  });

  return data.map((f) => ({
    filename: f.filename,
    status: f.status,
    patch: f.patch,
    additions: f.additions,
    deletions: f.deletions,
  }));
}

export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
  conclusion: "success" | "failure",
  title: string,
  summary: string
): Promise<void> {
  await octokit.checks.create({
    owner,
    repo,
    name: "Clawd Guard — Secret Scan",
    head_sha: headSha,
    status: "completed",
    conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title,
      summary,
    },
  });
}

export async function postPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issue_number: number,
  body: string
): Promise<void> {
  // Find and update an existing Clawd Guard comment rather than spamming new ones
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number,
    per_page: 100,
  });

  const existing = comments.find(
    (c) =>
      c.user?.type === "Bot" &&
      c.body?.includes("Clawd Guard — Secret Scan")
  );

  if (existing) {
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
  }
}

export async function postCleanComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issue_number: number
): Promise<void> {
  const body = `## ✅ Clawd Guard — Secret Scan Passed

No secrets or private keys detected in this PR diff.

---
*Powered by [Clawd Guard](https://github.com/apps/clawd-guard) + Grok AI*`;

  await postPRComment(octokit, owner, repo, issue_number, body);
}
