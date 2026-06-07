"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { signIn, signUp, useSession } from "@/lib/auth-client";
import { StripeAgentsLogo, StripeSIcon } from "@/components/icons";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CardInfo {
  id: string;
  last4: string;
  brand: string;
  isDefault: boolean;
}

function InlineAddCard({ onAdded }: { onAdded: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stripe/setup", { method: "POST" })
      .then((r) => r.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    setLoading(true);
    try {
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement)! },
      });
      if (result.error) return;
      const pmId = result.setupIntent?.payment_method;
      if (pmId) {
        const res = await fetch("/api/stripe/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId: pmId }),
        });
        if (res.ok) onAdded();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="p-3 rounded-md border border-border bg-white">
        <CardElement
          options={{
            style: {
              base: {
                color: "#1a1f36",
                fontSize: "14px",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                "::placeholder": { color: "#697386" },
              },
              invalid: { color: "#df1b41" },
            },
          }}
        />
      </div>
      <button
        type="submit"
        disabled={loading || !stripe || !clientSecret}
        className="w-full py-2 text-[13px] font-semibold rounded-md bg-foreground text-white hover:bg-foreground/90 disabled:opacity-50 cursor-pointer transition-all"
      >
        {loading ? "Adding..." : "Add Card"}
      </button>
    </form>
  );
}

function AgentAuthLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 justify-center ${className ?? ""}`}>
      <StripeAgentsLogo className="h-7 w-7" />
    </div>
  );
}

interface AgentInfo {
  agent: {
    id: string;
    name: string;
    status: string;
    mode: string;
    hostId: string;
    createdAt: string;
  };
  host: { id: string; name: string | null; status: string } | null;
  grants: Array<{
    id: string;
    capability: string;
    status: string;
    reason: string | null;
    constraints: Record<string, unknown> | null;
  }>;
  needsActivation?: boolean;
  claim?: {
    claimTarget: string;
    claimTargetName: string;
  };
}

function formatConstraintValue(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return String(value);
  }
  const ops = value as Record<string, unknown>;
  const parts: string[] = [];
  if (ops.eq !== undefined) parts.push(`${ops.eq}`);
  if (ops.in !== undefined && Array.isArray(ops.in)) {
    parts.push(`${ops.in.map(String).join(" | ")}`);
  }
  if (ops.not_in !== undefined && Array.isArray(ops.not_in)) {
    parts.push(`not ${ops.not_in.map(String).join(", ")}`);
  }
  if (ops.max !== undefined) parts.push(`\u2264 ${ops.max}`);
  if (ops.min !== undefined) parts.push(`\u2265 ${ops.min}`);
  return parts.join(", ") || JSON.stringify(value);
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
  const [actionState, setActionState] = useState<
    "idle" | "approving" | "confirming_deny" | "denying" | "done"
  >("idle");
  const [denyReason, setDenyReason] = useState("");
  const [result, setResult] = useState<{
    status: string;
    added?: string[];
    claimed?: boolean;
  } | null>(null);

  const [cards, setCards] = useState<CardInfo[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);

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
        const data = await res.json();
        setError(data.error || "Failed to load agent info");
        return;
      }
      setAgentInfo(await res.json());
    } catch {
      setError("Failed to load agent info");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/stripe/cards").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const allCards: CardInfo[] = data.cards ?? [];
      setCards(allCards);
      if (!selectedCardId && allCards.length > 0) {
        const def = allCards.find((c) => c.isDefault) ?? allCards[0];
        setSelectedCardId(def.id);
      }
    }
  }, [selectedCardId]);

  useEffect(() => {
    if (session && agentId) {
      fetchAgentInfo();
      fetchCards();
    } else if (!sessionPending && !session) {
      setLoading(false);
    }
  }, [session, sessionPending, agentId, fetchAgentInfo, fetchCards]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setSignInError("");
    setSigningIn(true);
    try {
      if (isSignUp) {
        const result = await signUp.email({ email, password, name });
        if (result.error) {
          setSignInError(result.error.message ?? "Failed to create account");
        }
      } else {
        const result = await signIn.email({ email, password });
        if (result.error) {
          setSignInError(result.error.message ?? "Invalid credentials");
        }
      }
    } catch {
      setSignInError("Something went wrong");
    } finally {
      setSigningIn(false);
    }
  }

  const handleAction = async (action: "approve" | "deny") => {
    if (action === "approve" && hasPay && cards.length === 0) {
      setError("Please add a card before approving a payment capability.");
      return;
    }
    setActionState(action === "approve" ? "approving" : "denying");
    try {
      const body: Record<string, unknown> = { agent_id: agentId, action };
      if (code) body.user_code = code;
      if (action === "deny" && denyReason.trim()) {
        body.reason = denyReason.trim();
      }
      const res = await fetch("/api/auth/agent/approve-capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const errorCode = data.error;
      const errorMessage = data.error_description || data.message || "Action failed";

      if (!res.ok || errorCode) {
        setError(errorMessage);
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
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-lg border border-border bg-card shadow-md p-6 space-y-5">
            <div className="text-center space-y-2.5">
              <AgentAuthLogo className="h-[14px] w-auto mx-auto" />
              <div className="space-y-1">
                <h1 className="text-[18px] font-semibold tracking-tight">Authorize Agent</h1>
                <p className="text-[13px] text-muted-foreground">
                  {isSignUp
                    ? "Create an account to review and approve this agent\u2019s request."
                    : "Sign in to review and approve this agent\u2019s request."}
                </p>
              </div>
            </div>

            {code && (
              <div className="p-3.5 rounded-md border border-border bg-muted/40 text-center">
                <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                  Verification Code
                </span>
                <p className="mt-1.5 text-[20px] font-mono font-bold tracking-[0.3em] text-foreground">
                  {code}
                </p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-3.5">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30 text-[13px] outline-none transition-all"
                    placeholder="Your name"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30 text-[13px] outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30 text-[13px] outline-none transition-all"
                  placeholder={isSignUp ? "Create a password" : "Your password"}
                />
              </div>

              {signInError && (
                <div className="px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-600 text-[13px]">
                  {signInError}
                </div>
              )}

              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-2 text-[13px] font-semibold rounded-md bg-primary text-primary-foreground hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer active:scale-[0.98] shadow-sm"
              >
                {signingIn
                  ? isSignUp
                    ? "Creating account..."
                    : "Signing in..."
                  : isSignUp
                    ? "Create Account & Review"
                    : "Sign In & Review"}
              </button>
            </form>

            <div className="text-center space-y-2">
              <p className="text-[12px] text-muted-foreground">
                {isSignUp ? "Already have an account?" : "Don\u2019t have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setSignInError("");
                  }}
                  className="text-primary hover:text-primary/80 font-medium underline underline-offset-2 transition-colors cursor-pointer"
                >
                  {isSignUp ? "Sign in" : "Create one"}
                </button>
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Confirm the code above matches what your AI agent is showing.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionPending || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mx-auto">
            <AgentAuthLogo className="h-[14px] w-auto opacity-40" />
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Missing Parameters
          </h1>
          <p className="text-[13px] text-muted-foreground">
            This page requires an agent_id parameter. Use the verification link provided by the
            agent.
          </p>
        </div>
      </div>
    );
  }

  if (error && !agentInfo) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center mx-auto">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Error</h1>
          <p className="text-[13px] text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (actionState === "done" && result) {
    const approved = result.status === "approved";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-5">
          <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
              approved ? "bg-emerald-50" : "bg-red-50"
            }`}
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
          <div className="space-y-1.5">
            <h1 className="text-[18px] font-semibold tracking-tight">
              {approved
                ? result.claimed
                  ? "Project Claimed"
                  : "Access Approved"
                : "Access Denied"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {approved
                ? result.claimed
                  ? `You now own the sites created by "${agentInfo?.claim?.claimTargetName ?? agentInfo?.agent.name}". You can close this tab.`
                  : `"${agentInfo?.agent.name}" has been granted access. You can close this tab.`
                : `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
            </p>
            {approved && !result.claimed && result.added && result.added.length > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1 font-mono">
                {result.added.length} capability
                {result.added.length !== 1 ? "ies" : ""} granted
              </p>
            )}
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 text-[13px] font-semibold rounded-md bg-primary text-primary-foreground hover:brightness-110 transition-all shadow-sm"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const isClaim = !!agentInfo?.claim;
  const pendingGrants = agentInfo?.grants.filter((g) => g.status === "pending") ?? [];
  const activeGrants = isClaim
    ? (agentInfo?.grants.filter((g) => g.status === "active") ?? [])
    : [];
  const displayGrants = isClaim ? activeGrants : pendingGrants;
  const needsActivation = agentInfo?.needsActivation ?? false;
  const hasPay =
    pendingGrants.some((g) => g.capability === "pay") ||
    activeGrants.some((g) => g.capability === "pay");

  if (displayGrants.length === 0 && !needsActivation) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mx-auto">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Already Resolved
          </h1>
          <p className="text-[13px] text-muted-foreground">
            This agent has no pending capability requests. It may have already been approved or
            denied.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-md my-auto">
        <div className="rounded-lg border border-border bg-card shadow-md overflow-hidden">
          <div className="text-center px-5 pt-5 pb-3 space-y-2.5">
            <AgentAuthLogo className="h-[14px] w-auto mx-auto" />
            <div className="space-y-1">
              <h1 className="text-[18px] font-semibold tracking-tight">
                {agentInfo?.claim ? "Claim Agent Project" : "Authorize Agent"}
              </h1>
              <p className="text-[13px] text-muted-foreground">
                {agentInfo?.claim
                  ? "An AI agent created this project. Approve to take ownership."
                  : "Review the capabilities this agent is requesting."}
              </p>
            </div>
          </div>

          {agentInfo?.claim && (
            <div className="mx-5 p-3.5 rounded-md border border-indigo-200 bg-indigo-50 space-y-1.5">
              <div className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-500 flex-shrink-0"
                >
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span className="text-[13px] font-medium text-indigo-700">
                  Agent &ldquo;{agentInfo.claim.claimTargetName}&rdquo; created this project
                </span>
              </div>
              <p className="text-[11px] text-indigo-600/70">
                When you approve, all sites and activity from this agent will be transferred to your
                account.
              </p>
            </div>
          )}

          {code && (
            <div className="mx-5 mt-3 p-3.5 rounded-md border border-border bg-muted/40 text-center">
              <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                Verification Code
              </span>
              <p className="mt-1.5 text-[20px] font-mono font-bold tracking-[0.3em] text-foreground">
                {code}
              </p>
            </div>
          )}

          <div className="mx-5 my-3 rounded-md border border-border overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center justify-between bg-muted/40">
              <div>
                <p className="text-[13px] font-medium">{agentInfo?.agent.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {agentInfo?.host?.name ?? "Unknown host"}
                  {" \u00b7 "}
                  {agentInfo?.agent.mode}
                </p>
              </div>
              <span
                className={`text-[10px] font-medium rounded-full px-2 py-px ${
                  isClaim
                    ? "text-indigo-700 bg-indigo-50 border border-indigo-200"
                    : "text-amber-700 bg-amber-50 border border-amber-200"
                }`}
              >
                {isClaim ? "Autonomous" : "Pending"}
              </span>
            </div>

            {displayGrants.length > 0 && (
              <div className="px-3.5 py-3 space-y-2.5 border-t border-border">
                <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                  {isClaim
                    ? `Active Capabilities (${displayGrants.length})`
                    : `Requested Capabilities (${displayGrants.length})`}
                </span>

                <div className="space-y-1.5">
                  {displayGrants.map((g) => {
                    const isPayment = g.capability === "pay" && g.constraints;
                    const constraints = g.constraints ?? {};
                    const amountRaw = constraints.amountCents as
                      | number
                      | { max?: number }
                      | undefined;
                    const amountCents = typeof amountRaw === "number" ? amountRaw : amountRaw?.max;
                    const currency = (constraints.currency as string | { eq?: string })
                      ? typeof constraints.currency === "string"
                        ? constraints.currency
                        : ((constraints.currency as { eq?: string })?.eq ?? "usd")
                      : "usd";
                    const merchantRaw = constraints.merchantName as
                      | string
                      | { eq?: string }
                      | undefined;
                    const merchant =
                      typeof merchantRaw === "string" ? merchantRaw : merchantRaw?.eq;

                    if (isPayment && amountCents) {
                      return (
                        <div key={g.id} className="rounded-xl overflow-hidden">
                          <div
                            className="relative p-4 text-white"
                            style={{
                              background:
                                "linear-gradient(135deg, #2a2a2e 0%, #1c1c1f 30%, #18181b 65%, #111113 100%)",
                            }}
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                                  Spend Limit
                                </p>
                                <p className="text-[28px] font-bold tracking-tight leading-none mt-1">
                                  ${(amountCents / 100).toFixed(2)}
                                </p>
                              </div>
                              <StripeSIcon className="h-5 w-5 text-white/30" />
                            </div>
                            <div className="flex gap-6">
                              {merchant && (
                                <div>
                                  <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                                    Merchant
                                  </p>
                                  <p className="text-[13px] font-medium text-white/90">
                                    {merchant}
                                  </p>
                                </div>
                              )}
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                                  Currency
                                </p>
                                <p className="text-[13px] font-medium text-white/90">
                                  {currency.toUpperCase()}
                                </p>
                              </div>
                            </div>
                          </div>
                          {g.reason && (
                            <div className="px-3.5 py-2.5 bg-muted/30 border-t border-border">
                              <p className="text-[11px] text-muted-foreground">{g.reason}</p>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={g.id}
                        className="p-2.5 rounded-md border border-border bg-muted/30 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <code className="text-[11px] font-mono font-medium">{g.capability}</code>
                        </div>
                        {g.reason && (
                          <p className="text-[11px] text-muted-foreground italic">
                            &ldquo;{g.reason}&rdquo;
                          </p>
                        )}
                        {g.constraints && Object.keys(g.constraints).length > 0 && (
                          <div className="space-y-1 pt-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground/70 tracking-wider uppercase">
                              Constraints
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(g.constraints).map(([field, value]) => (
                                <span
                                  key={field}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-mono rounded bg-muted border border-border px-1.5 py-px text-muted-foreground"
                                >
                                  <span className="text-muted-foreground/70">{field}:</span>{" "}
                                  {formatConstraintValue(value)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-3">
              <div className="px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-600 text-[13px]">
                {error}
              </div>
            </div>
          )}

          {hasPay && (
            <div className="px-5 py-3 border-t border-border space-y-2.5">
              <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                Payment Method
              </span>
              {cards.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={selectedCardId ?? ""}
                    onChange={(e) => setSelectedCardId(e.target.value)}
                    className="w-full text-[13px] font-medium rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 cursor-pointer capitalize transition-all"
                  >
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.brand} •••• {c.last4}
                        {c.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowAddCard(!showAddCard)}
                    className="text-[12px] text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors"
                  >
                    {showAddCard ? "Cancel" : "+ Use a different card"}
                  </button>
                  {showAddCard && (
                    <Elements stripe={stripePromise}>
                      <InlineAddCard
                        onAdded={() => {
                          fetchCards();
                          setShowAddCard(false);
                        }}
                      />
                    </Elements>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-[12px] text-amber-700">
                    Add a card to approve payment requests.
                  </div>
                  <Elements stripe={stripePromise}>
                    <InlineAddCard onAdded={fetchCards} />
                  </Elements>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-3.5 border-t border-border bg-muted/30">
            {actionState === "confirming_deny" ? (
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Reason for denying (optional)"
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-card border border-border placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30 text-[13px] outline-none transition-all"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setActionState("idle");
                      setDenyReason("");
                    }}
                    className="flex-1 py-2 text-[13px] font-medium rounded-md border border-border hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAction("deny")}
                    className="flex-1 py-2 text-[13px] font-medium rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    Confirm Deny
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setActionState("confirming_deny")}
                  disabled={actionState !== "idle"}
                  className="flex-1 py-2 text-[13px] font-medium rounded-md border border-border hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleAction("approve")}
                  disabled={actionState !== "idle" || (hasPay && cards.length === 0)}
                  className="flex-1 py-2 text-[13px] font-semibold rounded-md bg-primary text-primary-foreground hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer active:scale-[0.98] shadow-sm"
                >
                  {actionState === "approving" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Spinner /> {agentInfo?.claim ? "Claiming..." : "Approving..."}
                    </span>
                  ) : agentInfo?.claim ? (
                    "Approve & Claim"
                  ) : hasPay ? (
                    "Approve Payment Access"
                  ) : (
                    "Approve"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/70 mt-3 font-mono">
          Signed in as {session?.user.email}
        </p>
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
