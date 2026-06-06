/**
 * @openclawd/wallet — Main entry point
 * Privy-powered embedded Solana wallet for the openclawd agent ecosystem
 */

export type {
  AgentPermission,
  AgentPermissions,
  AgenticTransaction,
  AgenticTxStatus,
  AgenticWalletConfig,
  ClawdWallet,
  ClawdWalletError,
  ClawdWalletInfo,
  PendingTransaction,
  SolanaChain,
  SwapError,
  SwapQuote,
  SwapQuoteParams,
  SwapResult,
  TokenAmount,
  TokenSymbol,
  WalletCliOptions,
  WalletNotReadyError,
  WalletServerRequest,
} from "./types.js";

export { AgenticWallet, DEFAULT_PERMISSIONS } from "./agent.js";
export { createCli } from "./cli.js";
export { formatTokenAmount, getTokenDecimals, resolveTokenMint, SOLANA_TOKENS, SwapService } from "./swap.js";
export { ClawdWallet as ClawdWalletClass } from "./wallet.js";
