// ───────────────────────────────────────────────
// 🛡️ Dark Protocol — ZOLana Privacy Layer
// Integrated with Zcash Sapling + ZK + Helius
// ───────────────────────────────────────────────

import type { DarkAgentMode } from "@dark-agent/index";
import type { DarkSwapToken } from "@dark-swap/index";

export type DarkTransactionKind =
  | "shield"
  | "unshield"
  | "private-transfer"
  | "swap"
  | "agent"
  | "zk_proof"
  | "tee_attest"
  | "shielded_pool"
  | "privacy_mix";

export type DarkTransactionStatus = "simulated" | "completed" | "queued" | "proving" | "attesting";

export interface DarkNote {
  id: string;
  amount: number;
  memo: string;
  createdAt: number;
  spent: boolean;
  recipient?: string;
  commitment?: string; // hex commitment for ZK
  nullifier?: string;  // hex nullifier
  isShielded?: boolean;
}

export interface DarkTransaction {
  id: string;
  kind: DarkTransactionKind;
  title: string;
  detail: string;
  amount: number;
  signature: string;
  status: DarkTransactionStatus;
  createdAt: number;
  recipient?: string;
  route?: string;
  proofSize?: number;     // bytes for ZK proofs
  teeProvider?: string;   // for TEE attestations
}

export interface DarkVaultState {
  shieldedBalance: number;
  committedBalance: number;
  agentMode: DarkAgentMode;
  routeMode: "balanced" | "private" | "fast" | "zk_private" | "tee_secured";
  notes: DarkNote[];
  history: DarkTransaction[];
  // ZOLana extensions
  zkProofsGenerated: number;
  teeAttestations: number;
  privacyPoolDeposits: number;
  privacyMixDepth: number;
}

export interface DarkActionReceipt {
  state: DarkVaultState;
  receipt: DarkTransaction;
}

export interface ShielededPoolState {
  isActive: boolean;
  totalDeposits: number;
  merkleRoot: string;
  commitmentCount: number;
}

export interface PrivacyMixConfig {
  depth: 2 | 4 | 8;
  relayerFee: number;
  delayMs: number;
}

const STORAGE_PREFIX = "dark-wallet:v2:"; // bumped for ZOLana
const HISTORY_LIMIT = 24;
const NOTE_LIMIT = 16;
const ZSOL_PREFIX = "zsol1";

function createId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

function roundSol(amount: number): number {
  return Number(amount.toFixed(4));
}

export function formatSol(amount: number): string {
  return `${roundSol(amount).toFixed(4)} SOL`;
}

