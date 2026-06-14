import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { mutationWithAuth, queryWithAuth } from "./lib/functions";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_TIMELINE_DAYS = 90;
const MAX_TIMELINE_DEFAULT_DAYS = 14;
const MAX_RECENT_EVENTS = 25;

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function incrementRecord(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
  return record;
}

const usageEventArgs = {
  walletAddress: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  eventType: v.string(),
  productArea: v.string(),
  model: v.optional(v.string()),
  route: v.optional(v.string()),
  deploymentId: v.optional(v.string()),
  agentId: v.optional(v.string()),
  tokenMint: v.optional(v.string()),
  units: v.optional(v.number()),
  promptTokens: v.optional(v.number()),
  completionTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  costEstimate: v.optional(v.number()),
  metadata: v.optional(v.any()),
};

async function getUserByWallet(
  ctx: QueryCtx | MutationCtx,
  walletAddress?: string,
): Promise<Doc<"users"> | null> {
  if (!walletAddress) return null;
  const wallet = walletAddress.trim();
  if (!wallet) return null;

  return (
    (await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", wallet))
      .first()) ??
    (await ctx.db
      .query("users")
      .withIndex("by_primary_wallet", (q) => q.eq("primaryWalletAddress", wallet))
      .first())
  );
}

async function ensureServerUsageUser(
  ctx: MutationCtx,
  args: {
    walletAddress?: string;
    role?: string;
    isTokenGated?: boolean;
    clawdBalance?: number;
  },
): Promise<Doc<"users"> | null> {
  const now = Date.now();
  const walletAddress = args.walletAddress?.trim();
  if (!walletAddress) return null;

  const existing = await getUserByWallet(ctx, walletAddress);
  if (existing) {
    await ctx.db.patch(existing._id, {
      walletAddress: existing.walletAddress ?? walletAddress,
      primaryWalletAddress: existing.primaryWalletAddress ?? walletAddress,
      role: args.role ?? existing.role,
      isTokenGated: args.isTokenGated ?? existing.isTokenGated,
      clawdBalance: args.clawdBalance ?? existing.clawdBalance,
      lastSignedIn: existing.lastSignedIn ?? now,
      updatedAt: now,
    });
    return (await ctx.db.get(existing._id)) ?? existing;
  }

  const userId: Id<"users"> = await ctx.db.insert("users", {
    walletAddress,
    primaryWalletAddress: walletAddress,
    openId: walletAddress,
    loginMethod: "server-wallet",
    role: args.role ?? "user",
    clawdBalance: args.clawdBalance ?? 0,
    isTokenGated: args.isTokenGated ?? false,
    onboardingCompleted: false,
    lastSignedIn: now,
    updatedAt: now,
  });

  return await ctx.db.get(userId);
}

async function getOrCreateUsageProfile(
  ctx: MutationCtx,
  viewer: Doc<"users">,
  walletAddress?: string,
): Promise<Doc<"userProfiles"> | null> {
  const existing = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", viewer._id))
    .first();
  if (existing) return existing;

  const now = Date.now();
  const primaryWalletAddress = viewer.primaryWalletAddress ?? viewer.walletAddress ?? walletAddress;
  const profileId: Id<"userProfiles"> = await ctx.db.insert("userProfiles", {
    userId: viewer._id,
    openId: viewer.openId,
    primaryWalletAddress,
    displayName: viewer.name ?? (primaryWalletAddress ? `${primaryWalletAddress.slice(0, 4)}...${primaryWalletAddress.slice(-4)}` : undefined),
    email: viewer.email,
    avatarUrl: viewer.avatarUrl,
    githubUsername: viewer.githubUsername,
    twitterUsername: viewer.twitterUsername,
    telegramUsername: viewer.telegramUsername,
    telegramUserId: viewer.telegramUserId,
    agentName: viewer.agentName,
    primaryLoginMethod: viewer.loginMethod ?? "server-wallet",
    role: viewer.role,
    isTokenGated: viewer.isTokenGated,
    onboardingCompleted: viewer.onboardingCompleted ?? false,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });

  return await ctx.db.get(profileId);
}

