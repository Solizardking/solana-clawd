import { useEffect, useState } from "react";

export type TradingStreamStatus = "idle" | "connecting" | "live" | "error";

export type TradingActivityEvent = {
  id: string;
  channel: "sniper" | "bundler";
  room?: string;
  wallet?: string;
  amount?: string;
  tokenAmount?: number;
  percentage?: number;
  previousAmount?: number;
  previousPercentage?: number;
  totalSniperPercentage?: number;
  totalInsiderPercentage?: number;
  totalBundlerPercentage?: number;
  boughtAmount?: number;
  boughtPercentage?: number;
  action?: "buy" | "sell";
  timestamp?: number;
  receivedAt: number;
};

function buildEventId(channel: "sniper" | "bundler", payload: Record<string, unknown>, receivedAt: number) {
  const wallet = typeof payload.wallet === "string" ? payload.wallet : "unknown";
  const timestamp = typeof payload.timestamp === "number" ? payload.timestamp : receivedAt;
  return `${channel}:${wallet}:${timestamp}`;
}

export function useTradingActivityStream(tokenAddress: string | null) {
  const [events, setEvents] = useState<TradingActivityEvent[]>([]);
  const [status, setStatus] = useState<TradingStreamStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setEvents([]);
      setStatus("idle");
      setLastError(null);
      return;
    }

    const source = new EventSource(`/api/solana-tracker/stream/${tokenAddress}`);
    setEvents([]);
    setStatus("connecting");
    setLastError(null);

    const handleReady = () => {
      setStatus("live");
      setLastError(null);
    };

    const pushEvent = (channel: "sniper" | "bundler", rawEvent: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(rawEvent.data) as Record<string, unknown>;
        const receivedAt = Date.now();
        const entry: TradingActivityEvent = {
          id: buildEventId(channel, payload, receivedAt),
          channel,
          room: typeof payload.room === "string" ? payload.room : undefined,
          wallet: typeof payload.wallet === "string" ? payload.wallet : undefined,
          amount: typeof payload.amount === "string" ? payload.amount : undefined,
          tokenAmount: typeof payload.tokenAmount === "number" ? payload.tokenAmount : undefined,
          percentage: typeof payload.percentage === "number" ? payload.percentage : undefined,
          previousAmount: typeof payload.previousAmount === "number" ? payload.previousAmount : undefined,
          previousPercentage: typeof payload.previousPercentage === "number" ? payload.previousPercentage : undefined,
          totalSniperPercentage: typeof payload.totalSniperPercentage === "number" ? payload.totalSniperPercentage : undefined,
          totalInsiderPercentage: typeof payload.totalInsiderPercentage === "number" ? payload.totalInsiderPercentage : undefined,
          totalBundlerPercentage: typeof payload.totalBundlerPercentage === "number" ? payload.totalBundlerPercentage : undefined,
          boughtAmount: typeof payload.boughtAmount === "number" ? payload.boughtAmount : undefined,
          boughtPercentage: typeof payload.boughtPercentage === "number" ? payload.boughtPercentage : undefined,
          action: payload.action === "buy" || payload.action === "sell" ? payload.action : undefined,
          timestamp: typeof payload.timestamp === "number" ? payload.timestamp : undefined,
          receivedAt,
        };

        setStatus("live");
        setEvents((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== entry.id);
          return [entry, ...withoutDuplicate].slice(0, 40);
        });
      } catch (error) {
        setStatus("error");
        setLastError(error instanceof Error ? error.message : "Failed to parse trading stream event");
      }
    };

    const handleSniper = (event: Event) => {
      pushEvent("sniper", event as MessageEvent<string>);
    };

    const handleBundler = (event: Event) => {
      pushEvent("bundler", event as MessageEvent<string>);
    };

    const handleClosed = () => {
      setStatus("error");
      setLastError("Trading activity stream disconnected.");
    };

    const handleError = () => {
      setStatus("error");
      setLastError("Trading activity stream reconnecting.");
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("joined", handleReady);
    source.addEventListener("sniper", handleSniper);
    source.addEventListener("bundler", handleBundler);
    source.addEventListener("closed", handleClosed);
    source.addEventListener("error", handleError);
    source.onerror = handleError;

    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("joined", handleReady);
      source.removeEventListener("sniper", handleSniper);
      source.removeEventListener("bundler", handleBundler);
      source.removeEventListener("closed", handleClosed);
      source.removeEventListener("error", handleError);
      source.close();
    };
  }, [tokenAddress]);

  return { events, status, lastError };
}
