"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Order {
  id: string;
  productName: string;
  amountCents: number;
  currency: string;
  status: string;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  userId: string | null;
  agentId: string | null;
  createdAt: string;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders?scope=all")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">☕</span>
            <span className="text-[14px] font-semibold tracking-tight">Agent Coffee Shop</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/40 uppercase tracking-wider">
              Admin
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-[12px] text-foreground/40 hover:text-foreground transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight mb-1">All Orders</h1>
        <p className="text-[13px] text-foreground/40 mb-6">
          Global view of every order across all users and agents.
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg border border-border animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <span className="text-3xl block mb-3">📦</span>
            <h3 className="text-[13px] font-medium text-foreground/60">No orders yet</h3>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-foreground/[0.02]">
                  <th className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium px-4 py-2.5">
                    Order
                  </th>
                  <th className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium px-4 py-2.5">
                    Product
                  </th>
                  <th className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium px-4 py-2.5">
                    Amount
                  </th>
                  <th className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium px-4 py-2.5">
                    Status
                  </th>
                  <th className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium px-4 py-2.5">
                    User / Agent
                  </th>
                  <th className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium px-4 py-2.5">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-0 hover:bg-foreground/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <code className="text-[12px] font-mono text-foreground/60">{o.id}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px]">{o.productName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-medium tabular-nums">
                        ${(o.amountCents / 100).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] font-medium capitalize px-1.5 py-0.5 rounded ${
                          o.status === "delivered"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : o.status === "shipped"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-foreground/[0.06] text-foreground/50"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.agentId ? (
                        <span className="text-[11px] font-mono text-foreground/40">
                          agent:{o.agentId.slice(0, 8)}
                        </span>
                      ) : o.userId ? (
                        <span className="text-[11px] font-mono text-foreground/40">
                          user:{o.userId.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-foreground/25">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-foreground/40">
                        {new Date(o.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
