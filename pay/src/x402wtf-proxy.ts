/**
 * pay/src/x402wtf-proxy.ts
 *
 * The 8 /api/x402wtf/* routes that proxy real x402.wtf endpoints:
 *
 *   GET  /api/x402wtf/info              → GET  https://x402.wtf/payments/info
 *   GET  /api/x402wtf/registry          → GET  https://x402.wtf/agents/registry
 *   GET  /api/x402wtf/agents            → GET  https://x402.wtf/agents/registry/agents
 *   POST /api/x402wtf/agent/chat        → POST https://x402.wtf/payments/agent/chat
 *   POST /api/x402wtf/checkout          → POST https://x402.wtf/payments/checkout
 *   POST /api/x402wtf/verify            → POST https://x402.wtf/payments/verify
 *   POST /api/x402wtf/register          → POST https://x402.wtf/agents/registry/register
 *
 * Plus an inline /api/x402wtf/manifest route that emits the v2.1 merchant
 * manifest directly from the worker (no upstream call).
 *
 * If the upstream is unreachable, every route returns a structured
 * 503/502 payload so the storefront "Live Checkout" lab can still render.
 */

import {
  buildManifest,
  buildChallenge,
  getProductById,
  listProductIds,
  X402_STORE_CONSTANTS,
} from "./x402-store.js";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Payment,Payment-Receipt,X-Clawd-Pay-Receipt," +
    "X-Clawd-Product,X-Clawd-Nonce,X-Agent-Asset,X-Clawd-Wallet",
  "X-Solana-Clawd-X402-Store": "1",
};

type JsonRecord = Record<string, unknown>;
type RouteContext = { request: Request; url: URL; env: Record<string, string | undefined> };

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

