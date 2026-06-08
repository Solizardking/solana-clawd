/**
 * ClawdRouter — Local Proxy Server
 * OpenAI-compatible API proxy on localhost:8402
 *
 * Integrated with:
 *   • 15-dimension request scoring (<1ms, fully local)
 *   • OpenRouter upstream (real model routing to all providers)
 *   • provider routing, plugins, caching, server tools
 *   • $CLAWD SPL token gating (holder tiers control access)
 *   • x402 USDC micropayments on Solana (for non-holders)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  ChatCompletionRequest,
  ClawdRouterConfig,
  ClawdWallet,
  RoutingMeta,
  UsageStats,
} from "../types.js";
import { scoreRequest } from "../router/scorer.js";
import { routeRequest } from "../router/profiles.js";
import { getModel, resolveModelAlias, estimateCostPerRequest, MODEL_REGISTRY } from "../models/registry.js";
import { PaymentTracker } from "../x402/payment.js";
import { proxyToOpenRouter } from "../upstream/openrouter.js";
import { proxyToRedpill, toRedpillModelId, getRedpillAttestation } from "../upstream/redpill.js";
import { proxyToSolrouter, getSolrouterTEEPublicKey, getSolrouterAttestation } from "../upstream/solrouter.js";
import {
  checkHolderStatusCached,
  canAccessModelTier,
  type ClawdHolderStatus,
  type ClawdHolderTier,
} from "../token/clawd-gate.js";
import { extractApiKey, isPlatformAuthEnabled, validatePlatformApiKey } from "../auth/platform.js";
import { buildPerpsRelay, buildRelaySnapshot, buildSolanaRelay, buildX402ApiRelay } from "../relay/aggregator.js";

type ChatAuthContext = {
  mode: "local" | "platform";
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
    await this.refreshHolderStatus();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error("  ✗ Request error:", err.message);
          sendJSON(res, 500, { error: { message: err.message, type: "server_error" } });
        });
      });

      this.server.listen(this.config.port, () => {
        resolve();
      });

      this.server.on("error", reject);
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
      return null;
    }
  }

  // ── Request Handler ─────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Payment, X-Clawd-Wallet, X-OpenRouter-Cache, X-OpenRouter-Experimental-Metadata");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";
    if (url === "/" || url === "/health") return this.handleHealth(res);
    if (url === "/v1/models" || url === "/models") return this.handleModels(req, res);
    if (url === "/v1/chat/completions" || url === "/chat/completions") return this.handleChatCompletion(req, res);
    if (url === "/v1/stats" || url === "/stats") return this.handleStats(res);
    if (url === "/v1/clawd/status" || url === "/clawd/status") return this.handleClawdStatus(res);
    if (url === "/v1/clawd/access" || url === "/clawd/access") return this.handleAccessCheck(req, res);
    if (url === "/v1/relay" || url === "/relay") return this.handleRelay(res);
    if (url === "/v1/relay/solana" || url === "/relay/solana") return this.handleSolanaRelay(res);
    if (url === "/v1/relay/perps" || url === "/relay/perps") return this.handlePerpsRelay(res);
    if (url === "/v1/relay/x402" || url === "/relay/x402" || url === "/v1/x402/status") return this.handleX402Relay(res);
    if (url === "/tee/public-key" || url === "/v1/tee/public-key") return this.handleTEEPublicKey(res);
    if (url.startsWith("/tee/attestation") || url.startsWith("/v1/tee/attestation")) return this.handleTEEAttestation(req, res);

    sendJSON(res, 404, {
      error: {
        message: `Unknown endpoint: ${url}. Use /v1/chat/completions for OpenAI-compatible requests.`,
        type: "invalid_request",
      },
    });
  }

  // ── Health Check ──────────────────────────────────────────────────

  private handleHealth(res: ServerResponse): void {
    const tier = this.holderStatus?.tier ?? "FREE";
    sendJSON(res, 200, {
      status: "ok",
      service: "clawdrouter",
      version: "0.3.0",
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
      features: {
        caching: this.config.cacheEnabled,
        guardrails: this.config.guardrailsEnabled,
        variants: true,
        plugins: true,
        serverTools: true,
      },
    });
  }

  // ── Model Listing ─────────────────────────────────────────────────

  private handleModels(_req: IncomingMessage, res: ServerResponse): void {
    const holderTier = this.holderStatus?.tier ?? "FREE";

    const models = MODEL_REGISTRY
      .filter((m) => m.enabled)
      .map((m) => ({
        id: m.id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: m.provider,
        permission: [],
        root: m.id,
        parent: null,
        x_clawd: {
          tier: m.tier,
          accessible: canAccessModelTier(holderTier, m.tier),
          free: m.free,
          openRouterId: m.id,
        },
      }));

    models.unshift({
      id: "clawdrouter/auto",
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "clawdrouter",
      permission: [],
      root: "clawdrouter/auto",
      parent: null,
      x_clawd: {
        tier: "budget" as const,
        accessible: true,
        free: false,
        openRouterId: "clawdrouter/auto",
      },
    });

    sendJSON(res, 200, {
      object: "list",
      data: models,
      x_clawd_holder: {
        tier: holderTier,
        balance: this.holderStatus?.balance ?? 0,
        totalAccessible: models.filter((m) => m.x_clawd.accessible).length,
        totalModels: models.length,
      },
    });
  }

  // ── Chat Completions ──────────────────────────────────────────────

  private async handleChatCompletion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      sendJSON(res, 405, { error: { message: "Method not allowed", type: "invalid_request" } });
      return;
    }

    const body = await readBody(req);
    let request: ChatCompletionRequest;

    try {
      request = JSON.parse(body);
    } catch {
      sendJSON(res, 400, { error: { message: "Invalid JSON body", type: "invalid_request" } });
      return;
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      sendJSON(res, 400, { error: { message: "messages field is required", type: "invalid_request" } });
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

    const holderTier = auth.context.holderTier;
    const maxPerHour = auth.context.maxRequestsPerHour;

    if (!this.checkRateLimit(auth.context.rateLimitKey, maxPerHour)) {
      sendJSON(res, 429, {
        error: {
          message: `Rate limit exceeded: ${maxPerHour}/hr for ${holderTier} tier.`,
          type: "rate_limit",
          x_clawd: { tier: holderTier, limit: maxPerHour },
        },
      });
      return;
    }

    const externalWallet = req.headers["x-clawd-wallet"] as string | undefined;
    let effectiveTier = holderTier;
    if (auth.context.mode === "local" && externalWallet && externalWallet !== this.wallet.publicKey) {
      try {
        const extStatus = await checkHolderStatusCached(
          externalWallet,
          this.config.solanaRpcUrl,
          this.config.heliusApiKey || undefined,
          this.config.holderThresholds,
        );
        effectiveTier = extStatus.tier;
      } catch {
        // fall back to server wallet tier
      }
    }

    const startTime = performance.now();
    let routedModel: string;
    let routingMeta: RoutingMeta;

    const requestedModel = request.model ?? "clawdrouter/auto";

    if (requestedModel === "clawdrouter/auto" || requestedModel === "blockrun/auto" || requestedModel === "auto") {
      const scored = scoreRequest(request.messages);
      const { model, fallback } = routeRequest(scored, this.config.profile, this.config.excludedModels);
      routedModel = model.id;

      const opusCost = estimateCostPerRequest(getModel("anthropic/claude-opus-4.6")!);
      const modelCost = estimateCostPerRequest(model);

      routingMeta = {
        requestedModel,
        routedModel: model.id,
        tier: scored.tier,
        profile: this.config.profile,
        routingTimeMs: performance.now() - startTime,
        estimatedCost: modelCost,
        savings: opusCost > 0 ? 1 - modelCost / opusCost : 0,
      };

      if (this.config.debug) {
        console.log(`  🧠 ${scored.reasoning}`);
        console.log(`  → ${model.name} (${model.id})${fallback ? " [fallback]" : ""}`);
      }
    } else {
      const resolved = resolveModelAlias(requestedModel) ?? requestedModel;
      const model = getModel(resolved);
      routedModel = model?.id ?? resolved;

      const modelCost = model ? estimateCostPerRequest(model) : 0;
      const opusCost = estimateCostPerRequest(getModel("anthropic/claude-opus-4.6")!);

      routingMeta = {
        requestedModel,
        routedModel,
        tier: "MEDIUM",
        profile: this.config.profile,
        routingTimeMs: performance.now() - startTime,
        estimatedCost: modelCost,
        savings: opusCost > 0 ? 1 - modelCost / opusCost : 0,
      };
    }

    const routedModelEntry = getModel(routedModel);
    if (routedModelEntry && !canAccessModelTier(effectiveTier, routedModelEntry.tier)) {
      const paymentHeader = req.headers["x-payment"] as string | undefined;
      if (!paymentHeader) {
        return this.send402Challenge(res, routedModel, routedModelEntry.tier, effectiveTier);
      }
    }

    if (this.isPrivacyRoute(routedModel)) {
      return this.forwardToPrivacy(request, routedModel, routingMeta, auth.context, res);
    }

    if (this.config.openRouterEnabled && this.config.openRouterApiKey) {
      return this.forwardToOpenRouter(request, routedModel, routingMeta, auth.context, res);
    }

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
          mode: "local",
          rateLimitKey: this.wallet.publicKey,
          holderTier: status?.tier ?? "FREE",
          clawdBalance: status?.balance ?? 0,
          maxRequestsPerHour: normalizeRateLimit(status?.maxRequestsPerHour ?? 20),
          walletAddress: this.wallet.publicKey,
        },
      };
    }

    const apiKey = extractApiKey(req.headers);
    if (!apiKey || !apiKey.startsWith("clawd_sk_")) {
      return {
        ok: false,
        status: 401,
        message: "ClawdRouter hosted mode requires Authorization: Bearer clawd_sk_...",
        type: "authentication_required",
      };
    }

    const validation = await validatePlatformApiKey(apiKey, this.config, "/v1/chat/completions", ["inference:write"]);

    if (!validation.result.ok) {
      return {
        ok: false,
        status: validation.status,
        message: validation.result.error,
        type: validation.status === 403 ? "forbidden" : "authentication_error",
        reason: validation.result.reason,
      };
    }

    const t = validation.result.clawd.holderTier;
    const max = normalizeRateLimit(validation.result.clawd.maxRequestsPerHour);
    return {
      ok: true,
      context: {
        mode: "platform",
        rateLimitKey: validation.result.apiKey.id || validation.result.apiKey.keyPrefix,
        holderTier: t,
        clawdBalance: validation.result.clawd.balance,
        maxRequestsPerHour: max,
        apiKeyPrefix: validation.result.apiKey.keyPrefix,
        userId: validation.result.user.id,
        walletAddress: validation.result.user.walletAddress,
      },
    };
  }

  // ── OpenRouter Forwarding (v2 — uses new proxyToOpenRouter) ───────

  private async forwardToOpenRouter(
    request: ChatCompletionRequest,
    routedModel: string,
    routingMeta: RoutingMeta,
    auth: ChatAuthContext,
    res: ServerResponse,
  ): Promise<void> {
    if (this.config.debug) {
      console.log(`  🔗 OpenRouter: ${routedModel}`);
    }

    try {
      const result = await proxyToOpenRouter(
        { ...request, model: routedModel },
        this.config.openRouterApiKey,
        this.config,
      );

      // Check for error
      if ("error" in result) {
        sendJSON(res, result.status, {
          error: { message: result.error, type: "upstream_error" },
          x_clawdrouter: routingMeta,
        });
        return;
      }

      const { response: upstreamResponse } = result;

      // Streaming
      if (request.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-ClawdRouter-Model": routedModel,
          "X-ClawdRouter-Tier": routingMeta.tier,
          "X-ClawdRouter-Holder": auth.holderTier,
        });
        // For streamed responses, we'd need to relay the stream.
        // Since the current upstream returns a full response, just return JSON.
        sendJSON(res, 200, upstreamResponse);
        return;
      }

      // Non-streaming
      this.updateStats(routingMeta, upstreamResponse.usage);

      res.setHeader("X-ClawdRouter-Model", routedModel);
      res.setHeader("X-ClawdRouter-Tier", routingMeta.tier);
      res.setHeader("X-ClawdRouter-Holder", auth.holderTier);
      res.setHeader("X-ClawdRouter-Time", `${routingMeta.routingTimeMs.toFixed(2)}ms`);

      sendJSON(res, 200, upstreamResponse);
    } catch (error: any) {
      console.error(`  ✗ OpenRouter error: ${error.message}`);
      sendJSON(res, 502, {
        error: { message: `OpenRouter request failed: ${error.message}`, type: "upstream_error" },
        x_clawdrouter: routingMeta,
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
    const { x402Fetch } = await import("../x402/payment.js");
    const upstreamUrl = `${this.config.upstreamUrl}/v1/chat/completions`;

    try {
      const upstreamResponse = await x402Fetch(
        upstreamUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer x402:${this.wallet.publicKey}`,
            "X-ClawdRouter-Version": "0.3.0",
            "X-ClawdRouter-Profile": this.config.profile,
            "X-ClawdRouter-Auth-Mode": auth.mode,
            "X-ClawdRouter-Holder": auth.holderTier,
          },
          body: JSON.stringify({ ...request, model: routedModel }),
        },
        this.wallet,
        this.config,
        this.tracker,
      );

      if (request.stream) {
        res.writeHead(upstreamResponse.status, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-ClawdRouter-Model": routedModel,
          "X-ClawdRouter-Tier": routingMeta.tier,
          "X-ClawdRouter-Holder": auth.holderTier,
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
          parsed = { error: { message: "Invalid upstream response", raw: responseBody } };
        }

        parsed.x_clawdrouter = { ...routingMeta, authMode: auth.mode, holderTier: auth.holderTier };
        this.updateStats(routingMeta, parsed.usage);

        res.setHeader("X-ClawdRouter-Model", routedModel);
        res.setHeader("X-ClawdRouter-Tier", routingMeta.tier);
        res.setHeader("X-ClawdRouter-Holder", auth.holderTier);
        sendJSON(res, upstreamResponse.status, parsed);
      }
    } catch (error: any) {
      console.error(`  ✗ Upstream error: ${error.message}`);
      sendJSON(res, 502, {
        error: { message: `Upstream request failed: ${error.message}`, type: "upstream_error" },
        x_clawdrouter: routingMeta,
      });
    }
  }

  // ── 402 Payment Challenge ─────────────────────────────────────────

  private send402Challenge(res: ServerResponse, model: string, modelTier: string, holderTier: ClawdHolderTier): void {
    const challenge = {
      version: "1" as const,
      amount: this.config.x402Price || "10000",
      recipient: this.config.x402PayTo || this.wallet.publicKey,
      token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      network: this.config.network,
      description: this.config.x402Description || `ClawdRouter access: ${model} (${modelTier} tier)`,
      nonce: `clawd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      expires: Math.floor(Date.now() / 1000) + 300,
    };

    const encoded = Buffer.from(JSON.stringify(challenge)).toString("base64");
    res.setHeader("X-Payment-Required", encoded);
    res.setHeader("X-ClawdRouter-Holder", holderTier);

    sendJSON(res, 402, {
      error: {
        message: `Model ${model} requires ${modelTier} tier access. Your $CLAWD tier: ${holderTier}.`,
        type: "payment_required",
        x_clawd: {
          holderTier,
          requiredTier: modelTier,
          model,
          tokenMint: this.config.clawdTokenMint,
        },
        x402: challenge,
      },
    });
  }

  // ── $CLAWD Status ──────────────────────────────────────────────────

  private handleClawdStatus(res: ServerResponse): void {
    sendJSON(res, 200, {
      clawd: {
        tokenMint: this.config.clawdTokenMint,
        wallet: this.wallet.publicKey,
        holderTier: this.holderStatus?.tier ?? "FREE",
        balance: this.holderStatus?.balance ?? 0,
        premiumModelsUnlocked: this.holderStatus?.premiumModelsUnlocked ?? false,
        maxRequestsPerHour: this.holderStatus?.maxRequestsPerHour ?? 20,
        thresholds: this.config.holderThresholds,
      },
      openRouter: {
        enabled: this.config.openRouterEnabled,
        configured: !!this.config.openRouterApiKey,
      },
    });
  }

  // ── Access Check ──────────────────────────────────────────────────

  private async handleAccessCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const walletAddress = req.headers["x-clawd-wallet"] as string;
    if (!walletAddress) {
      sendJSON(res, 400, { error: { message: "X-Clawd-Wallet header required", type: "invalid_request" } });
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
          allowedModelTiers: canAccessModelTier(status.tier, "premium")
            ? ["budget", "mid", "premium"]
            : canAccessModelTier(status.tier, "mid")
              ? ["budget", "mid"]
              : ["budget"],
        },
      });
    } catch (error: any) {
      sendJSON(res, 500, { error: { message: `Failed to check holder status: ${error.message}`, type: "server_error" } });
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────

  private handleStats(res: ServerResponse): void {
    sendJSON(res, 200, {
      ...this.stats,
      paymentHistory: this.tracker.getByModel(),
      sessionSpent: this.tracker.sessionTotal,
      clawd: { holderTier: this.holderStatus?.tier ?? "FREE", balance: this.holderStatus?.balance ?? 0 },
    });
  }

  // ── Relay ─────────────────────────────────────────────────────────

  private async handleRelay(res: ServerResponse): Promise<void> {
    const snapshot = await buildRelaySnapshot(this.config, {
      wallet: this.wallet.publicKey,
      holderTier: this.holderStatus?.tier ?? "FREE",
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
    const windowMs = 60 * 60 * 1000;
    let entry = this.rateLimitCounter.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
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

    const opusCost = estimateCostPerRequest(getModel("anthropic/claude-opus-4.6")!);
    this.stats.totalSavedUSDC += opusCost - meta.estimatedCost;

    if (!this.stats.byModel[meta.routedModel]) {
      this.stats.byModel[meta.routedModel] = { requests: 0, inputTokens: 0, outputTokens: 0, costUSDC: 0 };
    }
    this.stats.byModel[meta.routedModel]!.requests++;
    this.stats.byModel[meta.routedModel]!.inputTokens += usage?.prompt_tokens ?? 0;
    this.stats.byModel[meta.routedModel]!.outputTokens += usage?.completion_tokens ?? 0;
    this.stats.byModel[meta.routedModel]!.costUSDC += meta.estimatedCost;

    this.stats.byTier[meta.tier] = (this.stats.byTier[meta.tier] ?? 0) + 1;
  }

  private isPrivacyRoute(modelId: string): boolean {
    if (this.config.profile === "private") return true;
    const privacyPrefixes = [
      "solrouter/",
      "phala/",
      "nearai/",
      "chutes/",
      "tinfoil/",
      "z-ai/",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-v3",
      "moonshotai/kimi-k2",
      "minimax/minimax-m",
    ];
    return privacyPrefixes.some((prefix) => modelId.startsWith(prefix));
  }

  private async forwardToPrivacy(
    request: ChatCompletionRequest,
    routedModel: string,
    routingMeta: RoutingMeta,
    auth: ChatAuthContext,
    res: ServerResponse,
  ): Promise<void> {
    const provider = this.config.privacyProvider ?? "auto";
    const useSolrouter = routedModel.startsWith("solrouter/") || provider === "solrouter";

    if (this.config.debug) {
      console.log(`  🔐 Privacy route: ${routedModel} → ${useSolrouter ? "Solrouter (Arcium+TDX)" : "RedPill (GPU-TEE)"}`);
    }

    try {
      let upstreamResponse: Response;

      if (useSolrouter) {
        upstreamResponse = await proxyToSolrouter(
          { ...request, model: routedModel } as Record<string, unknown>,
          { apiKey: this.config.solrouterApiKey || undefined },
        );
      } else {
        const redpillModel = toRedpillModelId(routedModel);
        upstreamResponse = await proxyToRedpill(
          { ...request, model: redpillModel } as Record<string, unknown>,
          this.config.redpillApiKey,
        );
      }

      if (request.stream) {
        res.writeHead(upstreamResponse.status, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-ClawdRouter-Model": routedModel,
          "X-ClawdRouter-Privacy": useSolrouter ? "arcium-tee" : "gpu-tee",
          "X-ClawdRouter-Tier": routingMeta.tier,
          "X-ClawdRouter-Holder": auth.holderTier,
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
        return;
      }

      const responseBody = await upstreamResponse.text();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(responseBody);
      } catch {
        parsed = { error: { message: "Invalid upstream response", raw: responseBody } };
      }

      parsed.x_clawdrouter = {
        ...routingMeta,
        privacy: useSolrouter ? "arcium-tee" : "gpu-tee",
        privacyProvider: useSolrouter ? "solrouter" : "redpill",
        authMode: auth.mode,
        holderTier: auth.holderTier,
        clawdBalance: auth.clawdBalance,
      };

      this.updateStats(routingMeta, parsed.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined);

      res.setHeader("X-ClawdRouter-Model", routedModel);
      res.setHeader("X-ClawdRouter-Privacy", useSolrouter ? "arcium-tee" : "gpu-tee");
      res.setHeader("X-ClawdRouter-Tier", routingMeta.tier);
      res.setHeader("X-ClawdRouter-Holder", auth.holderTier);
      sendJSON(res, upstreamResponse.status, parsed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Privacy upstream error: ${message}`);
      sendJSON(res, 502, {
        error: { message: `Privacy upstream failed: ${message}`, type: "upstream_error" },
        x_clawdrouter: routingMeta,
      });
    }
  }

  private async handleTEEPublicKey(res: ServerResponse): Promise<void> {
    const hasSolrouter = !!this.config.solrouterApiKey;
    const hasRedpill = !!this.config.redpillApiKey;

    if (hasSolrouter) {
      try {
        const key = await getSolrouterTEEPublicKey();
        sendJSON(res, 200, { ...key, provider: "solrouter", encryptionScheme: "arcium-rescuecipher-x25519" });
        return;
      } catch {
      }
    }

    if (hasRedpill) {
      sendJSON(res, 200, {
        provider: "redpill",
        note: "RedPill TEE gateway — attestation via /tee/attestation",
        attestationUrl: "https://api.redpill.ai/v1/attestation/report",
        verifierRepo: "https://github.com/redpill-ai/redpill-verifier",
      });
      return;
    }

    sendJSON(res, 503, {
      error: { message: "No TEE provider configured. Set REDPILL_API_KEY or SOLROUTER_API_KEY.", type: "not_configured" },
    });
  }

  private async handleTEEAttestation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const urlObj = new URL(req.url ?? "/", `http://localhost:${this.config.port}`);
    const nonce = urlObj.searchParams.get("nonce") ?? undefined;
    const provider = urlObj.searchParams.get("provider") ?? this.config.privacyProvider ?? "auto";
    const useSolrouter = provider === "solrouter" || (!this.config.redpillApiKey && !!this.config.solrouterApiKey);

    try {
      if (useSolrouter) {
        const attestation = await getSolrouterAttestation();
        sendJSON(res, 200, {
          provider: "solrouter",
          onChainProgram: "ATMRatMtsKX4bHax7U4FRdhbE4mjU4NKpDZGqZqAhBKb",
          encryptionScheme: "arcium-rescuecipher-x25519",
          teeType: "intel-tdx",
          ...attestation,
        });
        return;
      }

      const model = urlObj.searchParams.get("model") ?? "phala/qwen-2.5-7b-instruct";
      const attestation = await getRedpillAttestation(this.config.redpillApiKey, nonce, model);
      sendJSON(res, 200, {
        provider: "redpill",
        teeType: "intel-tdx-nvidia-cc",
        verifierRepo: "https://github.com/redpill-ai/redpill-verifier",
        ...attestation,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendJSON(res, 502, { error: { message: `TEE attestation failed: ${message}`, type: "upstream_error" } });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
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
    cacheHits: 0,
    cacheMisses: 0,
    serverToolCalls: 0,
  };
}
