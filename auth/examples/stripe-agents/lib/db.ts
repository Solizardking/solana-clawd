import { eq, and, desc } from "drizzle-orm";
import { db } from "./db/index";
import { savedCard, agentPayment, agent, user, account } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

export async function getDefaultCard(userId: string) {
  const rows = await db
    .select()
    .from(savedCard)
    .where(and(eq(savedCard.userId, userId), eq(savedCard.isDefault, true)))
    .limit(1);
  if (rows[0]) return rows[0];
  const fallback = await db.select().from(savedCard).where(eq(savedCard.userId, userId)).limit(1);
  return fallback[0] ?? null;
}

export async function listUserCards(userId: string) {
  return db.select().from(savedCard).where(eq(savedCard.userId, userId));
}

export async function getCardById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(savedCard)
    .where(and(eq(savedCard.id, id), eq(savedCard.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function addCard(params: {
  userId: string;
  stripePaymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}) {
  const existing = await listUserCards(params.userId);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const [row] = await db
    .insert(savedCard)
    .values({
      id,
      userId: params.userId,
      stripePaymentMethodId: params.stripePaymentMethodId,
      brand: params.brand,
      last4: params.last4,
      expMonth: params.expMonth,
      expYear: params.expYear,
      isDefault: existing.length === 0,
    })
    .returning();
  return row;
}

export async function removeCard(id: string, userId: string) {
  await db.delete(savedCard).where(and(eq(savedCard.id, id), eq(savedCard.userId, userId)));
}

export async function setDefaultCard(userId: string, cardId: string) {
  await db.update(savedCard).set({ isDefault: false }).where(eq(savedCard.userId, userId));
  await db
    .update(savedCard)
    .set({ isDefault: true })
    .where(and(eq(savedCard.id, cardId), eq(savedCard.userId, userId)));
}

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ stripeCustomerId: user.stripeCustomerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.stripeCustomerId ?? null;
}

export async function setStripeCustomerId(userId: string, customerId: string) {
  await db.update(user).set({ stripeCustomerId: customerId }).where(eq(user.id, userId));
}

export async function getStripeAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "stripe")))
    .limit(1);
  return rows[0]?.accessToken ?? null;
}

export async function createPayment(params: {
  agentId: string;
  userId: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  itemDescription: string;
  status?: string;
}) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const [row] = await db
    .insert(agentPayment)
    .values({ id, ...params, status: params.status ?? "completed", approvedAt: new Date() })
    .returning();
  return row;
}

export async function getPayment(id: string) {
  const rows = await db.select().from(agentPayment).where(eq(agentPayment.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function approvePayment(id: string, sptId: string, cardLast4: string) {
  const [row] = await db
    .update(agentPayment)
    .set({ status: "approved", sptId, cardLast4, approvedAt: new Date() })
    .where(eq(agentPayment.id, id))
    .returning();
  return row;
}

export async function denyPayment(id: string, reason?: string) {
  const [row] = await db
    .update(agentPayment)
    .set({ status: "denied", deniedReason: reason ?? null, deniedAt: new Date() })
    .where(eq(agentPayment.id, id))
    .returning();
  return row;
}

export async function listPendingPayments(userId: string) {
  return db
    .select()
    .from(agentPayment)
    .where(and(eq(agentPayment.userId, userId), eq(agentPayment.status, "pending")))
    .orderBy(desc(agentPayment.createdAt));
}

export async function listPaymentsByAgent(userId: string, agentId: string) {
  return db
    .select()
    .from(agentPayment)
    .where(and(eq(agentPayment.userId, userId), eq(agentPayment.agentId, agentId)))
    .orderBy(desc(agentPayment.createdAt));
}

export async function listAllPayments(userId: string) {
  const rows = await db
    .select({
      id: agentPayment.id,
      agentId: agentPayment.agentId,
      agentName: agent.name,
      userId: agentPayment.userId,
      amountCents: agentPayment.amountCents,
      currency: agentPayment.currency,
      merchantName: agentPayment.merchantName,
      itemDescription: agentPayment.itemDescription,
      status: agentPayment.status,
      cardLast4: agentPayment.cardLast4,
      createdAt: agentPayment.createdAt,
    })
    .from(agentPayment)
    .leftJoin(agent, eq(agentPayment.agentId, agent.id))
    .where(eq(agentPayment.userId, userId))
    .orderBy(desc(agentPayment.createdAt));
  return rows;
}
