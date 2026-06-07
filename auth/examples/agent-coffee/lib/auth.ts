import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Challenge } from "mppx";
import { db, schema } from "./db";
import { listProducts, getProductBySlug, listAgentOrders, getOrder, createOrder } from "./db";
import { mppx } from "./mpp";

const BASE_URL =
  process.env.BETTER_AUTH_URL ?? process.env.PORTLESS_URL ?? "http://agent-coffee.localhost";
const STRIPE_AGENTS_URL = process.env.STRIPE_AGENTS_URL ?? "http://stripe-agents.localhost";

const capabilities: Capability[] = [
  {
    name: "shop.list",
    description: "List all available coffee products with prices, origins, and roast levels",
    input: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max products to return" },
      },
    },
    output: {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              slug: { type: "string" },
              description: { type: "string" },
              priceCents: { type: "number" },
              origin: { type: "string" },
              roastLevel: { type: "string" },
              buyUrl: {
                type: "string",
                description: "Direct MPP endpoint — POST for 402 challenge (for HTTP clients)",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "shop.details",
    description: "Get full details of a specific coffee product by slug",
    input: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Product slug (e.g. ethiopian-yirgacheffe)" },
      },
      required: ["slug"],
    },
    output: {
      type: "object",
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        priceCents: { type: "number" },
        origin: { type: "string" },
        roastLevel: { type: "string" },
        inStock: { type: "boolean" },
        buyUrl: {
          type: "string",
          description: "Direct MPP endpoint — POST for 402 challenge (for HTTP clients)",
        },
      },
    },
  },
  {
    name: "shop.buy",
    description:
      "Buy a product using MPP (Machine Payments Protocol). " +
      "Step 1: Call with just 'slug' — returns a payment challenge and a paymentProvider with a discovery URL. " +
      "Step 2: Discover the payment provider at the given URL, use its 'pay' capability with the challenge to get a credential. " +
      "Step 3: Call again with 'slug' and 'credential' to complete the purchase.",
    input: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Product slug (e.g. ethiopian-yirgacheffe)" },
        credential: {
          type: "string",
          description:
            "MPP credential (SPT token) from payment provider. Omit on first call to get the payment challenge.",
        },
      },
      required: ["slug"],
    },
    output: {
      type: "object",
      properties: {
        status: { type: "string", description: "'payment_required' or 'order_confirmed'" },
        challenge: {
          type: "object",
          description: "MPP 402 challenge (when status=payment_required)",
        },
        paymentProvider: {
          type: "object",
          description:
            "Accepted payment provider (when status=payment_required). Discover it at the URL to find its 'pay' capability.",
          properties: {
            name: { type: "string", description: "Payment provider name" },
            url: {
              type: "string",
              description:
                "Base URL — fetch /.well-known/agent-configuration to discover capabilities",
            },
          },
        },
        order: { type: "object", description: "Order details (when status=order_confirmed)" },
      },
    },
  },
  {
    name: "shop.order",
    description:
      "Complete a purchase using a Stripe PaymentIntent ID from Agent Pay. " +
      "First pay via Agent Pay, then call this with the slug and paymentReference to place the order.",
    input: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Product slug (e.g. ethiopian-yirgacheffe)" },
        paymentReference: {
          type: "string",
          description: "Stripe PaymentIntent ID (pi_...) from Agent Pay",
        },
      },
      required: ["slug", "paymentReference"],
    },
    output: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        product: { type: "string" },
        amount: { type: "string" },
        status: { type: "string" },
        trackingNumber: { type: "string" },
        estimatedDelivery: { type: "string" },
        message: { type: "string" },
      },
    },
  },
  {
    name: "shop.orders",
    description: "List orders placed by this agent, including tracking and delivery status",
    input: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Get a specific order by ID (optional)" },
      },
    },
    output: {
      type: "object",
      properties: {
        orders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              productName: { type: "string" },
              amountCents: { type: "number" },
              status: { type: "string" },
              trackingNumber: { type: "string" },
              estimatedDelivery: { type: "string" },
              createdAt: { type: "string" },
            },
          },
        },
      },
    },
  },
];

const ALL_CAPABILITIES = ["shop.list", "shop.details", "shop.buy", "shop.orders"];

