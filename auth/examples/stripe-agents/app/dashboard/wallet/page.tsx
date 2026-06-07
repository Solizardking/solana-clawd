"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Plus, CreditCard } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Card {
  id: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

const BRAND_COLORS: Record<string, string> = {
  visa: "#1A1F71",
  mastercard: "#EB001B",
  amex: "#006FCF",
  discover: "#FF6600",
};

function CardBrandIcon({ brand, size = "sm" }: { brand: string; size?: "sm" | "lg" }) {
  const color = BRAND_COLORS[brand.toLowerCase()] ?? "#1a1f36";
  return (
    <div
      className={`flex items-center justify-center text-white font-bold shrink-0 rounded-full ${
        size === "lg" ? "h-14 w-14 text-xl" : "h-7 w-7 text-[10px]"
      }`}
      style={{ backgroundColor: color }}
    >
      {brand[0]?.toUpperCase()}
    </div>
  );
}

function AddCardForm({ onAdded }: { onAdded: () => void }) {
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
      if (result.error) {
        toast.error(result.error.message ?? "Card setup failed");
        return;
      }
      const pmId = result.setupIntent?.payment_method;
      if (pmId) {
        const res = await fetch("/api/stripe/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId: pmId }),
        });
        if (res.ok) {
          toast.success("Card added");
          onAdded();
          elements.getElement(CardElement)?.clear();
          const newSetup = await fetch("/api/stripe/setup", { method: "POST" }).then((r) =>
            r.json(),
          );
          setClientSecret(newSetup.clientSecret);
        } else {
          const data = await res.json();
          toast.error(data.error ?? "Failed to save card");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 border-t border-border">
      <p className="text-[14px] font-medium text-foreground mb-3">Add a card</p>
      <div className="p-3 rounded-lg border border-border bg-white mb-3">
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
        className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-foreground text-white hover:bg-foreground/90 disabled:opacity-50 cursor-pointer transition-all"
      >
        {loading ? "Adding..." : "Add Card"}
      </button>
    </form>
  );
}

export default function WalletPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/stripe/cards");
    const data = await res.json();
    const allCards = data.cards ?? [];
    setCards(allCards);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  useEffect(() => {
    if (selectedId === null && cards.length > 0) {
      setSelectedId(cards[0].id);
    }
  }, [cards, selectedId]);

  async function handleSetDefault(cardId: string) {
    const res = await fetch("/api/stripe/cards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    if (res.ok) {
      toast.success("Default card updated");
      fetchCards();
    }
  }

  async function handleRemove(cardId: string) {
    if (!confirm("Remove this card?")) return;
    const res = await fetch(`/api/stripe/cards?id=${cardId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Card removed");
      if (selectedId === cardId) setSelectedId(null);
      fetchCards();
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5">
          <h1 className="text-[20px] font-semibold text-foreground">Wallet</h1>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <Plus className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        {loading ? (
          <div className="px-3 space-y-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {cards.length > 0 && (
              <div className="px-3">
                <div className="px-3 pt-1 pb-1">
                  <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                    Cards
                  </span>
                </div>
                {cards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedId(card.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                      selectedId === card.id ? "bg-[#f5f5f5]" : "hover:bg-[#f5f5f5]/60"
                    }`}
                  >
                    <CardBrandIcon brand={card.brand} />
                    <span className="text-[13px] font-medium text-foreground capitalize truncate flex-1 min-w-0">
                      {card.brand} •••• {card.last4}
                    </span>
                    {card.isDefault && (
                      <span className="text-[12px] text-muted-foreground shrink-0">Default</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {cards.length === 0 && !showAdd && (
              <div className="px-6 py-20 text-center">
                <CreditCard
                  className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
                  strokeWidth={1.5}
                />
                <p className="text-[14px] text-muted-foreground">No cards yet</p>
                <p className="text-[13px] text-muted-foreground/70 mt-1">
                  Add a card to get started.
                </p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-4 py-2 text-[13px] font-semibold rounded-lg bg-foreground text-white hover:bg-foreground/90 cursor-pointer transition-all"
                >
                  Add Card
                </button>
              </div>
            )}

            {showAdd && (
              <Elements stripe={stripePromise}>
                <AddCardForm
                  onAdded={() => {
                    fetchCards();
                    setShowAdd(false);
                  }}
                />
              </Elements>
            )}
          </>
        )}
      </div>

      {selected && (
        <div className="w-[380px] shrink-0 overflow-y-auto bg-white hidden lg:block">
          <div className="flex flex-col items-center pt-10 pb-6 px-6">
            <CardBrandIcon brand={selected.brand} size="lg" />
            <p className="mt-4 text-[16px] font-semibold text-foreground capitalize">
              {selected.brand} •••• {selected.last4}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Expires {selected.expMonth}/{selected.expYear}
            </p>
          </div>

          <div className="px-5 space-y-3">
            <div className="rounded-2xl bg-[#f5f5f5] px-4 py-1">
              <button
                onClick={() => handleSetDefault(selected.id)}
                disabled={selected.isDefault}
                className="flex w-full items-center justify-between py-3 cursor-pointer disabled:cursor-default"
              >
                <span className="text-[14px] text-foreground">Set as default</span>
                <div
                  className={`h-[22px] w-[40px] rounded-full transition-colors flex items-center px-0.5 ${
                    selected.isDefault ? "bg-foreground" : "bg-border"
                  }`}
                >
                  <div
                    className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                      selected.isDefault ? "translate-x-[18px]" : "translate-x-0"
                    }`}
                  />
                </div>
              </button>
              <div className="border-t border-border/60" />
              <button
                onClick={() => handleRemove(selected.id)}
                className="flex w-full items-center justify-between py-3 text-foreground hover:text-red-600 transition-colors cursor-pointer"
              >
                <span className="text-[14px]">Remove</span>
                <svg
                  className="h-4 w-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
