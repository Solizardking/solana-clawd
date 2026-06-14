import { Router } from 'express';
import { z } from 'zod';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { StreamFlowService, CLAWD_MINT } from '../lib/streamflow';
import { getLogger } from '../lib/util';
import { getWallet } from '../lib/crossmint/serverWallet';

const router = Router();
const logger = getLogger('StreamFlowRoutes');

// Initialize connection and StreamFlow service
const connection = new Connection(
  process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed',
);

// Read-only StreamFlow service for querying locked balances (no wallet needed)
const queryService = new StreamFlowService(connection, 6);

// Schema for creating a vesting schedule
const createVestingSchema = z.object({
  tokenMint: z.string(),
  recipient: z.string(),
  amount: z.number().positive(),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  releaseFrequency: z.enum(['daily', 'weekly', 'monthly', 'once']),
  cliffPercent: z.number().min(0).max(100).optional(),
});

// Schema for creating a token stream
const createStreamSchema = z.object({
  tokenMint: z.string(),
  recipient: z.string(),
  amountPerSecond: z.number().positive(),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive().optional(),
  canCancel: z.boolean().optional(),
  canTransfer: z.boolean().optional(),
});

// ── Real-time locked balance endpoint (no auth required) ──────────────

/**
 * GET /api/streamflow/locked-balance
 * 
 * Returns real-time locked/vested balance for the $CLAWD token from StreamFlow.
 * This queries the StreamFlow program accounts on-chain using getProgramAccounts
 * with a memcmp filter on the mint address.
 * 
 * Query params:
 *   - tokenMint: optional, defaults to CLAWD mint
 *   - closed: optional, "true" to include closed streams
 */
router.get('/locked-balance', async (req, res) => {
  try {
    const tokenMint = (req.query.tokenMint as string) || CLAWD_MINT;
    const includeClosed = req.query.closed === 'true';

    const result = await queryService.getLockedBalance(tokenMint);

    // Optionally filter out closed streams
    if (!includeClosed) {
      result.streams = result.streams.filter(s => !s.isClosed);
      result.activeStreamCount = result.streams.length;
      result.closedStreamCount = 0;
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    logger.error('Error fetching locked balance:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch locked balance',
    });
  }
});

/**
 * GET /api/streamflow/locked-balance/summary
 * 
 * Returns a concise summary (no individual stream details) for quick display.
 */
router.get('/locked-balance/summary', async (req, res) => {
  try {
    const tokenMint = (req.query.tokenMint as string) || CLAWD_MINT;
    const result = await queryService.getLockedBalance(tokenMint);

    res.json({
      success: true,
      totalLocked: result.totalLocked,
      totalLockedRaw: result.totalLockedRaw,
      totalWithdrawn: result.totalWithdrawn,
      netLocked: result.totalLocked - result.totalWithdrawn,
      activeStreamCount: result.activeStreamCount,
      vestingCount: result.vestingCount,
      lockCount: result.lockCount,
      tokenMint: result.tokenMint,
      decimals: result.decimals,
      queriedAt: result.queriedAt,
    });
  } catch (error: any) {
    logger.error('Error fetching locked balance summary:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch locked balance summary',
    });
  }
});

/**
 * GET /api/streamflow/locked-balance/:walletAddress
 * 
 * Returns streams for a specific wallet (as sender or recipient).
 */
router.get('/locked-balance/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const tokenMint = (req.query.tokenMint as string) || CLAWD_MINT;

    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }

    const result = await queryService.getLockedBalance(tokenMint);

    // Filter streams where this wallet is either sender or recipient
    result.streams = result.streams.filter(
      s => s.sender === walletAddress || s.recipient === walletAddress
    );

    // Recalculate totals
    const totalLocked = result.streams.reduce((sum, s) => sum + s.depositedAmount, 0);
    const totalWithdrawn = result.streams.reduce((sum, s) => sum + s.withdrawnAmount, 0);
    const activeCount = result.streams.filter(s => !s.isClosed).length;
    const closedCount = result.streams.filter(s => s.isClosed).length;

    res.json({
      success: true,
      walletAddress,
      totalLocked,
      totalWithdrawn,
      netLocked: totalLocked - totalWithdrawn,
      activeStreamCount: activeCount,
      closedStreamCount: closedCount,
      streams: result.streams,
      queriedAt: result.queriedAt,
    });
  } catch (error: any) {
    logger.error('Error fetching wallet locked balance:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch wallet locked balance',
    });
  }
});

// ── Existing endpoints (kept for backward compatibility) ──────────────

// POST endpoint to create a vesting schedule
router.post('/vesting', async (req, res) => {
  try {
    const validatedData = createVestingSchema.parse(req.body);
    const wallet = await getWallet();
    const writableService = new StreamFlowService(connection, 6);
    
    // For now just return a placeholder - full create stream will be implemented next
    res.status(200).json({
      success: true,
      message: 'Vesting creation requires signing - use the client SDK directly',
      instructions: 'Use @streamflow/stream SDK on the client side for signing',
    });
  } catch (error: any) {
    logger.error('Error creating vesting schedule:', error);
    res.status(400).json({
      success: false,
      error: error?.message || 'Failed to create vesting schedule',
    });
  }
});

// POST endpoint to create a token stream
router.post('/stream', async (req, res) => {
  try {
    const validatedData = createStreamSchema.parse(req.body);
    const wallet = await getWallet();
    
    res.status(200).json({
      success: true,
      message: 'Stream creation requires signing - use the client SDK directly',
      instructions: 'Use @streamflow/stream SDK on the client side for signing',
    });
  } catch (error: any) {
    logger.error('Error creating token stream:', error);
    res.status(400).json({
      success: false,
      error: error?.message || 'Failed to create token stream',
    });
  }
});

// POST endpoint to lock tokens in market cap vault
router.post('/lock-market-cap', async (req, res) => {
  try {
    const { tokenMint, amount, releaseTime } = req.body;
    
    if (!tokenMint || !amount || !releaseTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tokenMint, amount, or releaseTime',
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Market cap lock requires signing - use the client SDK directly',
      instructions: 'Use @streamflow/stream SDK on the client side for signing',
    });
  } catch (error: any) {
    logger.error('Error locking market cap:', error);
    res.status(400).json({
      success: false,
      error: error?.message || 'Failed to lock market cap',
    });
  }
});

export default router;
