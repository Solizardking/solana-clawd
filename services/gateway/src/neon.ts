import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';

type InstallEventKind = 'install' | 'agent_install' | 'box_install' | 'gateway_install';

interface NeonJwtPayload {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  email?: string;
  [key: string]: unknown;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface Jwks {
  keys: Jwk[];
}

const router = express.Router();

const NEON_AUTH_URL = trimSlash(process.env.NEON_AUTH_URL ?? '');
const NEON_AUTH_JWKS = process.env.NEON_AUTH_JWKS ?? (NEON_AUTH_URL ? `${NEON_AUTH_URL}/.well-known/jwks.json` : '');
const NEON_DATA_API_URL = trimSlash(process.env.NEON_DATA_API_URL ?? '');
const NEON_DATA_API_KEY = process.env.NEON_DATA_API_KEY ?? process.env.NEON_DATA_API_TOKEN ?? '';
const NEON_ID = process.env.NEON_ID ?? '';
const NEON_AUTH_AUDIENCE = process.env.NEON_AUTH_AUDIENCE ?? '';
const NEON_TRACKING_TABLE = process.env.NEON_TRACKING_TABLE ?? 'agent_install_events';
const NEON_TRACKING_TOKEN = process.env.NEON_TRACKING_TOKEN ?? '';

let jwksCache: { fetchedAt: number; value: Jwks } | null = null;
const JWKS_CACHE_MS = 10 * 60 * 1000;

export function neonStatus(): Record<string, unknown> {
  return {
    neon: {
      idConfigured: Boolean(NEON_ID),
      authConfigured: Boolean(NEON_AUTH_URL && NEON_AUTH_JWKS),
      dataApiConfigured: Boolean(NEON_DATA_API_URL && NEON_DATA_API_KEY),
      trackingTable: NEON_TRACKING_TABLE,
      trackingTokenRequired: Boolean(NEON_TRACKING_TOKEN),
    },
  };
}

router.get('/api/neon/status', (_req, res) => {
  res.json(neonStatus());
});

router.get('/.well-known/clawd-neon.json', (_req, res) => {
  res.json({
    service: 'solana-clawd',
    auth: {
      enabled: Boolean(NEON_AUTH_URL && NEON_AUTH_JWKS),
      issuer: NEON_AUTH_URL || null,
      jwksConfigured: Boolean(NEON_AUTH_JWKS),
    },
    tracking: {
      endpoint: '/api/track/install',
      events: ['install', 'agent_install', 'box_install', 'gateway_install'],
    },
  });
});

router.post('/api/track/install', async (req, res) => {
  if (NEON_TRACKING_TOKEN && req.header('x-clawd-track-token') !== NEON_TRACKING_TOKEN) {
    res.status(401).json({ ok: false, error: 'tracking token required' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const event = normalizeEvent(body, req);

  try {
    const result = await writeInstallEvent(event);
    res.status(result.persisted ? 202 : 202).json({
      ok: true,
      persisted: result.persisted,
      mode: result.persisted ? 'neon-data-api' : 'dry-run',
      id: result.id,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/api/track/install', requireNeonAuth, async (_req, res) => {
  if (!NEON_DATA_API_URL || !NEON_DATA_API_KEY) {
    res.status(503).json({ ok: false, error: 'Neon Data API is not configured' });
    return;
  }

  const url = `${NEON_DATA_API_URL}/${encodeURIComponent(NEON_TRACKING_TABLE)}?select=*&order=created_at.desc&limit=100`;
  const response = await fetch(url, {
    headers: dataApiHeaders(),
  });
  const data = await response.json().catch(() => null);
  res.status(response.ok ? 200 : response.status).json({ ok: response.ok, data });
});

export async function requireNeonAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Bearer token required' });
    return;
  }

  try {
    const payload = await verifyNeonJwt(token);
    res.locals.neonAuth = payload;
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export default router;

function normalizeEvent(body: Record<string, unknown>, req: Request): Record<string, unknown> {
  const eventKind = String(body.event ?? body.kind ?? 'install') as InstallEventKind;
  const safeKind: InstallEventKind = ['install', 'agent_install', 'box_install', 'gateway_install'].includes(eventKind)
    ? eventKind
    : 'install';

  return {
    event: safeKind,
    source: safeString(body.source, 'github'),
    package_name: safeString(body.packageName ?? body.package_name, 'solana-clawd'),
    target: safeString(body.target, 'unknown'),
    version: safeString(body.version, 'unknown'),
    git_ref: safeString(body.gitRef ?? body.git_ref, 'unknown'),
    installer: safeString(body.installer, 'unknown'),
    runtime: safeString(body.runtime, 'unknown'),
    platform: safeString(body.platform, 'unknown'),
    node_version: safeString(body.nodeVersion ?? body.node_version, 'unknown'),
    user_agent: safeString(req.header('user-agent'), 'unknown'),
    ip_hash: hashIp(req.ip),
    created_at: new Date().toISOString(),
  };
}

async function writeInstallEvent(event: Record<string, unknown>): Promise<{ persisted: boolean; id?: string }> {
  if (!NEON_DATA_API_URL || !NEON_DATA_API_KEY) {
    return { persisted: false };
  }

  const url = `${NEON_DATA_API_URL}/${encodeURIComponent(NEON_TRACKING_TABLE)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...dataApiHeaders(),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Neon Data API write failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const rows = await response.json().catch(() => []) as Array<{ id?: string }>;
  return { persisted: true, id: rows[0]?.id };
}

function dataApiHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    apikey: NEON_DATA_API_KEY,
    authorization: `Bearer ${NEON_DATA_API_KEY}`,
  };
}

async function verifyNeonJwt(token: string): Promise<NeonJwtPayload> {
  if (!NEON_AUTH_JWKS) throw new Error('Neon Auth JWKS is not configured');
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('Malformed JWT');

  const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`Unsupported JWT alg: ${header.alg ?? 'unknown'}`);

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as NeonJwtPayload;
  const key = await findJwk(header.kid);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const publicKey = crypto.createPublicKey({ key: key as crypto.JsonWebKey, format: 'jwk' });
  const ok = verifier.verify(publicKey, base64UrlDecode(encodedSignature));
  if (!ok) throw new Error('JWT signature verification failed');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp <= now) throw new Error('JWT expired');
  if (payload.nbf && payload.nbf > now) throw new Error('JWT not active yet');
  if (NEON_AUTH_URL && payload.iss && trimSlash(payload.iss) !== NEON_AUTH_URL) throw new Error('JWT issuer mismatch');
  if (NEON_AUTH_AUDIENCE && !audienceMatches(payload.aud, NEON_AUTH_AUDIENCE)) throw new Error('JWT audience mismatch');

  return payload;
}

async function findJwk(kid?: string): Promise<Jwk> {
  const jwks = await getJwks();
  const match = jwks.keys.find((key) => key.kid === kid) ?? jwks.keys[0];
  if (!match) throw new Error('No JWKS keys available');
  return match;
}

async function getJwks(): Promise<Jwks> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_MS) return jwksCache.value;

  const response = await fetch(NEON_AUTH_JWKS);
  if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
  const value = await response.json() as Jwks;
  jwksCache = { fetchedAt: now, value };
  return value;
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  return header.slice('bearer '.length).trim() || null;
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function audienceMatches(actual: string | string[] | undefined, expected: string): boolean {
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 240) : fallback;
}

function hashIp(ip: string | undefined): string {
  return crypto.createHash('sha256').update(ip ?? 'unknown').digest('hex').slice(0, 24);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
