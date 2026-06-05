/**
 * @openclawd/wallet — Main entry point
 * Privy-powered embedded Solana wallet for the openclawd agent ecosystem
 */

// Types
export type {
  SolanaChain,
  TokenSymbol,
  TokenAmount,
  ClawdWallet,
  ClawdWalletInfo,
  SwapQuoteParams,
  SwapQuote,
  SwapQuoteResult,
  SwapResult,
  PendingTransaction,
  AgenticTxStatus,
  AgenticTransaction,
  AgentPermission,
  AgentPermissions,
  AgenticWalletConfig,
  WalletCliOptions,
  WalletServerRequest,
  SwapRequest,
  ClawdWalletError,
  SwapError,
  WalletNotReadyError,
} from "./types.js";

// Core classes
export { ClawdWallet } from "./wallet.js";
export { SwapService } from "./swap.js";
export { AgenticWallet, DEFAULT_PERMISSIONS } from "./agent.js";
export { createCli } from "./cli.js";

// Re-exports from sub-paths
export type { PrivyProviderConfig } from "./react.js";
