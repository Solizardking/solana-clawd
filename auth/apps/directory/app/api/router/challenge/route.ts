import { NextRequest, NextResponse } from "next/server";
import { createWalletChallenge, requireRouterClerkAuth } from "@/lib/router-keys";

export async function POST(req: NextRequest) {
  const auth = await requireRouterClerkAuth("write:router_keys");
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as { walletAddress?: string } | null;
  const walletAddress = body?.walletAddress?.trim();
  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(createWalletChallenge(auth.userId, walletAddress));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create wallet challenge" },
      { status: 400 },
    );
  }
}
