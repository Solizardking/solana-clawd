export type FlashTradeSide = "LONG" | "SHORT";

export type FlashPriceInfo = {
  price?: number;
  priceUi?: string | number;
  marketSession?: string;
  [key: string]: unknown;
};

export type FlashTokenInfo = {
  symbol: string;
  mintKey?: string;
  pythTicker?: string;
  decimals?: number;
};

export type FlashStatus = {
  network: "mainnet";
  apiBase: string;
  erRpc: string;
  baseRpc: string;
  routing: {
    trading: string;
    setupWithdrawal: string;
  };
};

export type FlashQuote = {
  newLeverage: string;
  newEntryPrice: string;
  newLiquidationPrice: string;
  entryFee: string;
  entryFeeBeforeDiscount: string;
  openPositionFeePercent: string;
  availableLiquidity: string;
  youPayUsdUi: string;
  youRecieveUsdUi: string;
  marginFeePercentage: string;
  outputAmountUi: string;
  transactionBase64?: string | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function flashJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/flash${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !json?.success) throw new Error(json?.error || `Flash API ${response.status}`);
  return json.data as T;
}

export function fetchFlashStatus() {
  return flashJson<FlashStatus>("/status");
}

export function fetchFlashTokens() {
  return flashJson<FlashTokenInfo[]>("/tokens");
}

export function fetchFlashPrices() {
  return flashJson<Record<string, FlashPriceInfo>>("/prices");
}

export function fetchFlashQuote(params: {
  symbol: string;
  side: FlashTradeSide;
  collateralUsd: number;
  leverage: number;
}) {
  return flashJson<FlashQuote>("/quote", {
    method: "POST",
    body: JSON.stringify({
      outputTokenSymbol: params.symbol,
      tradeType: params.side,
      inputAmountUi: params.collateralUsd,
      leverage: params.leverage,
    }),
  });
}
