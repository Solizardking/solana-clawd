/**
 * Better Auth server instance for Express middleware use.
 * Auth requests are handled by Convex HTTP (convex/http.ts).
 * This module re-exports helpers for session validation in Express routes.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { lastLoginMethod, openAPI, organization } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { agentAuth } from "@better-auth/agent-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getTelegramClientId, getTelegramClientSecret } from "../server/lib/telegram/auth";
import { db, hasDatabase } from "../server/db";
import {
  betterAuthUser,
  betterAuthSession,
  betterAuthAccount,
  betterAuthVerification,
  betterAuthOrganization,
  betterAuthMember,
  betterAuthInvitation,
  baTeam,
  baTeamMember,
  baAgentHost,
  baAgent,
  baAgentCapabilityGrant,
  baApprovalRequest,
} from "../drizzle/schema";

const DEFAULT_PUBLIC_ORIGIN = "https://www.cheshireterminal.ai";
const LEGACY_PUBLIC_ORIGIN = "https://cheshireterminal.ai";

// BETTER_AUTH_URL must be the app origin only (e.g. https://www.cheshireterminal.ai).
// Better Auth appends basePath (/api/auth) itself to construct callback URIs.
const canonicalAuthBaseURL =
  (process.env.BETTER_AUTH_URL ??
    process.env.APP_ORIGIN ??
    process.env.VITE_APP_URL ??
    DEFAULT_PUBLIC_ORIGIN)
    .trim()
    .replace(/\/api\/auth\/?$/, "") // strip accidental /api/auth suffix
    .replace(/\/$/, "");

const trustedOrigins = [
  DEFAULT_PUBLIC_ORIGIN,
  LEGACY_PUBLIC_ORIGIN,
  process.env.APP_ORIGIN,
  process.env.VITE_APP_URL,
  process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : undefined,
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
const trustedSocialProviders = socialLoginEnabled ? ["google", "github", "discord", "twitter", "telegram", "neon"] : [];

const telegramClientId = getTelegramClientId();
const telegramClientSecret = getTelegramClientSecret();
const telegramJwks = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"));
const telegramOAuthPlugin =
  socialLoginEnabled && telegramClientId && telegramClientSecret
    ? genericOAuth({
        config: [
          {
            providerId: "telegram",
            clientId: telegramClientId,
            clientSecret: telegramClientSecret,
            discoveryUrl: "https://oauth.telegram.org/.well-known/openid-configuration",
            issuer: "https://oauth.telegram.org",
            pkce: true,
            authentication: "basic",
            scopes: ["openid", "profile", "phone", "telegram:bot_access"],
            getUserInfo: async (tokens) => {
              if (!tokens.idToken) return null;
              const { payload } = await jwtVerify(tokens.idToken, telegramJwks, {
                issuer: "https://oauth.telegram.org",
                audience: telegramClientId,
              });
              const telegramId = String(payload.sub || payload.id || "");
              if (!telegramId) return null;
              return {
                id: telegramId,
                name: String(payload.name || payload.preferred_username || `Telegram ${telegramId}`),
                email: `${telegramId}@telegram.cheshireterminal.ai`,
                emailVerified: true,
                image: typeof payload.picture === "string" ? payload.picture : undefined,
              };
            },
          },
        ],
      })
    : null;

const DEFAULT_NEON_AUTH_BASE = "https://ep-snowy-tree-aq3hsg7q.neonauth.c-8.us-east-1.aws.neon.tech/neondb/auth";

function normalizeNeonAuthBaseUrl(rawUrl?: string) {
  const value = rawUrl?.trim();
  if (!value) return DEFAULT_NEON_AUTH_BASE;
  return value
    .replace(/\/\.well-known\/jwks\.json$/i, "")
    .replace(/\/\.well-known\/openid-configuration$/i, "")
    .replace(/\/$/, "");
}

// Neon Auth (Stack Auth-powered, OIDC-compatible) — set NEON_AUTH_CLIENT_ID + NEON_AUTH_CLIENT_SECRET.
// Accepts NEON_AUTH/NEON_AUTH_JWKS_URL values copied from Neon and normalizes them to the auth issuer base.
const neonAuthBase = normalizeNeonAuthBaseUrl(
  process.env.NEON_AUTH_URL ||
    process.env.NEON_AUTH_BASE_URL ||
    process.env.NEON_AUTH ||
    process.env.NEON_AUTH_JWKS_URL,
);
const neonOAuthPlugin =
  socialLoginEnabled && process.env.NEON_AUTH_CLIENT_ID && process.env.NEON_AUTH_CLIENT_SECRET
    ? genericOAuth({
        config: [
          {
            providerId: "neon",
            clientId: process.env.NEON_AUTH_CLIENT_ID,
            clientSecret: process.env.NEON_AUTH_CLIENT_SECRET,
            discoveryUrl: neonAuthBase,
            issuer: neonAuthBase,
            pkce: true,
            scopes: ["openid", "profile", "email"],
          },
        ],
      })
    : null;

// agentAuth capabilities — agents are "pokemon", hosts/trainers are human users
const terminalAgentAuth = agentAuth({
  providerName: "Cheshire Terminal",
  providerDescription:
    "AI agent capabilities for the Cheshire Terminal — your pokemon squad ready to trade, launch, and explore on-chain.",
  modes: ["delegated", "autonomous"],
  capabilities: [
    // Mirror ClawdBrowser agent capabilities — agents call their registered location URL directly.
    // The `location` field makes agents bypass onExecute and call the route with a signed JWT instead.
    {
      name: "attest_agent",
      description: "Attest an on-chain agent identity via the Metaplex Agent Registry.",
      location: `${canonicalAuthBaseURL}/api/agents/attest`,
      input: {
        type: "object",
        properties: {
          agentAddress: { type: "string", description: "On-chain agent asset address" },
          metadataUri: { type: "string", description: "Metadata URI for the agent" },
        },
        required: ["agentAddress"],
      },
    },
    {
      name: "get_peer_card",
      description: "Fetch the peer card (profile + capabilities) for a registered agent.",
      location: `${canonicalAuthBaseURL}/api/agents/peer-card`,
      input: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID to look up" },
        },
        required: ["agentId"],
      },
    },
    {
      name: "list_agents",
      description: "List agents registered in the Cheshire Terminal catalog.",
      location: `${canonicalAuthBaseURL}/api/agents/catalog`,
    },
    {
      name: "agent_chat",
      description: "Send a message to the AI terminal and receive a model response.",
      location: `${canonicalAuthBaseURL}/api/agents/chat`,
      input: {
        type: "object",
        properties: {
          message: { type: "string" },
          model: { type: "string", description: "AI model (optional)" },
        },
        required: ["message"],
      },
    },
    // Additional Cheshire Terminal-specific capabilities
    {
      name: "trade",
      description: "Execute a token swap via Jupiter on Solana.",
      location: `${canonicalAuthBaseURL}/api/agents/trade`,
      input: {
        type: "object",
        properties: {
          inputMint: { type: "string" },
          outputMint: { type: "string" },
          amount: { type: "number" },
          slippageBps: { type: "number" },
        },
        required: ["inputMint", "outputMint", "amount"],
      },
    },
    {
      name: "launch_token",
      description: "Launch a new token on pump.fun.",
      location: `${canonicalAuthBaseURL}/api/agents/launch-token`,
      input: {
        type: "object",
        properties: {
          name: { type: "string" },
          symbol: { type: "string" },
          description: { type: "string" },
          initialBuySol: { type: "number" },
        },
        required: ["name", "symbol"],
      },
    },
    {
      name: "subscribe_clawd",
      description: "Manage 69,420 CLAWD/month recurring subscriptions.",
      location: `${canonicalAuthBaseURL}/api/agents/subscribe-clawd`,
      input: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["subscribe", "cancel", "status", "list"] },
          recipientWallet: { type: "string" },
        },
        required: ["action"],
      },
    },
  ],
  async onExecute({ capability }) {
    // All capabilities have a registered location URL; this handler is a safety fallback only.
    throw new Error(`Capability '${capability}' must be invoked at its registered location endpoint.`);
  },
});

export const auth = betterAuth({
  ...(hasDatabase
    ? {
        database: drizzleAdapter(db, {
          provider: "pg",
          schema: {
            user: betterAuthUser,
            session: betterAuthSession,
            account: betterAuthAccount,
            verification: betterAuthVerification,
            organization: betterAuthOrganization,
            member: betterAuthMember,
            invitation: betterAuthInvitation,
            team: baTeam,
            teamMember: baTeamMember,
            agentHost: baAgentHost,
            agent: baAgent,
            agentCapabilityGrant: baAgentCapabilityGrant,
            approvalRequest: baApprovalRequest,
          },
        }),
      }
    : {}),
  baseURL: canonicalAuthBaseURL,
  basePath: "/api/auth",
  appName: "Cheshire Terminal",
  secret: process.env.BETTER_AUTH_SECRET ?? "",
  emailAndPassword: { enabled: platformPasswordRegistrationEnabled },
  socialProviders: socialLoginEnabled
    ? {
        ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
          ? {
              discord: {
                clientId: process.env.DISCORD_CLIENT_ID,
                clientSecret: process.env.DISCORD_CLIENT_SECRET,
                prompt: "none",
              },
            }
          : {}),
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
          ? {
              github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                redirectURI: `${canonicalAuthBaseURL}/api/auth/callback/github`,
              },
            }
          : {}),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ? {
              google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                redirectURI: `${canonicalAuthBaseURL}/api/auth/callback/google`,
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
    storeAccountCookie: true,
    storeStateStrategy: "cookie",
    accountLinking: {
      enabled: socialLoginEnabled,
      trustedProviders: trustedSocialProviders,
      allowDifferentEmails: true,
      updateUserInfoOnLink: true,
    },
  },
  session: {
    storeSessionInDatabase: hasDatabase,
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
  experimental: {
    joins: true,
  },
  trustedOrigins,
  plugins: [
    organization({
      teams: { enabled: true },
      async sendInvitationEmail(data) {
        // Send via Resend when RESEND_API_KEY is set; otherwise log for local dev
        const inviteLink = `${canonicalAuthBaseURL}/accept-invitation/${data.id}`;
        if (process.env.RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "Cheshire Terminal <noreply@cheshireterminal.ai>",
              to: data.email,
              subject: `You've been invited to ${data.organization.name}`,
              html: `<p>${data.inviter.user.name} invited you to join <strong>${data.organization.name}</strong> on Cheshire Terminal.</p><p><a href="${inviteLink}">Accept invitation</a></p>`,
            }),
          });
        } else {
          console.log(`[org-invite] ${data.email} → ${inviteLink}`);
        }
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org, user }) => {
          console.log(`[org] created: ${org.slug} by ${user.id}`);
        },
        afterAddMember: async ({ member, organization: org }) => {
          console.log(`[org] member ${member.userId} added to ${org.slug} as ${member.role}`);
        },
        beforeRemoveMember: async ({ member, organization: org }) => {
          console.log(`[org] removing ${member.userId} from ${org.slug}`);
        },
      },
    }),
    terminalAgentAuth,
    ...(telegramOAuthPlugin ? [telegramOAuthPlugin] : []),
    ...(neonOAuthPlugin ? [neonOAuthPlugin] : []),
    lastLoginMethod(),
    openAPI(),
  ],
});
