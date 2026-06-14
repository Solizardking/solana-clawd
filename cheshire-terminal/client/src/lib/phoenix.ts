// Phoenix Perps — REST API client + WebSocket hooks.
// All REST calls proxy through /api/phoenix (server injects Flight builder auth).
// WebSocket connects directly to wss://perp-api.phoenix.trade/v1/ws (public endpoint).

import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";

export const PHOENIX_WS_URL = "wss://perp-api.phoenix.trade/v1/ws";
export const PHOENIX_BUILDER_AUTHORITY =
  import.meta.env.VITE_PHOENIX_BUILDER_AUTHORITY ||
  import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY ||
  import.meta.env.VITE_PHOENIX_LEGACY_BUILDER_AUTHORITY ||
  null;
export const PHOENIX_BUILDER_PDA_INDEX = Number(
  import.meta.env.VITE_PHOENIX_BUILDER_PDA_INDEX ??
    import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_PDA_INDEX ??
    0,
);
export const PHOENIX_BUILDER_SUBACCOUNT_INDEX = Number(
  import.meta.env.VITE_PHOENIX_BUILDER_SUBACCOUNT_INDEX ??
    import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX ??
    0,
);
export const PHOENIX_BUILDER_TRADER_ACCOUNT =
  import.meta.env.VITE_PHOENIX_BUILDER_TRADER_ACCOUNT ||
  import.meta.env.VITE_PHOENIX_FLIGHT_FEE_COLLECTOR_TRADER ||
  null;

export const RPC_URL =
  import.meta.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

export const MARKET_ORDER: Record<string, number> = { SOL: 0, BTC: 1, ETH: 2 };

export class PhoenixApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PhoenixApiError";
    this.status = status;
  }
}

export const isPhoenixAuthError = (error: unknown) =>
  error instanceof PhoenixApiError && (error.status === 401 || error.status === 403);

// ─── REST types ───────────────────────────────────────────────────────────────

export type LeverageTier = {
  maxLeverage: number;
  maxSizeBaseLots: number;
  limitOrderRiskFactor: number;
};

export type RiskFactors = {
  maintenance: number;
  backstop: number;
  highRisk: number;
  cancelOrder: number;
  upnl: number;
  upnlForWithdrawals: number;
};

export type PhoenixMarket = {
  symbol: string;
  assetId: string;
  marketPubkey: string;
  splinePubkey: string;
  baseLotsDecimals: number;
  tickSize: number;
  openInterestCapBaseLots: number;
  maxLiquidationSizeBaseLots: number;
  fundingPeriodSeconds: number;
  fundingIntervalSeconds: number;
  maxFundingRatePerIntervalPercentage: number;
  makerFee: number;
  takerFee: number;
  marketStatus: string;
  isolatedOnly: boolean;
  leverageTiers: LeverageTier[];
  riskFactors: RiskFactors;
};

export type CommodityMarketTransition = {
  [key: string]: unknown;
};

export type TraderPosition = {
  symbol: string;
  positionSize: string;
  entryPrice: string;
  unrealizedPnl: string;
  liquidationPrice: string;
  maintenanceMargin: string;
  initialMargin: string;
  positionValue: string;
};

export type TraderSubaccount = {
  collateralBalance: string;
  effectiveCollateral: string;
  portfolioValue: string;
  unrealizedPnl: string;
  riskState: string;
  riskTier: string;
  state: string;
  positions: TraderPosition[];
};

export type TraderState = {
  authority: string;
  pdaIndex: number;
  traders: TraderSubaccount[];
};

export type PnlPoint = {
  cumulativePnl: number;
  cumulativeFundingPayment: number;
  cumulativeTakerFee: number;
  unrealizedPnl: number;
  timestamp: number;
};

export type OrderHistoryItem = {
  marketSymbol: string;
  side: "bid" | "ask";
  status: "active" | "filled" | "cancelled" | "expired";
  price: string;
  baseQty: string;
  filledBaseQty: string;
  remainingBaseQty: string;
  placedAt: string;
  completedAt: string | null;
  isReduceOnly: boolean;
};

export type TradeHistoryItem = {
  marketSymbol: string;
  side: string;
  price: string;
  baseLotsDelta: string;
  fees: string;
  realizedPnl: string;
  liquidity: "maker" | "taker";
  timestamp: string;
  signature: string;
};

// Raw instruction from the Phoenix REST API
type RawInstruction = {
  data: number[];
  keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  programId: string;
};

type PlaceOrderResponse = {
  instructions: RawInstruction[];
  estimatedLiquidationPriceUsd: number | null;
};

