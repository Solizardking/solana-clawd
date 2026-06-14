import crypto from "crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { apiKeyAuditLog, apiKeys, users } from "../../drizzle/schema";
import { db, hasDatabase } from "../db";

export type ApiPrincipal =
  | {
      type: "wallet-session";
      userId: number | null;
      walletAddress: string;
      role: string;
      scopes: string[];
    }
  | {
      type: "clerk-user";
      userId: number;
      clerkUserId: string;
      email: string | null;
      role: string;
      scopes: string[];
    }
  | {
      type: "api-key";
      userId: number;
      apiKeyId: number;
      keyPrefix: string;
      agentWalletId: number | null;
      scopes: string[];
    };

declare global {
  namespace Express {
    interface Request {
      apiPrincipal?: ApiPrincipal | null;
    }
  }
}

const API_KEY_PREFIX = "ct_sk";
const CLERK_FALLBACK_ISSUER = "https://clerk.cheshireterminal.ai";
const clerkIssuer =
  process.env.CLERK_JWT_ISSUER ||
  process.env.CLERK_ISSUER_URL ||
  process.env.CLERK_ISSUER ||
  process.env.CLERK_FRONTEND_API ||
  process.env.CLERK_FRONTEND_API_URL ||
  process.env.CLERK_ACCOUNT_PORTAL_URL ||
  CLERK_FALLBACK_ISSUER;
const clerkAudience = process.env.CLERK_JWT_AUDIENCE || process.env.CLERK_AUDIENCE || undefined;
const clerkJwksUrl =
  process.env.CLERK_JWKS_URL ||
  `${clerkIssuer.replace(/\/$/, "")}/.well-known/jwks.json`;
const clerkJwks = createRemoteJWKSet(new URL(clerkJwksUrl));

export function getClerkBearerConfig() {
  return {
    configured: Boolean(
      process.env.CLERK_JWT_ISSUER ||
        process.env.CLERK_ISSUER_URL ||
        process.env.CLERK_ISSUER ||
        process.env.CLERK_FRONTEND_API ||
        process.env.CLERK_FRONTEND_API_URL ||
        process.env.CLERK_ACCOUNT_PORTAL_URL ||
        process.env.CLERK_JWKS_URL,
    ),
    issuer: clerkIssuer,
    audience: clerkAudience ?? null,
    jwksUrl: clerkJwksUrl,
  };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getBearerToken(req: Request) {
  const value = req.header("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getPresentedApiKey(req: Request) {
  const headerKey = req.header("x-api-key")?.trim();
  if (headerKey) return headerKey;
  const bearer = getBearerToken(req);
  if (bearer?.startsWith(`${API_KEY_PREFIX}_`)) return bearer;
  return null;
}

function normalizeScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((scope): scope is string => typeof scope === "string" && scope.length > 0);
}

function getClientIp(req: Request) {
  for (const header of ["cf-connecting-ip", "x-vercel-forwarded-for", "fly-client-ip", "x-real-ip", "x-forwarded-for"]) {
    const value = req.headers[header]?.toString().split(",")[0]?.trim();
    if (value) return value;
  }
  return req.socket.remoteAddress ?? null;
}

async function auditApiKey(req: Request, principal: Extract<ApiPrincipal, { type: "api-key" }>, event: "used" | "failed") {
  if (!hasDatabase) return;
  try {
    await db.insert(apiKeyAuditLog).values({
      apiKeyId: principal.apiKeyId,
      userId: principal.userId,
      event,
      route: `${req.method} ${req.path}`,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent") ?? null,
    });
  } catch (error) {
    console.warn("[api-auth] failed to audit API key:", error);
  }
}

export function createApiKeySecret() {
  const random = crypto.randomBytes(32).toString("base64url");
  return `${API_KEY_PREFIX}_${random}`;
}

export function getApiKeyPrefix(secret: string) {
  return secret.slice(0, 16);
}

export function hashApiKey(secret: string) {
  return sha256(secret);
}

export async function resolveApiKeyPrincipal(req: Request): Promise<ApiPrincipal | null> {
  const secret = getPresentedApiKey(req);
  if (!secret || !hasDatabase) return null;

  const [record] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, hashApiKey(secret)),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
      ),
    )
    .limit(1);

  if (!record) return null;

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, record.id));

  const principal: ApiPrincipal = {
    type: "api-key",
    userId: record.userId,
    apiKeyId: record.id,
    keyPrefix: record.keyPrefix,
    agentWalletId: record.agentWalletId ?? null,
    scopes: normalizeScopes(record.scopes),
  };
  await auditApiKey(req, principal, "used");
  return principal;
}

