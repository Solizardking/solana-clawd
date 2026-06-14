const BASE = "/api/imperial";

export class ImperialApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ImperialApiError";
    this.status = status;
  }
}

type ImperialResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  detail?: string;
  message?: string;
  meta?: {
    stale?: boolean;
    source?: string;
  };
};

export type ImperialStatus = {
  upstream: {
    ok: boolean;
    stale: boolean;
    data: unknown;
    error?: string;
  };
  rpc: {
    ok: boolean;
    provider: string;
    slot: number | null;
    error: string | null;
  };
  imperialBase: string;
  imperialTradingConfigured: boolean;
  phoenixUnderwriter: number;
};

export type ImperialRouteSide = "long" | "short";

export type ImperialFundingEntry = {
  symbol?: string;
  venue?: string;
  source?: unknown;
  longFundingRatePerHourPercent?: number | null;
  shortFundingRatePerHourPercent?: number | null;
  longBorrowRatePerHourPercent?: number | null;
  shortBorrowRatePerHourPercent?: number | null;
  [key: string]: unknown;
};

export type ImperialMarkPrice = {
  symbol?: string;
  venue?: string;
  source?: unknown;
  price?: number;
  fetchedAtUnixMs?: number;
  [key: string]: unknown;
};

export type ImperialRouteQuote = {
  asset?: string;
  symbol?: string;
  side?: string;
  notional?: number;
  underwriter?: number;
  venue?: string;
  route?: unknown;
  [key: string]: unknown;
};

export type ImperialDepthLevel = [number, number] | { price?: number; size?: number; quantity?: number };

export type ImperialDepthSnapshot = {
  symbol?: string;
  bids?: ImperialDepthLevel[];
  asks?: ImperialDepthLevel[];
  bestBid?: number;
  bestAsk?: number;
  mid?: number;
  [key: string]: unknown;
};

export type ImperialPosition = {
  symbol?: string;
  side?: string | number;
  sizeUsd?: number | string;
  entryPrice?: number | string;
  markPrice?: number | string;
  unrealizedPnl?: number | string;
  profileIndex?: number;
  underwriter?: number;
  [key: string]: unknown;
};

export type ImperialOrder = {
  symbol?: string;
  side?: string | number;
  action?: string | number;
  orderType?: string | number;
  sizeUsd?: number | string;
  triggerPrice?: number | string;
  status?: string;
  underwriter?: number;
  profileIndex?: number;
  [key: string]: unknown;
};

async function readError(response: Response): Promise<never> {
  let message = response.statusText || "Imperial request failed";
  try {
    const body = (await response.json()) as { error?: string; detail?: string; message?: string };
    message = body.detail || body.error || body.message || message;
  } catch {
    const text = await response.text().catch(() => "");
    if (text) message = text;
  }
  throw new ImperialApiError(response.status, message);
}

async function imperialFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): Promise<ImperialResponse<T>> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), { credentials: "include" });
  if (!response.ok) await readError(response);

  const body = (await response.json()) as ImperialResponse<T> | T;
  if (body && typeof body === "object" && "success" in body && body.success === false) {
    throw new ImperialApiError(
      response.status,
      body.detail || body.error || body.message || "Imperial request failed",
    );
  }

  if (body && typeof body === "object" && "data" in body) {
    return body as ImperialResponse<T>;
  }
  return { success: true, data: body as T };
}

export function arrayData<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const objectValue = value as Record<string, unknown>;
  for (const key of ["data", "items", "rows", "markets", "positions", "orders", "trades", "results"]) {
    const nested = objectValue[key];
    if (Array.isArray(nested)) return nested as T[];
    if (nested && typeof nested === "object") {
      const nestedArray = arrayData<T>(nested);
      if (nestedArray.length) return nestedArray;
    }
  }
  const recordRows = Object.entries(objectValue)
    .filter(([key, nested]) => !["meta", "source", "success", "error", "message"].includes(key) && nested && typeof nested === "object")
    .flatMap(([key, nested]) => {
      if (Array.isArray(nested)) return nested as T[];
      const nestedArray = arrayData<T>(nested);
      if (nestedArray.length) return nestedArray;
      return [{ symbol: key, ...(nested as Record<string, unknown>) } as T];
    });
  if (recordRows.length) return recordRows;
  return [];
}

