import fetch from 'node-fetch';

// Constants
const API_BASE_URL = 'https://www.crossmint.com/api/2022-06-09';
const SERVER_API_KEY = process.env.CROSSMINT_SERVER_SIDE_API_KEY;

// Types
export interface WalletConfig {
  type: 'solana-smart-wallet';
  config?: {
    adminSigner?: {
      type: 'solana-keypair';
    };
  };
}

export interface ServerWallet {
  id: string;
  address: string;
  chain: string;
  type: string;
  status: string;
}

export interface CreateWalletResponse {
  wallet: ServerWallet;
}

export interface WalletBalance {
  currency: string;
  decimals: number;
  balances: {
    [chain: string]: string;
    total: string;
  };
}

/**
 * Creates a new Solana wallet on the Crossmint platform
 */
export async function createServerWallet(): Promise<ServerWallet | null> {
  if (!SERVER_API_KEY) {
    console.error('Crossmint server API key is missing');
    return null;
  }

  try {
    const walletConfig: WalletConfig = {
      type: 'solana-smart-wallet',
      config: {
        adminSigner: {
          type: 'solana-keypair'
        }
      }
    };

    const response = await fetch(`${API_BASE_URL}/wallets`, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERVER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(walletConfig)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to create wallet: ${response.status} ${errorText}`);
      return null;
    }

    const data = await response.json() as CreateWalletResponse;
    return data.wallet;
  } catch (error) {
    console.error('Error creating Crossmint wallet:', error);
    return null;
  }
}

/**
 * Gets the balance of a wallet
 */
export async function getWalletBalance(walletAddress: string): Promise<WalletBalance[] | null> {
  if (!SERVER_API_KEY) {
    console.error('Crossmint server API key is missing');
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/wallets/${walletAddress}/balances`, {
      method: 'GET',
      headers: {
        'X-API-KEY': SERVER_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to get wallet balance: ${response.status} ${errorText}`);
      return null;
    }

    return await response.json() as WalletBalance[];
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return null;
  }
}

/**
 * Transfers SOL tokens from a wallet to another address
 */
export async function transferSol(
  fromWalletAddress: string, 
  toAddress: string, 
  amount: string
): Promise<boolean> {
  if (!SERVER_API_KEY) {
    console.error('Crossmint server API key is missing');
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/wallets/${fromWalletAddress}/transactions`, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERVER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'transfer-native',
        params: {
          recipient: toAddress,
          amount: amount,
          chain: 'solana-mainnet'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to transfer SOL: ${response.status} ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error transferring SOL:', error);
    return false;
  }
}

/**
 * Creates and initializes a token launch wallet
 */
export async function createTokenLaunchWallet(): Promise<{
  wallet: ServerWallet | null,
  success: boolean;
  error?: string;
}> {
  try {
    const wallet = await createServerWallet();
    
    if (!wallet) {
      return {
        wallet: null,
        success: false,
        error: 'Failed to create wallet'
      };
    }

    return {
      wallet,
      success: true
    };
  } catch (error) {
    console.error('Error creating token launch wallet:', error);
    return {
      wallet: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}