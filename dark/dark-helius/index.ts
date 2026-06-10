// ───────────────────────────────────────────────
// 📡 Dark Helius — Helius Smart Infrastructure Module
// Enterprise Solana RPC, Webhooks, DAS API
// ───────────────────────────────────────────────

import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";

// ── Types ───────────────────────────────────────

export interface HeliusConfig {
  apiKey: string;
  rpcUrl?: string;
  webhookBase?: string;
}

export interface SmartTransactionOptions {
  instructions: TransactionInstruction[];
  signers: { publicKey: PublicKey; sign: (tx: Uint8Array) => Promise<Uint8Array> }[];
  feePayer: PublicKey;
  priorityFee?: number;
  computeUnits?: number;
  skipPreflight?: boolean;
}

export interface WebhookConfig {
  webhookUrl: string;
  transactionTypes: WebhookTransactionType[];
  accountAddresses: string[];
  webhookType?: "enhanced" | "raw" | "rawDevnet";
}

export type WebhookTransactionType =
  | "ANY"
  | "NFT_BID"
  | "NFT_LISTING"
  | "NFT_SALE"
  | "NFT_MINT"
  | "SWAP"
  | "BRIDGE"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER";

export interface DasAsset {
  interface: string;
  id: string;
  content?: {
    metadata: {
      name: string;
      symbol: string;
      description: string;
      image: string;
    };
    files?: Array<{ uri: string; mime: string }>;
  };
  authorities: Array<{
    address: string;
    scopes: string[];
  }>;
  ownership: {
    owner: string;
    supply?: number;
  };
  compression?: {
    eligible: boolean;
    compressed: boolean;
    dataHash: string;
    creatorHash: string;
    leafId: number;
    tree: string;
  };
}

export interface PriorityFeeEstimate {
  recommended: number; // microLamports per CU
  min: number;
  max: number;
  median: number;
}

export interface TransactionResult {
  signature: string;
  slot?: number;
  blockTime?: number;
  error?: string;
}

// ── Constants ───────────────────────────────────

const DEFAULT_COMPUTE_UNITS = 200_000;
const DEFAULT_PRIORITY_FEE = 10_000; // microLamports
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 500;
const HELIUS_RPC_BASE = "https://mainnet.helius-rpc.com";

// ── Helius Client ───────────────────────────────

export class HeliusClient {
  public readonly connection: Connection;
  private readonly config: HeliusConfig;

