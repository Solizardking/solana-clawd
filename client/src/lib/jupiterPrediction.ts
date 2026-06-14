// Jupiter Prediction Markets — typed client wrappers + sign/submit helper.
// All requests go through the /api/jupiter-prediction/* server proxy so the
// JUPITER_API_KEY stays server-side.
//
// Prices are in micro-USD: 1,000,000 native units = $1.00.

import { Connection, VersionedTransaction } from "@solana/web3.js";
import { HeliusService } from "./heliusService";
import { getConnection } from "./walletOps";

const BASE = "/api/jupiter-prediction";

// JupUSD mint — used as default deposit mint for prediction orders.
export const JUP_USD_MINT = "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD";
// USDC mint — alternate deposit mint.
export const USDC_PRED_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Convert micro-USD string/number → display dollars.
export function microUsdToDollars(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  return Number(v) / 1_000_000;
}

// Convert dollars (UI input) → micro-USD string.
export function dollarsToMicroUsd(usd: number): string {
  return String(Math.floor(usd * 1_000_000));
}

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") qs.set(k, String(v));
    }
  }
  const url = qs.toString() ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`prediction ${path} ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

async function send<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`prediction ${method} ${path} ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventCategory = "crypto" | "sports" | "politics" | "esports" | "culture" | "economics" | "tech";
export type EventFilter = "new" | "live" | "trending";
export type MarketStatus = "open" | "closed" | "settled" | "cancelled";

export type PredictionMarket = {
  marketId: string;
  status?: MarketStatus | string;
  result?: string | null;
  openTime?: number;
  closeTime?: number;
  resolveAt?: number | null;
  marketResultPubkey?: string | null;
  metadata?: {
    marketId?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    status?: string;
    result?: string;
    closeTime?: number;
    openTime?: number;
    isTeamMarket?: boolean;
    rulesPrimary?: string;
  };
  pricing?: {
    buyYesPriceUsd?: number;
    buyNoPriceUsd?: number;
    sellYesPriceUsd?: number;
    sellNoPriceUsd?: number;
    volume?: number;
  };
};

export type PredictionEvent = {
  eventId: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  isLive?: boolean;
  isActive?: boolean;
  category?: EventCategory | string;
  subcategory?: string;
  beginAt?: number;
  closeCondition?: string;
  markets?: PredictionMarket[];
  [k: string]: unknown;
};

export type PredictionPosition = {
  pubkey: string;
  ownerPubkey: string;
  marketId: string;
  isYes: boolean;
  contracts: string;
  openOrders?: number;
  claimable: boolean;
  claimed: boolean;
  claimedUsd?: string;
  openedAt?: number;
  updatedAt?: number;
  claimableAt?: number | null;
  settlementDate?: number | null;
  totalCostUsd?: string;
  sizeUsd?: string;
  avgPriceUsd?: string;
  markPriceUsd?: string | null;
  sellPriceUsd?: string | null;
  valueUsd?: string | null;
  payoutUsd?: string;
  pnlUsd?: string | null;
  pnlUsdPercent?: number | null;
  realizedPnlUsd?: number;
  feesPaidUsd?: string;
  eventMetadata?: { title?: string; imageUrl?: string; category?: string; [k: string]: unknown };
  marketMetadata?: { title?: string; status?: string; result?: string; [k: string]: unknown };
};

export type Paginated<T> = {
  data: T[];
  pagination?: { start: number; end: number; total: number; hasNext: boolean };
};

export type CreateOrderResponse = {
  transaction: string;
  txMeta?: { blockhash: string; lastValidBlockHeight: number };
  order: { orderPubkey: string; positionPubkey: string; contracts: string };
};

export type CloseOrClaimResponse = {
  transaction: string;
  position?: { pubkey: string; contracts: string; payoutAmountUsd?: string };
  blockhash: string;
  lastValidBlockHeight: number;
};

export type OrderStatus = {
  status: "pending" | "filled" | "failed" | string;
  filledContracts?: string;
  avgFillPriceUsd?: string;
  totalCostUsd?: string;
  feesPaidUsd?: string;
  createdAt?: number;
  filledAt?: number;
  [k: string]: unknown;
};

export type Orderbook = {
  yes: [number, number][];
  no: [number, number][];
  yes_dollars: [string, number][];
  no_dollars: [string, number][];
};

export type TradingStatus = { trading_active: boolean; [k: string]: unknown };

// ─── Events & Markets ────────────────────────────────────────────────────────

export const listPredictionEvents = (params: {
  category?: EventCategory;
  subcategory?: string;
  filter?: EventFilter;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  includeMarkets?: boolean;
  start?: number;
  end?: number;
} = {}) => get<Paginated<PredictionEvent>>("/events", params);

