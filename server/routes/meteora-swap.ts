import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { PublicKey, Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  CLAWD_MINT, SOL_MINT,
  findClawdPool, loadPool, getPoolInfo, getSwapQuote, buildSwapTransaction,
  buildCreatePoolTransactions, buildSeedLiquidityTransaction, buildAddLiquidityTransaction,
  getConnection,
} from '../lib/meteora/pool-client';
import { derivePositionAddress } from '@meteora-ag/cp-amm-sdk';
import { startPriceMonitor, getLatestPrice } from '../lib/meteora/price-ws';
import { rateLimit } from '../lib/rate-limit';
import { isAdminWallet } from '../lib/access-control';
import { sendOptimizedRawTransaction } from '../lib/helius/transactionOptimization';

// ── Types ──────────────────────────────────────────────────────────────────────

interface JupQuoteResponse {
  outAmount?: string;
  routePlan?: unknown[];
  priceImpactPct?: string;
  swapUsdValue?: string;
}

interface MeteoraDataApiPool {
  address?: string;
  name?: string;
  tvl?: number;
  current_price?: number;
  token_x_amount?: number;
  token_y_amount?: number;
  volume?: Record<string, number>;
  fees?: Record<string, number>;
  protocol_fees?: Record<string, number>;
  fee_tvl_ratio?: Record<string, number>;
  pool_config?: {
    collect_fee_mode?: number;
    base_fee_pct?: number;
    protocol_fee_pct?: number;
    dynamic_fee_initialized?: boolean;
    concentrated_liquidity?: boolean;
  };
}

const router = Router();

