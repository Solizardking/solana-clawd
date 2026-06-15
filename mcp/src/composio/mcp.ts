import {
  createClawdComposio,
  type CreateClawdComposioOptions,
} from "./sdk.js";

export interface EnsureClawdMcpServerOptions extends CreateClawdComposioOptions {
  name?: string;
  toolkits: string[];
  allowedTools?: string[];
  manuallyManageConnections?: boolean;
}

export interface ClawdMcpSetupResult {
  serverId: string;
  serverName: string;
  serverUrl: string;
  toolkits: string[];
  allowedTools: string[];
  userId: string;
  commands?: Record<string, string>;
  claudemcpJson: {
    mcpServers: Record<string, { type: "http"; url: string }>;
  };
}

export async function ensureClawdMcpServer(
  options: EnsureClawdMcpServerOptions,
): Promise<ClawdMcpSetupResult> {
  const {
    name = "solana-clawd-composio",
    toolkits,
    allowedTools = [],
    manuallyManageConnections = false,
    ...configOverrides
  } = options;

  if (toolkits.length === 0) {
    throw new Error("At least one Composio toolkit is required.");
  }

  const { composio, config } = createClawdComposio(configOverrides);
  const existing = await composio.mcp.list({
    name,
    page: 1,
    limit: 100,
    toolkits: [],
    authConfigs: [],
  });
  const match = existing.items.find((item) => item.name === name);

  const server = match
    ? await composio.mcp.update(match.id, {
        name,
        toolkits,
        allowedTools,
        manuallyManageConnections,
      })
    : await composio.mcp.create(name, {
        toolkits,
        allowedTools,
        manuallyManageConnections,
      });

  const instance = await composio.mcp.generate(config.userId, server.id, {
    manuallyManageConnections,
  });

  return {
    serverId: server.id,
    serverName: server.name,
    serverUrl: instance.url,
    toolkits,
    allowedTools,
    userId: config.userId,
    commands: "commands" in server ? (server.commands as Record<string, string>) : undefined,
    claudemcpJson: {
      mcpServers: {
        [server.name]: {
          type: "http",
          url: instance.url,
        },
      },
    },
  };
}
