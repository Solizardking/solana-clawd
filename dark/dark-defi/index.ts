// ───────────────────────────────────────────────
// 🏗️ Dark DeFi — Vault, Yield, Risk, Shielded Pools
// Enhanced with Privacy Pool + Shielded DeFi Ops
// ───────────────────────────────────────────────

export type DefiSurfaceId = "vault" | "yield" | "risk" | "shielded_pool" | "privacy_mix";

export interface DarkDefiSurface {
  id: DefiSurfaceId;
  title: string;
  subtitle: string;
  bullets: string[];
  metrics?: Array<{ label: string; value: string }>;
}

export interface PrivacyPoolState {
  totalDeposits: number;       // SOL
  totalWithdrawals: number;    // SOL
  participantCount: number;
  latestCommitment: string;    // hex
  merkleRoot: string;          // hex
}

export interface YieldOpportunity {
  protocol: string;
  asset: string;
  apy: number;
  tvl: number;
  riskScore: "low" | "medium" | "high";
  minDeposit: number;
}

export interface RiskCheck {
  id: string;
  label: string;
  severity: "info" | "warning" | "danger";
  detail: string;
  actionable: boolean;
}

export const DARK_DEFI_SURFACES: DarkDefiSurface[] = [
  {
    id: "vault",
    title: "Private vault",
    subtitle: "Track shielded balance and note flow in one place.",
    bullets: [
      "Shows committed balance and staged notes",
      "Supports shield / unshield staging",
      "Keeps a local audit trail for each move",
      "Sapling address generation for receiving",
    ],
    metrics: [
      { label: "Shielded", value: "0.0000 SOL" },
      { label: "Committed", value: "0.0000 SOL" },
      { label: "Notes", value: "0" },
    ],
  },
  {
    id: "yield",
    title: "Yield watch",
    subtitle: "Keep an eye on low-risk deployment lanes.",
    bullets: [
      "Collects vault and LP ideas into one screen",
      "Can surface conservative reserve targets",
      "Ties route risk to vault policy",
    ],
  },
  {
    id: "risk",
    title: "Risk rail",
    subtitle: "Shows what would block the next move.",
    bullets: [
      "Flags unsupported tokens and tight slippage",
      "Warns when memo or recipient data is malformed",
      "Stops the flow before it leaves the screen",
    ],
  },
  {
    id: "shielded_pool",
    title: "Shielded pool",
    subtitle: "Zcash-style privacy pool with Merkle tree commitments.",
    bullets: [
      "Deposit to shielded pool with Pedersen commitment",
      "Withdraw with ZK proof and nullifier check",
      "Prevents double-spends via nullifier set",
      "Incremental Merkle tree for anonymous set",
    ],
    metrics: [
      { label: "Pool deposits", value: "0.0000 SOL" },
      { label: "Merkle root", value: "0x0000…" },
      { label: "Participants", value: "0" },
    ],
  },
  {
    id: "privacy_mix",
    title: "Privacy mix",
    subtitle: "Mixing pool for enhanced anonymity.",
    bullets: [
      "Obfuscates transaction graph via mixing",
      "Configurable mix depth (2, 4, or 8 hops)",
      "Delayed withdrawals for timing protection",
      "Fee-based relayer network for metadata privacy",
    ],
    metrics: [
      { label: "Mix depth", value: "4 hops" },
      { label: "Anonymity set", value: "0 addresses" },
      { label: "Relayer fee", value: "0.1%" },
    ],
  },
];

export const DARK_DEFI_NOTES = [
  "Dark DeFi is intentionally conservative until the protocol surface is ready.",
  "The wallet keeps the UX now and swaps in deeper mechanics later.",
  "Shielded pools provide Zcash-grade privacy for Solana tokens.",
  "Privacy mix adds an extra layer of transaction graph obfuscation.",
];

// ── Privacy Pool Operations ────────────────────

export function createPrivacyPool(): PrivacyPoolState {
  return {
    totalDeposits: 0,
    totalWithdrawals: 0,
    participantCount: 0,
    latestCommitment: "0x" + "00".repeat(32),
    merkleRoot: "0x" + "00".repeat(32),
  };
}

