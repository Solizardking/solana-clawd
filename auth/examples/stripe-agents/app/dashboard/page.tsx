"use client";

import { useState, useEffect } from "react";
import { Search, ReceiptText } from "lucide-react";

interface Payment {
  id: string;
  agentId: string;
  agentName?: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  itemDescription: string;
  status: string;
  cardLast4: string | null;
  cardBrand?: string | null;
  createdAt: string;
}

const MERCHANT_COLORS = [
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

function getMerchantColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return MERCHANT_COLORS[Math.abs(hash) % MERCHANT_COLORS.length];
}

function MerchantIcon({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const color = getMerchantColor(name);
  return (
    <div
      className={`flex items-center justify-center text-white font-semibold shrink-0 rounded-full ${
        size === "lg" ? "h-14 w-14 text-xl" : "h-7 w-7 text-[10px]"
      }`}
      style={{ backgroundColor: color }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const paymentDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (paymentDate.getTime() === today.getTime()) return "Today";

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (paymentDate >= weekAgo && paymentDate < today) return "This week";

  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function groupPaymentsByDate(payments: Payment[]): [string, Payment[]][] {
  const groups: Record<string, Payment[]> = {};
  const order: string[] = [];
  for (const p of payments) {
    const group = getDateGroup(p.createdAt);
    if (!groups[group]) {
      groups[group] = [];
      order.push(group);
    }
    groups[group].push(p);
  }
  return order.map((g) => [g, groups[g]]);
}

interface CardInfo {
  last4: string;
  brand: string;
}

export default function ActivityPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/payments").then((r) => r.json()),
      fetch("/api/stripe/cards")
        .then((r) => r.json())
        .catch(() => ({ cards: [] })),
    ])
      .then(([payData, cardData]) => {
        const userCards: CardInfo[] = cardData.cards ?? [];
        const all = (payData.payments ?? []).map((p: Payment) => ({
          ...p,
          cardBrand: p.cardLast4
            ? (userCards.find((c) => c.last4 === p.cardLast4)?.brand ?? null)
            : null,
        }));
        setPayments(all);
        if (all.length > 0) setSelectedId(all[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = payments.find((p) => p.id === selectedId) ?? null;
  const grouped = groupPaymentsByDate(payments);

  return (
    <div className="flex h-full">
      <div className="flex-1 border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5">
          <h1 className="text-[20px] font-semibold text-foreground">Activity</h1>
          <button className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer">
            <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        {loading ? (
          <div className="px-6 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <ReceiptText
              className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-[14px] text-muted-foreground">No activity yet</p>
            <p className="text-[13px] text-muted-foreground/70 mt-1">
              Agent payments will appear here.
            </p>
          </div>
        ) : (
          <div className="px-3">
            {grouped.map(([group, items]) => (
              <div key={group}>
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[12px] font-medium text-muted-foreground">{group}</span>
                </div>
                {items.map((p) => {
                  const cardLabel = p.cardBrand
                    ? `${p.cardBrand} •••• ${p.cardLast4}`
                    : p.cardLast4
                      ? `Card •••• ${p.cardLast4}`
                      : null;

                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                        selectedId === p.id ? "bg-[#f5f5f5]" : "hover:bg-[#f5f5f5]/60"
                      }`}
                    >
                      <MerchantIcon name={p.merchantName} />
                      <span className="text-[13px] font-medium text-foreground truncate min-w-[100px] shrink-0">
                        {p.merchantName}
                      </span>
                      <span className="text-[13px] text-muted-foreground truncate flex-1 min-w-0">
                        {[p.agentName, cardLabel].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-[13px] text-muted-foreground shrink-0 tabular-nums">
                        {formatDate(p.createdAt)}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground shrink-0 w-[80px] text-right">
                        ${(p.amountCents / 100).toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="w-[380px] shrink-0 overflow-y-auto bg-white hidden lg:block">
          <div className="flex flex-col items-center pt-10 pb-6 px-6">
            <MerchantIcon name={selected.merchantName} size="lg" />
            <p className="mt-4 text-[16px] font-semibold text-foreground">
              {selected.merchantName}
            </p>
            {selected.agentName && (
              <p className="text-[12px] text-muted-foreground mt-0.5">via {selected.agentName}</p>
            )}
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {formatDateTime(selected.createdAt)}
            </p>
            <p className="mt-2 text-[28px] font-semibold tabular-nums text-foreground">
              ${(selected.amountCents / 100).toFixed(2)}
            </p>
          </div>

          <div className="px-5 space-y-3">
            <div className="rounded-2xl bg-[#f5f5f5] px-4 py-1">
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-foreground">Status</span>
                <span className="text-[14px] text-muted-foreground">
                  {selected.status === "approved" || selected.status === "completed"
                    ? "Approved"
                    : selected.status === "pending"
                      ? "Pending"
                      : "Denied"}
                </span>
              </div>
              {selected.cardLast4 && (
                <>
                  <div className="border-t border-border/60" />
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[14px] text-foreground">Payment</span>
                    <span className="text-[14px] text-muted-foreground capitalize">
                      {selected.cardBrand
                        ? `${selected.cardBrand} Card ${selected.cardLast4}`
                        : `Card •••• ${selected.cardLast4}`}
                    </span>
                  </div>
                </>
              )}
              {selected.agentName && (
                <>
                  <div className="border-t border-border/60" />
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[14px] text-foreground">Agent</span>
                    <span className="text-[14px] text-muted-foreground">{selected.agentName}</span>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl bg-[#f5f5f5] px-4 py-1">
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-muted-foreground leading-snug max-w-[200px]">
                  {selected.itemDescription}
                </span>
                <span className="text-[14px] tabular-nums text-foreground shrink-0 ml-4">
                  ${(selected.amountCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="border-t border-border/60" />
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] font-medium text-foreground">Total</span>
                <span className="text-[14px] font-semibold tabular-nums text-foreground">
                  ${(selected.amountCents / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
