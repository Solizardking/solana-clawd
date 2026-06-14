import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Wallet-based auth backing the $CLAWD token-gated sign-in flow.
 *
 * NOTE: The `userId` args on these functions are typed as `v.string()` (not
 * `v.id("users")`) to match the existing `authSessions.userId` schema field
 * and to stay runtime-compatible with the way callers pass
 * `session.userId` (a plain string) into them. Tightening this to
 * `v.id("users")` is a follow-up that requires migrating the schema.
 */

// ─── Challenges ────────────────────────────────────────────────────────────────

export const storeChallenge = internalMutation({
  args: {
    walletAddress: v.string(),
    nonce: v.string(),
    message: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Invalidate any existing unused challenge for this wallet
    const existing = await ctx.db
      .query("authChallenges")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();
    if (existing && !existing.usedAt) {
      await ctx.db.patch(existing._id, { usedAt: Date.now() });
    }
    return await ctx.db.insert("authChallenges", {
      walletAddress: args.walletAddress,
      nonce: args.nonce,
      message: args.message,
      expiresAt: args.expiresAt,
    });
  },
});

export const getChallenge = internalQuery({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    return ctx.db
      .query("authChallenges")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .order("desc")
      .first();
  },
});

export const markChallengeUsed = internalMutation({
  args: { challengeId: v.id("authChallenges") },
  handler: async (ctx, { challengeId }) => {
    await ctx.db.patch(challengeId, { usedAt: Date.now() });
  },
});

// ─── Users ─────────────────────────────────────────────────────────────────────

export const upsertUserForSignIn = internalMutation({
  args: {
    walletAddress: v.string(),
    isAdmin: v.boolean(),
    clawdBalance: v.number(),
  },
  handler: async (ctx, { walletAddress, isAdmin, clawdBalance }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: isAdmin ? "admin" : existing.role,
        clawdBalance,
        isTokenGated: true,
        lastSignedIn: now,
        lastHolderVerifiedAt: now,
        updatedAt: now,
      });
      return { userId: existing._id, isNew: false };
    }

    const userId: Id<"users"> = await ctx.db.insert("users", {
      walletAddress,
      openId: walletAddress,
      primaryWalletAddress: walletAddress,
      loginMethod: "solana-wallet",
      role: isAdmin ? "admin" : "user",
      clawdBalance,
      isTokenGated: true,
      lastSignedIn: now,
      lastHolderVerifiedAt: now,
      updatedAt: now,
    });
    return { userId, isNew: true };
  },
});

export const getUserByWallet = internalQuery({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    return ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();
  },
});

// ─── Sessions ──────────────────────────────────────────────────────────────────

export const createSession = internalMutation({
  args: {
    userId: v.string(),
    walletAddress: v.string(),
    sessionToken: v.string(),
    loginMethod: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    isTokenHolder: v.boolean(),
    clawdBalance: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("authSessions", {
      userId: args.userId,
      walletAddress: args.walletAddress,
      sessionToken: args.sessionToken,
      loginMethod: args.loginMethod,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      isTokenHolder: args.isTokenHolder,
      clawdBalance: args.clawdBalance,
      expiresAt: args.expiresAt,
      lastSeenAt: now,
    });
  },
});

export const getSession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    return ctx.db
      .query("authSessions")
      .withIndex("by_token", (q) => q.eq("sessionToken", sessionToken))
      .first();
  },
});

export const touchSession = internalMutation({
  args: { sessionId: v.id("authSessions") },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, { lastSeenAt: Date.now() });
  },
});

export const revokeSession = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_token", (q) => q.eq("sessionToken", sessionToken))
      .first();
    if (session) {
      await ctx.db.patch(session._id, { revokedAt: Date.now() });
    }
  },
});

// ─── User Profile ──────────────────────────────────────────────────────────────

export const getUserById = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId as Id<"users">);
  },
});

export const updateUserProfile = internalMutation({
  args: {
    userId: v.string(),
    walletAddress: v.string(),
    agentName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    onboardingCompleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, walletAddress, onboardingCompleted, agentName, displayName, bio, twitterUsername, githubUsername, avatarUrl } = args;
    const now = Date.now();
    const userIdRef = userId as Id<"users">;

    const userPatch: {
      onboardingCompleted: boolean; updatedAt: number;
      agentName?: string; name?: string; bio?: string;
      twitterUsername?: string; githubUsername?: string; avatarUrl?: string;
    } = { onboardingCompleted, updatedAt: now };
    if (agentName !== undefined) userPatch.agentName = agentName;
    if (displayName !== undefined) userPatch.name = displayName;
    if (bio !== undefined) userPatch.bio = bio;
    if (twitterUsername !== undefined) userPatch.twitterUsername = twitterUsername;
    if (githubUsername !== undefined) userPatch.githubUsername = githubUsername;
    if (avatarUrl !== undefined) userPatch.avatarUrl = avatarUrl;

    await ctx.db.patch(userIdRef, userPatch);

    const existing = await ctx.db
      .query("walletProfiles")
      .withIndex("by_user_wallet", (q) => q.eq("userId", userId).eq("walletAddress", walletAddress))
      .first();

    const profilePatch: {
      updatedAt: number; agentName?: string; displayName?: string; bio?: string;
      twitterUsername?: string; githubUsername?: string; avatarUrl?: string;
    } = { updatedAt: now };
    if (agentName !== undefined) profilePatch.agentName = agentName;
    if (displayName !== undefined) profilePatch.displayName = displayName;
    if (bio !== undefined) profilePatch.bio = bio;
    if (twitterUsername !== undefined) profilePatch.twitterUsername = twitterUsername;
    if (githubUsername !== undefined) profilePatch.githubUsername = githubUsername;
    if (avatarUrl !== undefined) profilePatch.avatarUrl = avatarUrl;

    if (existing) {
      await ctx.db.patch(existing._id, profilePatch);
    } else {
      await ctx.db.insert("walletProfiles", {
        userId,
        walletAddress,
        isPrimary: true,
        lastLoginAt: now,
        updatedAt: now,
        agentName,
        displayName,
        bio,
        twitterUsername,
        githubUsername,
        avatarUrl,
      });
    }
  },
});

