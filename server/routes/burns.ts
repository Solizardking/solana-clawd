import { Router } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { storage } from '../storage';

const router = Router();

// Schema for burn request validation
const burnRequestSchema = z.object({
  assetId: z.string(),
  ownerAddress: z.string(),
  signature: z.string().optional(),
});

// Record a burn transaction in the database
router.post('/', async (req, res) => {
  try {
    // Validate the request body
    const result = burnRequestSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: result.error.format() 
      });
    }
    
    const { assetId, ownerAddress, signature } = result.data;
    
    // Record the burn in the database
    const burn = await storage.createBurn({
      assetId,
      ownerAddress,
      signature: signature || '',
      timestamp: new Date().toISOString(),
    });
    
    res.json({
      success: true,
      burn
    });
  } catch (error) {
    console.error('Error recording burn:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to record burn' 
    });
  }
});

// Get burns by user address
router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Basic address validation
    if (!address || address.length < 32) {
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    
    const burns = await storage.getBurnsByOwner(address);
    
    res.json({
      success: true,
      burns
    });
  } catch (error) {
    console.error('Error fetching burns:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch burns' 
    });
  }
});

export default router;