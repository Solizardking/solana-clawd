import { listProducts } from "@/lib/db";

export async function GET() {
  const products = await listProducts();
  return Response.json({ products });
}