async function proxyToX402(
  path: string,
  init: RequestInit,
  env: Record<string, string | undefined>,
): Promise<Response> {
  const base = env.X402_STORE_BASE ?? X402_STORE_CONSTANTS.STORE_BASE;
  const upstream = `${base.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("User-Agent", "solana-clawd-pay/0.2 (+x402.wtf-store)");
  if (env.X402_STORE_API_KEY) {
    headers.set("Authorization", `Bearer ${env.X402_STORE_API_KEY}`);
  }
  try {
    const response = await fetch(upstream, { ...init, headers, redirect: "follow" });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
        "X-X402-Store-Upstream": upstream,
        "X-X402-Store-Upstream-Status": String(response.status),
      },
    });
  } catch (err: any) {
    return json(
      {
        error: "x402_store_unreachable",
        upstream,
        detail: err?.message ?? String(err),
        fallback: { use: "manifest_only" },
      },
      { status: 502 },
    );
  }
}

// ─── Route handlers ──────────────────────────────────────────────────────────

/** GET /api/x402wtf/info */
export async function handleInfo(ctx: RouteContext): Promise<Response> {
  return proxyToX402("/payments/info", { method: "GET" }, ctx.env);
}

/** GET /api/x402wtf/registry */
export async function handleRegistry(ctx: RouteContext): Promise<Response> {
  return proxyToX402("/agents/registry", { method: "GET" }, ctx.env);
}

/** GET /api/x402wtf/agents */
export async function handleAgents(ctx: RouteContext): Promise<Response> {
  const product = ctx.url.searchParams.get("product") ?? undefined;
  const qs = product ? `?product=${encodeURIComponent(product)}` : "";
  return proxyToX402(`/agents/registry/agents${qs}`, { method: "GET" }, ctx.env);
}

/** POST /api/x402wtf/agent/chat */
export async function handleAgentChat(ctx: RouteContext): Promise<Response> {
  const body = await ctx.request.text();
  return proxyToX402(
    "/payments/agent/chat",
    { method: "POST", body },
    ctx.env,
  );
}

/** POST /api/x402wtf/checkout — creates a challenge OR settles a payment */
export async function handleCheckout(ctx: RouteContext): Promise<Response> {
  const productId =
    ctx.url.searchParams.get("product") ??
    getDefaultProductFromBody(await safeReadJson(ctx.request));

  // If the buyer pasted a payment-signature, attempt settlement (verify).
  const paymentSig =
    ctx.request.headers.get("X-Payment") ??
    ctx.request.headers.get("Payment-Receipt") ??
    (await extractPaymentSigFromBody(ctx.request));

  if (paymentSig) {
    return proxyToX402(
      "/payments/verify",
      {
        method: "POST",
        headers: { "X-Payment": paymentSig, "X-Clawd-Product": productId },
        body: JSON.stringify({
          payment: paymentSig,
          product: productId,
          merchant: X402_STORE_CONSTANTS.STORE_NAMESPACE,
        }),
      },
      ctx.env,
    );
  }

  // No payment yet: build a per-product challenge and POST it to the
  // upstream checkout (which issues the real x402.wtf challenge).
  const challenge = buildChallenge(productId);
  if (!challenge) {
    return json(
      {
        error: "unknown_product",
        product: productId,
        knownProducts: listProductIds(),
      },
      { status: 400 },
    );
  }

  return proxyToX402(
    "/payments/checkout",
    {
      method: "POST",
      body: JSON.stringify({
        merchant: X402_STORE_CONSTANTS.STORE_NAMESPACE,
        product: productId,
        price: challenge.price,
        acceptedNetworks: challenge.acceptedNetworks,
        challengePath: challenge.challengePath,
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
        expiresAt: challenge.expiresAt,
      }),
    },
    ctx.env,
  );
}

/** POST /api/x402wtf/verify */
export async function handleVerify(ctx: RouteContext): Promise<Response> {
  const body = await ctx.request.text();
  return proxyToX402(
    "/payments/verify",
    { method: "POST", body },
    ctx.env,
  );
}

/** POST /api/x402wtf/register — register a merchant on the x402.wtf registry */
export async function handleRegister(ctx: RouteContext): Promise<Response> {
  const body = await ctx.request.text();
  return proxyToX402(
    "/agents/registry/register",
    { method: "POST", body },
    ctx.env,
  );
}

/** GET /api/x402wtf/manifest — emit the v2.1 manifest directly */
export async function handleManifest(ctx: RouteContext): Promise<Response> {
  const origin = `${ctx.url.protocol}//${ctx.url.host}`;
  const manifest = buildManifest(origin);
  return json(manifest);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function safeReadJson(request: Request): Promise<JsonRecord | null> {
  try {
    return (await request.clone().json()) as JsonRecord;
  } catch {
    return null;
  }
}

async function extractPaymentSigFromBody(request: Request): Promise<string | null> {
  const body = await safeReadJson(request);
  if (!body) return null;
  if (typeof body.payment === "string") return body.payment;
  if (typeof body.receipt === "string") return body.receipt;
  if (typeof body.signature === "string") return body.signature;
  return null;
}

function getDefaultProductFromBody(body: JsonRecord | null): string {
  if (body && typeof body.product === "string") {
    return body.product;
  }
  return listProductIds()[0] ?? "pay-quote";
}

// ─── Main dispatcher ────────────────────────────────────────────────────────

export function isX402WtfPath(pathname: string): boolean {
  return pathname.startsWith("/api/x402wtf/");
}

export async function handleX402WtfRoute(ctx: RouteContext): Promise<Response | null> {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const path = ctx.url.pathname.replace(/^\/api\/x402wtf\//, "");

  switch (path) {
    case "info":
      return handleInfo(ctx);
    case "registry":
      return handleRegistry(ctx);
    case "agents":
      return handleAgents(ctx);
    case "agent/chat":
      return handleAgentChat(ctx);
    case "checkout":
      return handleCheckout(ctx);
    case "verify":
      return handleVerify(ctx);
    case "register":
      return handleRegister(ctx);
    case "manifest":
      return handleManifest(ctx);
    default:
      return null;
  }
}