export const updateTwitterUsername = internalMutation({
  args: {
    userId: v.string(),
    walletAddress: v.string(),
    twitterUsername: v.string(),
  },
  handler: async (ctx, { userId, walletAddress, twitterUsername }) => {
    const now = Date.now();
    await ctx.db.patch(userId as Id<"users">, { twitterUsername, updatedAt: now });

    const existing = await ctx.db
      .query("walletSocialLinks")
      .withIndex("by_wallet_provider", (q) => q.eq("walletAddress", walletAddress).eq("provider", "twitter"))
      .first();

    const url = `https://x.com/${twitterUsername}`;
    if (existing) {
      await ctx.db.patch(existing._id, { handle: twitterUsername, url, verified: true, updatedAt: now });
    } else {
      await ctx.db.insert("walletSocialLinks", {
        userId,
        walletAddress,
        provider: "twitter",
        handle: twitterUsername,
        url,
        verified: true,
        updatedAt: now,
      });
    }
  },
});

// ─── Twitter OAuth PKCE States ─────────────────────────────────────────────────

export const storeTwitterOAuthState = internalMutation({
  args: {
    sessionToken: v.string(),
    state: v.string(),
    codeVerifier: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("twitterOAuthStates")
      .withIndex("by_token", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return await ctx.db.insert("twitterOAuthStates", args);
  },
});

export const getAndConsumeTwitterOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const stored = await ctx.db
      .query("twitterOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();
    if (!stored) return null;
    await ctx.db.delete(stored._id);
    if (stored.expiresAt < Date.now()) return null;
    return stored;
  },
});

// ─── Telegram User Management ─────────────────────────────────────────────────

export const upsertTelegramUser = internalMutation({
  args: {
    telegramUserId: v.string(),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", args.telegramUserId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        telegramUsername: args.telegramUsername ?? existing.telegramUsername,
        telegramChatId: args.telegramChatId ?? existing.telegramChatId,
        lastSignedIn: now,
        updatedAt: now,
      });
      return { userId: existing._id, isNew: false, agentName: existing.agentName ?? null };
    }

    const userId: Id<"users"> = await ctx.db.insert("users", {
      openId: `telegram:${args.telegramUserId}`,
      loginMethod: "telegram",
      role: "user",
      clawdBalance: 0,
      isTokenGated: false,
      telegramUserId: args.telegramUserId,
      telegramUsername: args.telegramUsername,
      telegramChatId: args.telegramChatId,
      name: args.telegramFirstName,
      lastSignedIn: now,
      updatedAt: now,
    });
    return { userId, isNew: true, agentName: null };
  },
});

export const getTelegramUserProfile = internalQuery({
  args: { telegramUserId: v.string() },
  handler: async (ctx, { telegramUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
      .first();
    if (!user) return null;
    return {
      userId: user._id,
      agentName: user.agentName ?? null,
      displayName: user.name ?? null,
      telegramUsername: user.telegramUsername ?? null,
      walletAddress: user.walletAddress ?? null,
      primaryWalletAddress: user.primaryWalletAddress ?? null,
      isTokenGated: user.isTokenGated,
      clawdBalance: user.clawdBalance,
    };
  },
});

export const setAgentName = internalMutation({
  args: { telegramUserId: v.string(), agentName: v.string() },
  handler: async (ctx, { telegramUserId, agentName }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
      .first();
    if (!user) return { ok: false as const, error: "User not found — send /start first." };
    await ctx.db.patch(user._id, {
      agentName,
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });
    return { ok: true as const, userId: user._id, agentName };
  },
});

// ─── Holder Verifications ──────────────────────────────────────────────────────

export const recordHolderVerification = internalMutation({
  args: {
    userId: v.optional(v.string()),
    walletAddress: v.string(),
    tokenMint: v.string(),
    rawBalance: v.number(),
    balance: v.number(),
    isHolder: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("holderVerifications", {
      userId: args.userId as Id<"users"> | undefined,
      walletAddress: args.walletAddress,
      tokenMint: args.tokenMint,
      rawBalance: args.rawBalance,
      balance: args.balance,
      isHolder: args.isHolder,
      source: "helius-rpc",
      verifiedAt: Date.now(),
    });
  },
});