async function ensureClerkUser(payload: Record<string, unknown>) {
  if (!hasDatabase) return null;
  const subject = typeof payload.sub === "string" ? payload.sub : "";
  if (!subject) return null;
  const email =
    typeof payload.email === "string"
      ? payload.email
      : Array.isArray(payload.email_addresses) && typeof payload.email_addresses[0] === "object"
        ? String((payload.email_addresses[0] as { email_address?: unknown }).email_address || "")
        : null;
  const name =
    typeof payload.name === "string"
      ? payload.name
      : [payload.given_name, payload.family_name].filter((v) => typeof v === "string").join(" ") || null;

  const [existing] = await db.select().from(users).where(eq(users.openId, subject)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      openId: subject,
      email: email || null,
      name,
      loginMethod: "clerk",
      role: "user",
    })
    .returning();
  return created;
}

export async function resolveClerkPrincipal(req: Request): Promise<ApiPrincipal | null> {
  const token = getBearerToken(req);
  if (!token || token.startsWith(`${API_KEY_PREFIX}_`)) return null;

  try {
    const verifyOptions = clerkAudience ? { issuer: clerkIssuer, audience: clerkAudience } : { issuer: clerkIssuer };
    const { payload } = await jwtVerify(token, clerkJwks, verifyOptions);
    const user = await ensureClerkUser(payload as Record<string, unknown>);
    if (!user) return null;
    return {
      type: "clerk-user",
      userId: user.id,
      clerkUserId: String(payload.sub),
      email: user.email ?? null,
      role: user.role,
      scopes: ["user:*", "api:*"],
    };
  } catch (error) {
    console.warn("[api-auth] Clerk token rejected:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function resolveApiPrincipal(req: Request) {
  if (req.apiPrincipal !== undefined) return req.apiPrincipal;

  const apiKeyPrincipal = await resolveApiKeyPrincipal(req);
  if (apiKeyPrincipal) {
    req.apiPrincipal = apiKeyPrincipal;
    return apiKeyPrincipal;
  }

  const clerkPrincipal = await resolveClerkPrincipal(req);
  if (clerkPrincipal) {
    req.apiPrincipal = clerkPrincipal;
    return clerkPrincipal;
  }

  if (req.session?.isAuthenticated && req.session.walletAddress) {
    req.apiPrincipal = {
      type: "wallet-session",
      userId: typeof req.session.userId === "number" ? req.session.userId : null,
      walletAddress: req.session.walletAddress,
      role: req.session.userRole ?? "user",
      scopes: ["user:*", "api:*"],
    };
    return req.apiPrincipal;
  }

  if (req.convexAuth?.authenticated && req.convexAuth.walletAddress) {
    req.apiPrincipal = {
      type: "wallet-session",
      userId: req.convexAuth.userId ?? null,
      walletAddress: req.convexAuth.walletAddress,
      role: req.convexAuth.role,
      scopes: ["user:*", "api:*"],
    };
    return req.apiPrincipal;
  }

  req.apiPrincipal = null;
  return null;
}

export function hasApiScope(principal: ApiPrincipal | null | undefined, requiredScope: string) {
  if (!principal) return false;
  if (principal.type !== "api-key") return true;
  const scopes = new Set(principal.scopes);
  if (scopes.has("*") || scopes.has("api:*")) return true;
  if (requiredScope && scopes.has(requiredScope)) return true;
  const [namespace] = requiredScope.split(":");
  return Boolean(namespace && scopes.has(`${namespace}:*`));
}

export function apiKeyCanAccessRoute(principal: ApiPrincipal | null | undefined, req: Request) {
  if (!principal) return false;
  if (principal.type !== "api-key") return true;
  if (hasApiScope(principal, "api:*")) return true;
  const routeScope = `route:${req.method.toLowerCase()}:${req.path}`;
  if (hasApiScope(principal, routeScope)) return true;
  const firstApiSegment = req.path.split("/").filter(Boolean)[1];
  return Boolean(firstApiSegment && hasApiScope(principal, `route:${firstApiSegment}:*`));
}

export const requireApiPrincipal = async (req: Request, res: Response, next: NextFunction) => {
  const principal = await resolveApiPrincipal(req);
  if (!principal) return res.status(401).json({ error: "Unauthorized" });
  return next();
};

export const requireApiRouteAccess = async (req: Request, res: Response, next: NextFunction) => {
  const principal = await resolveApiPrincipal(req);
  if (!principal) return res.status(401).json({ error: "Unauthorized" });
  if (!apiKeyCanAccessRoute(principal, req)) {
    return res.status(403).json({ error: "API key scope does not allow this route." });
  }
  return next();
};

export async function listUserApiKeys(userId: number) {
  if (!hasDatabase) return [];
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      agentWalletId: apiKeys.agentWalletId,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date()))))
    .orderBy(sql`${apiKeys.createdAt} desc`);
}
