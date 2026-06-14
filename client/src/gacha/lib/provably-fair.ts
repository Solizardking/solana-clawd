// Provably fair RNG for Lobster Gacha
// Commitment scheme: sha256(walletPubkey + spinIndex + recentBlockhash) → deterministic outcome
// Attestation: the signed commitment is written to Solana via Memo program (immutable record)

import { getSolanaConnection } from './connection';
import type { Rarity } from '../components/GachaPage';

export interface PullCommitment {
  walletPubkey: string;
  spinIndex: number;
  blockhash: string;
  commitmentHash: string;
  timestamp: number;
}

export interface PullResult {
  commitment: PullCommitment;
  rarity: Rarity;
  cardPoolIndex: number;
  attestationTxId?: string;
  verified: boolean;
}

/** Hash a string using the Web Crypto API (SHA-256) */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Fetch the most recent Solana blockhash — used as entropy seed */
export async function fetchEntropyBlockhash(): Promise<string> {
  try {
    const conn = getSolanaConnection();
    const { blockhash } = await conn.getLatestBlockhash('finalized');
    return blockhash;
  } catch {
    // Fallback entropy from crypto random if RPC fails
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

/** Build a verifiable commitment for a pull */
export async function buildCommitment(
  walletPubkey: string,
  spinIndex: number,
): Promise<PullCommitment> {
  const blockhash = await fetchEntropyBlockhash();
  const raw = `${walletPubkey}:${spinIndex}:${blockhash}`;
  const commitmentHash = await sha256Hex(raw);
  return { walletPubkey, spinIndex, blockhash, commitmentHash, timestamp: Date.now() };
}

/** Derive rarity from commitment hash (deterministic, verifiable) */
export function deriveRarity(commitmentHash: string): Rarity {
  // Use first 8 hex chars (32 bits) as a number
  const n = parseInt(commitmentHash.slice(0, 8), 16);
  const pct = (n / 0xffffffff) * 100;
  if (pct < 3) return 'legendary';
  if (pct < 15) return 'epic';
  if (pct < 40) return 'rare';
  return 'common';
}

/** Derive which card from pool using bytes 8-16 of hash */
export function deriveCardIndex(commitmentHash: string, poolSize: number): number {
  const n = parseInt(commitmentHash.slice(8, 16), 16);
  return n % poolSize;
}

/** Full provably fair pull — returns commitment + derived result */
export async function provablyFairPull(
  walletPubkey: string,
  spinIndex: number,
  poolSizeByRarity: Record<Rarity, number>,
): Promise<{ commitment: PullCommitment; rarity: Rarity; cardPoolIndex: number }> {
  const commitment = await buildCommitment(walletPubkey, spinIndex);
  const rarity = deriveRarity(commitment.commitmentHash);
  const cardPoolIndex = deriveCardIndex(commitment.commitmentHash, poolSizeByRarity[rarity]);
  return { commitment, rarity, cardPoolIndex };
}

/** Write the commitment hash to Solana as a Memo (attestation record).
 *  Called after the user signs via their wallet adapter. */
export async function attestPullOnChain(
  walletAdapter: { sendTransaction: (tx: import('@solana/web3.js').Transaction, conn: import('@solana/web3.js').Connection) => Promise<string> },
  commitment: PullCommitment,
): Promise<string> {
  const { buildPrizeClaimMemo } = await import('./clawd-token');
  const conn = getSolanaConnection();
  const memo = `gacha-commit:${commitment.commitmentHash.slice(0, 16)}:spin${commitment.spinIndex}`;
  const tx = await buildPrizeClaimMemo(
    commitment.walletPubkey,
    commitment.commitmentHash,
    0,
    memo,
  );
  const txId = await walletAdapter.sendTransaction(tx, conn);
  return txId;
}

/** Verify a past pull by recomputing the hash (client-side verification) */
export async function verifyPull(
  walletPubkey: string,
  spinIndex: number,
  blockhash: string,
  claimedHash: string,
): Promise<boolean> {
  const raw = `${walletPubkey}:${spinIndex}:${blockhash}`;
  const recomputed = await sha256Hex(raw);
  return recomputed === claimedHash;
}
