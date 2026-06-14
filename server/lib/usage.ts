import type { Request } from "express";
import { api, convex } from "./convex";

type UsageEventInput = {
  walletAddress?: string | null;
  sessionId?: string;
  eventType: string;
  productArea: string;
  model?: string;
  route?: string;
  deploymentId?: string;
  agentId?: string;
  tokenMint?: string;
  units?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costEstimate?: number;
  metadata?: Record<string, unknown>;
};

function requestWallet(req: Request, fallback?: string | null) {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const query = req.query && typeof req.query === "object" ? (req.query as Record<string, unknown>) : {};
  const value =
    fallback ??
    req.session.walletAddress ??
    body.walletAddress ??
    body.wallet ??
    body.ownerWallet ??
    body.userWallet ??
    query.wallet ??
    query.walletAddress ??
    query.ownerWallet;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function estimateTokensFromText(...parts: Array<string | null | undefined>) {
  const chars = parts.reduce((total, part) => total + (part?.length ?? 0), 0);
  return chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

export function trackUsageFromRequest(req: Request, input: UsageEventInput) {
  const walletAddress = requestWallet(req, input.walletAddress);
  if (!walletAddress) return;

  const route = input.route ?? req.originalUrl?.split("?")[0] ?? req.path;
  const metadata = {
    method: req.method,
    path: route,
    userAgent: req.headers["user-agent"],
    ...input.metadata,
  };

  void convex
    .mutation(api.usage.trackServerEvent, {
      ingestSecret: process.env.CONVEX_INGEST_SECRET || undefined,
      walletAddress,
      role: req.session.userRole,
      isTokenGated: req.session.userRole === "admin" ? true : undefined,
      sessionId: input.sessionId ?? req.sessionID,
      eventType: input.eventType,
      productArea: input.productArea,
      model: input.model,
      route,
      deploymentId: input.deploymentId,
      agentId: input.agentId,
      tokenMint: input.tokenMint,
      units: input.units,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      costEstimate: input.costEstimate,
      metadata,
    })
    .catch((error) => {
      console.warn("[usage] Convex tracking failed:", error?.message ?? error);
    });
}

export function trackUsageForWallet(walletAddress: string | undefined | null, input: UsageEventInput) {
  if (!walletAddress) return;

  void convex
    .mutation(api.usage.trackServerEvent, {
      ingestSecret: process.env.CONVEX_INGEST_SECRET || undefined,
      walletAddress,
      sessionId: input.sessionId,
      eventType: input.eventType,
      productArea: input.productArea,
      model: input.model,
      route: input.route,
      deploymentId: input.deploymentId,
      agentId: input.agentId,
      tokenMint: input.tokenMint,
      units: input.units,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      costEstimate: input.costEstimate,
      metadata: input.metadata,
    })
    .catch((error) => {
      console.warn("[usage] Convex tracking failed:", error?.message ?? error);
    });
}
