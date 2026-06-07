import { auth } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const ALLOWED_KEYS = [
  "freshSessionEnabled",
  "freshSessionWindow",
  "preferredApprovalMethod",
  "webauthnEnabled",
  "defaultHostCapabilities",
] as const;

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isAnonymous) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;

  try {
    const [
      freshSessionEnabled,
      freshSessionWindow,
      preferredApprovalMethod,
      webauthnEnabled,
      defaultHostCapabilities,
    ] = await Promise.all([
      getSetting(userId, "freshSessionEnabled"),
      getSetting(userId, "freshSessionWindow"),
      getSetting(userId, "preferredApprovalMethod"),
      getSetting(userId, "webauthnEnabled"),
      getSetting(userId, "defaultHostCapabilities"),
    ]);

    let parsedCaps: string[] = [];
    if (defaultHostCapabilities) {
      try {
        const v = JSON.parse(defaultHostCapabilities);
        if (Array.isArray(v)) parsedCaps = v;
      } catch {}
    }

    return NextResponse.json({
      freshSessionEnabled: freshSessionEnabled === "true",
      freshSessionWindow: parseInt(freshSessionWindow ?? "300", 10),
      preferredApprovalMethod: preferredApprovalMethod ?? "ciba",
      webauthnEnabled: webauthnEnabled === "true",
      defaultHostCapabilities: parsedCaps,
    });
  } catch {
    return NextResponse.json({
      freshSessionEnabled: false,
      freshSessionWindow: 300,
      preferredApprovalMethod: "ciba",
      webauthnEnabled: false,
      defaultHostCapabilities: [],
    });
  }
}

export async function PUT(req: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isAnonymous) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;
  const body = await req.json();

  try {
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        const value =
          key === "defaultHostCapabilities" && Array.isArray(body[key])
            ? JSON.stringify(body[key])
            : String(body[key]);
        await setSetting(userId, key, value);
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to save settings. The settings table may not exist — run `pnpm db:push`." },
      { status: 500 },
    );
  }
}
