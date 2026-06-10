import { PublicKey } from '@solana/web3.js';

export const DEFAULT_ORE_ROOT = '/Users/8bit/Downloads/ClawdBrowser/ore-master';
export const DEFAULT_ORE_CLI_PATH = `${DEFAULT_ORE_ROOT}/target/release/ore-cli`;

export const ORE_PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const TOKEN_DECIMALS = 11;

export const DISC_BOARD = 105n;
export const DISC_ROUND = 109n;
export const DISC_MINER = 103n;

const BOARD_SEED = Buffer.from('board');
const MINER_SEED = Buffer.from('miner');
const ROUND_SEED = Buffer.from('round');

export function boardPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([BOARD_SEED], ORE_PROGRAM_ID);
}

export function minerPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINER_SEED, authority.toBuffer()], ORE_PROGRAM_ID);
}

export function roundPda(roundId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync([ROUND_SEED, buf], ORE_PROGRAM_ID);
}

export function solAmount(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;
  return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '') || '0'}`;
}

export function oreAmount(amount: bigint): string {
  const divisor = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = amount / divisor;
  const frac = amount % divisor;
  return `${whole}.${frac.toString().padStart(TOKEN_DECIMALS, '0').replace(/0+$/, '') || '0'}`;
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1_000_000_000));
}

