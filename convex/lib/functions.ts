/**
 * Custom Convex function builders with auth context injected automatically.
 *
 * Usage:
 *   import { queryWithAuth, mutationWithAuth } from "./lib/functions";
 *
 *   export const myQuery = queryWithAuth({
 *     args: { ... },
 *     handler: async (ctx, args) => {
 *       // ctx.authUser is the Better Auth user (null if not signed in)
 *       // ctx.viewer is the app users table row (null if not found)
 *     },
 *   });
 */
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { authComponent } from "../auth";

/**
 * Resolves the Better Auth user and the matching `users` table row for the
 * current request. Returns `null` for either if no session is present or no
 * matching user has been provisioned yet.
 */
type AuthContext = {
  authUser: Doc<"users">["_id"] extends never
    ? null
    : {
        _id: string;
        email?: string | null;
        name?: string | null;
        image?: string | null;
      } | null;
  viewer: Doc<"users"> | null;
};

async function resolveAuthContext(ctx: QueryCtx | MutationCtx): Promise<AuthContext> {
  const authUser = (await authComponent.safeGetAuthUser(ctx)) as AuthContext["authUser"];
  if (!authUser) return { authUser: null, viewer: null };

  const viewer = await ctx.db
    .query("users")
    .withIndex("by_openId", (q) => q.eq("openId", authUser._id))
    .first();

  return { authUser, viewer };
}

// ── Authenticated (Better Auth session) ────────────────────────────────────

const withAuth = customCtx<QueryCtx | MutationCtx, AuthContext>(resolveAuthContext);

const withActionAuth = customCtx<ActionCtx, AuthContext>(async (ctx) => {
  const authUser = (await authComponent.safeGetAuthUser(ctx)) as AuthContext["authUser"];
  return { authUser, viewer: null };
});

export const queryWithAuth = customQuery(query, withAuth);
export const mutationWithAuth = customMutation(mutation, withAuth);
export const actionWithAuth = customAction(action, withActionAuth);

export const internalQueryWithAuth = customQuery(internalQuery, withAuth);
export const internalMutationWithAuth = customMutation(internalMutation, withAuth);
export const internalActionWithAuth = customAction(internalAction, withActionAuth);

// ── Wallet-based auth (existing Solana session flow) ──────────────────────
//
// The wallet-based sign-in flow lives in `walletAuthHttp.ts` and uses HTTP
// cookies. Queries that resolve a viewer purely from a wallet address do not
// need an injected auth context — they take the wallet as an argument. This
// builder is provided as a thin placeholder so call sites can switch helpers
// without churn if/when we add wallet-scoped ctx fields.

const withWallet = customCtx<QueryCtx | MutationCtx, Record<string, never>>(() => ({}));

export const walletQuery = customQuery(query, withWallet);
export const walletMutation = customMutation(mutation, withWallet);

/**
 * Helper: re-export `Id` for callers that want to type their args without
 * pulling from `_generated/dataModel` themselves.
 */
export type { Doc, Id };
