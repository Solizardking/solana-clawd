import { Router } from 'express';
import type { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { db } from '../db';
import { agentStakes } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  getClusterName,
  getOpenClawdStakingConnection,
  getOpenClawdStakingProgramId,
  inspectOpenClawdStakingRuntime,
} from '../lib/openclawd-staking-config';

const router = Router();

// ── Anchor program constants (mirrors staking/programs/mpl-corenft-staking) ─
const PROGRAM_ID = getOpenClawdStakingProgramId();
const GLOBAL_POOL_SEED = Buffer.from('global-authority');
const CLAWD_MINT = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';
const MPL_CORE = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

const TIERS = {
  legendary: { id: 0, label: 'Legendary', baseWeight: 10_000 },
  epic:      { id: 1, label: 'Epic',      baseWeight:  4_000 },
  rare:      { id: 2, label: 'Rare',      baseWeight:  1_500 },
  common:    { id: 3, label: 'Common',    baseWeight:  1_000 },
} as const;

const LOCKS = {
  flexible: { id: 0, label: 'Flexible', seconds:        0, multiplier: 10_000 },
  '30d':    { id: 1, label: '30-day',   seconds:  2592000, multiplier: 15_000 },
  '90d':    { id: 2, label: '90-day',   seconds:  7776000, multiplier: 25_000 },
  cult:     { id: 3, label: 'Cult (1y)', seconds: 31536000, multiplier: 50_000 },
} as const;

const MULT_PRECISION = 10_000;

type TierKey = keyof typeof TIERS;
type LockKey = keyof typeof LOCKS;

function computeWeight(tier: TierKey, lock: LockKey): number {
  return Math.floor((TIERS[tier].baseWeight * LOCKS[lock].multiplier) / MULT_PRECISION);
}

function findGlobalPoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GLOBAL_POOL_SEED], PROGRAM_ID);
}

