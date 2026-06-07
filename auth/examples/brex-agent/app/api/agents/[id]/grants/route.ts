import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db/index";
import { agentCapabilityGrant } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const grants = await db
    .select()
    .from(agentCapabilityGrant)
    .where(eq(agentCapabilityGrant.agentId, id));

  return Response.json({
    grants: grants.map((g) => ({
      id: g.id,
      capability: g.capability,
      status: g.status,
      constraints: g.constraints
        ? typeof g.constraints === "string"
          ? JSON.parse(g.constraints)
          : g.constraints
        : null,
    })),
  });
}
