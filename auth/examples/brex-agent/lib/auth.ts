import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Stripe from "stripe";
import { db, schema } from "./db";
import { createPayment, listAllPayments, getBrexConnection, getDefaultCard } from "./db";
import { getCashBalance, getCardPan } from "./brex";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const BREX_PAY_REQUIRED_CONSTRAINTS = ["amountCents", "currency", "merchantName"] as const;

const capabilities: Capability[] = [
  {
    name: "brex.balance",
    description: "Check Brex account balance and available funds",
    input: { type: "object", properties: {} },
    output: {
      type: "object",
      properties: {
        available: { type: "number", description: "Available balance in cents" },
        currency: { type: "string" },
      },
    },
  },
  {
    name: "brex.pay",
    description:
      "Pay for something using the owner's Brex card. Returns a Stripe Shared Payment Token (SPT) that can be used as an MPP credential. You MUST provide constraints for amountCents, currency, and merchantName when requesting this capability.",
    requiredConstraints: ["amountCents", "currency", "merchantName"],
    constrainable_fields: {
      amountCents: {
        type: "number",
        description:
          "Maximum amount in cents the agent can spend (use max operator, e.g. { max: 1800 })",
        required: true,
      },
      currency: {
        type: "string",
        description: "Currency code (e.g. 'usd')",
        required: true,
      },
      merchantName: {
        type: "string",
        description: "Merchant the agent is allowed to pay (e.g. 'Agent Coffee Shop')",
        required: true,
      },
    },
    input: {
      type: "object",
      properties: {
        amountCents: { type: "number", description: "Amount in cents" },
        currency: { type: "string", description: "ISO currency code (e.g. usd)" },
        merchantName: { type: "string", description: "Name of the merchant" },
        itemDescription: {
          type: "string",
          description: "Description of what is being purchased",
        },
      },
      required: ["amountCents", "currency", "merchantName", "itemDescription"],
    },
    output: {
      type: "object",
      properties: {
        status: { type: "string" },
        spt: {
          type: "string",
          description: "Stripe Shared Payment Token to use as MPP credential",
        },
        amountCents: { type: "number" },
        currency: { type: "string" },
        expiresAt: { type: "string" },
      },
    },
  },
  {
    name: "brex.history",
    description: "View past payment history for this agent",
    input: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results to return" },
      },
    },
    output: {
      type: "object",
      properties: {
        payments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              amountCents: { type: "number" },
              merchantName: { type: "string" },
              status: { type: "string" },
              createdAt: { type: "string" },
            },
          },
        },
      },
    },
  },
];

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    agentAuth({
      providerName: "Brex Agent",
      providerDescription:
        "A financial proxy for AI agents. Connects to your Brex card and lets agents pay via MPP. The owner approves the capability once with spending constraints — no per-payment approval needed.",
      capabilities,
      defaultHostCapabilities: () => [],
      modes: ["delegated"],
      approvalMethods: ["ciba", "device_authorization"],
      freshSessionWindow: 0,
      resolveApprovalMethod: ({ preferredMethod, supportedMethods }) => {
        const method = preferredMethod ?? "ciba";
        return supportedMethods.includes(method) ? method : "ciba";
      },
      allowDynamicHostRegistration: true,
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        const userId = agentSession.user.id;

        switch (capability) {
          case "brex.balance": {
            const conn = await getBrexConnection(userId);
            if (!conn) {
              return { available: 0, currency: "usd", error: "No Brex account connected" };
            }
            const balance = await getCashBalance(conn.brexAccessToken);
            if (!balance) {
              return { available: 0, currency: "usd", error: "Could not fetch balance" };
            }
            return { available: balance.amount, currency: balance.currency };
          }

          case "brex.pay": {
            if (!args?.amountCents || !args?.merchantName || !args?.itemDescription) {
              throw new Error(
                "Missing required arguments: amountCents, merchantName, itemDescription",
              );
            }

            const payGrant = agentSession.agent.capabilityGrants.find(
              (g) => g.capability === "brex.pay" && g.status === "active",
            );
            if (payGrant) {
              const constraints = payGrant.constraints;
              if (!constraints) {
                throw new Error(
                  "brex.pay requires constraints (amountCents, currency, merchantName). Re-register with scoped constraints.",
                );
              }
              for (const field of BREX_PAY_REQUIRED_CONSTRAINTS) {
                if (!(field in constraints)) {
                  throw new Error(
                    `brex.pay grant is missing required constraint: ${field}. Re-register with scoped constraints.`,
                  );
                }
              }
            }

            const amountCents = Number(args.amountCents);
            if (amountCents <= 0) throw new Error("Amount must be positive");
            if (amountCents > 100000_00) throw new Error("Amount exceeds maximum ($100,000)");

            const currency = String(args.currency ?? "usd");
            const merchantName = String(args.merchantName);
            const itemDescription = String(args.itemDescription);

            // Get Brex card
            const conn = await getBrexConnection(userId);
            if (!conn)
              throw new Error(
                "No Brex account connected. Ask the owner to connect their Brex account.",
              );

            const card = await getDefaultCard(userId);
            if (!card) throw new Error("No Brex card available. Ask the owner to connect a card.");

            // Read card details from Brex API
            const pan = await getCardPan(conn.brexAccessToken, card.brexCardId);

            // Create Stripe PaymentMethod from card
            const pm = await stripe.paymentMethods.create({
              type: "card",
              card: {
                number: pan.number,
                exp_month: pan.expiration_date.month,
                exp_year: pan.expiration_date.year,
                cvc: pan.cvv,
              },
            });

            // Create SPT with exact amount limit and short expiry
            const expiresAt = Math.floor((Date.now() + 5 * 60 * 1000) / 1000);
            const sptResponse = await fetch(
              "https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens",
              {
                method: "POST",
                headers: {
                  Authorization: `Basic ${btoa(`${process.env.STRIPE_SECRET_KEY}:`)}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  payment_method: pm.id,
                  "usage_limits[currency]": currency,
                  "usage_limits[max_amount]": String(amountCents),
                  "usage_limits[expires_at]": String(expiresAt),
                }),
              },
            );

            if (!sptResponse.ok) {
              const err = await sptResponse.json();
              throw new Error(`SPT creation failed: ${err.error?.message ?? "unknown error"}`);
            }

            const spt = await sptResponse.json();

            // Record the payment for history
            await createPayment({
              agentId: agentSession.agent.id,
              userId,
              amountCents,
              currency,
              merchantName,
              itemDescription,
            });

            return {
              status: "approved",
              spt: spt.id,
              amountCents,
              currency,
              cardLast4: card.last4,
              expiresAt: new Date(expiresAt * 1000).toISOString(),
              message: `SPT created for $${(amountCents / 100).toFixed(2)}. Use this as your MPP credential to pay ${merchantName}. Expires in 5 minutes.`,
            };
          }

          case "brex.history": {
            const payments = await listAllPayments(userId);
            const limited = args?.limit ? payments.slice(0, Number(args.limit)) : payments;
            return {
              payments: limited.map((p) => ({
                id: p.id,
                amountCents: p.amountCents,
                currency: p.currency,
                merchantName: p.merchantName,
                itemDescription: p.itemDescription,
                status: p.status,
                createdAt: p.createdAt,
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
