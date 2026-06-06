// @clawd/clerk-caap — Clerk + CAAP/1.0 Solana attestation bridge
// Pairs Clerk session auth (relaxing-collie-65.accounts.dev) with
// SIWS onchain verification and Phala dstack TEE attestation.

export { verifyClerkToken, extractBearerToken, clerkSignInUrl } from "./verify-clerk";
export type { ClerkCaapClaims } from "./verify-clerk";

export { createClerkCaapMiddleware } from "./middleware";
export type { ClerkCaapMiddlewareOptions } from "./middleware";

export { fetchPhalaAttestation, deriveRelayKey } from "./tee-attest";
export type { PhalaAttestationResult } from "./tee-attest";

export const CLERK_FRONTEND_API = "https://relaxing-collie-65.clerk.accounts.dev";
export const CLERK_SIGN_IN_URL = "https://relaxing-collie-65.accounts.dev/sign-in";
export const CLERK_SIGN_UP_URL = "https://relaxing-collie-65.accounts.dev/sign-up";
export const CLERK_WAITLIST_URL = "https://relaxing-collie-65.accounts.dev/waitlist";
export const CLERK_UNAUTHORIZED_URL = "https://relaxing-collie-65.accounts.dev/unauthorized-sign-in";
