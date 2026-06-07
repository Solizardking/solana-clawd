"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const AGENT_COLORS = [
  "#1a1f36",
  "#533afe",
  "#0A8754",
  "#DF1B41",
  "#00A0D2",
  "#F7B955",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#2563EB",
];

function AgentAvatar({ name }: { name: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
  return (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
      style={{ backgroundColor: color }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

interface ApprovalRequest {
  approval_id: string;
  method: string;
  agent_id: string | null;
  agent_name: string | null;
  binding_message: string | null;
  capabilities: string[];
  capability_constraints: Record<string, unknown> | null;
  capability_reasons: Record<string, string> | null;
  expires_in: number;
  created_at: string;
}

interface Payment {
  id: string;
  agentId: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  itemDescription: string;
  status: string;
  cardLast4: string | null;
  createdAt: string;
}

interface ConstraintOps {
  eq?: string | number | boolean;
  min?: number;
  max?: number;
  in?: (string | number)[];
}

type ConstraintValue = string | number | boolean | ConstraintOps;

function extractPayInfo(constraints: Record<string, unknown> | null): {
  amount: string | null;
  merchant: string | null;
  currency: string | null;
} | null {
  if (!constraints?.["pay"]) return null;
  const c = constraints["pay"] as Record<string, ConstraintValue>;
  return {
    amount: formatDollars("amountCents", c.amountCents),
    merchant: formatPlain(c.merchantName),
    currency: formatPlain(c.currency)?.toUpperCase() ?? null,
  };
}

function payHasRequiredConstraints(r: ApprovalRequest): boolean {
  if (!r.capabilities.includes("pay")) return true;
  if (!r.capability_constraints?.["pay"]) return false;
  const c = r.capability_constraints["pay"] as Record<string, unknown>;
  return "amountCents" in c && "currency" in c && "merchantName" in c;
}

function formatDollars(_field: string, value: ConstraintValue | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === "number") return `$${(value / 100).toFixed(2)}`;
  if (typeof value === "object" && value !== null) {
    const ops = value as ConstraintOps;
    if (ops.eq !== undefined && typeof ops.eq === "number") return `$${(ops.eq / 100).toFixed(2)}`;
    if (ops.max !== undefined) return `$${(ops.max / 100).toFixed(2)}`;
  }
  return null;
}

function formatPlain(value: ConstraintValue | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const ops = value as ConstraintOps;
    if (ops.eq !== undefined) return String(ops.eq);
    if (ops.in !== undefined) return ops.in.map(String).join(", ");
  }
  return String(value);
}

function PaymentCard({
  amount,
  merchant,
  currency,
  reason,
}: {
  amount: string | null;
  merchant: string | null;
  currency: string | null;
  reason: string | null;
}) {
  return (
    <div className="mx-5">
      <div
        className="relative overflow-hidden rounded-xl text-white shadow-md"
        style={{
          background: "linear-gradient(135deg, #2a2a2e 0%, #1c1c1f 30%, #18181b 65%, #111113 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(ellipse at 20% 100%, rgba(255,255,255,0.04) 0%, transparent 50%),
              radial-gradient(ellipse at 90% 10%, rgba(255,255,255,0.03) 0%, transparent 40%)`,
          }}
        />
        <div className="relative z-10">
          <div className="flex items-stretch">
            <div className="flex-1 p-4 pr-0">
              <div className="flex items-center gap-2.5 mb-3">
                <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
                  <rect
                    x="0.5"
                    y="0.5"
                    width="27"
                    height="21"
                    rx="2.5"
                    fill="url(#chipG)"
                    stroke="#c9a84c"
                    strokeWidth="0.75"
                  />
                  <line x1="0" y1="8" x2="28" y2="8" stroke="#c9a84c" strokeWidth="0.5" />
                  <line x1="0" y1="14" x2="28" y2="14" stroke="#c9a84c" strokeWidth="0.5" />
                  <line x1="9.5" y1="0" x2="9.5" y2="8" stroke="#c9a84c" strokeWidth="0.5" />
                  <line x1="18.5" y1="0" x2="18.5" y2="8" stroke="#c9a84c" strokeWidth="0.5" />
                  <line x1="9.5" y1="14" x2="9.5" y2="22" stroke="#c9a84c" strokeWidth="0.5" />
                  <line x1="18.5" y1="14" x2="18.5" y2="22" stroke="#c9a84c" strokeWidth="0.5" />
                  <defs>
                    <linearGradient id="chipG" x1="0" y1="0" x2="28" y2="22">
                      <stop stopColor="#e8d98e" />
                      <stop offset="0.5" stopColor="#d4b94e" />
                      <stop offset="1" stopColor="#c9a84c" />
                    </linearGradient>
                  </defs>
                </svg>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeOpacity="0.45"
                >
                  <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                  <path d="M12 19a8 8 0 0 0 0-14" />
                </svg>
              </div>
              <p className="text-[22px] font-bold tabular-nums leading-none tracking-tight">
                {amount ?? "—"}
              </p>
              <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/45 mt-1">
                Spend Limit
              </p>
            </div>
            <div className="flex flex-col justify-between p-4 pl-0 text-right min-w-[140px]">
              <svg className="self-end" width="22" height="22" viewBox="0 0 40 40" fill="none">
                <path
                  d="M18.724 16.014c0-1.079.886-1.494 2.354-1.494 2.106 0 4.762.638 6.868 1.776V10.33c-2.3-.914-4.578-1.278-6.868-1.278-5.618 0-9.356 2.934-9.356 7.834 0 7.642 10.522 6.424 10.522 9.722 0 1.278-1.112 1.692-2.666 1.692-2.306 0-5.258-.95-7.6-2.228v5.998c2.588 1.1 5.2 1.574 7.6 1.574 5.754 0 9.712-2.846 9.712-7.814-.022-8.252-10.566-6.784-10.566-9.816z"
                  fill="white"
                  fillOpacity="0.7"
                />
              </svg>
              <div className="space-y-1.5">
                <div>
                  <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-white/35">
                    Merchant
                  </p>
                  <p className="text-[12px] font-semibold">{merchant ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-white/35">
                    Currency
                  </p>
                  <p className="text-[12px] font-semibold">{currency ?? "USD"}</p>
                </div>
              </div>
            </div>
          </div>
          {reason && (
            <div className="px-4 pb-3.5 -mt-1">
              <div className="rounded-lg bg-white/[0.1] backdrop-blur-sm px-3 py-2">
                <p className="text-[11px] text-white/80 leading-relaxed">{reason}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CardInfo {
  id: string;
  last4: string;
  brand: string;
  isDefault: boolean;
}

export default function ApprovalsPage() {
  const [agentRequests, setAgentRequests] = useState<ApprovalRequest[]>([]);
  const [resolvedPayments, setResolvedPayments] = useState<Payment[]>([]);
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [approvalRes, paymentRes, cardsRes] = await Promise.all([
      fetch("/api/auth/agent/ciba/pending")
        .then((r) => r.json())
        .catch(() => ({ requests: [] })),
      fetch("/api/payments")
        .then((r) => r.json())
        .catch(() => ({ payments: [] })),
      fetch("/api/stripe/cards")
        .then((r) => r.json())
        .catch(() => ({ cards: [] })),
    ]);
    setAgentRequests(approvalRes.requests ?? []);
    setResolvedPayments((paymentRes.payments ?? []).filter((p: Payment) => p.status !== "pending"));
    const allCards = cardsRes.cards ?? [];
    setCards(allCards);
    if (!selectedCardId && allCards.length > 0) {
      const defaultCard = allCards.find((c: CardInfo) => c.isDefault) ?? allCards[0];
      setSelectedCardId(defaultCard.id);
    }
    setLoading(false);
  }, [selectedCardId]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const hasCards = cards.length > 0;

  async function handleApprove(_agentId: string, approvalId: string, requestHasPay: boolean) {
    if (requestHasPay && !hasCards) {
      toast.error("Add a card in Wallet before approving payment access");
      return;
    }
    const res = await fetch("/api/auth/agent/approve-capability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_id: approvalId, action: "approve" }),
    });
    if (res.ok) {
      toast.success("Approved");
      fetchAll();
    } else {
      const d = await res.json();
      toast.error(d.message ?? d.error_description ?? "Failed");
    }
  }

  async function handleDeny(_agentId: string, approvalId: string) {
    const res = await fetch("/api/auth/agent/approve-capability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_id: approvalId, action: "deny", reason: "Denied by user" }),
    });
    if (res.ok) {
      toast.success("Denied");
      fetchAll();
    } else toast.error("Failed to deny");
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[800px] mx-auto px-8 py-8">
        <h1 className="text-[20px] font-semibold text-foreground mb-1">Approvals</h1>
        <p className="text-[13px] text-muted-foreground mb-6">
          Nothing happens without your explicit approval.
        </p>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl border border-border bg-white animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <h2 className="text-[14px] font-semibold text-foreground mb-3 flex items-center gap-2">
              Pending
              {agentRequests.length > 0 && (
                <span className="h-5 min-w-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center">
                  {agentRequests.length}
                </span>
              )}
            </h2>

            {agentRequests.length === 0 ? (
              <div className="rounded-xl border border-border border-dashed bg-white py-10 text-center mb-8">
                <p className="text-[13px] text-muted-foreground">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-3 mb-8">
                {agentRequests.map((r) => {
                  const payInfo = extractPayInfo(r.capability_constraints);
                  const hasPayCap = r.capabilities.includes("pay");
                  const missingConstraints = !payHasRequiredConstraints(r);
                  const otherCaps = r.capabilities.filter((c) => c !== "pay");

                  if (hasPayCap && payInfo) {
                    return (
                      <div
                        key={r.approval_id}
                        className="rounded-xl border border-border bg-white overflow-hidden"
                      >
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                          <AgentAvatar name={r.agent_name ?? "Agent"} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-foreground truncate">
                              {r.agent_name ?? "Agent"}
                            </p>
                            {r.binding_message && (
                              <p className="text-[12px] text-muted-foreground truncate">
                                &ldquo;{r.binding_message}&rdquo;
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                            {r.expires_in > 0 ? `${Math.floor(r.expires_in / 60)}m` : "expired"}
                          </span>
                        </div>

                        <div className="py-4">
                          <PaymentCard
                            amount={payInfo.amount}
                            merchant={payInfo.merchant}
                            currency={payInfo.currency}
                            reason={
                              r.capability_reasons &&
                              Object.values(r.capability_reasons).some(Boolean)
                                ? Object.values(r.capability_reasons).filter(Boolean).join(" — ")
                                : null
                            }
                          />
                        </div>

                        {otherCaps.length > 0 && (
                          <div className="mx-5 mb-4">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-1.5">
                              Also requesting
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {otherCaps.map((cap) => (
                                <span
                                  key={cap}
                                  className="text-[11px] font-mono rounded-md bg-muted border border-border px-2 py-0.5 text-muted-foreground"
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {missingConstraints && (
                          <div className="mx-5 mb-4 p-3 rounded-lg border border-red-200 bg-red-50">
                            <p className="text-[12px] text-red-700 font-semibold">
                              Missing required constraints
                            </p>
                            <p className="text-[11px] text-red-600/70 mt-0.5">
                              This agent requested &quot;pay&quot; without specifying amountCents,
                              currency, or merchantName constraints. Deny this request — the agent
                              must re-register with scoped constraints.
                            </p>
                          </div>
                        )}

                        {hasPayCap && (
                          <div className="px-5 py-2.5 border-t border-border">
                            {hasCards ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground shrink-0">
                                  Pay with
                                </span>
                                <select
                                  value={selectedCardId ?? ""}
                                  onChange={(e) => setSelectedCardId(e.target.value)}
                                  className="flex-1 text-[12px] font-medium rounded-lg border border-border bg-white px-2.5 py-1.5 text-foreground outline-none focus:border-primary cursor-pointer capitalize"
                                >
                                  {cards.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.brand} •••• {c.last4}
                                      {c.isDefault ? " (default)" : ""}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <a
                                href="/dashboard/wallet"
                                className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                                Add a card to approve payments
                              </a>
                            )}
                          </div>
                        )}

                        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/30">
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                            {r.agent_id}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeny(r.agent_id!, r.approval_id)}
                              className="px-4 py-1.5 text-[12px] font-medium rounded-lg border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                            >
                              Deny
                            </button>
                            <button
                              onClick={() => handleApprove(r.agent_id!, r.approval_id, hasPayCap)}
                              disabled={missingConstraints || (hasPayCap && !hasCards)}
                              className="px-4 py-1.5 text-[12px] font-semibold rounded-lg bg-foreground text-white hover:bg-foreground/90 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={r.approval_id}
                      className="rounded-xl border border-border bg-white overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                        <AgentAvatar name={r.agent_name ?? "Agent"} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-foreground truncate">
                            {r.agent_name ?? "Unknown Agent"}
                          </p>
                          {r.binding_message && (
                            <p className="text-[12px] text-muted-foreground truncate">
                              &ldquo;{r.binding_message}&rdquo;
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {r.expires_in > 0 ? `${Math.floor(r.expires_in / 60)}m` : "expired"}
                        </span>
                      </div>

                      <div className="px-5 py-4 space-y-3">
                        {r.capability_reasons &&
                          Object.values(r.capability_reasons).some(Boolean) && (
                            <div className="p-3 rounded-lg bg-muted/50 border border-border">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-semibold mb-0.5">
                                Reason
                              </p>
                              <p className="text-[13px] text-foreground leading-relaxed">
                                {Object.values(r.capability_reasons).filter(Boolean).join(" — ")}
                              </p>
                            </div>
                          )}

                        {r.capabilities.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-1.5">
                              Requested Capabilities
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.capabilities.map((cap) => (
                                <span
                                  key={cap}
                                  className="text-[11px] font-mono rounded-md bg-muted border border-border px-2 py-0.5 text-muted-foreground"
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {missingConstraints && (
                          <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                            <p className="text-[12px] text-red-700 font-semibold">
                              Missing required constraints
                            </p>
                            <p className="text-[11px] text-red-600/70 mt-0.5">
                              Agent requested &quot;pay&quot; without amountCents, currency, or
                              merchantName. Deny and ask it to re-register with constraints.
                            </p>
                          </div>
                        )}
                      </div>

                      {hasPayCap && (
                        <div className="px-5 py-2.5 border-t border-border">
                          {hasCards ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                Pay with
                              </span>
                              <select
                                value={selectedCardId ?? ""}
                                onChange={(e) => setSelectedCardId(e.target.value)}
                                className="flex-1 text-[12px] font-medium rounded-lg border border-border bg-white px-2.5 py-1.5 text-foreground outline-none focus:border-primary cursor-pointer capitalize"
                              >
                                {cards.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.brand} •••• {c.last4}
                                    {c.isDefault ? " (default)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <a
                              href="/dashboard/wallet"
                              className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              Add a card to approve payments
                            </a>
                          )}
                        </div>
                      )}

                      <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/30">
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                          {r.agent_id ?? r.approval_id}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeny(r.agent_id!, r.approval_id)}
                            className="px-4 py-1.5 text-[12px] font-medium rounded-lg border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all cursor-pointer"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => handleApprove(r.agent_id!, r.approval_id, hasPayCap)}
                            disabled={missingConstraints || (hasPayCap && !hasCards)}
                            className="px-4 py-1.5 text-[12px] font-semibold rounded-lg bg-foreground text-white hover:bg-foreground/90 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <h2 className="text-[14px] font-semibold text-foreground mb-3">History</h2>
            {resolvedPayments.length === 0 ? (
              <div className="rounded-xl border border-border border-dashed bg-white py-8 text-center">
                <p className="text-[13px] text-muted-foreground">No completed payments yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-white overflow-hidden">
                {resolvedPayments.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 px-5 py-3.5 ${
                      idx > 0 ? "border-t border-border" : ""
                    } hover:bg-muted/30 transition-colors`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-foreground">
                        {p.merchantName}
                      </span>
                      <span className="text-[12px] text-muted-foreground ml-2">
                        {p.itemDescription}
                      </span>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">
                      ${(p.amountCents / 100).toFixed(2)}
                    </span>
                    {p.cardLast4 && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        •••• {p.cardLast4}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                        p.status === "approved" || p.status === "completed"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {p.status === "approved" || p.status === "completed" ? "Complete" : "Denied"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
