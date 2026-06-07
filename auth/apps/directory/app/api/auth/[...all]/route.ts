// CAAP/1.0 auth handler — replaces better-auth toNextJsHandler.
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  buildRpcUrl,
  CLAWD_MINT,
  computeTier,
  createSession,
  createSiwsInput,
  fetchWalletSnapshot,
  verifySession,
  verifySiws,
} from "@/lib/auth";

export async function GET(_req: NextRequest, props: { params: Promise<{ all: string[] }> }) {
  const { all } = await props.params;
  const path = `/${all.join("/")}`;

  if (path === "/siws") {
    return NextResponse.json(
      createSiwsInput({
        domain: new URL(BASE_URL).hostname,
        statement: "Sign in to the CLAWD Agent Directory. No gas fees.",
      }),
    );
  }

  if (path === "/session") {
    const jar = await cookies();
    const token = jar.get("caap_session")?.value;
    if (!token) return NextResponse.json(null);
    return NextResponse.json(await verifySession(token));
  }

  if (path === "/discovery") {
    return NextResponse.json({
      protocol: "CAAP/1.0",
      issuer: BASE_URL,
      clawdMint: CLAWD_MINT,
      endpoints: {
        attest: `${BASE_URL}/api/caap/attest`,
        session: `${BASE_URL}/api/auth/session`,
        signout: `${BASE_URL}/api/auth/signout`,
        siws: `${BASE_URL}/api/auth/siws`,
      },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest, props: { params: Promise<{ all: string[] }> }) {
  const { all } = await props.params;
  const path = `/${all.join("/")}`;

  if (path === "/siws") {
    const body = (await req.json()) as {
      input: Parameters<typeof verifySiws>[0];
      output: Parameters<typeof verifySiws>[1];
    };

    const valid = verifySiws(body.input, body.output);
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    const walletAddress = body.input.address ?? "";
    if (!walletAddress) return NextResponse.json({ error: "Missing address" }, { status: 400 });

    const opts = { heliusRpcUrl: buildRpcUrl(), clawdMint: CLAWD_MINT };
    const snapshot = await fetchWalletSnapshot(walletAddress, opts);
    const tierInfo = computeTier(snapshot.clawdBalance);
    const token = await createSession(walletAddress, tierInfo.tier);

    const res = NextResponse.json({ walletAddress, tier: tierInfo.tier, tierInfo });
    res.cookies.set("caap_session", token, { httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  }

  if (path === "/signout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("caap_session", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
