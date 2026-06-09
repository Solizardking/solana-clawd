import { Connection, PublicKey } from '@solana/web3.js';
import { boardPda, minerPda, roundPda, DISC_BOARD, DISC_MINER, DISC_ROUND } from './constants.js';

export interface BoardState {
  address: string;
  roundId: bigint;
  startSlot: bigint;
  endSlot: bigint;
  epochId: bigint;
}

export interface RoundState {
  address: string;
  id: bigint;
  deployed: bigint[];
  count: bigint[];
  expiresAt: bigint;
  motherlode: bigint;
  topMiner: string;
  topMinerReward: bigint;
  totalDeployed: bigint;
  totalMiners: bigint;
  totalVaulted: bigint;
  totalWinnings: bigint;
  slotHashRevealed: boolean;
  winningSquare: number | null;
}

export interface MinerState {
  address: string;
  authority: string;
  deployed: bigint[];
  cumulative: bigint[];
  checkpointFee: bigint;
  checkpointId: bigint;
  rewardsSol: bigint;
  rewardsOre: bigint;
  refinedOre: bigint;
  roundId: bigint;
  lifetimeSol: bigint;
  lifetimeOre: bigint;
  lifetimeDeployed: bigint;
  checkpointNeeded: boolean;
}

function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function readPubkey(buf: Buffer, offset: number): string {
  return new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
}

function readU64Array(buf: Buffer, offset: number, count: number): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(readU64LE(buf, offset + i * 8));
  }
  return out;
}

function assertDiscriminator(buf: Buffer, expected: bigint, label: string): void {
  const disc = buf.readBigUInt64LE(0);
  if (disc !== expected) {
    throw new Error(`${label} discriminator mismatch: expected ${expected}, got ${disc}`);
  }
}

export async function getBoard(conn: Connection): Promise<BoardState> {
  const [pda] = boardPda();
  const account = await conn.getAccountInfo(pda);
  if (!account) {
    throw new Error('ORE board account not found');
  }

  const buf = Buffer.from(account.data);
  assertDiscriminator(buf, DISC_BOARD, 'Board');

  return {
    address: pda.toBase58(),
    roundId: readU64LE(buf, 8),
    startSlot: readU64LE(buf, 16),
    endSlot: readU64LE(buf, 24),
    epochId: readU64LE(buf, 32),
  };
}

export async function getRound(conn: Connection, roundId: bigint): Promise<RoundState> {
  const [pda] = roundPda(roundId);
  const account = await conn.getAccountInfo(pda);
  if (!account) {
    throw new Error(`ORE round ${roundId} account not found`);
  }

  const buf = Buffer.from(account.data);
  assertDiscriminator(buf, DISC_ROUND, 'Round');

  const slotHash = buf.subarray(216, 248);
  const zeroHash = slotHash.every((b) => b === 0);
  const ffHash = slotHash.every((b) => b === 0xff);
  const revealed = !zeroHash && !ffHash;

  let winningSquare: number | null = null;
  if (revealed) {
    const r1 = slotHash.readBigUInt64LE(0);
    const r2 = slotHash.readBigUInt64LE(8);
    const r3 = slotHash.readBigUInt64LE(16);
    const r4 = slotHash.readBigUInt64LE(24);
    winningSquare = Number((r1 ^ r2 ^ r3 ^ r4) % 25n);
  }

  return {
    address: pda.toBase58(),
    id: readU64LE(buf, 8),
    deployed: readU64Array(buf, 16, 25),
    count: readU64Array(buf, 248, 25),
    expiresAt: readU64LE(buf, 448),
    motherlode: readU64LE(buf, 456),
    topMiner: readPubkey(buf, 496),
    topMinerReward: readU64LE(buf, 528),
    totalDeployed: readU64LE(buf, 536),
    totalMiners: readU64LE(buf, 544),
    totalVaulted: readU64LE(buf, 552),
    totalWinnings: readU64LE(buf, 560),
    slotHashRevealed: revealed,
    winningSquare,
  };
}

export async function getMiner(conn: Connection, authority: PublicKey): Promise<MinerState | null> {
  const [pda] = minerPda(authority);
  const account = await conn.getAccountInfo(pda);
  if (!account) {
    return null;
  }

  const buf = Buffer.from(account.data);
  assertDiscriminator(buf, DISC_MINER, 'Miner');

  const checkpointId = readU64LE(buf, 448);
  const roundId = readU64LE(buf, 512);

  return {
    address: pda.toBase58(),
    authority: readPubkey(buf, 8),
    deployed: readU64Array(buf, 40, 25),
    cumulative: readU64Array(buf, 240, 25),
    checkpointFee: readU64LE(buf, 440),
    checkpointId,
    rewardsSol: readU64LE(buf, 488),
    rewardsOre: readU64LE(buf, 496),
    refinedOre: readU64LE(buf, 504),
    roundId,
    lifetimeSol: readU64LE(buf, 520),
    lifetimeOre: readU64LE(buf, 528),
    lifetimeDeployed: readU64LE(buf, 536),
    checkpointNeeded: checkpointId < roundId,
  };
}

export async function getCurrentSlot(conn: Connection): Promise<bigint> {
  return BigInt(await conn.getSlot());
}

export async function getSolBalance(conn: Connection, authority: PublicKey): Promise<bigint> {
  return BigInt(await conn.getBalance(authority));
}

