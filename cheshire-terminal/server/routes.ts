import "./env";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";
import { insertTokenSchema, ChatEventType, ChatEvent } from "@shared/schema";
import { WebSocketManager, MessageType } from "./websocket";
import { sessionMiddleware, isAuthenticated, isAuthorizedAppUser, requireAdmin } from "./middleware/session";
import authRouter from "./routes/auth";
import { toNodeHandler } from "better-auth/node";
import { auth as betterAuth } from "../lib/auth";
import aiRouter from "./routes/ai";
import tokenRouter from "./routes/tokens";
import votesRouter from "./routes/votes";
import searchRouter from "./routes/search";
import memesRouter from "./routes/memes";
import solanaTrackerRouter from "./routes/solana-tracker";
import ipfsRouter from "./routes/ipfs";
import heliusRouter from "./routes/helius";
import telegramRouter from "./routes/telegram";
import burnsRouter from "./routes/burns";
import contractsRouter from "./routes/contracts";
import chatRouter from "./routes/chat";
import crossmintRouter from "./routes/crossmint";
import agentRouter from "./routes/agents";
import streamflowRouter from "./routes/streamflow";
import xaiRouter from "./routes/xai";
import nvidiaRouter from "./routes/nvidia";
import openRouterRouter from "./routes/openrouter";
import birdEyeRouter from "./routes/birdeye";
import metaplexAgentsRouter from "./routes/metaplex-agents";
import agentExplorerRouter from "./routes/agent-explorer";
import nftRouter from "./routes/nft";
import deepseekRouter from "./routes/deepseek";
import hermesRouter from "./routes/hermes";
import falRouter from "./routes/fal";
import galleryRouter from "./routes/gallery";
import walletOpsRouter from "./routes/wallet-ops";
import jupiterzRouter from "./routes/jupiterz";
import jupiterPredictionRouter from "./routes/jupiter-prediction";
import jupiterTokensRouter from "./routes/jupiter-tokens";
import jupiterUltraRouter from "./routes/jupiter-ultra";
import browserUseRouter from "./routes/browser-use";
import stakingRouter from "./routes/staking";
import clawdStakeRouter from "./routes/clawd-stake";
import treasuryRouter from "./routes/treasury";
import gachaRouter from "./routes/gacha";
import holdersRouter from "./routes/holders";
import telegramLinkRouter from "./routes/telegram-link";
import userAgentsRouter from "./routes/user-agents";
import clawdPortfolioRouter from "./routes/clawd-portfolio";
import walletIntelRouter from "./routes/wallet-intel";
import discordRouter from "./routes/discord";
import realtimeVoiceRouter from "./routes/realtime-voice";
import voiceRouter from "./routes/voice";
import voiceAgentRouter from "./routes/voice-agent";
import livekitRouter from "./routes/livekit";
import discordOAuthRouter from "./routes/discord-oauth";
import twitterOAuthRouter from "./routes/twitter-oauth";
import dflowRouter from "./routes/dflow";
import phoenixRouter from "./routes/phoenix";
import imperialRouter from "./routes/imperial";
import flashRouter from "./routes/flash";
import meteoraSwapRouter from "./routes/meteora-swap";
import dbcLaunchRouter from "./routes/dbc-launch";
import pumpRouter from "./routes/pump";
import stocksRouter from "./routes/stocks";
import coingeckoRouter from "./routes/coingecko";
import newsRouter from "./routes/news";
import imagineRouter from "./routes/imagine";
import geminiStudioRouter from "./routes/gemini-studio";
import clawdArenaRouter, { attachArenaWebSocket } from "./routes/clawd-arena";
import arenaRouter from "./routes/arena";
import clawdRouter from "./routes/clawdrouter";
import skillsRouter from "./routes/skills";
import routerKeysRouter from "./routes/router-keys";
import freeTerminalRouter from "./routes/free-terminal";
import moonshotRouter from "./routes/moonshot";
import upstashBoxRouter from "./routes/upstash-box";
import teeRouter from "./routes/tee";
import developerApiRouter from "./routes/developer-api";
import cloudflareStreamRouter from "./routes/cloudflare-stream";
import { apiKeyCanAccessRoute, resolveApiPrincipal } from "./lib/api-auth";
import { autostartIfConfigured as clawdAutostart } from "./lib/clawd/runner";
import { startHeliusPumpStream } from "./lib/clawd/helius-pump-stream";
import { startHeliusAgentExplorerStream } from "./lib/agent-explorer";
import { discordBot, type DiscordMessageEvent } from "./lib/discord/bot";
import { discordTradingApiMiddleware } from "./lib/discord/trading-relay";
import { GalleryItem } from "./lib/objectStore";
import { onGalleryItemAdded } from "./lib/galleryRealtime";
import { estimateTokensFromText, trackUsageForWallet } from "./lib/usage";
import { getWalletAccessState } from "./lib/access-control";

