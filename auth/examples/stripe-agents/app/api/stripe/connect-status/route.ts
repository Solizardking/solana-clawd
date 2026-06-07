import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getStripeAccessToken } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ connected: false }, { status: 401 });
  }

  const accessToken = await getStripeAccessToken(session.user.id);

  if (!accessToken) {
    return Response.json({ connected: false });
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const acct = (await res.json()) as { id: string };
    return Response.json({ connected: true, accountId: acct.id });
  } catch {
    return Response.json({ connected: false });
  }
}
