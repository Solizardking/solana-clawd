"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, useSession } from "@/lib/auth-client";
import { useEffect } from "react";
import { BrexLogo } from "@/components/icons";

export default function AuthPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session && !isPending) {
      router.push("/dashboard");
    }
  }, [session, isPending, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        const res = await signUp.email({ email, password, name });
        if (res.error) {
          setError(res.error.message ?? "Sign up failed");
          return;
        }
      } else {
        const res = await signIn.email({ email, password });
        if (res.error) {
          setError(res.error.message ?? "Sign in failed");
          return;
        }
      }
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (isPending) return null;

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <BrexLogo className="h-[22px] w-auto" />
            <span className="text-[11px] font-medium text-foreground/40 border border-border rounded px-1.5 py-0.5">
              Agent
            </span>
          </div>
          <p className="text-[13px] text-foreground/45 mt-3">
            AI agents pay with your Brex card. You approve every transaction.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              required
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={8}
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
          />

          {error && <p className="text-[12px] text-red-500 px-1">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 active:scale-[0.99] cursor-pointer"
          >
            {loading ? "..." : mode === "signin" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-foreground/40">
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-foreground/60 hover:text-foreground underline cursor-pointer"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
