/**
 * useBirdeyeWS — Birdeye WebSocket subscriptions.
 *
 * Supported event types:
 *   SUBSCRIBE_PRICE          → PRICE_DATA (OHLCV per token/pair)
 *   SUBSCRIBE_TXS            → TXS_DATA (real-time trades)
 *   SUBSCRIBE_TOKEN_STATS    → TOKEN_STATS_DATA (live token metrics)
 *   SUBSCRIBE_TOKEN_NEW_LISTING → TOKEN_NEW_LISTING_DATA
 *   SUBSCRIBE_NEW_PAIR       → NEW_PAIR_DATA
 *   SUBSCRIBE_LARGE_TRADE_TXS → TXS_LARGE_TRADE_DATA
 *   SUBSCRIBE_WALLET_TXS    → WALLET_TXS_DATA
 */
import { useEffect, useRef, useState, useCallback } from "react";

const WSS_BASE = "wss://public-api.birdeye.so/socket/solana";
const API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY as string | undefined;

const WS_HEADERS = {
  "Origin": "ws://public-api.birdeye.so",
  "Sec-WebSocket-Origin": "ws://public-api.birdeye.so",
  "Sec-WebSocket-Protocol": "echo-protocol",
};

export interface OhlcvBar {
  o: number; h: number; l: number; c: number; v: number;
  unixTime: number; type: string; symbol: string; address: string;
  eventType: string;
}

export interface TxsData {
  blockUnixTime: number; owner: string; source: string; txHash: string;
  side?: string; tokenAddress?: string; volumeUSD: number;
  from: { symbol: string; address: string; uiAmount: number; decimals: number };
  to:   { symbol: string; address: string; uiAmount: number; decimals: number };
  tokenPrice?: number; pricePair?: number; network?: string; poolId?: string;
}

export interface NewListingData {
  address: string; decimals: number; name: string; symbol: string;
  liquidity: string; liquidityAddedAt: number;
}

export interface NewPairData {
  address: string; name: string; source: string;
  base: { address: string; name: string; symbol: string; decimals: number };
  quote: { address: string; name: string; symbol: string; decimals: number };
  txHash: string; blockTime: number;
}

export interface LargeTradeData {
  blockUnixTime: number; blockHumanTime: string; owner: string;
  source: string; poolAddress: string; txHash: string; volumeUSD: number;
  network: string;
  from: { symbol: string; address: string; uiAmount: number; decimals: number };
  to:   { symbol: string; address: string; uiAmount: number; decimals: number };
}

export interface TokenStatsData {
  address: string; price: number;
  volume_24h_usd?: number; trade_24h?: number;
  price_change_24h_percent?: number;
  unique_wallet_24h?: number;
  [key: string]: unknown;
}

function buildWssUrl() {
  if (!API_KEY) return null;
  return `${WSS_BASE}?x-api-key=${API_KEY}`;
}

// ─── Price / OHLCV ───────────────────────────────────────────────────────────

export interface UsePriceStreamOptions {
  address: string;
  chartType?: string;
  currency?: "usd" | "pair";
}

export function usePriceStream({ address, chartType = "1m", currency = "usd" }: UsePriceStreamOptions) {
  const [bars, setBars] = useState<OhlcvBar[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url || !address) return;

    const ws = new WebSocket(url, "echo-protocol");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: "SUBSCRIBE_PRICE",
        data: { queryType: "simple", chartType, address, currency },
      }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "PRICE_DATA") {
          setBars((prev) => {
            const bar = msg.data as OhlcvBar;
            const last = prev[prev.length - 1];
            if (last && last.unixTime === bar.unixTime) {
              return [...prev.slice(0, -1), bar];
            }
            return [...prev.slice(-299), bar];
          });
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, [address, chartType, currency]);

  return { bars, connected };
}

// ─── Token Transactions ───────────────────────────────────────────────────────

