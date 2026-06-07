import crypto from "crypto";
import Stripe from "stripe";
import { Mppx, stripe } from "mppx/server";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-04.preview" as Stripe.LatestApiVersion,
});

export { stripeClient };

const mppSecretKey = process.env.MPP_SECRET_KEY ?? crypto.randomBytes(32).toString("base64");

export const mppx = Mppx.create({
  methods: [
    stripe.charge({
      client: stripeClient,
      networkId: "internal",
      paymentMethodTypes: ["card", "link"],
    }),
  ],
  secretKey: mppSecretKey,
});
