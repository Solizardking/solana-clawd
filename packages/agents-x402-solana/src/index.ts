/**
 * @openclawd/agents-x402
 *
 * Drop-in x402 monetization against the Clawd multi-tenant Solana
 * facilitator. Ships three layers:
 *
 *   - Core ({@link createClawdX402Client}) — thin fetch wrapper that
 *     resolves a slug, verifies a payment, and settles on-chain.
 *   - HTTP ({@link http}) — tiny middleware factory for Node / Workers /
 *     Hono / Express that returns 402 → reads X-Payment → settles →
 *     forwards.
 *   - MCP ({@link mcp}) — helpers to register `paidTool` calls on an
 *     existing `@modelcontextprotocol/sdk` server.
 *
 * None of the layers hold credentials — every sensitive operation is a
 * `fetch()` into Clawd's Express app. The Worker or MCP server can live
 * anywhere (Cloudflare, Fly, Deno, Bun, Node) because all that's
 * required is global `fetch`.
 */

export const X402_VERSION = 1 as const;
export const X402_SCHEME = "exact" as const;

export type SolanaNetwork = "solana-mainnet" | "solana-devnet";

export type SlugConfig = {
  slug: string;
  label: string;
  description: string | null;
  target: "agent" | "mcp" | "http" | "tool";
  network: SolanaNetwork;
  pricePerCallAtomic: number;
  pricePerCallUsd: number;
  recipientWallet: string;
  mint: string;
  x402: PaymentRequirementsEnvelope;
};

export type PaymentRequirementsEnvelope = {
  x402Version: typeof X402_VERSION;
  scheme: typeof X402_SCHEME;
  network: SolanaNetwork;
  paymentRequirements: {
    agentSlug: string;
    recipient: string;
    mint: string;
    amountAtomic: number;
    amountUsd: string;
  };
};

export type FacilitatorSettleResult =
  | {
      success: true;
      transaction: string;
      network: SolanaNetwork;
      transferAmount: number;
      recipientWallet: string;
      monetizedAgentId: number | null;
      commissionAtomic: number;
    }
  | {
      success: false;
      reason: string;
      details?: unknown;
    };

export type FacilitatorVerifyResult =
  | {
      isValid: true;
      transferAmount: number;
      mint: string;
      network: SolanaNetwork;
      recipientWallet: string;
      recipientTokenAccount: string;
      signer: string;
      monetizedAgentId: number | null;
      commissionAtomic: number;
      commissionBps: number;
    }
  | {
      isValid: false;
      reason: string;
      details?: unknown;
    };

export type ClawdX402ClientOptions = {
  /** e.g. `https://solanaclawd.com`. */
  apiBase?: string;
  /** Override the global `fetch` (Node <18, testing, etc.). */
  fetch?: typeof fetch;
  /** Cache slug lookups in-process for this many ms. Default 30s. */
  slugCacheMs?: number;
  /** Optional AbortSignal for all outbound requests. */
  signal?: AbortSignal;
};

export type PaidCallOptions = {
  /** Price override in atomic USDC (6 decimals). Cannot go below the
   *  slug's configured floor — the facilitator enforces this. */
  amountAtomicOverride?: number;
  /** Override the declared USD price echoed in 402 responses (cosmetic
   *  only; the atomic amount drives enforcement). */
  amountUsdOverride?: string;
};

const DEFAULT_API_BASE = "https://solanaclawd.com";

function normBase(apiBase?: string): string {
  return (apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

export class ClawdX402Error extends Error {
  constructor(
    message: string,
    public readonly code:
      | "slug-not-found"
      | "payment-required"
      | "payment-invalid"
      | "facilitator-unavailable",
    public readonly requirements?: PaymentRequirementsEnvelope
  ) {
    super(message);
    this.name = "ClawdX402Error";
  }
}

export type ClawdX402Client = {
  readonly apiBase: string;
  resolveSlug(slug: string): Promise<SlugConfig>;
  /** Returns a payment-requirements envelope for the given slug. */
  buildRequirements(
    slug: string,
    opts?: PaidCallOptions
  ): Promise<PaymentRequirementsEnvelope>;
  verify(xPaymentHeader: string): Promise<FacilitatorVerifyResult>;
  settle(xPaymentHeader: string): Promise<FacilitatorSettleResult>;
  /** Clears the in-process slug cache. */
  invalidate(slug?: string): void;
};

export function createClawdX402Client(
  opts: ClawdX402ClientOptions = {}
): ClawdX402Client {
  const apiBase = normBase(opts.apiBase);
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "No fetch implementation available. Pass opts.fetch or run on a platform with global fetch."
    );
  }
  const slugTtl = Math.max(0, opts.slugCacheMs ?? 30_000);
  type CacheEntry = { at: number; data: SlugConfig };
  const cache = new Map<string, CacheEntry>();

  async function resolveSlug(slug: string): Promise<SlugConfig> {
    const key = slug.trim().toLowerCase();
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < slugTtl) return hit.data;

    const res = await fetchImpl(
      `${apiBase}/api/monetize/public/${encodeURIComponent(key)}`,
      { signal: opts.signal }
    );
    if (res.status === 404) {
      throw new ClawdX402Error(
        `Slug "${slug}" is not registered (or is paused). Register it at ${apiBase}/x402 → Monetize.`,
        "slug-not-found"
      );
    }
    if (!res.ok) {
      throw new ClawdX402Error(
        `Slug lookup failed with HTTP ${res.status}.`,
        "facilitator-unavailable"
      );
    }
    const data = (await res.json()) as SlugConfig;
    cache.set(key, { at: now, data });
    return data;
  }

  async function buildRequirements(
    slug: string,
    opts2: PaidCallOptions = {}
  ): Promise<PaymentRequirementsEnvelope> {
    const cfg = await resolveSlug(slug);
    const atomicOverride = opts2.amountAtomicOverride ?? 0;
    const effectiveAtomic = Math.max(atomicOverride, cfg.pricePerCallAtomic);
    if (
      effectiveAtomic === cfg.pricePerCallAtomic &&
      !opts2.amountUsdOverride
    ) {
      return cfg.x402;
    }
    return {
      ...cfg.x402,
      paymentRequirements: {
        ...cfg.x402.paymentRequirements,
        amountAtomic: effectiveAtomic,
        amountUsd:
          opts2.amountUsdOverride ??
          (effectiveAtomic / 1_000_000).toFixed(6),
      },
    };
  }

  async function verify(xPaymentHeader: string): Promise<FacilitatorVerifyResult> {
    const res = await fetchImpl(
      `${apiBase}/api/x402/facilitator/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xPaymentHeader }),
        signal: opts.signal,
      }
    );
    if (!res.ok) {
      return {
        isValid: false,
        reason: `Facilitator /verify returned HTTP ${res.status}.`,
      };
    }
    return (await res.json()) as FacilitatorVerifyResult;
  }

  async function settle(xPaymentHeader: string): Promise<FacilitatorSettleResult> {
    const res = await fetchImpl(
      `${apiBase}/api/x402/facilitator/settle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xPaymentHeader }),
        signal: opts.signal,
      }
    );
    if (!res.ok) {
      return {
        success: false,
        reason: `Facilitator /settle returned HTTP ${res.status}.`,
      };
    }
    return (await res.json()) as FacilitatorSettleResult;
  }

  function invalidate(slug?: string) {
    if (!slug) cache.clear();
    else cache.delete(slug.trim().toLowerCase());
  }

  return { apiBase, resolveSlug, buildRequirements, verify, settle, invalidate };
}

