// ═══════════════════════════════════════════════════════════════
// AI AGENT API - Cloudflare Workers
// Production-ready API for AI agent authentication & wallets
// ═══════════════════════════════════════════════════════════════

import { Router } from './router';
import { AgentService } from './services/agent';
import { CrossmintService } from './services/crossmint';
import { DeploymentService } from './services/deployment';

// ─────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  CROSSMINT_SERVERSIDE_API_KEY: string;
  CROSSMINT_CLIENTSIDE_API_KEY?: string;
  SOLANA_RPC_URL?: string;
  // Model provider API keys
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  PHALA_CLOUD_API_KEY?: string;
  PHALA_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  CLAWD_CATALOG_URL?: string;
  CLAWD_AUTH_URL?: string;
  CLAWD_GATEWAY_URL?: string;
  ENVIRONMENT: string;
  CORS_ORIGIN: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  api_key_hash: string;
  api_key_prefix: string;
  wallet_address: string | null;
  chain: 'solana' | 'solana-devnet';
  status: 'active' | 'suspended' | 'pending';
  permissions: AgentPermissions;
  requests_per_minute: number;
  requests_per_day: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

export interface AgentPermissions {
  canCreateWallet: boolean;
  canTransfer: boolean;
  canSwap: boolean;
  maxTransferAmount: number;
  maxDailyVolume: number;
}

export interface Session {
  id: string;
  agent_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}

// ─────────────────────────────────────────────────
// CORS HEADERS
// ─────────────────────────────────────────────────

function corsHeaders(env: Env, requestOrigin?: string): HeadersInit {
  const allowed = (env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  const origin = requestOrigin && allowed.includes(requestOrigin)
    ? requestOrigin
    : allowed[0] ?? 'https://x402.wtf';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Agent-API-Key, X-Agent-Session',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(data: unknown, status = 200, env?: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(env ? corsHeaders(env) : {}),
    },
  });
}

function errorResponse(message: string, status = 500, env?: Env): Response {
  return jsonResponse({ success: false, error: message }, status, env);
}

// ─────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestOrigin = request.headers.get('Origin') ?? undefined;
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env, requestOrigin) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Initialize services
    const agentService = new AgentService(env);
    const crossmintService = new CrossmintService(env);
    const deploymentService = new DeploymentService(env, env.DB);
    const router = new Router(env, agentService, crossmintService, deploymentService);

    try {
      // Route requests
      if (path === '/health' || path === '/') {
        return jsonResponse({
          success: true,
          service: 'AI Agent API',
          version: '2.1.0',
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
          features: {
            wallets: 'Crossmint smart wallets with delegated signing',
            smartWallets: 'Smart wallets with admin signer + MPC wallets',
            goatSdk: 'GOAT SDK tools (balance, transfer, price, swap quotes)',
            models: 'Multi-provider AI models (OpenAI, Anthropic, Phala, DeepSeek)',
            tools: 'On-chain Solana actions (transfer, swap, stake)',
            streaming: 'Real-time response streaming',
          },
          endpoints: {
            agents: '/api/agents/*',
            wallets: '/api/wallets/*',
            smartWallets: '/api/smart-wallets/*',
            catalog: '/api/catalog/*',
          },
          providers: {
            openai: !!env.OPENAI_API_KEY,
            anthropic: !!env.ANTHROPIC_API_KEY,
            phala: !!env.PHALA_API_KEY,
            deepseek: !!env.DEEPSEEK_API_KEY,
            crossmint: !!env.CROSSMINT_SERVERSIDE_API_KEY,
          },
          catalog: {
            url: env.CLAWD_CATALOG_URL || 'https://x402.wtf/api/agents',
            auth: env.CLAWD_AUTH_URL || 'https://x402.wtf/api/auth',
            gateway: env.CLAWD_GATEWAY_URL || 'https://clawd-gateway.fly.dev',
          },
        }, 200, env);
      }

      // API routes
      if (path.startsWith('/api/agents')) {
        return await router.handleAgentRoutes(request, path);
      }

      // Wallet routes (direct Crossmint access)
      if (path.startsWith('/api/wallets')) {
        return await router.handleWalletRoutes(request, path);
      }

      // Smart wallet routes (advanced Crossmint + GOAT SDK)
      if (path.startsWith('/api/smart-wallets')) {
        return await router.handleSmartWalletRoutes(request, path);
      }

      // Factory routes (v1 API) - maps to agent deployment
      if (path.startsWith('/api/v1/factory')) {
        return await router.handleFactoryRoutes(request, path);
      }

      // solana-clawd agents catalog (proxied + KV-cached from x402.wtf)
      if (path.startsWith('/api/catalog')) {
        return await router.handleCatalogRoutes(request, path);
      }

      return errorResponse('Not Found', 404, env);
    } catch (error) {
      console.error('Request error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Internal Server Error',
        500,
        env
      );
    }
  },
};
