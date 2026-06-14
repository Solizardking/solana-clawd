import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import { clawdBus } from './bus';
import type { Fill, PriceSnapshot, StrategySignal, Venue } from './types';
import { honchoLogTrade } from '../honcho';
import {
  closePosition,
  getOpenPositions,
  getState,
  openPosition,
  recordFill,
  updateState,
} from './state';

const decimalsCache = new Map<string, number>();
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const pumpExecutorModulePath = './clawd/pump-executor.js';
type PumpExecutorModule = typeof import('./pump-executor');

async function loadPumpExecutor(): Promise<PumpExecutorModule | null> {
  try {
    return await import(pumpExecutorModulePath) as PumpExecutorModule;
  } catch (error) {
    console.error('[clawd-trader] Pump executor unavailable, falling back to Jupiter:', error);
    return null;
  }
}

export async function getMintDecimals(mint: string): Promise<number | null> {
  if (mint === SOL_MINT) return 9;
  const cached = decimalsCache.get(mint);
  if (cached != null) return cached;
  try {
    const conn = getConnection();
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    const parsed: any = (info.value?.data as any)?.parsed;
    const dec = parsed?.info?.decimals;
    if (typeof dec === 'number') {
      decimalsCache.set(mint, dec);
      return dec;
    }
  } catch (e) {
    console.warn('[clawd-trader] decimals lookup failed for', mint, e);
  }
  return null;
}

let solUsdCache: { value: number; ts: number } | null = null;
async function getSolUsd(): Promise<number> {
  if (solUsdCache && Date.now() - solUsdCache.ts < 60_000) return solUsdCache.value;
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return 150;
  try {
    const r = await fetch(`https://public-api.birdeye.so/defi/price?address=${SOL_MINT}`, {
      headers: { 'x-api-key': key, accept: 'application/json', 'x-chain': 'solana' },
    });
    if (!r.ok) return solUsdCache?.value ?? 150;
    const d = (await r.json()) as any;
    const v = d?.data?.value ?? 150;
    solUsdCache = { value: v, ts: Date.now() };
    return v;
  } catch {
    return solUsdCache?.value ?? 150;
  }
}

const VENUE: Venue = 'solana';
const LAMPORTS_PER_SOL = 1_000_000_000;

const LIVE_RISK = {
  maxPositionsPerSymbol: 1,
  maxOpenPositions: 3,
  maxLamportsPerTrade: Math.floor(0.1 * LAMPORTS_PER_SOL),
  minSolBalance: 0.01,
  defaultSlippageBps: 100,
  maxTradesPerHour: 6,
};

const tradeTimes: number[] = [];
function rateLimitOk(): boolean {
  const cutoff = Date.now() - 3600_000;
  while (tradeTimes.length && tradeTimes[0] < cutoff) tradeTimes.shift();
  return tradeTimes.length < LIVE_RISK.maxTradesPerHour;
}

