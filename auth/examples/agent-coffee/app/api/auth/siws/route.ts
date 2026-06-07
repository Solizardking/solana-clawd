import {
  buildRpcUrl,
  CLAWD_MINT,
  computeTier,
  createSession,
  createSiwsInput,
  fetchWalletSnapshot,
  verifySiws,
} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/siws — return a fresh SIWS challenge
export async function GET() {
  const input = createSiwsInput({
    domain: process.env.NEXT_PUBLIC_DOMAIN ?? "clawd.xyz",
    statement: "Sign in to Clawd Deploy. No gas fees.",
  });
  return NextResponse.json(input);
}

// POST /api/auth/siws — verify signature and issue session cookie
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    input: Parameters<typeof verifySiws>[0];
    output: Parameters<typeof verifySiws>[1];
  };

  const valid = verifySiws(body.input, body.output);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const walletAddress = body.input.address!;
  const opts = { heliusRpcUrl: buildRpcUrl(), clawdMint: CLAWD_MINT };
  const snapshot = await fetchWalletSnapshot(walletAddress, opts);
  const tierInfo = computeTier(snapshot.clawdBalance);

  const token = await createSession(walletAddress, tierInfo.tier);
  const res = NextResponse.json({ walletAddress, tier: tierInfo.tier, tierInfo });
  res.cookies.set("caap_session", token, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
