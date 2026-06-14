const FALLBACK_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

declare global {
  interface Window {
    __CHESHIRE_PUBLIC_CONFIG__?: {
      convexUrl?: string;
      convexSiteUrl?: string;
    };
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function normalizeConvexCloudUrl(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (trimmed.includes(".convex.site")) {
    return trimmed.replace(".convex.site", ".convex.cloud");
  }
  return trimmed;
}

function browserOrigin() {
  if (typeof window === "undefined") return null;
  return trimTrailingSlash(window.location.origin);
}

export function resolveConvexUrl() {
  const resolved = getConfiguredConvexUrl();
  if (resolved) return resolved;

  throw new Error("Missing Convex deployment URL. Set VITE_CONVEX_URL or VITE_CONVEX_SITE_URL.");
}

export function getConfiguredConvexUrl() {
  const configured =
    import.meta.env.VITE_CONVEX_URL ||
    import.meta.env.VITE_CONVEX_SITE_URL ||
    (typeof window !== "undefined" ? window.__CHESHIRE_PUBLIC_CONFIG__?.convexUrl : undefined) ||
    (typeof window !== "undefined" ? window.__CHESHIRE_PUBLIC_CONFIG__?.convexSiteUrl : undefined) ||
    (typeof window !== "undefined" ? window.localStorage.getItem("VITE_CONVEX_URL") ?? undefined : undefined);

  const resolved = normalizeConvexCloudUrl(configured);
  if (resolved) return resolved;

  return null;
}

export function resolveBrowserRpcUrl() {
  const fromEnv =
    import.meta.env.VITE_PUBLIC_SOLANA_RPC_URL ||
    import.meta.env.VITE_HELIUS_RPC_URL;

  if (fromEnv) return fromEnv;

  const origin = browserOrigin();
  if (origin) return `${origin}/api/solana/rpc`;

  return FALLBACK_SOLANA_RPC_URL;
}

export function resolveBrowserWsUrl(path = "/ws") {
  if (typeof window === "undefined") return null;

  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) {
    return explicit.includes("?") ? explicit : `${explicit.replace(/\/$/, "")}${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

export { FALLBACK_SOLANA_RPC_URL };
