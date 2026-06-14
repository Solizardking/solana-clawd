// @ts-nocheck
import { Router } from 'express';
import type { Request, Response } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  keypairIdentity,
  publicKey as umiPubkey,
} from '@metaplex-foundation/umi';
import {
  mplCore,
  fetchAsset,
  findAssetSignerPda,
} from '@metaplex-foundation/mpl-core';
import {
  mplAgentIdentity,
  safeFetchAgentIdentityV1FromSeeds,
  safeFetchAgentIdentityV2FromSeeds,
} from '@metaplex-foundation/mpl-agent-registry';
import bs58 from 'bs58';
import { db } from '../db';
import { agentStakes } from '@shared/schema';
import { and, desc, eq } from 'drizzle-orm';
import {
  getClusterName,
  getOpenClawdStakingConnection,
  getOpenClawdStakingPublicRpcUrl,
  getOpenClawdStakingProgramId,
  getOpenClawdStakingRpcUrl,
  inspectOpenClawdStakingRuntime,
} from '../lib/openclawd-staking-config';

const router = Router();

const STAKING_PROGRAM_ID = getOpenClawdStakingProgramId();
const GLOBAL_POOL_SEED = Buffer.from('global-authority');
const USER_POOL_SEED = Buffer.from('user-pool');
const STAKE_AGENT_DISCRIMINATOR = Buffer.from([57, 152, 69, 17, 172, 229, 29, 105]);
const UNSTAKE_AGENT_DISCRIMINATOR = Buffer.from([233, 246, 239, 66, 94, 179, 65, 38]);

// ── UMI builder ──────────────────────────────────────────────────────────────
function buildUmi() {
  const rpcUrl = getOpenClawdStakingRpcUrl();
  const umi = createUmi(rpcUrl)
    .use(mplCore())
    .use(mplAgentIdentity());
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (rawKey) {
    try {
      const secretKey = rawKey.startsWith('[')
        ? new Uint8Array(JSON.parse(rawKey))
        : bs58.decode(rawKey);
      const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
      umi.use(keypairIdentity(keypair));
    } catch (e) {
      console.warn('[staking] Could not load WALLET_PRIVATE_KEY:', e);
    }
  }
  return umi;
}

function getRpc(): Connection {
  return getOpenClawdStakingConnection();
}

function findUserPoolPda(asset: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [USER_POOL_SEED, asset.toBuffer()],
    STAKING_PROGRAM_ID
  );
}

function decodeStakeRecord(data: Buffer) {
  const body = data.subarray(8);
  return {
    owner: new PublicKey(body.subarray(0, 32)).toBase58(),
    asset: new PublicKey(body.subarray(32, 64)).toBase58(),
    stakedAt: Number(body.readBigInt64LE(64)),
    lastClaimedAt: Number(body.readBigInt64LE(72)),
    totalClaimedBaseUnits: Number(body.readBigUInt64LE(80)),
  };
}

function extractCollectionAddress(updateAuthority: unknown): string | null {
  const authority = updateAuthority as
    | { type?: string; address?: { toString(): string } | string; __kind?: string; fields?: unknown[] }
    | undefined;

  if (authority?.type === 'Collection' && authority.address) {
    return authority.address.toString();
  }
  if (authority?.__kind === 'Collection' && Array.isArray(authority.fields) && authority.fields[0]) {
    return String(authority.fields[0]);
  }
  return null;
}

function canStakeContext(context: Awaited<ReturnType<typeof fetchAssetContext>>) {
  return Boolean(context.collectionAddress || context.isRegisteredAgent);
}