// ─── REST helpers ─────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api/phoenix${path}`, { credentials: "include" });
  if (!r.ok) {
    const detail = await r.text().catch(() => r.statusText);
    throw new PhoenixApiError(r.status, `Phoenix ${r.status}: ${detail || path}`);
  }
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api/phoenix${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new PhoenixApiError(r.status, `Phoenix ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}

// ─── Public market fetchers ───────────────────────────────────────────────────

export async function fetchPhoenixMarkets(): Promise<PhoenixMarket[]> {
  const json = await get<PhoenixMarket[]>("/markets");
  if (!Array.isArray(json)) throw new Error("Unexpected Phoenix markets response");
  return json;
}

export async function fetchNextCommodityMarketTransition(): Promise<CommodityMarketTransition> {
  return get<CommodityMarketTransition>("/market/next-commodity-market-transition");
}

export const sortedActiveMarkets = (markets: PhoenixMarket[]) =>
  [...markets]
    .filter((m) => m.marketStatus === "active")
    .sort((a, b) => {
      const diff = (MARKET_ORDER[a.symbol] ?? 99) - (MARKET_ORDER[b.symbol] ?? 99);
      return diff !== 0 ? diff : a.symbol.localeCompare(b.symbol);
    });

// ─── Trader REST fetchers ─────────────────────────────────────────────────────

export const fetchTraderState = (authority: string, pdaIndex = 0) =>
  get<TraderState>(`/trader/${encodeURIComponent(authority)}/state?pdaIndex=${pdaIndex}`);

export const fetchTraderPnl = (
  authority: string,
  params: { resolution?: string; startTime?: number; endTime?: number; limit?: number } = {},
) => {
  const qs = new URLSearchParams({ resolution: params.resolution ?? "1h" });
  if (params.startTime) qs.set("startTime", String(params.startTime));
  if (params.endTime) qs.set("endTime", String(params.endTime));
  if (params.limit) qs.set("limit", String(params.limit));
  return get<PnlPoint[]>(`/trader/${encodeURIComponent(authority)}/pnl?${qs}`);
};

export const fetchOrderHistory = (
  authority: string,
  params: { limit?: number; cursor?: string; marketSymbol?: string } = {},
) => {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 25) });
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.marketSymbol) qs.set("marketSymbol", params.marketSymbol);
  return get<{ data: OrderHistoryItem[]; hasMore: boolean; nextCursor: string | null }>(
    `/trader/${encodeURIComponent(authority)}/order-history?${qs}`,
  );
};

export const fetchTradeHistory = (
  authority: string,
  params: { limit?: number; cursor?: string; marketSymbol?: string } = {},
) => {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 25) });
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.marketSymbol) qs.set("marketSymbol", params.marketSymbol);
  return get<{ data: TradeHistoryItem[]; hasMore: boolean; nextCursor: string | null }>(
    `/trader/${encodeURIComponent(authority)}/trades-history?${qs}`,
  );
};

// ─── Instruction helpers ──────────────────────────────────────────────────────

function rawToInstruction(raw: RawInstruction): TransactionInstruction {
  const keys: AccountMeta[] = raw.keys.map((k) => ({
    pubkey: new PublicKey(k.pubkey),
    isSigner: k.isSigner,
    isWritable: k.isWritable,
  }));
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys,
    data: Buffer.from(raw.data),
  });
}

export type PlaceOrderParams = {
  authority: string;
  symbol: string;
  side: "bid" | "ask";
  quantity: number;
  price?: number;
  pdaIndex?: number;
  traderSubaccountIndex?: number;
  isReduceOnly?: boolean;
  isPostOnly?: boolean;
};

export type OrderResult = {
  instructions: TransactionInstruction[];
  estimatedLiquidationPriceUsd: number | null;
};

export async function buildPlaceLimitOrder(params: PlaceOrderParams): Promise<OrderResult> {
  const res = await post<PlaceOrderResponse>("/ix/place-limit-order-enhanced", {
    authority: params.authority,
    symbol: params.symbol,
    side: params.side,
    quantity: params.quantity,
    price: params.price,
    baseUnits: String(params.quantity),
    priceUsd: params.price == null ? undefined : String(params.price),
    pdaIndex: params.pdaIndex ?? 0,
    traderPdaIndex: params.pdaIndex ?? 0,
    traderSubaccountIndex: params.traderSubaccountIndex ?? 0,
    isReduceOnly: params.isReduceOnly ?? false,
    isPostOnly: params.isPostOnly ?? false,
  });
  return {
    instructions: res.instructions.map(rawToInstruction),
    estimatedLiquidationPriceUsd: res.estimatedLiquidationPriceUsd,
  };
}

export async function buildPlaceMarketOrder(params: Omit<PlaceOrderParams, "price" | "isPostOnly">): Promise<OrderResult> {
  const res = await post<PlaceOrderResponse>("/ix/place-market-order-enhanced", {
    authority: params.authority,
    symbol: params.symbol,
    side: params.side,
    quantity: params.quantity,
    pdaIndex: params.pdaIndex ?? 0,
    isReduceOnly: params.isReduceOnly ?? false,
  });
  return {
    instructions: res.instructions.map(rawToInstruction),
    estimatedLiquidationPriceUsd: res.estimatedLiquidationPriceUsd,
  };
}

// ─── Trader registration / collateral ─────────────────────────────────────────

export async function checkTraderExists(authority: string): Promise<boolean> {
  const r = await fetch(`/api/phoenix/trader/${encodeURIComponent(authority)}/exists`, {
    credentials: "include",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new PhoenixApiError(r.status, `Phoenix ${r.status}: ${text}`);
  }
  const j = await r.json() as { registered?: boolean };
  return j.registered ?? false;
}

export async function buildRegisterTrader(authority: string): Promise<TransactionInstruction[]> {
  const res = await post<{ instructions: RawInstruction[] }>("/ix/register-trader", { authority });
  return res.instructions.map(rawToInstruction);
}

export async function buildDeposit(authority: string, usdcAmount: number): Promise<TransactionInstruction[]> {
  const res = await post<{ instructions: RawInstruction[] }>("/ix/deposit", { authority, amount: usdcAmount });
  return res.instructions.map(rawToInstruction);
}

export async function buildWithdraw(authority: string, usdcAmount: number): Promise<TransactionInstruction[]> {
  const res = await post<{ instructions: RawInstruction[] }>("/ix/withdraw", { authority, amount: usdcAmount });
  return res.instructions.map(rawToInstruction);
}

export async function buildCancelAll(authority: string, symbol: string): Promise<TransactionInstruction[]> {
  const res = await post<{ instructions: RawInstruction[] }>("/ix/cancel-all", { authority, symbol });
  return res.instructions.map(rawToInstruction);
}

export async function activateInviteCode(authority: string, code: string): Promise<void> {
  await post("/invite/activate", { authority, code });
}

// Unified builder used by the panel
export type UnifiedOrderParams = {
  authority: string;
  symbol: string; // e.g. "SOL-PERP"
  side: "bid" | "ask";
  quantity: number;
  price?: number; // undefined = market order
  pdaIndex?: number;
};

export async function buildOrder(params: UnifiedOrderParams): Promise<OrderResult> {
  if (params.price !== undefined) return buildPlaceLimitOrder(params as PlaceOrderParams);
  return buildPlaceMarketOrder(params);
}

// ─── Transaction builder ──────────────────────────────────────────────────────

export function ixsToTransaction(
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
  blockhash: string,
): Transaction {
  return new Transaction({ recentBlockhash: blockhash, feePayer }).add(...instructions);
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export const baseLotsToBase = (lots: number, decimals: number) => lots / 10 ** decimals;

export const formatBaseLotSize = (decimals: number) =>
  (1 / 10 ** decimals).toFixed(Math.min(decimals, 8));

export const formatTickSize = (tickSize: number, decimals: number) =>
  `$${(tickSize * 10 ** (decimals - 6)).toFixed(6)}`;

export const formatRiskPct = (v: number) => `${v.toFixed(2)}%`;

export const fmtUsd = (v: string | number) =>
  `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtBase = (v: string | number, decimals = 4) =>
  Number(v).toLocaleString("en-US", { maximumFractionDigits: decimals });

// ─── WebSocket hooks ──────────────────────────────────────────────────────────

export type AllMids = Record<string, number>;

export function usePhoenixAllMids(): AllMids {
  const [mids, setMids] = useState<AllMids>({});
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (!alive) return;
      const socket = new WebSocket(PHOENIX_WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "subscribe", subscription: { channel: "allMids" } }));
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { channel?: string; mids?: AllMids };
          if (msg.channel === "allMids" && msg.mids) setMids(msg.mids);
        } catch { /* ignore parse errors */ }
      };

      socket.onclose = () => {
        if (alive) retryTimeout = setTimeout(connect, 3_000);
      };
    }

    connect();
    return () => {
      alive = false;
      clearTimeout(retryTimeout);
      ws.current?.close();
    };
  }, []);

  return mids;
}

