import { NextRequest, NextResponse } from "next/server";
import { callRouter, requireRouterClerkAuth, verifyWalletChallenge } from "@/lib/router-keys";

export async function POST(req: NextRequest) {
  const auth = await requireRouterClerkAuth("write:router_keys");
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as {
    walletAddress?: string;
    challenge?: string;
    signedMessage?: string;
    signature?: string;
    name?: string;
    monthlyLimitUSDC?: number | string | null;
  } | null;

  if (!body?.walletAddress || !body.challenge || !body.signedMessage || !body.signature) {
    return NextResponse.json(
      { error: "walletAddress, challenge, signedMessage, and signature are required" },
      { status: 400 },
    );
  }

  try {
    verifyWalletChallenge({
      userId: auth.userId,
      walletAddress: body.walletAddress,
      challenge: body.challenge,
      signedMessage: body.signedMessage,
      signature: body.signature,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid wallet signature" },
      { status: 401 },
    );
  }

  const routerResponse = await callRouter("/v1/api-keys", {
    method: "POST",
    body: JSON.stringify({
      walletAddress: body.walletAddress,
      name: `${body.name?.trim() || "Clerk wallet key"} | clerk:${auth.userId}`,
      monthlyLimitUSDC: body.monthlyLimitUSDC ?? null,
      ownerUserId: auth.userId,
      ownerAuthProvider: "clerk",
      ownerTokenType: auth.tokenType ?? null,
    }),
  });

  const data = await routerResponse.json().catch(() => ({ error: "Invalid router response" }));
  return NextResponse.json(data, { status: routerResponse.status });
}

export async function GET() {
  const auth = await requireRouterClerkAuth("read:router_keys");
  if (auth instanceof Response) return auth;

  const routerResponse = await callRouter("/v1/usage", { method: "GET" });
  const data = await routerResponse.json().catch(() => ({ error: "Invalid router response" }));
  return NextResponse.json(data, { status: routerResponse.status });
}
