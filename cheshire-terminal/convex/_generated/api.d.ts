/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as heliusHttp from "../heliusHttp.js";
import type * as http from "../http.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_relationships from "../lib/relationships.js";
import type * as lib_triggers from "../lib/triggers.js";
import type * as telegramHttp from "../telegramHttp.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";
import type * as walletAuth from "../walletAuth.js";
import type * as walletAuthHttp from "../walletAuthHttp.js";
import type * as xGate from "../xGate.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  heliusHttp: typeof heliusHttp;
  http: typeof http;
  "lib/functions": typeof lib_functions;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/relationships": typeof lib_relationships;
  "lib/triggers": typeof lib_triggers;
  telegramHttp: typeof telegramHttp;
  usage: typeof usage;
  users: typeof users;
  walletAuth: typeof walletAuth;
  walletAuthHttp: typeof walletAuthHttp;
  xGate: typeof xGate;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
