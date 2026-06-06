// Next.js middleware for Clerk + CAAP — gates routes behind Clerk auth and
// attaches the CAAP tier header so downstream routes can gate on it.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractBearerToken, verifyClerkToken } from "./verify-clerk";

const CAAP_TIER_HEADER = "x-caap-tier";
const CAAP_WALLET_HEADER = "x-caap-wallet";
const CAAP_AGENT_HEADER = "x-caap-agent-id";
const CAAP_VERIFIED_HEADER = "x-caap-verified";

export interface ClerkCaapMiddlewareOptions {
  /** Paths that require a verified Clerk session */
  protectedPaths?: RegExp[];
  /** Paths that are always public */
  publicPaths?: RegExp[];
  clerkFrontendApi?: string;
}

const DEFAULT_PROTECTED: RegExp[] = [/^\/api\/(?!.well-known)/];
const DEFAULT_PUBLIC: RegExp[] = [
  /^\/$/, // homepage
  /^\/sign-in/,
  /^\/sign-up/,
  /^\/waitlist/,
  /^\/.well-known/,
  /^\/api\/caap\/discovery/,
];

export function createClerkCaapMiddleware(opts: ClerkCaapMiddlewareOptions = {}) {
  const protected_ = opts.protectedPaths ?? DEFAULT_PROTECTED;
  const public_ = opts.publicPaths ?? DEFAULT_PUBLIC;

  return async function clerkCaapMiddleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    const isPublic = public_.some((re) => re.test(pathname));
    if (isPublic) return addCors(NextResponse.next());

    const isProtected = protected_.some((re) => re.test(pathname));
    if (!isProtected) return addCors(NextResponse.next());

    // Try Authorization: Bearer <clerk_session_token>
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) {
      return unauthorizedResponse("Missing Clerk session token");
    }

    try {
      const claims = await verifyClerkToken(token, {
        clerkFrontendApi: opts.clerkFrontendApi,
      });

      const res = NextResponse.next();
      res.headers.set(CAAP_WALLET_HEADER, claims.wallet_address ?? "");
      res.headers.set(CAAP_AGENT_HEADER, claims.agent_id ?? claims.sub);
      // verified flag is set by the /api/caap/attest route after onchain check
      res.headers.set(CAAP_VERIFIED_HEADER, "pending");
      return addCors(res);
    } catch {
      return unauthorizedResponse("Invalid or expired Clerk token");
    }
  };
}

function addCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-CAAP-Wallet, X-CAAP-Agent-ID",
  );
  return res;
}

function unauthorizedResponse(message: string) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
