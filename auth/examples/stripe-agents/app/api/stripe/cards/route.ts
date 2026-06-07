import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listUserCards, addCard, removeCard, setDefaultCard } from "@/lib/db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cards = await listUserCards(session.user.id);
  return Response.json({ cards });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { paymentMethodId } = body;

  if (!paymentMethodId) {
    return Response.json({ error: "paymentMethodId is required" }, { status: 400 });
  }

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

  if (!pm.card) {
    return Response.json({ error: "Not a card payment method" }, { status: 400 });
  }

  const card = await addCard({
    userId: session.user.id,
    stripePaymentMethodId: pm.id,
    brand: pm.card.brand,
    last4: pm.card.last4,
    expMonth: pm.card.exp_month,
    expYear: pm.card.exp_year,
  });

  return Response.json({ card });
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

export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get("id");
  if (!cardId) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  await removeCard(cardId, session.user.id);
  return Response.json({ success: true });
}
