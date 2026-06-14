import { createAuthClient } from "better-auth/client";
import { anonymousClient, lastLoginMethodClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { agentAuthClient } from "@better-auth/agent-auth/client";

const normalizeAuthBaseURL = (url: string) =>
  url.trim().replace(/\/api\/auth\/?$/, "").replace(/\/$/, "");

const browserOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
const configuredAuthBaseURL =
  browserOrigin ||
  (typeof import.meta !== "undefined" &&
    ((import.meta as { env?: { VITE_BETTER_AUTH_URL?: string; VITE_APP_URL?: string } }).env?.VITE_BETTER_AUTH_URL ||
      (import.meta as { env?: { VITE_APP_URL?: string } }).env?.VITE_APP_URL)) ||
  "https://www.cheshireterminal.ai";

const authBaseURL = normalizeAuthBaseURL(configuredAuthBaseURL);

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  basePath: "/api/auth",
  plugins: [
    twoFactorClient(),
    anonymousClient(),
    lastLoginMethodClient(),
    organizationClient(),
    agentAuthClient(),
  ],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