export function objectData<T extends Record<string, unknown>>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const objectValue = value as Record<string, unknown>;
  if (objectValue.data && typeof objectValue.data === "object" && !Array.isArray(objectValue.data)) {
    return objectValue.data as T;
  }
  return objectValue as T;
}

function flattenVenueRows<T extends { symbol?: string; venue?: string }>(value: unknown): T[] {
  const rows = arrayData<Record<string, unknown>>(value);
  return rows.flatMap((row) => {
    const symbol = String(row.symbol ?? row.asset ?? row.market ?? "").replace(/-PERP$/i, "").toUpperCase();
    const venueRows = Object.entries(row)
      .filter(([key, nested]) => !["symbol", "asset", "market"].includes(key) && nested && typeof nested === "object" && !Array.isArray(nested))
      .map(([venue, nested]) => ({
        symbol,
        venue,
        ...(nested as Record<string, unknown>),
      }) as T);
    return venueRows.length ? venueRows : [row as T];
  });
}

export async function fetchImperialStatus(): Promise<ImperialStatus> {
  const { data } = await imperialFetch<ImperialStatus>(`${BASE}/status`);
  if (!data) throw new ImperialApiError(502, "Imperial status response was empty");
  return data;
}

export async function fetchImperialFundingRates(): Promise<ImperialFundingEntry[]> {
  const { data } = await imperialFetch<unknown>(`${BASE}/funding-rates`);
  return flattenVenueRows<ImperialFundingEntry>(data);
}

export async function fetchImperialMarkPrices(): Promise<ImperialMarkPrice[]> {
  const { data } = await imperialFetch<unknown>(`${BASE}/mark-prices`);
  return flattenVenueRows<ImperialMarkPrice>(data);
}

export async function fetchImperialRoute(params: {
  asset: string;
  side: ImperialRouteSide;
  notional: number;
  desiredLeverage: number;
}): Promise<ImperialRouteQuote | null> {
  const { data } = await imperialFetch<unknown>(`${BASE}/route`, params);
  return objectData<ImperialRouteQuote>(data);
}

export async function fetchImperialPhoenixDepth(symbol?: string): Promise<ImperialDepthSnapshot[]> {
  const { data } = await imperialFetch<unknown>(`${BASE}/phoenix/depth`, {
    symbols: symbol ? symbol.toUpperCase() : undefined,
  });
  const rows = arrayData<ImperialDepthSnapshot>(data);
  if (rows.length) return rows;
  const object = objectData<ImperialDepthSnapshot>(data);
  return object ? [object] : [];
}

export async function fetchImperialPositions(params?: {
  wallet?: string | null;
  profileIndex?: number;
}): Promise<ImperialPosition[]> {
  const { data } = await imperialFetch<unknown>(`${BASE}/positions`, {
    wallet: params?.wallet ?? undefined,
    profileIndex: params?.profileIndex,
  });
  return arrayData<ImperialPosition>(data);
}

export async function fetchImperialOrders(params?: {
  wallet?: string | null;
  profileIndex?: number;
}): Promise<ImperialOrder[]> {
  const { data } = await imperialFetch<unknown>(`${BASE}/orders`, {
    wallet: params?.wallet ?? undefined,
    profileIndex: params?.profileIndex,
  });
  return arrayData<ImperialOrder>(data);
}

export function toNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function getVenueLabel(value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "2" || normalized === "phoenix") return "Phoenix";
  if (normalized === "0" || normalized === "jupiter") return "Jupiter";
  if (normalized === "1" || normalized === "flash" || normalized === "flash_trade") return "Flash";
  if (normalized === "3" || normalized === "gmtrade") return "GMTrade";
  if (normalized === "4" || normalized === "flashv2" || normalized === "flash_v2" || normalized === "flash trade v2") return "Flash V2";
  return value == null || value === "" ? "Unknown" : String(value);
}
