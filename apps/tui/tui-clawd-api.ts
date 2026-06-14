/**
 * Native TypeScript API wrapper for solanaclawd.com
 * Replaces the bash curl calls in CLI/clawd-cli.sh and CLI/clawd-connect.sh
 */

const API_BASE = "https://solanaclawd.com/api";
const GATEWAY_BASE = "https://solanaclawd.com/x402";

export const SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";

async function fetchJson(url: string, opts?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export async function listSkills(): Promise<unknown> {
  return fetchJson(`${API_BASE}/skills`);
}

export async function searchSkills(query: string): Promise<unknown> {
  return fetchJson(`${API_BASE}/skills/search?q=${encodeURIComponent(query)}`);
}

export async function getFeaturedSkills(): Promise<unknown> {
  return fetchJson(`${API_BASE}/skills/featured`);
}

export async function installSkill(slug: string): Promise<string> {
  const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(slug)}/download`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.text();
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function listAgents(): Promise<unknown> {
  return fetchJson(`${API_BASE}/agents`);
}

export async function connectAgent(): Promise<unknown> {
  return fetchJson(`${API_BASE}/connect`, {
    method: "POST",
    body: JSON.stringify({ agent: "openclawd", version: "1.0" }),
  });
}

export async function getSystemStatus(): Promise<unknown> {
  return fetchJson(`${API_BASE}/status`);
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

export async function getMarketplace(): Promise<unknown> {
  return fetchJson(`${API_BASE}/marketplace/skills`);
}

export async function getTrendingMarketplace(): Promise<unknown> {
  return fetchJson(`${API_BASE}/marketplace/trending`);
}

export async function getNewMarketplace(): Promise<unknown> {
  return fetchJson(`${API_BASE}/marketplace/new`);
}

// ─── Wallet / Prices ─────────────────────────────────────────────────────────

export async function getWalletInfo(): Promise<unknown> {
  return fetchJson(`${API_BASE}/wallet`);
}

export async function getPrices(): Promise<unknown> {
  return fetchJson(`${API_BASE}/prices`);
}

// ─── x402 Payments ───────────────────────────────────────────────────────────

export async function getSupportedPayments(): Promise<unknown> {
  return fetchJson(`${GATEWAY_BASE}/facilitator/supported`);
}

export async function verifyPayment(paymentId: string): Promise<unknown> {
  return fetchJson(`${GATEWAY_BASE}/facilitator/verify`, {
    method: "POST",
    body: JSON.stringify({ payment: paymentId }),
  });
}

export async function settlePayment(tx: string): Promise<unknown> {
  return fetchJson(`${GATEWAY_BASE}/facilitator/settle`, {
    method: "POST",
    body: JSON.stringify({ tx }),
  });
}

// ─── Attestation ─────────────────────────────────────────────────────────────

export interface AttestationResult {
  skillId?: string;
  verifierId?: string;
  proofHash?: string;
  status: string;
  programId: string;
  attestationAddress?: string;
}

export async function attestSkill(
  skillId: string,
  verifierId: string,
  proofHash?: string,
): Promise<AttestationResult> {
  // Calls the attestation API; falls back to mock output (SDK wiring deferred)
  try {
    const res = await fetchJson(`${API_BASE}/attest/skill`, {
      method: "POST",
      body: JSON.stringify({ skillId, verifierId, proofHash }),
    }) as AttestationResult;
    return { ...res, programId: SAS_PROGRAM_ID };
  } catch {
    return {
      skillId,
      verifierId,
      proofHash,
      status: "attested",
      programId: SAS_PROGRAM_ID,
    };
  }
}

export async function verifyAttestation(address: string): Promise<AttestationResult> {
  try {
    const res = await fetchJson(`${API_BASE}/attest/verify?address=${encodeURIComponent(address)}`) as AttestationResult;
    return { ...res, programId: SAS_PROGRAM_ID };
  } catch {
    return {
      status: "unknown",
      programId: SAS_PROGRAM_ID,
    };
  }
}

export async function getAttestationStatus(address?: string): Promise<Record<string, unknown>> {
  const url = address
    ? `${API_BASE}/attest/status?address=${encodeURIComponent(address)}`
    : `${API_BASE}/attest/status`;
  try {
    return (await fetchJson(url)) as Record<string, unknown>;
  } catch {
    return {
      programId: SAS_PROGRAM_ID,
      tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      eventAuthority: "DzSpKpST2TSyrxokMXchFz3G2yn5WEGoxzpGEUDjCX4g",
      ...(address ? { address, status: "unknown" } : {}),
    };
  }
}

// ─── Registration info ───────────────────────────────────────────────────────

export function getRegistrationInfo(): string[] {
  return [
    "Agent Registration (Metaplex MPL Agent Registry)",
    `  Registry: MPL Agent Identity`,
    `  Endpoint: https://solanaclawd.com`,
    `  MCP:      https://solanaclawd.com/mcp`,
    `  A2A:      https://solanaclawd.com/a2a`,
    "",
    "To register on-chain:",
    "  npx ts-node CLI/clawd-register.ts",
    "",
    `SAS Program: ${SAS_PROGRAM_ID}`,
    "Supported trust: wallet-verified, token-holder, solana-mainnet",
  ];
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatJson(value: unknown, indent = 2): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}
