import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Credential } from "mppx";
import Stripe from "stripe";
import { db, schema } from "./db";
import { createPayment, listAllPayments, getDefaultCard } from "./db";

const BASE_URL =
  process.env.BETTER_AUTH_URL ?? process.env.PORTLESS_URL ?? "http://stripe-agents.localhost";
const platformStripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-04.preview" as Stripe.LatestApiVersion,
});

const capabilities: Capability[] = [
  {
    name: "pay",
    description:
      "Pay for an MPP purchase using the owner's saved card. " +
      "The owner approves spending constraints once — the agent can then pay within those bounds instantly. " +
      "You MUST pass the 'challenge' object you received from the merchant's shop.buy capability (the full challenge object from the payment_required response). " +
      "Returns a 'credential' string — pass it to the merchant's shop.buy capability to complete the purchase.",
    grantTTL: 600,
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
        itemDescription: { type: "string", description: "Description of what is being purchased" },
        challenge: {
          type: "object",
          description:
            "The full MPP challenge object from the merchant's payment_required response",
        },
      },
      required: ["amountCents", "currency", "merchantName", "itemDescription", "challenge"],
    },
    output: {
      type: "object",
      properties: {
        status: { type: "string" },
        credential: {
          type: "string",
          description:
            "MPP credential — pass this as the 'credential' argument to the merchant's shop.buy capability",
        },
        sptId: { type: "string", description: "Stripe Shared Payment Token ID" },
        cardLast4: { type: "string" },
        expiresAt: { type: "string", description: "ISO timestamp when the SPT expires" },
        message: { type: "string" },
      },
    },
  },
  {
    name: "history",
    description: "View past payment history for this agent",
    input: {
      type: "object",
      properties: { limit: { type: "number", description: "Max results to return" } },
    },
    output: {
      type: "object",
      properties: { payments: { type: "array" } },
    },
  },
];

export const auth = betterAuth({
  baseURL: BASE_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      stripeCustomerId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    agentAuth({
      providerName: "Stripe Agents",
      providerDescription:
        "Bring your own card. Approve an agent's spending policy once (amount, currency, merchant), then payments execute instantly within those bounds.",
      capabilities,
      defaultHostCapabilities: [],
      modes: ["delegated"],
      approvalMethods: ["ciba", "device_authorization"],
      freshSessionWindow: 0,
      resolveApprovalMethod: ({ userId, supportedMethods }) => {
        if (userId && supportedMethods.includes("ciba")) return "ciba";
        return "device_authorization";
      },
      allowDynamicHostRegistration: true,
      onExecute: async ({ capability, arguments: args, agentSession, revokeGrant }) => {
        const userId = agentSession.user.id;

        switch (capability) {
          case "pay": {
            if (
              !args?.amountCents ||
              !args?.merchantName ||
              !args?.itemDescription ||
              !args?.challenge
            ) {
              throw new Error(
                "Missing required arguments: amountCents, merchantName, itemDescription, challenge",
              );
            }

            const amountCents = Number(args.amountCents);
            if (amountCents <= 0) throw new Error("Amount must be positive");
            if (amountCents > 100000_00) throw new Error("Amount exceeds maximum ($100,000)");

            const currency = String(args.currency ?? "usd");
            const merchantName = String(args.merchantName);
            const itemDescription = String(args.itemDescription);
            const challenge = args.challenge as Record<string, unknown>;

            const card = await getDefaultCard(userId);
            if (!card) {
              throw new Error(
                "PAYMENT_METHOD_REQUIRED: No card on file. " +
                  "The account owner must add a card at /dashboard/wallet before payments can be processed. " +
                  "Please ask the user to add a payment method and try again.",
              );
            }

            const expiresAt = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);

            const sptResponse = await fetch(
              "https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Stripe-Version": "2026-03-04.preview",
                },
                body: new URLSearchParams({
                  payment_method: card.stripePaymentMethodId,
                  "usage_limits[currency]": currency,
                  "usage_limits[max_amount]": String(amountCents),
                  "usage_limits[expires_at]": String(expiresAt),
                }),
              },
            );

            if (!sptResponse.ok) {
              const err = await sptResponse.json().catch(() => ({}));
              throw new Error(
                `Failed to create SPT: ${(err as Record<string, Record<string, string>>)?.error?.message ?? sptResponse.statusText}`,
              );
            }

            const spt = (await sptResponse.json()) as {
              id: string;
              payment_method_details?: { card?: { last4?: string } };
            };
            const sptLast4 = spt.payment_method_details?.card?.last4 ?? card.last4;

            const credential = Credential.serialize({
              challenge: challenge as Credential.Credential["challenge"],
              payload: { spt: spt.id },
            });

            await createPayment({
              agentId: agentSession.agent.id,
              userId,
              amountCents,
              currency,
              merchantName,
              itemDescription,
            });

            await revokeGrant();

            return {
              status: "approved",
              credential,
              sptId: spt.id,
              cardLast4: sptLast4,
              expiresAt: new Date(expiresAt * 1000).toISOString(),
              message: `SPT created for $${(amountCents / 100).toFixed(2)} on card •••• ${sptLast4}. Pass the credential to the merchant's shop.buy capability to complete the purchase.`,
            };
          }

          case "history": {
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
