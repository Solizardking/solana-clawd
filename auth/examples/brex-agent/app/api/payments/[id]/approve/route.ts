import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPayment, approvePayment, getBrexConnection, getDefaultCard } from "@/lib/db";
import { getCardPan } from "@/lib/brex";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const payment = await getPayment(id);

  if (!payment) {
    return Response.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payment.status !== "pending") {
    return Response.json({ error: "Payment already resolved" }, { status: 400 });
  }

  const conn = await getBrexConnection(session.user.id);
  if (!conn) {
    return Response.json({ error: "No Brex account connected" }, { status: 400 });
  }

  const card = await getDefaultCard(session.user.id);
  if (!card) {
    return Response.json({ error: "No Brex card available" }, { status: 400 });
  }

  try {
    const pan = await getCardPan(conn.brexAccessToken, card.brexCardId);

    const pm = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number: pan.number,
        exp_month: pan.expiration_date.month,
        exp_year: pan.expiration_date.year,
        cvc: pan.cvv,
      },
    });

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
          "usage_limits[currency]": payment.currency,
          "usage_limits[max_amount]": String(payment.amountCents),
          "usage_limits[expires_at]": String(expiresAt),
        }),
      },
    );

    if (!sptResponse.ok) {
      const err = await sptResponse.json();
      return Response.json(
        { error: `SPT creation failed: ${err.error?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    const spt = await sptResponse.json();

    const updated = await approvePayment(id, spt.id, card.last4);

    return Response.json({
      status: "approved",
      paymentId: updated.id,
      spt: spt.id,
      brexCardLast4: card.last4,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment approval failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
