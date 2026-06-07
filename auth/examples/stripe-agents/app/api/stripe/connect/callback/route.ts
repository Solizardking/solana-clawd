import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    redirect("/dashboard/settings?stripe_error=" + (error ?? "missing_code"));
  }

  const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_secret: process.env.STRIPE_SECRET_KEY!,
      code,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    stripe_user_id?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.stripe_user_id) {
    redirect("/dashboard/settings?stripe_error=" + (tokenData.error ?? "token_exchange_failed"));
  }

  const existing = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, session.user.id), eq(account.providerId, "stripe")))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(account)
      .set({
        accountId: tokenData.stripe_user_id!,
        accessToken: tokenData.access_token ?? null,
        refreshToken: tokenData.refresh_token ?? null,
        scope: tokenData.scope ?? null,
      })
      .where(eq(account.id, existing[0].id));
  } else {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    await db.insert(account).values({
      id,
      userId: session.user.id,
      providerId: "stripe",
      accountId: tokenData.stripe_user_id!,
      accessToken: tokenData.access_token ?? null,
      refreshToken: tokenData.refresh_token ?? null,
      scope: tokenData.scope ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  redirect("/dashboard/settings?stripe_connected=true");
}