function loadKeypair(): Keypair | null {
  const candidates = [
    ['CLAWD_TRADER_KEY', process.env.CLAWD_TRADER_KEY],
    ['WALLET_PRIVATE_KEY', process.env.WALLET_PRIVATE_KEY],
  ] as const;
  const errors: string[] = [];

  for (const [name, raw] of candidates) {
    if (!raw) continue;
    try {
      const normalized = raw.trim().replace(/^['"<]+|[>'"]+$/g, '');
      const secret = normalized.startsWith('[')
        ? new Uint8Array(JSON.parse(normalized))
        : bs58.decode(normalized);
      return Keypair.fromSecretKey(secret);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length) {
    console.error(`[clawd-trader] keypair load failed (${errors.join('; ')})`);
  }
  return null;
}

function getConnection(): Connection {
  const url =
    process.env.HELIUS_RPC_URL ||
    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  return new Connection(url, 'confirmed');
}

interface JupOrder {
  swapTransaction?: string;
  transaction?: string;
  requestId?: string;
  lastValidBlockHeight?: number;
  inAmount?: string;
  outAmount?: string;
  outputDecimals?: number;
  inputDecimals?: number;
  error?: string;
}

async function jupiterOrder(opts: {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  taker: string;
  slippageBps: number;
}): Promise<JupOrder> {
  const params = new URLSearchParams({
    inputMint: opts.inputMint,
    outputMint: opts.outputMint,
    amount: String(opts.amountLamports),
    taker: opts.taker,
    slippageBps: String(opts.slippageBps),
  });
  const r = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
    headers: process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {},
  });
  if (!r.ok) throw new Error(`Jupiter order ${r.status}`);
  return (await r.json()) as JupOrder;
}

async function jupiterExecute(signedB64: string, requestId: string, lvbh?: number): Promise<any> {
  const body: any = { signedTransaction: signedB64, requestId };
  if (lvbh) body.lastValidBlockHeight = lvbh;
  const r = await fetch('https://api.jup.ag/swap/v2/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  return await r.json();
}

export interface LiveSwapResult {
  ok: boolean;
  error?: string;
  txSignature?: string;
  inAmount?: number;
  outAmount?: number;
}

async function liveSwap(
  inputMint: string,
  outputMint: string,
  amountRaw: number,
  slippageBps: number,
): Promise<LiveSwapResult> {
  if (process.env.CLAWD_LIVE !== 'true') {
    return { ok: false, error: 'CLAWD_LIVE not enabled' };
  }
  const kp = loadKeypair();
  if (!kp) return { ok: false, error: 'CLAWD_TRADER_KEY not configured' };

  if (!rateLimitOk()) return { ok: false, error: 'rate limit reached' };

  const conn = getConnection();
  if (inputMint === SOL_MINT) {
    if (amountRaw > LIVE_RISK.maxLamportsPerTrade) {
      return { ok: false, error: `notional exceeds cap (${LIVE_RISK.maxLamportsPerTrade} lamports)` };
    }
    const solBal = await conn.getBalance(kp.publicKey);
    if (solBal - amountRaw < LIVE_RISK.minSolBalance * LAMPORTS_PER_SOL) {
      return { ok: false, error: 'insufficient SOL after reserve' };
    }
  }

  const pumpExecutor = await loadPumpExecutor();
  const pumpResult = pumpExecutor
    ? await pumpExecutor.executePumpRoute({
      connection: conn,
      payer: kp,
      inputMint,
      outputMint,
      amountRaw,
      slippageBps,
    })
    : null;
  if (pumpResult?.ok) {
    clawdBus.publish({
      type: 'log',
      payload: {
        level: 'info',
        msg: `[live] ${pumpResult.route} execution landed: ${pumpResult.txSignature}`,
      },
    });
    tradeTimes.push(Date.now());
    return {
      ok: true,
      txSignature: pumpResult.txSignature,
      inAmount: pumpResult.inAmount,
      outAmount: pumpResult.outAmount,
    };
  }
  if (pumpResult?.terminal) {
    return { ok: false, error: `${pumpResult.route}: ${pumpResult.error}` };
  }

  let order: JupOrder;
  try {
    order = await jupiterOrder({
      inputMint,
      outputMint,
      amountLamports: amountRaw,
      taker: kp.publicKey.toBase58(),
      slippageBps,
    });
  } catch (e: any) {
    return { ok: false, error: `jupiter order: ${e?.message ?? 'failed'}` };
  }

  const txB64 = order.transaction ?? order.swapTransaction;
  if (!txB64 || !order.requestId) {
    return { ok: false, error: order.error ?? 'no transaction returned' };
  }

  let signedB64: string;
  try {
    const tx = VersionedTransaction.deserialize(Buffer.from(txB64, 'base64'));
    tx.sign([kp]);
    signedB64 = Buffer.from(tx.serialize()).toString('base64');
  } catch (e: any) {
    return { ok: false, error: `sign: ${e?.message ?? 'failed'}` };
  }

  let result: any;
  try {
    result = await jupiterExecute(signedB64, order.requestId, order.lastValidBlockHeight);
  } catch (e: any) {
    return { ok: false, error: `jupiter execute: ${e?.message ?? 'failed'}` };
  }

  const sig = result?.signature ?? result?.transactionSignature;
  if (!sig) {
    return { ok: false, error: result?.error ?? 'execute returned no signature' };
  }

  tradeTimes.push(Date.now());

  const inDec = order.inputDecimals ?? 9;
  const outDec = order.outputDecimals ?? 9;
  return {
    ok: true,
    txSignature: sig,
    inAmount: Number(order.inAmount ?? amountRaw) / 10 ** inDec,
    outAmount: Number(order.outAmount ?? 0) / 10 ** outDec,
  };
}

export async function executeLive(
  sig: StrategySignal,
  snap: PriceSnapshot,
  decisionId: number | null,
): Promise<Fill | null> {
  const state = await getState();
  const traderWallet = liveStatus().pubkey;
  const open = await getOpenPositions();
  const inSym = open.filter((p) => p.symbol === sig.symbol);

  if (open.length >= LIVE_RISK.maxOpenPositions) {
    clawdBus.publish({ type: 'log', payload: { level: 'warn', msg: '[live] max open positions reached' } });
    return null;
  }

  const solUsd = snap.symbol === 'SOL' ? snap.price : await getSolUsd();
  const notionalLamports = Math.min(
    Math.floor((sig.suggestedNotionalUsd / solUsd) * LAMPORTS_PER_SOL),
    LIVE_RISK.maxLamportsPerTrade,
  );

  if (sig.direction === 'BUY') {
    if (inSym.filter((p) => p.side === 'long').length >= LIVE_RISK.maxPositionsPerSymbol) {
      clawdBus.publish({ type: 'log', payload: { level: 'info', msg: `[live] long cap on ${sig.symbol}` } });
      return null;
    }
    const result = await liveSwap(SOL_MINT, sig.mint, notionalLamports, LIVE_RISK.defaultSlippageBps);
    if (!result.ok) {
      clawdBus.publish({ type: 'log', payload: { level: 'error', msg: `[live] swap failed: ${result.error}` } });
      return null;
    }
    const size = result.outAmount ?? 0;
    const price = size > 0 ? sig.suggestedNotionalUsd / size : snap.price;

    const pos = await openPosition({
      venue: VENUE,
      symbol: sig.symbol,
      side: 'long',
      size,
      entryPrice: price,
    });

    const fill: Fill = {
      ts: Date.now(),
      venue: VENUE,
      symbol: sig.symbol,
      side: 'buy',
      size,
      price,
      notionalUsd: sig.suggestedNotionalUsd,
      mode: 'solana',
      txSignature: result.txSignature,
      decisionId: decisionId ?? undefined,
    };
    fill.id = (await recordFill(fill)) ?? undefined;
    honchoLogTrade(traderWallet || 'clawd-live-trader', {
      sessionId: traderWallet ? undefined : 'trades:clawd-live-trader',
      symbol: sig.symbol,
      mint: sig.mint,
      side: 'buy',
      amountInRaw: notionalLamports,
      amountOut: size,
      notionalUsd: sig.suggestedNotionalUsd,
      txSignature: result.txSignature,
      source: 'clawd',
    }).catch(() => {});
    await updateState({ totalFills: state.totalFills + 1, lastTick: Date.now() });
    clawdBus.publish({ type: 'fill', payload: fill });
    if (pos) clawdBus.publish({ type: 'position_update', payload: { action: 'open', position: pos } });
    return fill;
  }

  if (sig.direction === 'SELL') {
    const longs = inSym.filter((p) => p.side === 'long');
    if (longs.length === 0) return null;
    const oldest = longs[longs.length - 1];
    if (!oldest.id) return null;

    const decimals = await getMintDecimals(sig.mint);
    if (decimals == null) {
      clawdBus.publish({
        type: 'log',
        payload: { level: 'error', msg: `[live] decimals lookup failed for ${sig.symbol} — skipping SELL` },
      });
      return null;
    }

    const amountRaw = Math.floor(oldest.size * 10 ** decimals);
    if (amountRaw <= 0) {
      clawdBus.publish({
        type: 'log',
        payload: { level: 'warn', msg: `[live] computed zero raw amount for ${sig.symbol} — skipping SELL` },
      });
      return null;
    }

    const result = await liveSwap(sig.mint, SOL_MINT, amountRaw, LIVE_RISK.defaultSlippageBps);
    if (!result.ok) {
      clawdBus.publish({ type: 'log', payload: { level: 'error', msg: `[live] sell swap failed: ${result.error}` } });
      return null;
    }

    const solOut = result.outAmount ?? 0;
    const proceedsUsd = solOut * solUsd;
    const cost = oldest.size * oldest.entryPrice;
    const pnl = proceedsUsd - cost;
    const exitPrice = oldest.size > 0 ? proceedsUsd / oldest.size : snap.price;

    await closePosition(oldest.id, exitPrice, pnl);

    const fill: Fill = {
      ts: Date.now(),
      venue: VENUE,
      symbol: sig.symbol,
      side: 'sell',
      size: oldest.size,
      price: exitPrice,
      notionalUsd: proceedsUsd,
      pnlUsd: pnl,
      mode: 'solana',
      txSignature: result.txSignature,
      decisionId: decisionId ?? undefined,
    };
    fill.id = (await recordFill(fill)) ?? undefined;
    honchoLogTrade(traderWallet || 'clawd-live-trader', {
      sessionId: traderWallet ? undefined : 'trades:clawd-live-trader',
      symbol: sig.symbol,
      mint: sig.mint,
      side: 'sell',
      amountInRaw: amountRaw,
      amountOut: solOut,
      notionalUsd: proceedsUsd,
      txSignature: result.txSignature,
      source: 'clawd',
    }).catch(() => {});
    await updateState({
      totalPnlUsd: state.totalPnlUsd + pnl,
      totalFills: state.totalFills + 1,
      lastTick: Date.now(),
    });
    clawdBus.publish({ type: 'fill', payload: fill });
    clawdBus.publish({ type: 'position_update', payload: { action: 'close', positionId: oldest.id, pnl } });
    return fill;
  }

  return null;
}

export function liveStatus(): {
  configured: boolean;
  live: boolean;
  ready: boolean;
  pubkey?: string;
  rpcConfigured: boolean;
  signerConfigured: boolean;
  blockers: string[];
  risk: typeof LIVE_RISK;
} {
  const kp = loadKeypair();
  const live = process.env.CLAWD_LIVE === 'true';
  const rpcConfigured = Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY);
  const signerConfigured = Boolean(process.env.CLAWD_TRADER_KEY || process.env.WALLET_PRIVATE_KEY);
  const blockers = [
    live ? null : 'CLAWD_LIVE must be true',
    rpcConfigured ? null : 'HELIUS_RPC_URL or HELIUS_API_KEY is required',
    signerConfigured ? null : 'CLAWD_TRADER_KEY or WALLET_PRIVATE_KEY is required',
    kp ? null : 'trader keypair could not be loaded',
  ].filter((item): item is string => Boolean(item));
  return {
    live,
    configured: !!kp,
    ready: blockers.length === 0,
    pubkey: kp?.publicKey.toBase58(),
    rpcConfigured,
    signerConfigured,
    blockers,
    risk: LIVE_RISK,
  };
}
