import { auth } from "@/lib/auth";
import { getSite, updateSite, deleteSite } from "@/lib/db";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const site = await getSite(id);
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(site);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json();
  const name = body.name ? String(body.name).slice(0, 200) : undefined;
  const html = body.html ? String(body.html) : undefined;
  const description = body.description ? String(body.description).slice(0, 1000) : undefined;
  if (html && html.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "HTML content exceeds 5 MB limit" }, { status: 400 });
  }
  const site = await updateSite({
    id,
    userId: session.user.id,
    name,
    html,
    description,
  });
  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(site);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const success = await deleteSite(id, session.user.id);
  if (!success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
