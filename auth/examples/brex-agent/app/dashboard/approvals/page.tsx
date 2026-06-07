"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AgentIcon, BrexLogo } from "@/components/icons";

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
  brexCardLast4: string | null;
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
  if (!constraints?.["brex.pay"]) return null;
  const c = constraints["brex.pay"] as Record<string, ConstraintValue>;
  return {
    amount: formatDollars("amountCents", c.amountCents),
    merchant: formatPlain(c.merchantName),
    currency: formatPlain(c.currency)?.toUpperCase() ?? null,
  };
}

function formatDollars(field: string, value: ConstraintValue | undefined): string | null {
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

export default function ApprovalsPage() {
  const [agentRequests, setAgentRequests] = useState<ApprovalRequest[]>([]);
  const [resolvedPayments, setResolvedPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [approvalRes, paymentRes] = await Promise.all([
      fetch("/api/auth/agent/ciba/pending")
        .then((r) => r.json())
        .catch(() => ({ requests: [] })),
      fetch("/api/payments")
        .then((r) => r.json())
        .catch(() => ({ payments: [] })),
    ]);
    setAgentRequests(approvalRes.requests ?? []);
    setResolvedPayments((paymentRes.payments ?? []).filter((p: Payment) => p.status !== "pending"));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  async function handleApprove(_agentId: string, approvalId: string) {
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
    <div className="px-8 py-8 max-w-[1000px]">
      <h1 className="text-[22px] font-semibold mb-1">Approvals</h1>
      <p className="text-[13px] text-white/40 mb-6">
        Nothing happens without your explicit approval.
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border border-white/[0.08] bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <h2 className="text-[14px] font-semibold mb-3 flex items-center gap-2">
            Pending
            {agentRequests.length > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-semibold flex items-center justify-center">
                {agentRequests.length}
              </span>
            )}
          </h2>

          {agentRequests.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] border-dashed py-10 text-center mb-8">
              <p className="text-[13px] text-white/30">No pending requests</p>
            </div>
          ) : (
            <div className="space-y-3 mb-8">
              {agentRequests.map((r) => {
                const payInfo = extractPayInfo(r.capability_constraints);
                const hasPayCap = r.capabilities.includes("brex.pay");
                const otherCaps = r.capabilities.filter((c) => c !== "brex.pay");

                if (hasPayCap && payInfo) {
                  return (
                    <div
                      key={r.approval_id}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.03] overflow-hidden"
                    >
                      {/* Payment header */}
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-500/15 shrink-0 mt-0.5">
                              <AgentIcon className="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                              <p className="text-[15px] font-semibold">
                                {r.agent_name ?? "Agent"} wants to pay
                              </p>
                              {r.binding_message && (
                                <p className="text-[13px] text-white/40 mt-0.5">
                                  {r.binding_message}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] text-white/20 tabular-nums">
                            {r.expires_in > 0 ? `${Math.floor(r.expires_in / 60)}m` : "expired"}
                          </span>
                        </div>
                      </div>

                      {/* Payment details */}
                      <div className="mx-5 mb-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium">
                              Amount
                            </p>
                            <p className="text-[32px] font-semibold tabular-nums leading-tight mt-0.5">
                              {payInfo.amount ?? "—"}
                            </p>
                          </div>
                          <BrexLogo className="h-[14px] w-auto text-white/15" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium">
                              Merchant
                            </p>
                            <p className="text-[14px] font-medium mt-0.5">
                              {payInfo.merchant ?? "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium">
                              Currency
                            </p>
                            <p className="text-[14px] font-medium mt-0.5">
                              {payInfo.currency ?? "USD"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Other capabilities if any */}
                      {otherCaps.length > 0 && (
                        <div className="mx-5 mb-4">
                          <p className="text-[10px] font-medium text-white/25 uppercase tracking-wider mb-1.5">
                            Also requesting
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {otherCaps.map((cap) => (
                              <span
                                key={cap}
                                className="text-[11px] font-mono rounded bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-white/50"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                        <span className="text-[11px] text-white/15 font-mono">{r.agent_id}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeny(r.agent_id!, r.approval_id)}
                            className="px-4 py-2 text-[12px] font-medium rounded-md border border-white/[0.1] text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => handleApprove(r.agent_id!, r.approval_id)}
                            className="px-4 py-2 text-[12px] font-medium rounded-md bg-emerald-500 text-white hover:bg-emerald-400 transition-all active:scale-[0.98] cursor-pointer"
                          >
                            Approve Payment Access
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Generic capability request (no brex.pay)
                return (
                  <div
                    key={r.approval_id}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-2.5">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500/15 shrink-0 mt-0.5">
                          <AgentIcon className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold">
                            {r.agent_name ?? "Unknown Agent"}
                          </p>
                          {r.binding_message && (
                            <p className="text-[13px] text-white/40 mt-0.5 italic">
                              &ldquo;{r.binding_message}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-white/25 tabular-nums">
                        {r.expires_in > 0 ? `${Math.floor(r.expires_in / 60)}m` : "expired"}
                      </span>
                    </div>

                    {r.capabilities.length > 0 && (
                      <div className="mb-3 ml-[42px]">
                        <p className="text-[10px] font-medium text-white/25 uppercase tracking-wider mb-1.5">
                          Requested Capabilities
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {r.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="text-[11px] font-mono rounded bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-white/60"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between ml-[42px]">
                      <span className="text-[11px] text-white/20 font-mono">
                        {r.agent_id ?? r.approval_id}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeny(r.agent_id!, r.approval_id)}
                          className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-white/[0.1] text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
                        >
                          Deny
                        </button>
                        <button
                          onClick={() => handleApprove(r.agent_id!, r.approval_id)}
                          className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-white text-black hover:bg-white/90 transition-all active:scale-[0.98] cursor-pointer"
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

          {/* Resolved */}
          <h2 className="text-[14px] font-semibold mb-3">History</h2>
          {resolvedPayments.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] border-dashed py-8 text-center">
              <p className="text-[13px] text-white/30">No completed payments yet</p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.08] overflow-hidden">
              {resolvedPayments.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-4 px-4 py-3 ${idx > 0 ? "border-t border-white/[0.06]" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium">{p.merchantName}</span>
                    <span className="text-[12px] text-white/25 ml-2">{p.itemDescription}</span>
                  </div>
                  <span className="text-[13px] font-medium tabular-nums">
                    ${(p.amountCents / 100).toFixed(2)}
                  </span>
                  {p.brexCardLast4 && (
                    <span className="text-[11px] text-white/20 font-mono">
                      •••• {p.brexCardLast4}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-medium ${p.status === "approved" || p.status === "completed" ? "text-emerald-400" : "text-red-400"}`}
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
  );
}