// 60 requests per minute per IP on all public meteora-swap routes.
router.use(rateLimit({ windowMs: 60_000, max: 60, message: 'Rate limit exceeded on swap API. Try again shortly.' }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function err(res: Response, e: unknown, status = 500) {
  console.error('[meteora-swap]', e);
  const inferredStatus = typeof e === 'object' && e && 'statusCode' in e
    ? Number((e as any).statusCode)
    : status;
  const safeStatus = Number.isFinite(inferredStatus) ? inferredStatus : status;
  // Expose message for 4xx (client errors); hide internals for 5xx in production.
  const isClientError = safeStatus >= 400 && safeStatus < 500;
  const message = isClientError || process.env.NODE_ENV !== 'production'
    ? String(e instanceof Error ? e.message : e)
    : 'An internal error occurred. Please try again.';
  res.status(safeStatus).json({ error: message });
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function loadPoolCreatorKeypair(): Keypair | null {
  const raw = process.env.WALLET_PRIVATE_KEY || process.env.TREASURY_KEY;
  if (!raw) return null;
  try {
    const secretKey = raw.startsWith('[')
      ? new Uint8Array(JSON.parse(raw))
      : bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  } catch {
    return null;
  }
}

function isAdminSession(req: Request): boolean {
  const wallet = req.session?.walletAddress ?? req.convexAuth?.walletAddress ?? null;
  const authenticated = req.session?.isAuthenticated === true || req.convexAuth?.authenticated === true;
  if (!wallet || !authenticated) return false;
  if (req.session?.userRole === 'admin' || req.convexAuth?.role === 'admin') return true;
  return isAdminWallet(wallet);
}

function parsePositiveNumber(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw badRequest(`${field} must be a positive number`);
  }
  return n;
}

function assertSupportedSwapPair(inputMint: string, outputMint: string) {
  const input = new PublicKey(inputMint);
  const output = new PublicKey(outputMint);
  const inputIsClawd = input.equals(CLAWD_MINT);
  const inputIsSol = input.equals(SOL_MINT);
  const outputIsClawd = output.equals(CLAWD_MINT);
  const outputIsSol = output.equals(SOL_MINT);

  if (!((inputIsClawd && outputIsSol) || (inputIsSol && outputIsClawd))) {
    throw badRequest('inputMint/outputMint must be the CLAWD and SOL mints in opposite directions');
  }

  return { input };
}

function adminGuard(req: Request, res: Response, next: NextFunction) {
  if (isAdminSession(req)) return next();

  const expected = process.env.CLAWD_ADMIN_KEY;
  if (!expected) return next(); // no key configured → allow (local dev)

  const provided = req.header('x-clawd-admin');
  if (provided === expected) return next();

  return res.status(401).json({
    error: 'Unauthorized',
    hint: 'Treasury pool operations require an admin session or x-clawd-admin matching CLAWD_ADMIN_KEY.',
  });
}

function signRequiredPoolTransactionSigners(
  tx: Transaction,
  signers: Array<{ label: string; keypair: Keypair }>,
) {
  const message = tx.compileMessage();
  const requiredKeys = message.accountKeys.slice(0, message.header.numRequiredSignatures);
  const signerByKey = new Map(signers.map(({ label, keypair }) => [
    keypair.publicKey.toString(),
    { label, keypair },
  ]));
  const availableSigners = requiredKeys
    .map((key) => signerByKey.get(key.toString())?.keypair)
    .filter((keypair): keypair is Keypair => !!keypair);

  if (availableSigners.length > 0) {
    tx.partialSign(...availableSigners);
  }

  const missing = tx.signatures
    .filter(({ signature }) => !signature)
    .map(({ publicKey }) => {
      const known = signerByKey.get(publicKey.toString());
      return known
        ? `${known.label} (${publicKey.toString()})`
        : publicKey.toString();
    });

  if (missing.length > 0) {
    const known = signers
      .map(({ label, keypair }) => `${label}=${keypair.publicKey.toString()}`)
      .join(', ');
    throw new Error(
      `Pool transaction missing required signature(s): ${missing.join(', ')}. Known signers: ${known}`,
    );
  }
}

async function getJupiterPrice(
  inputMint: string,
  outputMint: string,
  amount: number,
  decimals: number,
): Promise<{ outAmount: number; priceImpactPct: number } | null> {
  try {
    const rawAmount = Math.floor(amount * 10 ** decimals);
    const params = new URLSearchParams({ inputMint, outputMint, amount: String(rawAmount) });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;

    const r = await fetch(`https://api.jup.ag/swap/v1/quote?${params}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as JupQuoteResponse;
    if (!d.outAmount) return null;
    const outDecimals = outputMint === SOL_MINT.toString() ? 9 : 6;
    return {
      outAmount: Number(d.outAmount) / 10 ** outDecimals,
      priceImpactPct: Number(d.priceImpactPct ?? 0),
    };
  } catch {
    return null;
  }
}

async function getMeteoraPoolData(poolAddress: string) {
  const base = 'https://damm-v2.datapi.meteora.ag';
  const headers = { 'Accept': 'application/json' };
  const timeout = 5000;

  try {
    const poolParams = new URLSearchParams({
      page: '1',
      page_size: '1',
      filter_by: `pool_address=${poolAddress}`,
    });
    const [poolResp, volumeResp] = await Promise.all([
      fetch(`${base}/pools?${poolParams}`, { headers, signal: AbortSignal.timeout(timeout) }),
      fetch(`${base}/pools/${poolAddress}/volume/history?timeframe=24h`, {
        headers,
        signal: AbortSignal.timeout(timeout),
      }),
    ]);

    const poolJson = poolResp.ok ? await poolResp.json() as { data?: MeteoraDataApiPool[] } : null;
    const volumeJson = volumeResp.ok
      ? await volumeResp.json() as {
          start_time?: number;
          end_time?: number;
          timeframe?: string | null;
          data?: Array<{ timestamp: number; volume: number; fees: number; protocol_fees: number }>;
        }
      : null;
    const pool = poolJson?.data?.[0] ?? null;
    const history = volumeJson?.data ?? [];
    const historyTotals = history.reduce(
      (acc, item) => ({
        volume24h: acc.volume24h + Number(item.volume ?? 0),
        fees24h: acc.fees24h + Number(item.fees ?? 0),
        protocolFees24h: acc.protocolFees24h + Number(item.protocol_fees ?? 0),
      }),
      { volume24h: 0, fees24h: 0, protocolFees24h: 0 },
    );

    return {
      source: 'meteora-damm-v2-datapi',
      pool,
      history: {
        startTime: volumeJson?.start_time ?? null,
        endTime: volumeJson?.end_time ?? null,
        timeframe: volumeJson?.timeframe ?? '24h',
        buckets: history,
        ...historyTotals,
      },
      summary: {
        tvl: Number(pool?.tvl ?? 0) || null,
        currentPrice: Number(pool?.current_price ?? 0) || null,
        volume24h: Number(pool?.volume?.['24h'] ?? historyTotals.volume24h) || null,
        fees24h: Number(pool?.fees?.['24h'] ?? historyTotals.fees24h) || null,
        protocolFees24h: Number(pool?.protocol_fees?.['24h'] ?? historyTotals.protocolFees24h) || null,
        feeTvlRatio24h: Number(pool?.fee_tvl_ratio?.['24h'] ?? 0) || null,
        baseFeePct: Number(pool?.pool_config?.base_fee_pct ?? 0) || null,
        protocolFeePct: Number(pool?.pool_config?.protocol_fee_pct ?? 0) || null,
      },
    };
  } catch {
    return {
      source: 'meteora-damm-v2-datapi',
      pool: null,
      history: null,
      summary: null,
      warning: 'Meteora pool data API unavailable',
    };
  }
}

// ── Pool bootstrap ─────────────────────────────────────────────────────────────

let poolBootstrapped = false;

async function bootstrapPool() {
  if (poolBootstrapped) return;
  poolBootstrapped = true;

  const addr = await findClawdPool();
  if (addr) {
    console.log('[meteora-swap] Starting price monitor for pool:', addr.toString());
    startPriceMonitor(addr.toString());
  } else {
    console.warn('[meteora-swap] No CLAWD/SOL pool found. Create one via POST /create-pool');
  }
}

bootstrapPool().catch(console.error);

// ── GET /api/meteora-swap/pool-info ───────────────────────────────────────────
router.get('/pool-info', async (_req: Request, res: Response) => {
  try {
    const poolAddr = await findClawdPool();
    if (!poolAddr) {
      return res.status(404).json({
        error: 'No CLAWD/SOL Meteora DAMM V2 pool found. Create one first.',
        hint: 'POST /api/meteora-swap/create-pool',
      });
    }

    const pool = await loadPool(poolAddr);

    let solUsd: number | undefined;
    try {
      const priceData = await fetch(
        `https://api.jup.ag/price/v2?ids=${SOL_MINT}`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (priceData.ok) {
        const pj = (await priceData.json()) as any;
        solUsd = Number(pj?.data?.[SOL_MINT.toString()]?.price ?? 0) || undefined;
      }
    } catch { /* optional */ }

    const info = await getPoolInfo(pool, poolAddr, solUsd);
    const latestWs = getLatestPrice();

    res.json({
      ...info,
      livePrice: latestWs ?? null,
      dex: 'Meteora DAMM V2',
      feeCollectionToken: info.feeCollectionToken,
      note: info.collectFeeMode === 2
        ? `Compounding pool (${info.compoundingFeeBps / 100}% of LP fees auto-compound back into liquidity).`
        : `${info.collectFeeModeName} pool. Fees are not auto-compounded; use this route to keep holder swap flow in the CLAWD/SOL Meteora pool.`,
      liquidityReady: info.liquidityReady,
      warning: info.liquidityReady ? null : 'Pool exists but has no active liquidity; swaps are disabled until seeded.',
    });
  } catch (e) { err(res, e); }
});

