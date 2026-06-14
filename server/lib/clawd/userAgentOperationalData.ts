import type { UserAgent } from "@shared/schema";
import { getBrowserAgentTemplate, loadBrowserAgents } from "./browserAgents";
import { deriveBrowserAgentRecommendation } from "./browserAgentRecommendations";
import { getUserAgentRuntimeProfile } from "./userAgentRuntime";

const PHOENIX_API = "https://perp-api.phoenix.trade";

function hasEnv(key: string) {
  return Boolean((process.env[key] ?? "").toString().trim());
}

function getAppBaseUrl() {
  const explicit =
    configuredEnvValue("APP_ORIGIN", "APP_URL", "VITE_APP_URL", "BETTER_AUTH_URL") ??
    `http://127.0.0.1:${process.env.PORT || "5000"}`;
  return explicit.replace(/\/api\/auth\/?$/, "").replace(/\/$/, "");
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function configuredEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = (process.env[key] ?? "").toString().trim();
    if (value) return value;
  }
  return null;
}

function toArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (Array.isArray((value as any)?.data)) return (value as any).data as T[];
  if (Array.isArray((value as any)?.items)) return (value as any).items as T[];
  if (Array.isArray((value as any)?.results)) return (value as any).results as T[];
  if (Array.isArray((value as any)?.trades)) return (value as any).trades as T[];
  if (Array.isArray((value as any)?.orders)) return (value as any).orders as T[];
  if (Array.isArray((value as any)?.history)) return (value as any).history as T[];
  return [];
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

async function fetchOptionalJson(url: string) {
  try {
    return await fetchJson(url);
  } catch (error) {
    return { _error: error instanceof Error ? error.message : String(error) };
  }
}

function isErrorLike(value: unknown) {
  return Boolean(value && typeof value === "object" && "_error" in (value as Record<string, unknown>));
}

export interface UserAgentOperationalData {
  adapter: string;
  kind: "perps" | "metaplex" | "pumpfun" | "gateway" | "oracle" | "telegram" | "generic";
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
}

