import type { UserAgent } from "@shared/schema";
import type { BrowserAgent } from "./browserAgents";
import { loadBrowserAgents } from "./browserAgents";
import { getImportedAgentRuntimeProfile, getUserAgentRuntimeProfile } from "./userAgentRuntime";

type ServiceRecord = {
  name: string;
  endpoint: string;
  version?: string;
  description?: string;
  domains?: string[];
  skills?: string[];
};

type DeployPathRecord = {
  id?: string;
  label: string;
  description?: string;
};

export interface AgentPlatformContext {
  accessPatterns: Array<{ label: string; pattern: string }>;
  endpoints: Array<{ label: string; value: string }>;
  services: ServiceRecord[];
  infrastructure: Array<{ key: string; value: string }>;
  supportedTrust: string[];
  discovery: string[];
  deployPaths: DeployPathRecord[];
  constitution: {
    coreAxiom: string | null;
    principalHierarchy: string[];
    threeLaws: string[];
  } | null;
}

function entriesOfRecord(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [key, typeof raw === "string" ? raw : ""] as [string, string])
    .filter(([, raw]) => raw);
}

function normalizeServices(value: unknown): ServiceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ServiceRecord[]>((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : "";
      const endpoint = typeof record.endpoint === "string" ? record.endpoint : "";
      if (!name || !endpoint) return acc;
      acc.push({
        name,
        endpoint,
        version: typeof record.version === "string" ? record.version : undefined,
        description: typeof record.description === "string" ? record.description : undefined,
        domains: Array.isArray(record.domains) ? record.domains.filter((v): v is string => typeof v === "string") : undefined,
        skills: Array.isArray(record.skills) ? record.skills.filter((v): v is string => typeof v === "string") : undefined,
      });
      return acc;
    }, []);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function pickServices(services: ServiceRecord[], adapter: string): ServiceRecord[] {
  const byNames = (...names: string[]) => {
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    return services.filter((service) => wanted.has(service.name.toLowerCase()));
  };

  switch (adapter) {
    case "metaplex-mint":
      return byNames("catalog", "registry", "web");
    case "phoenix-perps-backend":
      return byNames("chat", "router", "api", "orchestrator");
    case "pumpfun-rust-backend":
      return byNames("chat", "api", "orchestrator");
    case "cloudflare-agent-api":
      return byNames("api", "A2A", "MCP");
    case "plugin-delivery":
      return byNames("x402", "router", "MCP", "A2A");
    case "solana-oracle":
      return byNames("registry", "catalog", "MCP");
    case "telegram-hosted":
      return byNames("chat", "orchestrator", "web");
    case "cheshire-chat":
    default:
      return byNames("web", "chat", "catalog");
  }
}

function pickInfrastructure(infrastructure: Record<string, unknown>, adapter: string) {
  const include = (keys: string[]) =>
    keys
      .map((key) => {
        const value = infrastructure[key];
        if (value == null) return null;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return { key, value: String(value) };
        }
        return null;
      })
      .filter((item): item is { key: string; value: string } => Boolean(item));

  switch (adapter) {
    case "metaplex-mint":
      return include(["chain", "token", "tokenMint", "collection", "agentWallet", "adminWallet"]);
    case "phoenix-perps-backend":
      return include(["chain", "provider", "model", "rpc", "router", "gateway"]);
    case "pumpfun-rust-backend":
      return include(["chain", "token", "rpc", "gateway", "agentWallet"]);
    case "cloudflare-agent-api":
      return include(["gateway", "router", "provider", "model"]);
    case "plugin-delivery":
      return include(["payment", "gateway", "router", "token", "tokenMint"]);
    case "solana-oracle":
      return include(["chain", "rpc", "agentAsset", "collection", "tokenMint"]);
    case "telegram-hosted":
      return include(["gateway", "router", "token", "agentWallet"]);
    case "cheshire-chat":
    default:
      return include(["chain", "provider", "model", "token", "gateway"]);
  }
}

function pickEndpoints(
  accessPatterns: Array<{ label: string; pattern: string }>,
  services: ServiceRecord[],
  deployPaths: DeployPathRecord[],
) {
  const serviceEndpoints = services.map((service) => ({
    label: service.name,
    value: service.endpoint,
  }));
  const deployEndpoints = deployPaths
    .filter((item) => item.label && item.description)
    .map((item) => ({
      label: item.label,
      value: item.description as string,
    }));
  return [...accessPatterns.slice(0, 3), ...serviceEndpoints.slice(0, 4), ...deployEndpoints.slice(0, 2)]
    .map((item) => ({ label: item.label, value: "value" in item ? item.value : item.pattern }))
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.label === item.label && candidate.value === item.value) === index);
}

function buildPlatformContext(adapter: string, deployPathsFromRuntime: Array<{ label: string; path: string }>): AgentPlatformContext {
  const payload = loadBrowserAgents();
  const manifest = payload.manifest as Record<string, unknown>;
  const clawd = payload.clawd as Record<string, unknown>;
  const catalogMeta = payload.catalogMeta as Record<string, unknown>;
  const infrastructure = (clawd.infrastructure as Record<string, unknown> | undefined) ?? {};
  const constitution = (clawd.constitution as Record<string, unknown> | undefined) ?? {};
  const accessPatterns = entriesOfRecord(manifest.accessPatterns).map(([label, pattern]) => ({ label, pattern }));
  const services = pickServices(normalizeServices(clawd.services), adapter);
  const catalogDeployPaths = Array.isArray(catalogMeta.deployPaths) ? (catalogMeta.deployPaths as Array<Record<string, unknown>>) : [];
  const deployPaths = catalogDeployPaths
    .reduce<DeployPathRecord[]>((acc, item) => {
      const id = typeof item.id === "string" ? item.id : undefined;
      const label = typeof item.label === "string" ? item.label : "";
      if (!label) return acc;
      acc.push({
        id,
        label,
        description: typeof item.description === "string" ? item.description : undefined,
      });
      return acc;
    }, [])
    .filter((item) => deployPathsFromRuntime.some((runtimePath) => runtimePath.label === item.label));

  const discovery = normalizeStringArray(infrastructure.discovery);
  const supportedTrust = normalizeStringArray(clawd.supportedTrust);

  return {
    accessPatterns,
    endpoints: pickEndpoints(accessPatterns, services, deployPaths),
    services,
    infrastructure: pickInfrastructure(infrastructure, adapter),
    supportedTrust,
    discovery,
    deployPaths,
    constitution: constitution
      ? {
          coreAxiom: typeof constitution.coreAxiom === "string" ? constitution.coreAxiom : null,
          principalHierarchy: normalizeStringArray(constitution.principalHierarchy),
          threeLaws: normalizeStringArray(constitution.threeLaws),
        }
      : null,
  };
}

export function getPlatformContextForImportedAgent(agent: BrowserAgent): AgentPlatformContext {
  const runtimeProfile = getImportedAgentRuntimeProfile(agent);
  return buildPlatformContext(runtimeProfile.adapter, runtimeProfile.deployPaths);
}

export function getPlatformContextForUserAgent(agent: UserAgent): AgentPlatformContext {
  const runtimeProfile = getUserAgentRuntimeProfile(agent);
  return buildPlatformContext(runtimeProfile.adapter, runtimeProfile.deployPaths);
}
