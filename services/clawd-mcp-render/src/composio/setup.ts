#!/usr/bin/env node

import {
  ensureClawdMcpServer,
  type EnsureClawdMcpServerOptions,
} from "./mcp.js";

function getArg(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : undefined;
}

function getListArg(flag: string): string[] {
  const value = getArg(flag);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const toolkits = getListArg("--toolkits");
  const allowedTools = getListArg("--tools");

  if (toolkits.length === 0) {
    throw new Error(
      "Missing required --toolkits argument. Example: --toolkits=github,slack",
    );
  }

  const options: EnsureClawdMcpServerOptions = {
    name: getArg("--name"),
    toolkits,
    allowedTools,
    manuallyManageConnections: process.argv.includes("--manual-auth"),
    projectId: getArg("--project-id"),
    orgId: getArg("--org-id"),
    orgMemberEmail: getArg("--org-member-email"),
    userId: getArg("--user-id"),
  };

  const result = await ensureClawdMcpServer(options);

  console.log(JSON.stringify(result, null, 2));
  console.log("\n# .mcp.json snippet");
  console.log(JSON.stringify(result.claudemcpJson, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