export type OBLevel = [number, number]; // [price, size]
export type Orderbook = { bids: OBLevel[]; asks: OBLevel[]; mid: number | null };

export function usePhoenixOrderbook(symbol: string | null): Orderbook {
  const [ob, setOb] = useState<Orderbook>({ bids: [], asks: [], mid: null });
  const ws = useRef<WebSocket | null>(null);
  const symRef = useRef(symbol);
  symRef.current = symbol;

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (!alive) return;
      const socket = new WebSocket(PHOENIX_WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({ type: "subscribe", subscription: { channel: "orderbook", symbol } }),
        );
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            channel?: string;
            symbol?: string;
            orderbook?: { bids: OBLevel[]; asks: OBLevel[]; mid: number };
          };
          if (msg.channel === "orderbook" && msg.symbol === symRef.current && msg.orderbook) {
            setOb({ bids: msg.orderbook.bids, asks: msg.orderbook.asks, mid: msg.orderbook.mid });
          }
        } catch { /* ignore */ }
      };

      socket.onclose = () => {
        if (alive) retryTimeout = setTimeout(connect, 3_000);
      };
    }

    setOb({ bids: [], asks: [], mid: null });
    connect();
    return () => {
      alive = false;
      clearTimeout(retryTimeout);
      ws.current?.close();
    };
  }, [symbol]);

  return ob;
}

