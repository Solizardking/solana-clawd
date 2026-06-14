import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

function normalizeConvexCloudUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (trimmed.includes(".convex.site")) {
    return trimmed.replace(".convex.site", ".convex.cloud");
  }
  return trimmed;
}

const CONVEX_URL = normalizeConvexCloudUrl(
  process.env.CONVEX_URL ||
    process.env.VITE_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_SITE_URL ||
    process.env.VITE_CONVEX_SITE_URL ||
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
);

if (!CONVEX_URL) {
  throw new Error("Missing Convex deployment URL. Set CONVEX_URL or CONVEX_SITE_URL.");
}

export const convex = new ConvexHttpClient(CONVEX_URL);
export { api };
