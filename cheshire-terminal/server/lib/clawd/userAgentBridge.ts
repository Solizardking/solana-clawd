import type { UserAgent } from "@shared/schema";
import { getUserAgentRuntimeProfile } from "./userAgentRuntime";

export interface UserAgentBridgeAction {
  label: string;
  method: "GET" | "POST";
  path: string;
  kind: "health" | "launch" | "read" | "write" | "ui";
  ready: boolean;
  details: string;
}

export interface UserAgentRuntimeBridge {
  adapter: string;
  status: "ready" | "partial";
  summary: string;
  actions: UserAgentBridgeAction[];
}

function hasEnv(key: string) {
  return Boolean((process.env[key] ?? "").toString().trim());
}

export function getUserAgentRuntimeBridge(userAgent: UserAgent): UserAgentRuntimeBridge {
  const profile = getUserAgentRuntimeProfile(userAgent);

  let actions: UserAgentBridgeAction[] = [];

  switch (profile.adapter) {
    case "pumpfun-rust-backend":
      actions = [
        {
          label: "Pump UI",
          method: "GET",
          path: "/pump",
          kind: "ui",
          ready: true,
          details: "Cheshire Pump surface for the imported Pump.fun bot persona.",
        },
        {
          label: "Metaplex Health",
          method: "GET",
          path: "/api/metaplex-agents/health",
          kind: "health",
          ready: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          details: "Checks the mint/registry side used by imported agent flows.",
        },
        {
          label: "Telegram Status",
          method: "GET",
          path: "/api/telegram/status",
          kind: "health",
          ready: hasEnv("TELEGRAM_BOT_TOKEN") || hasEnv("TELEGRAM_AGENT_HOST_BOT_TOKEN"),
          details: "Checks the bot delivery surface used by copy-trading/operator flows.",
        },
      ];
      break;
    case "phoenix-perps-backend":
      actions = [
        {
          label: "Perps UI",
          method: "GET",
          path: "/perps",
          kind: "ui",
          ready: true,
          details: "Phoenix/Vulcan surface for imported perps agents.",
        },
        {
          label: "Phoenix Markets",
          method: "GET",
          path: "/api/phoenix/markets",
          kind: "read",
          ready: true,
          details: "Reads live Phoenix market configs.",
        },
        {
          label: "Phoenix Builder Status",
          method: "GET",
          path: "/api/clawd/admin/whoami",
          kind: "health",
          ready:
            hasEnv("PHOENIX_BUILDER_AUTHORITY") ||
            hasEnv("PHOENIX_FLIGHT_BUILDER_AUTHORITY") ||
            hasEnv("PHOENIX_LEGACY_BUILDER_AUTHORITY") ||
            hasEnv("VITE_PHOENIX_BUILDER_AUTHORITY") ||
            hasEnv("VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY") ||
            hasEnv("VITE_PHOENIX_LEGACY_BUILDER_AUTHORITY"),
          details: "Confirms admin/operator path before live perps actions.",
        },
      ];
      break;
    case "metaplex-mint":
      actions = [
        {
          label: "Metaplex Agent Studio",
          method: "GET",
          path: "/metaplex-agents",
          kind: "ui",
          ready: true,
          details: "Mint and inspect imported agent registry assets.",
        },
        {
          label: "Metaplex Health",
          method: "GET",
          path: "/api/metaplex-agents/health",
          kind: "health",
          ready: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          details: "Checks RPC and fee-payer readiness.",
        },
        {
          label: "Mint Agent",
          method: "POST",
          path: "/api/metaplex-agents/mint",
          kind: "write",
          ready: hasEnv("FEE_PAYER_SECRET_KEY") || hasEnv("WALLET_PRIVATE_KEY"),
          details: "Gasless mint flow for the imported agent profile.",
        },
        {
          label: "NFT Studio Health",
          method: "GET",
          path: "/api/nft/health",
          kind: "health",
          ready: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          details: "Checks the broader Metaplex Core mint/update surface.",
        },
        {
          label: "Staking Stats",
          method: "GET",
          path: "/api/staking/stats",
          kind: "read",
          ready: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          details: "Reads live lock-layer staking totals for imported staking agents.",
        },
        {
          label: "Stake Config",
          method: "GET",
          path: "/api/clawd-stake/config",
          kind: "read",
          ready: true,
          details: "Shows imported reward-layer staking plan and status.",
        },
        {
          label: "Treasury Status",
          method: "GET",
          path: "/api/treasury/status",
          kind: "health",
          ready:
            hasEnv("TREASURY_KEY") ||
            hasEnv("TREASURY_WALLET") ||
            hasEnv("ADMIN_WALLET") ||
            hasEnv("ADMINWALLET"),
          details: "Checks treasury wallet and burn/payment support used by imported asset flows.",
        },
      ];
      break;
    case "cloudflare-agent-api":
      actions = [
        {
          label: "Browser Agents Hub",
          method: "GET",
          path: "/agents",
          kind: "ui",
          ready: true,
          details: "Use imported browser-agents metadata while the Cloudflare edge API remains an external backend.",
        },
        {
          label: "Public Config",
          method: "GET",
          path: "/api/public-config",
          kind: "health",
          ready: true,
          details: "Confirms public runtime wiring before edge/API handoff.",
        },
        {
          label: "Boxes",
          method: "GET",
          path: "/api/boxes",
          kind: "read",
          ready: hasEnv("UPSTASH_BOX_API_KEY") || hasEnv("NEONBOX_API_KEY"),
          details: "Lists isolated execution boxes for imported edge/coding-agent flows.",
        },
        {
          label: "OpenClawd Box",
          method: "GET",
          path: "/api/boxes/openclawd",
          kind: "health",
          ready: hasEnv("UPSTASH_BOX_API_KEY") || hasEnv("NEONBOX_API_KEY"),
          details: "Checks the pinned execution box referenced by imported cloudflare-agent-api patterns.",
        },
        {
          label: "Gallery",
          method: "GET",
          path: "/api/gallery",
          kind: "read",
          ready: true,
          details: "Reads object-store-backed media and agent artifacts.",
        },
      ];
      break;
    case "plugin-delivery":
      actions = [
        {
          label: "CLAWD Router Status",
          method: "GET",
          path: "/api/clawdrouter/status",
          kind: "health",
          ready: hasEnv("CLAWDROUTER_BASE_URL") && (hasEnv("CLAWDROUTER_API_KEY") || hasEnv("X402_AUTH_TOKEN")),
          details: "Gateway health for imported plugin/payment/orchestration agents.",
        },
        {
          label: "CLAWD Router Models",
          method: "GET",
          path: "/api/clawdrouter/models",
          kind: "read",
          ready: true,
          details: "Lists available routed model backends.",
        },
        {
          label: "Treasury Status",
          method: "GET",
          path: "/api/treasury/status",
          kind: "health",
          ready:
            hasEnv("TREASURY_KEY") ||
            hasEnv("TREASURY_WALLET") ||
            hasEnv("ADMIN_WALLET") ||
            hasEnv("ADMINWALLET"),
          details: "Checks treasury wallet support for payment-routing agents.",
        },
        {
          label: "DFlow Status",
          method: "GET",
          path: "/api/dflow/status",
          kind: "health",
          ready: hasEnv("DFLOW_API_KEY"),
          details: "Checks DFlow prediction/quote market support for imported DeFi agents.",
        },
        {
          label: "Jupiter Tokens",
          method: "GET",
          path: "/api/jupiter-tokens/recent",
          kind: "read",
          ready: true,
          details: "Reads the token discovery surface used by imported routing agents.",
        },
        {
          label: "Prediction Status",
          method: "GET",
          path: "/api/jupiter-prediction/trading-status",
          kind: "read",
          ready: true,
          details: "Checks prediction market trading availability for imported market routers.",
        },
      ];
      break;
    case "solana-oracle":
      actions = [
        {
          label: "Metaplex Health",
          method: "GET",
          path: "/api/metaplex-agents/health",
          kind: "health",
          ready: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          details: "Checks the on-chain surface this oracle-style agent would rely on.",
        },
        {
          label: "Agent Templates",
          method: "GET",
          path: "/agent-templates",
          kind: "ui",
          ready: true,
          details: "Review attested/vault-oriented templates imported from browser-agents.",
        },
        {
          label: "Attested Template",
          method: "GET",
          path: "/api/clawd/browser-agent-templates/agent-template-attested",
          kind: "read",
          ready: true,
          details: "Reads the imported attested-agent scaffold from browser-agents.",
        },
        {
          label: "Helius Specialist",
          method: "GET",
          path: "/api/clawd/browser-agents/solana-helius-specialist",
          kind: "read",
          ready: true,
          details: "Loads the imported Helius-specialist persona and deploy metadata.",
        },
        {
          label: "NFT Health",
          method: "GET",
          path: "/api/nft/health",
          kind: "health",
          ready: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          details: "Checks Metaplex Core support for oracle identity artifacts.",
        },
      ];
      break;
    case "telegram-hosted":
      actions = [
        {
          label: "Telegram Status",
          method: "GET",
          path: "/api/telegram/status",
          kind: "health",
          ready: hasEnv("TELEGRAM_AGENT_HOST_BOT_TOKEN") || hasEnv("TELEGRAM_BOT_TOKEN"),
          details: "Checks persistent Telegram delivery.",
        },
      ];
      break;
    case "cheshire-chat":
    default:
      actions = [
        {
          label: "Agent Hub",
          method: "GET",
          path: "/agents",
          kind: "ui",
          ready: true,
          details: "Browse imported agents and templates.",
        },
        {
          label: "Public Config",
          method: "GET",
          path: "/api/public-config",
          kind: "health",
          ready: true,
          details: "Checks browser-safe runtime wiring.",
        },
      ];
      break;
  }

  return {
    adapter: profile.adapter,
    status: profile.status,
    summary: profile.summary,
    actions,
  };
}