  constructor(config: HeliusConfig) {
    this.config = config;
    const rpcUrl = config.rpcUrl ?? `${HELIUS_RPC_BASE}/?api-key=${config.apiKey}`;
    this.connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60_000,
    });
  }

  // ── Smart Transactions ────────────────────────

  async estimateComputeUnits(instructions: TransactionInstruction[]): Promise<number> {
    try {
      // In production: simulate the transaction to measure CU
      return instructions.length * 50_000 + 50_000;
    } catch {
      return DEFAULT_COMPUTE_UNITS;
    }
  }

  async createSmartTx(options: SmartTransactionOptions): Promise<TransactionResult> {
    const cu = options.computeUnits ?? await this.estimateComputeUnits(options.instructions);
    const priorityFee = options.priorityFee ?? DEFAULT_PRIORITY_FEE;

    // Build priority fee instruction
    const computeBudgetIx = this.createSetComputeUnitLimitInstruction(cu);
    const priorityFeeIx = this.createSetComputeUnitPriceInstruction(priorityFee);

    const allInstructions = [computeBudgetIx, priorityFeeIx, ...options.instructions];

    // Build and send transaction with retry
    return this.sendWithRetry(allInstructions, options.signers, options.feePayer, options.skipPreflight);
  }

  private createSetComputeUnitLimitInstruction(units: number): TransactionInstruction {
    // ComputeBudgetProgram.setComputeUnitLimit
    const data = Buffer.alloc(9);
    data.writeUInt8(2, 0); // instruction index
    data.writeUInt32LE(units, 1);
    return {
      programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
      keys: [],
      data: new Uint8Array(data),
    } as unknown as TransactionInstruction;
  }

  private createSetComputeUnitPriceInstruction(microLamports: number): TransactionInstruction {
    const data = Buffer.alloc(9);
    data.writeUInt8(3, 0); // instruction index
    data.writeBigUInt64LE(BigInt(microLamports), 1);
    return {
      programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
      keys: [],
      data: new Uint8Array(data),
    } as unknown as TransactionInstruction;
  }

  private async sendWithRetry(
    instructions: TransactionInstruction[],
    signers: SmartTransactionOptions["signers"],
    feePayer: PublicKey,
    skipPreflight?: boolean,
  ): Promise<TransactionResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const { blockhash } = await this.connection.getLatestBlockhash("confirmed");

        const { Transaction } = await import("@solana/web3.js");
        const tx = new Transaction({
          feePayer,
          recentBlockhash: blockhash,
        });
        tx.add(...instructions);

        // Sign with all signers
        for (const signer of signers) {
          const serialized = tx.serializeMessage();
          const signature = await signer.sign(serialized);
          tx.addSignature(signer.publicKey, Buffer.from(signature));
        }

        // Send
        const signature = await this.connection.sendRawTransaction(
          tx.serialize(),
          { skipPreflight: skipPreflight ?? true, maxRetries: 3 },
        );

        // Confirm
        const confirmation = await this.connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight: 0,
        });

        return {
          signature,
          slot: confirmation.context?.slot,
          error: confirmation.value?.err ? String(confirmation.value.err) : undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    return { signature: "", error: lastError };
  }

  // ── DAS API ───────────────────────────────────

  async dasGetAsset(assetId: string): Promise<DasAsset | null> {
    try {
      const response = await fetch(this.config.rpcUrl ?? `${HELIUS_RPC_BASE}/?api-key=${this.config.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "dark-helius-das",
          method: "getAsset",
          params: [assetId],
        }),
      });

      if (!response.ok) return null;
      const json = await response.json() as { result?: DasAsset };
      return json.result ?? null;
    } catch {
      return null;
    }
  }

  async dasGetAssetsByOwner(owner: string): Promise<DasAsset[]> {
    try {
      const response = await fetch(this.config.rpcUrl ?? `${HELIUS_RPC_BASE}/?api-key=${this.config.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "dark-helius-das",
          method: "getAssetsByOwner",
          params: [owner, { limit: 50 }],
        }),
      });

      if (!response.ok) return [];
      const json = await response.json() as { result?: { items: DasAsset[] } };
      return json.result?.items ?? [];
    } catch {
      return [];
    }
  }

  // ── Webhook Management ────────────────────────

  async createWebhook(config: WebhookConfig): Promise<{ webhookId: string } | null> {
    try {
      const response = await fetch("https://api.helius.xyz/v0/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhookURL: config.webhookUrl,
          transactionTypes: config.transactionTypes,
          accountAddresses: config.accountAddresses,
          webhookType: config.webhookType ?? "enhanced",
          authHeader: `Bearer ${this.config.apiKey}`,
        }),
      });

      if (!response.ok) return null;
      const json = await response.json() as { webhookID: string };
      return { webhookId: json.webhookID };
    } catch {
      return null;
    }
  }

  async getWebhooks(): Promise<Array<{ id: string; url: string }>> {
    try {
      const response = await fetch(`https://api.helius.xyz/v0/webhooks?apiKey=${this.config.apiKey}`);
      if (!response.ok) return [];
      const json = await response.json() as Array<{ webhookID: string; webhookURL: string }>;
      return json.map(w => ({ id: w.webhookID, url: w.webhookURL }));
    } catch {
      return [];
    }
  }

  async deleteWebhook(webhookId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/webhooks/${webhookId}?apiKey=${this.config.apiKey}`,
        { method: "DELETE" },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // ── Priority Fee Estimation ───────────────────

  async estimatePriorityFee(): Promise<PriorityFeeEstimate> {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/priority-fee?apiKey=${this.config.apiKey}`,
      );
      if (!response.ok) return this.defaultFeeEstimate();

      const json = await response.json() as {
        recommended: number;
        min: number;
        max: number;
        median: number;
      };

      return {
        recommended: json.recommended ?? DEFAULT_PRIORITY_FEE,
        min: json.min ?? 1_000,
        max: json.max ?? 100_000,
        median: json.median ?? DEFAULT_PRIORITY_FEE,
      };
    } catch {
      return this.defaultFeeEstimate();
    }
  }

  private defaultFeeEstimate(): PriorityFeeEstimate {
    return {
      recommended: DEFAULT_PRIORITY_FEE,
      min: 1_000,
      max: 100_000,
      median: DEFAULT_PRIORITY_FEE,
    };
  }

  // ── Balance & Account ─────────────────────────

  async getBalance(address: string): Promise<number> {
    try {
      const pk = new PublicKey(address);
      const balance = await this.connection.getBalance(pk);
      return balance / 1_000_000_000;
    } catch {
      return 0;
    }
  }

  async getTokenAccounts(owner: string): Promise<Array<{ mint: string; balance: number }>> {
    try {
      const pk = new PublicKey(owner);
      const accounts = await this.connection.getParsedTokenAccountsByOwner(pk, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });

      return accounts.value.map(acc => ({
        mint: acc.account.data.parsed.info.mint,
        balance: acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0,
      }));
    } catch {
      return [];
    }
  }
}

// ── Factory ─────────────────────────────────────

export function createHeliusClient(apiKey: string, rpcUrl?: string): HeliusClient {
  return new HeliusClient({ apiKey, rpcUrl });
}

// ── Free Function API ───────────────────────────

export async function estimatePriorityFee(connection: Connection): Promise<number> {
  try {
    // Estimate from recent block's fees
    const recentPerformance = await connection.getRecentPerformanceSamples(1);
    if (recentPerformance.length > 0) {
      const tps = recentPerformance[0].numTransactions /
        Math.max(recentPerformance[0].samplePeriodSecs, 1);
      // Higher TPS = higher fee needed
      if (tps > 4000) return 50_000;
      if (tps > 2000) return 20_000;
      return DEFAULT_PRIORITY_FEE;
    }
    return DEFAULT_PRIORITY_FEE;
  } catch {
    return DEFAULT_PRIORITY_FEE;
  }
}

export async function dasGetAsset(
  rpcUrl: string,
  assetId: string,
): Promise<DasAsset | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dark-helius-das",
        method: "getAsset",
        params: [assetId],
      }),
    });

    if (!response.ok) return null;
    const json = await response.json() as { result?: DasAsset };
    return json.result ?? null;
  } catch {
    return null;
  }
}

export async function createWebhook(
  apiKey: string,
  config: WebhookConfig,
): Promise<{ webhookId: string } | null> {
  const client = new HeliusClient({ apiKey });
  return client.createWebhook(config);
}