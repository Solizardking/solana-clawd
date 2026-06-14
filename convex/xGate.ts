import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * X (Twitter) gate verifications.
 *
 * Counting verified wallets is hot-path (shown on the public landing page), so
 * we keep a denormalized counter in a dedicated `xGateStats` singleton row
 * (keyed by the well-known `SINGLETON_KEY`) that is mutated in lockstep with
 * `markVerified`. `countVerified` is then an O(1) read instead of an unbounded
 * table scan.
 *
 * `rebuildVerifiedCount` is a maintenance-only path that recomputes the
 * counter from the source-of-truth table.
 */

const SINGLETON_KEY = "singleton";

async function getStats(ctx: QueryCtx | MutationCtx): Promise<Doc<"xGateStats"> | null> {
  return await ctx.db
    .query("xGateStats")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .first();
}

export const getByWallet = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    return ctx.db
      .query("xVerifications")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();
  },
});

export const getOrCreate = mutation({
  args: { walletAddress: v.string(), challengeCode: v.string() },
  handler: async (ctx, { walletAddress, challengeCode }) => {
    const existing = await ctx.db
      .query("xVerifications")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (existing) return existing;

    const id = await ctx.db.insert("xVerifications", { walletAddress, challengeCode });
    return await ctx.db.get(id);
  },
});

export const markVerified = mutation({
  args: {
    walletAddress: v.string(),
    xUserId: v.optional(v.string()),
    xUsername: v.optional(v.string()),
    tweetId: v.optional(v.string()),
    tweetUrl: v.optional(v.string()),
  },
  handler: async (ctx, { walletAddress, ...fields }) => {
    const existing = await ctx.db
      .query("xVerifications")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!existing) throw new Error("No verification record — call getOrCreate first");
    if (existing.verifiedAt) return existing;

    await ctx.db.patch(existing._id, { ...fields, verifiedAt: Date.now() });

    // Bump the denormalized counter that backs countVerified().
    const stats = await getStats(ctx);
    if (stats) {
      await ctx.db.patch(stats._id, {
        verifiedCount: (stats.verifiedCount ?? 0) + 1,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("xGateStats", {
        key: SINGLETON_KEY,
        verifiedCount: 1,
        updatedAt: Date.now(),
      });
    }

    return await ctx.db.get(existing._id);
  },
});

/**
 * Maintenance-only mutation that recomputes the denormalized counter from the
 * `xVerifications` source of truth. Use it as a backfill if the counter ever
 * drifts from reality (e.g. after restoring a backup).
 */
export const rebuildVerifiedCount = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("xVerifications").collect();
    const verifiedCount = all.filter((r) => r.verifiedAt != null).length;
    const now = Date.now();
    const existing: Doc<"xGateStats"> | null = await getStats(ctx);
    if (existing) {
      await ctx.db.patch(existing._id, { verifiedCount, updatedAt: now });
    } else {
      await ctx.db.insert("xGateStats", {
        key: SINGLETON_KEY,
        verifiedCount,
        updatedAt: now,
      });
    }
    return verifiedCount;
  },
});

export const countVerified = query({
  args: {},
  handler: async (ctx) => {
    // O(1) read of the denormalized counter; see rebuildVerifiedCount() for
    // a backfill path if it ever drifts.
    const stats = await getStats(ctx);
    return stats?.verifiedCount ?? 0;
  },
});
