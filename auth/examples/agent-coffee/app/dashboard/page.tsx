"use client";

import { useState, useEffect } from "react";

interface Order {
  id: string;
  productName: string;
  amountCents: number;
  currency: string;
  status: string;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  agentId: string | null;
  createdAt: string;
}

const STATUS_STEPS = ["processing", "shipped", "delivered"];

function StatusTracker({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, idx) => {
        const done = idx <= currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold ${
                done
                  ? active
                    ? "bg-foreground text-background"
                    : "bg-emerald-500 text-white"
                  : "bg-foreground/[0.06] text-foreground/30"
              }`}
            >
              {done && !active ? "✓" : idx + 1}
            </div>
            <span
              className={`text-[11px] capitalize ${done ? "text-foreground/70 font-medium" : "text-foreground/30"}`}
            >
              {step}
            </span>
            {idx < STATUS_STEPS.length - 1 && (
              <div
                className={`w-6 h-px mx-1 ${idx < currentIdx ? "bg-emerald-500" : "bg-foreground/10"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-[1000px] mx-auto px-6 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight mb-1">My Orders</h1>
      <p className="text-[13px] text-foreground/40 mb-6">
        Track orders placed by you or your AI agents.
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg border border-border animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <span className="text-3xl block mb-3">☕</span>
          <h3 className="text-[13px] font-medium text-foreground/60">No orders yet</h3>
          <p className="mt-1 text-[12px] text-foreground/35 max-w-xs mx-auto">
            Orders placed by you or your agents will appear here with live tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const isExpanded = expanded === o.id;
            const delivery = o.estimatedDelivery
              ? new Date(o.estimatedDelivery).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : null;

            return (
              <div
                key={o.id}
                className={`rounded-lg border transition-all ${
                  isExpanded ? "border-foreground/20" : "border-border hover:border-foreground/10"
                }`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : o.id)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left cursor-pointer"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-foreground/[0.04] shrink-0">
                    <span className="text-lg">☕</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{o.productName}</span>
                      {o.agentId && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/40">
                          via agent
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-foreground/40">
                        ${(o.amountCents / 100).toFixed(2)}
                      </span>
                      {o.trackingNumber && (
                        <>
                          <span className="text-foreground/15">·</span>
                          <span className="text-[11px] text-foreground/35 font-mono">
                            {o.trackingNumber}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-[11px] font-medium capitalize ${
                        o.status === "delivered"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : o.status === "shipped"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-foreground/50"
                      }`}
                    >
                      {o.status}
                    </span>
                    {delivery && (
                      <p className="text-[11px] text-foreground/30 mt-0.5">
                        {o.status === "delivered" ? "Delivered" : `Est. ${delivery}`}
                      </p>
                    )}
                  </div>
                  <svg
                    className={`h-4 w-4 text-foreground/20 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    <StatusTracker status={o.status} />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-foreground/[0.03] px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium block">
                          Order ID
                        </span>
                        <code className="text-[12px] font-mono text-foreground/60">{o.id}</code>
                      </div>
                      <div className="rounded-md bg-foreground/[0.03] px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium block">
                          Tracking
                        </span>
                        <code className="text-[12px] font-mono text-foreground/60">
                          {o.trackingNumber ?? "—"}
                        </code>
                      </div>
                      <div className="rounded-md bg-foreground/[0.03] px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium block">
                          Ordered
                        </span>
                        <span className="text-[12px] text-foreground/60">
                          {new Date(o.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="rounded-md bg-foreground/[0.03] px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium block">
                          Est. Delivery
                        </span>
                        <span className="text-[12px] text-foreground/60">{delivery ?? "—"}</span>
                      </div>
                    </div>

                    {o.agentId && (
                      <div className="rounded-md bg-foreground/[0.03] px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium block">
                          Placed by Agent
                        </span>
                        <code className="text-[12px] font-mono text-foreground/60">
                          {o.agentId}
                        </code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
