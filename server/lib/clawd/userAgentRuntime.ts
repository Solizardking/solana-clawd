import type { UserAgent } from "@shared/schema";
import type { BrowserAgent } from "./browserAgents";
import { getBrowserAgent, loadBrowserAgents } from "./browserAgents";
import { deriveBrowserAgentRecommendation } from "./browserAgentRecommendations";

type RuntimeAdapter =
  | "telegram-hosted"
  | "cheshire-chat"
  | "metaplex-mint"
  | "pumpfun-rust-backend"
  | "phoenix-perps-backend"
  | "cloudflare-agent-api"
  | "plugin-delivery"
  | "solana-oracle";

interface RuntimeDependency {
  key: string;
  label: string;
  configured: boolean;
}

export interface UserAgentRuntimeProfile {
  runtime: string;
  adapter: RuntimeAdapter;
  status: "ready" | "partial";
  sourceAgentId: string | null;
  sourceTitle: string | null;
  summary: string;
  dependencies: RuntimeDependency[];
  missing: string[];
  relatedProjects: string[];
  deployPaths: Array<{ label: string; path: string }>;
}

function isConfigured(key: string) {
  return Boolean((process.env[key] ?? "").toString().trim());
}

function dependency(key: string, label = key): RuntimeDependency {
  return { key, label, configured: isConfigured(key) };
}

export interface ImportedAgentRuntimeProfile {
  runtime: string;
  adapter: RuntimeAdapter;
  status: "ready" | "partial";
  sourceAgentId: string;
  sourceTitle: string;
  summary: string;
  dependencies: RuntimeDependency[];
  missing: string[];
  relatedProjects: string[];
  deployPaths: Array<{ label: string; path: string }>;
}

function adapterFor(userAgent: UserAgent): RuntimeAdapter {
  const imported = (userAgent.importedSpec ?? {}) as Record<string, any>;
  const recommendation = imported.recommendation as Record<string, any> | undefined;
  const sourceId = String(userAgent.sourceAgentId ?? imported.sourceAgentId ?? "").toLowerCase();
  const runtime = String(userAgent.launchRuntime ?? recommendation?.runtime ?? "cheshire-chat");

  if (sourceId.includes("pumpfun")) return "pumpfun-rust-backend";
  if (sourceId.includes("vulcan") || sourceId.includes("perps")) return "phoenix-perps-backend";
  if (sourceId.includes("oracle")) return "solana-oracle";
  if (sourceId.includes("orchestrator") || sourceId.includes("payment")) return "plugin-delivery";
  if (runtime === "metaplex-mint") return "metaplex-mint";
  if (runtime === "telegram-agent") return "telegram-hosted";
  if (runtime === "external-subproject") return "cloudflare-agent-api";
  return "cheshire-chat";
}

function adapterForImportedAgent(agent: BrowserAgent): { adapter: RuntimeAdapter; runtime: string } {
  const payload = loadBrowserAgents();
  const recommendation = deriveBrowserAgentRecommendation(agent, payload);
  const runtime = String(recommendation.runtime ?? "cheshire-chat");
  const sourceId = agent.id.toLowerCase();

  if (sourceId.includes("pumpfun")) return { adapter: "pumpfun-rust-backend", runtime };
  if (sourceId.includes("vulcan") || sourceId.includes("perps")) return { adapter: "phoenix-perps-backend", runtime };
  if (sourceId.includes("oracle")) return { adapter: "solana-oracle", runtime };
  if (sourceId.includes("orchestrator") || sourceId.includes("payment")) return { adapter: "plugin-delivery", runtime };
  if (runtime === "metaplex-mint") return { adapter: "metaplex-mint", runtime };
  if (runtime === "telegram-agent") return { adapter: "telegram-hosted", runtime };
  if (runtime === "external-subproject") return { adapter: "cloudflare-agent-api", runtime };
  return { adapter: "cheshire-chat", runtime };
}