// ─── Receipt helpers ────────────────────────────────────────────────────

/** Serialize a settle-result into a base64 JSON receipt suitable for the
 *  `X-Payment-Response` header. */
export function encodeReceipt(settle: {
  success: boolean;
  transaction?: string;
  network?: string;
  transferAmount?: number;
}): string {
  const payload = {
    success: settle.success,
    signature: settle.transaction ?? null,
    network: settle.network ?? null,
    transferAmount: settle.transferAmount ?? null,
  };
  const s = JSON.stringify(payload);
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(s)));
  }
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).Buffer.from(s, "utf-8").toString("base64");
}

// ─── MPP (Machine Payments Protocol) compatibility ──────────────────────
//
// MPP is IETF-track and co-authored by Tempo Labs + Stripe. The charge
// intent is wire-compatible with x402 exact: same signed transaction, same
// verify/settle semantics. The only differences are header names:
//
//   x402                          MPP
//   ───────────────────────────── ──────────────────────────────────────
//   402 Payment Required          402 Payment Required
//   X-Payment-Required: b64(...)  WWW-Authenticate: Payment method="..."
//                                                           challenge="b64(...)"
//   X-Payment: b64(signed-tx)     Authorization: Payment method="..."
//                                                           credential="b64(signed-tx)"
//   X-Payment-Response: b64(...)  Payment-Receipt: b64(...)
//
// MPP additionally supports other payment methods (Tempo, Stripe cards,
// Lightning). We only emit the Solana x402-exact method. MPP clients
// pick the method they can honor — unsupported methods are ignored.

/** Our MPP method identifier for Solana x402 exact-USDC. */
export const MPP_SOLANA_METHOD = "x402-solana-exact" as const;

/**
 * Build a `WWW-Authenticate: Payment` header value for the given x402
 * requirements. Safe to emit alongside `X-Payment-Required` — legacy
 * x402 clients ignore WWW-Authenticate, MPP clients ignore
 * X-Payment-Required.
 */
export function buildMppChallengeHeader(
  requirements: PaymentRequirementsEnvelope
): string {
  const challenge = _b64(JSON.stringify(requirements));
  return `Payment method="${MPP_SOLANA_METHOD}", challenge="${challenge}"`;
}

/**
 * Parse an incoming `Authorization: Payment` header. Returns the base64
 * credential if the scheme + method match; otherwise null so the caller
 * can fall back to the legacy `X-Payment` header.
 */
export function parseMppAuthorizationHeader(raw: string | null | undefined): {
  method: string;
  credential: string;
} | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^Payment\s/i.test(trimmed)) return null;
  const kv = Object.fromEntries(
    Array.from(trimmed.slice("Payment".length).matchAll(/(\w+)\s*=\s*"([^"]*)"/g)).map(
      (m) => [m[1].toLowerCase(), m[2]]
    )
  ) as Record<string, string>;
  const method = kv.method ?? "";
  const credential = kv.credential ?? "";
  if (!credential) return null;
  return { method, credential };
}

/**
 * Extract the base64 signed-tx credential from either the legacy
 * `X-Payment` header or the MPP `Authorization: Payment` header. Returns
 * the credential string or null.
 */
export function readPaymentCredential(headers: {
  xPayment?: string | null;
  authorization?: string | null;
}): string | null {
  if (headers.xPayment && headers.xPayment.trim()) return headers.xPayment.trim();
  const mpp = parseMppAuthorizationHeader(headers.authorization);
  if (mpp && mpp.credential) return mpp.credential;
  return null;
}

function _b64(s: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(s)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).Buffer.from(s, "utf-8").toString("base64");
}
