// Meteora CLAWD/SOL Swap — API client + WebSocket hook

export interface PoolInfo {
  poolAddress: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAmount: string;
  tokenBAmount: string;
  clawdPerSol: number;
  solPerClawd: number;
  clawdUsdEstimate: number | null;
  feeBps: number;
  liquidity: string;
  liquidityReady: boolean;
  collectFeeMode: number;
  collectFeeModeName: string;
  compoundingFeeBps: number;
  feeCollectionToken: string;
  note: string;
  warning?: string | null;
  livePrice: LivePrice | null;
}

export interface LivePrice {
  poolAddress: string;
  clawdPerSol: number;
  solPerClawd: number;
  clawdReserve: number;
  solReserve: number;
  timestamp: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  minOutputAmount: number;
  priceImpactPct: number;
  feeAmount: number;
  feeBps: number;
  swapInRaw: string;
  swapOutRaw: string;
  minSwapOutRaw: string;
  dex: string;
  feePct: string;
  poolAddress: string;
}

export interface QuoteResponse {
  meteora: SwapQuote;
  jupiter: { outAmount: number; priceImpactPct: number; dex: string } | null;
  comparison: {
    savingsPct: number | null;
    savingsAmount: number | null;
    meteoraIsBetter: boolean | null;
    message: string;
  };
}

export interface BuildSwapResponse {
  transaction: string;
  lastValidBlockHeight: number;
  quote: SwapQuote;
  poolAddress: string;
}

export interface SubmitResponse {
  signature: string;
  explorerUrl: string;
}

export interface BuildAddLiquidityResponse {
  transaction: string;
  lastValidBlockHeight: number;
  poolAddress: string;
  positionAddress: string;
  positionNft: string;
  liquidityDelta: string;
  clawdAmount: number;
  solAmount: number;
}

export interface PoolDataResponse {
  poolAddress: string;
  chain: PoolInfo;
  indexed: {
    source: string;
    pool: unknown | null;
    history: {
      startTime: number | null;
      endTime: number | null;
      timeframe: string | null;
      buckets: Array<{ timestamp: number; volume: number; fees: number; protocol_fees: number }>;
      volume24h: number;
      fees24h: number;
      protocolFees24h: number;
    } | null;
    summary: {
      tvl: number | null;
      currentPrice: number | null;
      volume24h: number | null;
      fees24h: number | null;
      protocolFees24h: number | null;
      feeTvlRatio24h: number | null;
      baseFeePct: number | null;
      protocolFeePct: number | null;
    } | null;
    warning?: string;
  };
}

const BASE = '/api/meteora-swap';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error((data as any)?.error ?? `HTTP ${r.status}`);
  return data as T;
}

export const meteoraSwap = {
  status: () => apiFetch<{
    poolConfigured: boolean;
    poolAddress: string | null;
    livePrice: LivePrice | null;
    liquidityReady: boolean;
    liquidity: string | null;
    poolReserves: { clawd: string; sol: string } | null;
    collectFeeMode: number | null;
    collectFeeModeName: string | null;
    compoundingFeeBps: number | null;
    warning: string | null;
    rpcEndpoint: string;
    feeCollectionToken: string;
  }>('/status'),

  poolInfo: () => apiFetch<PoolInfo>('/pool-info'),

  quote: (
    inputMint: string,
    outputMint: string,
    amount: number,
    slippage = 1,
  ) => apiFetch<QuoteResponse>(
    `/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippage=${slippage}`,
  ),

  buildSwap: (body: {
    inputMint: string;
    outputMint: string;
    amount: number;
    userWallet: string;
    slippage?: number;
  }) => apiFetch<BuildSwapResponse>('/build-swap', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  buildAddLiquidity: (body: {
    clawdAmount: number;
    solAmount: number;
    userWallet: string;
    slippagePct?: number;
  }) => apiFetch<BuildAddLiquidityResponse>('/build-add-liquidity', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  submit: (signedTransaction: string) =>
    apiFetch<SubmitResponse>('/submit', {
      method: 'POST',
      body: JSON.stringify({ signedTransaction }),
    }),

  livePrice: () => apiFetch<LivePrice>('/live-price'),

  poolData: () => apiFetch<PoolDataResponse>('/pool-data'),

  createPool: (body: {
    clawdAmount: number;
    solAmount: number;
    startFeeBps?: number;
    endFeeBps?: number;
    compoundingFeeBps?: number;
  }) => apiFetch<{ success: boolean; poolAddress: string; signatures: string[]; note: string }>(
    '/create-pool',
    { method: 'POST', body: JSON.stringify(body) },
  ),

  seedLiquidity: (body: {
    clawdAmount: number;
    solAmount: number;
    adminKey?: string;
  }) => apiFetch<{
    success: boolean;
    poolAddress: string;
    positionAddress: string;
    positionNft: string;
    liquidityDelta: string;
    signature: string;
    explorerUrl: string;
    liquidityReady: boolean;
  }>('/seed-liquidity', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
};

// ── WebSocket hook helpers ────────────────────────────────────────────────────

export type PriceCallback = (price: LivePrice) => void;

export function subscribeHeliusPrice(
  poolAddress: string,
  onPrice: PriceCallback,
  onError?: (e: Event) => void,
): () => void {
  // Use server-sent events pattern via polling for same-origin setup
  // Real-time updates flow through Helius WS on the backend; frontend polls live-price
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  async function tick() {
    try {
      const res = await fetch(`${BASE}/live-price`);
      if (res.ok) {
        const data = (await res.json()) as LivePrice;
        onPrice(data);
      }
    } catch { /* ignore */ }
    if (!stopped) timer = setTimeout(tick, 3000);
  }

  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
