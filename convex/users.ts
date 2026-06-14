import { v } from "convex/values";
import { query } from "./_generated/server";
import { rateLimit } from "./lib/rateLimiter";
import { getOrThrow } from "./lib/relationships";
import { mutation } from "./lib/triggers";
import { mutationWithAuth, queryWithAuth } from "./lib/functions";
import type { Id } from "./_generated/dataModel";

// ── Public queries ───────────────────────────────────────────────────────────

export const getByWallet = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    return ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    return await getOrThrow(ctx, id);
  },
});

export const getByTelegram = query({
  args: { telegramUserId: v.string() },
  handler: async (ctx, { telegramUserId }) => {
    return ctx.db
      .query("users")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
      .first();
  },
});

// ── Wallet sign-in upsert (public, rate-limited) ──────────────────────────────

export const upsert = mutation({
  args: {
    walletAddress: v.string(),
    loginMethod: v.string(),
    role: v.optional(v.string()),
    isTokenGated: v.optional(v.boolean()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { walletAddress, loginMethod, role: roleOverride, isTokenGated: tokenGatedOverride, name, email }) => {
    await rateLimit(ctx, { name: "walletSignIn", key: walletAddress, throws: true });

    const existing = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, unknown> = { lastSignedIn: now, updatedAt: now };
      if (name) patch.name = name;
      if (email) patch.email = email;
      if (roleOverride) patch.role = roleOverride;
      if (tokenGatedOverride !== undefined) patch.isTokenGated = tokenGatedOverride;
      await ctx.db.patch(existing._id, patch);
      return {
        id: existing._id,
        isNew: false,
        role: (roleOverride ?? existing.role) as string,
        clawdBalance: existing.clawdBalance,
        isTokenGated: tokenGatedOverride ?? existing.isTokenGated,
      };
    }

    const finalRole = roleOverride ?? "user";
    const finalTokenGated = tokenGatedOverride ?? false;
    const id: Id<"users"> = await ctx.db.insert("users", {
      walletAddress,
      openId: walletAddress,
      loginMethod,
      name,
      email,
      role: finalRole,
      clawdBalance: 0,
      isTokenGated: finalTokenGated,
      lastSignedIn: now,
      updatedAt: now,
    });

    return { id, isNew: true, role: finalRole, clawdBalance: 0, isTokenGated: finalTokenGated };
  },
});

export const updateTelegram = mutation({
  args: {
    userId: v.id("users"),
    telegramUserId: v.string(),
    telegramUsername: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, ...fields }) => {
    await ctx.db.patch(userId, { ...fields, updatedAt: Date.now() });
  },
});

export const updateBalance = mutation({
  args: { userId: v.id("users"), clawdBalance: v.number() },
  handler: async (ctx, { userId, clawdBalance }) => {
    await ctx.db.patch(userId, { clawdBalance, updatedAt: Date.now() });
  },
});

export const setTokenGated = mutation({
  args: { userId: v.id("users"), isTokenGated: v.boolean() },
  handler: async (ctx, { userId, isTokenGated }) => {
    await ctx.db.patch(userId, { isTokenGated, updatedAt: Date.now() });
  },
});

// ── Authenticated viewer queries / mutations ─────────────────────────────────

export const getViewerProfile = queryWithAuth({
  args: {},
  handler: async (ctx) => {
    const authUser = ctx.authUser;
    if (!authUser) return null;

    const viewer =
      ctx.viewer ||
      (authUser.email
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", authUser.email!))
            .first()
        : null);

    if (!viewer) {
      return {
        authenticated: true,
        registered: false,
        authUser: {
          id: authUser._id,
          email: authUser.email ?? null,
          name: authUser.name ?? null,
          image: authUser.image ?? null,
        },
      };
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", viewer._id))
      .first();

    return {
      authenticated: true,
      registered: true,
      user: viewer,
      profile,
    };
  },
});

export const upsertViewerProfile = mutationWithAuth({
  args: {
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
    telegramUserId: v.optional(v.string()),
    agentName: v.optional(v.string()),
    primaryWalletAddress: v.optional(v.string()),
    preferences: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const authUser = ctx.authUser;
    if (!authUser) throw new Error("Authentication required");

    let viewer =
      ctx.viewer ||
      (authUser.email
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", authUser.email!))
            .first()
        : null);

    const now = Date.now();

    if (!viewer) {
      const userId: Id<"users"> = await ctx.db.insert("users", {
        openId: authUser._id,
        walletAddress: args.primaryWalletAddress,
        primaryWalletAddress: args.primaryWalletAddress,
        name: args.displayName ?? authUser.name ?? undefined,
        email: authUser.email ?? undefined,
        loginMethod: "better-auth",
        role: "user",
        clawdBalance: 0,
        isTokenGated: false,
        onboardingCompleted: Boolean(args.displayName || args.username || args.agentName),
        lastSignedIn: now,
        updatedAt: now,
      });
      viewer = (await ctx.db.get(userId)) ?? null;
    } else {
      await ctx.db.patch(viewer._id, {
        openId: viewer.openId ?? authUser._id,
        primaryWalletAddress: args.primaryWalletAddress ?? viewer.primaryWalletAddress,
        walletAddress: viewer.walletAddress ?? args.primaryWalletAddress,
        name: args.displayName ?? viewer.name,
        email: viewer.email ?? authUser.email ?? undefined,
        agentName: args.agentName ?? viewer.agentName,
        onboardingCompleted:
          viewer.onboardingCompleted ?? Boolean(args.displayName || args.username || args.agentName),
        updatedAt: now,
      });
      viewer = (await ctx.db.get(viewer._id)) ?? viewer;
    }

    if (!viewer) throw new Error("Failed to provision viewer");

    const existingProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", viewer._id))
      .first();

    const profilePatch = {
      openId: authUser._id,
      primaryWalletAddress: args.primaryWalletAddress ?? viewer.primaryWalletAddress,
      displayName: args.displayName ?? existingProfile?.displayName ?? viewer.name,
      username: args.username ?? existingProfile?.username,
      bio: args.bio ?? existingProfile?.bio,
      avatarUrl: args.avatarUrl ?? existingProfile?.avatarUrl ?? authUser.image ?? undefined,
      email: viewer.email ?? authUser.email ?? undefined,
      githubUsername: args.githubUsername ?? existingProfile?.githubUsername,
      twitterUsername: args.twitterUsername ?? existingProfile?.twitterUsername,
      telegramUsername: args.telegramUsername ?? existingProfile?.telegramUsername,
      telegramUserId: args.telegramUserId ?? existingProfile?.telegramUserId,
      agentName: args.agentName ?? existingProfile?.agentName ?? viewer.agentName,
      primaryLoginMethod: viewer.loginMethod ?? "better-auth",
      role: viewer.role,
      isTokenGated: viewer.isTokenGated,
      onboardingCompleted: viewer.onboardingCompleted ?? false,
      preferences: args.preferences ?? existingProfile?.preferences,
      updatedAt: now,
      lastSeenAt: now,
    };

    let profileId = existingProfile?._id ?? null;
    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, profilePatch);
    } else {
      profileId = await ctx.db.insert("userProfiles", {
        userId: viewer._id,
        ...profilePatch,
        createdAt: now,
      });
    }

    return {
      userId: viewer._id,
      profileId,
      updatedAt: now,
    };
  },
});