async function fetchJsonUri(uri: string | null | undefined) {
  if (!uri) return null;
  if (uri.startsWith('data:application/json;base64,')) {
    try {
      const body = uri.replace('data:application/json;base64,', '');
      return JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//.test(uri)) return null;

  try {
    const response = await fetch(uri, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchOnchainStakeRecord(assetAddress: string) {
  const asset = new PublicKey(assetAddress);
  const [pda] = findUserPoolPda(asset);
  const acc = await getRpc().getAccountInfo(pda);
  if (!acc) return null;

  return {
    pda: pda.toBase58(),
    ...decodeStakeRecord(acc.data as Buffer),
  };
}

async function waitForStakeRecordState(
  assetAddress: string,
  shouldExist: boolean,
  attempts = 15,
  delayMs = 750,
) {
  let lastRecord = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastRecord = await fetchOnchainStakeRecord(assetAddress);
    if ((shouldExist && lastRecord) || (!shouldExist && !lastRecord)) {
      return lastRecord;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return lastRecord;
}

async function fetchAssetContext(assetAddress: string) {
  const umi = buildUmi();
  const assetPk = umiPubkey(assetAddress);
  const asset = await fetchAsset(umi, assetPk);
  const offchainMetadata = await fetchJsonUri(asset.uri);
  const collectionAddress = extractCollectionAddress(asset.updateAuthority);
  const identityV2 = await safeFetchAgentIdentityV2FromSeeds(umi, { asset: assetPk }).catch(() => null);
  const identityV1 = identityV2
    ? null
    : await safeFetchAgentIdentityV1FromSeeds(umi, { asset: assetPk }).catch(() => null);
  const identity = identityV2 ?? identityV1;
  const [agentWalletPda] = findAssetSignerPda(umi, { asset: assetPk });
  const onchainStakeRecord = await fetchOnchainStakeRecord(assetAddress);
  const agentPlugin = (asset as any).agentIdentities?.[0] ?? null;
  const freezeDelegate = (asset as any).freezeDelegate ?? null;

  return {
    umi,
    assetPk,
    asset,
    collectionAddress,
    cluster: getClusterName(getRpc().rpcEndpoint),
    offchainMetadata,
    image:
      offchainMetadata?.image ??
      offchainMetadata?.properties?.image ??
      null,
    freezeDelegate,
    onchainStakeRecord,
    agentWalletPda: agentWalletPda.toString(),
    isRegisteredAgent: Boolean(identity || agentPlugin),
    agentIdentityVersion: identityV2 ? 'v2' : identityV1 ? 'v1' : null,
    agentRegistrationUri:
      (identity as any)?.agentMetadataUri ??
      (identity as any)?.agentRegistrationUri ??
      (identity as any)?.registrationDoc ??
      agentPlugin?.uri ??
      null,
    lifecycleChecks: agentPlugin?.lifecycleChecks ?? null,
    derivedAssetType: identity || agentPlugin ? 'agent' : 'nft',
  };
}

function keyToBase58(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.pubkey === 'string') return value.pubkey;
  if (value.pubkey?.toBase58) return value.pubkey.toBase58();
  if (value.toBase58) return value.toBase58();
  if (value.toString) return value.toString();
  return String(value);
}

function instructionMatchesDiscriminator(data: string | undefined, discriminator: Buffer): boolean {
  if (!data) return false;
  try {
    const raw = bs58.decode(data);
    return raw.subarray(0, 8).equals(discriminator);
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchParsedTransaction(signature: string) {
  const rpc = getRpc();
  for (let attempt = 0; attempt < 15; attempt++) {
    const tx = await rpc.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    await sleep(750);
  }
  return null;
}

async function verifyAnchorTransaction(opts: {
  signature: string;
  walletAddress: string;
  assetAddress: string;
  collectionAddress?: string | null;
  kind: 'stake' | 'unstake';
}) {
  const tx = await fetchParsedTransaction(opts.signature);
  if (!tx) {
    throw new Error('Could not load the submitted on-chain transaction from the staking cluster.');
  }
  if (tx.meta?.err) {
    throw new Error('The submitted on-chain transaction did not confirm successfully.');
  }

  const expectedDiscriminator =
    opts.kind === 'stake' ? STAKE_AGENT_DISCRIMINATOR : UNSTAKE_AGENT_DISCRIMINATOR;

  const signerKeys = (tx.transaction.message.accountKeys ?? [])
    .filter((key: any) => Boolean(key.signer))
    .map((key: any) => keyToBase58(key));

  if (!signerKeys.includes(opts.walletAddress)) {
    throw new Error('The submitted transaction was not signed by the provided wallet.');
  }

  const matchingInstruction = (tx.transaction.message.instructions ?? []).find((ix: any) => {
    const programId = keyToBase58(ix.programId);
    const accounts = Array.isArray(ix.accounts) ? ix.accounts.map((account: any) => keyToBase58(account)) : [];
    return (
      programId === STAKING_PROGRAM_ID.toBase58() &&
      instructionMatchesDiscriminator(ix.data, expectedDiscriminator) &&
      accounts.includes(opts.walletAddress) &&
      accounts.includes(opts.assetAddress) &&
      (!opts.collectionAddress || accounts.includes(opts.collectionAddress))
    );
  });

  if (!matchingInstruction) {
    throw new Error(`The submitted transaction does not contain the expected ${opts.kind} instruction for this asset.`);
  }

  return {
    signature: opts.signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
  };
}

function calcPendingRewards(stake: { stakedAt: Date; lastClaimedAt: Date | null; rewardRatePerDay: number }): number {
  const from = stake.lastClaimedAt ?? stake.stakedAt;
  const msPerDay = 86_400_000;
  const days = (Date.now() - from.getTime()) / msPerDay;
  return Math.floor(days * stake.rewardRatePerDay);
}

// ── GET /api/staking/stakes/:wallet ──────────────────────────────────────────
router.get('/stakes/:wallet', async (req: Request, res: Response) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const stakes = await db
      .select()
      .from(agentStakes)
      .where(eq(agentStakes.walletAddress, req.params.wallet));
    const withRewards = stakes.map((s) => ({
      ...s,
      pendingRewards: s.status === 'staked' ? calcPendingRewards(s) : 0,
    }));
    res.json(withRewards);
  } catch (e: any) {
    console.warn('[staking] stakes unavailable:', e.message);
    res.json([]);
  }
});

// ── GET /api/staking/preview/:assetAddress ───────────────────────────────────
// Fetch on-chain asset info before staking
router.get('/preview/:assetAddress', async (req: Request, res: Response) => {
  try {
    const context = await fetchAssetContext(req.params.assetAddress);
    res.json({
      address: req.params.assetAddress,
      cluster: context.cluster,
      programId: STAKING_PROGRAM_ID.toBase58(),
      name: context.offchainMetadata?.name ?? context.asset.name,
      image: context.image,
      uri: context.asset.uri,
      owner: context.asset.owner.toString(),
      collectionAddress: context.collectionAddress,
      updateAuthority: context.asset.updateAuthority,
      derivedAssetType: context.derivedAssetType,
      isRegisteredAgent: context.isRegisteredAgent,
      agentIdentityVersion: context.agentIdentityVersion,
      agentRegistrationUri: context.agentRegistrationUri,
      assetSignerPda: context.agentWalletPda,
      freezeDelegate: context.freezeDelegate
        ? { frozen: Boolean(context.freezeDelegate.frozen) }
        : null,
      onchainStakeRecord: context.onchainStakeRecord,
      canStake: canStakeContext(context) && !context.onchainStakeRecord,
      canUnstake: Boolean(context.onchainStakeRecord),
      stakeRequirements: {
        needsCollectionBackedAsset: !context.isRegisteredAgent,
        acceptsCollectionlessRegisteredAgent: context.isRegisteredAgent,
        needsWalletSignedTransaction: true,
        needsOwnerWallet: true,
      },
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ── POST /api/staking/stake ──────────────────────────────────────────────────
router.post('/stake', async (req: Request, res: Response) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const {
    walletAddress,
    assetAddress,
    assetName,
    assetImage,
    onchainSignature,
  } = req.body as {
    walletAddress: string;
    assetAddress: string;
    assetName?: string;
    assetImage?: string;
    onchainSignature?: string;
  };

  if (!walletAddress || !assetAddress || !onchainSignature) {
    return res.status(400).json({ error: 'walletAddress, assetAddress, and onchainSignature are required' });
  }

  // Check not already staked
  const existing = await db
    .select()
    .from(agentStakes)
    .where(and(eq(agentStakes.assetAddress, assetAddress), eq(agentStakes.status, 'staked')));
  if (existing.length > 0) {
    if (existing[0].walletAddress === walletAddress) {
      return res.json({ success: true, stake: existing[0], onchainSignature, alreadyMirrored: true });
    }
    return res.status(409).json({ error: 'Asset is already staked' });
  }

  try {
    const context = await fetchAssetContext(assetAddress);
    if (!canStakeContext(context)) {
      return res.status(400).json({
        error: 'This asset is not collection-backed and is not a registered Metaplex agent, so it cannot be staked by the public staking flow.',
      });
    }
    if (context.asset.owner.toString() !== walletAddress) {
      return res.status(403).json({ error: 'Connected wallet does not own this asset on-chain.' });
    }

    await verifyAnchorTransaction({
      signature: onchainSignature,
      walletAddress,
      assetAddress,
      collectionAddress: context.collectionAddress,
      kind: 'stake',
    });

    const onchainStakeRecord = await waitForStakeRecordState(assetAddress, true);
    if (!onchainStakeRecord) {
      return res.status(409).json({ error: 'The on-chain stake record was not found after the staking transaction confirmed.' });
    }
    if (onchainStakeRecord.owner !== walletAddress) {
      return res.status(403).json({ error: 'On-chain stake owner does not match the provided wallet.' });
    }

    const rewardRatePerDay = context.isRegisteredAgent ? 200 : 100;
    const latest = await db
      .select()
      .from(agentStakes)
      .where(eq(agentStakes.assetAddress, assetAddress))
      .orderBy(desc(agentStakes.id))
      .limit(1);

    const stakePayload = {
      walletAddress,
      assetAddress,
      assetName: assetName ?? context.offchainMetadata?.name ?? context.asset.name ?? 'Unknown Asset',
      assetImage: assetImage ?? context.image ?? null,
      assetType: context.derivedAssetType,
      collectionAddress: context.collectionAddress,
      rewardRatePerDay,
      rewardsClaimed: 0,
      status: 'staked',
      stakedAt: new Date(),
      unstakedAt: null,
      lastClaimedAt: null,
    } as const;

    const [stake] = latest.length > 0
      ? await db
          .update(agentStakes)
          .set(stakePayload)
          .where(eq(agentStakes.id, latest[0].id))
          .returning()
      : await db
          .insert(agentStakes)
          .values(stakePayload)
          .returning();

    res.json({ success: true, stake, onchainSignature });
  } catch (e: any) {
    console.error('[staking] stake error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/staking/unstake ────────────────────────────────────────────────
router.post('/unstake', async (req: Request, res: Response) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const { assetAddress, walletAddress, onchainSignature } = req.body as {
    assetAddress: string;
    walletAddress: string;
    onchainSignature?: string;
  };
  if (!assetAddress || !walletAddress || !onchainSignature) {
    return res.status(400).json({ error: 'assetAddress, walletAddress, and onchainSignature are required' });
  }

  const existing = await db
    .select()
    .from(agentStakes)
    .where(and(eq(agentStakes.assetAddress, assetAddress), eq(agentStakes.status, 'staked')));
  if (existing.length === 0) {
    return res.status(404).json({ error: 'No active stake found for this asset' });
  }

  const stake = existing[0];
  if (stake.walletAddress !== walletAddress) {
    return res.status(403).json({ error: 'Not the stake owner' });
  }

  try {
    const context = await fetchAssetContext(assetAddress);
    if (!context.collectionAddress && stake.collectionAddress) {
      return res.status(400).json({ error: 'This asset no longer exposes the collection used when it was staked, so the unstake transaction cannot be verified.' });
    }
    if (!context.collectionAddress && stake.assetType !== 'agent' && !context.isRegisteredAgent) {
      return res.status(400).json({ error: 'This collectionless asset is not recognized as a registered Metaplex agent.' });
    }

    await verifyAnchorTransaction({
      signature: onchainSignature,
      walletAddress,
      assetAddress,
      collectionAddress: context.collectionAddress,
      kind: 'unstake',
    });

    const onchainStakeRecord = await waitForStakeRecordState(assetAddress, false);
    if (onchainStakeRecord) {
      return res.status(409).json({ error: 'The on-chain stake record still exists. Wait for finalization and try again.' });
    }

    const pendingRewards = calcPendingRewards(stake);
    const totalRewards = stake.rewardsClaimed + pendingRewards;

    // Update DB record
    const [updated] = await db
      .update(agentStakes)
      .set({
        status: 'unstaked',
        collectionAddress: stake.collectionAddress ?? context.collectionAddress,
        unstakedAt: new Date(),
        rewardsClaimed: totalRewards,
        lastClaimedAt: new Date(),
      })
      .where(eq(agentStakes.id, stake.id))
      .returning();

    res.json({ success: true, stake: updated, rewardsEarned: pendingRewards, totalRewards, onchainSignature });
  } catch (e: any) {
    console.error('[staking] unstake error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/config', async (_req: Request, res: Response) => {
  try {
    const runtime = await inspectOpenClawdStakingRuntime();
    res.json({
      programId: runtime.programId.toBase58(),
      poolPda: runtime.poolPda.toBase58(),
      cluster: getClusterName(runtime.rpc.rpcEndpoint),
      rpcEndpoint: getOpenClawdStakingPublicRpcUrl(),
      deployed: runtime.ready,
      ready: runtime.ready,
      programDeployed: runtime.programDeployed,
      poolInitialized: runtime.poolInitialized,
      status: runtime.status,
      writeMode: 'wallet-signed-anchor',
      notes: [
        'Public staking is wallet-signed and verified against on-chain Anchor instructions.',
        'The browser uses a public cluster RPC while the server can verify stakes against a dedicated private RPC.',
        'Set OPENCLAWD_AGENT_STAKING_PROGRAM_ID and OPENCLAWD_STAKING_RPC_URL together to target a deployed cluster.',
        'Staking no longer inherits the app-wide SOLANA_RPC_URL by default, so the runtime cannot drift onto an unrelated cluster.',
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/staking/stats ───────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const all = await db.select().from(agentStakes);
    const active = all.filter((s) => s.status === 'staked');
    const totalRewardsPaid = all.reduce((sum, s) => sum + s.rewardsClaimed, 0);
    const totalPending = active.reduce((sum, s) => sum + calcPendingRewards(s), 0);
    res.json({
      totalStakes: active.length,
      totalEverStaked: all.length,
      totalRewardsPaid,
      totalPendingRewards: totalPending,
    });
  } catch (e: any) {
    console.warn('[staking] stats unavailable:', e.message);
    res.json({
      totalStakes: 0,
      totalEverStaked: 0,
      totalRewardsPaid: 0,
      totalPendingRewards: 0,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ON-CHAIN STAKING (runtime-configured Anchor deployment)
// Read-only helpers — writes are signed in the browser via @coral-xyz/anchor.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/onchain/global-pool', async (_req, res) => {
  try {
    const [pda] = PublicKey.findProgramAddressSync([GLOBAL_POOL_SEED], STAKING_PROGRAM_ID);
    const acc = await getRpc().getAccountInfo(pda);
    if (!acc) return res.json({ initialized: false, pda: pda.toBase58() });
    const body = acc.data.subarray(8);
    res.json({
      initialized: true,
      pda: pda.toBase58(),
      admin: new PublicKey(body.subarray(0, 32)).toBase58(),
      totalAgentsStaked: Number(body.readBigUInt64LE(32)),
      totalRewardsDistributedBaseUnits: Number(body.readBigUInt64LE(40)),
      reserved: [
        Number(body.readBigUInt64LE(48)),
        Number(body.readBigUInt64LE(56)),
        Number(body.readBigUInt64LE(64)),
        Number(body.readBigUInt64LE(72)),
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/onchain/stake-record/:asset', async (req, res) => {
  try {
    const asset = new PublicKey(req.params.asset);
    const [pda] = PublicKey.findProgramAddressSync(
      [USER_POOL_SEED, asset.toBuffer()],
      STAKING_PROGRAM_ID
    );
    const acc = await getRpc().getAccountInfo(pda);
    if (!acc) return res.json({ exists: false, pda: pda.toBase58() });
    res.json({ exists: true, pda: pda.toBase58(), ...decodeStakeRecord(acc.data) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/onchain/by-owner/:wallet', async (req, res) => {
  try {
    const owner = new PublicKey(req.params.wallet);
    // UserPool layout: discriminator(8) + owner(32) -> owner at offset 8
    const accs = await getRpc().getProgramAccounts(STAKING_PROGRAM_ID, {
      filters: [
        { dataSize: 96 },
        { memcmp: { offset: 8, bytes: owner.toBase58() } },
      ],
    });
    const records = accs.map((a) => ({
      pda: a.pubkey.toBase58(),
      ...decodeStakeRecord(a.account.data as Buffer),
    }));
    res.json({ count: records.length, records });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/onchain/cost-estimate', async (_req, res) => {
  try {
    const c = getRpc();
    // Sizes from staking/programs/mpl-corenft-staking/src/state.rs:
    //   GlobalPool = 8 + 32 + 8 + 8 + 32 = 88 bytes
    //   UserPool   = 8 + 32 + 32 + 8 + 8 + 8 = 96 bytes
    const [stakeRecordRent, globalPoolRent] = await Promise.all([
      c.getMinimumBalanceForRentExemption(96),
      c.getMinimumBalanceForRentExemption(88),
    ]);

    // Program deploy cost — depends on the .so binary size. For an Anchor
    // 0.32 program with 3 instructions and 2 small accounts the SBF binary
    // is typically 220-320 KB. We expose a range plus a default 280 KB est.
    const SOL = LAMPORTS_PER_SOL;
    const programRentFor = async (bytes: number) =>
      (await c.getMinimumBalanceForRentExemption(bytes)) / SOL;

    const [low, mid, high] = await Promise.all([
      programRentFor(220 * 1024),
      programRentFor(280 * 1024),
      programRentFor(360 * 1024),
    ]);

    res.json({
      // Per-stake costs (paid by the staker, refundable on unstake via close)
      stakeRecord: {
        bytes: 96,
        rentSol: stakeRecordRent / SOL,
        rentLamports: stakeRecordRent,
      },
      // One-time pool init (paid by admin during initialize())
      globalPool: {
        bytes: 88,
        rentSol: globalPoolRent / SOL,
        rentLamports: globalPoolRent,
      },
      // One-time program deploy cost (rent for the program data account).
      // During `solana program deploy` you also need ~2x this temporarily
      // for the buffer account, which is refunded after the upgrade.
      programDeploy: {
        binarySizeRangeKb: [220, 280, 360],
        rentSolRange: [low, mid, high],
        bufferTempSolMid: mid, // refunded after deploy completes
        peakSolNeededDuringDeploy: mid * 2 + 0.01,
        recommendedFundingSol: Math.ceil((mid * 2 + 0.05) * 100) / 100,
      },
      txFee: { perTxSol: 0.000005 },
      // The staking program is the ONLY custom Anchor program in this stack.
      // Everything else is third-party (Metaplex Core, SPL Token, Pump, etc.)
      otherCustomPrograms: [],
      programId: STAKING_PROGRAM_ID.toBase58(),
      cluster: getClusterName(c.rpcEndpoint),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
