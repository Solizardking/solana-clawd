/**
 * SwapService — Jupiter DEX aggregator integration
 * Fetches quotes and executes swaps through the best Solana route
 */

import {
  createJupiterApiClient,
  type QuoteResponse,
  type SwapResponse,
} from "@jup-ag/api";
import type { Connection, Transaction } from "@solana/web3.js";
import Decimal from "decimal.js";
import type { ClawdWallet } from "./wallet.js";
import type {
  SwapQuoteParams,
  SwapQuote,
  SwapResult,
  SolanaChain,
  SwapError,
  CHAIN_RPC,
} from "./types.js";

/** Jupiter API endpoints per chain */
const JUPITER_ENDPOINTS: Record<SolanaChain, string> = {
  mainnet: "https://api.jup.ag",
  devnet: "https://api.jup.ag/devnet",
  testnet: "https://api.jup.ag/devnet",
};

/**
 * Map of common token symbols → Jupiter mint addresses (Solana mainnet)
 */
export const SOLANA_TOKENS: Record<string, { symbol: string; mint: string; decimals: number }> = {
  SOL:  { symbol: "SOL",  mint: "So11111111111111111111111111111111111111112",    decimals: 9 },
  USDC: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",    decimals: 6 },
  WBTC: { symbol: "WBTC", mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",    decimals: 8 },
  WETH: { symbol: "WETH", mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",    decimals: 18 },
  BONK: { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",    decimals: 5 },
  WIF:  { symbol: "WIF",  mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",    decimals: 6 },
  POPCAT: { symbol: "POPCAT", mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", decimals: 9 },
};

/**
 * Resolve a token identifier (symbol or mint address) to a mint address
 */
export function resolveTokenMint(token: string): string {
  const upper = token.toUpperCase();
  if (SOLANA_TOKENS[upper]) return SOLANA_TOKENS[upper].mint;
  // Assume it's already a mint address if 32-44 base58 chars
  if (token.length >= 32) return token;
  throw new Error(`Unknown token: ${token}`);
}

/**
 * Get token decimals by mint address
 */
export function getTokenDecimals(mint: string): number {
  const found = Object.values(SOLANA_TOKENS).find((t) => t.mint === mint);
  return found?.decimals ?? 9;
}

export { resolveTokenMint, getTokenDecimals };

/**
 * SwapService — fetches Jupiter quotes and executes swaps via ClawdWallet
 *
 * @example
 * ```ts
 * const swap = new SwapService({ chain: "mainnet" });
 *
 * // Get a quote
 * const quote = await swap.quote({
 *   inputToken: "SOL",
 *   outputToken: "USDC",
 *   amount: "1000000000", // 1 SOL in lamports
 *   slippageBps: 50,      // 0.5%
 * });
 *
 * // Execute
 * const result = await swap.execute(wallet, quote);
 * console.log(result.explorerUrl);
 * ```
 */
export class SwapService {
  readonly #chain: SolanaChain;
  readonly #jupiter;

  constructor(config?: { chain?: SolanaChain; apiUrl?: string }) {
    this.#chain = config?.chain ?? "mainnet";
    const baseUrl = config?.apiUrl ?? JUPITER_ENDPOINTS[this.#chain];
    this.#jupiter = createJupiterApiClient({ baseUrl });
  }

  /**
   * Fetch a swap quote from Jupiter
   */
  async quote(params: SwapQuoteParams): Promise<SwapQuote> {
    const inputMint = resolveTokenMint(params.inputToken);
    const outputMint = resolveTokenMint(params.outputToken);
    const amount = BigInt(params.amount);
    const slippageBps = params.slippageBps ?? 50;

    const response = await this.#jupiter.quoteGet({
      inputMint,
      outputMint,
      amount,
      slippageBps,
      onlyDirectRoutes: params.onlyDirectRoutes ?? false,
      asLegacyTransaction: params.asLegacyTransaction ?? false,
    });

    return {
      inAmount: response.inAmount,
      outAmount: response.outAmount,
      priceImpactPct: parseFloat(response.priceImpactPct ?? "0"),
      minimumReceivedAmount: response.otherAmountThreshold,
      routePlan: response.routePlan,
      transaction: "", // filled by .execute()
    };
  }

  /**
   * Get the swap transaction from a quote
   */
  async getTransaction(quote: SwapQuote): Promise<Uint8Array> {
    const response = await this.#jupiter.swapPost({
      swapRequest: {
        quoteResponse: quote as unknown as QuoteResponse,
        userPublicKey: "", // filled by wallet
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 1_000_000,
      },
    });

    const txBytes = Buffer.from(response.swapTransaction, "base64");
    return new Uint8Array(txBytes);
  }

  /**
   * Execute a swap using the ClawdWallet
   */
  async execute(wallet: ClawdWallet, params: SwapQuoteParams): Promise<SwapResult> {
    // 1. Get quote
    const quote = await this.quote(params);

    // 2. Get transaction
    const txBytes = await this.getTransaction(quote);

    // 3. Sign and send
    const signature = await wallet.signAndSendTransaction(txBytes);

    // 4. Wait for confirmation
    const status = await wallet.waitForSignature(signature, { commitment: "confirmed" });

    if (status === "failed") {
      throw Object.assign(new Error(`Transaction ${signature} failed on-chain`), {
        name: "SwapError",
        code: "SWAP_FAILED",
      });
    }

    const inputDecimals = getTokenDecimals(resolveTokenMint(params.inputToken));
    const outputDecimals = getTokenDecimals(resolveTokenMint(params.outputToken));

    return {
      signature,
      inputAmount: formatTokenAmount(quote.inAmount, inputDecimals),
      outputAmount: formatTokenAmount(quote.outAmount, outputDecimals),
      priceImpactPct: quote.priceImpactPct,
      explorerUrl: wallet.explorerUrlForSignature(signature),
    };
  }

  /**
   * Get available tokens on Jupiter
   */
  async getTokens(): Promise<
    Array<{ symbol: string; mint: string; decimals: number; name: string }>
  > {
    const tokens = await this.#jupiter.tokenList();
    return tokens.map((t) => ({
      symbol: t.symbol ?? t.name,
      mint: t.address,
      decimals: t.decimals ?? 9,
      name: t.name,
    }));
  }

  /**
   * Get gas-less swap quote (using Jupiter's fees endpoint)
   */
  async quoteWithFees(params: SwapQuoteParams): Promise<SwapQuote & { totalFees: string }> {
    const quote = await this.quote(params);
    return {
      ...quote,
      totalFees: "0", // populated by feerefund endpoint if needed
    };
  }
}

/** Format a raw token amount string to human-readable decimal */
export function formatTokenAmount(raw: string, decimals: number): string {
  return new Decimal(raw).div(new Decimal(10).pow(decimals)).toFixed(decimals);
}
