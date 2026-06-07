import { mppx } from "@/lib/mpp";
import { getProductBySlug, createOrder } from "@/lib/db";
import { auth } from "@/lib/auth";
import { verifyAgentRequest } from "@better-auth/agent-auth";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.inStock) {
    return Response.json({ error: "Product out of stock" }, { status: 400 });
  }

  const agentSession = await verifyAgentRequest(req.clone(), auth);

  const result = await mppx.charge({
    amount: String(product.priceCents / 100),
    currency: "usd",
    decimals: 2,
    description: `${product.name} - Agent Coffee Shop`,
  })(req);

  if (result.status === 402) {
    return result.challenge;
  }

  const order = await createOrder({
    productId: product.id,
    productName: product.name,
    amountCents: product.priceCents,
    currency: "usd",
    agentId: agentSession?.agent?.id ?? undefined,
    userId: agentSession?.user?.id ?? undefined,
  });

  return result.withReceipt(
    Response.json({
      order: {
        id: order.id,
        product: product.name,
        amount: `$${(product.priceCents / 100).toFixed(2)}`,
        status: order.status,
        trackingNumber: order.trackingNumber,
        estimatedDelivery: order.estimatedDelivery,
        message: `Order confirmed! Your ${product.name} is being prepared. Tracking: ${order.trackingNumber}. Estimated delivery: ${order.estimatedDelivery?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
      },
    }),
  );
}
