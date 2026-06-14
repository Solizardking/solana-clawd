import { Connection, PublicKey, Transaction } from "@solana/web3.js";

// Types for Base blockchain transactions
export interface BaseTransaction {
  to: string;
  value: string;
  data?: string;
}

export interface CrossmintWalletResponse {
  connected: boolean;
  address?: string;
  chainId?: number;
  error?: string;
}

export class CrossmintService {
  private adapter: any | null = null;
  private sdkModule: any | null = null;
  private isConnected: boolean = false;
  private userAddress: string | undefined = undefined;
  private chainId: number | undefined = undefined;

  constructor() {
    // Will initialize the adapter when connect() is called
    this.isConnected = false;
  }

  /**
   * Connect to the Crossmint wallet
   */
  public async connect(): Promise<CrossmintWalletResponse> {
    try {
      if (!this.sdkModule) {
        this.sdkModule = await import("@crossmint/wallets-sdk");
      }

      // Initialize the adapter if it's not already initialized
      if (!this.adapter) {
        try {
          // Create a new CrossmintWallets instance
          this.adapter = new this.sdkModule.CrossmintWallets({
            apiKey: import.meta.env.VITE_CROSSMINT_API_KEY || "",
            chain: "base", // Using Base blockchain
          });
        } catch (initError) {
          console.error("Failed to initialize Crossmint wallet:", initError);
          return {
            connected: false,
            error: initError instanceof Error ? initError.message : "Failed to initialize Crossmint wallet",
          };
        }
      }

      await this.adapter.connect();
      
      // Get the connected wallet address
      const accounts = await this.adapter.getAccounts();
      if (accounts.length === 0) {
        return {
          connected: false,
          error: "No accounts found after connection",
        };
      }

      this.isConnected = true;
      this.userAddress = accounts[0];
      
      // Get the chain ID
      const chainId = await this.adapter.getChainId();
      this.chainId = chainId;

      return {
        connected: true,
        address: this.userAddress || undefined,
        chainId: this.chainId || undefined,
      };
    } catch (error) {
      console.error("Error connecting to Crossmint wallet:", error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Disconnect from the Crossmint wallet
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.adapter) {
        await this.adapter.disconnect();
      }
      this.isConnected = false;
      this.userAddress = undefined;
      this.chainId = undefined;
    } catch (error) {
      console.error("Error disconnecting from Crossmint wallet:", error);
      throw error;
    }
  }

  /**
   * Check if the wallet is connected
   */
  public isWalletConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get the connected wallet address
   */
  public getWalletAddress(): string | undefined {
    return this.userAddress;
  }

  /**
   * Get the chain ID
   */
  public getChainId(): number | undefined {
    return this.chainId;
  }

  /**
   * Send a transaction on the Base blockchain
   */
  public async sendTransaction(transaction: BaseTransaction): Promise<string> {
    try {
      if (!this.adapter || !this.isConnected) {
        throw new Error("Wallet not connected");
      }

      // Send the transaction
      const txHash = await this.adapter.sendTransaction({
        to: transaction.to,
        value: transaction.value,
        data: transaction.data || "0x",
      });

      return txHash;
    } catch (error) {
      console.error("Error sending transaction:", error);
      throw error;
    }
  }

  /**
   * Get the balance of the connected wallet
   */
  public async getBalance(): Promise<string> {
    try {
      if (!this.adapter || !this.isConnected) {
        throw new Error("Wallet not connected");
      }

      const balance = await this.adapter.getBalance();
      return balance;
    } catch (error) {
      console.error("Error getting balance:", error);
      throw error;
    }
  }
}

// Create a singleton instance
const crossmintService = new CrossmintService();
export default crossmintService;
