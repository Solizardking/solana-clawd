import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPayment, approvePayment, getDefaultCard, getCardById } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payment = await getPayment(id);

  if (!payment) return Response.json({ error: "Payment not found" }, { status: 404 });
  if (payment.userId !== session.user.id)
    return Response.json({ error: "Forbidden" }, { status: 403 });
  if (payment.status !== "pending")
    return Response.json({ error: "Payment already resolved" }, { status: 400 });

  const card = body.cardId
    ? await getCardById(body.cardId, session.user.id)
    : await getDefaultCard(session.user.id);
  if (!card) return Response.json({ error: "No card on file. Add a card first." }, { status: 400 });

  try {
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
          payment_method: card.stripePaymentMethodId,
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
      cardLast4: card.last4,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment approval failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
