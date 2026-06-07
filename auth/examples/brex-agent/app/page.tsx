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
    setStatus("Connect your Solana wallet → call window.solana.signIn(challenge)");
    console.info("SIWS challenge:", challenge);
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-8 text-white">
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl font-bold tracking-tight">CLAWD Perps</span>
        <span className="text-sm text-zinc-400">Phoenix DEX perpetuals — CAAP/1.0 · SIWS</span>
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
            <ul className="space-y-2 text-sm">
              {[
                { cap: "perps.markets", req: "free", desc: "List markets + funding rates" },
                { cap: "perps.position", req: "bronze", desc: "View open positions" },
                { cap: "perps.open", req: "silver", desc: "Open long / short" },
                { cap: "perps.close", req: "silver", desc: "Close position" },
                { cap: "perps.history", req: "free", desc: "Trade history" },
              ].map(({ cap, req, desc }) => (
                <li key={cap} className="flex items-center justify-between">
                  <span>
                    <code className="text-xs text-blue-400">{cap}</code>
                    <span className="ml-2 text-xs text-zinc-500">{desc}</span>
                  </span>
                  <span className="text-xs text-zinc-600">{req}+</span>
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
            Sign in with Solana to trade Phoenix DEX perpetuals.
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold hover:bg-blue-500"
          >
            Sign In With Solana
          </button>
          {status && <p className="max-w-xs text-center text-xs text-zinc-400">{status}</p>}
        </div>
      )}

      <p className="text-xs text-zinc-600">Auth: CAAP/1.0 · SIWS · $CLAWD tiers · No Brex · No Stripe</p>
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
