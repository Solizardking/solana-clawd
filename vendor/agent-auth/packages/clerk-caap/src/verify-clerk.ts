// Verify a Clerk session JWT and extract the embedded Solana wallet claim.
// Clerk embeds custom claims via JWT templates — the relay expects a template
// named "solana_wallet" with { wallet_address, agent_id } claims.

import { createRemoteJWKSet, jwtVerify } from "jose";

const CLERK_JWKS_CACHE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getClerkJwks(clerkFrontendApi: string) {
  const key = clerkFrontendApi;
  if (!CLERK_JWKS_CACHE.has(key)) {
    const url = new URL(`${clerkFrontendApi}/.well-known/jwks.json`);
    CLERK_JWKS_CACHE.set(key, createRemoteJWKSet(url));
  }
  return CLERK_JWKS_CACHE.get(key)!;
}

export interface ClerkCaapClaims {
  /** Clerk user ID */
  sub: string;
  /** Solana wallet address from JWT template claim */
  wallet_address?: string;
  /** Optional agent ID claim */
  agent_id?: string;
  /** Clerk session ID */
  sid?: string;
  /** Token issue time */
  iat: number;
  /** Token expiry */
  exp: number;
}

export async function verifyClerkToken(
  token: string,
  opts: {
    clerkFrontendApi?: string;
    clerkJwtKey?: string;
  } = {},
): Promise<ClerkCaapClaims> {
  const frontendApi =
    opts.clerkFrontendApi ??
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_API ??
    "https://relaxing-collie-65.clerk.accounts.dev";

  // Support both JWKS (remote) and inline PEM key (for edge/TEE environments)
  const pemKey = opts.clerkJwtKey ?? process.env.CLERK_JWT_KEY;

  if (pemKey) {
    const key = await importClerkPublicKey(pemKey);
    const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"] });
    return payload as unknown as ClerkCaapClaims;
  }

  const jwks = getClerkJwks(frontendApi);
  const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"] });
  return payload as unknown as ClerkCaapClaims;
}

async function importClerkPublicKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

/** Build the Clerk sign-in URL for the relay's Clerk instance */
export function clerkSignInUrl(returnBackUrl?: string) {
  const base = "https://relaxing-collie-65.accounts.dev/sign-in";
  if (!returnBackUrl) return base;
  return `${base}?redirect_url=${encodeURIComponent(returnBackUrl)}`;
}