export async function getUserAgentOperationalData(userAgent: UserAgent): Promise<UserAgentOperationalData> {
  const profile = getUserAgentRuntimeProfile(userAgent);

  switch (profile.adapter) {
    case "phoenix-perps-backend": {
      const marketsRaw = await fetchJson(`${PHOENIX_API}/exchange/markets`);
      const markets = Array.isArray(marketsRaw)
        ? marketsRaw
        : Array.isArray((marketsRaw as any)?.markets)
          ? (marketsRaw as any).markets
          : [];
      const topMarkets = markets
        .slice(0, 5)
        .map((market: any) => ({
          symbol: market.symbol ?? market.marketSymbol ?? market.name ?? "unknown",
          status: market.status ?? market.marketStatus ?? "unknown",
          oracle: market.oracleSymbol ?? market.oracle ?? null,
          markPrice:
            pickNumber(
              market.markPrice,
              market.lastMarkPrice,
              market.lastPrice,
              market.price,
            ),
        }));
      const activeMarkets = markets.filter((market: any) => {
        const status = String(market.status ?? market.marketStatus ?? "").toLowerCase();
        return status.includes("active") || status.includes("live") || status === "open";
      }).length;
      const builderAuthority = configuredEnvValue(
        "PHOENIX_BUILDER_AUTHORITY",
        "PHOENIX_FLIGHT_BUILDER_AUTHORITY",
        "PHOENIX_LEGACY_BUILDER_AUTHORITY",
        "VITE_PHOENIX_BUILDER_AUTHORITY",
        "VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY",
        "VITE_PHOENIX_LEGACY_BUILDER_AUTHORITY",
      );
      const builderTrader = configuredEnvValue(
        "PHOENIX_BUILDER_TRADER_ACCOUNT",
        "PHOENIX_FLIGHT_FEE_COLLECTOR_TRADER",
        "VITE_PHOENIX_BUILDER_TRADER_ACCOUNT",
        "VITE_PHOENIX_FLIGHT_FEE_COLLECTOR_TRADER",
      );
      const pdaIndex = Number(
        configuredEnvValue(
          "PHOENIX_BUILDER_PDA_INDEX",
          "PHOENIX_FLIGHT_BUILDER_PDA_INDEX",
          "VITE_PHOENIX_BUILDER_PDA_INDEX",
          "VITE_PHOENIX_FLIGHT_BUILDER_PDA_INDEX",
        ) ?? "0",
      );

      let traderSnapshot: Record<string, unknown> | null = null;

      if (builderAuthority) {
        const [stateRaw, pnlRaw, ordersRaw, tradesRaw] = await Promise.all([
          fetchOptionalJson(`${PHOENIX_API}/trader/${encodeURIComponent(builderAuthority)}/state?pdaIndex=${pdaIndex}`),
          fetchOptionalJson(`${PHOENIX_API}/trader/${encodeURIComponent(builderAuthority)}/pnl?resolution=1h&limit=24&includeLatest=true`),
          fetchOptionalJson(`${PHOENIX_API}/trader/${encodeURIComponent(builderAuthority)}/order-history?traderPdaIndex=${pdaIndex}&limit=5`),
          fetchOptionalJson(`${PHOENIX_API}/trader/${encodeURIComponent(builderAuthority)}/trades-history?pdaIndex=${pdaIndex}&limit=5`),
        ]);

        const positions = toArray<any>((stateRaw as any)?.positions ?? (stateRaw as any)?.data?.positions);
        const pnlPoints = toArray<any>(pnlRaw);
        const recentOrders = toArray<any>(ordersRaw).slice(0, 3).map((order: any) => ({
          symbol: pickString(order.marketSymbol, order.symbol, order.market),
          side: pickString(order.side, order.orderSide),
          status: pickString(order.orderStatus, order.status),
          price: pickNumber(order.price, order.limitPrice),
          size: pickNumber(order.size, order.quantity, order.baseLotsFilled),
        }));
        const recentTrades = toArray<any>(tradesRaw).slice(0, 3).map((trade: any) => ({
          symbol: pickString(trade.marketSymbol, trade.symbol, trade.market),
          side: pickString(trade.side, trade.takerSide),
          price: pickNumber(trade.price),
          size: pickNumber(trade.size, trade.quantity, trade.baseLotsFilled),
          realizedPnl: pickNumber(trade.realizedPnl, trade.pnl),
        }));

        traderSnapshot = {
          authority: builderAuthority,
          traderAccount: builderTrader,
          positionCount: positions.length,
          positions: positions.slice(0, 5).map((position: any) => ({
            symbol: pickString(position.marketSymbol, position.symbol, position.market),
            side: pickString(position.side, position.direction),
            size: pickNumber(position.positionSize, position.size, position.baseLots),
            entryPrice: pickNumber(position.entryPrice, position.avgEntryPrice),
            unrealizedPnl: pickNumber(position.unrealizedPnl, position.pnl),
          })),
          pnl: {
            latest: pnlPoints.length ? pnlPoints[pnlPoints.length - 1] : null,
            points: pnlPoints.length,
          },
          recentOrders,
          recentTrades,
          warnings: [
            (stateRaw as any)?._error ? `state unavailable: ${(stateRaw as any)._error}` : null,
            (pnlRaw as any)?._error ? `pnl unavailable: ${(pnlRaw as any)._error}` : null,
            (ordersRaw as any)?._error ? `orders unavailable: ${(ordersRaw as any)._error}` : null,
            (tradesRaw as any)?._error ? `trades unavailable: ${(tradesRaw as any)._error}` : null,
          ].filter(Boolean),
        };
      }

      return {
        adapter: profile.adapter,
        kind: "perps",
        ok: true,
        summary: "Live Phoenix market, trader, and execution snapshot for imported perps agents.",
        data: {
          marketCount: markets.length,
          activeMarkets,
          topMarkets,
          builderAuthority,
          builderTrader,
          traderSnapshot,
        },
      };
    }
    case "metaplex-mint":
    {
      const appBaseUrl = getAppBaseUrl();
      const [metaplexHealth, nftHealth, stakingStats, stakeConfig, treasuryStatus, treasuryBalance] = await Promise.all([
        fetchOptionalJson(`${appBaseUrl}/api/metaplex-agents/health`),
        fetchOptionalJson(`${appBaseUrl}/api/nft/health`),
        fetchOptionalJson(`${appBaseUrl}/api/staking/stats`),
        fetchOptionalJson(`${appBaseUrl}/api/clawd-stake/config`),
        fetchOptionalJson(`${appBaseUrl}/api/treasury/status`),
        fetchOptionalJson(`${appBaseUrl}/api/treasury/balance`),
      ]);

      const warnings = [
        isErrorLike(metaplexHealth) ? `metaplex health unavailable: ${(metaplexHealth as any)._error}` : null,
        isErrorLike(nftHealth) ? `nft health unavailable: ${(nftHealth as any)._error}` : null,
        isErrorLike(stakingStats) ? `staking stats unavailable: ${(stakingStats as any)._error}` : null,
        isErrorLike(stakeConfig) ? `stake config unavailable: ${(stakeConfig as any)._error}` : null,
        isErrorLike(treasuryStatus) ? `treasury status unavailable: ${(treasuryStatus as any)._error}` : null,
        isErrorLike(treasuryBalance) ? `treasury balance unavailable: ${(treasuryBalance as any)._error}` : null,
      ].filter(Boolean);

      return {
        adapter: profile.adapter,
        kind: "metaplex",
        ok: true,
        summary: "Metaplex, staking, and treasury snapshot for imported agent-minter and staking projects.",
        data: {
          rpcConfigured: hasEnv("HELIUS_RPC_URL") || hasEnv("HELIUS_API_KEY") || hasEnv("SOLANA_RPC_URL"),
          walletConfigured: hasEnv("FEE_PAYER_SECRET_KEY") || hasEnv("WALLET_PRIVATE_KEY") || hasEnv("SOLANA_PRIVATE_KEY"),
          metaplexHealth: isErrorLike(metaplexHealth) ? null : metaplexHealth,
          nftHealth: isErrorLike(nftHealth) ? null : nftHealth,
          staking: isErrorLike(stakingStats)
            ? null
            : {
                stats: stakingStats,
                rewardLayer: isErrorLike(stakeConfig)
                  ? null
                  : {
                      deployed: (stakeConfig as any)?.deployed ?? null,
                      status: (stakeConfig as any)?.status ?? null,
                      poolPda: (stakeConfig as any)?.poolPda ?? null,
                      note: (stakeConfig as any)?.note ?? null,
                    },
              },
          treasury: {
            status: isErrorLike(treasuryStatus) ? null : treasuryStatus,
            balance: isErrorLike(treasuryBalance) ? null : treasuryBalance,
          },
          appBaseUrl,
          warnings,
          relatedProjects: profile.relatedProjects,
        },
      };
    }
    case "pumpfun-rust-backend":
      return {
        adapter: profile.adapter,
        kind: "pumpfun",
        ok: true,
        summary: "Imported Pump.fun backend readiness and execution-support summary.",
        data: {
          rpcConfigured: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          jupiterConfigured: hasEnv("JUPITER_API_KEY"),
          birdeyeConfigured: hasEnv("BIRDEYE_API_KEY"),
          telegramConfigured: hasEnv("TELEGRAM_BOT_TOKEN") || hasEnv("TELEGRAM_AGENT_HOST_BOT_TOKEN"),
        },
      };
    case "plugin-delivery":
    {
      const appBaseUrl = getAppBaseUrl();
      const [
        routerStatus,
        routerModels,
        treasuryStatus,
        treasuryStats,
        dflowStatus,
        predictionStatus,
        tokenFeed,
      ] = await Promise.all([
        fetchOptionalJson(`${appBaseUrl}/api/clawdrouter/status`),
        fetchOptionalJson(`${appBaseUrl}/api/clawdrouter/models`),
        fetchOptionalJson(`${appBaseUrl}/api/treasury/status`),
        fetchOptionalJson(`${appBaseUrl}/api/treasury/stats`),
        fetchOptionalJson(`${appBaseUrl}/api/dflow/status`),
        fetchOptionalJson(`${appBaseUrl}/api/jupiter-prediction/trading-status`),
        fetchOptionalJson(`${appBaseUrl}/api/jupiter-tokens/recent`),
      ]);

      const modelCount = Array.isArray((routerModels as any)?.models) ? (routerModels as any).models.length : null;
      const recentTokens = toArray<any>(tokenFeed).slice(0, 5).map((token: any) => ({
        symbol: pickString(token.symbol, token.baseSymbol, token?.token?.symbol, token.name) ?? "unknown",
        mint: pickString(token.mint, token.address, token?.token?.mint),
      }));
      const warnings = [
        isErrorLike(routerStatus) ? `router status unavailable: ${(routerStatus as any)._error}` : null,
        isErrorLike(routerModels) ? `router models unavailable: ${(routerModels as any)._error}` : null,
        isErrorLike(treasuryStatus) ? `treasury status unavailable: ${(treasuryStatus as any)._error}` : null,
        isErrorLike(treasuryStats) ? `treasury stats unavailable: ${(treasuryStats as any)._error}` : null,
        isErrorLike(dflowStatus) ? `dflow status unavailable: ${(dflowStatus as any)._error}` : null,
        isErrorLike(predictionStatus) ? `prediction status unavailable: ${(predictionStatus as any)._error}` : null,
        isErrorLike(tokenFeed) ? `jupiter tokens unavailable: ${(tokenFeed as any)._error}` : null,
      ].filter(Boolean);

      return {
        adapter: profile.adapter,
        kind: "gateway",
        ok: true,
        summary: "Gateway, treasury, and market-routing snapshot for imported plugin.delivery and defi-agents profiles.",
        data: {
          baseUrl: process.env.CLAWDROUTER_BASE_URL || null,
          authConfigured: hasEnv("CLAWDROUTER_API_KEY") || hasEnv("X402_AUTH_TOKEN"),
          routerStatus: isErrorLike(routerStatus) ? null : routerStatus,
          routerModelCount: modelCount,
          treasury: {
            status: isErrorLike(treasuryStatus) ? null : treasuryStatus,
            stats: isErrorLike(treasuryStats) ? null : treasuryStats,
          },
          dflowStatus: isErrorLike(dflowStatus) ? null : dflowStatus,
          predictionStatus: isErrorLike(predictionStatus) ? null : predictionStatus,
          recentTokens,
          appBaseUrl,
          warnings,
          relatedProjects: profile.relatedProjects,
        },
      };
    }
    case "solana-oracle":
    {
      const appBaseUrl = getAppBaseUrl();
      const payload = loadBrowserAgents();
      const heliusSpecialist = payload.agents.find((agent) => agent.id === "solana-helius-specialist") ?? null;
      const attestedTemplate = getBrowserAgentTemplate("agent-template-attested");
      const oracleProject = payload.projects.find((project) => project.id === "solana-gpt-oracle") ?? null;
      const [metaplexHealth, nftHealth] = await Promise.all([
        fetchOptionalJson(`${appBaseUrl}/api/metaplex-agents/health`),
        fetchOptionalJson(`${appBaseUrl}/api/nft/health`),
      ]);

      const templateRaw = (attestedTemplate?.raw ?? {}) as Record<string, any>;
      const templateAgent = (templateRaw.agent ?? {}) as Record<string, any>;
      const attestationConfig = (templateRaw.attestation ?? templateAgent.attestation ?? null) as Record<string, unknown> | null;
      const vaultConfig = (templateRaw.vault ?? templateAgent.vault ?? null) as Record<string, unknown> | null;
      const recommendation = heliusSpecialist ? deriveBrowserAgentRecommendation(heliusSpecialist, payload) : null;
      const warnings = [
        isErrorLike(metaplexHealth) ? `metaplex health unavailable: ${(metaplexHealth as any)._error}` : null,
        isErrorLike(nftHealth) ? `nft health unavailable: ${(nftHealth as any)._error}` : null,
        !attestedTemplate ? "attested template missing from imported browser-agents payload." : null,
        !heliusSpecialist ? "solana-helius-specialist missing from imported browser-agents payload." : null,
      ].filter(Boolean);

      return {
        adapter: profile.adapter,
        kind: "oracle",
        ok: true,
        summary: "On-chain oracle, attestation, and vault-oriented snapshot for imported solana-gpt-oracle profiles.",
        data: {
          rpcConfigured: hasEnv("HELIUS_RPC_URL") || hasEnv("SOLANA_RPC_URL"),
          heliusApiConfigured: hasEnv("HELIUS_API_KEY"),
          metaplexHealth: isErrorLike(metaplexHealth) ? null : metaplexHealth,
          nftHealth: isErrorLike(nftHealth) ? null : nftHealth,
          importedProject: oracleProject
            ? {
                id: oracleProject.id,
                title: oracleProject.title,
                packageName: oracleProject.packageName,
                path: oracleProject.path,
              }
            : null,
          heliusSpecialist: heliusSpecialist
            ? {
                id: heliusSpecialist.id,
                title: heliusSpecialist.title,
                capabilities: heliusSpecialist.capabilities.slice(0, 6),
                deployPaths: Object.entries(heliusSpecialist.source.deploy ?? {}).map(([label, path]) => ({
                  label,
                  path: String(path),
                })),
                recommendation: recommendation
                  ? {
                      runtime: recommendation.runtime,
                      provider: recommendation.provider,
                      model: recommendation.model,
                    }
                  : null,
              }
            : null,
          attestedTemplate: attestedTemplate
            ? {
                id: attestedTemplate.id,
                description: attestedTemplate.description,
                configLevel: (attestedTemplate.raw?.agent as any)?.config?.level ?? (attestedTemplate.raw as any)?.level ?? null,
                attestationFields: Array.isArray(attestationConfig?.field_names) ? attestationConfig?.field_names : null,
                vaultCustody: Boolean((attestedTemplate.raw as any)?.vaultCustody ?? vaultConfig?.vault_protected),
                vaultInitializationAtBirth: Boolean(vaultConfig?.vault_initialization_at_birth),
              }
            : null,
          appBaseUrl,
          relatedProjects: profile.relatedProjects,
          warnings,
        },
      };
    }
    case "telegram-hosted":
      return {
        adapter: profile.adapter,
        kind: "telegram",
        ok: true,
        summary: "Telegram-hosted imported agent runtime summary.",
        data: {
          telegramConfigured: hasEnv("TELEGRAM_AGENT_HOST_BOT_TOKEN") || hasEnv("TELEGRAM_BOT_TOKEN"),
          username: process.env.TELEGRAM_AGENT_HOST_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || null,
        },
      };
    case "cloudflare-agent-api":
    {
      const appBaseUrl = getAppBaseUrl();
      const [publicConfig, boxes, openclawdBox, gallery, authMe] = await Promise.all([
        fetchOptionalJson(`${appBaseUrl}/api/public-config`),
        fetchOptionalJson(`${appBaseUrl}/api/boxes`),
        fetchOptionalJson(`${appBaseUrl}/api/boxes/openclawd`),
        fetchOptionalJson(`${appBaseUrl}/api/gallery`),
        fetchOptionalJson(`${appBaseUrl}/api/auth/me`),
      ]);

      const listedBoxes = toArray<any>((boxes as any)?.boxes).slice(0, 5).map((box: any) => ({
        id: pickString(box.id, box.name),
        status: pickString(box.status, box.state),
        runtime: pickString(box.runtime),
        size: pickString(box.size),
      }));
      const galleryItems = toArray<any>((gallery as any)?.items);
      const warnings = [
        isErrorLike(publicConfig) ? `public config unavailable: ${(publicConfig as any)._error}` : null,
        isErrorLike(boxes) ? `boxes unavailable: ${(boxes as any)._error}` : null,
        isErrorLike(openclawdBox) ? `openclawd box unavailable: ${(openclawdBox as any)._error}` : null,
        isErrorLike(gallery) ? `gallery unavailable: ${(gallery as any)._error}` : null,
        isErrorLike(authMe) ? `auth session unavailable: ${(authMe as any)._error}` : null,
      ].filter(Boolean);

      return {
        adapter: profile.adapter,
        kind: "generic",
        ok: true,
        summary: "Edge/API execution snapshot for imported cloudflare-agent-api profiles.",
        data: {
          appBaseUrl,
          publicConfig: isErrorLike(publicConfig) ? null : publicConfig,
          boxes: {
            openclawd: isErrorLike(openclawdBox) ? null : openclawdBox,
            count: Array.isArray((boxes as any)?.boxes) ? (boxes as any).boxes.length : null,
            listed: listedBoxes,
          },
          gallery: {
            total: pickNumber((gallery as any)?.total, galleryItems.length),
            sample: galleryItems.slice(0, 3).map((item: any) => ({
              id: pickString(item.id),
              type: pickString(item.type),
              title: pickString(item.title),
            })),
          },
          authSession: isErrorLike(authMe)
            ? null
            : {
                authenticated: Boolean((authMe as any)?.authenticated),
                walletAddress: (authMe as any)?.walletAddress ?? null,
                role: (authMe as any)?.role ?? null,
              },
          relatedProjects: profile.relatedProjects,
          missing: profile.missing,
          warnings,
        },
      };
    }
    case "cheshire-chat":
    default:
      return {
        adapter: profile.adapter,
        kind: "generic",
        ok: true,
        summary: "Imported agent runtime summary.",
        data: {
          relatedProjects: profile.relatedProjects,
          missing: profile.missing,
        },
      };
  }
}
