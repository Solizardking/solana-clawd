import { ConvexReactClient } from "convex/react";
import { getConfiguredConvexUrl } from "./runtimeConfig";

const convexUrl = getConfiguredConvexUrl();

if (!convexUrl) {
  console.warn("Missing Convex deployment URL. Set VITE_CONVEX_URL or VITE_CONVEX_SITE_URL.");
}

export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;
export const isConvexConfigured = convexClient !== null;
