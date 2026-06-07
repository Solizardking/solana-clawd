import { eq, and, desc } from "drizzle-orm";
import { db } from "./db/index";
import { brexConnection, brexCard, agentPayment, agent } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

export async function getBrexConnection(userId: string) {
  const rows = await db
    .select()
    .from(brexConnection)
    .where(eq(brexConnection.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertBrexConnection(params: {
  userId: string;
  brexAccessToken: string;
  brexAccountId?: string;
  accountName?: string;
}) {
  const existing = await getBrexConnection(params.userId);
  if (existing) {
    const [row] = await db
      .update(brexConnection)
      .set({
        brexAccessToken: params.brexAccessToken,
        brexAccountId: params.brexAccountId ?? existing.brexAccountId,
        accountName: params.accountName ?? existing.accountName,
      })
      .where(eq(brexConnection.id, existing.id))
      .returning();
    return row;
  }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const [row] = await db
    .insert(brexConnection)
    .values({
      id,
      userId: params.userId,
      brexAccessToken: params.brexAccessToken,
      brexAccountId: params.brexAccountId ?? null,
      accountName: params.accountName ?? null,
    })
    .returning();
  return row;
}

export async function getDefaultCard(userId: string) {
  const rows = await db
    .select()
    .from(brexCard)
    .where(and(eq(brexCard.userId, userId), eq(brexCard.isDefault, true)))
    .limit(1);
  if (rows[0]) return rows[0];
  const fallback = await db.select().from(brexCard).where(eq(brexCard.userId, userId)).limit(1);
  return fallback[0] ?? null;
}

export async function listUserCards(userId: string) {
  return db.select().from(brexCard).where(eq(brexCard.userId, userId));
}

export async function syncCards(
  userId: string,
  connectionId: string,
  cards: Array<{
    brexCardId: string;
    last4: string;
    cardName: string;
    cardType: string;
  }>,
) {
  for (const c of cards) {
    const existing = await db
      .select()
      .from(brexCard)
      .where(and(eq(brexCard.userId, userId), eq(brexCard.brexCardId, c.brexCardId)))
      .limit(1);
    if (existing.length === 0) {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await db.insert(brexCard).values({
        id,
        userId,
        brexConnectionId: connectionId,
        brexCardId: c.brexCardId,
        last4: c.last4,
        cardName: c.cardName,
        cardType: c.cardType,
        isDefault: cards.indexOf(c) === 0,
      });
    }
  }
}

export async function setDefaultCard(userId: string, cardId: string) {
  await db.update(brexCard).set({ isDefault: false }).where(eq(brexCard.userId, userId));
  await db
    .update(brexCard)
    .set({ isDefault: true })
    .where(and(eq(brexCard.id, cardId), eq(brexCard.userId, userId)));
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
    .values({
      id,
      agentId: params.agentId,
      userId: params.userId,
      amountCents: params.amountCents,
      currency: params.currency,
      merchantName: params.merchantName,
      itemDescription: params.itemDescription,
      status: params.status ?? "completed",
      approvedAt: new Date(),
    })
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
    .set({
      status: "approved",
      sptId,
      brexCardLast4: cardLast4,
      approvedAt: new Date(),
    })
    .where(eq(agentPayment.id, id))
    .returning();
  return row;
}

export async function denyPayment(id: string, reason?: string) {
  const [row] = await db
    .update(agentPayment)
    .set({
      status: "denied",
      deniedReason: reason ?? null,
      deniedAt: new Date(),
    })
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

export async function listAllPayments(userId: string) {
  return db
    .select()
    .from(agentPayment)
    .where(eq(agentPayment.userId, userId))
    .orderBy(desc(agentPayment.createdAt));
}

export async function getAgentName(agentId: string): Promise<string> {
  const rows = await db
    .select({ name: agent.name })
    .from(agent)
    .where(eq(agent.id, agentId))
    .limit(1);
  return rows[0]?.name ?? "Unknown Agent";
}