function buildRuntimeProfileParts(adapter: RuntimeAdapter) {
  let summary = "Cheshire-native persistent agent profile.";
  let dependencies: RuntimeDependency[] = [];
  let relatedProjects: string[] = [];

  switch (adapter) {
    case "telegram-hosted":
      summary = "Persistent Telegram-hosted Cheshire agent using the imported persona and runtime guidance.";
      dependencies = [
        dependency("TELEGRAM_AGENT_HOST_BOT_TOKEN"),
        dependency("TELEGRAM_AGENT_HOST_BOT_USERNAME"),
        dependency("OPENAI_API_KEY", "OPENAI_API_KEY or provider equivalent"),
      ];
      relatedProjects = ["characters", "src", "docs"];
      break;
    case "metaplex-mint":
      summary = "Cheshire persona paired with imported Metaplex mint/registry and staking flows.";
      dependencies = [
        dependency("HELIUS_RPC_URL"),
        dependency("FEE_PAYER_SECRET_KEY"),
        dependency("WALLET_PRIVATE_KEY"),
      ];
      relatedProjects = ["agent-minter", "Agent-Staking_Unstaking_solana_metaplex_core", "templates"];
      break;
    case "pumpfun-rust-backend":
      summary = "Imported Pump.fun copy-trading architecture with Cheshire as orchestration and persona shell.";
      dependencies = [
        dependency("HELIUS_RPC_URL"),
        dependency("JUPITER_API_KEY"),
        dependency("BIRDEYE_API_KEY"),
        dependency("WALLET_PRIVATE_KEY"),
        dependency("TELEGRAM_BOT_TOKEN"),
      ];
      relatedProjects = ["solana-pumpfun-bot-master", "skills", "docs"];
      break;
    case "phoenix-perps-backend":
      summary = "Imported Phoenix/Vulcan perps runtime with gated execution and Cheshire front-end/operator control.";
      dependencies = [
        dependency("HELIUS_RPC_URL"),
        dependency("PHOENIX_BUILDER_AUTHORITY"),
        dependency("PHOENIX_FLIGHT_BUILDER_AUTHORITY"),
        dependency("PHOENIX_BUILDER_TRADER_ACCOUNT"),
        dependency("VITE_PHOENIX_BUILDER_AUTHORITY"),
        dependency("WALLET_PRIVATE_KEY"),
      ];
      relatedProjects = ["clawd-agents-perps", "docs", "skills"];
      break;
    case "cloudflare-agent-api":
      summary = "External subproject mode intended to pair Cheshire agents with the imported Cloudflare edge agent API.";
      dependencies = [
        dependency("DATABASE_URL"),
        dependency("SOLANA_RPC_URL"),
        dependency("CROSSMINT_SERVER_SIDE_API_KEY"),
      ];
      relatedProjects = ["cloudflare-agent-api", "schema", "scripts"];
      break;
    case "plugin-delivery":
      summary = "Imported orchestration/payment profile intended to route through plugin/gateway style infrastructure.";
      dependencies = [
        dependency("CLAWDROUTER_BASE_URL"),
        dependency("CLAWDROUTER_API_KEY"),
        dependency("X402_AUTH_TOKEN"),
      ];
      relatedProjects = ["plugin.delivery", "defi-agents", ".well-known"];
      break;
    case "solana-oracle":
      summary = "Imported Solana oracle/program profile best paired with on-chain or attested execution surfaces.";
      dependencies = [
        dependency("HELIUS_RPC_URL"),
        dependency("WALLET_PRIVATE_KEY"),
      ];
      relatedProjects = ["solana-gpt-oracle", "agent-template-attested.json", "vault-agent.json"];
      break;
    case "cheshire-chat":
    default:
      summary = "Cheshire-native runtime using imported browser-agents persona, docs, and deploy metadata.";
      dependencies = [
        dependency("SESSION_SECRET"),
        dependency("BETTER_AUTH_SECRET"),
      ];
      relatedProjects = ["src", "docs", "locales"];
      break;
  }

  return { summary, dependencies, relatedProjects };
}

export function getUserAgentRuntimeProfile(userAgent: UserAgent): UserAgentRuntimeProfile {
  const payload = loadBrowserAgents();
  const sourceAgent = userAgent.sourceAgentId ? getBrowserAgent(userAgent.sourceAgentId) : null;
  const imported = (userAgent.importedSpec ?? {}) as Record<string, any>;
  const recommendation =
    sourceAgent ? deriveBrowserAgentRecommendation(sourceAgent, payload) : imported.recommendation ?? null;
  const runtime = String(userAgent.launchRuntime ?? recommendation?.runtime ?? "cheshire-chat");
  const adapter = adapterFor(userAgent);
  const { summary, dependencies, relatedProjects } = buildRuntimeProfileParts(adapter);

  const missing = dependencies.filter((item) => !item.configured).map((item) => item.key);
  const deployPaths = recommendation?.deployPaths ?? [];

  return {
    runtime,
    adapter,
    status: missing.length === 0 ? "ready" : "partial",
    sourceAgentId: userAgent.sourceAgentId ?? sourceAgent?.id ?? null,
    sourceTitle: sourceAgent?.title ?? (imported.sourceTitle as string | null) ?? null,
    summary,
    dependencies,
    missing,
    relatedProjects,
    deployPaths,
  };
}

export function getImportedAgentRuntimeProfile(agent: BrowserAgent): ImportedAgentRuntimeProfile {
  const payload = loadBrowserAgents();
  const recommendation = deriveBrowserAgentRecommendation(agent, payload);
  const { adapter, runtime } = adapterForImportedAgent(agent);
  const { summary, dependencies, relatedProjects } = buildRuntimeProfileParts(adapter);
  const missing = dependencies.filter((item) => !item.configured).map((item) => item.key);

  return {
    runtime,
    adapter,
    status: missing.length === 0 ? "ready" : "partial",
    sourceAgentId: agent.id,
    sourceTitle: agent.title,
    summary,
    dependencies,
    missing,
    relatedProjects,
    deployPaths: recommendation.deployPaths ?? [],
  };
}
