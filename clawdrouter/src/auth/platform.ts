import type { ClawdRouterConfig } from '../types.js';
import type { ClawdHolderTier } from '../token/clawd-gate.js';

export type PlatformValidationResult =
  | {
      ok: true;
      apiKey: {
        id: string;
        keyPrefix: string;
        scopes: string[];
      };
      user: {
        id: string;
        walletAddress: string | null;
      };
      clawd: {
        serviceAccess: boolean;
        adminAccess: boolean;
        holderTier: ClawdHolderTier;
        balance: number;
        maxRequestsPerHour: number | null;
      };
    }
  | {
      ok: false;
      error: string;
      reason?: string;
    };

export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const authorization = firstHeader(headers['authorization']);
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice('bearer '.length).trim();
    if (token) return token;
  }

  const direct = firstHeader(headers['x-api-key']);
  return direct?.trim() || null;
}

export function isPlatformAuthEnabled(config: ClawdRouterConfig): boolean {
  return config.authMode === 'platform';
}

export async function validatePlatformApiKey(
  apiKey: string,
  config: ClawdRouterConfig,
  route: string,
  requiredScopes: string[] = ['inference:write'],
): Promise<{ status: number; result: PlatformValidationResult }> {
  if (!config.validationUrl || !config.internalSecret) {
    return {
      status: 500,
      result: {
        ok: false,
        error: 'CLAWDROUTER_VALIDATION_URL and CLAWDROUTER_INTERNAL_SECRET are required in platform auth mode',
      },
    };
  }

  const url = joinUrl(config.validationUrl, '/api/auth/validate-key');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ClawdRouter/0.2.0',
      'X-ClawdRouter-Internal-Secret': config.internalSecret,
    },
    body: JSON.stringify({
      apiKey,
      requiredScopes,
      route,
    }),
  });

  const text = await response.text();
  let result: PlatformValidationResult;
  try {
    result = JSON.parse(text) as PlatformValidationResult;
  } catch {
    result = {
      ok: false,
      error: text.slice(0, 500) || `Validation request failed with ${response.status}`,
    };
  }

  return { status: response.status, result };
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