// ── GET /api/clawd-stake/config ──────────────────────────────────────────────
router.get('/config', async (_req, res: Response) => {
  try {
    const runtime = await inspectOpenClawdStakingRuntime();

    res.json({
      programId: runtime.programId.toBase58(),
      poolPda: runtime.poolPda.toBase58(),
      clawdMint: CLAWD_MINT,
      mplCore: MPL_CORE,
      cluster: getClusterName(runtime.rpc.rpcEndpoint),
      deployed: runtime.ready,
      ready: runtime.ready,
      programDeployed: runtime.programDeployed,
      poolInitialized: runtime.poolInitialized,
      status: runtime.status,
      note: runtime.ready
        ? 'Wallet-signed Anchor staking is wired through /staking. Reward token transfers are mirrored by the backend after on-chain events are verified.'
        : 'The reward layer is configured, but staking stays unavailable until the configured program exists on-chain and its global pool is initialized.',
      tiers: TIERS,
      locks: LOCKS,
      multiplierPrecision: MULT_PRECISION,
      sampleWeights: {
        legendary_cult: computeWeight('legendary', 'cult'),
        legendary_flex: computeWeight('legendary', 'flexible'),
        common_flex: computeWeight('common', 'flexible'),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/clawd-stake/pool ────────────────────────────────────────────────
router.get('/pool', async (_req, res: Response) => {
  let totalPositions = 0;
  let totalWeight = 0;
  if (db) {
    try {
      const rows = await db.select().from(agentStakes);
      for (const r of rows) {
        if (r.status === 'staked') {
          totalPositions++;
          totalWeight += computeWeight('common', 'flexible'); // synthetic until reward layer is on-chain
        }
      }
    } catch (e) { /* swallow */ }
  }
  res.json({
    pool: findGlobalPoolPda()[0].toBase58(),
    clawdMint: CLAWD_MINT,
    clawdEmissionPerSecond: 0,
    totalPositions,
    totalWeight,
    accClawdPerWeight: '0',
    accSolPerWeight: '0',
    paused: false,
    rewardVaultBalance: 0,
    solVaultBalance: 0,
    lastUpdateTs: Math.floor(Date.now() / 1000),
    note: 'Snapshot derived from the local DB mirror while on-chain UserPool records settle through the Anchor program.',
  });
});

// ── GET /api/clawd-stake/positions/:wallet ───────────────────────────────────
router.get('/positions/:wallet', async (req: Request, res: Response) => {
  if (!db) return res.json({ wallet: req.params.wallet, positions: [] });
  try {
    const stakes = await db
      .select()
      .from(agentStakes)
      .where(eq(agentStakes.walletAddress, req.params.wallet));

    const positions = stakes
      .filter((s) => s.status === 'staked')
      .map((s) => {
        const tier: TierKey = 'common';
        const lock: LockKey = 'flexible';
        const weight = computeWeight(tier, lock);
        const stakedTs = Math.floor(s.stakedAt.getTime() / 1000);
        return {
          owner: s.walletAddress,
          agentAsset: s.assetAddress,
          assetName: s.assetName,
          tier: TIERS[tier].id,
          tierLabel: TIERS[tier].label,
          lockKind: LOCKS[lock].id,
          lockLabel: LOCKS[lock].label,
          weight,
          stakeStartedTs: stakedTs,
          unlockTs: stakedTs + LOCKS[lock].seconds,
          clawdPending: 0,
          solPending: 0,
        };
      });
    res.json({ wallet: req.params.wallet, positions });
  } catch (e: any) {
    console.warn('[clawd-stake] positions unavailable:', e.message);
    res.json({ wallet: req.params.wallet, positions: [] });
  }
});

// ── Unsigned transaction builders (return plan + status) ─────────────────────
const stakeBuildSchema = z.object({
  owner: z.string().min(32),
  agentAsset: z.string().min(32),
  agentCollection: z.string().optional(),
  tier: z.enum(['legendary', 'epic', 'rare', 'common']),
  lock: z.enum(['flexible', '30d', '90d', 'cult']),
});

router.post('/build/stake', (req: Request, res: Response) => {
  const parse = stakeBuildSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { owner, agentAsset, tier, lock } = parse.data;
  const weight = computeWeight(tier, lock);
  res.json({
    status: 'wallet-signed-anchor',
    transaction: null,
    plan: {
      programId: PROGRAM_ID.toBase58(),
      poolPda: findGlobalPoolPda()[0].toBase58(),
      instructions: [
        { name: 'mpl_core::addPlugin(FreezeDelegate, authority=pool)', signer: owner, asset: agentAsset },
        { name: 'clawd_stake::stake', signer: owner, args: { tier: TIERS[tier].id, lockKind: LOCKS[lock].id } },
      ],
      derivedWeight: weight,
      tier: TIERS[tier],
      lock: LOCKS[lock],
    },
    message: 'Use the /staking page for the wallet-signed Anchor transaction and DB mirror record.',
  });
});

router.post('/build/unstake', (req: Request, res: Response) => {
  const { owner, agentAsset } = req.body || {};
  if (!owner || !agentAsset) return res.status(400).json({ error: 'owner and agentAsset required' });
  res.json({
    status: 'wallet-signed-anchor',
    transaction: null,
    plan: {
      programId: PROGRAM_ID.toBase58(),
      instructions: [
        { name: 'clawd_stake::unstake', signer: owner, asset: agentAsset },
        { name: 'mpl_core::removePlugin(FreezeDelegate)', signer: owner, asset: agentAsset },
      ],
    },
    message: 'Use the /staking page for the wallet-signed Anchor unstake transaction and DB mirror update.',
  });
});

router.post('/build/claim', (req: Request, res: Response) => {
  const { owner, agentAsset } = req.body || {};
  if (!owner || !agentAsset) return res.status(400).json({ error: 'owner and agentAsset required' });
  res.json({
    status: 'wallet-signed-anchor',
    transaction: null,
    plan: {
      programId: PROGRAM_ID.toBase58(),
      instructions: [
        { name: 'clawd_stake::claim_rewards', signer: owner, asset: agentAsset },
      ],
    },
    message: 'Claiming is implemented in the Anchor program; backend token settlement should verify this event before transferring CLAWD.',
  });
});

// ── Helius webhook stub (Anchor event mirror) ────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  console.log(`[clawd-stake/webhook] received ${payload.length} event(s)`);
  res.json({ ok: true, received: payload.length });
});

export default router;