async function writeUsageEvent(
  ctx: MutationCtx,
  viewer: Doc<"users">,
  args: Record<string, any>,
) {
  const now = Date.now();
  const resolvedTotalTokens =
    args.totalTokens ?? (args.promptTokens ?? 0) + (args.completionTokens ?? 0);
  const profile = await getOrCreateUsageProfile(ctx, viewer, args.walletAddress);

  const eventId: Id<"usageEvents"> = await ctx.db.insert("usageEvents", {
    userId: viewer._id,
    profileId: profile?._id,
    walletAddress: args.walletAddress ?? viewer.primaryWalletAddress ?? viewer.walletAddress,
    sessionId: args.sessionId,
    eventType: args.eventType,
    productArea: args.productArea,
    model: args.model,
    route: args.route,
    deploymentId: args.deploymentId,
    agentId: args.agentId,
    tokenMint: args.tokenMint,
    units: args.units,
    promptTokens: args.promptTokens,
    completionTokens: args.completionTokens,
    totalTokens: resolvedTotalTokens || undefined,
    costEstimate: args.costEstimate,
    metadata: args.metadata,
    createdAt: now,
  });

  const day = dayKey(now);
  const existingDaily = await ctx.db
    .query("usageDaily")
    .withIndex("by_user_and_day", (q) => q.eq("userId", viewer._id).eq("day", day))
    .first();

  const productBreakdown = { ...(existingDaily?.productBreakdown ?? {}) } as Record<string, number>;
  const eventBreakdown = { ...(existingDaily?.eventBreakdown ?? {}) } as Record<string, number>;
  const modelBreakdown = { ...(existingDaily?.modelBreakdown ?? {}) } as Record<string, number>;

  incrementRecord(productBreakdown, args.productArea, 1);
  incrementRecord(eventBreakdown, args.eventType, 1);
  if (args.model) incrementRecord(modelBreakdown, args.model, 1);

  const nextValues = {
    totalEvents: (existingDaily?.totalEvents ?? 0) + 1,
    totalPromptTokens: (existingDaily?.totalPromptTokens ?? 0) + (args.promptTokens ?? 0),
    totalCompletionTokens: (existingDaily?.totalCompletionTokens ?? 0) + (args.completionTokens ?? 0),
    totalTokens: (existingDaily?.totalTokens ?? 0) + resolvedTotalTokens,
    totalCostEstimate: (existingDaily?.totalCostEstimate ?? 0) + (args.costEstimate ?? 0),
    messagesCount:
      (existingDaily?.messagesCount ?? 0) +
      (args.eventType === "message" || args.eventType === "chat_message" ? 1 : 0),
    chatsCount:
      (existingDaily?.chatsCount ?? 0) +
      (args.eventType === "chat_session" || args.productArea === "chat" ? 1 : 0),
    agentDeploymentsCount:
      (existingDaily?.agentDeploymentsCount ?? 0) +
      (args.eventType === "agent_deployment" ? 1 : 0),
    tokenDeploymentsCount:
      (existingDaily?.tokenDeploymentsCount ?? 0) +
      (args.eventType === "token_deployment" ? 1 : 0),
    modelCallsCount:
      (existingDaily?.modelCallsCount ?? 0) +
      (args.model || args.productArea === "ai" ? 1 : 0),
    imageGenerationsCount:
      (existingDaily?.imageGenerationsCount ?? 0) +
      (args.eventType === "image_generation" ? 1 : 0),
    updatedAt: now,
    productBreakdown,
    eventBreakdown,
    modelBreakdown,
  };

  if (existingDaily) {
    await ctx.db.patch(existingDaily._id, nextValues);
  } else {
    await ctx.db.insert("usageDaily", {
      userId: viewer._id,
      day,
      ...nextValues,
    });
  }

  await ctx.db.patch(viewer._id, { updatedAt: now });
  if (profile?._id) await ctx.db.patch(profile._id, { updatedAt: now, lastSeenAt: now });

  return {
    eventId,
    trackedAt: now,
    day,
  };
}

