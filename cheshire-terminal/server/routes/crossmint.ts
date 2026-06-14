import { Router } from 'express';
import { createTokenLaunchWallet, getWalletBalance, transferSol } from '../lib/crossmint/walletService';

const router = Router();

// Create a new token launch wallet
router.post('/wallets', async (req, res) => {
  try {
    const result = await createTokenLaunchWallet();
    
    if (!result.success || !result.wallet) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Failed to create wallet'
      });
    }
    
    return res.status(201).json({ 
      success: true, 
      wallet: result.wallet 
    });
  } catch (error) {
    console.error('Error in /wallets route:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get wallet balance
router.get('/wallets/:address/balance', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wallet address is required' 
      });
    }
    
    const balances = await getWalletBalance(address);
    
    if (!balances) {
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to get wallet balance'
      });
    }
    
    return res.json({ success: true, balances });
  } catch (error) {
    console.error('Error in /wallets/:address/balance route:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Transfer SOL tokens
router.post('/wallets/:address/transfer', async (req, res) => {
  try {
    const { address } = req.params;
    const { recipient, amount } = req.body;
    
    if (!address || !recipient || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wallet address, recipient address, and amount are required' 
      });
    }
    
    const success = await transferSol(address, recipient, amount);
    
    if (!success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to transfer SOL'
      });
    }
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in /wallets/:address/transfer route:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

export default router;