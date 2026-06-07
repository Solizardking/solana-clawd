import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getBrexConnection } from "@/lib/db";
import { getCashBalance } from "@/lib/brex";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conn = await getBrexConnection(session.user.id);
  if (!conn) {
    return Response.json({ error: "No Brex account connected" }, { status: 404 });
  }

  const balance = await getCashBalance(conn.brexAccessToken);
  return Response.json({ balance });
}
