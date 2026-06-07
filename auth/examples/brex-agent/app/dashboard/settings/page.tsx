"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { BrexLogo } from "@/components/icons";

interface Card {
  id: string;
  last4: string;
  cardName: string;
  cardType: string;
  isDefault: boolean;
}

export default function SettingsPage() {
  const [brexToken, setBrexToken] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/brex/cards");
    const data = await res.json();
    const cardList = data.cards ?? [];
    setCards(cardList);
    setConnected(cardList.length > 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await fetch("/api/brex/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brexToken }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Connected! Found ${data.cards?.length ?? 0} cards.`);
        setBrexToken("");
        fetchCards();
      } else {
        toast.error(data.error ?? "Connection failed");
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleSetDefault(cardId: string) {
    const res = await fetch("/api/brex/cards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    if (res.ok) {
      toast.success("Default card updated");
      fetchCards();
    }
  }

  return (
    <div className="px-8 py-8 max-w-[700px]">
      <h1 className="text-[22px] font-semibold mb-1">Settings</h1>
      <p className="text-[13px] text-white/40 mb-8">
        Connect your Brex account and select which card agents use for payments.
      </p>

      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <BrexLogo className="h-[14px] w-auto text-white/80" />
            <span className="text-[14px] font-semibold">Connection</span>
          </div>
          <form onSubmit={handleConnect} className="flex gap-2">
            <input
              type="password"
              value={brexToken}
              onChange={(e) => setBrexToken(e.target.value)}
              placeholder={connected ? "Enter new token to reconnect..." : "Brex API token"}
              className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.1] placeholder:text-white/20 focus:border-white/[0.2] focus:ring-1 focus:ring-white/[0.08] text-[13px] outline-none transition-all font-mono text-white"
            />
            <button
              type="submit"
              disabled={connecting || !brexToken}
              className="px-4 py-2.5 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 transition-all disabled:opacity-50 cursor-pointer"
            >
              {connecting ? "..." : connected ? "Reconnect" : "Connect"}
            </button>
          </form>
          {connected && (
            <p className="mt-2 text-[12px] text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Brex account connected
            </p>
          )}
        </section>

        <section>
          <h2 className="text-[14px] font-semibold mb-4">Payment Cards</h2>
          {loading ? (
            <div className="h-14 rounded-lg border border-white/[0.08] bg-white/[0.02] animate-pulse" />
          ) : cards.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] border-dashed py-8 text-center">
              <p className="text-[13px] text-white/30">
                {connected ? "No cards found" : "Connect your Brex account to see cards"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all ${
                    card.isDefault
                      ? "border-white/[0.15] bg-white/[0.04]"
                      : "border-white/[0.08] hover:border-white/[0.12]"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold font-mono">•••• {card.last4}</span>
                      {card.isDefault && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/[0.08] text-white/50 uppercase">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-white/30">
                      {card.cardName} · {card.cardType}
                    </span>
                  </div>
                  {!card.isDefault && (
                    <button
                      onClick={() => handleSetDefault(card.id)}
                      className="text-[12px] text-white/30 hover:text-white/60 underline cursor-pointer"
                    >
                      Set default
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
