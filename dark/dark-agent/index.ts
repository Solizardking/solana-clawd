// ───────────────────────────────────────────────
// 🤖 Dark Agent — Policy, Guardrails, Automation
// Enhanced with TEE Attestation + ZK Proof Modes
// ───────────────────────────────────────────────

export type DarkAgentMode = "manual" | "guardian" | "autonomous" | "zk_prover" | "tee_sandbox";

export type TeeProvider = "intel_sgx" | "amd_sev" | "phala_tee";

export interface TeeAttestation {
  provider: TeeProvider;
  measurement: string;        // SHA256 measurement hash
  timestamp: number;          // Unix ms
  signature: string;          // Attestation signature
  reportData?: string;        // Arbitrary data bound to TEE
}

export interface ZkProofAgentConfig {
  enableGroth16: boolean;
  circuitId: string;          // e.g. "shielded-transfer-v1"
  provingKeySize: number;     // bytes
  maxProofsPerEpoch: number;
}

export interface DarkAgentSurface {
  id: DarkAgentMode;
  title: string;
  subtitle: string;
  guardrail: string;
  bullets: string[];
  features?: string[];
}

export const DARK_AGENT_SURFACES: DarkAgentSurface[] = [
  {
    id: "manual",
    title: "Manual control",
    subtitle: "Every spend is reviewed by the user.",
    guardrail: "Nothing executes without an explicit confirmation.",
    bullets: [
      "Best for cold start and high-trust flows",
      "Useful when testing new routes or tokens",
      "Keeps wallet actions fully user-driven",
    ],
  },
  {
    id: "guardian",
    title: "Guardian mode",
    subtitle: "The agent screens actions and highlights risk.",
    guardrail: "Transfers above the budget threshold need approval.",
    bullets: [
      "Flags slippage, memo, and counterparty drift",
      "Suggests a route before the action runs",
      "Designed for everyday vault operations",
    ],
  },
  {
    id: "autonomous",
    title: "Autonomous mode",
    subtitle: "Low-risk tasks can move without waiting on the UI.",
    guardrail: "Stops immediately when budget, policy, or price rules fail.",
    bullets: [
      "Appropriate for recurring balances and sweep jobs",
      "Good for agent-triggered rebalancing",
      "Escalates anything ambiguous back to the user",
    ],
  },
  {
    id: "zk_prover",
    title: "ZK Prover mode",
    subtitle: "Generate zero-knowledge proofs for shielded actions.",
    guardrail: "Requires valid Groth16 proof for shielded operations.",
    bullets: [
      "Generates ZK proofs for private transfers and swaps",
      "Hides amounts, sender, and recipient via commitments",
      "Verifiable on-chain with 256-byte proofs",
    ],
    features: [
      "🔐 Groth16 zk-SNARKs (256-byte proofs)",
      "🌳 Merkle tree commitment verification",
      "🚫 Nullifier check — no double-spends",
      "⚡ ~500ms proving time (browser-based)",
    ],
  },
  {
    id: "tee_sandbox",
    title: "TEE Sandbox mode",
    subtitle: "Execute sensitive operations in Trusted Execution Environment.",
    guardrail: "Agent runs in Intel SGX / AMD SEV enclave with attestation.",
    bullets: [
      "Hardware-level isolation for trading algorithms",
      "Intel SGX and AMD SEV support",
      "Remote attestation for audit trail",
    ],
    features: [
      "🛡️ Intel SGX / AMD SEP enclave isolation",
      "🔑 Encrypted memory — no host access to secrets",
      "📋 Remote attestation with measurement verification",
      "🤖 AI trading agents in sandboxed TEE",
    ],
  },
];

export const DARK_AGENT_PROMPT = [
  "You are Dark Agent, the wallet's policy brain.",
  "Prefer safety over cleverness.",
  "Never hide risk, fees, or routing details.",
  "Ask before moving value unless the user explicitly pre-approved the lane.",
  "In ZK Prover mode, generate and verify zero-knowledge proofs.",
  "In TEE Sandbox mode, respect attestation boundaries.",
].join(" ");

export function getDarkAgentSurface(mode: DarkAgentMode): DarkAgentSurface {
  return DARK_AGENT_SURFACES.find((surface) => surface.id === mode) ?? DARK_AGENT_SURFACES[0];
}

// ── TEE Attestation Helpers ────────────────────

export function createTeeAttestation(
  provider: TeeProvider,
  reportData?: string,
): TeeAttestation {
  // In production: call into SGX/SEV SDK for real attestation
  const measurement = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
  ).join("");

  return {
    provider,
    measurement,
    timestamp: Date.now(),
    signature: `tee_sig_${measurement.slice(0, 16)}`,
    reportData,
  };
}

export function verifyTeeAttestation(attestation: TeeAttestation): boolean {
  // In production: verify against Intel/AMD attestation service
  if (!attestation.measurement || attestation.measurement.length !== 64) return false;
  if (attestation.timestamp > Date.now() + 5000) return false;
  if (attestation.timestamp < Date.now() - 300_000) return false; // 5 min stale
  return true;
}

// ── ZK Proof Agent Config ──────────────────────

export function createZkProverConfig(overrides?: Partial<ZkProofAgentConfig>): ZkProofAgentConfig {
  return {
    enableGroth16: true,
    circuitId: "shielded-transfer-v1",
    provingKeySize: 128 * 1024 * 1024, // 128 MB
    maxProofsPerEpoch: 100,
    ...overrides,
  };
}

// ── Agent Budget & Policy ──────────────────────

export interface AgentPolicy {
  maxSpendPerTx: number;       // SOL
  maxSpendPerDay: number;      // SOL
  allowedTokens: string[];     // Token mint addresses
  allowedPrograms: string[];   // Program IDs
  requireMemo: boolean;
  requireConfirmation: boolean;
  requireZkProof: boolean;     // ZK Prover mode
  requireTeeAttestation: boolean; // TEE Sandbox mode
}

export function createDefaultPolicy(mode: DarkAgentMode): AgentPolicy {
  switch (mode) {
    case "manual":
      return {
        maxSpendPerTx: 100,
        maxSpendPerDay: 1000,
        allowedTokens: ["*"],
        allowedPrograms: ["*"],
        requireMemo: true,
        requireConfirmation: true,
        requireZkProof: false,
        requireTeeAttestation: false,
      };
    case "guardian":
      return {
        maxSpendPerTx: 10,
        maxSpendPerDay: 100,
        allowedTokens: ["*"],
        allowedPrograms: ["JUP6L*", "SWRMa*"],
        requireMemo: true,
        requireConfirmation: false,
        requireZkProof: false,
        requireTeeAttestation: false,
      };
    case "autonomous":
      return {
        maxSpendPerTx: 1,
        maxSpendPerDay: 10,
        allowedTokens: ["So111*", "EPjFW*"],
        allowedPrograms: ["JUP6L*"],
        requireMemo: false,
        requireConfirmation: false,
        requireZkProof: false,
        requireTeeAttestation: false,
      };
    case "zk_prover":
      return {
        maxSpendPerTx: 100,
        maxSpendPerDay: 500,
        allowedTokens: ["*"],
        allowedPrograms: ["dArkPr*"],
        requireMemo: false,
        requireConfirmation: true,
        requireZkProof: true,
        requireTeeAttestation: false,
      };
    case "tee_sandbox":
      return {
        maxSpendPerTx: 50,
        maxSpendPerDay: 500,
        allowedTokens: ["*"],
        allowedPrograms: ["*"],
        requireMemo: false,
        requireConfirmation: false,
        requireZkProof: false,
        requireTeeAttestation: true,
      };
  }
}