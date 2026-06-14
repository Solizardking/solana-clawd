import { useEffect, useRef, useState } from "react";
import { getWsUrl } from '@/lib/websocket';

export type ClawdEvent = {
  type: string;
  ts: number;
  payload: any;
};

export type ClawdHello = {
  type: "hello";
  payload: {
    state: any;
    positions: any[];
    fills: any[];
    decisions: any[];
    recent: ClawdEvent[];
  };
};

export function useClawdStream() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<any>(null);
  const [live, setLive] = useState<{
    configured: boolean;
    live: boolean;
    ready?: boolean;
    pubkey?: string;
    rpcConfigured?: boolean;
    signerConfigured?: boolean;
    blockers?: string[];
    risk?: {
      maxPositionsPerSymbol: number;
      maxOpenPositions: number;
      maxLamportsPerTrade: number;
      minSolBalance: number;
      defaultSlippageBps: number;
      maxTradesPerHour: number;
    };
  } | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [fills, setFills] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [logs, setLogs] = useState<{ ts: number; level: string; msg: string }[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState<{ symbol: string; text: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    const connect = () => {
      const url = getWsUrl('/ws/clawd');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => alive && setConnected(true);
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
        reconnectRef.current = window.setTimeout(connect, 2000);
      };
      ws.onerror = () => {};
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handle(msg);
        } catch {}
      };
    };

    const handle = (msg: any) => {
      if (msg.type === "hello") {
        setState(msg.payload.state);
        setPositions(msg.payload.positions ?? []);
        setFills(msg.payload.fills ?? []);
        setDecisions(msg.payload.decisions ?? []);
        const recent = (msg.payload.recent ?? []) as ClawdEvent[];
        setLogs(
          recent
            .filter((e) => e.type === "log")
            .slice(-30)
            .map((e) => ({ ts: e.ts, level: e.payload?.level ?? "info", msg: e.payload?.msg ?? "" })),
        );
        const lastSnap = [...recent].reverse().find((e) => e.type === "snapshot");
        if (lastSnap) setSnapshots(lastSnap.payload ?? []);
        return;
      }

      switch (msg.type) {
        case "state":
          setState(msg.payload);
          break;
        case "snapshot":
          setSnapshots(msg.payload ?? []);
          break;
        case "log":
          setLogs((prev) => [
            ...prev.slice(-49),
            { ts: msg.ts, level: msg.payload?.level ?? "info", msg: msg.payload?.msg ?? "" },
          ]);
          break;
        case "fill":
          setFills((prev) => [msg.payload, ...prev].slice(0, 50));
          break;
        case "position_update":
          // refetch via /api/clawd/state on next tick — for now just log
          break;
        case "gate_token": {
          const sym = msg.payload?.symbol ?? "";
          const tok = msg.payload?.token ?? "";
          setStreamingReasoning((prev) =>
            prev && prev.symbol === sym
              ? { symbol: sym, text: prev.text + tok }
              : { symbol: sym, text: tok },
          );
          break;
        }
        case "gate_decision": {
          const decisionId = msg.payload?.decisionId;
          setDecisions((prev) => [
            {
              id: decisionId,
              ts: msg.ts,
              symbol: msg.payload?.symbol,
              signal: msg.payload?.signal?.direction,
              signalScore: msg.payload?.signal?.score,
              signalReasons: msg.payload?.signal?.reasons ?? [],
              gateAction: msg.payload?.action,
              gateReasoning: msg.payload?.reasoning,
            },
            ...prev,
          ].slice(0, 50));
          setStreamingReasoning(null);
          break;
        }
        case "tick":
          break;
      }
    };

    // Also pull fresh /state on (re)connect interval to keep positions accurate
    const refetch = async () => {
      try {
        const r = await fetch("/api/clawd/state");
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setState(j.state);
        setLive(j.live ?? null);
        setPositions(j.positions ?? []);
        setFills(j.fills ?? []);
        setDecisions(j.decisions ?? []);
      } catch {}
    };
    refetch();
    const refetchInterval = window.setInterval(refetch, 15_000);

    connect();

    return () => {
      alive = false;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      window.clearInterval(refetchInterval);
      wsRef.current?.close();
    };
  }, []);

  return { connected, state, live, positions, fills, decisions, logs, snapshots, streamingReasoning };
}
