const BASE = "/api/birdeye/perps";

export class BirdeyePerpsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BirdeyePerpsApiError";
    this.status = status;
  }
}

type BirdeyePerpsResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    stale?: boolean;
    exchange?: string;
  };
};

export type BirdeyePerpsStatus = {
  configured: boolean;
  exchange: string;
  dataAvailability?: string;
  docs?: Record<string, string>;
};

async function readError(response: Response): Promise<never> {
  let message = response.statusText || "Request failed";

  try {
    const body = (await response.json()) as { error?: string; message?: string };
    message = body.error || body.message || message;
  } catch {
    const text = await response.text().catch(() => "");
    if (text) message = text;
  }

  throw new BirdeyePerpsApiError(response.status, message);
}

async function birdeyePerpsFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<BirdeyePerpsResponse<T>> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), { credentials: "include" });
  if (!response.ok) {
    await readError(response);
  }

  const body = (await response.json()) as BirdeyePerpsResponse<T> | T;
  if (body && typeof body === "object" && "success" in body && body.success === false) {
    throw new BirdeyePerpsApiError(
      response.status,
      body.error || body.message || "Birdeye perps request failed",
    );
  }

  if (body && typeof body === "object" && "data" in body) {
    return body as BirdeyePerpsResponse<T>;
  }

  return { success: true, data: body as T };
}

function arrayData<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  return [];
}

export interface BirdeyePerpsTokenEntry {
  token: string;
  long_io: number;
  short_io: number;
  open_interest: number;
  margin: number;
  margin_used: number;
  entry_margin: number;
  unrealized_pnl: number;
  bias: number;
  leverage: number;
  bias_text: string;
}

export interface BirdeyePerpsTokenOverview {
  price: number;
  position_count: number;
  open_interest: number;
  long_liquidation_1h: number;
  short_liquidation_1h: number;
  long_liquidation_4h: number;
  short_liquidation_4h: number;
  long_liquidation_1d: number;
  short_liquidation_1d: number;
  long_liquidation_7d: number;
  short_liquidation_7d: number;
}

export interface BirdeyePerpsOpenPosition {
  wallet?: string;
  wallet_first_trade?: number;
  token: string;
  leverage_type: "isolated" | "cross";
  leverage_value: number;
  max_leverage: number;
  entry_price: number;
  mark_price: number;
  liquidation_price?: number | null;
  margin_used: number;
  position_value: number;
  roe?: number | null;
  size: number;
  unrealized_pnl: number;
  cum_funding_since_open: number;
  cum_funding_since_change: number;
  open_time: number;
}

export interface BirdeyePerpsLiquidationBucket {
  low_price: number;
  high_price: number;
  position_count: number;
  long_liq_size: number;
  long_liq_value: number;
  short_liq_size: number;
  short_liq_value: number;
  cum_long_liq_size: number;
  cum_long_liq_value: number;
  cum_short_liq_size: number;
  cum_short_liq_value: number;
}

export interface BirdeyePerpsWalletOverview {
  perp_equity: number;
  long_value: number;
  short_value: number;
  unrealized_pnl: number;
  order_count: number;
  order_count_90d: number;
  win: number;
  win_90d: number;
  loss: number;
  loss_90d: number;
  volume_usd: number;
  volume_90d_usd: number;
  open_volume_usd: number;
  open_volume_90d_usd: number;
  realized_pnl: number;
  realized_pnl_90d: number;
  funding_fee: number;
  funding_fee_90d: number;
  first_trade: number;
  last_trade: number;
  open_value: number;
  total_pnl: number;
  total_pnl_90d: number;
  win_rate: number;
  win_rate_90d: number;
  roe: number;
  roi: number;
  roi_90d: number;
  bias: number;
  leverage: number;
  bias_text: string;
}

export type BirdeyePerpsWalletPosition = BirdeyePerpsOpenPosition;

export interface TokenListParams {
  time_frame?: "4h" | "1d" | "7d" | "30d" | "all";
  sort_by?: "long_io" | "short_io" | "open_interest";
  sort_type?: "desc" | "asc";
  offset?: number;
  limit?: number;
}

export interface OpenPositionsParams {
  token: string;
  sort_by?: "position_value" | "open_time";
  sort_type?: "desc" | "asc";
  offset?: number;
  limit?: number;
}

export async function fetchPerpsStatus(): Promise<BirdeyePerpsStatus> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsStatus>(`${BASE}/status`);
  return data ?? { configured: false, exchange: "hyperliquid" };
}

export async function fetchPerpsTokenList(
  params?: TokenListParams,
): Promise<BirdeyePerpsTokenEntry[]> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsTokenEntry[]>(
    `${BASE}/token-list`,
    {
      time_frame: params?.time_frame ?? "all",
      sort_by: params?.sort_by ?? "open_interest",
      sort_type: params?.sort_type ?? "desc",
      offset: params?.offset ?? 0,
      limit: params?.limit ?? 20,
    },
  );
  return arrayData<BirdeyePerpsTokenEntry>(data);
}

export async function fetchPerpsTokenOverview(
  token: string,
): Promise<BirdeyePerpsTokenOverview> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsTokenOverview>(
    `${BASE}/token-overview/${encodeURIComponent(token.toUpperCase())}`,
  );
  if (!data || typeof data !== "object") {
    throw new BirdeyePerpsApiError(502, "Birdeye token overview response was empty");
  }
  return data;
}

export async function fetchPerpsOpenPositions(
  params: OpenPositionsParams,
): Promise<BirdeyePerpsOpenPosition[]> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsOpenPosition[]>(
    `${BASE}/token-open-positions/${encodeURIComponent(params.token.toUpperCase())}`,
    {
      sort_by: params.sort_by ?? "open_time",
      sort_type: params.sort_type ?? "desc",
      offset: params.offset ?? 0,
      limit: params.limit ?? 10,
    },
  );
  return arrayData<BirdeyePerpsOpenPosition>(data);
}

export async function fetchPerpsLiquidationMap(
  token: string,
): Promise<BirdeyePerpsLiquidationBucket[]> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsLiquidationBucket[]>(
    `${BASE}/token-liquidation-map/${encodeURIComponent(token.toUpperCase())}`,
  );
  return arrayData<BirdeyePerpsLiquidationBucket>(data);
}

export async function fetchPerpsWalletOverview(
  wallet: string,
): Promise<BirdeyePerpsWalletOverview> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsWalletOverview>(
    `${BASE}/wallet/overview`,
    { wallet },
  );
  if (!data || typeof data !== "object") {
    throw new BirdeyePerpsApiError(502, "Birdeye wallet overview response was empty");
  }
  return data;
}

export async function fetchPerpsWalletOpenPositions(
  wallet: string,
): Promise<BirdeyePerpsWalletPosition[]> {
  const { data } = await birdeyePerpsFetch<BirdeyePerpsWalletPosition[]>(
    `${BASE}/wallet/open-positions`,
    { wallet },
  );
  return arrayData<BirdeyePerpsWalletPosition>(data);
}
