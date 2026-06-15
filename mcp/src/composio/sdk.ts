import { Composio } from "@composio/core";
import type {
  ConnectedAccountListResponseItem,
  ConnectionRequest,
  Session,
} from "@composio/core";
import {
  assertComposioApiKey,
  getClawdComposioConfig,
  type ClawdComposioConfig,
  type ClawdComposioConfigOverrides,
} from "./config.js";

export interface CreateClawdComposioOptions extends ClawdComposioConfigOverrides {
  disableVersionCheck?: boolean;
}

export function createClawdComposio(
  options: CreateClawdComposioOptions = {},
): {
  composio: Composio;
  config: ClawdComposioConfig;
} {
  const config = getClawdComposioConfig(options);
  const apiKey = assertComposioApiKey(config);

  const composio = new Composio({
    apiKey,
    baseURL: config.baseURL,
    host: config.host,
    disableVersionCheck: options.disableVersionCheck ?? true,
  });

  return { composio, config };
}

export async function createClawdSession(
  sessionConfig?: Parameters<Composio["create"]>[1],
  options: CreateClawdComposioOptions = {},
): Promise<{
  composio: Composio;
  config: ClawdComposioConfig;
  session: Session<unknown, unknown, Composio["provider"]>;
}> {
  const { composio, config } = createClawdComposio(options);
  const session = await composio.create(config.userId, sessionConfig);
  return { composio, config, session };
}

export async function listClawdConnectedAccounts(
  options: CreateClawdComposioOptions = {},
): Promise<{
  composio: Composio;
  config: ClawdComposioConfig;
  accounts: ConnectedAccountListResponseItem[];
}> {
  const { composio, config } = createClawdComposio(options);
  const response = await composio.connectedAccounts.list({
    userIds: [config.userId],
  });
  return { composio, config, accounts: response.items };
}

export async function authorizeClawdToolkit(
  toolkit: string,
  sessionConfig?: Parameters<Composio["create"]>[1],
  options: CreateClawdComposioOptions = {},
): Promise<{
  composio: Composio;
  config: ClawdComposioConfig;
  session: Session<unknown, unknown, Composio["provider"]>;
  request: ConnectionRequest;
}> {
  const { composio, config, session } = await createClawdSession(
    sessionConfig,
    options,
  );
  const request = await session.authorize(toolkit);
  return { composio, config, session, request };
}