// ── GET /api/meteora-swap/quote ───────────────────────────────────────────────
router.get('/quote', async (req: Request, res: Response) => {
  try {
    const {
      inputMint  = SOL_MINT.toString(),
      outputMint = CLAWD_MINT.toString(),
      amount,
      slippage   = '1',
    } = req.query as Record<string, string>;

    if (!amount) return res.status(400).json({ error: 'amount required' });
    const { input: inMint } = assertSupportedSwapPair(inputMint, outputMint);
    const inAmountHuman = parsePositiveNumber(amount, 'amount');
    const slippagePct = parsePositiveNumber(slippage, 'slippage');

    const poolAddr = await findClawdPool();
    if (!poolAddr) return res.status(404).json({ error: 'No CLAWD/SOL pool found' });

    const pool = await loadPool(poolAddr);
    const poolInfo = await getPoolInfo(pool, poolAddr);
    if (!poolInfo.liquidityReady) {
      return res.status(409).json({
        error: 'CLAWD/SOL Meteora pool has no active liquidity. Seed the pool before quoting swaps.',
        poolAddress: poolAddr.toString(),
        liquidityReady: false,
      });
    }
    const inDecimals    = inMint.equals(CLAWD_MINT) ? 6 : 9;

    const meteoraQuote = await getSwapQuote(pool, poolAddr, inMint, inAmountHuman, slippagePct);
    const jupQuote     = await getJupiterPrice(inputMint, outputMint, inAmountHuman, inDecimals);

    let savingsPct: number | null = null;
    let savingsAmount: number | null = null;
    if (jupQuote && jupQuote.outAmount > 0) {
      savingsPct    = ((meteoraQuote.outputAmount - jupQuote.outAmount) / jupQuote.outAmount) * 100;
      savingsAmount = meteoraQuote.outputAmount - jupQuote.outAmount;
    }

    res.json({
      meteora: {
        ...meteoraQuote,
        poolAddress: poolAddr.toString(),
        dex: 'Meteora DAMM V2',
        feePct: (meteoraQuote.feeBps / 100).toFixed(2) + '%',
      },
      jupiter: jupQuote
        ? { outAmount: jupQuote.outAmount, priceImpactPct: jupQuote.priceImpactPct, dex: 'Jupiter' }
        : null,
      comparison: {
        savingsPct:       savingsPct !== null ? Number(savingsPct.toFixed(4)) : null,
        savingsAmount:    savingsAmount !== null ? Number(savingsAmount.toFixed(8)) : null,
        meteoraIsBetter:  savingsPct !== null ? savingsPct > 0 : null,
        message:
          savingsPct !== null && savingsPct > 0
            ? `You get ${savingsPct.toFixed(2)}% more via Meteora DAMM V2`
            : savingsPct !== null
            ? `Jupiter offers ${Math.abs(savingsPct).toFixed(2)}% more output`
            : 'Jupiter comparison unavailable',
      },
    });
  } catch (e) { err(res, e); }
});

