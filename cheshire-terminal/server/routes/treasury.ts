import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  Connection, PublicKey, LAMPORTS_PER_SOL, Keypair,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnCheckedInstruction,
  getAccount,
} from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import { db } from '../db';
import { treasuryPayments } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { sendOptimizedRawTransaction } from '../lib/helius/transactionOptimization';

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const CLAWD_MINT = new PublicKey('8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump');
const CLAWD_DECIMALS = 6;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const FEE_SOL = 0.00069420; // SOL per use
const FEE_LAMPORTS = Math.round(FEE_SOL * LAMPORTS_PER_SOL); // 694200 lamports
const BIRDEYE_BASE = 'https://public-api.birdeye.so';

function getTreasuryWallet(): PublicKey {
  const addr =
    process.env.TREASURY_WALLET ||
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    'HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ';
  return new PublicKey(addr);
}

function getTreasuryKeypair(): Keypair | null {
  const raw = process.env.TREASURY_KEY;
  if (!raw) return null;
  try {
    const secretKey = raw.startsWith('[')
      ? new Uint8Array(JSON.parse(raw))
      : bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.warn('[treasury] Could not load TREASURY_KEY:', e);
    return null;
  }
}

function getConnection(): Connection {
  const rpc = process.env.HELIUS_RPC_URL ||
    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  return new Connection(rpc, 'confirmed');
}

async function getBirdeyePrice(mint: string): Promise<number | null> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${BIRDEYE_BASE}/defi/price?address=${mint}`, {
      headers: { 'x-api-key': key, accept: 'application/json', 'x-chain': 'solana' },
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    return d?.data?.value ?? null;
  } catch { return null; }
}

async function getBothPrices(): Promise<{ solUsd: number; clawdUsd: number }> {
  const [solUsd, clawdUsd] = await Promise.all([
    getBirdeyePrice(SOL_MINT),
    getBirdeyePrice(CLAWD_MINT.toString()),
  ]);
  return { solUsd: solUsd ?? 150, clawdUsd: clawdUsd ?? 0.000001 };
}

// ── GET /api/treasury/status ──────────────────────────────────────────────────
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: !!(process.env.TREASURY_KEY && process.env.HELIUS_RPC_URL),
    hasTreasuryKey: !!process.env.TREASURY_KEY,
    hasBirdeyeKey: !!process.env.BIRDEYE_API_KEY,
    hasBirdeyeWss: !!process.env.BIRDEYE_WSS_URL,
    hasHeliusWss: !!process.env.HELIUS_WSS_URL,
    treasuryWallet: getTreasuryWallet().toString(),
    feeSol: FEE_SOL,
    clawdMint: CLAWD_MINT.toString(),
  });
});

// ── GET /api/treasury/wss-config ─────────────────────────────────────────────
// Frontend-safe websocket endpoints for live price + tx streams
router.get('/wss-config', (_req: Request, res: Response) => {
  res.json({
    birdeyeWss: process.env.BIRDEYE_WSS_URL
      ? (process.env.BIRDEYE_WSS_URL.includes('x-api-key')
          ? process.env.BIRDEYE_WSS_URL
          : `${process.env.BIRDEYE_WSS_URL}${process.env.BIRDEYE_WSS_URL.includes('?') ? '&' : '?'}x-api-key=${process.env.BIRDEYE_API_KEY}`)
      : null,
    heliusWss: process.env.HELIUS_WSS_URL || (process.env.HELIUS_API_KEY
      ? `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : null),
    treasuryWallet: getTreasuryWallet().toString(),
    clawdMint: CLAWD_MINT.toString(),
    solMint: SOL_MINT,
  });
});

