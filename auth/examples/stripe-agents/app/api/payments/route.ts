import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listPendingPayments, listAllPayments, listPaymentsByAgent } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter");
  const agentIdParam = url.searchParams.get("agent_id");

  let payments;
  if (agentIdParam) {
    payments = await listPaymentsByAgent(session.user.id, agentIdParam);
  } else if (filter === "pending") {
    payments = await listPendingPayments(session.user.id);
  } else {
    payments = await listAllPayments(session.user.id);
  }

  return Response.json({ payments });
}
