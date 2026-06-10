/**
 * box/lib/box-utils.ts
 *
 * Shared utilities for creating and managing Upstash Box sandboxes.
 * Provides a factory function that all agents use to spin up their box.
 */

import { Agent, Box, type CodeLanguage } from "@upstash/box";
import { trackInstallEvent } from "./install-tracker";
import type { RunCost } from "./types";

// ────────────────────────────────────────────
// Box factory
// ────────────────────────────────────────────

export interface CreateBoxOptions {
  runtime: "node" | "python";
  model: string;
  apiKey: string;
  baseUrl?: string;
  env?: Record<string, string>;
  onToolUse?: (tool: { name: string; input: Record<string, unknown> }) => void;
}

/**
 * Create a new Upstash Box with an AI agent harness inside.
 * The agent runs Claude Code (or another model) inside a sandboxed environment.
 */
export async function createAgentBox({
  runtime = "node",
  model = "anthropic/claude-opus-4-5",
  apiKey,
  baseUrl,
  env = {},
  onToolUse,
}: CreateBoxOptions) {
  await trackInstallEvent({
    event: "box_install",
    source: "github",
    packageName: "solana-clawd-box-agents",
    target: model,
    version: process.env.npm_package_version ?? "unknown",
    gitRef: process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    installer: "box-utils:createAgentBox",
    runtime,
    platform: process.platform,
    nodeVersion: process.version,
  });

  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    baseUrl: process.env.UPSTASH_BOX_BASE_URL ?? baseUrl,
    runtime,
    agent: {
      harness: Agent.ClaudeCode,
      model,
      apiKey,
    },
    env: {
      ...env,
    },
  });

  return box;
}

// ────────────────────────────────────────────
// Cost reporter
// ────────────────────────────────────────────

export function logCost(label: string, cost?: { inputTokens?: number; outputTokens?: number; totalUsd?: number; computeMs?: number }) {
  if (!cost) {
    console.log(`  [cost] ${label}: no cost data`);
    return;
  }
  const tokens = (cost.inputTokens ?? 0) + (cost.outputTokens ?? 0);
  console.log(
    `  [cost] ${label}: ${tokens.toLocaleString()} tokens, $${(cost.totalUsd ?? 0).toFixed(4)}, ${(cost.computeMs ?? 0).toLocaleString()}ms compute`
  );
}

// ────────────────────────────────────────────
// Snapshot helpers
// ────────────────────────────────────────────

export async function saveSnapshot(
  box: Box,
  name: string,
  label?: string,
) {
  const snapshotName = label ? `${name}-${label}` : name;
  console.log(`\n📸 Saving snapshot "${snapshotName}"...`);
  const snapshot = await box.snapshot({ name: snapshotName });
  console.log(`  Snapshot ready: ${snapshot.id}`);
  return snapshot;
}

// ────────────────────────────────────────────
// Streaming helper
// ────────────────────────────────────────────

export async function streamAgentOutput(
  box: Box,
  prompt: string,
  onText?: (text: string) => void,
  onTool?: (tool: { name: string; input: string }) => void,
) {
  const stream = await box.agent.stream({ prompt });

  let fullText = "";

  for await (const part of stream) {
    switch (part.type) {
      case "text-delta":
        if (part.text) {
          fullText += part.text;
          onText?.(part.text);
        }
        break;
      case "tool-call":
        onTool?.({ name: part.toolName, input: JSON.stringify(part.input).slice(0, 200) });
        break;
    }
  }

  return fullText;
}

// ────────────────────────────────────────────
// File management helpers
// ────────────────────────────────────────────

export async function writeAgentFile(
  box: Box,
  path: string,
  content: string,
) {
  await box.files.write({ path, content });
  console.log(`  📝 Wrote ${path} (${content.length} bytes)`);
}

export async function readAgentFile(
  box: Box,
  path: string,
): Promise<string> {
  const content = await box.files.read(path);
  return content;
}

export async function listAgentFiles(box: Box, folder?: string) {
  const files = folder
    ? await box.files.list(folder)
    : await box.files.list();
  return files;
}

// ────────────────────────────────────────────
// Shell command helper
// ────────────────────────────────────────────

export async function execInBox(
  box: Box,
  command: string,
): Promise<{ result: string; cost?: RunCost }> {
  const exec = await box.exec.command(command);
  console.log(`  $ ${command}`);
  if (exec.result) {
    console.log(`  → ${exec.result.slice(0, 500)}`);
  }
  return {
    result: exec.result ?? "",
    cost: exec.cost as unknown as RunCost | undefined,
  };
}

// ────────────────────────────────────────────
// Code execution helper
// ────────────────────────────────────────────

export async function runCodeInBox(
  box: Box,
  lang: CodeLanguage,
  code: string,
): Promise<{ result: string; cost?: RunCost }> {
  const exec = await box.exec.code({ lang, code });
  return {
    result: exec.result ?? "",
    cost: exec.cost as unknown as RunCost | undefined,
  };
}

// ────────────────────────────────────────────
// Git helper
// ────────────────────────────────────────────

export async function cloneInBox(
  box: Box,
  repo: string,
  targetDir?: string,
) {
  console.log(`  🔄 Cloning ${repo}${targetDir ? ` for ${targetDir}` : ""}...`);
  await box.git.clone({ repo });
}

export async function createPRFromBox(
  box: Box,
  title: string,
  base: string = "main",
) {
  const pr = await box.git.createPR({ title, base });
  return pr;
}
