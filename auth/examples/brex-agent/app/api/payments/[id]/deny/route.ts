import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPayment, denyPayment } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await req.json().catch(() => ({}));
  const updated = await denyPayment(id, body.reason);

  return Response.json({
    status: "denied",
    paymentId: updated.id,
    reason: updated.deniedReason,
  });
}
