/**
 * ClawdWallet — Core wallet wrapper
 * Wraps a Privy ConnectedStandardSolanaWallet with Solana Kit utilities
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  type SolanaRpc,
  type SolanaRpcSubscriptions,
} from "@solana/kit";
import type {
  ClawdWallet as IClawdWallet,
  ClawdWalletInfo,
  SolanaChain,
  WalletNotReadyError,
} from "./types.js";

const CHAIN_RPC: Record<SolanaChain, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

const EXPLORER_URL: Record<SolanaChain, string> = {
  mainnet: "https://solana.fm/tx",
  devnet: "https://explorer.solana.com/tx",
  testnet: "https://explorer.solana.com/tx",
};

export { EXPLORER_URL, CHAIN_RPC };

/**
 * ClawdWallet — wraps a Privy wallet + Solana Kit RPC
 *
 * @example
 * ```ts
 * const wallet = new ClawdWallet(privyWallet, { chain: "mainnet" });
 * await wallet.ready; // wait for wallet to load
 * console.log(wallet.address);
 * ```
 */
export class ClawdWallet implements IClawdWallet {
  readonly #wallet: {
    address: string;
    signAndSendTransaction?: (
      input: { transaction: Uint8Array; chain?: string },
      opts?: unknown
    ) => Promise<{ signature: Uint8Array }>;
  };
  readonly #chain: SolanaChain;
  readonly #rpcUrl: string;

  /** Solana Kit RPC client */
  readonly rpc: SolanaRpc;

  /** Solana Kit subscription client */
  readonly rpcSubscriptions: SolanaRpcSubscriptions;

  get address(): string {
    return this.#wallet.address;
  }
  get chain(): SolanaChain {
    return this.#chain;
  }
  get ready(): boolean {
    return !!this.#wallet.signAndSendTransaction;
  }
  get explorerUrl(): string {
    return EXPLORER_URL[this.#chain];
  }

  constructor(
    wallet: {
      address: string;
      signAndSendTransaction?: (
        input: { transaction: Uint8Array; chain?: string },
        opts?: unknown
      ) => Promise<{ signature: Uint8Array }>;
    },
    config?: {
      chain?: SolanaChain;
      rpcUrl?: string;
    }
  ) {
    this.#wallet = wallet;
    this.#chain = config?.chain ?? "mainnet";
    this.#rpcUrl = config?.rpcUrl ?? CHAIN_RPC[this.#chain];

    this.rpc = createSolanaRpc(this.#rpcUrl);
    this.rpcSubscriptions = createSolanaRpcSubscriptions(this.#rpcUrl);
  }

  /**
   * Get info without exposing private key material
   */
  getInfo(): ClawdWalletInfo {
    return {
      address: this.address,
      chain: this.#chain,
      ready: this.ready,
      walletClientType: "privy",
    };
  }

  /**
   * Check if wallet can sign transactions
   */
  canSign(): boolean {
    return this.ready && !!this.#wallet.signAndSendTransaction;
  }

  /**
   * Sign and send a base64-encoded transaction via Privy
   * @returns base58 transaction signature
   */
  async signAndSendTransaction(
    transaction: Uint8Array,
    chain?: SolanaChain
  ): Promise<string> {
    if (!this.canSign()) {
      throw Object.assign(new Error(`Wallet ${this.address} is not ready to sign`), {
        name: "WalletNotReadyError",
        code: "WALLET_NOT_READY",
      });
    }

    const chainType = chain ?? this.#chain;
    const result = await this.#wallet.signAndSendTransaction!(
      {
        transaction,
        chain: `solana:${chainType}`,
      },
      { preflightCommitment: "confirmed" }
    );

    // Convert Uint8Array signature to base58 string
    const { Signature } = await import("@solana/web3.js");
    return Signature.from(result.signature).toBase58();
  }

  /**
   * Get SOL balance in lamports
   */
  async getBalance(): Promise<bigint> {
    const result = await this.rpc.getBalance(address(this.address)).send();
    return BigInt(result.value);
  }

  /**
   * Get SOL balance in human-readable SOL
   */
  async getBalanceInSOL(): Promise<number> {
    const lamports = await this.getBalance();
    return Number(lamports) / 1_000_000_000;
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForSignature(
    signature: string,
    options?: { commitment?: "processed" | "confirmed" | "finalized" }
  ): Promise<"confirmed" | "failed"> {
    const commitment = options?.commitment ?? "confirmed";
    const sub = this.rpcSubscriptions.signatureNotifications(signature, {
      commitment,
    });

    return new Promise((resolve) => {
      const unsubscribe = sub.subscribe({
        onData: (notif) => {
          if (notif.value.err) {
            unsubscribe();
            resolve("failed");
          } else {
            unsubscribe();
            resolve("confirmed");
          }
        },
        onError: () => {
          unsubscribe();
          resolve("failed");
        },
      });
    });
  }

  /**
   * Build an explorer URL for a signature
   */
  explorerUrlForSignature(signature: string): string {
    return `${this.explorerUrl}/${signature}`;
  }
}
