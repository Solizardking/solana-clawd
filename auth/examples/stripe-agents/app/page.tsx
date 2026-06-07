"use client";

import { useEffect, useState } from "react";
import { getSession, getSiwsChallenge, signOut } from "@/lib/auth-client";

interface Session {
  walletAddress: string;
  tier: string;
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getSession().then((s) => {
      setSession(s as Session | null);
      setLoading(false);
    });
  }, []);

  async function handleSignIn() {
    setStatus("Requesting SIWS challenge…");
    const challenge = await getSiwsChallenge();
    setStatus("Connect your Solana wallet → window.solana.signIn(challenge)");
    console.info("SIWS challenge:", challenge);
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-8 text-white">
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl font-bold tracking-tight">CLAWD Pay</span>
        <span className="text-sm text-zinc-400">
          Solana-native token payments · CAAP/1.0 · SIWS
        </span>
      </div>

      {session ? (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <span className="font-mono text-xs text-zinc-400">
              {session.walletAddress.slice(0, 8)}…{session.walletAddress.slice(-4)}
            </span>
            <TierBadge tier={session.tier} />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Capabilities
            </h2>
            <ul className="space-y-2">
              {[
                { cap: "pay.balance", req: "free", desc: "CLAWD + SOL balance" },
                { cap: "pay.swap", req: "bronze", desc: "Jupiter token swap" },
                { cap: "pay.transfer", req: "silver", desc: "Send SOL or CLAWD" },
                { cap: "pay.history", req: "free", desc: "On-chain tx history" },
              ].map(({ cap, req, desc }) => (
                <li key={cap} className="flex items-center justify-between text-sm">
                  <span>
                    <code className="text-xs text-violet-400">{cap}</code>
                    <span className="ml-2 text-xs text-zinc-500">{desc}</span>
                  </span>
                  <span className="text-xs text-zinc-700">{req}+</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg bg-zinc-800 py-2 text-sm hover:bg-zinc-700"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
          <p className="text-sm text-zinc-400">
            Sign in with your Solana wallet. No Stripe, no credit card.
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            className="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold hover:bg-violet-500"
          >
            Sign In With Solana
          </button>
          {status && <p className="max-w-xs text-center text-xs text-zinc-400">{status}</p>}
        </div>
      )}

      <p className="text-xs text-zinc-600">
        CAAP/1.0 · SIWS · $CLAWD tiers · No Stripe · No email
      </p>
    </main>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    free: "bg-zinc-700 text-zinc-300",
    bronze: "bg-amber-900 text-amber-300",
    silver: "bg-slate-700 text-slate-200",
    gold: "bg-yellow-900 text-yellow-300",
    diamond: "bg-cyan-900 text-cyan-300",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${colors[tier] ?? colors.free}`}
    >
      {tier}
    </span>
  );
}
