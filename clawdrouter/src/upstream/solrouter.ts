/**
 * ClawdRouter — Solrouter Private Inference Upstream
 *
 * Solrouter runs inference inside Intel TDX Confidential VMs with Arcium
 * RescueCipher client-side encryption. Your prompts are encrypted on the
 * client before leaving your machine and only decrypted inside the attested
 * enclave — Solrouter's backend is a blind relay.
 *
 * Attestation program: ATMRatMtsKX4bHax7U4FRdhbE4mjU4NKpDZGqZqAhBKb (Solana mainnet)
 * Per-request on-chain proof via Light Protocol compressed accounts.
 *
 * Models (self-hosted open-weight on Nosana decentralized GPU):
 *   gpt-oss-20b  — Apache-2.0, default
 *   qwen3-8b     — open weights
 */

const SOLROUTER_API_BASE = 'https://api.solrouter.com';
const SOLROUTER_CHAT_URL = `${SOLROUTER_API_BASE}/v1/chat/completions`;
const SOLROUTER_X402_CHAT_URL = `${SOLROUTER_API_BASE}/api/v1/x402/chat/completions`;
const SOLROUTER_AGENT_URL = `${SOLROUTER_API_BASE}/agent`;
const SOLROUTER_TEE_PUBKEY_URL = `${SOLROUTER_API_BASE}/tee/public-key`;
const SOLROUTER_TEE_ATTESTATION_URL = `${SOLROUTER_API_BASE}/tee/attestation`;

// ── Solrouter Model IDs ─────────────────────────────────────────────

export const SOLROUTER_MODELS = [
  { id: 'solrouter/gpt-oss-20b', upstream: 'gpt-oss-20b', name: 'GPT-OSS 20B (Solrouter TEE)' },
  { id: 'solrouter/qwen3-8b', upstream: 'qwen3-8b', name: 'Qwen3 8B (Solrouter TEE)' },
] as const;

// ── Types ───────────────────────────────────────────────────────────

export interface SolrouterConfig {
  apiKey?: string;
  useX402?: boolean;
}

export interface SolrouterTEEPublicKey {
  publicKey: string;    // X25519 public key for RescueCipher encryption
  algorithm: string;   // "x25519"
  attestedAt?: number;
}

export interface SolrouterAttestationProof {
  encryptedPromptHash: string;
  clientPubkey: string;
  teePubkey: string;
  nonce: string;
  enclavePubkey: string;
  enclaveSig: string;
  tdxQuoteHash: string;
  onChainAddress?: string;  // Light Protocol compressed account address
}

export interface SolrouterChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  encryptionProof?: SolrouterAttestationProof;
}

// ── Chat Proxy ───────────────────────────────────────────────────────

/**
 * Forward a chat request to Solrouter's OpenAI-compatible endpoint.
 * Uses x402 endpoint when no API key is set (USDC micropayment per call).
 */
export async function proxyToSolrouter(
  request: Record<string, unknown>,
  config: SolrouterConfig,
): Promise<Response> {
  const { apiKey, useX402 } = config;

  // Map solrouter/* model ID to upstream model name
  const model = String(request['model'] ?? '');
  const upstreamModel = toSolrouterModelId(model);
  const body = { ...request, model: upstreamModel };

  if (apiKey && !useX402) {
    return fetch(SOLROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ClawdRouter/0.2.0',
      },
      body: JSON.stringify(body),
    });
  }

  // x402 path — caller handles micropayment negotiation
  return fetch(SOLROUTER_X402_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'ClawdRouter/0.2.0' },
    body: JSON.stringify(body),
  });
}

// ── TEE Attestation ──────────────────────────────────────────────────

/** Fetch the TEE's attested X25519 public key from the enclave */
export async function getSolrouterTEEPublicKey(): Promise<SolrouterTEEPublicKey> {
  const resp = await fetch(SOLROUTER_TEE_PUBKEY_URL, {
    headers: { 'User-Agent': 'ClawdRouter/0.2.0' },
  });

  if (!resp.ok) throw new Error(`Solrouter TEE public-key fetch failed: ${resp.status}`);
  return resp.json() as Promise<SolrouterTEEPublicKey>;
}

/**
 * Fetch the Intel TDX attestation quote from the enclave.
 * report_data = sha512("app-data:" || sha256(x25519_pubkey || ed25519_signing_pubkey))
 * Verify with Intel DCAP or @phala/dcap-qvl to confirm genuine TDX hardware.
 */
export async function getSolrouterAttestation(): Promise<Record<string, unknown>> {
  const resp = await fetch(SOLROUTER_TEE_ATTESTATION_URL, {
    headers: { 'User-Agent': 'ClawdRouter/0.2.0' },
  });

  if (!resp.ok) throw new Error(`Solrouter attestation fetch failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

// ── Agent API ────────────────────────────────────────────────────────

/** Call Solrouter's tool-augmented agent endpoint (SERV reasoning + skill graphs) */
export async function callSolrouterAgent(
  prompt: string,
  options: { model?: string; useTools?: boolean; apiKey?: string },
): Promise<{ success: boolean; reply: string; toolCalls?: unknown[]; iterations?: number }> {
  const { model = 'gpt-oss:20b', useTools = true, apiKey } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'ClawdRouter/0.2.0',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const resp = await fetch(SOLROUTER_AGENT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, model, useTools }),
  });

  if (!resp.ok) throw new Error(`Solrouter agent call failed: ${resp.status}`);
  return resp.json() as Promise<{ success: boolean; reply: string; toolCalls?: unknown[]; iterations?: number }>;
}

// ── Model ID Translation ─────────────────────────────────────────────

export function toSolrouterModelId(clawdModelId: string): string {
  const map: Record<string, string> = {
    'solrouter/gpt-oss-20b': 'gpt-oss-20b',
    'solrouter/qwen3-8b': 'qwen3-8b',
  };
  return map[clawdModelId] ?? clawdModelId.replace(/^solrouter\//, '');
}

// ── Status Formatting ────────────────────────────────────────────────

export function formatSolrouterStatus(apiKeySet: boolean): string {
  const lines: string[] = [''];
  lines.push('  🔐 Solrouter Private Inference');
  lines.push('  ═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  API Key:       ${apiKeySet ? '✓ Configured' : 'Not set (x402 USDC per-call)'}`);
  lines.push(`  Encryption:    Arcium RescueCipher + X25519 key exchange`);
  lines.push(`  Compute:       Intel TDX Confidential VM (TEE)`);
  lines.push(`  Transport:     Blind relay — backend cannot decrypt`);
  lines.push(`  On-chain:      ATMRatMtsKX4bHax7U4FRdhbE4mjU4NKpDZGqZqAhBKb`);
  lines.push(`  Models:        gpt-oss-20b (default), qwen3-8b`);
  lines.push('');
  lines.push('  Attestation:   GET /tee/attestation');
  lines.push('  TEE key:       GET /tee/public-key');
  lines.push('  Per-call:      $0.005 USDC via x402 (or API key prepaid)');
  lines.push('');
  return lines.join('\n');
}
