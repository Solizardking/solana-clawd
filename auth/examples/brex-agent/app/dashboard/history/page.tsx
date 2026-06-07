"use client";

import { useState, useEffect } from "react";
import { AgentIcon } from "@/components/icons";

interface Payment {
  id: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  itemDescription: string;
  status: string;
  brexCardLast4: string | null;
  createdAt: string;
}

export default function HistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => setPayments(data.payments ?? []))
      .finally(() => setLoading(false));
  }, []);

  const totalSpent = payments
    .filter((p) => p.status === "approved" || p.status === "completed")
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="px-8 py-8 max-w-[1000px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold">History</h1>
          <p className="mt-0.5 text-[13px] text-white/40">
            {loading
              ? "Loading..."
              : `${payments.length} payments — $${(totalSpent / 100).toFixed(2)} total`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-lg border border-white/[0.08] bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] border-dashed py-16 text-center">
          <p className="text-[13px] text-white/30">No payment history yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.08] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="text-[11px] text-white/30 font-medium">Transaction</span>
            <span className="text-[11px] text-white/30 font-medium">Amount</span>
            <span className="text-[11px] text-white/30 font-medium">Card</span>
            <span className="text-[11px] text-white/30 font-medium">Status</span>
            <span className="text-[11px] text-white/30 font-medium">Date</span>
          </div>
          {payments.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b last:border-0 border-white/[0.06] hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 ${
                    p.status === "approved" || p.status === "completed"
                      ? "bg-emerald-500/15"
                      : p.status === "pending"
                        ? "bg-amber-500/15"
                        : "bg-red-500/15"
                  }`}
                >
                  <AgentIcon
                    className={`h-3.5 w-3.5 ${
                      p.status === "approved" || p.status === "completed"
                        ? "text-emerald-400"
                        : p.status === "pending"
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{p.merchantName}</p>
                  <p className="text-[11px] text-white/25 truncate">{p.itemDescription}</p>
                </div>
              </div>
              <span className="text-[13px] font-medium tabular-nums self-center">
                ${(p.amountCents / 100).toFixed(2)}
              </span>
              <span className="text-[11px] text-white/25 font-mono self-center">
                {p.brexCardLast4 ? `•••• ${p.brexCardLast4}` : "—"}
              </span>
              <span
                className={`text-[11px] font-medium self-center ${
                  p.status === "approved" || p.status === "completed"
                    ? "text-emerald-400"
                    : p.status === "pending"
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {p.status === "approved" || p.status === "completed"
                  ? "Complete"
                  : p.status === "pending"
                    ? "Pending"
                    : "Denied"}
              </span>
              <span className="text-[12px] text-white/20 tabular-nums self-center">
                {new Date(p.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
