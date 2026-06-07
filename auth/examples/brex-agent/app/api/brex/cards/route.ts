import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listUserCards, setDefaultCard } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cards = await listUserCards(session.user.id);
  return Response.json({ cards });
}

export async function PUT(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.cardId) {
    return Response.json({ error: "cardId is required" }, { status: 400 });
  }

  await setDefaultCard(session.user.id, body.cardId);
  return Response.json({ success: true });
}