export const trackEvent = mutationWithAuth({
  args: {
    userId: v.optional(v.id("users")),
    ...usageEventArgs,
  },
  handler: async (ctx, args) => {
    const viewer = ctx.viewer || (args.userId ? await ctx.db.get(args.userId) : null);
    if (!viewer) throw new Error("Known user required for usage tracking");

    return writeUsageEvent(ctx, viewer, args);
  },
});

export const trackServerEvent = mutation({
  args: {
    ingestSecret: v.optional(v.string()),
    role: v.optional(v.string()),
    isTokenGated: v.optional(v.boolean()),
    clawdBalance: v.optional(v.number()),
    ...usageEventArgs,
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONVEX_INGEST_SECRET;
    if (expectedSecret && args.ingestSecret !== expectedSecret) {
      throw new Error("Unauthorized usage ingestion");
    }

    const viewer = await ensureServerUsageUser(ctx, args);
    if (!viewer) throw new Error("walletAddress required for server usage tracking");

    return writeUsageEvent(ctx, viewer, args);
  },
});

export const getRealtimeSummary = queryWithAuth({
  args: {},
  handler: async (ctx) => {
    const viewer = ctx.viewer;
    if (!viewer) return null;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", viewer._id))
      .first();

    const today = dayKey(Date.now());
    const daily = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_and_day", (q) => q.eq("userId", viewer._id).eq("day", today))
      .first();

    // Bounded — most recent 25 events; the index already orders by userId+createdAt.
    const recentEvents = await ctx.db
      .query("usageEvents")
      .withIndex("by_user_and_createdAt", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(MAX_RECENT_EVENTS);

    return {
      user: viewer,
      profile,
      today,
      daily,
      recentEvents,
    };
  },
});

export const getUsageTimeline = queryWithAuth({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = ctx.viewer;
    if (!viewer) return [];

    const limit = Math.max(1, Math.min(args.days ?? MAX_TIMELINE_DEFAULT_DAYS, MAX_TIMELINE_DAYS));

    // Use the composite index so we get the user's daily rows in newest-first order
    // and apply a bounded take() instead of collecting and slicing.
    return await ctx.db
      .query("usageDaily")
      .withIndex("by_user_and_day", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(limit);
  },
});

export const getRealtimeSummaryByWallet = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, { walletAddress }) => {
    const viewer = await getUserByWallet(ctx, walletAddress);
    const today = dayKey(Date.now());
    if (!viewer) {
      return {
        user: null,
        profile: null,
        today,
        daily: null,
        recentEvents: [],
      };
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", viewer._id))
      .first();

    const daily = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_and_day", (q) => q.eq("userId", viewer._id).eq("day", today))
      .first();

    const recentEvents = await ctx.db
      .query("usageEvents")
      .withIndex("by_user_and_createdAt", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(MAX_RECENT_EVENTS);

    return {
      user: viewer,
      profile,
      today,
      daily,
      recentEvents,
    };
  },
});

export const getUsageTimelineByWallet = query({
  args: {
    walletAddress: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { walletAddress, days }) => {
    const viewer = await getUserByWallet(ctx, walletAddress);
    if (!viewer) return [];

    const limit = Math.max(1, Math.min(days ?? MAX_TIMELINE_DEFAULT_DAYS, MAX_TIMELINE_DAYS));

    return await ctx.db
      .query("usageDaily")
      .withIndex("by_user_and_day", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(limit);
  },
});

// Re-export the bound helpers used by the convex-helpers custom functions so
// downstream modules (cron jobs, HTTP handlers) can compose them directly.
export { internalMutation, internalQuery };