export async function registerRoutes(app: Express, existingServer?: Server): Promise<Server> {
  const betterAuthEnabled = process.env.ENABLE_BETTER_AUTH === "true";
  // Add session middleware
  app.use(sessionMiddleware);
  app.use(discordTradingApiMiddleware);

  // Holder/Clerk-gated CLAWD Router API key issuing and usage tracking.
  // This route verifies Clerk bearer tokens itself, so it mounts before the
  // global API lockdown that only understands wallet sessions/internal API keys.
  app.use("/api/router-keys", routerKeysRouter);

  app.get("/terminal/free", (_req, res) => {
    res.redirect(308, "/free");
  });

  const isRegistrationAuthPath = (path: string, method: string) => {
    const allowedExact = new Set([
      "GET /api/auth/me",
      "GET /api/auth/status",
      "GET /api/auth/entry",
      "GET /api/auth/challenge",
      "POST /api/auth/entry/verify",
      "POST /api/auth/verify",
      "POST /api/auth/profile",
      "POST /api/auth/logout",
    ]);
    const key = `${method} ${path}`;
    if (allowedExact.has(key)) return true;
    return /^\/api\/auth\/(sign-in|sign-up|callback|oauth2\/callback|get-session|error|sign-out)(\/|$)/.test(path);
  };
  const isPublicTelegramPath = (path: string, method: string) => {
    const allowedExact = new Set([
      "GET /api/telegram/config",
      "POST /api/telegram/session",
      "GET /api/telegram/status",
      "POST /api/telegram/validate",
      "POST /api/telegram/webhook",
      "GET /api/telegram/rooms",
      "POST /api/telegram/register",
      "GET /api/telegram-link/bot-username",
      "POST /api/telegram-link/verify",
    ]);
    const key = `${method} ${path}`;
    if (allowedExact.has(key)) return true;
    return /^\/api\/telegram-link\/status\/[^/]+$/.test(path) && method === "GET";
  };
  const isPublicDiscordRelayPath = (path: string, method: string) => {
    if (path === "/api/discord/trading/status" && method === "GET") return true;
    return /^\/api\/discord\/trading\/webhook\/[^/]+$/.test(path) && method === "POST";
  };
  const isPublicMoonshotPath = (path: string, method: string) => {
    if (path === "/api/moonshot/models" && method === "GET") return true;
    return false;
  };
  const isPublicNewsPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return (
      path === "/api/news/trending" ||
      path === "/api/news/health" ||
      path.startsWith("/api/news/headlines")
    );
  };
  const isPublicGalleryPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return path === "/api/gallery" || path.startsWith("/api/gallery/media/");
  };
  const isPublicArenaDuelPath = (path: string, method: string) => {
    if (path === "/api/clawd/duel/state" && method === "GET") return true;
    if (path === "/api/clawd/duel/scoreboard" && method === "GET") return true;
    if (path === "/api/clawd/duel/pairs" && method === "GET") return true;
    if (/^\/api\/clawd\/duel\/(start|pause|reset|tick|pair)$/.test(path) && method === "POST") return true;
    return false;
  };
  const isPublicArenaPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return path === "/api/arena/rooms" || /^\/api\/arena\/rooms\/[^/]+$/.test(path);
  };
  const isPublicMarketDataPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    if (path === "/api/clawd-portfolio" || path.startsWith("/api/clawd-portfolio/")) return true;
    if (path.startsWith("/api/wallet-intel/")) return true;
    if (path.startsWith("/api/birdeye/wallet/")) return false;
    if (path.startsWith("/api/birdeye/")) return true;
    if (path.startsWith("/api/coingecko/")) return true;
    if (path.startsWith("/api/imperial/")) return true;
    if (path.startsWith("/api/stocks/")) return true;
    if (path.startsWith("/api/jupiter-tokens/")) return true;
    if (path.startsWith("/api/solana-tracker/")) return true;
    if (
      path === "/api/meteora-swap/status" ||
      path === "/api/meteora-swap/pool-info" ||
      path === "/api/meteora-swap/quote" ||
      path === "/api/meteora-swap/live-price" ||
      path === "/api/meteora-swap/pool-data"
    ) {
      return true;
    }
    return false;
  };
  const isPublicLivekitPath = (path: string, method: string) => {
    if (path === "/api/livekit/webhook" && method === "POST") return true;
    if (path === "/api/livekit/status" && method === "GET") return true;
    if (path === "/api/livekit/livestream-token" && method === "POST") return true;
    if (path === "/api/livekit/livestream-ingress" && method === "POST") return true;
    if (path === "/api/livekit/livestream-room" && method === "GET") return true;
    if (path === "/api/livekit/livestream-ingresses" && method === "GET") return true;
    if (/^\/api\/livekit\/livestream-ingresses\/[^/]+$/.test(path) && method === "DELETE") return true;
    if (path === "/api/livekit/livestream-egress" && method === "POST") return true;
    if (path === "/api/livekit/livestream-egresses" && method === "GET") return true;
    if (/^\/api\/livekit\/livestream-egresses\/[^/]+\/stop$/.test(path) && method === "POST") return true;
    // /api/livekit/token is NOT public — requires an authenticated session
    return false;
  };
  const isPublicHeliusPath = (path: string, method: string) => {
    // verify-clawd checks on-chain CLAWD balance — public blockchain data, no auth needed
    if (path === "/api/helius/verify-clawd" && method === "GET") return true;
    if (path === "/api/helius/transaction-optimization" && method === "GET") return true;
    if (path === "/api/helius/priority-fee" && method === "POST") return true;
    if (path === "/api/helius/send-transaction" && method === "POST") return true;
    if (method === "GET") {
      if (/^\/api\/helius\/token\/[^/]+$/.test(path)) return true;
      if (/^\/api\/helius\/token\/[^/]+\/(supply|largest-accounts)$/.test(path)) return true;
      if (/^\/api\/helius\/token-account\/[^/]+\/balance$/.test(path)) return true;
      if (/^\/api\/helius\/wallet\/[^/]+\/(token-accounts|assets|fungibles|transfer-history|transactions-v2)$/.test(path)) return true;
    }
    return false;
  };
  const isPublicMetaplexAgentPath = (path: string, method: string) => {
    if (path === "/api/metaplex-agents/health" && method === "GET") return true;
    if (/^\/api\/metaplex-agents\/fetch\/[^/]+$/.test(path) && method === "GET") return true;
    if (path === "/api/metaplex-agents/mint" && method === "POST") return true;
    if (path === "/api/metaplex-agents/register" && method === "POST") return true;
    if (path === "/api/metaplex-agents/launch-token" && method === "POST") return true;
    if (path === "/api/mint/agent" && method === "POST") return true;
    return false;
  };
  const isPublicAgentExplorerPath = (path: string, method: string) => {
    if (path === "/api/agent-explorer/status" && method === "GET") return true;
    if (path === "/api/agent-explorer/feed" && method === "GET") return true;
    if (path === "/api/agent-explorer/events" && method === "GET") return true;
    if (path === "/api/agent-explorer/webhook/helius" && method === "POST") return true;
    return false;
  };
  const isPublicDbcPath = (path: string, method: string) => {
    if (method === "GET") {
      if (path === "/api/dbc/fee-wallet") return true;
      if (path === "/api/dbc/quote") return true;
      if (/^\/api\/dbc\/pool\/[^/]+$/.test(path)) return true;
      if (/^\/api\/dbc\/config\/[^/]+$/.test(path)) return true;
      return false;
    }
    if (method === "POST") {
      return path === "/api/dbc/launch" || path === "/api/dbc/build-swap" || path === "/api/dbc/submit";
    }
    return false;
  };
  const isPublicPumpPath = (path: string, method: string) => {
    if (method === "GET") {
      return path === "/api/pump/status" || path === "/api/pump/fee-recipients";
    }
    if (method === "POST") {
      return (
        path === "/api/pump/metadata" ||
        path === "/api/pump/launch" ||
        path === "/api/pump/build-buy" ||
        path === "/api/pump/build-sell" ||
        path === "/api/pump/submit"
      );
    }
    return false;
  };
  // BirdEye wallet reads are called by TokenGateContext immediately on wallet
  // connect (before sign-in), so they must be public or the balance spinner hangs.
  const isPublicBirdeyePath = (path: string, method: string) => {
    if (method !== "GET") return false;
    if (path.startsWith("/api/birdeye/wallet/net-worth")) return true;
    if (path.startsWith("/api/birdeye/wallet/pnl")) return true;
    return false;
  };
  const isPublicPhoenixPath = (path: string, method: string) => {
    if (method === "GET") {
      if (path === "/api/phoenix/markets") return true;
      if (path === "/api/phoenix/market/next-commodity-market-transition") return true;
      if (/^\/api\/phoenix\/trader\/[^/]+\/(state|pnl|order-history|trades-history|exists)$/.test(path)) {
        return true;
      }
      if (path === "/api/phoenix/auth/nonce") return true;
    }
    if (method === "POST") {
      if (path.startsWith("/api/phoenix/ix/")) return true;
      if (path === "/api/phoenix/strategy") return true;
      if (path === "/api/phoenix/invite/activate") return true;
      if (/^\/api\/phoenix\/auth\/(login|refresh|logout)$/.test(path)) return true;
    }
    return false;
  };
  const isPublicFlashPath = (path: string, method: string) => {
    if (method === "GET") {
      return (
        path === "/api/flash/status" ||
        path === "/api/flash/health" ||
        path === "/api/flash/tokens" ||
        path === "/api/flash/prices" ||
        /^\/api\/flash\/prices\/[^/]+$/.test(path)
      );
    }
    if (method === "POST") return path === "/api/flash/quote";
    return false;
  };
  const isPublicStakingPath = (path: string, method: string) => {
    if (method === "GET") {
      return path.startsWith("/api/staking/") || path.startsWith("/api/clawd-stake/");
    }
    if (method === "POST") {
      return (
        path === "/api/staking/stake" ||
        path === "/api/staking/unstake" ||
        path.startsWith("/api/clawd-stake/build/")
      );
    }
    return false;
  };
  const isPublicGachaPath = (path: string, method: string) => {
    if (method === "GET") {
      return path === "/api/gacha/status";
    }
    if (method === "POST") {
      return path === "/api/gacha/session" || path === "/api/gacha/reveal";
    }
    return false;
  };
  const isPublicReadinessPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return (
      path === "/api/nft/health" ||
      path === "/api/fal/health" ||
      path === "/api/dflow/status"
    );
  };
  const isPublicFreeTerminalPath = (path: string, method: string) => {
    if (method === "GET") {
      return (
        path === "/api/free-terminal/status" ||
        path === "/api/free-terminal/models" ||
        path === "/api/free-terminal/spinners" ||
        /^\/api\/free-terminal\/spinners\/[^/]+$/.test(path)
      );
    }
    if (method === "POST") {
      return path === "/api/free-terminal/chat" || path === "/api/free-terminal/chat/stream";
    }
    return false;
  };
  const isPublicSkillsPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return path === "/api/skills" || /^\/api\/skills\/[^/]+$/.test(path);
  };
  const isPublicCloudflareStreamPath = (path: string, method: string) => {
    if (method === "GET" && path === "/api/cloudflare-stream/status") return true;
    if (method === "GET" && /^\/api\/cloudflare-stream\/playback\/[^/]+$/.test(path)) return true;
    if (method === "GET" && /^\/api\/cloudflare-stream\/views\/[^/]+$/.test(path)) return true;
    if (method === "GET" && /^\/api\/cloudflare-stream\/health\/[^/]+$/.test(path)) return true;
    if (method === "POST" && path === "/api/cloudflare-stream/live-inputs") return true;
    return false;
  };
  const isPublicUserAgentsPath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return (
      path === "/api/user-agents" ||
      /^\/api\/user-agents\/by-slug\/[^/]+$/.test(path) ||
      /^\/api\/user-agents\/by-slug\/[^/]+\/runtime$/.test(path) ||
      /^\/api\/user-agents\/by-slug\/[^/]+\/bridge$/.test(path) ||
      /^\/api\/user-agents\/by-slug\/[^/]+\/deploy-manifest$/.test(path) ||
      /^\/api\/user-agents\/by-slug\/[^/]+\/deploy-package$/.test(path)
    );
  };
  const isPublicPaidAgentRunPath = (path: string, method: string) => {
    return method === "POST" && /^\/api\/agents\/[^/]+\/run$/.test(path);
  };
  const isPublicTeePath = (path: string, method: string) => {
    if (method !== "GET") return false;
    return path === "/api/tee/status" || path === "/api/tee/models";
  };
  const requireTeeAccess = async (
    req: Parameters<typeof isAuthenticated>[0],
    res: Parameters<typeof isAuthenticated>[1],
    next: Parameters<typeof isAuthenticated>[2],
  ) => {
    const sessionWallet = req.session?.walletAddress ?? req.convexAuth?.walletAddress ?? null;
    if (sessionWallet) return requireAuthorizedSession(req, res, next);

    const candidate =
      req.header("x-wallet-address") ||
      (typeof req.body?.walletAddress === "string" ? req.body.walletAddress : "") ||
      (typeof req.query.walletAddress === "string" ? req.query.walletAddress : "");
    const walletAddress = candidate.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(401).json({ error: "Connect a verified $CLAWD wallet to use TEE chat." });
    }

    const access = await getWalletAccessState(walletAddress);
    if (!access.allowed) {
      return res.status(403).json({
        error: `Access requires the admin wallet or at least ${access.holderMinimum} $CLAWD.`,
        accessRequired: true,
        isHolder: false,
        clawdBalance: access.balance,
        walletAddress,
      });
    }
    return next();
  };
  const isPaidAiProviderPath = (path: string, method: string) => {
    if (path.startsWith("/api/xai/")) return true;
    if (path.startsWith("/api/deepseek/")) return true;
    if (path.startsWith("/api/openrouter/")) return true;
    if (path.startsWith("/api/ai/")) return true;
    if (path.startsWith("/api/imagine/")) return true;
    if (path.startsWith("/api/realtime/")) return true;
    if (path.startsWith("/api/voice/")) return true;
    if (path.startsWith("/api/voice-agent/")) return true;
    if (path.startsWith("/api/fal/")) return true;
    if (path.startsWith("/api/gemini-studio/")) return true;
    if (path.startsWith("/api/nvidia/")) return true;
    if (path.startsWith("/api/browser-use/")) return true;
    if (path === "/api/search/smart" && method === "POST") return true;
    if (path === "/api/phoenix/strategy" && method === "POST") return true;
    if (path === "/api/birdeye/analyze-token" && method === "POST") return true;
    if (path === "/api/contracts/analyze" && method === "POST") return true;
    if (path === "/api/wallet-ops/parse-command" && method === "POST") return true;
    if (path === "/api/moonshot/chat" && method === "POST") return true;
    return false;
  };
  const requireAdminSession = (req: Parameters<typeof isAuthenticated>[0], res: Parameters<typeof isAuthenticated>[1], next: Parameters<typeof isAuthenticated>[2]) =>
    isAuthenticated(req, res, () => requireAdmin(req, res, next));
  const requireAuthorizedSession = (req: Parameters<typeof isAuthenticated>[0], res: Parameters<typeof isAuthenticated>[1], next: Parameters<typeof isAuthenticated>[2]) =>
    isAuthorizedAppUser(req, res, next);
  const requireApiOrAuthorizedSession = async (
    req: Parameters<typeof isAuthenticated>[0],
    res: Parameters<typeof isAuthenticated>[1],
    next: Parameters<typeof isAuthenticated>[2],
  ) => {
    const principal = await resolveApiPrincipal(req);
    if (principal && apiKeyCanAccessRoute(principal, req)) return next();
    if (principal?.type === "api-key") {
      return res.status(403).json({ error: "API key scope does not allow this route." });
    }
    return requireAuthorizedSession(req, res, next);
  };
  const requireApiOrAuthenticatedSession = async (
    req: Parameters<typeof isAuthenticated>[0],
    res: Parameters<typeof isAuthenticated>[1],
    next: Parameters<typeof isAuthenticated>[2],
  ) => {
    const principal = await resolveApiPrincipal(req);
    if (principal && apiKeyCanAccessRoute(principal, req)) return next();
    if (principal?.type === "api-key") {
      return res.status(403).json({ error: "API key scope does not allow this route." });
    }
    return isAuthenticated(req, res, next);
  };
  const requireApiAdminOrSession = async (
    req: Parameters<typeof isAuthenticated>[0],
    res: Parameters<typeof isAuthenticated>[1],
    next: Parameters<typeof isAuthenticated>[2],
  ) => {
    const principal = await resolveApiPrincipal(req);
    if (principal?.type === "api-key" && principal.scopes.some((scope) => scope === "*" || scope === "admin:*")) {
      return next();
    }
    return requireAdminSession(req, res, next);
  };
  const normalizeConvexSiteUrl = (...values: Array<string | undefined>) => {
    for (const value of values) {
      const trimmed = value?.trim().replace(/\/$/, "");
      if (!trimmed || trimmed.includes("your-deployment")) continue;
      if (trimmed.includes(".convex.cloud")) {
        return trimmed.replace(".convex.cloud", ".convex.site");
      }
      if (trimmed.includes(".convex.site")) {
        return trimmed;
      }
    }
    return "";
  };
  const convexSiteBaseUrl = normalizeConvexSiteUrl(
    process.env.CONVEX_SITE_URL,
    process.env.VITE_CONVEX_SITE_URL,
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    process.env.CONVEX_URL,
    process.env.VITE_CONVEX_URL,
    process.env.NEXT_PUBLIC_CONVEX_URL,
  );
  const convexWalletAuthMode = (process.env.CONVEX_WALLET_AUTH_MODE || "proxy").trim().toLowerCase();
  const convexWalletAuthProxyEnabled =
    convexWalletAuthMode !== "legacy" &&
    /^https?:\/\/.+\.convex\.site$/.test(convexSiteBaseUrl) &&
    !convexSiteBaseUrl.includes("your-deployment");
  const isSecureRequest = (req: Parameters<typeof isAuthenticated>[0]) => {
    if (req.secure) return true;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const firstProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto?.split(",")[0];
    return firstProto?.trim() === "https";
  };

  const shouldProxyAuth = (req: Parameters<typeof isAuthenticated>[0]) => {
    if (!convexWalletAuthProxyEnabled) return false;
    if (!convexSiteBaseUrl || !req.path.startsWith("/api/auth/")) return false;
    if (convexWalletAuthMode === "proxy") return true;
    if (convexWalletAuthMode === "legacy") return false;
    return isSecureRequest(req);
  };
  const authHandledByConvex = convexWalletAuthProxyEnabled;

  const walletSessionCompatResponse = (walletSession: any) => ({
    session: {
      id: walletSession.walletAddress,
      userId: walletSession.userId ?? walletSession.walletAddress,
      token: null,
      expiresAt: null,
      createdAt: null,
      updatedAt: null,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: walletSession.userId ?? walletSession.walletAddress,
      name: walletSession.profile?.displayName ?? walletSession.profile?.agentName ?? walletSession.walletAddress,
      email: null,
      image: walletSession.profile?.avatarUrl ?? null,
      walletAddress: walletSession.walletAddress,
      role: walletSession.role ?? "user",
      clawdBalance: walletSession.clawdBalance ?? 0,
      isTokenGated: walletSession.isTokenGated ?? false,
    },
  });

  // Global lockdown. Auth routes needed for registration/login stay public.
  // Everything else under /api requires an admin wallet session or a current
  // $CLAWD holder session, with explicit admin subtrees still admin-only.
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return next();
    if (!req.path.startsWith("/api/")) return next();
    if (isPublicReadinessPath(req.path, req.method)) return next();
    if (isPublicTeePath(req.path, req.method)) return next();
    if (req.path === "/api/tee/chat" && req.method === "POST") return requireTeeAccess(req, res, next);
    if (req.path === "/api/developer/status" && req.method === "GET") return next();
    if (req.path.startsWith("/api/developer/")) return next();
    if (isPaidAiProviderPath(req.path, req.method)) return requireApiOrAuthenticatedSession(req, res, next);
    if (isPublicTelegramPath(req.path, req.method)) return next();
    if (isPublicDiscordRelayPath(req.path, req.method)) return next();
    if (isPublicMoonshotPath(req.path, req.method)) return next();
    if (isPublicNewsPath(req.path, req.method)) return next();
    if (isPublicGalleryPath(req.path, req.method)) return next();
    if (isPublicArenaDuelPath(req.path, req.method)) return next();
    if (isPublicArenaPath(req.path, req.method)) return next();
    if (isPublicMarketDataPath(req.path, req.method)) return next();
    if (isPublicLivekitPath(req.path, req.method)) return next();
    if (isPublicHeliusPath(req.path, req.method)) return next();
    if (isPublicMetaplexAgentPath(req.path, req.method)) return next();
    if (isPublicAgentExplorerPath(req.path, req.method)) return next();
    if (isPublicDbcPath(req.path, req.method)) return next();
    if (isPublicPumpPath(req.path, req.method)) return next();
    if (isPublicBirdeyePath(req.path, req.method)) return next();
    if (isPublicPhoenixPath(req.path, req.method)) return next();
    if (isPublicFlashPath(req.path, req.method)) return next();
    if (isPublicStakingPath(req.path, req.method)) return next();
    if (isPublicGachaPath(req.path, req.method)) return next();
    if (isPublicFreeTerminalPath(req.path, req.method)) return next();
    if (isPublicSkillsPath(req.path, req.method)) return next();
    if (isPublicCloudflareStreamPath(req.path, req.method)) return next();
    if (isPublicUserAgentsPath(req.path, req.method)) return next();
    if (isPublicPaidAgentRunPath(req.path, req.method)) return next();
    if (req.path.startsWith("/api/auth/")) return isRegistrationAuthPath(req.path, req.method) ? next() : requireApiOrAuthorizedSession(req, res, next);
    if (req.path.startsWith("/api/router-keys")) return next();
    if (req.path === "/api/moonshot/chat" && req.method === "POST") return requireApiOrAuthenticatedSession(req, res, next);
    if (req.path.startsWith("/api/clawd/admin/")) return requireApiAdminOrSession(req, res, next);
    return requireApiOrAuthorizedSession(req, res, next);
  });

  app.use(async (req, res, next) => {
    if (!shouldProxyAuth(req)) return next();

    try {
      const upstreamHeaders = new Headers();
      for (const headerName of ["accept", "content-type", "cookie", "origin", "referer", "user-agent", "x-forwarded-for", "x-forwarded-host"]) {
        const value = req.headers[headerName];
        if (!value) continue;
        if (Array.isArray(value)) {
          for (const item of value) upstreamHeaders.append(headerName, item);
        } else {
          upstreamHeaders.set(headerName, value);
        }
      }
      upstreamHeaders.set("x-forwarded-proto", req.secure ? "https" : req.protocol);
      upstreamHeaders.set("x-cheshire-forwarded-proto", req.secure ? "https" : req.protocol);

      const upstream = await fetch(`${convexSiteBaseUrl}${req.originalUrl}`, {
        method: req.method,
        headers: upstreamHeaders,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body ?? {}),
      });

      const setCookie = upstream.headers.get("set-cookie");
      const location = upstream.headers.get("location");
      let contentType = upstream.headers.get("content-type");
      let body = await upstream.text();

      if (
        req.method === "GET" &&
        req.path === "/api/auth/get-session" &&
        upstream.ok &&
        body.trim() === "null"
      ) {
        const meResponse = await fetch(`${convexSiteBaseUrl}/api/auth/me`, {
          method: "GET",
          headers: upstreamHeaders,
        });
        if (meResponse.ok) {
          const walletSession = await meResponse.json();
          if (walletSession?.authenticated && walletSession?.walletAddress) {
            body = JSON.stringify(walletSessionCompatResponse(walletSession));
            contentType = "application/json";
          }
        }
      }

      if (setCookie) res.setHeader("set-cookie", setCookie);
      if (location) res.setHeader("location", location);
      if (contentType) res.setHeader("content-type", contentType);
      res.status(upstream.status).send(body);
    } catch (error) {
      next(error);
    }
  });

  // Agent Auth discovery document — required by the agentAuth plugin
  app.get("/.well-known/agent-configuration", async (_req, res) => {
    if (!betterAuthEnabled) {
      return res.status(404).json({ error: "agent-configuration disabled" });
    }
    try {
      const configuration = await betterAuth.api.getAgentConfiguration();
      res.json(configuration);
    } catch {
      res.status(503).json({ error: "agent-configuration unavailable" });
    }
  });

  // Auth routes fall back to local Express/Better Auth only when Convex auth
  // proxying is disabled. Otherwise Convex owns the full /api/auth surface.
  if (!authHandledByConvex) {
    app.use("/api/auth", authRouter);
    if (betterAuthEnabled) {
      app.use("/api/auth", toNodeHandler(betterAuth));
    }
  }

  // AI routes
  app.use("/api/ai", aiRouter);

  // Token routes
  app.use("/api/tokens", tokenRouter);

  // Vote routes
  app.use("/api/votes", votesRouter);

  // Search routes
  app.use("/api/search", searchRouter);

  // Meme routes
  app.use("/api/memes", memesRouter);

  // IPFS routes for file uploads
  app.use("/api/ipfs", ipfsRouter);

  // Solana Tracker routes
  app.use("/api/solana-tracker", solanaTrackerRouter);

  // Helius API routes
  app.use("/api/helius", heliusRouter);

  // Telegram webhook routes
  app.use("/api/telegram", telegramRouter);

  // Burns routes
  app.use("/api/burns", burnsRouter);
  
  // Contracts routes
  app.use("/api/contracts", contractsRouter);
  
  // Chat routes
  app.use("/api/chat", chatRouter);
  
  // Crossmint wallet routes
  app.use("/api/crossmint", crossmintRouter);
  
  // AI Agent routes
  app.use("/api/agents", agentRouter);
  
  // StreamFlow routes for token vesting and streaming
  app.use("/api/streamflow", streamflowRouter);
  
  // XAI (Grok) routes for AI completions
  app.use("/api/xai", xaiRouter);
  
  // NVIDIA AI routes for deep reasoning and token analysis
  app.use("/api/nvidia", nvidiaRouter);
  
  // OpenRouter API routes for model access
  app.use("/api/openrouter", openRouterRouter);
  
  // BirdEye API routes for token data and DEX functionality
  app.use("/api/birdeye", birdEyeRouter);

  // Wallet operations: burn, transfer, swap (Jupiter), lock, NLP parsing
  app.use("/api/wallet-ops", walletOpsRouter);

  // JupiterZ — RFQ analytics, transaction lookup, 7-day stats
  app.use("/api/jupiterz", jupiterzRouter);

  // Jupiter Prediction Markets — events, markets, orders, positions, history, claims
  app.use("/api/jupiter-prediction", jupiterPredictionRouter);

  // Jupiter Tokens API V2 — search, tag, category, recent + Express Verification
  app.use("/api/jupiter-tokens", jupiterTokensRouter);

  // Jupiter Ultra — agent swap execution, trigger orders (limit/TP/SL), CLAWD default
  app.use("/api/jupiter-ultra", jupiterUltraRouter);

  // Browser Use cloud browser sessions
  app.use("/api/browser-use", browserUseRouter);

  // Agent / NFT Staking via Metaplex Core FreezeDelegate
  app.use("/api/staking", stakingRouter);
  app.use("/api/clawd-stake", clawdStakeRouter);

  // CLAWD Treasury — payments, burns, real-time pricing
  app.use("/api/treasury", treasuryRouter);

  // CLAWD Gacha — fairness sessions, on-chain receipts, and payout routing
  app.use("/api/gacha", gachaRouter);

  // Meteora CLAWD/SOL swap — on-site DEX with Helius RPC + WS
  app.use("/api/meteora-swap", meteoraSwapRouter);

  // Meteora Dynamic Bonding Curve — token launch + bonding curve trading
  app.use("/api/dbc", dbcLaunchRouter);

  // Pump.fun — public wallet-signed token launch + bonding curve trading
  app.use("/api/pump", pumpRouter);
  app.use("/api/holders", holdersRouter);
  app.use("/api/telegram-link", telegramLinkRouter);
  app.use("/api/user-agents", userAgentsRouter);
  app.use("/api/boxes", upstashBoxRouter);
  app.use("/api/clawd-portfolio", clawdPortfolioRouter);
  app.use("/api/wallet-intel", walletIntelRouter);

  // Metaplex Agent Registry routes (real on-chain via Helius RPC)
  app.use("/api/metaplex-agents", metaplexAgentsRouter);
  app.use("/api/mint", metaplexAgentsRouter);

  // Helius-backed Solana agent event explorer
  app.use("/api/agent-explorer", agentExplorerRouter);

  // NFT Studio routes — AI image generation + Metaplex Core CRUD
  app.use("/api/nft", nftRouter);

  // Hermes (Nous Research) API — OpenAI-compatible inference
  app.use("/api/hermes", hermesRouter);

  // DeepSeek v4-pro/flash agentic chat with Honcho memory + Solana tools
  app.use("/api/deepseek", deepseekRouter);

  // FAL AI — SeeAnce 2.0 text-to-video & image-to-video
  app.use("/api/fal", falRouter);

  // Object-store backed gallery — images, videos, agents
  app.use("/api/gallery", galleryRouter);

  // OpenAI Realtime Voice API — ephemeral token generation for WebRTC
  app.use("/api/realtime", realtimeVoiceRouter);

  // AssemblyAI voice API — STT, LLM Gateway, streaming tokens, voice-agent tokens
  app.use("/api/voice", voiceRouter);

  // AssemblyAI Voice Agent — temp token + status for the trading voice agent
  app.use("/api/voice-agent", voiceAgentRouter);

  // LiveKit Voice Agent — webhook receiver for room/participant/track events
  app.use("/api/livekit", livekitRouter);

  // Discord bot bridge — REST + SSE.
  app.use("/api/discord", discordRouter);

  // Discord OAuth — callback must match URL registered in Discord Dev Portal:
  // http://cheshireterminal.ai/discord/auth/callback (no /api/ prefix)
  app.use("/discord", discordOAuthRouter);

  // Twitter/X OAuth — callback: https://cheshireterminal.ai/auth/callback/twitter
  app.use("/auth", twitterOAuthRouter);

  // DFlow Prediction Markets — quote API + prediction markets API proxy
  app.use("/api/dflow", dflowRouter);
  app.use("/api/phoenix", phoenixRouter);
  app.use("/api/imperial", imperialRouter);
  app.use("/api/flash", flashRouter);
  app.use("/api/coingecko", coingeckoRouter);
  app.use("/api/stocks", stocksRouter);

  // NewsAPI — trending crypto/AI headlines
  app.use("/api/news", newsRouter);
  app.use("/api/imagine", imagineRouter);
  app.use("/api/gemini-studio", geminiStudioRouter);

  // Clawd autonomous trading agent — arena feed + control
  app.use("/api/clawd", clawdArenaRouter);

  // Agent Arena — human/agent room creation, joining, messages, and API keys
  app.use("/api/arena", arenaRouter);

  // CLAWD Router — OpenAI-compatible proxy through the configured gateway → OpenRouter
  // Provides full OpenRouter app attribution (HTTP-Referer, X-OpenRouter-Title, X-OpenRouter-Categories)
  app.use("/api/clawdrouter", clawdRouter);

  // Public skill catalog.
  app.use("/api/skills", skillsRouter);

  // Cheshire Free — public terminal over OpenRouter free-safe routes
  app.use("/api/free-terminal", freeTerminalRouter);

  // Moonshot Kimi — public CLAWD companion and provider metadata.
  app.use("/api/moonshot", moonshotRouter);

  // RedPill TEE Gateway — privacy-first GPU TEE inference
  app.use("/api/tee", teeRouter);
  app.use("/api/developer", developerApiRouter);
  app.use("/api/cloudflare-stream", cloudflareStreamRouter);

  const httpServer = existingServer ?? createServer(app);

  // Attach Clawd arena WebSocket on /ws/clawd (separate from /ws to avoid collision)
  const arenaWss = attachArenaWebSocket(httpServer);
  clawdAutostart().catch((e) => console.warn("[clawd] autostart failed:", e?.message));
  startHeliusPumpStream();
  startHeliusAgentExplorerStream();
  
  // ── WebSocket connection rate limiter ──────────────────────────────────────
  // Allows 20 new WS connections per IP per minute to prevent connection floods.
  const wsConnectBuckets = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of wsConnectBuckets) if (v.resetAt <= now) wsConnectBuckets.delete(k);
  }, 5 * 60 * 1000).unref();

  function wsClientIp(req: import('http').IncomingMessage): string {
    const fwd = req.headers['x-forwarded-for'];
    return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
  }

  function wsRateLimitExceeded(ip: string): boolean {
    // Never rate-limit loopback in dev — Vite HMR + multiple tabs all come from 127.0.0.1.
    if (process.env.NODE_ENV !== 'production' && /^(127\.|::1$|localhost)/.test(ip)) return false;
    const now = Date.now();
    const bucket = wsConnectBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      wsConnectBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    if (bucket.count >= 20) return true;
    bucket.count += 1;
    return false;
  }

  // ── Allowed WS origins (mirrors CORS config) ───────────────────────────────
  const allowedWsOrigins = new Set(
    [
      process.env.APP_ORIGIN,
      process.env.VITE_APP_URL,
      process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : undefined,
    ]
      .filter(Boolean)
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim().replace(/\/$/, '')),
  );

  function isAllowedWsOrigin(origin: string | undefined): boolean {
    if (!origin) return true; // no Origin header = non-browser client
    const normalized = origin.replace(/\/$/, '');
    if (allowedWsOrigins.has(normalized)) return true;
    if (process.env.NODE_ENV !== 'production') {
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
    }
    return false;
  }

  // Initialize WebSocket server with a more generic path
  // Using a prefix pattern is more compatible with Replit's proxy
  const wss = new WebSocketServer({
    noServer: true,
    // Disable permessage-deflate — some buggy clients send compressed frames
    // even when the extension wasn't negotiated, which throws
    // "Invalid WebSocket frame: RSV1 must be clear" (WS_ERR_UNEXPECTED_RSV_1).
    perMessageDeflate: false,
    // Reject unreasonably large frames defensively
    maxPayload: 16 * 1024 * 1024,
  });

  // Server-level error handler — prevents listen errors from crashing the process
  wss.on('error', (err) => {
    console.warn('[ws] server error:', (err as any)?.code || err?.message);
  });
  
  // Map to store connected clients
  const clients = new Map<string, {
    ws: WebSocket;
    id: string;
    walletAddress?: string;
    displayName?: string;
    rooms: Set<number>;
  }>();
  
  // Map to store room subscriptions
  const rooms = new Map<number, Set<string>>();
  
  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket) => {
    const clientId = uuidv4();
    const clientData = {
      ws,
      id: clientId,
      rooms: new Set<number>()
    };

    clients.set(clientId, clientData);

    // Per-socket error handler — without this, malformed frames
    // (e.g. WS_ERR_UNEXPECTED_RSV_1 from buggy compressed clients)
    // bubble up to uncaughtException and crash the process.
    ws.on('error', (err) => {
      const code = (err as any)?.code;
      console.warn(`[ws] client ${clientId} error:`, code || err?.message);
      try { ws.terminate(); } catch {}
      clients.delete(clientId);
    });
    
    // Send connection established message
    const connectionEvent: ChatEvent = {
      type: ChatEventType.JOIN_ROOM,
      timestamp: new Date().toISOString(),
      roomId: undefined,
    };
    
    ws.send(JSON.stringify({
      type: 'connection_established',
      clientId,
      timestamp: new Date().toISOString()
    }));
    
    // Handle incoming messages
    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message);
        
        // Handle different message types
        switch (data.type) {
          case ChatEventType.JOIN_ROOM:
            await handleJoinRoom(clientId, data);
            break;
            
          case ChatEventType.LEAVE_ROOM:
            await handleLeaveRoom(clientId, data);
            break;
            
          case ChatEventType.SEND_MESSAGE:
            await handleSendMessage(clientId, data);
            break;
            
          case 'terminal_message':
            await handleTerminalMessage(clientId, data);
            break;
            
          case 'base_transaction_sent':
            await handleBaseTransaction(clientId, data);
            break;
            
          case 'base_wallet_connected':
            await handleBaseWalletConnected(clientId, data);
            break;
            
          case 'agent_wallet_connected':
            await handleAgentWalletConnected(clientId, data);
            break;
            
          case 'agent_transaction_complete':
            await handleAgentTransaction(clientId, data);
            break;
            
          case 'register':
            handleRegisterClient(clientId, data);
            break;
            
          case 'ping':
            // Handle ping messages with pong responses to keep connections alive
            const client = clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                type: 'pong',
                timestamp: new Date().toISOString(),
                echo: data.timestamp
              }));
            }
            break;
            
          default:
            sendErrorToClient(clientId, 'Unknown message type');
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
        sendErrorToClient(clientId, 'Failed to process message');
      }
    });
    
    // Handle client disconnection
    ws.on('close', () => {
      // Remove client from all rooms they were in
      const client = clients.get(clientId);
      if (client) {
        client.rooms.forEach(roomId => {
          const roomClients = rooms.get(roomId);
          if (roomClients) {
            roomClients.delete(clientId);
            
            // Notify other users in the room
            if (client.walletAddress && client.displayName) {
              const leaveEvent: ChatEvent = {
                type: ChatEventType.USER_LEFT,
                roomId,
                user: {
                  walletAddress: client.walletAddress,
                  displayName: client.displayName
                },
                timestamp: new Date().toISOString()
              };
              
              broadcastToRoom(roomId, leaveEvent, clientId);
            }
          }
        });
      }
      
      // Remove client from clients map
      clients.delete(clientId);
    });
  });

  function rejectUpgrade(socket: Socket, statusCode: number, statusText: string) {
    socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  httpServer.on("upgrade", (req, socket, head) => {
    const netSocket = socket as Socket;
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws" && pathname !== "/ws/clawd") {
      return;
    }

    const origin = req.headers.origin;
    const ip = wsClientIp(req);
    if (!isAllowedWsOrigin(origin)) {
      console.warn(`[ws] rejected connection from disallowed origin: ${origin} (${ip})`);
      return rejectUpgrade(netSocket, 403, "Forbidden");
    }
    if (wsRateLimitExceeded(ip)) {
      console.warn(`[ws] rate-limited connection from ${ip}`);
      return rejectUpgrade(netSocket, 429, "Too Many Connections");
    }

    if (pathname === "/ws/clawd") {
      arenaWss.handleUpgrade(req, netSocket, head, (ws) => {
        arenaWss.emit("connection", ws, req);
      });
      return;
    }

    wss.handleUpgrade(req, netSocket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
  
  // Helper function to handle join room requests
  async function handleJoinRoom(clientId: string, data: any) {
    const { roomId, walletAddress, displayName } = data;
    const client = clients.get(clientId);
    
    if (!client) return;
    
    if (!roomId || !walletAddress || !displayName) {
      return sendErrorToClient(clientId, 'Missing required fields');
    }
    
    try {
      // Get the room
      const room = await storage.getChatRoom(roomId);
      if (!room) {
        return sendErrorToClient(clientId, 'Room not found');
      }
      
      // Check if user is banned
      const memberCheck = await storage.getRoomMember(roomId, walletAddress);
      if (memberCheck?.isBanned) {
        return sendErrorToClient(clientId, 'You are banned from this room');
      }
      
      // Add client to room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set<string>());
      }
      
      // Save user info
      client.walletAddress = walletAddress;
      client.displayName = displayName;
      client.rooms.add(roomId);
      rooms.get(roomId)?.add(clientId);
      
      // Add to database
      const member = await storage.getRoomMember(roomId, walletAddress);
      if (!member) {
        await storage.addRoomMember({
          roomId,
          walletAddress,
          displayName,
          isAdmin: false
        });
      } else {
        // Update last active time
        await storage.updateRoomMemberLastActive(roomId, walletAddress);
      }
      
      // Send recent messages
      const messages = await storage.getChatMessages(roomId, 50);
      
      client.ws.send(JSON.stringify({
        type: 'room_joined',
        roomId,
        room,
        messages,
        timestamp: new Date().toISOString()
      }));
      
      // Create system message for new user
      await storage.createChatMessage({
        roomId,
        sender: walletAddress,
        senderName: displayName,
        content: `${displayName} joined the room`,
        isSystem: true
      });
      
      // Notify other users
      const joinEvent: ChatEvent = {
        type: ChatEventType.USER_JOINED,
        roomId,
        user: {
          walletAddress,
          displayName
        },
        timestamp: new Date().toISOString()
      };
      
      broadcastToRoom(roomId, joinEvent, clientId);
      
    } catch (err) {
      console.error('Error joining room:', err);
      sendErrorToClient(clientId, 'Failed to join room');
    }
  }
  
  // Helper function to handle leave room requests
  async function handleLeaveRoom(clientId: string, data: any) {
    const { roomId } = data;
    const client = clients.get(clientId);
    
    if (!client || !roomId) return;
    
    try {
      if (client.rooms.has(roomId)) {
        // Remove from room
        client.rooms.delete(roomId);
        rooms.get(roomId)?.delete(clientId);
        
        // Notify client
        client.ws.send(JSON.stringify({
          type: 'room_left',
          roomId,
          timestamp: new Date().toISOString()
        }));
        
        // Create system message
        if (client.walletAddress && client.displayName) {
          await storage.createChatMessage({
            roomId,
            sender: client.walletAddress,
            senderName: client.displayName,
            content: `${client.displayName} left the room`,
            isSystem: true
          });
          
          // Notify other users
          const leaveEvent: ChatEvent = {
            type: ChatEventType.USER_LEFT,
            roomId,
            user: {
              walletAddress: client.walletAddress,
              displayName: client.displayName
            },
            timestamp: new Date().toISOString()
          };
          
          broadcastToRoom(roomId, leaveEvent, clientId);
        }
      }
    } catch (err) {
      console.error('Error leaving room:', err);
    }
  }
  
  // Helper function to handle sending messages
  async function handleSendMessage(clientId: string, data: any) {
    const { roomId, content, replyTo } = data;
    const client = clients.get(clientId);
    
    if (!client || !roomId || !content) {
      return sendErrorToClient(clientId, 'Missing required fields');
    }
    
    try {
      if (!client.rooms.has(roomId) || !client.walletAddress || !client.displayName) {
        return sendErrorToClient(clientId, 'You must join the room first');
      }
      
      // Check if room exists
      const room = await storage.getChatRoom(roomId);
      if (!room) {
        return sendErrorToClient(clientId, 'Room not found');
      }
      
      // Check if user is banned
      const member = await storage.getRoomMember(roomId, client.walletAddress);
      if (member?.isBanned) {
        return sendErrorToClient(clientId, 'You are banned from this room');
      }
      
      // Create message
      const message = await storage.createChatMessage({
        roomId,
        sender: client.walletAddress,
        senderName: client.displayName,
        content,
        isSystem: false,
        replyTo: replyTo || undefined
      });
      
      // Update room activity
      await storage.updateRoomLastActivity(roomId);
      
      // Update member activity
      await storage.updateRoomMemberLastActive(roomId, client.walletAddress);
      trackUsageForWallet(client.walletAddress, {
        eventType: "message",
        productArea: "chat",
        route: "/ws/chat",
        sessionId: clientId,
        units: 1,
        totalTokens: estimateTokensFromText(content),
        metadata: { roomId, replyTo: replyTo || null },
      });
      
      // Broadcast message to all clients in the room
      const messageEvent: ChatEvent = {
        type: ChatEventType.NEW_MESSAGE,
        roomId,
        message,
        timestamp: new Date().toISOString()
      };
      
      broadcastToRoom(roomId, messageEvent);
      
    } catch (err) {
      console.error('Error sending message:', err);
      sendErrorToClient(clientId, 'Failed to send message');
    }
  }
  
  // Helper function to broadcast to all clients in a room
  function broadcastToRoom(roomId: number, event: ChatEvent, excludeClientId?: string) {
    const roomClients = rooms.get(roomId);
    if (!roomClients) return;
    
    roomClients.forEach(id => {
      if (excludeClientId && id === excludeClientId) return;
      
      const client = clients.get(id);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(event));
      }
    });
  }
  
  // Helper function to send error to a client
  function sendErrorToClient(clientId: string, errorMessage: string) {
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      const errorEvent: ChatEvent = {
        type: ChatEventType.ERROR,
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
      client.ws.send(JSON.stringify(errorEvent));
    }
  }
  
  // Helper function to handle client registration
  function handleRegisterClient(clientId: string, data: any) {
    const client = clients.get(clientId);
    if (!client) return;
    
    // Store client type information if provided
    if (data.clientType) {
      console.log(`Client ${clientId} registered as ${data.clientType}`);
      
      // If it's a telegram bot, we can store additional info
      if (data.clientType === 'telegram_bot') {
        console.log('Telegram bot connected to WebSocket server');
        
        // Acknowledge registration
        client.ws.send(JSON.stringify({
          type: 'registration_successful',
          clientId,
          clientType: data.clientType,
          timestamp: new Date().toISOString()
        }));
      }
      
      // If it's a telegram mini app user, register their info
      if (data.clientType === 'telegram_mini_app') {
        const { walletAddress, username, telegramId } = data;
        
        if (walletAddress && username) {
          client.walletAddress = walletAddress;
          client.displayName = username;
          
          console.log(`Telegram Mini App user registered: ${username} (${walletAddress.slice(0, 6)}...)`);
          
          // Acknowledge registration
          client.ws.send(JSON.stringify({
            type: 'registration_successful',
            clientId,
            clientType: data.clientType,
            walletAddress,
            username,
            telegramId,
            timestamp: new Date().toISOString()
          }));
          
          // Notify other relevant clients about this user's presence
          broadcastUserPresence({
            type: 'user_presence',
            walletAddress,
            username,
            clientType: 'telegram_mini_app',
            isOnline: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }
  
  // Helper function to handle terminal messages to Telegram
  async function handleTerminalMessage(clientId: string, data: any) {
    const { content, room: roomId, timestamp } = data;
    const client = clients.get(clientId);
    
    if (!client || !content) {
      return sendErrorToClient(clientId, 'Missing required fields');
    }
    
    try {
      // Get the default "Terminal" displayName and wallet for the CheshireChat
      const displayName = "Terminal User";
      const walletAddress = "terminal"; // Using a reserved keyword as the ID
      
      // If room ID is provided, only send to that room
      if (roomId) {
        // Check if room exists
        const room = await storage.getChatRoom(roomId);
        if (!room) {
          return sendErrorToClient(clientId, 'Room not found');
        }
        
        // Create message in the database
        const message = await storage.createChatMessage({
          roomId,
          sender: walletAddress,
          senderName: displayName,
          content,
          isSystem: false,
          clientType: 'terminal'
        });
        
        // Update room activity
        await storage.updateRoomLastActivity(roomId);
        trackUsageForWallet(client.walletAddress, {
          eventType: "message",
          productArea: "chat",
          route: "/ws/terminal",
          sessionId: clientId,
          units: 1,
          totalTokens: estimateTokensFromText(content),
          metadata: { roomId, clientType: "terminal" },
        });
        
        // Broadcast message to all clients in the room
        const messageEvent: ChatEvent = {
          type: ChatEventType.NEW_MESSAGE,
          roomId,
          message: {
            ...message,
            clientType: 'terminal'
          },
          timestamp: timestamp || new Date().toISOString()
        };
        
        broadcastToRoom(roomId, messageEvent, clientId);
      } else {
        // If no room ID, this is a global announcement
        // For now, just send to default room (ID: 1)
        const defaultRoomId = 1;
        
        // Create message in database
        const message = await storage.createChatMessage({
          roomId: defaultRoomId,
          sender: walletAddress,
          senderName: displayName,
          content,
          isSystem: false,
          clientType: 'terminal'
        });
        
        // Update room activity
        await storage.updateRoomLastActivity(defaultRoomId);
        trackUsageForWallet(client.walletAddress, {
          eventType: "message",
          productArea: "chat",
          route: "/ws/terminal",
          sessionId: clientId,
          units: 1,
          totalTokens: estimateTokensFromText(content),
          metadata: { roomId: defaultRoomId, clientType: "terminal" },
        });
        
        // Broadcast message to all clients in the default room
        const messageEvent: ChatEvent = {
          type: ChatEventType.NEW_MESSAGE,
          roomId: defaultRoomId,
          message: {
            ...message,
            clientType: 'terminal'
          },
          timestamp: timestamp || new Date().toISOString()
        };
        
        broadcastToRoom(defaultRoomId, messageEvent, clientId);
      }
      
      // Also forward message to Telegram bot
      clients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN && 
            client.displayName === 'TelegramBot') {
          client.ws.send(JSON.stringify({
            type: 'terminal_message',
            content,
            senderName: displayName,
            roomId: roomId || 1,
            timestamp: timestamp || new Date().toISOString()
          }));
        }
      });
      
    } catch (err) {
      console.error('Error sending terminal message:', err);
      sendErrorToClient(clientId, 'Failed to send terminal message');
    }
  }

  // Broadcast user presence to all connected clients
  function broadcastUserPresence(data: any) {
    clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
      }
    });
  }

  // Expose gallery broadcast so any route can call it via app.locals
  function broadcastGalleryItem(item: GalleryItem) {
    const payload = JSON.stringify({ type: 'gallery_item_added', item, timestamp: new Date().toISOString() });
    clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
    });
  }
  app.locals.broadcastGalleryItem = broadcastGalleryItem;
  onGalleryItemAdded(broadcastGalleryItem);
  
  // Helper function to handle Base transactions
  async function handleBaseTransaction(clientId: string, data: any) {
    const { txHash, amount, to, from, telegramId } = data;
    const client = clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    try {
      console.log(`Base transaction received from ${clientId}:`, { txHash, amount, to, from });
      
      // Forward to Telegram bot client if it's connected
      const telegramBotClient = Array.from(clients.values()).find(c => 
        c.displayName === 'TelegramBot' || 
        c.walletAddress === 'telegram_bot'
      );
      
      if (telegramBotClient && telegramBotClient.ws.readyState === WebSocket.OPEN) {
        telegramBotClient.ws.send(JSON.stringify({
          type: 'base_transaction_sent',
          txHash,
          amount,
          to,
          from,
          telegramId,
          timestamp: new Date().toISOString()
        }));
      }
      
      // Also broadcast to general room
      const defaultRoomId = 1;
      
      // Create a system message in the chat
      const displayName = client.displayName || "Base User";
      const walletAddress = client.walletAddress || "base_user";
      
      const content = `💰 Base Transaction: ${amount} ETH sent from ${from.slice(0, 6)}...${from.slice(-4)} to ${to.slice(0, 6)}...${to.slice(-4)}`;
      
      // Create message in database
      const message = await storage.createChatMessage({
        roomId: defaultRoomId,
        sender: walletAddress,
        senderName: displayName,
        content,
        isSystem: true,
        clientType: 'base'
      });
      
      // Update room activity
      await storage.updateRoomLastActivity(defaultRoomId);
      
      // Broadcast message to all clients in the default room
      const messageEvent: ChatEvent = {
        type: ChatEventType.NEW_MESSAGE,
        roomId: defaultRoomId,
        message: {
          ...message,
          clientType: 'base'
        },
        timestamp: new Date().toISOString()
      };
      
      broadcastToRoom(defaultRoomId, messageEvent);
      
    } catch (err) {
      console.error('Error handling Base transaction:', err);
    }
  }
  
  // Helper function to handle Base wallet connections
  async function handleBaseWalletConnected(clientId: string, data: any) {
    const { baseAddress, telegramId } = data;
    const client = clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    try {
      console.log(`Base wallet connected from ${clientId}:`, { baseAddress });
      
      // Store Base address with client data
      client.displayName = client.displayName || "Base User";
      
      // Forward to Telegram bot client if it's connected
      const telegramBotClient = Array.from(clients.values()).find(c => 
        c.displayName === 'TelegramBot' || 
        c.walletAddress === 'telegram_bot'
      );
      
      if (telegramBotClient && telegramBotClient.ws.readyState === WebSocket.OPEN) {
        telegramBotClient.ws.send(JSON.stringify({
          type: 'base_wallet_connected',
          baseAddress,
          telegramId,
          timestamp: new Date().toISOString()
        }));
      }
      
      // Also broadcast to general room
      const defaultRoomId = 1;
      
      // Create a system message in the chat
      const displayName = client.displayName;
      const walletAddress = client.walletAddress || "base_user";
      
      const content = `🔗 Base Wallet Connected: ${baseAddress.slice(0, 10)}...${baseAddress.slice(-8)}`;
      
      // Create message in database
      const message = await storage.createChatMessage({
        roomId: defaultRoomId,
        sender: walletAddress,
        senderName: displayName,
        content,
        isSystem: true,
        clientType: 'base'
      });
      
      // Update room activity
      await storage.updateRoomLastActivity(defaultRoomId);
      
      // Broadcast message to all clients in the default room
      const messageEvent: ChatEvent = {
        type: ChatEventType.NEW_MESSAGE,
        roomId: defaultRoomId,
        message: {
          ...message,
          clientType: 'base'
        },
        timestamp: new Date().toISOString()
      };
      
      broadcastToRoom(defaultRoomId, messageEvent);
      
    } catch (err) {
      console.error('Error handling Base wallet connection:', err);
    }
  }
  
  // Helper function to handle AI Agent wallet connected
  async function handleAgentWalletConnected(clientId: string, data: any) {
    const { walletAddress, walletType, agentEnabled } = data;
    const client = clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    try {
      console.log(`AI Agent wallet connected from ${clientId}:`, { walletAddress, walletType, agentEnabled });
      
      // Update client information
      client.displayName = client.displayName || "AI Agent";
      
      // Acknowledge connection
      client.ws.send(JSON.stringify({
        type: 'agent_wallet_connected_ack',
        walletAddress,
        walletType,
        agentEnabled,
        timestamp: new Date().toISOString()
      }));
      
      // Broadcast to general room
      const defaultRoomId = 1;
      
      // Create a system message in the chat
      const displayName = client.displayName;
      const content = `🤖 AI Agent wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} (${walletType})`;
      
      // Create message in database
      const message = await storage.createChatMessage({
        roomId: defaultRoomId,
        sender: walletAddress,
        senderName: displayName,
        content,
        isSystem: true,
        clientType: 'agent'
      });
      
      // Update room activity
      await storage.updateRoomLastActivity(defaultRoomId);
      
      // Broadcast message to all clients in the room
      const messageEvent: ChatEvent = {
        type: ChatEventType.NEW_MESSAGE,
        roomId: defaultRoomId,
        message: {
          ...message,
          clientType: 'agent'
        },
        timestamp: new Date().toISOString()
      };
      
      broadcastToRoom(defaultRoomId, messageEvent);
      
    } catch (err) {
      console.error('Error handling Agent wallet connection:', err);
    }
  }
  
  // Helper function to handle AI Agent transaction
  async function handleAgentTransaction(clientId: string, data: any) {
    const { txHash, amount, toAddress, fromAddress, status } = data;
    const client = clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    try {
      console.log(`AI Agent transaction from ${clientId}:`, { txHash, amount, toAddress, fromAddress, status });
      
      // Broadcast to general room
      const defaultRoomId = 1;
      
      // Create a system message in the chat
      const displayName = client.displayName || "AI Agent";
      const walletAddress = client.walletAddress || fromAddress || "agent";
      
      const content = `🚀 AI Agent Transaction: ${amount} SOL sent from ${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)} to ${toAddress.slice(0, 6)}...${toAddress.slice(-4)} - Status: ${status}`;
      
      // Create message in database
      const message = await storage.createChatMessage({
        roomId: defaultRoomId,
        sender: walletAddress,
        senderName: displayName,
        content,
        isSystem: true,
        clientType: 'agent'
      });
      
      // Update room activity
      await storage.updateRoomLastActivity(defaultRoomId);
      
      // Broadcast message to all clients in the room
      const messageEvent: ChatEvent = {
        type: ChatEventType.NEW_MESSAGE,
        roomId: defaultRoomId,
        message: {
          ...message,
          clientType: 'agent'
        },
        timestamp: new Date().toISOString()
      };
      
      broadcastToRoom(defaultRoomId, messageEvent);
      
      // Acknowledge transaction
      client.ws.send(JSON.stringify({
        type: 'agent_transaction_ack',
        txHash,
        status: 'received',
        timestamp: new Date().toISOString()
      }));
      
    } catch (err) {
      console.error('Error handling Agent transaction:', err);
    }
  }
  
  // Initialize the WebSocketManager and attach it to the app
  const wsManager = new WebSocketManager();
  app.locals.websocketManager = wsManager;
  
  return httpServer;
}
