/**
 * gateway/src/x402.ts — x402.wtf API client + $CLAWD tier gating.
 *
 * x402.wtf is the CLAWD payment gateway.  This module provides:
 *   - Tier detection based on $CLAWD holdings
 *   - Token price from the x402 API
 *   - Generic authenticated API calls
 *   - Wallet linking (store wallet → user mapping)
 *
 * Env:
 *   X402_API_URL      — base URL (default: https://x402.wtf/api)
 *   X402_PAYMENT_KEY  — optional server-side API key
 *
 * Tiers (mirrors ClawdRouter tiers):
 *   BEACHED   — 0 $CLAWD
 *   SHORELINE — 1–999 $CLAWD
 *   SHALLOW   — 1k–9,999
 *   DEEP      — 10k–99,999
 *   ABYSS     — 100k+
 */

const BASE = (process.env.X402_API_URL ?? 'https://x402.wtf/api').replace(/\/$/, '');
const API_KEY = process.env.X402_PAYMENT_KEY;
const CLAWD_MINT = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';

export type ClawdTier = 'BEACHED' | 'SHORELINE' | 'SHALLOW' | 'DEEP' | 'ABYSS';

export interface TierInfo {
  tier: ClawdTier;
  clawdBalance: number;
  walletAddress: string | null;
  features: string[];
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function x402Fetch<T>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const resp = await fetch(`${BASE}${path}`, {
    method: opts?.method ?? 'GET',
    headers,
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(`x402 ${path} → ${resp.status}: ${txt}`);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------

function tierFromBalance(balance: number): ClawdTier {
  if (balance >= 100_000) return 'ABYSS';
  if (balance >= 10_000)  return 'DEEP';
  if (balance >= 1_000)   return 'SHALLOW';
  if (balance >= 1)       return 'SHORELINE';
  return 'BEACHED';
}

const TIER_FEATURES: Record<ClawdTier, string[]> = {
  BEACHED:   ['Price lookup', 'Portfolio view'],
  SHORELINE: ['Price lookup', 'Portfolio view', 'Alerts'],
  SHALLOW:   ['Price lookup', 'Portfolio view', 'Alerts', 'NL trading'],
  DEEP:      ['All features', 'Priority execution', 'Copy trading'],
  ABYSS:     ['All features', 'Priority execution', 'Copy trading', 'API access'],
};

export function getTierEmoji(tier: ClawdTier): string {
  return { BEACHED: '🏖', SHORELINE: '🌊', SHALLOW: '🐡', DEEP: '🦞', ABYSS: '🌑' }[tier];
}

// ---------------------------------------------------------------------------
// $CLAWD price
// ---------------------------------------------------------------------------

interface PriceResponse {
  data?: { value?: number; priceChange24h?: number; liquidity?: number; volume24h?: number };
}

export async function getClawdPrice(): Promise<{
  price: number;
  change24h: number;
  liquidity: number;
  volume24h: number;
} | null> {
  try {
    // Try x402 internal first, fall back to Birdeye-compatible endpoint
    const data = await x402Fetch<PriceResponse>(`/token/${CLAWD_MINT}/price`);
    if (data?.data?.value) {
      return {
        price: data.data.value,
        change24h: data.data.priceChange24h ?? 0,
        liquidity: data.data.liquidity ?? 0,
        volume24h: data.data.volume24h ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wallet-based tier check
// ---------------------------------------------------------------------------

export async function getTierForWallet(walletAddress: string): Promise<TierInfo> {
  try {
    // Ask x402.wtf for CLAWD balance for this wallet
    const resp = await x402Fetch<{ clawd?: number }>(`/wallet/${walletAddress}/clawd`);
    const balance = resp.clawd ?? 0;
    const tier = tierFromBalance(balance);
    return {
      tier,
      clawdBalance: balance,
      walletAddress,
      features: TIER_FEATURES[tier],
    };
  } catch {
    // Fallback: unknown wallet → BEACHED
    return { tier: 'BEACHED', clawdBalance: 0, walletAddress, features: TIER_FEATURES.BEACHED };
  }
}

export function tierSummary(info: TierInfo): string {
  const emoji = getTierEmoji(info.tier);
  const lines = [
    `${emoji} *Tier: ${info.tier}*`,
    `$CLAWD held: \`${info.clawdBalance.toLocaleString()}\``,
    `Wallet: \`${info.walletAddress ?? 'not linked'}\``,
    '',
    '*Features unlocked:*',
    ...info.features.map(f => `  • ${f}`),
  ];

  if (info.tier === 'BEACHED' || info.tier === 'SHORELINE') {
    lines.push('', `[🛒 Buy $CLAWD](https://pump.fun/coin/${CLAWD_MINT}) to unlock more features`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generic API proxy — lets the gateway forward calls to x402.wtf
// ---------------------------------------------------------------------------

export async function proxyCall<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<T> {
  return x402Fetch<T>(path, { method, body });
}

// ---------------------------------------------------------------------------
// Agent registry helpers (x402.wtf/agents)
// ---------------------------------------------------------------------------

interface AgentRecord {
  id: string;
  name: string;
  pubkey: string;
  capabilities: string[];
  tier: string;
}

export async function listAgents(limit = 20): Promise<AgentRecord[]> {
  try {
    const resp = await x402Fetch<{ agents?: AgentRecord[] }>(`/agents?limit=${limit}`);
    return resp.agents ?? [];
  } catch {
    return [];
  }
}
