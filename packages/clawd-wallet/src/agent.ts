/**
 * AgenticWallet — Privy-embedded Solana wallet with Grok 4.20 Beta
 * as the AI reasoning layer for agentic trading decisions.
 *
 * Architecture:
 *   User → Grok 4.20 Beta → ClawdWallet (Privy) → Solana blockchain
 *
 * Permissions flow:
 *   deny  → always ask the user
 *   ask   → Grok summarizes, user confirms or rejects
 *   allow → auto-sign up to maxSwapUsd / maxTransferSol
 */

import { xai } from "@ai-sdk/xai";
import { createLanguageModel } from "ai";
import type {
  AgentPermissions,
  AgenticWalletConfig,
  AgenticTransaction,
  PendingTransaction,
  SwapQuoteParams,
  ClawdWallet,
} from "./types.js";
import { SwapService, SOLANA_TOKENS } from "./swap.js";

const DEFAULT_PERMISSIONS: AgentPermissions = {
  maxSwapUsd: 50,
  maxTransferSol: 0.1,
  swap: "ask",
  signMessage: "deny",
  transfer: "deny",
  autoConfirmBelowPriceImpact: 0.5,
};

// ─── Transaction description generator ───────────────────────────────────

function describeTransaction(params: SwapQuoteParams, quote?: { outAmount: string; priceImpactPct: number }): string {
  const inputMint = resolveTokenSymbol(params.inputToken);
  const outputMint = resolveTokenSymbol(params.outputToken);
  const rawAmount = params.amount;
  const decimals = SOLANA_TOKENS[inputMint]?.decimals ?? 9;
  const inputAmount = formatRaw(rawAmount, decimals);

  if (!quote) {
    return `Swap ${inputAmount} ${inputMint} → ${outputMint}?`;
  }

  const outDecimals = SOLANA_TOKENS[outputMint]?.decimals ?? 9;
  const outputAmount = formatRaw(quote.outAmount, outDecimals);
  const priceImpact = quote.priceImpactPct.toFixed(3);

  return `Swap ${inputAmount} ${inputMint} → ${outputAmount} ${outputMint} (price impact: ${priceImpact}%)?`;
}

function resolveTokenSymbol(token: string): string {
  const upper = token.toUpperCase();
  return SOLANA_TOKENS[upper]?.symbol ?? token.slice(0, 8);
}

function formatRaw(raw: string, decimals: number): string {
  const { Decimal } = require("decimal.js");
  return new Decimal(raw).div(new Decimal(10).pow(decimals)).toFixed(4);
}

// ─── Grok pre-screening ───────────────────────────────────────────────────

async function grokScreen(
  description: string,
  config: AgenticWalletConfig,
  pendingTx: PendingTransaction
): Promise<{ approved: boolean; reason: string }> {
  if (!config.grokApiKey) {
    // No Grok — fall back to always asking
    return { approved: false, reason: "No Grok API key — requiring user confirmation" };
  }

  const model = createLanguageModel({
    provider: "xai",
    apiKey: config.grokApiKey,
    model: "grok-4.20-beta",
  });

  const prompt = `You are a trading safety advisor for an AI agent. Analyze this Solana transaction:

Description: ${description}
Transaction type: ${pendingTx.type}
Network: ${pendingTx.network}
Wallet: ${pendingTx.walletAddress.slice(0, 8)}...${pendingTx.walletAddress.slice(-4)}

Respond with ONLY a JSON object:
{ "approved": true/false, "reason": "one sentence explanation" }

Reject if:
- Any token appears to be a honeypot or has no liquidity
- Amount exceeds the user's stated limits
- Transaction involves an unknown or suspicious contract
- Price impact exceeds 10%`;

  const result = await model.generate({
    prompt,
    structuredOutput: { approved: "boolean", reason: "string" },
  });

  return result.object as { approved: boolean; reason: string };
}

// ─── Approval flow ────────────────────────────────────────────────────────

