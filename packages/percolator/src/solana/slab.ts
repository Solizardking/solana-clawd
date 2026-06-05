/**
 * Slab Account Parsing
 * 
 * Parse Percolator on-chain slab accounts.
 * 
 * @module solana/slab
 */

import { Connection, PublicKey } from "@solana/web3.js";

const MAGIC: bigint = 0x504552434f4c4154n; // "PERCOLAT"
const HEADER_LEN = 136;
const CONFIG_OFFSET = HEADER_LEN;
const CONFIG_LEN = 400;
const RESERVED_OFF = 48;
const ENGINE_OFF = 536;
const ACCOUNT_SIZE = 360;
const PARAMS_SIZE = 168;

export const SLAB_LEN = 1_525_624;
export { HEADER_LEN, CONFIG_LEN };

/**
 * Slab header
 */
export interface SlabHeader {
  magic: bigint;
  version: number;
  bump: number;
  flags: number;
  admin: PublicKey;
  nonce: bigint;
  matCounter: bigint;
  insuranceAuthority: PublicKey;
  insuranceOperator: PublicKey;
}

/**
 * MarketConfig
 */
export interface MarketConfig {
  collateralMint: PublicKey;
  vaultPubkey: PublicKey;
  indexFeedId: PublicKey;
  maxStalenessSecs: bigint;
  confFilterBps: number;
  vaultAuthorityBump: number;
  invert: number;
  unitScale: number;
  fundingHorizonSlots: bigint;
  fundingKBps: bigint;
  fundingMaxPremiumBps: bigint;
  fundingMaxE9PerSlot: bigint;
  hyperpAuthority: PublicKey;
  hyperpMarkE6: bigint;
  lastOraclePublishTime: bigint;
  oraclePriceCapE2bps: bigint;
  lastEffectivePriceE6: bigint;
  minOraclePriceCapE2bps: bigint;
  insuranceWithdrawMaxBps: number;
  tvlInsuranceCapMult: number;
  insuranceWithdrawCooldownSlots: bigint;
  lastHyperpIndexSlot: bigint;
  lastMarkPushSlot: bigint;
  lastInsuranceWithdrawSlot: bigint;
  markEwmaE6: bigint;
  markEwmaLastSlot: bigint;
  markEwmaHalflifeSlots: bigint;
  initRestartSlot: bigint;
  permissionlessResolveStaleSlots: bigint;
  lastGoodOracleSlot: bigint;
  maintenanceFeePerSlot: bigint;
  feeSweepCursorWord: bigint;
  feeSweepCursorBit: bigint;
  markMinFee: bigint;
  forceCloseDelaySlots: bigint;
  newAccountFee: bigint;
}

export interface EngineState {
  vault: bigint;
  insuranceFundBalance: bigint;
  currentSlot: bigint;
  lastCrankSlot: bigint;
  lastOraclePrice: bigint;
  numUsedAccounts: number;
}

export async function fetchSlab(connection: Connection, slabPubkey: PublicKey): Promise<Buffer> {
  const info = await connection.getAccountInfo(slabPubkey);
  if (!info) throw new Error(`Slab account not found: ${slabPubkey.toBase58()}`);
  return Buffer.from(info.data);
}

export function parseHeader(data: Buffer): SlabHeader {
  if (data.length < HEADER_LEN) {
    throw new Error(`Slab data too short for header: ${data.length} < ${HEADER_LEN}`);
  }
  const magic = data.readBigUInt64LE(0);
  if (magic !== MAGIC) {
    throw new Error(`Invalid slab magic: expected ${MAGIC.toString(16)}, got ${magic.toString(16)}`);
  }
  return {
    magic,
    version: data.readUInt32LE(8),
    bump: data.readUInt8(12),
    flags: data.readUInt8(13),
    admin: new PublicKey(data.subarray(16, 48)),
    nonce: data.readBigUInt64LE(RESERVED_OFF),
    matCounter: data.readBigUInt64LE(RESERVED_OFF + 8),
    insuranceAuthority: new PublicKey(data.subarray(72, 104)),
    insuranceOperator: new PublicKey(data.subarray(104, 136)),
  };
}

