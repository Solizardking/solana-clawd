import express from 'express';
import { PublicKey } from '@solana/web3.js';
import { storage } from '../storage';
import { verifySignature } from '../lib/util';
import { insertVoteSchema } from '@shared/schema';
import { z } from 'zod';

const router = express.Router();

const voteRequestSchema = z.object({
  tokenAddress: z.string(),
  voteType: z.enum(['up', 'down']),
  wallet: z.string(),
  signature: z.string(),
  message: z.string()
});

type VoteRequest = z.infer<typeof voteRequestSchema>;

// Get votes for a token
router.get('/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const { wallet } = req.query;

    // Validate the token address (basic validation)
    if (!tokenAddress || tokenAddress.length < 32) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    // Get all votes for this token
    const votes = await storage.getVotesByToken(tokenAddress);
    
    // Calculate vote counts
    const upvotes = votes.filter(v => v.voteType === 'up').length;
    const downvotes = votes.filter(v => v.voteType === 'down').length;
    
    // Check if this wallet has voted
    let userVote: boolean | null = null;
    if (wallet && typeof wallet === 'string') {
      const hasVoted = await storage.hasVoted(tokenAddress, wallet);
      if (hasVoted) {
        const vote = votes.find(v => v.walletAddress === wallet);
        if (vote) {
          userVote = vote.voteType === 'up';
        }
      }
    }

    return res.json({
      upvotes,
      downvotes,
      totalVotes: votes.length,
      userVote
    });
  } catch (error) {
    console.error('Error fetching votes:', error);
    return res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

// Submit a vote
router.post('/', async (req, res) => {
  try {
    // Validate request body
    const result = voteRequestSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request data', details: result.error.format() });
    }

    const { tokenAddress, voteType, wallet, signature, message } = result.data;

    // Verify that the token exists in storage
    const token = await storage.getToken(tokenAddress);
    if (!token) {
      // If the token doesn't exist in our storage but is a valid address,
      // we'll allow the vote but log a warning
      console.warn(`Vote submitted for unknown token: ${tokenAddress}`);
    }

    // Verify that the message was signed by the wallet
    try {
      const publicKey = new PublicKey(wallet);
      const signatureBuffer = Buffer.from(signature, 'base64');
      const messageBuffer = Buffer.from(message, 'base64');

      const isValid = verifySignature(publicKey, messageBuffer, signatureBuffer);
      
      if (!isValid) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } catch (verifyError) {
      console.error('Signature verification error:', verifyError);
      return res.status(403).json({ error: 'Signature verification failed' });
    }

    // Check if user has already voted
    const hasVoted = await storage.hasVoted(tokenAddress, wallet);
    if (hasVoted) {
      return res.status(409).json({ error: 'Already voted for this token' });
    }

    // Create a unique ID for the vote (tokenAddress-walletAddress)
    const voteId = `${tokenAddress}-${wallet}`;
    
    // Save the vote
    await storage.addVote({
      id: voteId,
      tokenAddress,
      walletAddress: wallet,
      voteType,
      timestamp: Math.floor(Date.now() / 1000) // Unix timestamp (seconds)
    });

    // Get updated vote counts
    const votes = await storage.getVotesByToken(tokenAddress);
    const count = votes.filter(v => v.voteType === voteType).length;

    return res.status(201).json({ 
      success: true, 
      count,
      message: 'Vote recorded successfully'
    });
  } catch (error) {
    console.error('Error submitting vote:', error);
    return res.status(500).json({ error: 'Failed to submit vote' });
  }
});

export default router;