/**
 * ClawdRouter — Local Proxy Server
 * OpenAI-compatible API proxy on localhost:8402
 *
 * Integrated with:
 *   • 15-dimension request scoring (<1ms, fully local)
 *   • OpenRouter upstream (real model routing to all providers)
 *   • $CLAWD SPL token gating (holder tiers control access)
 *   • x402 USDC micropayments on Solana (for non-holders)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extractApiKey, isPlatformAuthEnabled, validatePlatformApiKey } from '../auth/platform.js';
import { estimateCostPerRequest, getModel, MODEL_REGISTRY, resolveModelAlias } from '../models/registry.js';
import { buildPerpsRelay, buildRelaySnapshot, buildSolanaRelay, buildX402ApiRelay } from '../relay/aggregator.js';
import { routeRequest } from '../router/profiles.js';
import { scoreRequest } from '../router/scorer.js';
import {
  canAccessModelTier,
  checkHolderStatusCached,
  type ClawdHolderStatus,
  type ClawdHolderTier,
} from '../token/clawd-gate.js';
import type {
  ChatCompletionRequest,
  ClawdRouterConfig,
  ClawdWallet,
  RoutingMeta,
  UsageStats,
} from '../types.js';
import { proxyToOpenRouter, toOpenRouterModelId } from '../upstream/openrouter.js';
import { PaymentTracker } from '../x402/payment.js';

type ChatAuthContext = {
  mode: 'local' | 'platform';
  rateLimitKey: string;
  holderTier: ClawdHolderTier;
  clawdBalance: number;
  maxRequestsPerHour: number;
  apiKeyPrefix?: string;
  userId?: string;
  walletAddress?: string | null;
};

// ── Proxy Server ────────────────────────────────────────────────────

export class ClawdRouterProxy {
  private server: ReturnType<typeof createServer> | null = null;
  private config: ClawdRouterConfig;
  private wallet: ClawdWallet;
  private tracker: PaymentTracker;
  private stats: UsageStats;
  private holderStatus: ClawdHolderStatus | null = null;
  private rateLimitCounter: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(config: ClawdRouterConfig, wallet: ClawdWallet) {
    this.config = config;
    this.wallet = wallet;
    this.tracker = new PaymentTracker();
    this.stats = createEmptyStats();
  }

  async start(): Promise<void> {
    // Check $CLAWD holder status on startup
    await this.refreshHolderStatus();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          console.error('  ✗ Request error:', err.message);
          sendJSON(res, 500, { error: { message: err.message, type: 'server_error' } });
        });
      });

      this.server.listen(this.config.port, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getStats(): UsageStats {
    return { ...this.stats };
  }

  getTracker(): PaymentTracker {
    return this.tracker;
  }

  getHolderStatus(): ClawdHolderStatus | null {
    return this.holderStatus;
  }

  async refreshHolderStatus(): Promise<ClawdHolderStatus | null> {
    try {
      this.holderStatus = await checkHolderStatusCached(
        this.wallet.publicKey,
        this.config.solanaRpcUrl,
        this.config.heliusApiKey || undefined,
        this.config.holderThresholds,
      );
      return this.holderStatus;
    } catch {
      // Silently fail — holder status will be null (treated as FREE)
      return null;
    }
  }

  // ── Request Handler ─────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment, X-Clawd-Wallet');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';

    // Route handlers
    if (url === '/' || url === '/health') {
      return this.handleHealth(res);
    }

    if (url === '/v1/models' || url === '/models') {
      return this.handleModels(req, res);
    }

    if (url === '/v1/chat/completions' || url === '/chat/completions') {
      return this.handleChatCompletion(req, res);
    }

    if (url === '/v1/stats' || url === '/stats') {
      return this.handleStats(res);
    }

    if (url === '/v1/clawd/status' || url === '/clawd/status') {
      return this.handleClawdStatus(res);
    }

    if (url === '/v1/clawd/access' || url === '/clawd/access') {
      return this.handleAccessCheck(req, res);
    }

    if (url === '/v1/relay' || url === '/relay') {
      return this.handleRelay(res);
    }

    if (url === '/v1/relay/solana' || url === '/relay/solana') {
      return this.handleSolanaRelay(res);
    }

    if (url === '/v1/relay/perps' || url === '/relay/perps') {
      return this.handlePerpsRelay(res);
    }

    if (url === '/v1/relay/x402' || url === '/relay/x402' || url === '/v1/x402/status') {
      return this.handleX402Relay(res);
    }

    if (url === '/v1/agent-key' || url === '/agent-key') {
      return this.handleAgentKey(res);
    }

    // 404 for everything else
    sendJSON(res, 404, {
      error: {
        message: `Unknown endpoint: ${url}. Use /v1/chat/completions for OpenAI-compatible requests.`,
        type: 'invalid_request',
      },
    });
  }

  // ── Health Check ──────────────────────────────────────────────────

  private handleHealth(res: ServerResponse): void {
    const tier = this.holderStatus?.tier ?? 'FREE';
    sendJSON(res, 200, {
      status: 'ok',
      service: 'clawdrouter',
      version: '0.2.0',
      wallet: this.wallet.publicKey,
      profile: this.config.profile,
      network: this.config.network,
      uptime: Math.floor((Date.now() - this.stats.sessionStart) / 1000),
      requests: this.stats.totalRequests,
      clawd: {
        token: this.config.clawdTokenMint,
        holderTier: tier,
        balance: this.holderStatus?.balance ?? 0,
        premiumUnlocked: this.holderStatus?.premiumModelsUnlocked ?? false,
      },
      openRouter: {
        enabled: this.config.openRouterEnabled,
        configured: !!this.config.openRouterApiKey,
      },
      controlPlane: {
        authMode: this.config.authMode,
        validationUrl: this.config.validationUrl || null,
        x402ApiUrl: this.config.x402ApiUrl,
        internalSecretConfigured: !!this.config.internalSecret,
      },
    });
  }

  // ── Model Listing ─────────────────────────────────────────────────

  private handleModels(req: IncomingMessage, res: ServerResponse): void {
    const holderTier = this.holderStatus?.tier ?? 'FREE';

    const models = MODEL_REGISTRY
      .filter(m => m.enabled)
      .map(m => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.provider,
        permission: [],
        root: m.id,
        parent: null,
        // $CLAWD access info
        x_clawd: {
          tier: m.tier,
          accessible: canAccessModelTier(holderTier, m.tier),
          free: m.free,
          openRouterId: toOpenRouterModelId(m.id),
        },
      }));

    // Add the auto model at the top
    models.unshift({
      id: 'clawdrouter/auto',
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'clawdrouter',
      permission: [],
      root: 'clawdrouter/auto',
      parent: null,
      x_clawd: {
        tier: 'budget' as const,
        accessible: true,
        free: false,
        openRouterId: 'clawdrouter/auto',
      },
    });

    sendJSON(res, 200, {
      object: 'list',
      data: models,
      x_clawd_holder: {
        tier: holderTier,
        balance: this.holderStatus?.balance ?? 0,
        totalAccessible: models.filter(m => m.x_clawd.accessible).length,
        totalModels: models.length,
      },
    });
  }

  // ── Chat Completions ──────────────────────────────────────────────

  private async handleChatCompletion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      sendJSON(res, 405, { error: { message: 'Method not allowed', type: 'invalid_request' } });
      return;
    }

    // Parse request body
    const body = await readBody(req);
    let request: ChatCompletionRequest;

    try {
      request = JSON.parse(body);
    } catch {
      sendJSON(res, 400, { error: { message: 'Invalid JSON body', type: 'invalid_request' } });
      return;
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      sendJSON(res, 400, { error: { message: 'messages field is required', type: 'invalid_request' } });
      return;
    }

    const auth = await this.authenticateChatRequest(req);
    if (!auth.ok) {
      sendJSON(res, auth.status, {
        error: {
          message: auth.message,
          type: auth.type,
          reason: auth.reason,
          authMode: this.config.authMode,
        },
      });
      return;
    }

    // ── Rate limiting based on holder tier ────────────────────────
    const holderTier = auth.context.holderTier;
    const maxPerHour = auth.context.maxRequestsPerHour;

    if (!this.checkRateLimit(auth.context.rateLimitKey, maxPerHour)) {
      sendJSON(res, 429, {
        error: {
          message: `Rate limit exceeded: ${maxPerHour}/hr for ${holderTier} tier. Hold more $CLAWD for higher limits.`,
          type: 'rate_limit',
          x_clawd: {
            tier: holderTier,
            limit: maxPerHour,
            upgrade: 'Hold 1,000+ $CLAWD for 100/hr, 100K+ for 500/hr, 1M+ for unlimited',
          },
        },
      });
      return;
    }

    // ── Check for external wallet in request ─────────────────────
    // Allow clients to pass their own wallet for holder checks
    const externalWallet = req.headers['x-clawd-wallet'] as string | undefined;
    let effectiveTier = holderTier;
    if (auth.context.mode === 'local' && externalWallet && externalWallet !== this.wallet.publicKey) {
      try {
        const extStatus = await checkHolderStatusCached(
          externalWallet,
          this.config.solanaRpcUrl,
          this.config.heliusApiKey || undefined,
          this.config.holderThresholds,
        );
        effectiveTier = extStatus.tier;
      } catch {
        // Fall back to server wallet tier
      }
    }

    const startTime = performance.now();

    // ── Step 1: Determine target model ──────────────────────────
    let routedModel: string;
    let routingMeta: RoutingMeta;

    const requestedModel = request.model ?? 'clawdrouter/auto';

    if (requestedModel === 'clawdrouter/auto' || requestedModel === 'blockrun/auto' || requestedModel === 'auto') {
      // Smart routing: score the request and route
      const scored = scoreRequest(request.messages);
      const { model, fallback } = routeRequest(scored, this.config.profile, this.config.excludedModels);
      routedModel = model.id;

      const opusCost = estimateCostPerRequest(getModel('anthropic/claude-opus-4.6')!);
      const modelCost = estimateCostPerRequest(model);

      routingMeta = {
        requestedModel,
        routedModel: model.id,
        tier: scored.tier,
        profile: this.config.profile,
        routingTimeMs: performance.now() - startTime,
        estimatedCost: modelCost,
        savings: opusCost > 0 ? (1 - modelCost / opusCost) : 0,
      };

      if (this.config.debug) {
        console.log(`  🧠 ${scored.reasoning}`);
        console.log(`  → ${model.name} (${model.id})${fallback ? ' [fallback]' : ''}`);
      }
    } else {
      // Direct model selection (or alias resolution)
      const resolved = resolveModelAlias(requestedModel) ?? requestedModel;
      const model = getModel(resolved);
      routedModel = model?.id ?? resolved;

      const modelCost = model ? estimateCostPerRequest(model) : 0;
      const opusCost = estimateCostPerRequest(getModel('anthropic/claude-opus-4.6')!);

      routingMeta = {
        requestedModel,
        routedModel,
        tier: 'MEDIUM',
        profile: this.config.profile,
        routingTimeMs: performance.now() - startTime,
        estimatedCost: modelCost,
        savings: opusCost > 0 ? (1 - modelCost / opusCost) : 0,
      };
    }

    // ── Step 1.5: $CLAWD access gating ──────────────────────────
    const routedModelEntry = getModel(routedModel);
    if (routedModelEntry && !canAccessModelTier(effectiveTier, routedModelEntry.tier)) {
      // Check if x402 payment is provided
      const paymentHeader = req.headers['x-payment'] as string | undefined;

      if (!paymentHeader) {
        // Return 402 Payment Required with x402 challenge
        return this.send402Challenge(res, routedModel, routedModelEntry.tier, effectiveTier);
      }
      // If payment header is present, allow access (settlement verification would happen upstream)
    }

    // ── Step 2: Forward to OpenRouter ───────────────────────────
    if (this.config.openRouterEnabled && this.config.openRouterApiKey) {
      return this.forwardToOpenRouter(request, routedModel, routingMeta, auth.context, res);
    }

    // ── Fallback: Legacy upstream with x402 ─────────────────────
    return this.forwardToLegacyUpstream(request, routedModel, routingMeta, auth.context, res);
  }

  // ── Hosted / Local Auth ───────────────────────────────────────────

  private async authenticateChatRequest(req: IncomingMessage): Promise<
    | { ok: true; context: ChatAuthContext }
    | { ok: false; status: number; message: string; type: string; reason?: string }
  > {
    if (!isPlatformAuthEnabled(this.config)) {
      const status = this.holderStatus;
      return {
        ok: true,
        context: {
          mode: 'local',
          rateLimitKey: this.wallet.publicKey,
          holderTier: status?.tier ?? 'FREE',
          clawdBalance: status?.balance ?? 0,
          maxRequestsPerHour: normalizeRateLimit(status?.maxRequestsPerHour ?? 20),
          walletAddress: this.wallet.publicKey,
        },
      };
    }

    const apiKey = extractApiKey(req.headers);

    // Free-tier bypass: clawd_free_<nonce> keys are minted by /v1/agent-key without
    // server-side storage — they are ephemeral and rate-limited by the key itself.
    if (apiKey && /^clawd_free_[a-z0-9]+$/.test(apiKey)) {
      return {
        ok: true,
        context: {
          mode: 'platform',
          rateLimitKey: apiKey,
          holderTier: 'FREE',
          clawdBalance: 0,
          maxRequestsPerHour: 20,
          apiKeyPrefix: apiKey.slice(0, 14),
        },
      };
    }

    if (!apiKey || !apiKey.startsWith('clawd_sk_')) {
      return {
        ok: false,
        status: 401,
        message: 'ClawdRouter requires Authorization: Bearer clawd_sk_... (get a free key: GET /v1/agent-key)',
        type: 'authentication_required',
      };
    }

    const validation = await validatePlatformApiKey(
      apiKey,
      this.config,
      '/v1/chat/completions',
      ['inference:write'],
    );

    if (!validation.result.ok) {
      return {
        ok: false,
        status: validation.status,
        message: validation.result.error,
        type: validation.status === 403 ? 'forbidden' : 'authentication_error',
        reason: validation.result.reason,
      };
    }

    const holderTier = validation.result.clawd.holderTier;
    const maxRequestsPerHour = normalizeRateLimit(validation.result.clawd.maxRequestsPerHour);
    return {
      ok: true,
      context: {
        mode: 'platform',
        rateLimitKey: validation.result.apiKey.id || validation.result.apiKey.keyPrefix,
        holderTier,
        clawdBalance: validation.result.clawd.balance,
        maxRequestsPerHour,
        apiKeyPrefix: validation.result.apiKey.keyPrefix,
        userId: validation.result.user.id,
        walletAddress: validation.result.user.walletAddress,
      },
    };
  }

  // ── OpenRouter Forwarding ─────────────────────────────────────────

  private async forwardToOpenRouter(
    request: ChatCompletionRequest,
    routedModel: string,
    routingMeta: RoutingMeta,
    auth: ChatAuthContext,
    res: ServerResponse,
  ): Promise<void> {
    const openRouterModelId = toOpenRouterModelId(routedModel);

    if (this.config.debug) {
      console.log(`  🔗 OpenRouter: ${routedModel} → ${openRouterModelId}`);
    }

    try {
      const upstreamResponse = await proxyToOpenRouter(
        {
          ...request,
          model: openRouterModelId,
        },
        {
          apiKey: this.config.openRouterApiKey,
          siteTitle: this.config.openRouterSiteTitle,
          siteUrl: this.config.openRouterSiteUrl,
          categories: this.config.openRouterCategories,
        },
      );

      // ── Stream or return response ─────────────────────────────
      if (request.stream) {
        res.writeHead(upstreamResponse.status, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-ClawdRouter-Model': routedModel,
          'X-ClawdRouter-OpenRouter-Model': openRouterModelId,
          'X-ClawdRouter-Tier': routingMeta.tier,
          'X-ClawdRouter-Savings': `${(routingMeta.savings * 100).toFixed(0)}%`,
          'X-ClawdRouter-Holder': auth.holderTier,
        });

        const reader = upstreamResponse.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
        }
        res.end();
      } else {
        const responseBody = await upstreamResponse.text();
        let parsed: any;

        try {
          parsed = JSON.parse(responseBody);
        } catch {
          parsed = { error: { message: 'Invalid upstream response', raw: responseBody } };
        }

        // Inject routing metadata
        parsed.x_clawdrouter = {
          ...routingMeta,
          openRouterModelId,
          authMode: auth.mode,
          holderTier: auth.holderTier,
          clawdBalance: auth.clawdBalance,
          apiKeyPrefix: auth.apiKeyPrefix,
          walletAddress: auth.walletAddress,
        };

        // Update stats
        this.updateStats(routingMeta, parsed.usage);

        // Add routing headers
        res.setHeader('X-ClawdRouter-Model', routedModel);
        res.setHeader('X-ClawdRouter-OpenRouter-Model', openRouterModelId);
        res.setHeader('X-ClawdRouter-Tier', routingMeta.tier);
        res.setHeader('X-ClawdRouter-Savings', `${(routingMeta.savings * 100).toFixed(0)}%`);
        res.setHeader('X-ClawdRouter-Time', `${routingMeta.routingTimeMs.toFixed(2)}ms`);
        res.setHeader('X-ClawdRouter-Holder', auth.holderTier);

        sendJSON(res, upstreamResponse.status, parsed);
      }
    } catch (error: any) {
      console.error(`  ✗ OpenRouter error: ${error.message}`);
      sendJSON(res, 502, {
        error: {
          message: `OpenRouter request failed: ${error.message}`,
          type: 'upstream_error',
          x_clawdrouter: routingMeta,
        },
      });
    }
  }

  // ── Legacy Upstream (x402) ────────────────────────────────────────

  private async forwardToLegacyUpstream(
    request: ChatCompletionRequest,
    routedModel: string,
    routingMeta: RoutingMeta,
    auth: ChatAuthContext,
    res: ServerResponse,
  ): Promise<void> {
    const { x402Fetch } = await import('../x402/payment.js');
    const upstreamUrl = `${this.config.upstreamUrl}/v1/chat/completions`;

    try {
      const upstreamResponse = await x402Fetch(
        upstreamUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer x402:${this.wallet.publicKey}`,
            'X-ClawdRouter-Version': '0.2.0',
            'X-ClawdRouter-Profile': this.config.profile,
            'X-ClawdRouter-Auth-Mode': auth.mode,
            'X-ClawdRouter-Holder': auth.holderTier,
          },
          body: JSON.stringify({ ...request, model: routedModel }),
        },
        this.wallet,
        this.config,
        this.tracker,
      );

      if (request.stream) {
        res.writeHead(upstreamResponse.status, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-ClawdRouter-Model': routedModel,
          'X-ClawdRouter-Tier': routingMeta.tier,
          'X-ClawdRouter-Holder': auth.holderTier,
        });

        const reader = upstreamResponse.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
        }
        res.end();
      } else {
        const responseBody = await upstreamResponse.text();
        let parsed: any;
        try {
          parsed = JSON.parse(responseBody);
        } catch {
          parsed = { error: { message: 'Invalid upstream response', raw: responseBody } };
        }

        parsed.x_clawdrouter = {
          ...routingMeta,
          authMode: auth.mode,
          holderTier: auth.holderTier,
          clawdBalance: auth.clawdBalance,
          apiKeyPrefix: auth.apiKeyPrefix,
          walletAddress: auth.walletAddress,
        };
        this.updateStats(routingMeta, parsed.usage);

        res.setHeader('X-ClawdRouter-Model', routedModel);
        res.setHeader('X-ClawdRouter-Tier', routingMeta.tier);
        res.setHeader('X-ClawdRouter-Holder', auth.holderTier);
        sendJSON(res, upstreamResponse.status, parsed);
      }
    } catch (error: any) {
      console.error(`  ✗ Upstream error: ${error.message}`);
      sendJSON(res, 502, {
        error: {
          message: `Upstream request failed: ${error.message}`,
          type: 'upstream_error',
          x_clawdrouter: routingMeta,
        },
      });
    }
  }

  // ── 402 Payment Challenge ─────────────────────────────────────────

  private send402Challenge(
    res: ServerResponse,
    model: string,
    modelTier: string,
    holderTier: ClawdHolderTier,
  ): void {
    const challenge = {
      version: '1',
      amount: this.config.x402Price || '10000', // 0.01 USDC default
      recipient: this.config.x402PayTo || this.wallet.publicKey,
      token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
      network: this.config.network,
      description: this.config.x402Description || `ClawdRouter access: ${model} (${modelTier} tier)`,
      nonce: `clawd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      expires: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    };

    const encoded = Buffer.from(JSON.stringify(challenge)).toString('base64');

    res.setHeader('X-Payment-Required', encoded);
    res.setHeader('X-ClawdRouter-Holder', holderTier);

    sendJSON(res, 402, {
      error: {
        message: `Model ${model} requires ${modelTier} tier access. Your $CLAWD tier: ${holderTier}. Pay with x402 or hold more $CLAWD.`,
        type: 'payment_required',
        x_clawd: {
          holderTier,
          requiredTier: modelTier,
          model,
          tokenMint: this.config.clawdTokenMint,
          upgrade: {
            HOLDER: 'Hold 1,000+ $CLAWD for mid-tier access',
            DIAMOND: 'Hold 100,000+ $CLAWD for premium access',
            WHALE: 'Hold 1,000,000+ $CLAWD for unlimited access',
          },
        },
        x402: challenge,
      },
    });
  }

  // ── Free Agent Key Endpoint ───────────────────────────────────────
  // Distributes a free clawd_free_<nonce> key that bypasses platform auth
  // at FREE tier (20 req/hr, budget models). The server's shared OPENROUTER_API_KEY
  // is used for all downstream calls — callers never need their own OpenRouter key.

  private handleAgentKey(res: ServerResponse): void {
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const key = `clawd_free_${nonce}`;
    const baseUrl = `${this.config.relayPublicUrl}/v1`;
    sendJSON(res, 200, {
      key,
      baseUrl,
      tier: 'FREE',
      rateLimitPerHour: 20,
      models: 'budget (eco profile via clawdrouter/auto)',
      openRouterProxied: this.config.openRouterEnabled && !!this.config.openRouterApiKey,
      // $CLAWD token — hold for higher tiers (clawd-pump)
      clawdToken: {
        mint: this.config.clawdTokenMint,
        buyUrl: `https://pump.fun/coin/${this.config.clawdTokenMint}`,
        tiers: {
          FREE:    { minHolding: 0,         rateLimit: 20,       models: 'budget' },
          HOLDER:  { minHolding: 1_000,     rateLimit: 100,      models: 'budget + mid' },
          DIAMOND: { minHolding: 100_000,   rateLimit: 500,      models: 'all (no x402)' },
          WHALE:   { minHolding: 1_000_000, rateLimit: 'unlimited', models: 'all (no x402)' },
        },
      },
      usage: `Authorization: Bearer ${key}`,
      docs: 'https://x402.wtf/router',
      upgrade: 'https://x402.wtf/profile/api',
    });
  }

  // ── $CLAWD Status Endpoint ────────────────────────────────────────

  private handleClawdStatus(res: ServerResponse): void {
    sendJSON(res, 200, {
      clawd: {
        tokenMint: this.config.clawdTokenMint,
        wallet: this.wallet.publicKey,
        holderTier: this.holderStatus?.tier ?? 'FREE',
        balance: this.holderStatus?.balance ?? 0,
        premiumModelsUnlocked: this.holderStatus?.premiumModelsUnlocked ?? false,
        maxRequestsPerHour: this.holderStatus?.maxRequestsPerHour ?? 20,
        x402Required: this.holderStatus?.x402Required ?? true,
        checkedAt: this.holderStatus?.checkedAt ?? null,
        thresholds: this.config.holderThresholds,
      },
      openRouter: {
        enabled: this.config.openRouterEnabled,
        configured: !!this.config.openRouterApiKey,
      },
    });
  }

  // ── Access Check Endpoint ─────────────────────────────────────────

  private async handleAccessCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const walletAddress = req.headers['x-clawd-wallet'] as string;
    if (!walletAddress) {
      sendJSON(res, 400, {
        error: { message: 'X-Clawd-Wallet header required', type: 'invalid_request' },
      });
      return;
    }

    try {
      const status = await checkHolderStatusCached(
        walletAddress,
        this.config.solanaRpcUrl,
        this.config.heliusApiKey || undefined,
        this.config.holderThresholds,
      );

      sendJSON(res, 200, {
        wallet: walletAddress,
        clawd: {
          tier: status.tier,
          balance: status.balance,
          premiumModelsUnlocked: status.premiumModelsUnlocked,
          maxRequestsPerHour: status.maxRequestsPerHour,
          x402Required: status.x402Required,
          allowedModelTiers: canAccessModelTier(status.tier, 'premium')
            ? ['budget', 'mid', 'premium']
            : canAccessModelTier(status.tier, 'mid')
              ? ['budget', 'mid']
              : ['budget'],
        },
      });
    } catch (error: any) {
      sendJSON(res, 500, {
        error: { message: `Failed to check holder status: ${error.message}`, type: 'server_error' },
      });
    }
  }

  // ── Stats Endpoint ────────────────────────────────────────────────

  private handleStats(res: ServerResponse): void {
    sendJSON(res, 200, {
      ...this.stats,
      paymentHistory: this.tracker.getByModel(),
      sessionSpent: this.tracker.sessionTotal,
      clawd: {
        holderTier: this.holderStatus?.tier ?? 'FREE',
        balance: this.holderStatus?.balance ?? 0,
      },
    });
  }

  // ── Relay Endpoints ──────────────────────────────────────────────

  private async handleRelay(res: ServerResponse): Promise<void> {
    const snapshot = await buildRelaySnapshot(this.config, {
      wallet: this.wallet.publicKey,
      holderTier: this.holderStatus?.tier ?? 'FREE',
      clawdBalance: this.holderStatus?.balance ?? 0,
      stats: this.stats,
    });
    sendJSON(res, 200, snapshot);
  }

  private async handleSolanaRelay(res: ServerResponse): Promise<void> {
    sendJSON(res, 200, await buildSolanaRelay(this.config));
  }

  private async handlePerpsRelay(res: ServerResponse): Promise<void> {
    sendJSON(res, 200, await buildPerpsRelay(this.config));
  }

  private async handleX402Relay(res: ServerResponse): Promise<void> {
    sendJSON(res, 200, await buildX402ApiRelay(this.config));
  }

  // ── Rate Limiting ─────────────────────────────────────────────────

  private checkRateLimit(key: string, maxPerHour: number): boolean {
    if (maxPerHour === Infinity) return true;

    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    let entry = this.rateLimitCounter.get(key);

    if (!entry || (now - entry.windowStart) > windowMs) {
      entry = { count: 0, windowStart: now };
      this.rateLimitCounter.set(key, entry);
    }

    entry.count++;
    return entry.count <= maxPerHour;
  }

  // ── Stats Update ──────────────────────────────────────────────────

  private updateStats(meta: RoutingMeta, usage?: { prompt_tokens?: number; completion_tokens?: number }): void {
    this.stats.totalRequests++;
    this.stats.totalInputTokens += usage?.prompt_tokens ?? 0;
    this.stats.totalOutputTokens += usage?.completion_tokens ?? 0;
    this.stats.totalCostUSDC += meta.estimatedCost;

    const opusCost = estimateCostPerRequest(getModel('anthropic/claude-opus-4.6')!);
    this.stats.totalSavedUSDC += (opusCost - meta.estimatedCost);

    // Track by model
    if (!this.stats.byModel[meta.routedModel]) {
      this.stats.byModel[meta.routedModel] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUSDC: 0,
      };
    }
    this.stats.byModel[meta.routedModel]!.requests++;
    this.stats.byModel[meta.routedModel]!.inputTokens += usage?.prompt_tokens ?? 0;
    this.stats.byModel[meta.routedModel]!.outputTokens += usage?.completion_tokens ?? 0;
    this.stats.byModel[meta.routedModel]!.costUSDC += meta.estimatedCost;

    // Track by tier
    this.stats.byTier[meta.tier] = (this.stats.byTier[meta.tier] ?? 0) + 1;
  }
}

// ── Helper Functions ────────────────────────────────────────────────

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function normalizeRateLimit(value: number | null | undefined): number {
  if (value === null || value === undefined || value === Infinity) return Infinity;
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.floor(value);
}

function createEmptyStats(): UsageStats {
  return {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUSDC: 0,
    totalSavedUSDC: 0,
    byModel: {},
    byTier: { SIMPLE: 0, MEDIUM: 0, COMPLEX: 0, REASONING: 0 },
    sessionStart: Date.now(),
  };
}