// ── POST /api/meteora-swap/build-swap ─────────────────────────────────────────
router.post('/build-swap', async (req: Request, res: Response) => {
  try {
    const {
      inputMint  = SOL_MINT.toString(),
      outputMint = CLAWD_MINT.toString(),
      amount,
      userWallet,
      slippage   = 1,
    } = req.body as {
      inputMint?: string;
      outputMint?: string;
      amount: number;
      userWallet: string;
      slippage?: number;
    };

    if (!amount || !userWallet) {
      return res.status(400).json({ error: 'amount and userWallet required' });
    }
    const { input: inMint } = assertSupportedSwapPair(inputMint, outputMint);
    const inputAmount = parsePositiveNumber(amount, 'amount');
    const slippagePct = parsePositiveNumber(slippage, 'slippage');

    const poolAddr = await findClawdPool();
    if (!poolAddr) return res.status(404).json({ error: 'No CLAWD/SOL pool found' });

    const pool      = await loadPool(poolAddr);
    const poolInfo  = await getPoolInfo(pool, poolAddr);
    if (!poolInfo.liquidityReady) {
      return res.status(409).json({
        error: 'CLAWD/SOL Meteora pool has no active liquidity. Seed the pool before building swaps.',
        poolAddress: poolAddr.toString(),
        liquidityReady: false,
      });
    }
    const userPubkey = new PublicKey(userWallet);

    const quote = await getSwapQuote(pool, poolAddr, inMint, inputAmount, slippagePct);

    const referral = process.env.TREASURY_WALLET
      ? new PublicKey(process.env.TREASURY_WALLET)
      : undefined;

    const tx = await buildSwapTransaction(pool, poolAddr, userPubkey, inMint, quote, referral);

    const connection = getConnection();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    const serialized = tx.serialize({ requireAllSignatures: false });
    const base64Tx   = serialized.toString('base64');

    res.json({ transaction: base64Tx, lastValidBlockHeight, quote, poolAddress: poolAddr.toString() });
  } catch (e) { err(res, e); }
});

