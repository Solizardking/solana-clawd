import type { UserAgent } from "@shared/schema";
import { getUserAgentRuntimeProfile } from "./userAgentRuntime";

const PHOENIX_API = "https://perp-api.phoenix.trade";

function hasEnv(key: string) {
  return Boolean((process.env[key] ?? "").toString().trim());
}

function hasAnyEnv(...keys: string[]) {
  return keys.some(hasEnv);
}

export interface UserAgentAdapterStatus {
  adapter: string;
  ok: boolean;
  title: string;
  details: string[];
  metrics: Record<string, unknown>;
}

export async function getUserAgentAdapterStatus(userAgent: UserAgent): Promise<UserAgentAdapterStatus> {
  const profile = getUserAgentRuntimeProfile(userAgent);

  switch (profile.adapter) {
    case "phoenix-perps-backend": {
      let marketCount: number | null = null;
      let apiReachable = false;
      try {
        const response = await fetch(`${PHOENIX_API}/exchange/markets`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (response.ok) {
          const data = await response.json();
          marketCount = Array.isArray(data) ? data.length : Array.isArray(data?.markets) ? data.markets.length : null;
          apiReachable = true;
        }
      } catch {}

      const builderConfigured = hasAnyEnv(
        "PHOENIX_BUILDER_AUTHORITY",
        "PHOENIX_FLIGHT_BUILDER_AUTHORITY",
        "PHOENIX_LEGACY_BUILDER_AUTHORITY",
        "VITE_PHOENIX_BUILDER_AUTHORITY",
        "VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY",
        "VITE_PHOENIX_LEGACY_BUILDER_AUTHORITY",
      );
      return {
        adapter: profile.adapter,
        ok: apiReachable && builderConfigured,
        title: "Phoenix Perps Runtime",
        details: [
          apiReachable ? "Phoenix public API reachable." : "Phoenix public API not reachable right now.",
          builderConfigured ? "Builder authority configured." : "Builder authority env is missing.",
        ],
        metrics: {
          marketCount,
          apiReachable,
          builderConfigured,
        },
      };
    }
    case "metaplex-mint": {
      const rpcConfigured = hasEnv("HELIUS_RPC_URL") || hasEnv("HELIUS_API_KEY") || hasEnv("SOLANA_RPC_URL");
      const walletConfigured = hasEnv("FEE_PAYER_SECRET_KEY") || hasEnv("WALLET_PRIVATE_KEY") || hasEnv("SOLANA_PRIVATE_KEY");
      const treasuryConfigured =
        hasEnv("TREASURY_KEY") ||
        hasEnv("TREASURY_WALLET") ||
        hasEnv("ADMIN_WALLET") ||
        hasEnv("ADMINWALLET");
      const stakingWalletConfigured = hasEnv("WALLET_PRIVATE_KEY");
      return {
        adapter: profile.adapter,
        ok: rpcConfigured && walletConfigured,
        title: "Metaplex Agent Runtime",
        details: [
          rpcConfigured ? "RPC is configured." : "RPC env is missing.",
          walletConfigured ? "Fee payer / signing wallet is configured." : "Fee payer / signing wallet env is missing.",
          stakingWalletConfigured ? "Staking lock-layer signer is configured." : "Staking lock-layer signer is missing.",
          treasuryConfigured ? "Treasury support is configured." : "Treasury support is missing.",
        ],
        metrics: {
          rpcConfigured,
          walletConfigured,
          stakingWalletConfigured,
          treasuryConfigured,
          network:
            (process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "").includes("mainnet")
              ? "mainnet-beta"
              : "unknown",
        },
      };
    }
    case "pumpfun-rust-backend": {
      const rpcConfigured = hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL");
      const telegramConfigured = hasEnv("TELEGRAM_BOT_TOKEN") || hasEnv("TELEGRAM_AGENT_HOST_BOT_TOKEN");
      const jupiterConfigured = hasEnv("JUPITER_API_KEY");
      const birdeyeConfigured = hasEnv("BIRDEYE_API_KEY");
      return {
        adapter: profile.adapter,
        ok: rpcConfigured && telegramConfigured,
        title: "Pump.fun Runtime",
        details: [
          rpcConfigured ? "Solana RPC configured." : "Solana RPC env missing.",
          telegramConfigured ? "Telegram delivery configured." : "Telegram delivery env missing.",
          jupiterConfigured ? "Jupiter API configured." : "Jupiter API not configured.",
          birdeyeConfigured ? "Birdeye API configured." : "Birdeye API not configured.",
        ],
        metrics: {
          rpcConfigured,
          telegramConfigured,
          jupiterConfigured,
          birdeyeConfigured,
        },
      };
    }
    case "plugin-delivery": {
      const baseConfigured = hasEnv("CLAWDROUTER_BASE_URL");
      const authConfigured = hasEnv("CLAWDROUTER_API_KEY") || hasEnv("X402_AUTH_TOKEN");
      const treasuryConfigured =
        hasEnv("TREASURY_KEY") ||
        hasEnv("TREASURY_WALLET") ||
        hasEnv("ADMIN_WALLET") ||
        hasEnv("ADMINWALLET");
      const dflowConfigured = hasEnv("DFLOW_API_KEY");
      const marketDataConfigured = hasEnv("JUPITER_API_KEY") || hasEnv("SOLANA_TRACKER_API_KEY") || hasEnv("BIRDEYE_API_KEY");
      return {
        adapter: profile.adapter,
        ok: baseConfigured && authConfigured,
        title: "Gateway / Plugin Runtime",
        details: [
          baseConfigured ? "Router base URL configured." : "Router base URL missing.",
          authConfigured ? "Router auth configured." : "Router auth missing.",
          treasuryConfigured ? "Treasury support configured." : "Treasury support missing.",
          dflowConfigured ? "DFlow support configured." : "DFlow support missing.",
          marketDataConfigured ? "At least one market-data backend configured." : "No market-data backend configured.",
        ],
        metrics: {
          baseConfigured,
          authConfigured,
          treasuryConfigured,
          dflowConfigured,
          marketDataConfigured,
          baseUrl: process.env.CLAWDROUTER_BASE_URL || null,
        },
      };
    }
    case "telegram-hosted": {
      const telegramConfigured = hasEnv("TELEGRAM_AGENT_HOST_BOT_TOKEN") || hasEnv("TELEGRAM_BOT_TOKEN");
      return {
        adapter: profile.adapter,
        ok: telegramConfigured,
        title: "Telegram Host Runtime",
        details: [
          telegramConfigured ? "Telegram bot configured." : "Telegram bot env missing.",
        ],
        metrics: { telegramConfigured },
      };
    }
    case "solana-oracle": {
      const rpcConfigured = hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL");
      const heliusApiConfigured = hasEnv("HELIUS_API_KEY");
      const metaplexConfigured = hasEnv("FEE_PAYER_SECRET_KEY") || hasEnv("WALLET_PRIVATE_KEY") || hasEnv("SOLANA_PRIVATE_KEY");
      return {
        adapter: profile.adapter,
        ok: rpcConfigured,
        title: "Oracle Runtime",
        details: [
          rpcConfigured ? "On-chain RPC configured." : "On-chain RPC env missing.",
          heliusApiConfigured ? "Helius API key configured." : "Helius API key missing.",
          metaplexConfigured ? "On-chain identity signer configured." : "On-chain identity signer missing.",
        ],
        metrics: {
          rpcConfigured,
          heliusApiConfigured,
          metaplexConfigured,
        },
      };
    }
    case "cloudflare-agent-api": {
      const databaseConfigured = hasEnv("DATABASE_URL");
      const rpcConfigured = hasEnv("SOLANA_RPC_URL") || hasEnv("HELIUS_RPC_URL");
      const boxesConfigured = hasEnv("UPSTASH_BOX_API_KEY") || hasEnv("NEONBOX_API_KEY");
      const objectStoreConfigured = hasEnv("SUPABASE_URL") && (hasEnv("SUPABASE_SERVICE_ROLE") || hasEnv("SUPABASE_SERVICE_ROLE_KEY"));
      const convexConfigured = hasEnv("CONVEX_URL") || hasEnv("CONVEX_SITE_URL") || hasEnv("VITE_CONVEX_URL");
      return {
        adapter: profile.adapter,
        ok: databaseConfigured && rpcConfigured,
        title: "Cloudflare Agent API Runtime",
        details: [
          databaseConfigured ? "Database configured." : "Database env missing.",
          rpcConfigured ? "Solana RPC configured." : "Solana RPC env missing.",
          boxesConfigured ? "Upstash/Neon box execution configured." : "Box execution env missing.",
          objectStoreConfigured ? "Gallery storage configured." : "Gallery storage env missing.",
          convexConfigured ? "Convex runtime configured." : "Convex env missing.",
        ],
        metrics: {
          databaseConfigured,
          rpcConfigured,
          boxesConfigured,
          objectStoreConfigured,
          convexConfigured,
        },
      };
    }
    case "cheshire-chat":
    default: {
      const sessionConfigured = hasEnv("SESSION_SECRET") && hasEnv("BETTER_AUTH_SECRET");
      return {
        adapter: profile.adapter,
        ok: sessionConfigured,
        title: "Cheshire Chat Runtime",
        details: [sessionConfigured ? "Core Cheshire auth/session env configured." : "Core Cheshire auth/session env missing."],
        metrics: { sessionConfigured },
      };
    }
  }
}
