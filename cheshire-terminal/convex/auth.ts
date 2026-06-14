import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { DataModel } from "./_generated/dataModel";
import { twoFactor } from "better-auth/plugins/two-factor";
import { anonymous } from "better-auth/plugins/anonymous";
import { lastLoginMethod, organization } from "better-auth/plugins";
import { agentAuth } from "@better-auth/agent-auth";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth, {
  verbose: false,
});

const canonicalAuthBaseURL =
  (process.env.BETTER_AUTH_URL ?? "https://cheshireterminal.ai")
    .trim()
    .replace(/\/api\/auth\/?$/, "")
    .replace(/\/$/, "");

const trustedOrigins = [
  "https://cheshireterminal.ai",
  process.env.APP_ORIGIN,
  process.env.VITE_APP_URL,
  process.env.CONVEX_SITE_URL,
]
  .filter(Boolean)
  .flatMap((value) => String(value).split(","))
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

function envFlag(name: string, defaultValue = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value);
}

const platformPasswordRegistrationEnabled = envFlag("ENABLE_PLATFORM_PASSWORD_REGISTRATION");
const socialLoginEnabled = envFlag("ENABLE_SOCIAL_LOGIN", true);
const trustedSocialProviders = socialLoginEnabled ? ["google", "github", "discord", "twitter"] : [];

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: canonicalAuthBaseURL,
    basePath: "/api/auth",
    appName: "Cheshire Terminal",
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: platformPasswordRegistrationEnabled,
    },
    socialProviders: socialLoginEnabled
      ? {
          ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
            ? {
                discord: {
                  clientId: process.env.DISCORD_CLIENT_ID,
                  clientSecret: process.env.DISCORD_CLIENT_SECRET,
                },
              }
            : {}),
          ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
            ? {
                github: {
                  clientId: process.env.GITHUB_CLIENT_ID,
                  clientSecret: process.env.GITHUB_CLIENT_SECRET,
                },
              }
            : {}),
          ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? {
                google: {
                  clientId: process.env.GOOGLE_CLIENT_ID,
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                  prompt: "select_account",
                },
              }
            : {}),
          ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
            ? {
                twitter: {
                  clientId: process.env.TWITTER_CLIENT_ID,
                  clientSecret: process.env.TWITTER_CLIENT_SECRET,
                },
              }
            : {}),
        }
      : {},
    account: {
      accountLinking: {
        enabled: socialLoginEnabled,
        trustedProviders: trustedSocialProviders,
        allowDifferentEmails: true,
        updateUserInfoOnLink: true,
      },
    },
    session: {
      storeSessionInDatabase: false,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "jwe",
      },
    },
    advanced: {
      trustedProxyHeaders: true,
      ipAddress: {
        ipAddressHeaders: [
          "cf-connecting-ip",
          "x-vercel-forwarded-for",
          "fly-client-ip",
          "x-real-ip",
          "x-forwarded-for",
        ],
      },
    },
    trustedOrigins,
    plugins: [
      organization({ teams: { enabled: true } }),
      agentAuth({
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
        async onExecute({ capability }) {
          throw new Error(`Capability '${capability}' must be invoked at its registered API endpoint.`);
        },
      }),
      twoFactor(),
      anonymous(),
      lastLoginMethod(),
      // crossDomain must be registered before `convex` so the framework can
      // rewrite cookies for the parent app origin during OAuth/social flows.
      ...(canonicalAuthBaseURL
        ? [crossDomain({ siteUrl: canonicalAuthBaseURL })]
        : []),
      convex({ authConfig }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

export const { getAuthUser } = authComponent.clientApi();

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