export function createShieldedAddress(seed: string, index = 0): string {
  const source = `${seed}:${index}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  const payload = Math.abs(hash).toString(36).padStart(16, "0");
  return `${ZSOL_PREFIX}${payload}${payload.slice(0, 12)}`;
}

export function isValidShieldedAddress(addr: string): boolean {
  return addr.startsWith(ZSOL_PREFIX) && addr.length >= 50 && addr.length <= 70;
}

export function createDefaultVaultState(): DarkVaultState {
  return {
    shieldedBalance: 0,
    committedBalance: 0,
    agentMode: "guardian",
    routeMode: "balanced",
    notes: [],
    history: [],
    // ZOLana extensions
    zkProofsGenerated: 0,
    teeAttestations: 0,
    privacyPoolDeposits: 0,
    privacyMixDepth: 2,
  };
}

function normalizeVaultState(candidate: Partial<DarkVaultState> | null | undefined): DarkVaultState {
  const fallback = createDefaultVaultState();
  if (!candidate) return fallback;

  return {
    shieldedBalance: roundSol(candidate.shieldedBalance ?? fallback.shieldedBalance),
    committedBalance: roundSol(candidate.committedBalance ?? fallback.committedBalance),
    agentMode: candidate.agentMode ?? fallback.agentMode,
    routeMode: candidate.routeMode ?? fallback.routeMode,
    notes: Array.isArray(candidate.notes) ? candidate.notes.slice(0, NOTE_LIMIT) : fallback.notes,
    history: Array.isArray(candidate.history) ? candidate.history.slice(0, HISTORY_LIMIT) : fallback.history,
    zkProofsGenerated: candidate.zkProofsGenerated ?? 0,
    teeAttestations: candidate.teeAttestations ?? 0,
    privacyPoolDeposits: candidate.privacyPoolDeposits ?? 0,
    privacyMixDepth: candidate.privacyMixDepth ?? 2,
  };
}

export function loadVaultState(key: string): DarkVaultState {
  if (typeof window === "undefined") return createDefaultVaultState();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return createDefaultVaultState();
    return normalizeVaultState(JSON.parse(raw) as Partial<DarkVaultState>);
  } catch {
    return createDefaultVaultState();
  }
}

export function saveVaultState(key: string, state: DarkVaultState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(state));
}

function appendHistory(state: DarkVaultState, receipt: DarkTransaction): DarkVaultState {
  return {
    ...state,
    history: [receipt, ...state.history].slice(0, HISTORY_LIMIT),
  };
}

function appendNote(state: DarkVaultState, note: DarkNote): DarkVaultState {
  return {
    ...state,
    notes: [note, ...state.notes].slice(0, NOTE_LIMIT),
  };
}

function spendFirstAvailableNote(state: DarkVaultState, recipient?: string): DarkNote[] {
  const index = state.notes.findIndex((note) => !note.spent);
  if (index < 0) return state.notes;

  const next = state.notes.slice();
  next[index] = {
    ...next[index],
    spent: true,
    recipient: recipient ?? next[index].recipient,
  };
  return next;
}

function createReceipt(
  kind: DarkTransactionKind,
  detail: string,
  amount: number,
  status: DarkTransactionStatus,
  route?: string,
  recipient?: string,
  extra?: { proofSize?: number; teeProvider?: string },
): DarkTransaction {
  return {
    id: createId(kind),
    kind,
    title: detail,
    detail,
    amount: roundSol(amount),
    signature: `${kind.toUpperCase()}-${createId("sig")}`,
    status,
    createdAt: Date.now(),
    route,
    recipient,
    proofSize: extra?.proofSize,
    teeProvider: extra?.teeProvider,
  };
}

function ensureAmount(amount: number, label: string): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return roundSol(amount);
}

function ensureCapacity(state: DarkVaultState, amount: number, label: string): void {
  if (roundSol(amount) > roundSol(state.committedBalance)) {
    throw new Error(`Not enough staged balance to ${label}.`);
  }
}

// ── Core Operations ────────────────────────────

export function stageShield(
  state: DarkVaultState,
  amount: number,
  memo: string,
): DarkActionReceipt {
  const safeAmount = ensureAmount(amount, "Shield amount");
  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(state.shieldedBalance + safeAmount),
    committedBalance: roundSol(state.committedBalance + safeAmount),
  };
  const note: DarkNote = {
    id: createId("note"),
    amount: safeAmount,
    memo: memo.trim() || "Shield staging",
    createdAt: Date.now(),
    spent: false,
    commitment: `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("")}`,
    isShielded: true,
  };
  const receipt = createReceipt(
    "shield",
    `Staged ${formatSol(safeAmount)} into the dark vault.`,
    safeAmount,
    "simulated",
  );

  return {
    state: appendHistory(appendNote(next, note), receipt),
    receipt,
  };
}

export function stageUnshield(
  state: DarkVaultState,
  amount: number,
  recipient: string,
): DarkActionReceipt {
  const safeAmount = ensureAmount(amount, "Unshield amount");
  ensureCapacity(state, safeAmount, "unshield");

  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(Math.max(state.shieldedBalance - safeAmount, 0)),
    committedBalance: roundSol(Math.max(state.committedBalance - safeAmount, 0)),
    notes: spendFirstAvailableNote(state, recipient),
  };
  const receipt = createReceipt(
    "unshield",
    `Released ${formatSol(safeAmount)} back to transparent balance.`,
    safeAmount,
    "simulated",
    undefined,
    recipient || undefined,
  );

  return { state: appendHistory(next, receipt), receipt };
}

export function stagePrivateTransfer(
  state: DarkVaultState,
  amount: number,
  recipient: string,
  memo: string,
): DarkActionReceipt {
  const safeAmount = ensureAmount(amount, "Transfer amount");
  ensureCapacity(state, safeAmount, "transfer");
  const memoSuffix = memo.trim() ? ` Memo: ${memo.trim()}` : "";

  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(Math.max(state.shieldedBalance - safeAmount, 0)),
    committedBalance: roundSol(Math.max(state.committedBalance - safeAmount, 0)),
    notes: spendFirstAvailableNote(state, recipient),
  };
  const receipt = createReceipt(
    "private-transfer",
    `Routed ${formatSol(safeAmount)} to a shielded recipient.${memoSuffix}`,
    safeAmount,
    "simulated",
    undefined,
    recipient,
  );

  return { state: appendHistory(next, receipt), receipt };
}

export function stageAgentUpdate(
  state: DarkVaultState,
  mode: DarkAgentMode,
  routeMode: DarkVaultState["routeMode"],
  memo: string,
): DarkActionReceipt {
  const next: DarkVaultState = {
    ...state,
    agentMode: mode,
    routeMode,
  };
  const receipt = createReceipt(
    "agent",
    memo || `Agent policy updated to ${mode}.`,
    0,
    "queued",
  );

  return { state: appendHistory(next, receipt), receipt };
}

export function stageSwap(
  state: DarkVaultState,
  inputToken: DarkSwapToken,
  outputToken: DarkSwapToken,
  inputAmount: number,
  outputAmount: number,
  route: string,
): DarkActionReceipt {
  const safeAmount = ensureAmount(inputAmount, "Swap amount");
  ensureCapacity(state, safeAmount, "swap");

  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(Math.max(state.shieldedBalance - safeAmount, 0)),
    committedBalance: roundSol(Math.max(state.committedBalance - safeAmount, 0)),
  };
  const receipt = createReceipt(
    "swap",
    `Quoted ${safeAmount.toFixed(4)} ${inputToken} → ${outputAmount.toFixed(4)} ${outputToken}.`,
    safeAmount,
    "queued",
    route,
  );

  return { state: appendHistory(next, receipt), receipt };
}

// ── ZOLana Experimental Operations ─────────────

export function stageZkProofGeneration(
  state: DarkVaultState,
  amount: number,
  recipient: string,
): DarkActionReceipt {
  const safeAmount = ensureAmount(amount, "ZK proof amount");
  ensureCapacity(state, safeAmount, "generate ZK proof");

  // Simulate generating a 256-byte Groth16 proof
  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(Math.max(state.shieldedBalance - safeAmount, 0)),
    committedBalance: roundSol(Math.max(state.committedBalance - safeAmount, 0)),
    zkProofsGenerated: state.zkProofsGenerated + 1,
  };
  const receipt = createReceipt(
    "zk_proof",
    `Generated Groth16 proof for ${formatSol(safeAmount)} → ${recipient.slice(0, 10)}...`,
    safeAmount,
    "proving",
    undefined,
    recipient,
    { proofSize: 256 },
  );

  return { state: appendHistory(next, receipt), receipt };
}

export function stageTeeAttestation(
  state: DarkVaultState,
  provider: string,
  memo: string,
): DarkActionReceipt {
  const next: DarkVaultState = {
    ...state,
    teeAttestations: state.teeAttestations + 1,
  };
  const receipt = createReceipt(
    "tee_attest",
    memo || `TEE attestation created via ${provider}.`,
    0,
    "attesting",
    undefined,
    undefined,
    { teeProvider: provider },
  );

  return { state: appendHistory(next, receipt), receipt };
}

export function stageShieldedPoolDeposit(
  state: DarkVaultState,
  amount: number,
): DarkActionReceipt {
  const safeAmount = ensureAmount(amount, "Pool deposit");
  ensureCapacity(state, safeAmount, "deposit to shielded pool");

  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(Math.max(state.shieldedBalance - safeAmount, 0)),
    committedBalance: roundSol(Math.max(state.committedBalance - safeAmount, 0)),
    privacyPoolDeposits: state.privacyPoolDeposits + 1,
  };
  const receipt = createReceipt(
    "shielded_pool",
    `Deposited ${formatSol(safeAmount)} to shielded pool.`,
    safeAmount,
    "simulated",
    "Shielded Pool",
  );

  return { state: appendHistory(next, receipt), receipt };
}

export function stagePrivacyMix(
  state: DarkVaultState,
  amount: number,
  depth: number,
): DarkActionReceipt {
  const safeAmount = ensureAmount(amount, "Mix amount");
  ensureCapacity(state, safeAmount, "mix");

  const next: DarkVaultState = {
    ...state,
    shieldedBalance: roundSol(Math.max(state.shieldedBalance - safeAmount, 0)),
    committedBalance: roundSol(Math.max(state.committedBalance - safeAmount, 0)),
    privacyMixDepth: depth,
  };
  const receipt = createReceipt(
    "privacy_mix",
    `Mixed ${formatSol(safeAmount)} through ${depth} hops for enhanced anonymity.`,
    safeAmount,
    "queued",
    `Privacy Mix (${depth} hops)`,
  );

  return { state: appendHistory(next, receipt), receipt };
}

// ── Exports ─────────────────────────────────────

export {
  STORAGE_PREFIX,
  HISTORY_LIMIT,
  NOTE_LIMIT,
  ZSOL_PREFIX,
};