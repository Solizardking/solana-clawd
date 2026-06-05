/**
 * @openclawd/wallet — TypeScript type definitions
 * Privy-powered embedded Solana wallet for the openclawd agent ecosystem
 */

import type { Connection } from "@solana/web3.js";

// ─── Chain ─────────────────────────────────────────────────────────────────

/** Solana network */
export type SolanaChain = "mainnet" | "devnet" | "testnet";

/** SOL and major SPL tokens */
export type TokenSymbol = "SOL" | "USDC" | "USDT" | "WBTC" | "WETH" | string;

/** Token amount with optional decimals override */
export interface TokenAmount {
  symbol: TokenSymbol;
  amount: string; // raw integer string (lamports / token decimals)
  decimals?: number;
  uiAmount?: number; // human-readable
}

// ─── Wallet ────────────────────────────────────────────────────────────────

/** A Clawd Wallet backed by Privy */
export interface ClawdWallet {
  address: string; // base58 Solana pubkey
  label?: string;
  chain: SolanaChain;
  /** True once the Privy wallet is fully loaded */
  ready: boolean;
}

/** Full wallet info (includes type) */
export interface ClawdWalletInfo extends ClawdWallet {
  walletClientType: "privy" | "external";
  /** Linked Privy user ID, if embedded */
  userId?: string;
  /** Creation timestamp */
  createdAt: string;
}

// ─── Swaps ─────────────────────────────────────────────────────────────────

/** Jupiter quote parameters */
export interface SwapQuoteParams {
  inputToken: TokenSymbol | string; // mint address or symbol
  outputToken: TokenSymbol | string;
  amount: string; // raw input amount
  slippageBps?: number; // basis points (default: 50 = 0.5%)
  /** Only consider routes through these pools */
  onlyDirectRoutes?: boolean;
  /** Prefer fixed output (true) vs fixed input (false) */
  asLegacyTransaction?: boolean;
}

/** Route from Jupiter aggregator */
export interface SwapQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  /** Minimum received after slippage */
  minimumReceivedAmount: string;
  /** Jupiter route plan (for execution) */
  routePlan: JupiterRoutePlan[];
  /** Serialized transaction bytes (for signing) */
  transaction: string; // base64
}

/** A single step in a Jupiter swap route */
export interface JupiterRoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

/** Executed swap result */
export interface SwapResult {
  signature: string; // base58 transaction signature
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: number;
  /** Solana transaction explorer URL */
  explorerUrl: string;
}

// ─── Transactions ──────────────────────────────────────────────────────────

/** A pending transaction awaiting user approval */
export interface PendingTransaction {
  id: string;
  description: string;
  type: "swap" | "transfer" | "sign" | "unknown";
  network: SolanaChain;
  createdAt: number; // unix ms
  /** Base64-encoded unsigned transaction */
  transaction: string;
  walletAddress: string;
  /** Set once resolved */
  resolved?: { signature?: string; rejected?: boolean };
}

/** Status of an agentic transaction */
export type AgenticTxStatus = "pending" | "approved" | "rejected" | "signed" | "confirmed" | "failed";

/** A transaction submitted by the agent */
export interface AgenticTransaction {
  id: string;
  description: string;
  status: AgenticTxStatus;
  signature?: string;
  submittedAt: number;
  confirmedAt?: number;
  error?: string;
}

// ─── Agentic Wallet ────────────────────────────────────────────────────────

/** Policy for what the agent can do without prompting */
export type AgentPermission = "ask" | "allow" | "deny";

/** Permissions for the agentic signing session */
export interface AgentPermissions {
  /** Swap up to this amount in USD (default: $50) */
  maxSwapUsd: number;
  /** Max SOL per transfer (default: 0.1) */
  maxTransferSol: number;
  /** Whether to allow swaps without asking */
  swap: AgentPermission;
  /** Whether to allow signing arbitrary messages */
  signMessage: AgentPermission;
  /** Whether to allow transfers */
  transfer: AgentPermission;
  /** Auto-confirm if price impact is below this % */
  autoConfirmBelowPriceImpact: number;
}

/** Configuration for the agentic signing session */
export interface AgenticWalletConfig {
  /** Privy app ID (from dashboard.privy.io) */
  privyAppId: string;
  /** xAI / Grok API key for transaction pre-screening */
  grokApiKey?: string;
  /** Solana RPC endpoint */
  rpcUrl?: string;
  /** Default permissions for the agent */
  permissions: AgentPermissions;
  /** Notification callback for pending actions */
  onPendingTransaction?: (tx: PendingTransaction) => Promise<boolean>;
  /** Called when the agent submits a transaction */
  onTransactionStatus?: (tx: AgenticTransaction) => void;
  /** Custom chain (default: mainnet) */
  chain?: SolanaChain;
}

const DEFAULT_PERMISSIONS: AgentPermissions = {
  maxSwapUsd: 50,
  maxTransferSol: 0.1,
  swap: "ask",
  signMessage: "deny",
  transfer: "deny",
  autoConfirmBelowPriceImpact: 0.5,
};

export const DEFAULT_CHAIN: SolanaChain = "mainnet";

export { DEFAULT_PERMISSIONS };

// ─── Server / Backend ─────────────────────────────────────────────────────

/** Server-side wallet operation request */
export interface WalletServerRequest {
  walletId: string;
  action: "swap" | "transfer" | "sign";
  params: Record<string, unknown>;
  /** Unix timestamp */
  timestamp: number;
  /** HMAC signature of the request body */
  signature?: string;
}

/** Server-side swap request */
export interface SwapRequest {
  walletId: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  slippageBps?: number;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

/** CLI wallet command options */
export interface WalletCliOptions {
  chain?: SolanaChain;
  rpcUrl?: string;
  json?: boolean;
}

// ─── Errors ────────────────────────────────────────────────────────────────

export class ClawdWalletError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ClawdWalletError";
  }
}

export class SwapError extends ClawdWalletError {
  constructor(message: string, details?: unknown) {
    super(message, "SWAP_ERROR", details);
    this.name = "SwapError";
  }
}

export class WalletNotReadyError extends ClawdWalletError {
  constructor(address: string) {
    super(`Wallet ${address} is not ready`, "WALLET_NOT_READY");
    this.name = "WalletNotReadyError";
  }
}