export function simulatePoolDeposit(
  pool: PrivacyPoolState,
  amount: number,
): PrivacyPoolState {
  return {
    ...pool,
    totalDeposits: pool.totalDeposits + amount,
    participantCount: pool.participantCount + 1,
    latestCommitment: "0x" + Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
    ).join(""),
  };
}

export function simulatePoolWithdrawal(
  pool: PrivacyPoolState,
  amount: number,
): PrivacyPoolState {
  return {
    ...pool,
    totalWithdrawals: pool.totalWithdrawals + amount,
    totalDeposits: Math.max(pool.totalDeposits - amount, 0),
  };
}

// ── Yield Data ──────────────────────────────────

export const DEMO_YIELD_OPPORTUNITIES: YieldOpportunity[] = [
  {
    protocol: "Marinade Finance",
    asset: "mSOL",
    apy: 7.2,
    tvl: 1_200_000_000,
    riskScore: "low",
    minDeposit: 0.1,
  },
  {
    protocol: "Jupiter JLP",
    asset: "JLP",
    apy: 15.5,
    tvl: 500_000_000,
    riskScore: "medium",
    minDeposit: 1,
  },
  {
    protocol: "Orca USDC-SOL",
    asset: "ORCA LP",
    apy: 12.8,
    tvl: 300_000_000,
    riskScore: "low",
    minDeposit: 10,
  },
  {
    protocol: "Sanctum SOL LST",
    asset: "INF SOL",
    apy: 8.4,
    tvl: 800_000_000,
    riskScore: "low",
    minDeposit: 0.5,
  },
  {
    protocol: "Kamino Lend USDC",
    asset: "kUSDC",
    apy: 9.1,
    tvl: 400_000_000,
    riskScore: "low",
    minDeposit: 100,
  },
];

// ── Risk Checks ─────────────────────────────────

export function runRiskChecks(
  amount: number,
  shieldedBalance: number,
  slippageBps: number,
  hasRecipient: boolean,
  hasMemo: boolean,
): RiskCheck[] {
  const checks: RiskCheck[] = [];

  if (amount > shieldedBalance) {
    checks.push({
      id: "insufficient-balance",
      label: "Insufficient shielded balance",
      severity: "danger",
      detail: `Need ${amount.toFixed(4)} SOL but only ${shieldedBalance.toFixed(4)} SOL shielded.`,
      actionable: true,
    });
  }

  if (slippageBps > 100) {
    checks.push({
      id: "high-slippage",
      label: "High slippage tolerance",
      severity: "warning",
      detail: `${slippageBps} bps exceeds recommended 100 bps max.`,
      actionable: true,
    });
  }

  if (!hasRecipient) {
    checks.push({
      id: "missing-recipient",
      label: "No recipient specified",
      severity: "danger",
      detail: "Private transfers need a shielded address.",
      actionable: true,
    });
  }

  if (!hasMemo && amount > 0.5) {
    checks.push({
      id: "missing-memo",
      label: "Large transfer without memo",
      severity: "info",
      detail: "Consider adding an encrypted memo for audit trail.",
      actionable: false,
    });
  }

  if (amount > 10) {
    checks.push({
      id: "large-transfer",
      label: "Large transfer detected",
      severity: "warning",
      detail: `${amount.toFixed(4)} SOL is above the 10 SOL threshold.`,
      actionable: true,
    });
  }

  return checks;
}

// ── Shielded Pool Metrics ──────────────────────

export function estimatePoolAnonymitySet(
  poolDepth: number,
  totalNotes: number,
): number {
  // Simplified: anonymity set ≈ min(depth × notes, total participants)
  return Math.min(poolDepth * totalNotes, 100_000);
}

export function calculateMixDelay(
  depth: number,
  baseDelayMs: number = 30_000,
): number {
  // Each mix hop adds a random delay
  const totalDelay = depth * baseDelayMs;
  const jitter = Math.random() * baseDelayMs;
  return totalDelay + jitter;
}