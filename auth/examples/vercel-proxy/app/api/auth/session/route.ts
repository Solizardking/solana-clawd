import { verifySession } from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const jar = await cookies();
  const token = jar.get("caap_session")?.value;
  if (!token) return NextResponse.json(null);
  const session = await verifySession(token);
  return NextResponse.json(session);
}
