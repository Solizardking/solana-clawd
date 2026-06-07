"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";

const { useSession, signIn, signUp } = createAuthClient({});

interface AgentInfo {
  agent: { id: string; name: string; status: string; mode: string };
  host: { id: string; name: string | null; status: string } | null;
  grants: Array<{
    id: string;
    capability: string;
    status: string;
    reason: string | null;
    constraints: Record<string, unknown> | null;
  }>;
  needsActivation?: boolean;
}

function Spinner() {
  return (
    <div className="h-4 w-4 rounded-full border-2 border-foreground/10 border-t-foreground/60 animate-spin" />
  );
}

function DeviceCapabilitiesContent() {
  const params = useSearchParams();
  const agentId = params.get("agent_id");
  const code = params.get("code") ?? params.get("user_code") ?? "";

  const { data: session, isPending: sessionPending } = useSession();
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<"idle" | "approving" | "denying" | "done">("idle");
  const [result, setResult] = useState<{ status: string } | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const fetchAgentInfo = useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await fetch(`/api/device/info?agent_id=${agentId}`);
      if (!res.ok) {
        setError((await res.json()).error || "Failed to load agent info");
        return;
      }
      setAgentInfo(await res.json());
    } catch {
      setError("Failed to load agent info");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (session && agentId) fetchAgentInfo();
    else if (!sessionPending && !session) setLoading(false);
  }, [session, sessionPending, agentId, fetchAgentInfo]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setSignInError("");
    setSigningIn(true);
    try {
      const res = isSignUp
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password });
      if (res.error) setSignInError(res.error.message ?? "Auth failed");
    } catch {
      setSignInError("Something went wrong");
    } finally {
      setSigningIn(false);
    }
  }

  const handleAction = async (action: "approve" | "deny") => {
    setActionState(action === "approve" ? "approving" : "denying");
    try {
      const body: Record<string, unknown> = { agent_id: agentId, action };
      if (code) body.user_code = code;
      const res = await fetch("/api/auth/agent/approve-capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error_description || data.message || "Action failed");
        setActionState("idle");
        return;
      }
      setResult(data);
      setActionState("done");
    } catch {
      setError("Failed to process action");
      setActionState("idle");
    }
  };

  if (!sessionPending && !session) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card shadow-md p-6 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-[18px] font-semibold tracking-tight">Agent Coffee Shop</h1>
            <p className="text-[13px] text-foreground/40">
              {isSignUp
                ? "Create an account to approve this agent."
                : "Sign in to approve this agent."}
            </p>
          </div>
          {code && (
            <div className="p-3 rounded-md border border-border bg-foreground/[0.02] text-center">
              <span className="text-[9px] font-semibold text-foreground/35 tracking-wider uppercase">
                Code
              </span>
              <p className="mt-1 text-[20px] font-mono font-bold tracking-[0.3em]">{code}</p>
            </div>
          )}
          <form onSubmit={handleAuth} className="space-y-3">
            {isSignUp && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Name"
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-[13px] outline-none"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Email"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-[13px] outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Password"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-[13px] outline-none"
            />
            {signInError && <p className="text-[12px] text-red-500">{signInError}</p>}
            <button
              type="submit"
              disabled={signingIn}
              className="w-full py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {signingIn ? "..." : isSignUp ? "Create Account & Review" : "Sign In & Review"}
            </button>
          </form>
          <p className="text-center text-[12px] text-foreground/40">
            {isSignUp ? "Already have an account?" : "No account?"}{" "}
            <button onClick={() => setIsSignUp(!isSignUp)} className="underline cursor-pointer">
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (sessionPending || loading)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Spinner />
      </div>
    );
  if (!agentId)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-[13px] text-foreground/40">Missing agent_id parameter</p>
      </div>
    );
  if (error && !agentInfo)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-[13px] text-red-500">{error}</p>
      </div>
    );

  if (actionState === "done" && result) {
    const approved = result.status === "approved";
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center space-y-3">
          <div
            className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center ${approved ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}
          >
            {approved ? (
              <svg
                className="h-5 w-5 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className="text-[18px] font-semibold">
            {approved ? "Access Approved" : "Access Denied"}
          </h1>
          <p className="text-[13px] text-foreground/40">You can close this tab.</p>
        </div>
      </div>
    );
  }

  const pendingGrants = agentInfo?.grants.filter((g) => g.status === "pending") ?? [];

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-md overflow-hidden">
        <div className="text-center px-5 pt-5 pb-3">
          <h1 className="text-[18px] font-semibold tracking-tight">Authorize Agent</h1>
          <p className="text-[13px] text-foreground/40 mt-1">
            Review the capabilities this agent is requesting.
          </p>
        </div>
        {code && (
          <div className="mx-5 p-3 rounded-md border border-border bg-foreground/[0.02] text-center">
            <span className="text-[9px] font-semibold text-foreground/35 tracking-wider uppercase">
              Code
            </span>
            <p className="mt-1 text-[20px] font-mono font-bold tracking-[0.3em]">{code}</p>
          </div>
        )}
        <div className="mx-5 my-3 rounded-md border border-border overflow-hidden">
          <div className="px-3.5 py-2.5 bg-foreground/[0.02]">
            <p className="text-[13px] font-medium">{agentInfo?.agent.name}</p>
            <p className="text-[11px] text-foreground/35 font-mono mt-0.5">
              {agentInfo?.agent.mode}
            </p>
          </div>
          {pendingGrants.length > 0 && (
            <div className="px-3.5 py-3 space-y-1.5 border-t border-border">
              <span className="text-[9px] font-semibold text-foreground/35 tracking-wider uppercase">
                Requested ({pendingGrants.length})
              </span>
              {pendingGrants.map((g) => (
                <div
                  key={g.id}
                  className="p-2 rounded-md border border-border bg-foreground/[0.02]"
                >
                  <code className="text-[11px] font-mono font-medium">{g.capability}</code>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-500 text-[13px]">
            {error}
          </div>
        )}
        <div className="px-5 py-3.5 border-t border-border bg-foreground/[0.02] flex gap-1.5">
          <button
            onClick={() => handleAction("deny")}
            disabled={actionState !== "idle"}
            className="flex-1 py-2 text-[13px] font-medium rounded-md border border-border hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-50 cursor-pointer"
          >
            Deny
          </button>
          <button
            onClick={() => handleAction("approve")}
            disabled={actionState !== "idle"}
            className="flex-1 py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {actionState === "approving" ? (
              <span className="flex items-center justify-center gap-1.5">
                <Spinner /> Approving...
              </span>
            ) : (
              "Approve"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeviceCapabilitiesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <DeviceCapabilitiesContent />
    </Suspense>
  );
}
