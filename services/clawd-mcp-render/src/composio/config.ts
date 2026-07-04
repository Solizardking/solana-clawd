export interface ClawdComposioConfig {
  apiKey?: string;
  baseURL?: string;
  projectId: string;
  orgId: string;
  orgMemberEmail: string;
  userId: string;
  host: string;
}

export interface ClawdComposioConfigOverrides {
  apiKey?: string;
  baseURL?: string;
  projectId?: string;
  orgId?: string;
  orgMemberEmail?: string;
  userId?: string;
  host?: string;
}

const DEFAULT_PROJECT_ID = "pr_EfJnixWA-18L";
const DEFAULT_ORG_ID = "ok_AzkvMFngCFIJ";
const DEFAULT_ORG_MEMBER_EMAIL = "beetsbyj@gmail.com";
const DEFAULT_USER_ID = "0e9b47dd-2f4d-441e-bb96-87859317ed17";

export function getClawdComposioConfig(
  overrides: ClawdComposioConfigOverrides = {},
): ClawdComposioConfig {
  return {
    apiKey: overrides.apiKey ?? process.env.COMPOSIO_API_KEY,
    baseURL: overrides.baseURL ?? process.env.COMPOSIO_BASE_URL,
    projectId:
      overrides.projectId ??
      process.env.COMPOSIO_PROJECT_ID ??
      DEFAULT_PROJECT_ID,
    orgId: overrides.orgId ?? process.env.COMPOSIO_ORG_ID ?? DEFAULT_ORG_ID,
    orgMemberEmail:
      overrides.orgMemberEmail ??
      process.env.COMPOSIO_ORG_MEMBER_EMAIL ??
      DEFAULT_ORG_MEMBER_EMAIL,
    userId: overrides.userId ?? process.env.COMPOSIO_USER_ID ?? DEFAULT_USER_ID,
    host: overrides.host ?? process.env.COMPOSIO_HOST ?? "solana-clawd-mcp",
  };
}

export function assertComposioApiKey(
  config: Pick<ClawdComposioConfig, "apiKey">,
): string {
  if (!config.apiKey) {
    throw new Error(
      "COMPOSIO_API_KEY is required. Set it in your environment before using the Composio integration.",
    );
  }
  return config.apiKey;
}
