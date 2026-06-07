"use client";

import type { SolanaSignInInput } from "@clawd/agent-auth-solana";

export async function getSiwsChallenge(): Promise<SolanaSignInInput> {
  const res = await fetch("/api/auth/siws");
  if (!res.ok) throw new Error("Failed to get SIWS challenge");
  return res.json();
}

export async function signInWithSolana(
  input: SolanaSignInInput,
  output: {
    account: { publicKey: Uint8Array | number[] };
    signature: Uint8Array | number[];
    signedMessage: Uint8Array | number[];
  },
) {
  const res = await fetch("/api/auth/siws", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, output }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Sign in failed");
  }
  return res.json() as Promise<{ tier: string; walletAddress: string }>;
}

export async function signOut() {
  await fetch("/api/auth/signout", { method: "POST" });
}

export async function getSession() {
  const res = await fetch("/api/auth/session");
  if (!res.ok) return null;
  return res.json() as Promise<{ walletAddress: string; tier: string } | null>;
}
