import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// Convex statically validates auth provider env usage at deploy time.
// Pin the production Clerk issuer here so backend deploys do not depend on a
// separate CLERK_FRONTEND_API_URL env var being present in Convex.
const CLERK_FRONTEND_API_URL = "https://clerk.cheshireterminal.ai";

export default {
  providers: [
    getAuthConfigProvider(),
    {
      domain: CLERK_FRONTEND_API_URL,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
