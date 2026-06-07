import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listOrders, listUserOrders } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");

  if (scope === "all") {
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (adminEmails.length > 0 && !adminEmails.includes(session.user.email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const orders = await listOrders();
    return Response.json({ orders });
  }

  const orders = await listUserOrders(session.user.id);
  return Response.json({ orders });
}