export function parseConfig(data: Buffer): MarketConfig {
  const minLen = CONFIG_OFFSET + CONFIG_LEN;
  if (data.length < minLen) throw new Error(`Slab data too short for config: ${data.length} < ${minLen}`);

  let off = CONFIG_OFFSET;

  const collateralMint = new PublicKey(data.subarray(off, off + 32));        off += 32;
  const vaultPubkey = new PublicKey(data.subarray(off, off + 32));            off += 32;
  const indexFeedId = new PublicKey(data.subarray(off, off + 32));            off += 32;
  const maxStalenessSecs = data.readBigUInt64LE(off);                        off += 8;
  const confFilterBps = data.readUInt16LE(off);                               off += 2;
  const vaultAuthorityBump = data.readUInt8(off);                             off += 1;
  const invert = data.readUInt8(off);                                         off += 1;
  const unitScale = data.readUInt32LE(off);                                   off += 4;
  const fundingHorizonSlots = data.readBigUInt64LE(off);                      off += 8;
  const fundingKBps = data.readBigUInt64LE(off);                              off += 8;
  const fundingMaxPremiumBps = data.readBigInt64LE(off);                      off += 8;
  const fundingMaxE9PerSlot = data.readBigInt64LE(off);                      off += 8;
  const hyperpAuthority = new PublicKey(data.subarray(off, off + 32));        off += 32;
  const hyperpMarkE6 = data.readBigUInt64LE(off);                             off += 8;
  const lastOraclePublishTime = data.readBigInt64LE(off);                     off += 8;
  const oraclePriceCapE2bps = data.readBigUInt64LE(off);                      off += 8;
  const lastEffectivePriceE6 = data.readBigUInt64LE(off);                     off += 8;
  const minOraclePriceCapE2bps = data.readBigUInt64LE(off);                   off += 8;
  const insuranceWithdrawMaxBps = data.readUInt16LE(off);                     off += 2;
  const tvlInsuranceCapMult = data.readUInt16LE(off);                        off += 2;
  off += 4;
  const insuranceWithdrawCooldownSlots = data.readBigUInt64LE(off);           off += 8;
  off += 16;
  const lastHyperpIndexSlot = data.readBigUInt64LE(off);                    off += 8;
  off += 16;
  const lastInsuranceWithdrawSlot = data.readBigUInt64LE(off);               off += 8;
  off += 8;
  const markEwmaE6 = data.readBigUInt64LE(off);                              off += 8;
  const markEwmaLastSlot = data.readBigUInt64LE(off);                        off += 8;
  const markEwmaHalflifeSlots = data.readBigUInt64LE(off);                    off += 8;
  const initRestartSlot = data.readBigUInt64LE(off);                         off += 8;
  const permissionlessResolveStaleSlots = data.readBigUInt64LE(off);         off += 8;
  const lastGoodOracleSlot = data.readBigUInt64LE(off);                     off += 8;
  off += 16;
  const feeSweepCursorWord = data.readBigUInt64LE(off);                      off += 8;
  const feeSweepCursorBit = data.readBigUInt64LE(off);                       off += 8;
  const markMinFee = data.readBigUInt64LE(off);                               off += 8;
  const forceCloseDelaySlots = data.readBigUInt64LE(off);                    off += 8;
  off += 16;

  return {
    collateralMint, vaultPubkey, indexFeedId,
    maxStalenessSecs, confFilterBps, vaultAuthorityBump, invert, unitScale,
    fundingHorizonSlots, fundingKBps, fundingMaxPremiumBps, fundingMaxE9PerSlot,
    hyperpAuthority, hyperpMarkE6, lastOraclePublishTime,
    oraclePriceCapE2bps, lastEffectivePriceE6, minOraclePriceCapE2bps,
    insuranceWithdrawMaxBps, tvlInsuranceCapMult, insuranceWithdrawCooldownSlots,
    lastHyperpIndexSlot, lastMarkPushSlot, lastInsuranceWithdrawSlot,
    markEwmaE6, markEwmaLastSlot, markEwmaHalflifeSlots, initRestartSlot,
    permissionlessResolveStaleSlots, lastGoodOracleSlot,
    maintenanceFeePerSlot: 0n, feeSweepCursorWord, feeSweepCursorBit,
    markMinFee, forceCloseDelaySlots, newAccountFee: 0n,
  };
}

function readU128LE(buf: Buffer, offset: number): bigint {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  return (hi << 64n) | lo;
}

export function parseEngine(data: Buffer): EngineState {
  if (data.length < ENGINE_OFF + 320) {
    throw new Error(`Slab data too short for engine: ${data.length}`);
  }
  
  return {
    vault: readU128LE(data, ENGINE_OFF),
    insuranceFundBalance: readU128LE(data, ENGINE_OFF + 16),
    currentSlot: data.readBigUInt64LE(ENGINE_OFF + 200),
    lastCrankSlot: data.readBigUInt64LE(ENGINE_OFF + 312),
    lastOraclePrice: data.readBigUInt64LE(ENGINE_OFF + 608),
    numUsedAccounts: data.readUInt16LE(ENGINE_OFF + 592),
  };
}

export function readNonce(data: Buffer): bigint {
  if (data.length < RESERVED_OFF + 8) throw new Error("Slab data too short for nonce");
  return data.readBigUInt64LE(RESERVED_OFF);
}

// Account Layout (360 bytes)
const ACCT_CAPITAL_OFF = 0;
const ACCT_KIND_OFF = 16;
const ACCT_PNL_OFF = 24;
const ACCT_MATCHER_PROGRAM_OFF = 128;
const ACCT_MATCHER_CONTEXT_OFF = 160;
const ACCT_OWNER_OFF = 192;

