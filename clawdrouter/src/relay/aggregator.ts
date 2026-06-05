import type { ClawdRouterConfig, UsageStats } from '../types.js';

export interface RelaySnapshotOptions {
  wallet: string;
  holderTier: string;
  clawdBalance: number;
  stats: UsageStats;
}

export async function buildRelaySnapshot(
  config: ClawdRouterConfig,
  options: RelaySnapshotOptions,
): Promise<Record<string, unknown>> {
  const [solana, perps, x402] = await Promise.all([
    buildSolanaRelay(config),
    buildPerpsRelay(config),
    buildX402ApiRelay(config),
  ]);

  return {
    service: config.relayName,
    publicUrl: config.relayPublicUrl,
    generatedAt: new Date().toISOString(),
    router: {
      profile: config.profile,
      network: config.network,
      wallet: options.wallet,
      requests: options.stats.totalRequests,
      totalCostUSDC: options.stats.totalCostUSDC,
      totalSavedUSDC: options.stats.totalSavedUSDC,
      openRouter: {
        enabled: config.openRouterEnabled,
        configured: Boolean(config.openRouterApiKey),
      },
    },
    clawd: {
      tokenMint: config.clawdTokenMint,
      holderTier: options.holderTier,
      balance: options.clawdBalance,
      thresholds: config.holderThresholds,
    },
    solana,
    perps,
    x402,
  };
}

export async function buildSolanaRelay(config: ClawdRouterConfig): Promise<Record<string, unknown>> {
  const [health, slot, epochInfo, performance, supply, clawdSupply] = await Promise.all([
    rpcCall(config, 'getHealth', []),
    rpcCall(config, 'getSlot', []),
    rpcCall(config, 'getEpochInfo', []),
    rpcCall(config, 'getRecentPerformanceSamples', [5]),
    rpcCall(config, 'getSupply', []),
    rpcCall(config, 'getTokenSupply', [config.clawdTokenMint]),
  ]);

  return {
    rpcUrl: redactRpcUrl(config.solanaRpcUrl),
    network: config.network,
    health,
    slot,
    epochInfo,
    recentPerformanceSamples: performance,
    supply,
    clawdTokenSupply: clawdSupply,
  };
}

export async function buildPerpsRelay(config: ClawdRouterConfig): Promise<Record<string, unknown>> {
  const sources = await Promise.all(
    config.perpsSources.map(async source => ({
      source,
      status: await fetchJson(config, joinUrl(source, '/status')),
      frontend: await fetchJson(config, joinUrl(source, '/frontend')),
      health: await fetchJson(config, joinUrl(source, '/health')),
    })),
  );

  return {
    sources,
    phoenix: {
      apiUrl: config.perpsApiUrl,
      health: await fetchJson(config, joinUrl(config.perpsApiUrl, '/health')),
      markPrices: await fetchJson(config, joinUrl(config.perpsApiUrl, '/phoenix/mark-prices')),
      markets: await fetchJson(config, joinUrl(config.perpsApiUrl, '/phoenix/markets')),
      depth: await fetchJson(config, joinUrl(config.perpsApiUrl, '/phoenix/depth')),
    },
  };
}

export async function buildX402ApiRelay(config: ClawdRouterConfig): Promise<Record<string, unknown>> {
  const base = config.x402ApiUrl || 'https://x402.wtf';
  const clawdMint = config.clawdTokenMint;
  const endpoints = [
    { name: 'health', url: joinUrl(base, '/api/health') },
    { name: 'routerCatalog', url: joinUrl(base, '/api/router/catalog') },
    { name: 'dexscreenerService', url: joinUrl(base, '/api/dexscreener/solana/service') },
    { name: 'dexscreenerH24', url: joinUrl(base, '/api/dexscreener/solana?rank=h24') },
    { name: 'tokenData', url: joinUrl(base, `/api/dex/token-data?address=${encodeURIComponent(clawdMint)}&type=15m`) },
    { name: 'ohlcv', url: joinUrl(base, `/api/dex/ohlcv?address=${encodeURIComponent(clawdMint)}&type=15m`) },
    { name: 'perpsV1', url: joinUrl(base, '/api/perps/v1') },
  ];

  const results = await Promise.all(
    endpoints.map(async endpoint => ({
      name: endpoint.name,
      url: endpoint.url,
      status: await fetchJson(config, endpoint.url),
    })),
  );

  return {
    baseUrl: base,
    generatedAt: new Date().toISOString(),
    endpoints: results,
  };
}

async function rpcCall(
  config: ClawdRouterConfig,
  method: string,
  params: unknown[],
): Promise<Record<string, unknown>> {
  const primary = await fetchJson(config, config.solanaRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `clawdrouter-${method}`, method, params }),
  });

  const body = primary.body as { error?: { code?: number } } | undefined;
  if (primary.ok || body?.error?.code !== -32429 || config.solanaRpcUrl === 'https://api.mainnet-beta.solana.com') {
    return primary;
  }

  return {
    ...await fetchJson(config, 'https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: `clawdrouter-${method}-fallback`, method, params }),
    }),
    fallbackFrom: redactRpcUrl(config.solanaRpcUrl),
  };
}

async function fetchJson(
  config: ClawdRouterConfig,
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.relayTimeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 500);
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function redactRpcUrl(url: string): string {
  return url.replace(/([?&](?:api-key|key)=)[^&]+/i, '$1[redacted]');
}