// ── POST /api/meteora-swap/build-add-liquidity ───────────────────────────────
router.post('/build-add-liquidity', async (req: Request, res: Response) => {
  try {
    const {
      clawdAmount,
      solAmount,
      userWallet,
      slippagePct = 1,
    } = req.body as {
      clawdAmount: number;
      solAmount: number;
      userWallet: string;
      slippagePct?: number;
    };

    if (!userWallet) return res.status(400).json({ error: 'userWallet required' });
    const clawd = parsePositiveNumber(clawdAmount, 'clawdAmount');
    const sol = parsePositiveNumber(solAmount, 'solAmount');
    const slippage = parsePositiveNumber(slippagePct, 'slippagePct');

    const poolAddr = await findClawdPool();
    if (!poolAddr) return res.status(404).json({ error: 'No CLAWD/SOL pool found' });

    const pool = await loadPool(poolAddr);
    const userPubkey = new PublicKey(userWallet);
    const { transaction, positionNft, liquidityDelta } = await buildAddLiquidityTransaction(
      pool,
      poolAddr,
      userPubkey,
      clawd,
      sol,
      slippage,
    );

    const connection = getConnection();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;
    transaction.partialSign(positionNft);

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      lastValidBlockHeight,
      poolAddress: poolAddr.toString(),
      positionAddress: derivePositionAddress(positionNft.publicKey).toString(),
      positionNft: positionNft.publicKey.toString(),
      liquidityDelta,
      clawdAmount: clawd,
      solAmount: sol,
    });
  } catch (e) { err(res, e); }
});

// ── POST /api/meteora-swap/submit ─────────────────────────────────────────────
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const { signedTransaction } = req.body as { signedTransaction: string };
    if (!signedTransaction) return res.status(400).json({ error: 'signedTransaction required' });

    const connection = getConnection();
    const txBuffer = Buffer.from(signedTransaction, 'base64');

    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
    let sig: string;
    try {
      const versioned = VersionedTransaction.deserialize(txBuffer);
      ({ signature: sig } = await sendOptimizedRawTransaction(versioned.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      }));
    } catch {
      const legacy = Transaction.from(txBuffer);
      ({ signature: sig } = await sendOptimizedRawTransaction(legacy.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      }));
    }

    connection.confirmTransaction(sig, 'confirmed').catch(console.warn);

    res.json({ signature: sig, explorerUrl: `https://solscan.io/tx/${sig}` });
  } catch (e) { err(res, e); }
});

// ── GET /api/meteora-swap/live-price ──────────────────────────────────────────
router.get('/live-price', (_req: Request, res: Response) => {
  const price = getLatestPrice();
  if (!price) return res.status(503).json({ error: 'Price not available yet' });
  res.json(price);
});

// ── GET /api/meteora-swap/pool-data ──────────────────────────────────────────
router.get('/pool-data', async (_req: Request, res: Response) => {
  try {
    const poolAddr = await findClawdPool();
    if (!poolAddr) return res.status(404).json({ error: 'No CLAWD/SOL pool found' });

    const [pool, indexed] = await Promise.all([
      loadPool(poolAddr),
      getMeteoraPoolData(poolAddr.toString()),
    ]);
    const chain = await getPoolInfo(pool, poolAddr);

    res.json({
      poolAddress: poolAddr.toString(),
      chain,
      indexed,
    });
  } catch (e) { err(res, e); }
});

// ── POST /api/meteora-swap/create-pool ────────────────────────────────────────
/**
 * Creates a new CLAWD/SOL Meteora DAMM V2 pool (compounding fee mode).
 * Uses WALLET_PRIVATE_KEY (wallet: HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ)
 * Body: { clawdAmount, solAmount, startFeeBps?, endFeeBps?, compoundingFeeBps?, activationPoint? }
 */
