# `@openclawd/agents-x402`

One-line x402 Solana monetization for MCP servers, HTTP handlers, and
agent tool calls. Settles through the Clawd multi-tenant facilitator —
your server never touches a private key.

Mirrors the surface of Cloudflare's
[`agents/x402`](https://developers.cloudflare.com/agents/agentic-payments/x402/)
package but sends USDC on Solana (via the Clawd facilitator) instead of
on EVM chains via the Coinbase facilitator.

## Install

```bash
pnpm add @openclawd/agents-x402
# or
npm install @openclawd/agents-x402
```

MCP users also need:

```bash
pnpm add @modelcontextprotocol/sdk
```

## Register your slug first

1. Go to https://solanaclawd.com/x402 → **Monetize**.
2. Register a slug (e.g. `alpha-feed`), set your recipient wallet and
   price. Copy the slug.

## Monetize an MCP tool

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withClawdX402 } from "@openclawd/agents-x402/mcp";
import { z } from "zod";

const server = withClawdX402(
  new McpServer({ name: "PaidMCP", version: "1.0.0" }),
  { slug: "alpha-feed" }, // apiBase defaults to https://solanaclawd.com
);

// Paid tool — $0.01 per call (facilitator enforces the registered floor)
server.paidTool(
  "square",
  "Squares a number",
  0.01,
  { number: z.number() },
  {},
  async ({ number }) => ({
    content: [{ type: "text", text: String(number ** 2) }],
  }),
);

// Free tool — use the server's normal `tool()` method
server.tool(
  "echo",
  "Echo a message",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: message }],
  }),
);
```

Clients that don't pay receive an MCP error result with
`_meta.x402Required` set to a standard paymentRequirements envelope.
Any x402-aware MCP client (Cloudflare's agents SDK, Clawd's own Solana
coding-tool plugin, hand-rolled) recognizes it, signs a USDC transfer,
and retries with `_meta.x402Payment: "<base64 signed tx>"`.

## Monetize an HTTP endpoint

Works with any framework that exposes request headers. Transport-neutral
helper:

```ts
import { x402Gate } from "@openclawd/agents-x402/http";

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await x402Gate(
      { slug: "alpha-feed" },
      req.headers.get("X-Payment"),
    );
    if (gate.status === "payment-required" || gate.status === "payment-invalid") {
      return new Response(JSON.stringify(gate.body), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "X-Payment-Required": gate.requiredHeader,
        },
      });
    }
    if (gate.status === "error") {
      return new Response(gate.reason, { status: 503 });
    }
    // gate.status === "paid"
    return new Response("premium content", {
      headers: { "X-Payment-Response": gate.receiptHeader },
    });
  },
};
```

Framework adapters (zero runtime import of Hono/Express — the adapters
duck-type the context object):

```ts
// Hono
import { Hono } from "hono";
import { honoX402Gate } from "@openclawd/agents-x402/http";

const app = new Hono();
app.use("/premium/*", honoX402Gate({ slug: "alpha-feed" }));
app.get("/premium/:id", (c) => c.json({ alpha: true }));
```

```ts
// Express
import express from "express";
import { expressX402Gate } from "@openclawd/agents-x402/http";

const app = express();
app.use("/premium", expressX402Gate({ slug: "alpha-feed" }));
app.get("/premium/feed", (_req, res) => res.json({ alpha: true }));
```

## Direct client

Use the low-level client when you want manual control (e.g. to verify
without settling, or to cache slug lookups yourself):

```ts
import { createClawdX402Client } from "@openclawd/agents-x402";

const client = createClawdX402Client({ apiBase: "https://solanaclawd.com" });

const cfg = await client.resolveSlug("alpha-feed");
console.log(cfg.pricePerCallUsd, cfg.recipientWallet);

const verify = await client.verify(xPaymentHeader);
if (!verify.isValid) throw new Error(verify.reason);

const settle = await client.settle(xPaymentHeader);
if (settle.success) console.log("signature:", settle.transaction);
```

## Config

| Option | Default | Purpose |
| --- | --- | --- |
| `apiBase` | `https://solanaclawd.com` | Clawd API base |
| `slug` | — (required) | Registered slug from `/x402 → Monetize` |
| `price.amountAtomicOverride` | `undefined` | Bump price above the slug floor |
| `slugCacheMs` | `30000` | In-process slug-lookup cache |

## Security

- **No keys in your server.** Settlement is a single `fetch()` to Clawd.
- **Under-pay protection.** The facilitator charges
  `max(declaredAtomic, agent.pricePerCallAtomic)` — a proxy can never
  drop the price below the owner's floor.
- **Recipient spoof protection.** If a paymentRequirements echo says
  recipient = X but the slug in the DB has Y, settle fails.
- **Network mismatch.** Mainnet-registered agents cannot be paid with
  devnet USDC and vice versa.

## Related

- [Monetize guide](../../docs/monetize.md)
- [x402-proxy Cloudflare Worker](../../docs/x402-proxy-worker.md) —
  gate *any* HTTP origin without writing server code
- [Facilitator implementation](../../server/_core/x402Facilitator.ts)
