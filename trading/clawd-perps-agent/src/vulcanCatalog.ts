import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVulcanRoot } from "./paths.js";

export interface VulcanCatalogCommand {
  name: string;
  command: string;
  group: string;
  description: string;
  auth_required: boolean;
  dangerous: boolean;
  parameters: Array<Record<string, unknown>>;
  example?: string;
}

export interface VulcanToolCatalog {
  schema_version: string;
  cli_version: string;
  description: string;
  groups: Record<string, string>;
  commands: VulcanCatalogCommand[];
}

export interface VulcanMcpConfig {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
}

export interface VulcanCatalogSummary {
  cliVersion: string;
  groupCount: number;
  commandCount: number;
  dangerousCommands: number;
  groups: Array<{ name: string; description: string; commandCount: number }>;
  mcpServer?: { command: string; args: string[] };
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

export async function loadVulcanToolCatalog(repoRoot: string): Promise<VulcanToolCatalog> {
  const vulcanRoot = resolveVulcanRoot(repoRoot);
  return readJsonFile<VulcanToolCatalog>(
    join(vulcanRoot, "vulcan-cli-master", "agents", "tool-catalog.json"),
  );
}

export async function loadVulcanMcpConfig(repoRoot: string): Promise<VulcanMcpConfig> {
  void repoRoot;
  // Do not inspect project MCP config files here. They can contain plaintext
  // wallet passwords in some agent setups; the safe launch contract is enough
  // for UI/catalog posture.
  return {
    mcpServers: {
      vulcan: {
        command: "vulcan",
        args: ["mcp"],
      },
    },
  };
}

export async function summarizeVulcanCatalog(repoRoot: string): Promise<VulcanCatalogSummary> {
  const [catalog, mcp] = await Promise.all([
    loadVulcanToolCatalog(repoRoot),
    loadVulcanMcpConfig(repoRoot),
  ]);

  const groups = Object.entries(catalog.groups).map(([name, description]) => ({
    name,
    description,
    commandCount: catalog.commands.filter((command) => command.group === name).length,
  }));

  const dangerousCommands = catalog.commands.filter((command) => command.dangerous).length;
  const mcpServer = mcp.mcpServers?.vulcan;

  return {
    cliVersion: catalog.cli_version,
    groupCount: groups.length,
    commandCount: catalog.commands.length,
    dangerousCommands,
    groups,
    ...(mcpServer
      ? { mcpServer: { command: mcpServer.command, args: mcpServer.args ?? [] } }
      : {}),
  };
}
