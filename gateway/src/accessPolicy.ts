import type { NextFunction, Request, Response } from 'express';
import { getTierForWallet, type ClawdTier } from './x402.js';

const LIVE_MUTATION_ROUTES = [
  /^\/api\/trade$/,
  /^\/api\/mint\/agent(?:\/.*)?$/,
  /^\/api\/clawd-gen$/,
  /^\/api\/skills\/register$/,
  /^\/api\/skills\/revoke\/[0-9a-f]{64}$/,
  /^\/api\/staking\/transaction$/,
];

const TIER_RANK: Record<ClawdTier, number> = {
  BEACHED: 0,
  SHORELINE: 1,
  SHALLOW: 2,
  DEEP: 3,
  ABYSS: 4,
};

const DEFAULT_MIN_TIER: ClawdTier = 'SHORELINE';

function productionModeEnabled(): boolean {
  const raw = process.env.CLAWD_PRODUCTION_MODE?.toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return process.env.NODE_ENV === 'production';
}

function adminKey(): string | null {
  return process.env.GATEWAY_ADMIN_KEY || process.env.X402_PAYMENT_KEY || null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice('bearer '.length).trim();
  return token || null;
}

function hasAdminAccess(req: Request): boolean {
  const configured = adminKey();
  if (!configured) return false;
  return req.header('x-gateway-api-key') === configured || bearerToken(req) === configured;
}

function minLiveTier(): ClawdTier {
  const raw = process.env.CLAWD_MIN_LIVE_TIER?.toUpperCase() as ClawdTier | undefined;
  return raw && raw in TIER_RANK ? raw : DEFAULT_MIN_TIER;
}

function isProtectedLiveMutation(req: Request): boolean {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return false;
  }
  return LIVE_MUTATION_ROUTES.some((route) => route.test(req.path));
}

export function accessPolicyStatus(): Record<string, unknown> {
  return {
    productionMode: productionModeEnabled(),
    minLiveTier: minLiveTier(),
    adminKeyConfigured: Boolean(adminKey()),
    publicRoutes: [
      '/health',
      '/api/agents/*',
      '/api/skills/catalog',
      '/api/staking/config',
      '/api/staking/portfolio/:owner',
      '/api/staking/assets/:owner',
      '/api/staking/agent/:assetId',
      '/explorer',
      '/staking',
    ],
    protectedLiveRoutes: LIVE_MUTATION_ROUTES.map((route) => route.source),
  };
}

export async function requireLiveAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!productionModeEnabled() || !isProtectedLiveMutation(req)) {
    next();
    return;
  }

  if (hasAdminAccess(req)) {
    res.setHeader('X-Clawd-Access', 'admin');
    next();
    return;
  }

  const wallet = req.header('x-clawd-wallet') || req.header('x-wallet-address');
  if (!wallet) {
    res.status(401).json({
      error: 'Live CLAWD access required',
      detail: 'Send X-Clawd-Wallet for holder gating or X-Gateway-API-Key for server-side admin access.',
      minLiveTier: minLiveTier(),
    });
    return;
  }

  const tier = await getTierForWallet(wallet);
  const required = minLiveTier();
  if (TIER_RANK[tier.tier] < TIER_RANK[required]) {
    res.status(402).json({
      error: 'CLAWD holder tier required',
      wallet,
      tier: tier.tier,
      clawdBalance: tier.clawdBalance,
      requiredTier: required,
      tokenMint: '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump',
    });
    return;
  }

  res.setHeader('X-Clawd-Access', tier.tier);
  next();
}
