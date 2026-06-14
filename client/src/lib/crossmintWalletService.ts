import { apiRequest } from './queryClient';

// Types
export interface CrossmintWallet {
  id: string;
  address: string;
  chain: string;
  type: string;
  status: string;
}

export interface CrossmintWalletBalance {
  currency: string;
  decimals: number;
  balances: {
    [chain: string]: string;
    total: string;
  };
}

// Client-side API functions

/**
 * Creates a new server-side wallet for token launching 
 */
export const createTokenLaunchWallet = async (): Promise<{ 
  success: boolean; 
  wallet?: CrossmintWallet; 
  error?: string 
}> => {
  try {
    const response = await apiRequest<{ success: boolean; wallet: CrossmintWallet; error?: string }>(
      '/api/crossmint/wallets',
      { method: 'POST' }
    );
    
    if (!response.success || !response.wallet) {
      return {
        success: false,
        error: response.error || 'Failed to create wallet'
      };
    }
    
    return {
      success: true,
      wallet: response.wallet
    };
  } catch (error) {
    console.error('Error creating token launch wallet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Gets the balance of a wallet
 */
export const getWalletBalance = async (
  walletAddress: string
): Promise<{ 
  success: boolean; 
  balances?: CrossmintWalletBalance[]; 
  error?: string 
}> => {
  try {
    const response = await apiRequest<{ success: boolean; balances: CrossmintWalletBalance[]; error?: string }>(
      `/api/crossmint/wallets/${walletAddress}/balance`,
      { method: 'GET' }
    );
    
    if (!response.success || !response.balances) {
      return {
        success: false,
        error: response.error || 'Failed to get wallet balance'
      };
    }
    
    return {
      success: true,
      balances: response.balances
    };
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Transfers SOL tokens from a wallet to another address
 */
export const transferSol = async (
  fromWalletAddress: string, 
  toAddress: string, 
  amount: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Need to use a simple fetch here to ensure proper body formatting
    const response = await fetch(`/api/crossmint/wallets/${fromWalletAddress}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: toAddress,
        amount
      }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to transfer SOL'
      };
    }
    
    const data = await response.json();
    return {
      success: data.success
    };
  } catch (error) {
    console.error('Error transferring SOL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};