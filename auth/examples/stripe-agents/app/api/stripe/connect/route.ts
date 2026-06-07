import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID!,
    scope: "read_write",
    redirect_uri: `${process.env.PORTLESS_URL ?? process.env.BETTER_AUTH_URL ?? "http://stripe-agents.localhost"}/api/stripe/connect/callback`,
    state,
    stripe_user_email: session.user.email,
  });

  redirect(`https://connect.stripe.com/oauth/authorize?${params}`);
}
