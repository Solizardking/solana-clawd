import { Redis } from "@upstash/redis";
import { RedisStore } from "connect-redis";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import { authSessions } from "../../drizzle/schema";
import { db, hasDatabase } from "../db";
import { requireHolderOrAdminSession } from "../lib/access-control";

declare module "express-session" {
  interface Session {
    isAuthenticated?: boolean;
    walletAddress?: string;
    userId?: number;
    userRole?: string;
    xOAuth?: {
      codeVerifier: string;
      state: string;
      walletAddress: string;
    };
    discordUser?: {
      id: string;
      username: string;
      tag: string;
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      convexAuth?: {
        authenticated: boolean;
        userId?: number | null;
        walletAddress: string;
        role: string;
        clawdBalance: number;
        isTokenGated?: boolean;
      } | null;
      convexAuthResolved?: boolean;
    }
  }
}

// NormalizedRedisClient is the exact interface connect-redis v8 expects internally.
interface NormalizedRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<string | null>;
  expire(key: string, ttl: number): Promise<number | boolean>;
  scanIterator(match: string, count: number): AsyncIterable<string>;
  del(key: string[]): Promise<number>;
  mget(key: string[]): Promise<(string | null)[]>;
}

const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
}

const hasRedisSessionConfig = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const upstash = hasRedisSessionConfig
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
      token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
    })
  : null;

// Shim @upstash/redis (REST) into connect-redis's NormalizedRedisClient shape.
// NOTE: @upstash/redis auto-parses stored JSON back into objects on retrieval.
// connect-redis expects raw JSON strings from get/mget, so we re-serialize when needed.
const toJsonString = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
};

const redisShim: NormalizedRedisClient = {
  get: async (key) => {
    const raw = await upstash!.get(key);
    const str = toJsonString(raw);
    if (str === null) return null;
    // Validate it's parseable JSON — if not, delete the corrupted key
    try {
      JSON.parse(str);
      return str;
    } catch {
      await upstash!.del(key).catch(() => {});
      return null;
    }
  },
  set: async (key, value, ttl) =>
    ttl ? upstash!.set(key, value, { ex: ttl }) : upstash!.set(key, value),
  expire: (key, ttl) => upstash!.expire(key, ttl),
  del: (keys) => upstash!.del(...keys),
  mget: async (keys) => {
    const vals = await upstash!.mget(...keys);
    return vals.map(toJsonString);
  },
  scanIterator: async function* (match, count) {
    let cursor = 0;
    do {
      const [next, keys] = await upstash!.scan(cursor, { match, count });
      cursor = Number(next);
      for (const key of keys) yield key;
    } while (cursor !== 0);
  },
};

const store = hasRedisSessionConfig ? new RedisStore({ client: redisShim }) : undefined;
const CONVEX_AUTH_CACHE_TTL_MS = 5_000;
const convexAuthCache = new Map<string, {
  expiresAt: number;
  auth: NonNullable<Express.Request["convexAuth"]> | null;
}>();

function getConvexSiteBaseUrl() {
  const candidates = [
    process.env.CONVEX_SITE_URL,
    process.env.VITE_CONVEX_SITE_URL,
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    process.env.CONVEX_URL,
    process.env.VITE_CONVEX_URL,
    process.env.NEXT_PUBLIC_CONVEX_URL,
  ];

  for (const value of candidates) {
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
}

function getCookieValue(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key !== cookieName) continue;
    return decodeURIComponent(valueParts.join("=") || "");
  }
  return null;
}

function getConvexSessionToken(req: Request) {
  const cookieHeader = req.headers.cookie;
  return (
    getCookieValue(cookieHeader, "__Host-cheshire.sid") ||
    getCookieValue(cookieHeader, "cheshire.sid")
  );
}

async function resolveConvexAuth(req: Request) {
  if (req.convexAuthResolved) {
    return req.convexAuth ?? null;
  }
  req.convexAuthResolved = true;

  const convexSiteBaseUrl = getConvexSiteBaseUrl();
  const sessionToken = getConvexSessionToken(req);
  if (!convexSiteBaseUrl || !sessionToken) {
    req.convexAuth = null;
    return null;
  }

  const cached = convexAuthCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) {
    req.convexAuth = cached.auth;
    return cached.auth;
  }

  try {
    const response = await fetch(`${convexSiteBaseUrl}/api/auth/me`, {
      headers: {
        Accept: "application/json",
        Cookie: req.headers.cookie ?? "",
        "x-forwarded-proto": req.secure ? "https" : req.protocol,
        "x-cheshire-forwarded-proto": req.secure ? "https" : req.protocol,
      },
    });
    const data = await response.json() as any;
    const auth =
      response.ok && data?.authenticated && typeof data?.walletAddress === "string"
        ? {
            authenticated: true,
            userId: typeof data.userId === "number" ? data.userId : null,
            walletAddress: data.walletAddress,
            role: typeof data.role === "string" ? data.role : "user",
            clawdBalance: Number(data.clawdBalance ?? 0),
            isTokenGated: Boolean(data.isTokenGated),
          }
        : null;

    convexAuthCache.set(sessionToken, {
      expiresAt: Date.now() + CONVEX_AUTH_CACHE_TTL_MS,
      auth,
    });
    req.convexAuth = auth;
    return auth;
  } catch (error) {
    console.warn("[session] Convex auth lookup failed:", error);
    req.convexAuth = null;
    return null;
  }
}

export const sessionMiddleware = session({
  name: process.env.NODE_ENV === "production" ? "__Host-cheshire.sid" : "cheshire.sid",
  secret: sessionSecret || "dev-secret-cheshire-clawd-2025",
  resave: false,
  saveUninitialized: false,
  store,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.isAuthenticated || !req.session.walletAddress) {
    const convexAuth = await resolveConvexAuth(req);
    if (!convexAuth?.authenticated || !convexAuth.walletAddress) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  }

  if (hasDatabase) {
    try {
      const [authSession] = await db
        .select()
        .from(authSessions)
        .where(eq(authSessions.sessionToken, req.sessionID))
        .limit(1);
      if (authSession?.revokedAt || (authSession && authSession.expiresAt.getTime() <= Date.now())) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session expired" });
      }
    } catch (error) {
      console.warn("[session] database session validation skipped:", error);
    }
  }

  return next();
};

export const isAuthorizedAppUser = async (req: Request, res: Response, next: NextFunction) => {
  return isAuthenticated(req, res, () => requireHolderOrAdminSession(req, res, next));
};

export const isAdmin = (req: Request) => {
  return (
    (req.session.isAuthenticated === true && req.session.userRole === "admin") ||
    req.convexAuth?.role === "admin"
  );
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (isAdmin(req)) return next();
  return res.status(403).json({ error: "Admin only" });
};

export const optionalAuth = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};
