import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("caap_session", "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
