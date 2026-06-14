// JupiterZ client — typed wrappers around the /api/jupiterz/* server proxy.
// All calls go through the server so the JUPITER_API_KEY (if set) stays secret.

const BASE = "/api/jupiterz";

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") qs.set(k, String(v));
    }
  }
  const url = qs.toString() ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`jupiterz ${path} failed: ${r.status} ${body}`);
  }
  return r.json();
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type JzTransaction = {
  id?: string;
  request_id?: string;
  slot?: number;
  signature?: string;
  taker?: string;
  maker?: string;
  input_mint?: string;
  output_mint?: string;
  input_amount?: string;
  output_amount?: string;
  fee_amount?: string;
  created_at?: string;
  [k: string]: unknown;
};

export const getJupiterZTransactionById       = (id: string) => get<JzTransaction>(`/transactions/${encodeURIComponent(id)}`);
export const getJupiterZLatestTransaction     = ()           => get<JzTransaction>("/transactions/latest");
export const getJupiterZTransactionStats      = ()           => get<Record<string, unknown>>("/transactions/stats");
export const getJupiterZTransactionByRequest  = (requestId: string) => get<JzTransaction>("/transactions/by-request-id", { request_id: requestId });
export const getJupiterZTransactionsBySlot    = (startSlot: number, endSlot: number) =>
  get<JzTransaction[]>("/transactions/slot-range", { start_slot: startSlot, end_slot: endSlot });

// ─── 7-day stats ─────────────────────────────────────────────────────────────

export type JzDailyStat = {
  date: string;
  volume?: string | number;
  fees?: string | number;
  trade_count?: number;
  average_fee?: string | number;
  [k: string]: unknown;
};

export type JzComprehensiveStats = {
  volume?: string | number;
  fees?: string | number;
  trade_count?: number;
  average_fee?: string | number;
  daily?: JzDailyStat[];
  [k: string]: unknown;
};

export const getJupiterZ7dVolume        = () => get<{ volume: string | number }>("/stats/7d/volume");
export const getJupiterZ7dFees          = () => get<{ fees: string | number }>("/stats/7d/fees");
export const getJupiterZ7dTradeCount    = () => get<{ trade_count: number }>("/stats/7d/trade-count");
export const getJupiterZ7dDaily         = () => get<JzDailyStat[]>("/stats/7d/daily");
export const getJupiterZ7dAverageFee    = () => get<{ average_fee: string | number }>("/stats/7d/average-fee");
export const getJupiterZ7dComprehensive = () => get<JzComprehensiveStats>("/stats/7d/comprehensive");

// ─── Token & pair analytics ──────────────────────────────────────────────────

export type JzTopPair = {
  input_mint: string;
  output_mint: string;
  volume: string | number;
  trade_count?: number;
  [k: string]: unknown;
};

export type JzTopMaker = {
  maker: string;
  volume: string | number;
  trade_count?: number;
  [k: string]: unknown;
};

// `limit` is clamped server-side to [1, 100]; default 10.
export const getJupiterZTopPairs    = (limit?: number) => get<JzTopPair[]>("/stats/7d/top-pairs",  { limit });
export const getJupiterZTopMakers   = (limit?: number) => get<JzTopMaker[]>("/stats/7d/top-makers", { limit });
export const getJupiterZTokenVolume = (tokenMint: string) =>
  get<{ token_id: string; volume: string | number; trade_count?: number }>(
    "/stats/7d/token-volume",
    { token_id: tokenMint },
  );
