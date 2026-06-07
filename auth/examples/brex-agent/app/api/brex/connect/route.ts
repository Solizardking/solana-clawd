import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { upsertBrexConnection, syncCards } from "@/lib/db";
import { listCards } from "@/lib/brex";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { brexToken } = body;

  if (!brexToken || typeof brexToken !== "string") {
    return Response.json({ error: "brexToken is required" }, { status: 400 });
  }

  try {
    const cards = await listCards(brexToken);

    const conn = await upsertBrexConnection({
      userId: session.user.id,
      brexAccessToken: brexToken,
    });

    await syncCards(
      session.user.id,
      conn.id,
      cards.map((c) => ({
        brexCardId: c.id,
        last4: c.last_four,
        cardName: c.card_name,
        cardType: c.card_type,
      })),
    );

    return Response.json({
      connected: true,
      cards: cards.map((c) => ({
        id: c.id,
        name: c.card_name,
        last4: c.last_four,
        type: c.card_type,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to connect to Brex";
    return Response.json({ error: msg }, { status: 400 });
  }
}
