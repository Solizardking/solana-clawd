import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveBrowserWsUrl } from "@/lib/runtimeConfig";

const PUMPFUN_WS_URL =
  import.meta.env.VITE_PUMPFUN_WS_URL ||
  resolveBrowserWsUrl("/ws") ||
  "ws://localhost:5000/ws";
const MAX_TOKENS = 180;

export type PumpConnectionState = "connecting" | "live" | "paused" | "disconnected" | "error";

export type PumpFunStatus = {
  connected?: boolean;
  uptime?: number;
  totalLaunches?: number;
  githubLaunches?: number;
  totalClaims?: number;
  clients?: number;
};

export type PumpFunToken = {
  type: "token-launch";
  signature?: string;
  time?: string;
  name?: string;
  symbol?: string;
  metadataUri?: string;
  mint?: string;
  creator?: string;
  isV2?: boolean;
  hasGithub?: boolean;
  githubUrls?: string[];
  imageUri?: string;
  description?: string | null;
  marketCapSol?: number;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
};

function parsePumpMessage(raw: string): { status?: PumpFunStatus; token?: PumpFunToken } | null {
  try {
    const data = JSON.parse(raw);
    if (data?.type === "status") return { status: data };
    if (data?.type === "token-launch") return { token: data };
    return null;
  } catch {
    return null;
  }
}

export function usePumpFunLive() {
  const [connectionState, setConnectionState] = useState<PumpConnectionState>("connecting");
  const [status, setStatus] = useState<PumpFunStatus | null>(null);
  const [tokens, setTokens] = useState<PumpFunToken[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      setConnectionState("paused");
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      setConnectionState("live");
    }
  }, [paused]);

  const clear = useCallback(() => setTokens([]), []);
  const togglePaused = useCallback(() => setPaused((current) => !current), []);

  useEffect(() => {
    let alive = true;

    const connect = () => {
      if (!alive) return;
      setConnectionState(pausedRef.current ? "paused" : "connecting");
      const ws = new WebSocket(PUMPFUN_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        setLastError(null);
        setConnectionState(pausedRef.current ? "paused" : "live");
      };

      ws.onmessage = (event) => {
        const parsed = parsePumpMessage(String(event.data));
        if (!parsed) return;
        if (parsed.status) {
          setStatus(parsed.status);
          return;
        }
        if (parsed.token && !pausedRef.current) {
          setTokens((current) => {
            const mint = parsed.token?.mint;
            const deduped = mint ? current.filter((item) => item.mint !== mint) : current;
            return [parsed.token!, ...deduped].slice(0, MAX_TOKENS);
          });
        }
      };

      ws.onerror = () => {
        if (!alive) return;
        setLastError("PumpFun websocket connection failed.");
        setConnectionState("error");
      };

      ws.onclose = () => {
        if (!alive) return;
        setConnectionState("disconnected");
        reconnectRef.current = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      alive = false;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  const tokensWithGithub = useMemo(
    () => tokens.filter((token) => token.hasGithub || (token.githubUrls?.length ?? 0) > 0).length,
    [tokens],
  );

  return {
    clear,
    connectionState,
    lastError,
    paused,
    status,
    togglePaused,
    tokens,
    tokensWithGithub,
  };
}
