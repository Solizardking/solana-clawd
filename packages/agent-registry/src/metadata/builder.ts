import type { AgentMetadata, AgentService, AgentRegistration } from "../types.js";

export interface BuildMetadataOpts {
  name: string;
  description: string;
  image?: string;
  services?: AgentService[];
  registrations?: AgentRegistration[];
  supportedTrust?: string[];
  models?: string[];
  capabilities?: string[];
  pricing?: { unit: string; amount: number; token: string };
  active?: boolean;
}

export function buildMetadata(opts: BuildMetadataOpts): AgentMetadata {
  return {
    type: "agent",
    name: opts.name,
    description: opts.description,
    ...(opts.image ? { image: opts.image } : {}),
    services: opts.services ?? [],
    registrations: opts.registrations ?? [],
    supportedTrust: opts.supportedTrust ?? [],
    active: opts.active ?? true,
    ...(opts.models ? { models: opts.models } : {}),
    ...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
    ...(opts.pricing ? { pricing: opts.pricing } : {}),
    clawdVersion: "0.1.0",
  };
}

export function validateMetadata(
  metadata: unknown
): metadata is AgentMetadata {
  if (typeof metadata !== "object" || metadata === null) return false;
  const m = metadata as Record<string, unknown>;
  return (
    m.type === "agent" &&
    typeof m.name === "string" &&
    m.name.length > 0 &&
    typeof m.description === "string" &&
    m.description.length > 0
  );
}

export function buildRegistrationDocument(
  assetAddress: string,
  metadata: AgentMetadata,
  serviceBaseUrl?: string
): Record<string, unknown> {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: metadata.name,
    description: metadata.description,
    ...(metadata.image ? { image: metadata.image } : {}),
    active: metadata.active ?? true,
    services: [
      ...(serviceBaseUrl
        ? [
            { name: "web", endpoint: `${serviceBaseUrl}/agent/${assetAddress}` },
            {
              name: "A2A",
              endpoint: `${serviceBaseUrl}/agent/${assetAddress}/agent-card.json`,
              version: "0.3.0",
            },
            {
              name: "MCP",
              endpoint: `${serviceBaseUrl}/agent/${assetAddress}/mcp`,
              version: "2025-06-18",
            },
          ]
        : []),
      ...(metadata.services ?? []),
    ],
    registrations: [
      {
        agentId: assetAddress,
        agentRegistry: "solana:101:metaplex",
      },
      ...(metadata.registrations ?? []),
    ],
    supportedTrust: metadata.supportedTrust ?? [],
    ...(metadata.models ? { models: metadata.models } : {}),
    ...(metadata.capabilities ? { capabilities: metadata.capabilities } : {}),
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    clawdVersion: "0.1.0",
  };
}