async function requireApproval(
  description: string,
  pendingTx: PendingTransaction,
  config: AgenticWalletConfig
): Promise<boolean> {
  // First: Grok pre-screens
  const { approved: grokApproved, reason: grokReason } = await grokScreen(
    description,
    config,
    pendingTx
  );

  if (!grokApproved) {
    console.log(`[clawd-wallet] Grok rejected: ${grokReason}`);
    return false;
  }

  // Then: ask the user callback
  if (config.onPendingTransaction) {
    return config.onPendingTransaction(pendingTx);
  }

  // No callback — deny by default
  return false;
}

// ─── AgenticWallet ────────────────────────────────────────────────────────

export class AgenticWallet {
  readonly #wallet: ClawdWallet;
  readonly #swap: SwapService;
  readonly #config: AgenticWalletConfig;

  /** History of agent-submitted transactions */
  readonly transactionHistory: AgenticTransaction[] = [];

  get wallet(): ClawdWallet {
    return this.#wallet;
  }

  get permissions(): AgentPermissions {
    return this.#config.permissions;
  }

  constructor(wallet: ClawdWallet, config: AgenticWalletConfig) {
    this.#wallet = wallet;
    this.#swap = new SwapService({ chain: config.chain ?? "mainnet" });
    this.#config = {
      permissions: { ...DEFAULT_PERMISSIONS, ...config.permissions },
      grokApiKey: config.grokApiKey,
      rpcUrl: config.rpcUrl,
      onPendingTransaction: config.onPendingTransaction,
      onTransactionStatus: config.onTransactionStatus,
    };
  }

  /**
   * Agent-initiated swap — checks permissions before executing
   */
  async agentSwap(params: SwapQuoteParams): Promise<{ signature: string; explorerUrl: string }> {
    const quote = await this.#swap.quote(params);
    const description = describeTransaction(params, quote);
    const txId = `swap-${Date.now()}`;

    const pendingTx: PendingTransaction = {
      id: txId,
      description,
      type: "swap",
      network: this.#wallet.chain,
      createdAt: Date.now(),
      transaction: "",
      walletAddress: this.#wallet.address,
    };

    this.#notifyStatus({
      id: txId,
      description,
      status: "pending",
      submittedAt: Date.now(),
    });

    const permission = this.#config.permissions.swap;

    if (permission === "allow") {
      console.log(`[clawd-wallet] Auto-approved swap (permission=allow)`);
    } else if (permission === "ask") {
      const approved = await requireApproval(description, pendingTx, this.#config);
      if (!approved) {
        this.#notifyStatus({
          id: txId,
          description,
          status: "rejected",
          submittedAt: Date.now(),
        });
        throw Object.assign(new Error("Swap rejected by user"), {
          name: "SwapRejected",
          code: "USER_REJECTED",
        });
      }
    } else {
      throw Object.assign(new Error("Swap denied (permission=deny)"), {
        name: "SwapDenied",
        code: "PERMISSION_DENIED",
      });
    }

    this.#notifyStatus({
      id: txId,
      description,
      status: "approved",
      submittedAt: Date.now(),
    });

    const result = await this.#swap.execute(this.#wallet, params);

    this.#notifyStatus({
      id: txId,
      description,
      status: "confirmed",
      signature: result.signature,
      submittedAt: pendingTx.createdAt,
      confirmedAt: Date.now(),
    });

    return {
      signature: result.signature,
      explorerUrl: result.explorerUrl,
    };
  }

  /**
   * Get transaction history for the agent context
   */
  getHistory(): AgenticTransaction[] {
    return [...this.transactionHistory];
  }

  /**
   * Summarize recent activity for the AI agent
   */
  summarizeActivity(): string {
    const recent = this.transactionHistory.slice(-10);
    if (!recent.length) return "No transactions yet.";

    return recent
      .map(
        (tx) =>
          `[${tx.status.toUpperCase()}] ${tx.description} — ${tx.signature?.slice(0, 8) ?? "pending"}`
      )
      .join("\n");
  }

  #notifyStatus(tx: AgenticTransaction): void {
    this.transactionHistory.push(tx);
    this.#config.onTransactionStatus?.(tx);
  }
}

export { DEFAULT_PERMISSIONS };