export enum AccountKind { User = 0, LP = 1 }

export interface Account {
  kind: AccountKind;
  capital: bigint;
  pnl: bigint;
  reservedPnl: bigint;
  positionBasisQ: bigint;
  adlABasis: bigint;
  adlKSnap: bigint;
  fSnap: bigint;
  adlEpochSnap: bigint;
  matcherProgram: PublicKey;
  matcherContext: PublicKey;
  owner: PublicKey;
  feeCredits: bigint;
  lastFeeSlot: bigint;
  schedPresent: number;
  schedRemainingQ: bigint;
  schedAnchorQ: bigint;
  schedStartSlot: bigint;
  schedHorizon: bigint;
  schedReleaseQ: bigint;
  pendingPresent: number;
  pendingRemainingQ: bigint;
  pendingHorizon: bigint;
  pendingCreatedSlot: bigint;
}

function computeLayout(maxAccounts: number) {
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const usedOff = ENGINE_OFF + 696;
  const bitmapBytes = bitmapWords * 8;
  const numUsedOff = usedOff + bitmapBytes;
  const freeHeadOff = numUsedOff + 2;
  const nextFreeOff = freeHeadOff + 2;
  const prevFreeOff = nextFreeOff + maxAccounts * 2;
  const afterPrev = prevFreeOff + maxAccounts * 2;
  const accountsOff = (afterPrev + 7) & ~7;
  return { maxAccounts, bitmapWords, accountsOff, accountSize: ACCOUNT_SIZE };
}

export function layoutForDataLength(dataLen: number) {
  for (const cap of [64, 256, 1024, 4096]) {
    const l = computeLayout(cap);
    const slabLen = ENGINE_OFF + l.accountsOff + cap * ACCOUNT_SIZE + 160 + cap * 8;
    if (slabLen === dataLen) return l;
  }
  return computeLayout(4096);
}

function readI128LE(buf: Buffer, offset: number): bigint {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  const u = (hi << 64n) | lo;
  const SIGN = 1n << 127n;
  return u >= SIGN ? u - (1n << 128n) : u;
}

export function parseAccount(data: Buffer, idx: number): Account {
  const layout = layoutForDataLength(data.length);
  if (idx < 0 || idx >= layout.maxAccounts) {
    throw new Error(`Account index out of range: ${idx}`);
  }
  const base = ENGINE_OFF + layout.accountsOff + idx * ACCOUNT_SIZE;
  if (data.length < base + ACCOUNT_SIZE) throw new Error("Slab data too short for account");
  const kindByte = data.readUInt8(base + ACCT_KIND_OFF);
  return {
    kind: kindByte === 1 ? AccountKind.LP : AccountKind.User,
    capital: readU128LE(data, base + ACCT_CAPITAL_OFF),
    pnl: readI128LE(data, base + ACCT_PNL_OFF),
    reservedPnl: 0n,
    positionBasisQ: 0n,
    adlABasis: 0n,
    adlKSnap: 0n,
    fSnap: 0n,
    adlEpochSnap: 0n,
    matcherProgram: new PublicKey(data.subarray(base + ACCT_MATCHER_PROGRAM_OFF, base + ACCT_MATCHER_PROGRAM_OFF + 32)),
    matcherContext: new PublicKey(data.subarray(base + ACCT_MATCHER_CONTEXT_OFF, base + ACCT_MATCHER_CONTEXT_OFF + 32)),
    owner: new PublicKey(data.subarray(base + ACCT_OWNER_OFF, base + ACCT_OWNER_OFF + 32)),
    feeCredits: 0n,
    lastFeeSlot: 0n,
    schedPresent: 0,
    schedRemainingQ: 0n,
    schedAnchorQ: 0n,
    schedStartSlot: 0n,
    schedHorizon: 0n,
    schedReleaseQ: 0n,
    pendingPresent: 0,
    pendingRemainingQ: 0n,
    pendingHorizon: 0n,
    pendingCreatedSlot: 0n,
  };
}

export function parseUsedIndices(data: Buffer): number[] {
  const layout = layoutForDataLength(data.length);
  const base = ENGINE_OFF + 696;
  if (data.length < base + layout.bitmapWords * 8) return [];
  const used: number[] = [];
  for (let word = 0; word < layout.bitmapWords; word++) {
    const bits = data.readBigUInt64LE(base + word * 8);
    if (bits === 0n) continue;
    for (let bit = 0; bit < 64; bit++) {
      if ((bits >> BigInt(bit)) & 1n) used.push(word * 64 + bit);
    }
  }
  return used;
}

export function parseAllAccounts(data: Buffer): { idx: number; account: Account }[] {
  const indices = parseUsedIndices(data);
  return indices.map(idx => ({ idx, account: parseAccount(data, idx) }));
}
