import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listPendingPayments, listAllPayments } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter");

  const payments =
    filter === "pending"
      ? await listPendingPayments(session.user.id)
      : await listAllPayments(session.user.id);

  return Response.json({ payments });
}
