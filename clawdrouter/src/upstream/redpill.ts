/**
 * ClawdRouter — RedPill Privacy Gateway Upstream
 *
 * RedPill runs every request through Intel TDX Trusted Execution Environments.
 * Even third-party models (OpenAI, Claude) are proxied through a TEE gateway —
 * no provider ever learns who made the request.
 *
 * Tier 1 (Confidential AI): GPU TEE models — Chutes, Near AI, Phala, Tinfoil
 * Tier 2 (Anonymous Access): Third-party models routed anonymously through TEE
 *
 * API: https://api.redpill.ai/v1  (OpenAI-compatible)
 * Attestation: GET /v1/attestation/report?nonce=<hex>
 * Signature:   GET /v1/signature/{request_id}?model=<model>
 */

const REDPILL_API_URL = 'https://api.redpill.ai/v1/chat/completions';
const REDPILL_MODELS_URL = 'https://api.redpill.ai/v1/models';
const REDPILL_ATTESTATION_URL = 'https://api.redpill.ai/v1/attestation/report';
const REDPILL_SIGNATURE_URL = 'https://api.redpill.ai/v1/signature';

// ── Privacy Tiers ────────────────────────────────────────────────────

/** Tier 1: GPU TEE — data never leaves hardware-protected enclave */
export const REDPILL_CONFIDENTIAL_MODELS = [
  // Chutes (GPU TEE)
  'z-ai/glm-5.1',
  'moonshotai/kimi-k2.6-0711',
  'chutes/qwen3.5-397b',
  'chutes/qwen3-coder-next',
  'chutes/minimax-m2.5',
  'chutes/mimo-v2-flash',
  'deepseek/deepseek-v3.2',
  'moonshotai/kimi-k2.5',
  // Near AI (GPU TEE)
  'z-ai/glm-5',
  'nearai/deepseek-v3.1',
  'nearai/gpt-oss-120b',
  'nearai/qwen3-30b',
  'nearai/glm-4.7',
  // Phala Network (GPU TEE)
  'phala/qwen3.5-27b',
  'phala/qwen3-vl-30b-a3b-instruct',
  'phala/qwen3-embedding-8b',
  'phala/gemma-3-27b',
  'phala/glm-4.7-flash',
  'phala/gpt-oss-20b',
  'phala/qwen-2.5-7b-instruct',
  // Tinfoil (GPU TEE)
  'tinfoil/qwen3-coder-480b',
  'moonshotai/kimi-k2-thinking',
  'deepseek/deepseek-r1-0528',
  'tinfoil/llama-3.3-70b',
] as const;

/** Tier 2: Third-party models routed anonymously through TEE gateway */
export const REDPILL_ANONYMOUS_MODELS = [
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.7',
  'anthropic/claude-haiku-4.5',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
] as const;

export type RedpillConfidentialModel = typeof REDPILL_CONFIDENTIAL_MODELS[number];
export type RedpillAnonymousModel = typeof REDPILL_ANONYMOUS_MODELS[number];

export function isConfidentialModel(modelId: string): boolean {
  return REDPILL_CONFIDENTIAL_MODELS.includes(modelId as RedpillConfidentialModel);
}

// ── Chat Completion Proxy ────────────────────────────────────────────

export async function proxyToRedpill(
  request: Record<string, unknown>,
  apiKey: string,
): Promise<Response> {
  return fetch(REDPILL_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ClawdRouter/0.2.0',
    },
    body: JSON.stringify(request),
  });
}

// ── Attestation ──────────────────────────────────────────────────────

export interface RedpillAttestationReport {
  nonce: string;
  signing_address?: string;
  tee_type?: string;
  measurements?: Record<string, string>;
  platform_certificates?: string[];
  docker_compose_hash?: string;
  timestamp?: number;
}

/** Fetch a fresh Intel TDX attestation report from RedPill's TEE gateway */
export async function getRedpillAttestation(
  apiKey: string,
  nonce?: string,
  model?: string,
): Promise<RedpillAttestationReport> {
  const params = new URLSearchParams();
  if (nonce) params.set('nonce', nonce);
  if (model) params.set('model', model);

  const url = params.size > 0
    ? `${REDPILL_ATTESTATION_URL}?${params}`
    : REDPILL_ATTESTATION_URL;

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    throw new Error(`RedPill attestation failed: ${resp.status} ${await resp.text()}`);
  }

  return resp.json() as Promise<RedpillAttestationReport>;
}

/** Fetch the TEE signature for a specific request (proof of enclave execution) */
export async function getRedpillRequestSignature(
  apiKey: string,
  requestId: string,
  model: string,
): Promise<{ signature: string; signing_address: string; request_hash: string; response_hash: string }> {
  const url = `${REDPILL_SIGNATURE_URL}/${requestId}?model=${encodeURIComponent(model)}`;

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    throw new Error(`RedPill signature fetch failed: ${resp.status}`);
  }

  return resp.json() as Promise<{ signature: string; signing_address: string; request_hash: string; response_hash: string }>;
}

// ── Model List ───────────────────────────────────────────────────────

export async function fetchRedpillModels(apiKey: string): Promise<Array<{ id: string; name?: string }>> {
  const resp = await fetch(REDPILL_MODELS_URL, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!resp.ok) return [];

  const data = await resp.json() as { data?: Array<{ id: string; name?: string }> };
  return data.data ?? [];
}

// ── Model ID Passthrough ─────────────────────────────────────────────

/**
 * RedPill uses native provider/model IDs.
 * No translation needed — pass the ID directly.
 */
export function toRedpillModelId(clawdModelId: string): string {
  if (clawdModelId === 'chutes/minimax-m2.5') {
    return 'minimax/minimax-m2.5';
  }
  return clawdModelId.replace(/^redpill\//, '');
}

// ── Status Formatting ────────────────────────────────────────────────

export function formatRedpillStatus(apiKeySet: boolean, confidentialCount: number): string {
  const lines: string[] = [''];
  lines.push('  🔴 RedPill TEE Gateway');
  lines.push('  ═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  API Key:         ${apiKeySet ? '✓ Configured' : '✗ Not set (REDPILL_API_KEY)'}`);
  lines.push(`  Gateway:         Intel TDX Trusted Execution Environment`);
  lines.push(`  Confidential:    ${confidentialCount} GPU-TEE models (Chutes, Near AI, Phala, Tinfoil)`);
  lines.push(`  Anonymous:       ${REDPILL_ANONYMOUS_MODELS.length} third-party models (OpenAI, Claude, Gemini)`);
  lines.push('');
  lines.push('  Privacy Tiers:');
  lines.push('    🟢 Confidential AI  GPU TEE — data never leaves secure enclave');
  lines.push('    🔵 Anonymous Access TEE gateway — provider never knows requester');
  lines.push('');
  lines.push('  Attestation:    GET /tee/attestation?nonce=<hex>');
  lines.push('  Verify:         GET /tee/public-key');
  lines.push('');
  return lines.join('\n');
}
