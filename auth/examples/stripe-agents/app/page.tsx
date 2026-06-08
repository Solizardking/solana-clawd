"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, useSession } from "@/lib/auth-client";
import { StripeAgentsLogo } from "@/components/icons";

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
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="rounded-lg border border-border bg-card shadow-md p-8">
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2.5 mb-3">
              <StripeAgentsLogo className="h-8 w-8" />
            </div>
            <h1 className="text-[18px] font-semibold text-foreground tracking-tight">
              {mode === "signin" ? "Sign in to Stripe Agents" : "Create your account"}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1.5">AI agents pay, you approve.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 text-[13px] outline-none text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 text-[13px] outline-none text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 text-[13px] outline-none text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
            {error && (
              <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-600 text-[12px]">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-[13px] font-semibold rounded-md bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 cursor-pointer transition-all shadow-sm"
            >
              {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-[12px] text-muted-foreground">
            {mode === "signin" ? "Don\u2019t have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-primary hover:text-primary/80 font-medium cursor-pointer"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
