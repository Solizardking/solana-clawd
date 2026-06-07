import { getPayment } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await getPayment(id);

  if (!payment) {
    return Response.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status === "pending") {
    return Response.json({
      status: "pending_approval",
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      merchantName: payment.merchantName,
      itemDescription: payment.itemDescription,
      createdAt: payment.createdAt,
    });
  }

  if (payment.status === "approved") {
    return Response.json({
      status: "approved",
      paymentId: payment.id,
      spt: payment.sptId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      cardLast4: payment.cardLast4,
      approvedAt: payment.approvedAt,
    });
  }

  if (payment.status === "denied") {
    return Response.json({
      status: "denied",
      paymentId: payment.id,
      reason: payment.deniedReason,
      deniedAt: payment.deniedAt,
    });
  }

  return Response.json({
    status: payment.status,
    paymentId: payment.id,
  });
}
