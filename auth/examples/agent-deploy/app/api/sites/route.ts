import { auth } from "@/lib/auth";
import { listSites, createSite, countSites } from "@/lib/db";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sites = await listSites(session.user.id);
  return NextResponse.json({
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    total: await countSites(session.user.id),
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  if (!body.name || !body.html) {
    return NextResponse.json({ error: "name and html are required" }, { status: 400 });
  }
  const name = String(body.name).slice(0, 200);
  const html = String(body.html);
  const description = body.description ? String(body.description).slice(0, 1000) : undefined;
  if (html.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "HTML content exceeds 5 MB limit" }, { status: 400 });
  }
  const site = await createSite({
    name,
    html,
    description,
    userId: session.user.id,
  });
  return NextResponse.json(site, { status: 201 });
}