// ── GET /api/treasury/prices ──────────────────────────────────────────────────
router.get('/prices', async (_req: Request, res: Response) => {
  try {
    const { solUsd, clawdUsd } = await getBothPrices();
    const feeUsd = FEE_SOL * solUsd;
    const clawdToBurn = feeUsd > 0 && clawdUsd > 0 ? feeUsd / clawdUsd : 0;
    res.json({
      solUsd,
      clawdUsd,
      feeSol: FEE_SOL,
      feeUsd: feeUsd.toFixed(4),
      clawdToBurn: Math.floor(clawdToBurn),
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/treasury/stats ───────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  if (!db) {
    return res.json({
      totalPayments: 0,
      totalSolCollected: 0,
      totalClawdBurned: 0,
      totalUsdValue: 0,
      recent: [],
    });
  }
  try {
    const all = await db.select().from(treasuryPayments).orderBy(desc(treasuryPayments.createdAt));
    const totalPayments = all.length;
    const totalSolCollected = all.reduce((s, p) => s + (p.solPaid ?? 0), 0);
    const totalClawdBurned = all.reduce((s, p) => s + (p.clawdBurned ?? 0), 0);
    const totalUsdValue = all.reduce((s, p) => s + ((p.solPaid ?? 0) * (p.solUsdAtTime ?? 150)), 0);
    const recent = all.slice(0, 10);
    res.json({ totalPayments, totalSolCollected, totalClawdBurned, totalUsdValue, recent });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/treasury/balance ─────────────────────────────────────────────────
router.get('/balance', async (_req: Request, res: Response) => {
  try {
    const connection = getConnection();
    const wallet = getTreasuryWallet();
    const [solBal, prices] = await Promise.all([
      connection.getBalance(wallet),
      getBothPrices(),
    ]);
    let clawdBalance = 0;
    try {
      const ata = await getAssociatedTokenAddress(CLAWD_MINT, wallet);
      const acct = await getAccount(connection, ata);
      clawdBalance = Number(acct.amount) / 10 ** CLAWD_DECIMALS;
    } catch {}
    const solAmount = solBal / LAMPORTS_PER_SOL;
    res.json({
      solBalance: solAmount,
      solUsd: prices.solUsd,
      solUsdValue: solAmount * prices.solUsd,
      clawdBalance,
      clawdUsd: prices.clawdUsd,
      clawdUsdValue: clawdBalance * prices.clawdUsd,
      wallet: wallet.toString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/treasury/verify-payment ────────────────────────────────────────
// After user pays, they submit the signature for server-side verification + burn
router.post('/verify-payment', async (req: Request, res: Response) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const { txSignature, walletAddress, feature = 'general' } = req.body as {
    txSignature: string;
    walletAddress: string;
    feature?: string;
  };
  if (!txSignature || !walletAddress) {
    return res.status(400).json({ error: 'txSignature and walletAddress required' });
  }

  // Idempotency check
  const existing = await db.select().from(treasuryPayments)
    .where(eq(treasuryPayments.txSignature, txSignature));
  if (existing.length > 0) {
    return res.json({ success: true, alreadyProcessed: true, payment: existing[0] });
  }

  try {
    const connection = getConnection();
    const treasuryWallet = getTreasuryWallet();

    // Confirm transaction on-chain
    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) {
      return res.status(400).json({ error: 'Transaction not found or not confirmed' });
    }
    if (tx.meta?.err) {
      return res.status(400).json({ error: 'Transaction failed on-chain' });
    }
    if (!tx.meta) {
      return res.status(400).json({ error: 'Transaction metadata unavailable' });
    }

    // Verify SOL transfer to treasury
    const acctKeys = tx.transaction.message.getAccountKeys?.()?.staticAccountKeys
      ?? (tx.transaction.message as any).accountKeys;
    const treasuryIdx = acctKeys?.findIndex((k: PublicKey) =>
      k.toString() === treasuryWallet.toString()
    );
    if (treasuryIdx === -1) {
      return res.status(400).json({ error: 'Treasury wallet not found in transaction' });
    }
    const preBal = tx.meta.preBalances[treasuryIdx];
    const postBal = tx.meta.postBalances[treasuryIdx];
    const received = postBal - preBal;
    if (received < FEE_LAMPORTS - 5000) { // 5000 lamport tolerance
      return res.status(400).json({
        error: `Insufficient payment. Expected ${FEE_LAMPORTS} lamports, received ${received}`,
      });
    }

    // Get current prices
    const { solUsd, clawdUsd } = await getBothPrices();
    const feeUsd = FEE_SOL * solUsd;
    const clawdToBurn = clawdUsd > 0 ? Math.floor(feeUsd / clawdUsd) : 6942000;

    // Burn CLAWD from treasury
    let burnSignature: string | null = null;
    const keypair = getTreasuryKeypair();
    if (keypair && clawdToBurn > 0) {
      try {
        const ata = await getAssociatedTokenAddress(CLAWD_MINT, keypair.publicKey);
        const acct = await getAccount(connection, ata);
        const available = Number(acct.amount);
        const burnAmt = Math.min(clawdToBurn * 10 ** CLAWD_DECIMALS, available);
        if (burnAmt > 0) {
          const burnIx = createBurnCheckedInstruction(
            ata, CLAWD_MINT, keypair.publicKey,
            BigInt(Math.floor(burnAmt)), CLAWD_DECIMALS,
          );
          const burnTx = new Transaction().add(burnIx);
          const { blockhash } = await connection.getLatestBlockhash();
          burnTx.recentBlockhash = blockhash;
          burnTx.feePayer = keypair.publicKey;
          burnTx.sign(keypair);
          ({ signature: burnSignature } = await sendOptimizedRawTransaction(burnTx.serialize(), { skipPreflight: false, maxRetries: 3 }));
          await connection.confirmTransaction(burnSignature, 'confirmed');
          console.log(`[treasury] Burned ${burnAmt / 10 ** CLAWD_DECIMALS} CLAWD: ${burnSignature}`);
        }
      } catch (burnErr) {
        console.warn('[treasury] Burn failed (non-fatal):', burnErr);
      }
    }

    // Record payment
    const [payment] = await db.insert(treasuryPayments).values({
      walletAddress,
      txSignature,
      solPaid: received / LAMPORTS_PER_SOL,
      solUsdAtTime: solUsd,
      clawdBurned: clawdToBurn,
      clawdUsdAtTime: clawdUsd,
      feature,
      burnSignature,
      status: 'verified',
    }).returning();

    res.json({ success: true, payment, clawdBurned: clawdToBurn, burnSignature });
  } catch (e: any) {
    console.error('[treasury] verify-payment error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/treasury/payments/:wallet ────────────────────────────────────────
router.get('/payments/:wallet', async (req: Request, res: Response) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const payments = await db.select().from(treasuryPayments)
      .where(eq(treasuryPayments.walletAddress, req.params.wallet))
      .orderBy(desc(treasuryPayments.createdAt))
      .limit(50);
    res.json(payments);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
