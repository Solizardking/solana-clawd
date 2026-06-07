"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BrexLogo, AgentIcon } from "@/components/icons";
import { useSession } from "@/lib/auth-client";

interface Payment {
  id: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  itemDescription: string;
  status: string;
  createdAt: string;
}

interface Card {
  id: string;
  last4: string;
  cardName: string;
  cardType: string;
  isDefault: boolean;
}

export default function DashboardOverview() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/payments").then((r) => r.json()),
      fetch("/api/payments?filter=pending").then((r) => r.json()),
      fetch("/api/brex/cards").then((r) => r.json()),
    ])
      .then(([all, pending, cardsData]) => {
        setPayments(all.payments ?? []);
        setPendingCount(pending.payments?.length ?? 0);
        setCards(cardsData.cards ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSpent = payments
    .filter((p) => p.status === "approved" || p.status === "completed")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const approvedCount = payments.filter(
    (p) => p.status === "approved" || p.status === "completed",
  ).length;

  const defaultCard = cards.find((c) => c.isDefault) ?? cards[0];

  return (
    <div className="px-8 py-8 max-w-[1000px]">
      <h1 className="text-[22px] font-semibold mb-1">
        Welcome{session?.user.name ? `, ${session.user.name}` : ""}
      </h1>
      <p className="text-[13px] text-white/40 mb-6">Manage agent payments and approvals</p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 h-28 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link
              href="/dashboard/approvals"
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 hover:border-white/[0.15] transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] text-white/40 font-medium">Pending Approvals</p>
                {pendingCount > 0 && (
                  <span className="h-5 min-w-5 px-1.5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-semibold flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </div>
              <p className="text-[28px] font-semibold tabular-nums">{pendingCount}</p>
              {pendingCount > 0 && (
                <p className="text-[12px] text-amber-400 mt-1">Requires your attention</p>
              )}
            </Link>

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="text-[12px] text-white/40 font-medium mb-3">Total Spent</p>
              <p className="text-[28px] font-semibold tabular-nums">
                ${(totalSpent / 100).toFixed(2)}
              </p>
              <p className="text-[12px] text-white/30 mt-1">
                {approvedCount} transaction{approvedCount !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] text-white/40 font-medium">Payment Card</p>
                <BrexLogo className="h-[10px] w-auto text-white/20" />
              </div>
              {defaultCard ? (
                <>
                  <p className="text-[20px] font-semibold font-mono">•••• {defaultCard.last4}</p>
                  <p className="text-[12px] text-white/30 mt-1">
                    {defaultCard.cardName} · {defaultCard.cardType}
                  </p>
                </>
              ) : (
                <Link
                  href="/dashboard/settings"
                  className="text-[13px] text-white/40 hover:text-white underline mt-2 inline-block"
                >
                  Connect Brex →
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold">Recent activity</h2>
            <Link
              href="/dashboard/history"
              className="text-[12px] text-white/30 hover:text-white/60 transition-colors"
            >
              View all →
            </Link>
          </div>

          {payments.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] border-dashed py-12 text-center">
              <p className="text-[13px] text-white/30">
                No payments yet. Agents will request payments here.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.08] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <span className="text-[11px] text-white/30 font-medium">Transaction</span>
                <span className="text-[11px] text-white/30 font-medium">Amount</span>
                <span className="text-[11px] text-white/30 font-medium">Status</span>
                <span className="text-[11px] text-white/30 font-medium">Date</span>
              </div>
              {payments.slice(0, 8).map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-b last:border-0 border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 ${
                        p.status === "pending"
                          ? "bg-amber-500/15"
                          : p.status === "approved" || p.status === "completed"
                            ? "bg-emerald-500/15"
                            : "bg-red-500/15"
                      }`}
                    >
                      <AgentIcon
                        className={`h-3.5 w-3.5 ${
                          p.status === "pending"
                            ? "text-amber-400"
                            : p.status === "approved" || p.status === "completed"
                              ? "text-emerald-400"
                              : "text-red-400"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{p.merchantName}</p>
                      <p className="text-[11px] text-white/30 truncate">{p.itemDescription}</p>
                    </div>
                  </div>
                  <span className="text-[13px] font-medium tabular-nums self-center">
                    ${(p.amountCents / 100).toFixed(2)}
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
                  <span className="text-[12px] text-white/25 tabular-nums self-center">
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
        </>
      )}
    </div>
  );
}