export const auth = betterAuth({
  baseURL: BASE_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    agentAuth({
      providerName: "Agent Coffee Shop",
      providerDescription:
        "A coffee bean storefront. AI agents can browse the catalog, purchase beans via MPP, and track orders.",
      capabilities,
      defaultHostCapabilities: () => ALL_CAPABILITIES,
      modes: ["autonomous", "delegated"],
      approvalMethods: ["ciba", "device_authorization"],
      freshSessionWindow: 0,
      resolveApprovalMethod: ({ preferredMethod, supportedMethods }) => {
        const method = preferredMethod ?? "ciba";
        return supportedMethods.includes(method) ? method : "ciba";
      },
      allowDynamicHostRegistration: true,
      resolveAutonomousUser: ({ hostId }) => ({
        id: `autonomous_${hostId}`,
        name: "Autonomous Shopper",
        email: `agent_${hostId}@agent-coffee-shop.local`,
      }),
      onAutonomousAgentClaimed: async ({ agentId, userId }) => {
        const { eq } = await import("drizzle-orm");
        const { order } = await import("./db/schema");
        await db.update(order).set({ userId }).where(eq(order.agentId, agentId));
      },
      onExecute: async ({ capability, arguments: args, agentSession, ctx }) => {
        const agentId = agentSession.agent.id;

        switch (capability) {
          case "shop.list": {
            const products = await listProducts();
            const limited = args?.limit ? products.slice(0, Number(args.limit)) : products;
            return {
              products: limited.map((p) => ({
                name: p.name,
                slug: p.slug,
                description: p.description,
                priceCents: p.priceCents,
                origin: p.origin,
                roastLevel: p.roastLevel,
                buyUrl: `${BASE_URL}/api/products/${p.slug}/buy`,
              })),
            };
          }

          case "shop.details": {
            if (!args?.slug) throw new Error("Missing required argument: slug");
            const product = await getProductBySlug(String(args.slug));
            if (!product) throw new Error("Product not found");
            return {
              name: product.name,
              slug: product.slug,
              description: product.description,
              priceCents: product.priceCents,
              origin: product.origin,
              roastLevel: product.roastLevel,
              inStock: product.inStock,
              buyUrl: `${BASE_URL}/api/products/${product.slug}/buy`,
            };
          }

          case "shop.buy": {
            if (!args?.slug) throw new Error("Missing required argument: slug");

            const product = await getProductBySlug(String(args.slug));
            if (!product) throw new Error("Product not found");
            if (!product.inStock) throw new Error("Product is out of stock");

            let chargeRequest = ctx.request!;
            if (args.credential) {
              const newHeaders = new Headers(ctx.request!.headers);
              newHeaders.set("authorization", String(args.credential));
              chargeRequest = new Request(ctx.request!.url, {
                method: ctx.request!.method,
                headers: newHeaders,
              });
            }

            const result = await mppx.charge({
              amount: String(product.priceCents / 100),
              currency: "usd",
              decimals: 2,
              description: `${product.name} - Agent Coffee Shop`,
            })(chargeRequest);

            if (result.status === 402) {
              const challenge = Challenge.fromResponse(result.challenge as Response);
              return {
                status: "payment_required",
                challenge,
                paymentProvider: {
                  name: "Stripe Agents",
                  url: STRIPE_AGENTS_URL,
                  description:
                    "Discover this provider's 'pay' capability at " +
                    STRIPE_AGENTS_URL +
                    "/.well-known/agent-configuration — pass the challenge object to obtain a credential.",
                },
              };
            }

            const newOrder = await createOrder({
              productId: product.id,
              productName: product.name,
              amountCents: product.priceCents,
              currency: "usd",
              agentId,
            });

            return {
              status: "order_confirmed",
              order: {
                id: newOrder.id,
                product: product.name,
                amount: `$${(product.priceCents / 100).toFixed(2)}`,
                trackingNumber: newOrder.trackingNumber,
                estimatedDelivery: newOrder.estimatedDelivery?.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }),
                message: `Order confirmed! Your ${product.name} is being prepared. Tracking: ${newOrder.trackingNumber}.`,
              },
            };
          }

          case "shop.orders": {
            if (args?.orderId) {
              const o = await getOrder(String(args.orderId));
              if (!o || o.agentId !== agentId) throw new Error("Order not found");
              return {
                orders: [
                  {
                    id: o.id,
                    productName: o.productName,
                    amountCents: o.amountCents,
                    status: o.status,
                    trackingNumber: o.trackingNumber,
                    estimatedDelivery: o.estimatedDelivery,
                    shippedAt: o.shippedAt,
                    deliveredAt: o.deliveredAt,
                    createdAt: o.createdAt,
                  },
                ],
              };
            }
            const orders = await listAgentOrders(agentId);
            return {
              orders: orders.map((o) => ({
                id: o.id,
                productName: o.productName,
                amountCents: o.amountCents,
                status: o.status,
                trackingNumber: o.trackingNumber,
                estimatedDelivery: o.estimatedDelivery,
                createdAt: o.createdAt,
              })),
            };
          }

          default:
            throw new Error(`Unknown capability: ${capability}`);
        }
      },
    }),
  ],
});
