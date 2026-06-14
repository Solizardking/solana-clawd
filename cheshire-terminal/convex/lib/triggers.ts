import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { MutationCtx } from "../_generated/server";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "../_generated/server";
import type { DataModel } from "../_generated/dataModel";

const triggers = new Triggers<DataModel, MutationCtx>();

// When a new authSession is inserted, bump lastSignedIn on the linked user
triggers.register("authSessions", async (ctx, change) => {
  if (change.operation === "insert") {
    const { walletAddress } = change.newDoc;
    const user = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();
    if (user) {
      await ctx.db.patch(user._id, { lastSignedIn: Date.now(), updatedAt: Date.now() });
    }
  }
});

// Export mutation builders that auto-apply all registered triggers.
// Import these instead of the raw mutation/internalMutation in files
// that touch tables with registered triggers.
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);
