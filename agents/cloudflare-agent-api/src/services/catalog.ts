// ═══════════════════════════════════════════════════════════════
// CATALOG SERVICE - Proxy + KV-cached solana-clawd agents catalog
// Catalog: https://x402.wtf/api/agents  (agents-catalog.json)
// Gateway: https://clawd-gateway.fly.dev (skills, registry, identity)
// Auth: CLAWD_AUTH_URL / CAAP protocol
// ═══════════════════════════════════════════════════════════════

import type { Env } from '../index';

const CATALOG_BASE_DEFAULT = 'https://x402.wtf/api/agents';
const GATEWAY_BASE_DEFAULT = 'https://clawd-gateway.fly.dev';
const CATALOG_TTL_SECONDS = 300; // 5 min

export interface CatalogAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  [key: string]: unknown;
}

export interface CatalogResponse {
  success: boolean;
  source: string;
  cachedAt?: string;
  data: unknown;
}

export class CatalogService {
  private catalogBase: string;
  private gatewayBase: string;
  private kv: KVNamespace;

  constructor(private env: Env) {
    this.catalogBase = env.CLAWD_CATALOG_URL?.replace(/\/$/, '') ?? CATALOG_BASE_DEFAULT;
    this.gatewayBase = env.CLAWD_GATEWAY_URL?.replace(/\/$/, '') ?? GATEWAY_BASE_DEFAULT;
    this.kv = env.SESSIONS; // reuse SESSIONS KV with "catalog:" prefix
  }

  // ─────────────────────────────────────────────────
  // CATALOG (x402.wtf/api/agents)
  // ─────────────────────────────────────────────────

  getCatalog(): Promise<CatalogResponse> {
    return this.cachedFetch('catalog:all', this.catalogBase);
  }

  getAgent(id: string): Promise<CatalogResponse> {
    return this.cachedFetch(`catalog:agent:${id}`, `${this.catalogBase}/${id}`);
  }

  async getStats(): Promise<CatalogResponse> {
    const full = await this.getCatalog();
    if (!full.success) return full;

    const raw = full.data as {
      stats?: unknown;
      hub?: unknown;
      metaplexSkill?: unknown;
    } | null;

    return {
      success: true,
      source: full.source,
      cachedAt: full.cachedAt,
      data: {
        stats: raw?.stats,
        hub: raw?.hub,
        metaplexSkill: raw?.metaplexSkill,
      },
    };
  }

  // ─────────────────────────────────────────────────
  // GATEWAY (clawd-gateway.fly.dev)
  // ─────────────────────────────────────────────────

  getSkills(query?: string): Promise<CatalogResponse> {
    const url = query
      ? `${this.gatewayBase}/api/skills?${new URLSearchParams({ q: query }).toString()}`
      : `${this.gatewayBase}/api/skills`;
    return this.cachedFetch('gateway:skills', url);
  }

  getSkillsCatalog(): Promise<CatalogResponse> {
    return this.cachedFetch('gateway:skills:catalog', `${this.gatewayBase}/api/skills/catalog`);
  }

  getSkillBySlug(slug: string): Promise<CatalogResponse> {
    return this.cachedFetch(`gateway:skill:slug:${slug}`, `${this.gatewayBase}/api/skills/slug/${slug}`);
  }

  getSkillById(id: string): Promise<CatalogResponse> {
    return this.cachedFetch(`gateway:skill:id:${id}`, `${this.gatewayBase}/api/skills/${id}`);
  }

  getSkillKinds(): Promise<CatalogResponse> {
    return this.cachedFetch('gateway:skills:kinds', `${this.gatewayBase}/api/skills/kinds`);
  }

  getRegistry(): Promise<CatalogResponse> {
    return this.cachedFetch('gateway:registry', `${this.gatewayBase}/registry`);
  }

  getIdentity(): Promise<CatalogResponse> {
    return this.cachedFetch('gateway:identity', `${this.gatewayBase}/identity`);
  }

  getAiPlugin(): Promise<CatalogResponse> {
    return this.cachedFetch('gateway:ai-plugin', `${this.gatewayBase}/.well-known/ai-plugin.json`);
  }

  getGatewayHealth(): Promise<CatalogResponse> {
    return this.cachedFetch('gateway:health', `${this.gatewayBase}/health`);
  }

  // ─────────────────────────────────────────────────
  // KV-CACHED FETCH
  // ─────────────────────────────────────────────────

  private async cachedFetch(kvKey: string, url: string): Promise<CatalogResponse> {
    try {
      const cached = await this.kv.get(kvKey, 'text');
      if (cached) {
        const parsed = JSON.parse(cached) as { data: unknown; cachedAt: string };
        return { success: true, source: 'cache', cachedAt: parsed.cachedAt, data: parsed.data };
      }
    } catch {
      // cache miss or parse error — fall through
    }

    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'cloudflare-agent-api/2.1.0',
        },
        // Cloudflare edge cache hint
        cf: { cacheTtl: CATALOG_TTL_SECONDS, cacheEverything: false },
      });

      if (!res.ok) {
        return {
          success: false,
          source: 'upstream',
          data: { error: `Upstream ${res.status}: ${res.statusText}`, url },
        };
      }

      const data: unknown = await res.json();
      const cachedAt = new Date().toISOString();

      this.kv.put(kvKey, JSON.stringify({ data, cachedAt }), {
        expirationTtl: CATALOG_TTL_SECONDS,
      }).catch(() => {/* ignore KV write errors */});

      return { success: true, source: 'upstream', cachedAt, data };
    } catch (err) {
      return {
        success: false,
        source: 'upstream',
        data: {
          error: err instanceof Error ? err.message : 'Fetch failed',
          url,
        },
      };
    }
  }

  // ─────────────────────────────────────────────────
  // CACHE INVALIDATION
  // ─────────────────────────────────────────────────

  async invalidate(scope?: 'catalog' | 'gateway' | 'all'): Promise<void> {
    const catalogKeys = ['catalog:all'];
    const gatewayKeys = ['gateway:skills', 'gateway:skills:catalog', 'gateway:skills:kinds', 'gateway:registry', 'gateway:identity', 'gateway:health'];

    let keys: string[];
    if (scope === 'catalog') keys = catalogKeys;
    else if (scope === 'gateway') keys = gatewayKeys;
    else keys = [...catalogKeys, ...gatewayKeys];

    await Promise.allSettled(keys.map(k => this.kv.delete(k)));
  }
}