export const searchPredictionEvents = (query: string, limit = 10) =>
  get<Paginated<PredictionEvent>>("/events/search", { query, limit });

export const getPredictionEvent = (eventId: string) =>
  get<PredictionEvent>(`/events/${encodeURIComponent(eventId)}`);

export const getSuggestedEvents = (pubkey: string) =>
  get<Paginated<PredictionEvent>>(`/events/suggested/${encodeURIComponent(pubkey)}`);

export const getPredictionMarket = (marketId: string) =>
  get<PredictionMarket>(`/markets/${encodeURIComponent(marketId)}`);

export const getPredictionOrderbook = (marketId: string) =>
  get<Orderbook>(`/orderbook/${encodeURIComponent(marketId)}`);

export const getTradingStatus = () => get<TradingStatus>("/trading-status");

// ─── Orders ──────────────────────────────────────────────────────────────────

export type CreateBuyOrderInput = {
  ownerPubkey: string;
  marketId: string;
  isYes: boolean;
  depositAmountUsd: number;          // in dollars (UI value); converted to micro-USD here
  depositMint?: string;              // defaults to JupUSD
  contracts?: string | number;
};

export const createPredictionBuyOrder = (input: CreateBuyOrderInput) =>
  send<CreateOrderResponse>("POST", "/orders", {
    ownerPubkey: input.ownerPubkey,
    marketId: input.marketId,
    isYes: input.isYes,
    isBuy: true,
    depositAmount: dollarsToMicroUsd(input.depositAmountUsd),
    depositMint: input.depositMint ?? JUP_USD_MINT,
    ...(input.contracts != null ? { contracts: String(input.contracts) } : {}),
  });

export const listPredictionOrders = (ownerPubkey: string, start?: number, end?: number) =>
  get<Paginated<unknown>>("/orders", { ownerPubkey, start, end });

export const getPredictionOrderStatus = (orderPubkey: string) =>
  get<OrderStatus>(`/orders/status/${encodeURIComponent(orderPubkey)}`);

// ─── Positions ───────────────────────────────────────────────────────────────

export const listPredictionPositions = (params: {
  ownerPubkey: string;
  marketPubkey?: string;
  marketId?: string;
  isYes?: boolean;
  start?: number;
  end?: number;
}) => get<Paginated<PredictionPosition>>("/positions", params);

export const getPredictionPosition = (positionPubkey: string) =>
  get<PredictionPosition>(`/positions/${encodeURIComponent(positionPubkey)}`);

export const closePredictionPosition = (positionPubkey: string, ownerPubkey: string) =>
  send<CloseOrClaimResponse>("DELETE", `/positions/${encodeURIComponent(positionPubkey)}`, { ownerPubkey });

export const closeAllPredictionPositions = (ownerPubkey: string) =>
  send<CloseOrClaimResponse>("DELETE", "/positions", { ownerPubkey });

export const claimPredictionPayout = (positionPubkey: string, ownerPubkey: string) =>
  send<CloseOrClaimResponse>("POST", `/positions/${encodeURIComponent(positionPubkey)}/claim`, { ownerPubkey });

// ─── History ─────────────────────────────────────────────────────────────────

export const getPredictionHistory = (params: {
  ownerPubkey: string;
  positionPubkey?: string;
  start?: number;
  end?: number;
  id?: string;
}) => get<Paginated<unknown>>("/history", params);

// ─── Sign + submit helper ────────────────────────────────────────────────────
// Wallet adapters expose `signTransaction(VersionedTransaction)` — we deserialize
// the base64 tx returned by Jupiter, sign with the user's wallet, and submit via
// the project's RPC (Helius). Returns { signature, confirmed }.

export async function signAndSubmitPredictionTx(opts: {
  base64Tx: string;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  blockhash?: string;
  lastValidBlockHeight?: number;
  connection?: Connection;
}): Promise<{ signature: string; confirmed: boolean; error?: string }> {
  const connection = opts.connection ?? getConnection();
  const tx = VersionedTransaction.deserialize(Buffer.from(opts.base64Tx, "base64"));
  const signed = await opts.signTransaction(tx);
  const { signature } = await HeliusService.sendSignedTransaction(Buffer.from(signed.serialize()).toString("base64"), {
    maxRetries: 0,
    skipPreflight: true,
  });
  if (opts.blockhash && opts.lastValidBlockHeight != null) {
    const conf = await connection.confirmTransaction(
      { signature, blockhash: opts.blockhash, lastValidBlockHeight: opts.lastValidBlockHeight },
      "confirmed",
    );
    if (conf.value.err) {
      return { signature, confirmed: false, error: JSON.stringify(conf.value.err) };
    }
    return { signature, confirmed: true };
  }
  return { signature, confirmed: false };
}
