import type { DarkAgentMode } from "@dark-agent/index";
import type { DarkSwapToken } from "@dark-swap/index";

export type DarkTransactionKind =
  | "shield"
  | "unshield"
  | "private-transfer"
  | "swap"
  | "agent";

export type DarkTransactionStatus = "simulated" | "completed" | "queued";

export interface DarkNote {
  id: string;
  amount: number;
  memo: string;
  createdAt: number;
  spent: boolean;
  recipient?: string;
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
}

export interface DarkVaultState {
  shieldedBalance: number;
  committedBalance: number;
  agentMode: DarkAgentMode;
  routeMode: "balanced" | "private" | "fast";
  notes: DarkNote[];
  history: DarkTransaction[];
}

export interface DarkActionReceipt {
  state: DarkVaultState;
  receipt: DarkTransaction;
}

const STORAGE_PREFIX = "dark-wallet:v1:";
const HISTORY_LIMIT = 20;
const NOTE_LIMIT = 12;

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
  return `dark1${payload}${payload.slice(0, 12)}`;
}

export function createDefaultVaultState(): DarkVaultState {
  return {
    shieldedBalance: 0,
    committedBalance: 0,
    agentMode: "guardian",
    routeMode: "balanced",
    notes: [],
    history: [],
  };
}

function normalizeVaultState(candidate: Partial<DarkVaultState> | null | undefined): DarkVaultState {
  const fallback = createDefaultVaultState();
  if (!candidate) {
    return fallback;
  }

  return {
    shieldedBalance: roundSol(candidate.shieldedBalance ?? fallback.shieldedBalance),
    committedBalance: roundSol(candidate.committedBalance ?? fallback.committedBalance),
    agentMode: candidate.agentMode ?? fallback.agentMode,
    routeMode: candidate.routeMode ?? fallback.routeMode,
    notes: Array.isArray(candidate.notes) ? candidate.notes.slice(0, NOTE_LIMIT) : fallback.notes,
    history: Array.isArray(candidate.history) ? candidate.history.slice(0, HISTORY_LIMIT) : fallback.history,
  };
}

export function loadVaultState(key: string): DarkVaultState {
  if (typeof window === "undefined") {
    return createDefaultVaultState();
  }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) {
      return createDefaultVaultState();
    }

    return normalizeVaultState(JSON.parse(raw) as Partial<DarkVaultState>);
  } catch {
    return createDefaultVaultState();
  }
}

export function saveVaultState(key: string, state: DarkVaultState): void {
  if (typeof window === "undefined") {
    return;
  }

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
  if (index < 0) {
    return state.notes;
  }

  const next = state.notes.slice();
  next[index] = {
    ...next[index],
    spent: true,
    recipient: recipient ?? next[index].recipient,
  };

  return next;
}

function createReceipt(kind: DarkTransactionKind, detail: string, amount: number, status: DarkTransactionStatus, route?: string, recipient?: string): DarkTransaction {
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

  return {
    state: appendHistory(next, receipt),
    receipt,
  };
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

  return {
    state: appendHistory(next, receipt),
    receipt,
  };
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

  return {
    state: appendHistory(next, receipt),
    receipt,
  };
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

  return {
    state: appendHistory(next, receipt),
    receipt,
  };
}
