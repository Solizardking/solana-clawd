import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import {
  challengeHandler,
  entryHandler,
  logoutHandler,
  meHandler,
  profileHandler,
  statusHandler,
  twitterLinkCallbackHandler,
  twitterLinkStartHandler,
  verifyHandler,
} from "./walletAuthHttp";
import { verifyClawd } from "./heliusHttp";
import {
  getTelegramProfile,
  registerTelegramUser,
  setTelegramAgentName,
} from "./telegramHttp";

const http = httpRouter();

// ── Wallet auth routes (CLAWD token-gated sign-in) ────────────────────────────
http.route({ path: "/api/auth/entry",     method: "GET",     handler: entryHandler });
http.route({ path: "/api/auth/entry",     method: "OPTIONS", handler: entryHandler });
http.route({ path: "/api/auth/challenge", method: "GET",     handler: challengeHandler });
http.route({ path: "/api/auth/challenge", method: "OPTIONS", handler: challengeHandler });
http.route({ path: "/api/auth/verify",    method: "POST",    handler: verifyHandler });
http.route({ path: "/api/auth/verify",    method: "OPTIONS", handler: verifyHandler });
http.route({ path: "/api/auth/me",        method: "GET",     handler: meHandler });
http.route({ path: "/api/auth/me",        method: "OPTIONS", handler: meHandler });
http.route({ path: "/api/auth/status",    method: "GET",     handler: statusHandler });
http.route({ path: "/api/auth/status",    method: "OPTIONS", handler: statusHandler });
http.route({ path: "/api/auth/logout",    method: "POST",    handler: logoutHandler });
http.route({ path: "/api/auth/logout",    method: "OPTIONS", handler: logoutHandler });
http.route({ path: "/api/auth/profile",   method: "POST",    handler: profileHandler });
http.route({ path: "/api/auth/profile",   method: "OPTIONS", handler: profileHandler });

// ── CLAWD balance verification ────────────────────────────────────────────────
http.route({ path: "/api/helius/verify-clawd", method: "GET",     handler: verifyClawd });
http.route({ path: "/api/helius/verify-clawd", method: "OPTIONS", handler: verifyClawd });

// ── Twitter OAuth link flow (wallet-session-scoped PKCE) ──────────────────────
http.route({ path: "/api/auth/twitter-link/start",    method: "GET",     handler: twitterLinkStartHandler });
http.route({ path: "/api/auth/twitter-link/start",    method: "OPTIONS", handler: twitterLinkStartHandler });
http.route({ path: "/api/auth/twitter-link/callback", method: "GET",     handler: twitterLinkCallbackHandler });
http.route({ path: "/api/auth/twitter-link/callback", method: "OPTIONS", handler: twitterLinkCallbackHandler });

// ── Telegram user persistence (Convex-backed, called by bot server) ───────────
http.route({ path: "/api/telegram/register", method: "POST",    handler: registerTelegramUser });
http.route({ path: "/api/telegram/register", method: "OPTIONS", handler: registerTelegramUser });
http.route({ path: "/api/telegram/profile",  method: "GET",     handler: getTelegramProfile });
http.route({ path: "/api/telegram/profile",  method: "OPTIONS", handler: getTelegramProfile });
http.route({ path: "/api/telegram/setname",  method: "POST",    handler: setTelegramAgentName });
http.route({ path: "/api/telegram/setname",  method: "OPTIONS", handler: setTelegramAgentName });

// ── Agent Auth discovery ──────────────────────────────────────────────────────
// Exposes provider metadata, supported modes, and capability list. Agents
// discover the terminal at `/.well-known/agent-configuration` per the open
// agent-configuration convention.
const agentConfigHandler = httpAction(async (_ctx, _req) => {
  const configuration = {
    providerName: "Cheshire Terminal",
    providerDescription:
      "AI agent capabilities for the Cheshire Terminal — your pokemon squad ready to trade, launch, and explore on-chain.",
    modes: ["delegated", "autonomous"],
    capabilities: [
      { name: "chat", description: "Send a message through the AI terminal." },
      { name: "trade", description: "Execute a token swap via Jupiter on Solana." },
      { name: "launch_token", description: "Launch a new token on pump.fun." },
      { name: "query_market", description: "Query market data and DeFi analytics for a Solana token." },
      { name: "manage_wallet", description: "View balances and manage agent wallets." },
      { name: "subscribe_clawd", description: "Manage 69,420 CLAWD/month recurring subscriptions." },
    ],
  };

  return new Response(JSON.stringify(configuration), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

http.route({ path: "/.well-known/agent-configuration", method: "GET",     handler: agentConfigHandler });
http.route({ path: "/.well-known/agent-configuration", method: "OPTIONS", handler: agentConfigHandler });

export default http;
