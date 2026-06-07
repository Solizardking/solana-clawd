"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, useSession } from "@/lib/auth-client";

export default function SignInPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session && !isPending) router.push("/dashboard");
  }, [session, isPending, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res =
        mode === "signup"
          ? await signUp.email({ email, password, name })
          : await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Failed");
        return;
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
          <span className="text-2xl">☕</span>
          <h1 className="text-[17px] font-semibold tracking-tight mt-2">Agent Coffee Shop</h1>
          <p className="text-[13px] text-foreground/45 mt-1">
            Sign in to track your orders and manage agents.
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
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-border placeholder:text-foreground/25 text-[13px] outline-none focus:border-foreground/20"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border placeholder:text-foreground/25 text-[13px] outline-none focus:border-foreground/20"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={8}
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border placeholder:text-foreground/25 text-[13px] outline-none focus:border-foreground/20"
          />
          {error && <p className="text-[12px] text-red-500 px-1">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "..." : mode === "signin" ? "Sign In" : "Sign Up"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] text-foreground/40">
          {mode === "signin" ? "No account?" : "Already have one?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="underline cursor-pointer"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
