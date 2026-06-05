/**
 * MCP monetization wrapper — mirrors Cloudflare's `withX402` / `paidTool`
 * surface but settles through Clawd's Solana facilitator instead of an
 * EVM one.
 *
 * Wire-level flow:
 *
 *   1. Client calls a paid tool. The x402 payment envelope travels in
 *      `_meta.x402Payment` on the tool-call request (an MCP extension
 *      point that surfaces under `CallToolRequest.params._meta`).
 *   2. No payment → server returns `isError: true` with
 *      `_meta.x402Required` set to the paymentRequirements envelope.
 *      x402-aware clients (Cloudflare's agents SDK, Clawd coding tools)
 *      recognize this, sign a USDC transfer, and retry.
 *   3. Retry carries `_meta.x402Payment: "<base64 signed tx>"`. The
 *      server POSTs it to the facilitator, on success runs the handler,
 *      and attaches `_meta.x402Receipt: "<base64 receipt>"` to the
 *      result.
 *
 * This module does NOT import `@modelcontextprotocol/sdk` directly —
 * it's a soft peer dep so the package stays small. Callers pass their
 * existing MCP server instance; we duck-type against its `.tool()`
 * method.
 */

import {
  type ClawdX402Client,
  type PaidCallOptions,
  type PaymentRequirementsEnvelope,
  createClawdX402Client,
  encodeReceipt,
} from "./index.js";

export type PaidMcpServerConfig = {
  /** Existing Clawd client (re-use across tools). */
  client?: ClawdX402Client;
  apiBase?: string;
  /** Default slug applied to every paid tool unless overridden per-call. */
  slug: string;
  /**
   * Called BEFORE settle so the server can short-circuit (logging,
   * rate-limits, extra auth). Return false to reject the tool call as
   * if no payment had been provided.
   */
  onBeforeSettle?: (ctx: {
    toolName: string;
    slug: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any;
  }) => boolean | Promise<boolean>;
};

export type PaidToolOptions = PaidCallOptions & {
  /** Override the default slug for this tool. */
  slug?: string;
  /** Default `priceUsd` if not configured server-side. Cosmetic — the
   *  facilitator enforces the registered price floor. */
  priceUsd?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolHandler = (args: any, extra?: any) => any | Promise<any>;

type ToolResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Array<any>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalMcpServer = { tool: (...args: any[]) => any };

export type ClawdMcp<S extends MinimalMcpServer> = S & {
  /**
   * Register a paid tool. Signature mirrors Cloudflare's `paidTool`:
   *
   *   server.paidTool(name, description, priceUsd, schema, annotations, handler)
   *
   * `priceUsd` can be 0 (or any lower value) — the facilitator still
   * enforces the registered slug floor. Use it as a cosmetic override.
   */
  paidTool: (
    name: string,
    description: string,
    priceUsd: number,
    inputSchema: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    annotations: Record<string, any>,
    handler: AnyToolHandler
  ) => void;
};

function toolPaymentRequiredResult(
  requirements: PaymentRequirementsEnvelope,
  toolName: string,
  slug: string
): ToolResult {
  const usd = requirements.paymentRequirements.amountUsd;
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `This tool requires an x402 payment of $${usd} USDC on ${requirements.network}. ` +
          `Submit a signed transaction in _meta.x402Payment to proceed.`,
      },
    ],
    _meta: {
      x402Required: requirements,
      x402Tool: toolName,
      x402Slug: slug,
    },
  };
}

function toolPaymentInvalidResult(
  reason: string,
  requirements: PaymentRequirementsEnvelope
): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Payment verification failed: ${reason}`,
      },
    ],
    _meta: {
      x402Required: requirements,
      x402Error: reason,
    },
  };
}

/**
 * Wrap an existing MCP server (duck-typed — any object with a `.tool()`
 * method works) and add a `paidTool(...)` helper that enforces an x402
 * payment before running the handler.
 */
export function withClawdX402<S extends MinimalMcpServer>(
  server: S,
  cfg: PaidMcpServerConfig
): ClawdMcp<S> {
  const client = cfg.client ?? createClawdX402Client({ apiBase: cfg.apiBase });
  const paidServer = server as ClawdMcp<S>;

  paidServer.paidTool = function paidTool(
    name,
    description,
    priceUsd,
    inputSchema,
    annotations,
    handler
  ) {
    const slug = (annotations as { x402Slug?: string } | undefined)?.x402Slug
      ?? cfg.slug;
    const amountAtomicOverride =
      typeof priceUsd === "number" && priceUsd > 0
        ? Math.round(priceUsd * 1_000_000)
        : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped: AnyToolHandler = async (args: any, extra?: any) => {
      // Extract the x402 payment envelope from _meta (MCP request
      // extension). Different SDKs surface it in slightly different
      // places — we check the common ones.
      const meta =
        (extra?._meta as Record<string, unknown> | undefined) ??
        (extra?.request?.params?._meta as Record<string, unknown> | undefined) ??
        (args as { _meta?: Record<string, unknown> } | undefined)?._meta;
      const rawPayment = meta?.x402Payment;
      const requirements = await client.buildRequirements(slug, {
        amountAtomicOverride,
      });

      if (typeof rawPayment !== "string" || rawPayment.length < 16) {
        return toolPaymentRequiredResult(requirements, name, slug);
      }

      if (cfg.onBeforeSettle) {
        const ok = await cfg.onBeforeSettle({ toolName: name, slug, args });
        if (!ok) {
          return toolPaymentInvalidResult("Rejected by server-side guard.", requirements);
        }
      }

      const settle = await client.settle(rawPayment);
      if (!settle.success) {
        return toolPaymentInvalidResult(settle.reason, requirements);
      }

      const result = (await handler(args, extra)) as ToolResult | undefined;
      const base: ToolResult =
        result && typeof result === "object" && Array.isArray(result.content)
          ? result
          : {
              content: [{ type: "text", text: String(result ?? "") }],
            };

      return {
        ...base,
        _meta: {
          ...(base._meta ?? {}),
          x402Receipt: encodeReceipt(settle),
          x402Signature: settle.transaction,
          x402Network: settle.network,
          x402TransferAmountAtomic: settle.transferAmount,
        },
      };
    };

    // Delegate to the underlying server. MCP SDKs accept different
    // positional-argument shapes; we forward the full list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (paidServer as any).tool(name, description, inputSchema, annotations, wrapped);
  };

  return paidServer;
}
