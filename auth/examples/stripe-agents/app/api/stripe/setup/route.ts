import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getStripeCustomerId, setStripeCustomerId } from "@/lib/db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let customerId = await getStripeCustomerId(session.user.id);

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: session.user.name,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await setStripeCustomerId(session.user.id, customerId);
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
  });

  return Response.json({
    clientSecret: setupIntent.client_secret,
    customerId,
  });
}
