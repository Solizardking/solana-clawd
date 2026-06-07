import { attestAgent, buildRpcUrl, CLAWD_MINT, computeTier, fetchWalletSnapshot } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { agentId, walletAddress } = (await req.json()) as {
    agentId: string;
    walletAddress: string;
  };
  if (!agentId || !walletAddress) {
    return NextResponse.json({ error: "agentId and walletAddress required" }, { status: 400 });
  }

  const opts = { heliusRpcUrl: buildRpcUrl(), clawdMint: CLAWD_MINT };
  const [attestation, snapshot] = await Promise.allSettled([
    attestAgent(agentId, walletAddress, opts),
    fetchWalletSnapshot(walletAddress, opts),
  ]);

  const snap = snapshot.status === "fulfilled" ? snapshot.value : null;
  const attest = attestation.status === "fulfilled" ? attestation.value : { verified: false };
  const tier = computeTier(snap?.clawdBalance ?? 0);

  return NextResponse.json({
    caapVersion: "1.0",
    agentId,
    walletAddress,
    attestation: attest,
    snapshot: snap,
    tier,
  });
}
