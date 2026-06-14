/**
 * Re-exports relationship helpers from convex-helpers.
 *
 * Usage:
 *   import { getOrThrow, getManyFrom, getOneFrom } from "./lib/relationships";
 *
 *   const user = await getOrThrow(ctx, userId);
 *   const sessions = await getManyFrom(ctx.db, "authSessions", "by_user", userId, "userId");
 */
export {
  getOrThrow,
  getManyFrom,
  getManyVia,
  getOneFrom,
} from "convex-helpers/server/relationships";