export type TraderStateWs = {
  collateral: string;
  portfolioValue: string;
  unrealizedPnl: string;
  riskState: string;
  positions: TraderPosition[];
} | null;

export function usePhoenixTraderStateWs(authority: string | null, pdaIndex = 0): TraderStateWs {
  const [state, setState] = useState<TraderStateWs>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!authority) return;
    let alive = true;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (!alive) return;
      const socket = new WebSocket(PHOENIX_WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "subscribe",
            subscription: { channel: "traderState", authority, traderPdaIndex: pdaIndex },
          }),
        );
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            channel?: string;
            messageType?: string;
            subaccounts?: {
              collateral?: string;
              portfolioValue?: string;
              unrealizedPnl?: string;
              riskState?: string;
              positions?: TraderPosition[];
            }[];
          };
          if (msg.channel === "traderState" && msg.messageType === "snapshot" && msg.subaccounts?.[0]) {
            const s = msg.subaccounts[0];
            setState({
              collateral: s.collateral ?? "0",
              portfolioValue: s.portfolioValue ?? "0",
              unrealizedPnl: s.unrealizedPnl ?? "0",
              riskState: s.riskState ?? "unknown",
              positions: s.positions ?? [],
            });
          }
        } catch { /* ignore */ }
      };

      socket.onclose = () => {
        if (alive) retryTimeout = setTimeout(connect, 3_000);
      };
    }

    setState(null);
    connect();
    return () => {
      alive = false;
      clearTimeout(retryTimeout);
      ws.current?.close();
    };
  }, [authority, pdaIndex]);

  return state;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function getPhoenixNonce(walletPubkey: string) {
  return get<{ nonce_id: string; message: string; expires_at: string }>(
    `/auth/nonce?wallet_pubkey=${encodeURIComponent(walletPubkey)}`,
  );
}

export async function loginPhoenix(nonceId: string, signature: string, walletPubkey: string) {
  return post<{ access_token: string; refresh_token: string; expires_in: number }>(
    "/auth/login",
    { nonce_id: nonceId, signature, wallet_pubkey: walletPubkey },
  );
}

// Convenience: sign the nonce message with the wallet adapter and return a JWT
export type WalletSignFn = (message: Uint8Array) => Promise<Uint8Array>;

export async function authenticatePhoenix(
  walletPubkey: string,
  signMessage: WalletSignFn,
) {
  const { nonce_id, message } = await getPhoenixNonce(walletPubkey);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = await signMessage(msgBytes);
  const signature = Buffer.from(sigBytes).toString("base64");
  return loginPhoenix(nonce_id, signature, walletPubkey);
}

export function usePhoenixAuth() {
  const [token, setToken] = useState<string | null>(null);
  const login = useCallback(async (walletPubkey: string, signMessage: WalletSignFn) => {
    const { access_token } = await authenticatePhoenix(walletPubkey, signMessage);
    setToken(access_token);
    return access_token;
  }, []);
  const logout = useCallback(async () => {
    if (!token) return;
    await post("/auth/logout", {}).catch(() => null);
    setToken(null);
  }, [token]);
  return { token, login, logout };
}