router.post('/create-pool', adminGuard, async (req: Request, res: Response) => {
  try {
    const {
      clawdAmount,
      solAmount,
      startFeeBps      = 100,
      endFeeBps        = 25,
      compoundingFeeBps = 5000,
      activationPoint,
    } = req.body as {
      clawdAmount: number;
      solAmount: number;
      startFeeBps?: number;
      endFeeBps?: number;
      compoundingFeeBps?: number;
      activationPoint?: number;
    };

    if (!clawdAmount || !solAmount) {
      return res.status(400).json({ error: 'clawdAmount and solAmount required' });
    }

    // Guard: refuse if pool already configured in env
    const existingPool = process.env.METEORA_CLAWD_POOL;
    if (existingPool) {
      return res.status(409).json({
        error: 'Pool already configured. Remove METEORA_CLAWD_POOL from .env to force re-creation.',
        poolAddress: existingPool,
      });
    }

    const payer = loadPoolCreatorKeypair();
    if (!payer) {
      return res.status(403).json({
        error: 'WALLET_PRIVATE_KEY not configured.',
        hint: 'Set WALLET_PRIVATE_KEY in .env.local',
      });
    }

    console.log('[meteora-swap] Creating DAMM V2 pool from wallet:', payer.publicKey.toString());

    const { transactions, poolAddress, positionAddress, positionNft } = await buildCreatePoolTransactions(payer, {
      clawdAmount,
      solAmount,
      startFeeBps,
      endFeeBps,
      compoundingFeeBps,
      activationPoint,
    });

    const connection = getConnection();
    const signatures: string[] = [];
    for (const tx of transactions) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer.publicKey;

      // Log all required signers for debugging
      const msg = tx.compileMessage();
      const requiredKeys = msg.accountKeys.slice(0, msg.header.numRequiredSignatures);
      console.log('[meteora-swap] tx requires signers:',
        requiredKeys.map(k => k.toString()),
        'payer:', payer.publicKey.toString(),
        'positionNft:', positionNft.publicKey.toString(),
      );

      tx.partialSign(payer, positionNft);

      const { signature: sig } = await sendOptimizedRawTransaction(tx.serialize({ requireAllSignatures: false }), {
        skipPreflight: true, // skip preflight so we get actual on-chain error
        maxRetries: 0,
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      signatures.push(sig);
      console.log('[meteora-swap] Pool tx confirmed:', sig);
    }

    startPriceMonitor(poolAddress);
    console.log('[meteora-swap] DAMM V2 pool created:', poolAddress);

    res.json({
      success: true,
      poolAddress,
      positionAddress,
      wallet: payer.publicKey.toString(),
      signatures,
      dex: 'Meteora DAMM V2',
      collectFeeMode: 'Compounding',
      compoundingFeeBps,
      startFeeBps,
      endFeeBps,
      note: `Pool seeded with ${clawdAmount} CLAWD + ${solAmount} SOL. ${compoundingFeeBps / 100}% of fees auto-compound back into liquidity.`,
      nextStep: `Add METEORA_CLAWD_POOL=${poolAddress} to your .env to skip on-chain discovery on restart.`,
    });
  } catch (e) { err(res, e); }
});

// ── POST /api/meteora-swap/seed-liquidity ─────────────────────────────────────
/**
 * Adds liquidity to the configured CLAWD/SOL Meteora DAMM V2 pool.
 * Body: { clawdAmount, solAmount }
 * Requires admin session or x-clawd-admin matching CLAWD_ADMIN_KEY.
 */
router.post('/seed-liquidity', adminGuard, async (req: Request, res: Response) => {
  try {
    const { clawdAmount, solAmount } = req.body as {
      clawdAmount: number;
      solAmount: number;
    };

    if (!clawdAmount || !solAmount) {
      return res.status(400).json({ error: 'clawdAmount and solAmount required' });
    }

    const payer = loadPoolCreatorKeypair();
    if (!payer) {
      return res.status(403).json({
        error: 'WALLET_PRIVATE_KEY not configured.',
        hint: 'Set WALLET_PRIVATE_KEY in .env.local',
      });
    }

    const poolAddr = await findClawdPool();
    if (!poolAddr) return res.status(404).json({ error: 'No CLAWD/SOL pool found' });

    const { transaction, positionAddress, positionNft, liquidityDelta } =
      await buildSeedLiquidityTransaction(payer, poolAddr, { clawdAmount, solAmount });

    const connection = getConnection();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;
    signRequiredPoolTransactionSigners(transaction, [
      { label: 'payer', keypair: payer },
      { label: 'positionNft', keypair: positionNft },
    ]);

    const { signature } = await sendOptimizedRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    const poolInfo = await getPoolInfo(await loadPool(poolAddr), poolAddr);
    startPriceMonitor(poolAddr.toString());

    res.json({
      success: true,
      poolAddress: poolAddr.toString(),
      positionAddress,
      positionNft: positionNft.publicKey.toString(),
      liquidityDelta,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
      clawdAmount,
      solAmount,
      liquidityReady: poolInfo.liquidityReady,
      nextStep: 'Swap quoting is enabled once liquidityReady is true.',
    });
  } catch (e) { err(res, e); }
});

// ── POST /api/meteora-swap/add-liquidity ──────────────────────────────────────
/**
 * Adds liquidity by opening a new position in the CLAWD/SOL pool.
 * Body: { clawdAmount, solAmount, slippagePct? }
 * Requires admin session or x-clawd-admin header.
 */
router.post('/add-liquidity', adminGuard, async (req: Request, res: Response) => {
  try {
    const { clawdAmount, solAmount, slippagePct = 1 } = req.body as {
      clawdAmount: number;
      solAmount: number;
      slippagePct?: number;
    };

    if (!clawdAmount || !solAmount) {
      return res.status(400).json({ error: 'clawdAmount and solAmount required' });
    }

    const payer = loadPoolCreatorKeypair();
    if (!payer) {
      return res.status(403).json({
        error: 'WALLET_PRIVATE_KEY not configured.',
        hint: 'Set WALLET_PRIVATE_KEY in .env.local',
      });
    }

    const poolAddr = await findClawdPool();
    if (!poolAddr) return res.status(404).json({ error: 'No CLAWD/SOL pool found' });

    const pool = await loadPool(poolAddr);

    const { transaction, positionNft } = await buildAddLiquidityTransaction(
      pool,
      poolAddr,
      payer.publicKey,
      clawdAmount,
      solAmount,
      slippagePct,
    );

    const connection = getConnection();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;

    // Sign with both payer and position NFT keypairs
    transaction.partialSign(payer, positionNft);

    const { signature } = await sendOptimizedRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    const positionAddress = derivePositionAddress(positionNft.publicKey).toString();
    console.log('[meteora-swap] Liquidity added. Position:', positionAddress, 'Sig:', signature);

    res.json({
      success: true,
      positionAddress,
      positionNft: positionNft.publicKey.toString(),
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
      clawdAmount,
      solAmount,
    });
  } catch (e) { err(res, e); }
});

// ── GET /api/meteora-swap/status ──────────────────────────────────────────────
router.get('/status', async (_req: Request, res: Response) => {
  const poolAddr = await findClawdPool().catch(() => null);
  const price    = getLatestPrice();
  const payer    = loadPoolCreatorKeypair();
  const poolInfo = poolAddr
    ? await loadPool(poolAddr).then((pool) => getPoolInfo(pool, poolAddr)).catch(() => null)
    : null;

  res.json({
    poolConfigured:   !!poolAddr,
    poolAddress:      poolAddr?.toString() ?? null,
    clawdMint:        CLAWD_MINT.toString(),
    solMint:          SOL_MINT.toString(),
    livePrice:        price,
    liquidityReady:   !!poolInfo?.liquidityReady,
    liquidity:        poolInfo?.liquidity ?? null,
    poolReserves:     poolInfo
      ? { clawd: poolInfo.tokenAAmount, sol: poolInfo.tokenBAmount }
      : null,
    collectFeeMode:   poolInfo?.collectFeeMode ?? null,
    collectFeeModeName: poolInfo?.collectFeeModeName ?? null,
    compoundingFeeBps: poolInfo?.compoundingFeeBps ?? null,
    websocketActive:  !!price,
    creatorWallet:    payer?.publicKey.toString() ?? null,
    keySource:        process.env.WALLET_PRIVATE_KEY ? 'WALLET_PRIVATE_KEY' : process.env.TREASURY_KEY ? 'TREASURY_KEY' : 'none',
    rpcEndpoint:      process.env.HELIUS_RPC_URL ? 'custom (HELIUS_RPC_URL)' : 'helius via API key',
    dex:              'Meteora DAMM V2 (cp-amm-sdk)',
    feeCollectionToken: poolInfo?.feeCollectionToken ?? null,
    incentive: 'Use the native CLAWD swap to route volume through the treasury-backed Meteora pool.',
    warning: poolInfo?.liquidityReady ? null : 'Pool exists but has no active liquidity; swaps are disabled until seeded.',
  });
});

export default router;
