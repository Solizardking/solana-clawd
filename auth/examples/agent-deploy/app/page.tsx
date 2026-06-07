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
    try {
      setStatus("Requesting SIWS challenge...");
      const challenge = await getSiwsChallenge();
      // Wire challenge to window.solana.signIn(challenge) or your wallet adapter
      setStatus("Challenge ready — connect wallet and call window.solana.signIn(challenge).");
      console.info("SIWS challenge:", challenge);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-purple-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-8 text-white">
      <div className="flex flex-col items-center gap-2">
        <span className="text-4xl font-bold tracking-tight">CLAWD Deploy</span>
        <span className="text-sm text-zinc-400">CAAP/1.0 · SIWS · No email/password</span>
      </div>

      {session ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
          <p className="text-sm text-zinc-300">
            Signed in as{" "}
            <span className="font-mono text-purple-400">
              {session.walletAddress.slice(0, 6)}…{session.walletAddress.slice(-4)}
            </span>
          </p>
          <TierBadge tier={session.tier} />
          <p className="max-w-sm text-center text-xs text-zinc-500">
            Hold $CLAWD to unlock higher deploy tiers and more site slots.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-2 rounded-lg bg-zinc-700 px-5 py-2 text-sm font-medium hover:bg-zinc-600"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
          <p className="text-sm text-zinc-400">Sign in with your Solana wallet to deploy sites.</p>
          <button
            type="button"
            onClick={handleSignIn}
            className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-semibold hover:bg-purple-500"
          >
            Sign In With Solana
          </button>
          {status && <p className="max-w-xs text-center text-xs text-zinc-400">{status}</p>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500 sm:grid-cols-4">
        {[
          { tier: "Free", clawd: "0", sites: "1" },
          { tier: "Bronze", clawd: "100K", sites: "5" },
          { tier: "Silver", clawd: "500K", sites: "20" },
          { tier: "Gold", clawd: "1M+", sites: "Unlimited" },
        ].map((t) => (
          <div key={t.tier} className="rounded-lg border border-zinc-800 p-3 text-center">
            <div className="font-medium text-zinc-300">{t.tier}</div>
            <div>{t.clawd} $CLAWD</div>
            <div>{t.sites} sites</div>
          </div>
        ))}
      </div>
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
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${colors[tier] ?? colors.free}`}
    >
      {tier}
    </span>
  );
}