export function useTokenTxsStream(address: string | null | undefined, txsType: string = "swap") {
  const [txs, setTxs] = useState<TxsData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url || !address) return;

    const ws = new WebSocket(url, "echo-protocol");

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: "SUBSCRIBE_TXS",
        data: { queryType: "simple", address, txsType },
      }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "TXS_DATA") {
          setTxs((prev) => [msg.data as TxsData, ...prev].slice(0, 200));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, [address, txsType]);

  return { txs, connected };
}

// ─── Token Stats ──────────────────────────────────────────────────────────────

export function useTokenStatsStream(addresses: string[]) {
  const [stats, setStats] = useState<Record<string, TokenStatsData>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url || addresses.length === 0) return;

    const ws = new WebSocket(url, "echo-protocol");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: "SUBSCRIBE_TOKEN_STATS",
        data: {
          address: addresses,
          select: {
            price: true,
            fdv: true, marketcap: true, liquidity: true, last_trade: true,
            trade_data: {
              volume: true, trade: true, price_change: true,
              unique_wallet: true,
              intervals: ["1h", "4h", "24h"],
            },
          },
        },
      }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "TOKEN_STATS_DATA") {
          const d = msg.data as TokenStatsData;
          setStats((prev) => ({ ...prev, [d.address]: d }));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, [addresses.join(",")]);

  return { stats, connected };
}

// ─── New Listings ─────────────────────────────────────────────────────────────

export interface NewListingOptions {
  meme_platform_enabled?: boolean;
  min_liquidity?: number;
  max_liquidity?: number;
}

export function useNewListingsStream(opts: NewListingOptions = {}) {
  const [listings, setListings] = useState<NewListingData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url) return;

    const ws = new WebSocket(url, "echo-protocol");

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "SUBSCRIBE_TOKEN_NEW_LISTING", ...opts }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "TOKEN_NEW_LISTING_DATA") {
          setListings((prev) => [msg.data as NewListingData, ...prev].slice(0, 100));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, []);

  return { listings, connected };
}

// ─── New Pairs ────────────────────────────────────────────────────────────────

export function useNewPairsStream(opts: { min_liquidity?: number; max_liquidity?: number } = {}) {
  const [pairs, setPairs] = useState<NewPairData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url) return;

    const ws = new WebSocket(url, "echo-protocol");

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "SUBSCRIBE_NEW_PAIR", ...opts }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "NEW_PAIR_DATA") {
          setPairs((prev) => [msg.data as NewPairData, ...prev].slice(0, 100));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, []);

  return { pairs, connected };
}

// ─── Large Trades ─────────────────────────────────────────────────────────────

export function useLargeTradesStream(min_volume: number = 10000, max_volume?: number) {
  const [trades, setTrades] = useState<LargeTradeData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url) return;

    const ws = new WebSocket(url, "echo-protocol");

    ws.onopen = () => {
      setConnected(true);
      const msg: Record<string, unknown> = { type: "SUBSCRIBE_LARGE_TRADE_TXS", min_volume };
      if (max_volume) msg.max_volume = max_volume;
      ws.send(JSON.stringify(msg));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "TXS_LARGE_TRADE_DATA") {
          setTrades((prev) => [msg.data as LargeTradeData, ...prev].slice(0, 100));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, [min_volume, max_volume]);

  return { trades, connected };
}

// ─── Wallet Transactions ──────────────────────────────────────────────────────

export function useWalletTxsStream(address: string | null | undefined) {
  const [txs, setTxs] = useState<unknown[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = buildWssUrl();
    if (!url || !address) return;

    const ws = new WebSocket(url, "echo-protocol");

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "SUBSCRIBE_WALLET_TXS", data: { address } }));
    };
    ws.onclose = () => {
      setConnected(false);
      try { ws.send(JSON.stringify({ type: "UNSUBSCRIBE_WALLET_TXS" })); } catch {}
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "WALLET_TXS_DATA") {
          setTxs((prev) => [msg.data, ...prev].slice(0, 200));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {} };
  }, [address]);

  // Allow re-subscribing on address change
  const unsubscribe = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "UNSUBSCRIBE_WALLET_TXS" }));
    }
  }, []);

  const wsRef = useRef<WebSocket | null>(null);

  return { txs, connected, unsubscribe };
}
