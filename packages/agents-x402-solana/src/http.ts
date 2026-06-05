/**
 * HTTP middleware helpers.
 *
 * These are transport-neutral: every helper takes a `ReadHeader`
 * function and returns a result object. The caller (Hono, Express,
 * Next.js route handler, plain Worker) plumbs the result into whatever
 * response shape their framework wants. We avoid pulling Hono/Express
 * into the package so consumers don't pay for imports they don't use.
 */

import {
  type ClawdX402Client,
  type FacilitatorSettleResult,
  type PaidCallOptions,
  type PaymentRequirementsEnvelope,
  buildMppChallengeHeader,
  createClawdX402Client,
  encodeReceipt,
  readPaymentCredential as readCredentialFromHeaders,
} from "./index.js";

export type X402GateOptions = {
  /** Existing client. Mutually exclusive with `apiBase`. */
  client?: ClawdX402Client;
  apiBase?: string;
  /** Which registered slug to charge against. */
  slug: string;
  /** Optional per-route overrides. */
  price?: PaidCallOptions;
};

export type X402GateResult =
  | {
      status: "paid";
      /** Base64 payload for the `X-Payment-Response` header (x402). */
      receiptHeader: string;
      /** Same value — set as `Payment-Receipt` for MPP clients. */
      mppReceiptHeader: string;
      settle: Extract<FacilitatorSettleResult, { success: true }>;
    }
  | {
      status: "payment-required";
      /** Raw 402 response body. */
      body: Record<string, unknown>;
      /** Base64 payload for the `X-Payment-Required` header (x402). */
      requiredHeader: string;
      /** Ready-to-set value for the MPP `WWW-Authenticate` header. */
      wwwAuthenticate: string;
      requirements: PaymentRequirementsEnvelope;
    }
  | {
      status: "payment-invalid";
      reason: string;
      body: Record<string, unknown>;
      requiredHeader: string;
      wwwAuthenticate: string;
      requirements: PaymentRequirementsEnvelope;
    }
  | {
      status: "error";
      reason: string;
    };

function b64(s: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(s)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).Buffer.from(s, "utf-8").toString("base64");
}

/**
 * Core gate: call from your route handler with the incoming X-Payment
 * header value (or null/undefined). Returns a discriminated union
 * describing what the framework should do next.
 *
 * Typical usage:
 *   const gate = await x402Gate({ slug: "alpha-feed", price: {...} }, req.header("X-Payment"));
 *   if (gate.status === "paid") { attach gate.receiptHeader and continue }
 *   if (gate.status === "payment-required") return 402 with gate.body
 *   if (gate.status === "payment-invalid") return 402 with gate.body
 */
/**
 * Low-level gate. Pass BOTH header values — the x402 `X-Payment` and the
 * MPP `Authorization: Payment ...` — when available. We'll pick whichever
 * the client used. If you only have one, pass the other as null.
 */
export async function x402Gate(
  opts: X402GateOptions,
  credential:
    | string
    | null
    | undefined
    | { xPayment?: string | null; authorization?: string | null }
): Promise<X402GateResult> {
  const client = opts.client ?? createClawdX402Client({ apiBase: opts.apiBase });
  let requirements: PaymentRequirementsEnvelope;
  try {
    requirements = await client.buildRequirements(opts.slug, opts.price);
  } catch (e) {
    return {
      status: "error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
  const requiredHeader = b64(JSON.stringify(requirements));
  const wwwAuthenticate = buildMppChallengeHeader(requirements);

  // Normalize the credential input — accept a raw string (legacy callers),
  // null/undefined, or the structured form that carries both headers.
  const resolved =
    typeof credential === "string"
      ? credential
      : credential
      ? readCredentialFromHeaders(credential)
      : null;

  if (!resolved || !resolved.trim()) {
    return {
      status: "payment-required",
      body: {
        error: "payment-required",
        x402Version: 1,
        accepts: [requirements],
        slug: opts.slug,
        price: requirements.paymentRequirements,
        facilitator: `${client.apiBase}/api/x402/facilitator`,
        mpp: {
          challenge: {
            method: "x402-solana-exact",
            intent: "charge",
            request: requirements,
          },
        },
      },
      requiredHeader,
      wwwAuthenticate,
      requirements,
    };
  }

  const settle = await client.settle(resolved);
  if (!settle.success) {
    return {
      status: "payment-invalid",
      reason: settle.reason,
      body: {
        error: "payment-invalid",
        reason: settle.reason,
        accepts: [requirements],
      },
      requiredHeader,
      wwwAuthenticate,
      requirements,
    };
  }

  const receipt = encodeReceipt(settle);
  return {
    status: "paid",
    receiptHeader: receipt,
    mppReceiptHeader: receipt,
    settle,
  };
}

// ─── Framework adapters (shallow — import-free so they tree-shake) ─────

/**
 * Hono middleware factory. Usage:
 *
 *   app.use("/premium/*", honoX402Gate({ slug: "alpha-feed" }));
 *
 * Avoids a direct Hono import so this package stays zero-runtime-dep.
 * Pass-through on success; 402 JSON on payment-required or invalid.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function honoX402Gate(opts: X402GateOptions): (c: any, next: any) => Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (c: any, next: any) => {
    const result = await x402Gate(opts, {
      xPayment: c.req.header("X-Payment") ?? c.req.header("x-payment"),
      authorization: c.req.header("Authorization") ?? c.req.header("authorization"),
    });
    switch (result.status) {
      case "paid":
        c.header("X-Payment-Response", result.receiptHeader);
        c.header("Payment-Receipt", result.mppReceiptHeader);
        await next();
        return;
      case "payment-required":
      case "payment-invalid":
        c.header("X-Payment-Required", result.requiredHeader);
        c.header("WWW-Authenticate", result.wwwAuthenticate);
        return c.json(result.body, 402);
      case "error":
        return c.json({ error: "x402-gate-failed", reason: result.reason }, 503);
    }
  };
}

/**
 * Express-style middleware. Usage:
 *
 *   app.use("/premium", expressX402Gate({ slug: "alpha-feed" }));
 */
export function expressX402Gate(opts: X402GateOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: any, next: any) => {
    const h = req.headers ?? {};
    const xPayment = (h["x-payment"] ?? h["X-Payment"]) as string | undefined;
    const authorization = (h["authorization"] ?? h["Authorization"]) as
      | string
      | undefined;
    const result = await x402Gate(opts, {
      xPayment: typeof xPayment === "string" ? xPayment : null,
      authorization: typeof authorization === "string" ? authorization : null,
    });
    switch (result.status) {
      case "paid":
        res.setHeader("X-Payment-Response", result.receiptHeader);
        res.setHeader("Payment-Receipt", result.mppReceiptHeader);
        return next();
      case "payment-required":
      case "payment-invalid":
        res.setHeader("X-Payment-Required", result.requiredHeader);
        res.setHeader("WWW-Authenticate", result.wwwAuthenticate);
        res.status(402).json(result.body);
        return;
      case "error":
        res.status(503).json({ error: "x402-gate-failed", reason: result.reason });
        return;
    }
  };
}
