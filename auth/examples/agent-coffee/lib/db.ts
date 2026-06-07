import { eq, desc, and } from "drizzle-orm";
import { db } from "./db/index";
import { product, order } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

export async function listProducts() {
  return db.select().from(product).where(eq(product.inStock, true)).orderBy(product.name);
}

export async function getProductBySlug(slug: string) {
  const rows = await db.select().from(product).where(eq(product.slug, slug)).limit(1);
  return rows[0] ?? null;
}

function generateTrackingNumber() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "ACF-";
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function estimatedDeliveryDate(): Date {
  const days = 3 + Math.floor(Math.random() * 4);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function createOrder(params: {
  productId: string;
  productName: string;
  amountCents: number;
  currency: string;
  userId?: string;
  agentId?: string;
  stripePaymentIntentId?: string;
  receipt?: unknown;
}) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const trackingNumber = generateTrackingNumber();
  const estimatedDelivery = estimatedDeliveryDate();

  const [row] = await db
    .insert(order)
    .values({
      id,
      productId: params.productId,
      productName: params.productName,
      amountCents: params.amountCents,
      currency: params.currency,
      userId: params.userId ?? null,
      agentId: params.agentId ?? null,
      stripePaymentIntentId: params.stripePaymentIntentId ?? null,
      status: "processing",
      trackingNumber,
      estimatedDelivery,
      receipt: params.receipt ?? null,
    })
    .returning();
  return row;
}

export async function getOrder(id: string) {
  const rows = await db.select().from(order).where(eq(order.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listOrders() {
  return db.select().from(order).orderBy(desc(order.createdAt));
}

export async function listUserOrders(userId: string) {
  return db.select().from(order).where(eq(order.userId, userId)).orderBy(desc(order.createdAt));
}

export async function listAgentOrders(agentId: string) {
  return db.select().from(order).where(eq(order.agentId, agentId)).orderBy(desc(order.createdAt));
}
