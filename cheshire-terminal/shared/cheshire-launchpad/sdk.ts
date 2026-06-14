import BN from "bn.js";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  AGENT_PROFILE_SEED,
  CHESHIRE_CONFIG_SEED,
  CHESHIRE_LAUNCHPAD_PROGRAM_ID,
  LAUNCH_RECORD_SEED,
} from "./idl";

export type PublicKeyLike = PublicKey | string;
export type LaunchpadAmount = BN | bigint | number | string;

export enum LaunchKind {
  Pump = 0,
  MeteoraDynamicBondingCurve = 1,
  JupiterRfq = 2,
  External = 3,
  AgentToken = 4,
  PToken = 5,
}

export enum CurveRoute {
  PumpSynthetic = 0,
  MeteoraDynamicBondingCurve = 1,
  ConstantProduct = 2,
  Linear = 3,
  External = 4,
}

export enum AmmRoute {
  PumpSwap = 0,
  MeteoraDammV2 = 1,
  RaydiumCpmm = 2,
  Jupiter = 3,
  External = 4,
}

export enum FeeRoute {
  ProtocolOnly = 0,
  ProtocolCreator = 1,
  ProtocolCreatorAgent = 2,
  ProtocolCreatorAgentReferral = 3,
  External = 4,
}

export enum LaunchPhase {
  Created = 0,
  Live = 1,
  Graduated = 2,
  Migrated = 3,
  Cancelled = 4,
}

export const LAUNCHPAD_ACCOUNT_SIZES = {
  launchpadConfig: 8 + 32 + 32 + 2 + 8 + 10 + 1 + 1,
  agentProfile: 8 + 32 + 32 + 1 + 32 + 4 + 64 + 4 + 240 + 8 + 1,
  launchRecord: 8 + 32 + 32 + 1 + 32 + 1 + 32 + 1 + 32 + 32 + 1 + 1 + 1 + 1 + 1 + 10 + 48 + 8 + 1 + 8 + 1,
  programAccount: 36,
  upgradeableProgramDataOverhead: 45,
} as const;

export const MAINNET_PROGRAM_SIZE_ESTIMATES = {
  registryOnlyBytes: 260_000,
  registryWithCpiBytes: 520_000,
  largeRouterBytes: 850_000,
} as const;

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const DISCRIMINATORS = {
  initializeConfig: [208, 127, 21, 1, 194, 190, 196, 70],
  setConfig: [108, 158, 154, 175, 212, 98, 52, 66],
  setDefaultFeeProfile: [194, 179, 166, 202, 181, 107, 15, 0],
  createAgentProfile: [107, 90, 12, 230, 174, 51, 166, 91],
  launchToken: [10, 128, 86, 171, 3, 137, 161, 244],
  launchManagedToken: [170, 228, 253, 241, 236, 192, 189, 146],
  attachTokenToAgent: [200, 151, 165, 75, 114, 67, 212, 173],
  recordMigration: [193, 58, 44, 254, 11, 3, 78, 117],
  setLaunchPhase: [221, 159, 189, 106, 64, 26, 143, 80],
  setPause: [63, 32, 154, 2, 56, 103, 79, 45],
} as const;

export interface FeeProfile {
  protocolFeeBps: number;
  creatorFeeBps: number;
  agentFeeBps: number;
  referralFeeBps: number;
  migrationFeeBps: number;
}

export interface CurveSnapshot {
  initialVirtualTokenReserves: LaunchpadAmount;
  initialVirtualQuoteReserves: LaunchpadAmount;
  initialRealTokenReserves: LaunchpadAmount;
  tokenTotalSupply: LaunchpadAmount;
  migrationQuoteThreshold: LaunchpadAmount;
  migrationFeeLamports: LaunchpadAmount;
}

export const EMPTY_FEE_PROFILE: FeeProfile = {
  protocolFeeBps: 0,
  creatorFeeBps: 0,
  agentFeeBps: 0,
  referralFeeBps: 0,
  migrationFeeBps: 0,
};

export const EMPTY_CURVE_SNAPSHOT: CurveSnapshot = {
  initialVirtualTokenReserves: 0,
  initialVirtualQuoteReserves: 0,
  initialRealTokenReserves: 0,
  tokenTotalSupply: 0,
  migrationQuoteThreshold: 0,
  migrationFeeLamports: 0,
};

export const PUMP_STYLE_FEE_PROFILE: FeeProfile = {
  protocolFeeBps: 100,
  creatorFeeBps: 0,
  agentFeeBps: 0,
  referralFeeBps: 0,
  migrationFeeBps: 0,
};

export const CHESHIRE_AGENT_TOKEN_FEE_PROFILE: FeeProfile = {
  protocolFeeBps: 50,
  creatorFeeBps: 25,
  agentFeeBps: 25,
  referralFeeBps: 0,
  migrationFeeBps: 0,
};

export const CHESHIRE_P_TOKEN_FEE_PROFILE: FeeProfile = {
  protocolFeeBps: 50,
  creatorFeeBps: 25,
  agentFeeBps: 0,
  referralFeeBps: 25,
  migrationFeeBps: 0,
};

export const PUMP_STYLE_CURVE_SNAPSHOT: CurveSnapshot = {
  initialVirtualTokenReserves: "1073000000000000",
  initialVirtualQuoteReserves: "30000000000",
  initialRealTokenReserves: "793100000000000",
  tokenTotalSupply: "1000000000000000",
  migrationQuoteThreshold: "69000000000",
  migrationFeeLamports: "15000001",
};

export interface LaunchpadSdkOptions {
  programId?: PublicKeyLike;
}

export interface InitializeConfigArgs extends LaunchpadSdkOptions {
  admin: PublicKeyLike;
  treasury: PublicKeyLike;
  launchFeeBps: number;
  flatLaunchFeeLamports: LaunchpadAmount;
}

export interface SetConfigArgs extends InitializeConfigArgs {
  config?: PublicKeyLike;
}

export interface SetDefaultFeeProfileArgs extends LaunchpadSdkOptions {
  admin: PublicKeyLike;
  feeProfile: FeeProfile;
  config?: PublicKeyLike;
}

export interface CreateAgentProfileArgs extends LaunchpadSdkOptions {
  authority: PublicKeyLike;
  agentAsset: PublicKeyLike;
  name: string;
  registrationUri: string;
}

export interface LaunchTokenArgs extends LaunchpadSdkOptions {
  creator: PublicKeyLike;
  tokenMint: PublicKeyLike;
  launchKind: LaunchKind;
  name: string;
  symbol: string;
  metadataUri: string;
  config?: PublicKeyLike;
  launchRecord?: PublicKeyLike;
  agentProfile?: PublicKeyLike | null;
  curvePool?: PublicKeyLike | null;
}

export interface LaunchManagedTokenArgs extends LaunchTokenArgs {
  curveRoute: CurveRoute;
  ammRoute: AmmRoute;
  feeRoute: FeeRoute;
  quoteMint: PublicKeyLike;
  feeProfile: FeeProfile;
  curveSnapshot: CurveSnapshot;
}

export interface AttachTokenToAgentArgs extends LaunchpadSdkOptions {
  authority: PublicKeyLike;
  agentProfile: PublicKeyLike;
  launchRecord: PublicKeyLike;
  tokenMint: PublicKeyLike;
}

export interface RecordMigrationArgs extends LaunchpadSdkOptions {
  authority: PublicKeyLike;
  launchRecord: PublicKeyLike;
  migrationTarget: PublicKeyLike;
  migratedAt: LaunchpadAmount;
}

export interface SetLaunchPhaseArgs extends LaunchpadSdkOptions {
  authority: PublicKeyLike;
  launchRecord: PublicKeyLike;
  phase: LaunchPhase;
}

export interface SetPauseArgs extends LaunchpadSdkOptions {
  admin: PublicKeyLike;
  paused: boolean;
  config?: PublicKeyLike;
}

function publicKey(value: PublicKeyLike): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

export function getLaunchpadProgramId(value?: PublicKeyLike): PublicKey {
  return publicKey(value ?? CHESHIRE_LAUNCHPAD_PROGRAM_ID);
}

export function findLaunchpadConfigPda(programId?: PublicKeyLike): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CHESHIRE_CONFIG_SEED)],
    getLaunchpadProgramId(programId)
  );
}

export function findAgentProfilePda(
  authority: PublicKeyLike,
  agentAsset: PublicKeyLike,
  programId?: PublicKeyLike
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(AGENT_PROFILE_SEED), publicKey(authority).toBuffer(), publicKey(agentAsset).toBuffer()],
    getLaunchpadProgramId(programId)
  );
}

export function findLaunchRecordPda(
  tokenMint: PublicKeyLike,
  programId?: PublicKeyLike
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(LAUNCH_RECORD_SEED), publicKey(tokenMint).toBuffer()],
    getLaunchpadProgramId(programId)
  );
}

function encodeDiscriminator(bytes: readonly number[]): Buffer {
  return Buffer.from(bytes);
}

function encodeU16(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error("u16 value out of range");
  }
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function encodeU8(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("u8 value out of range");
  }
  return Buffer.from([value]);
}

function encodeBool(value: boolean): Buffer {
  return Buffer.from([value ? 1 : 0]);
}

function toBigIntAmount(value: LaunchpadAmount): bigint {
  if (BN.isBN(value)) return BigInt(value.toString());
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("amount must be a safe non-negative integer");
    return BigInt(value);
  }
  return BigInt(value);
}

function encodeIntLe(value: LaunchpadAmount, byteLength: number): Buffer {
  let remaining = toBigIntAmount(value);
  const max = 1n << BigInt(byteLength * 8);
  if (remaining < 0 || remaining >= max) throw new Error(`${byteLength * 8}-bit integer out of range`);

  const buffer = Buffer.alloc(byteLength);
  for (let i = 0; i < byteLength; i += 1) {
    buffer[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return buffer;
}

function encodeString(value: string, maxBytes: number, label: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function encodePubkey(value: PublicKeyLike): Buffer {
  return publicKey(value).toBuffer();
}

function encodeOptionPubkey(value?: PublicKeyLike | null): Buffer {
  if (!value) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), encodePubkey(value)]);
}

function encodeFeeProfile(profile: FeeProfile): Buffer {
  validateFeeProfile(profile);
  return Buffer.concat([
    encodeU16(profile.protocolFeeBps),
    encodeU16(profile.creatorFeeBps),
    encodeU16(profile.agentFeeBps),
    encodeU16(profile.referralFeeBps),
    encodeU16(profile.migrationFeeBps),
  ]);
}

function encodeCurveSnapshot(snapshot: CurveSnapshot): Buffer {
  return Buffer.concat([
    encodeIntLe(snapshot.initialVirtualTokenReserves, 8),
    encodeIntLe(snapshot.initialVirtualQuoteReserves, 8),
    encodeIntLe(snapshot.initialRealTokenReserves, 8),
    encodeIntLe(snapshot.tokenTotalSupply, 8),
    encodeIntLe(snapshot.migrationQuoteThreshold, 8),
    encodeIntLe(snapshot.migrationFeeLamports, 8),
  ]);
}

export function validateFeeProfile(profile: FeeProfile): void {
  const swapFeeBps =
    profile.protocolFeeBps +
    profile.creatorFeeBps +
    profile.agentFeeBps +
    profile.referralFeeBps;
  if (swapFeeBps > 10_000 || profile.migrationFeeBps > 10_000) {
    throw new Error("fee profile exceeds 10000 bps");
  }
}

export function buildInitializeConfigInstruction(args: InitializeConfigArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const [config] = findLaunchpadConfigPda(programId);
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.initializeConfig),
    encodePubkey(args.treasury),
    encodeU16(args.launchFeeBps),
    encodeIntLe(args.flatLaunchFeeLamports, 8),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.admin), isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildSetConfigInstruction(args: SetConfigArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const config = args.config ? publicKey(args.config) : findLaunchpadConfigPda(programId)[0];
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.setConfig),
    encodePubkey(args.treasury),
    encodeU16(args.launchFeeBps),
    encodeIntLe(args.flatLaunchFeeLamports, 8),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.admin), isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildSetDefaultFeeProfileInstruction(args: SetDefaultFeeProfileArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const config = args.config ? publicKey(args.config) : findLaunchpadConfigPda(programId)[0];
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.setDefaultFeeProfile),
    encodeFeeProfile(args.feeProfile),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.admin), isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildCreateAgentProfileInstruction(args: CreateAgentProfileArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const [agentProfile] = findAgentProfilePda(args.authority, args.agentAsset, programId);
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.createAgentProfile),
    encodeString(args.name, 64, "agent profile name"),
    encodeString(args.registrationUri, 240, "agent registration URI"),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.authority), isSigner: true, isWritable: true },
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: publicKey(args.agentAsset), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildLaunchTokenInstruction(args: LaunchTokenArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const config = args.config ? publicKey(args.config) : findLaunchpadConfigPda(programId)[0];
  const launchRecord = args.launchRecord ? publicKey(args.launchRecord) : findLaunchRecordPda(args.tokenMint, programId)[0];
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.launchToken),
    encodeU8(args.launchKind),
    encodeString(args.name, 64, "token name"),
    encodeString(args.symbol, 16, "token symbol"),
    encodeString(args.metadataUri, 240, "token metadata URI"),
    encodeOptionPubkey(args.agentProfile),
    encodeOptionPubkey(args.curvePool),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.creator), isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: launchRecord, isSigner: false, isWritable: true },
      { pubkey: publicKey(args.tokenMint), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildLaunchManagedTokenInstruction(args: LaunchManagedTokenArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const config = args.config ? publicKey(args.config) : findLaunchpadConfigPda(programId)[0];
  const launchRecord = args.launchRecord ? publicKey(args.launchRecord) : findLaunchRecordPda(args.tokenMint, programId)[0];
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.launchManagedToken),
    encodeU8(args.launchKind),
    encodeU8(args.curveRoute),
    encodeU8(args.ammRoute),
    encodeU8(args.feeRoute),
    encodeString(args.name, 64, "token name"),
    encodeString(args.symbol, 16, "token symbol"),
    encodeString(args.metadataUri, 240, "token metadata URI"),
    encodeOptionPubkey(args.agentProfile),
    encodeOptionPubkey(args.curvePool),
    encodePubkey(args.quoteMint),
    encodeFeeProfile(args.feeProfile),
    encodeCurveSnapshot(args.curveSnapshot),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.creator), isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: launchRecord, isSigner: false, isWritable: true },
      { pubkey: publicKey(args.tokenMint), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildAttachTokenToAgentInstruction(args: AttachTokenToAgentArgs): TransactionInstruction {
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.attachTokenToAgent),
    encodePubkey(args.tokenMint),
  ]);

  return new TransactionInstruction({
    programId: getLaunchpadProgramId(args.programId),
    keys: [
      { pubkey: publicKey(args.authority), isSigner: true, isWritable: false },
      { pubkey: publicKey(args.agentProfile), isSigner: false, isWritable: true },
      { pubkey: publicKey(args.launchRecord), isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildRecordMigrationInstruction(args: RecordMigrationArgs): TransactionInstruction {
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.recordMigration),
    encodePubkey(args.migrationTarget),
    encodeIntLe(args.migratedAt, 8),
  ]);

  return new TransactionInstruction({
    programId: getLaunchpadProgramId(args.programId),
    keys: [
      { pubkey: publicKey(args.authority), isSigner: true, isWritable: false },
      { pubkey: publicKey(args.launchRecord), isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildSetLaunchPhaseInstruction(args: SetLaunchPhaseArgs): TransactionInstruction {
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.setLaunchPhase),
    encodeU8(args.phase),
  ]);

  return new TransactionInstruction({
    programId: getLaunchpadProgramId(args.programId),
    keys: [
      { pubkey: publicKey(args.authority), isSigner: true, isWritable: false },
      { pubkey: publicKey(args.launchRecord), isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildSetPauseInstruction(args: SetPauseArgs): TransactionInstruction {
  const programId = getLaunchpadProgramId(args.programId);
  const config = args.config ? publicKey(args.config) : findLaunchpadConfigPda(programId)[0];
  const data = Buffer.concat([
    encodeDiscriminator(DISCRIMINATORS.setPause),
    encodeBool(args.paused),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: publicKey(args.admin), isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function totalSwapFeeBps(profile: FeeProfile): number {
  validateFeeProfile(profile);
  return profile.protocolFeeBps + profile.creatorFeeBps + profile.agentFeeBps + profile.referralFeeBps;
}

export function applyBps(amount: LaunchpadAmount, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("bps out of range");
  return (toBigIntAmount(amount) * BigInt(bps)) / 10_000n;
}

export function quoteCurveBuyExactQuoteIn(
  snapshot: CurveSnapshot,
  quoteIn: LaunchpadAmount,
  feeProfile: FeeProfile = EMPTY_FEE_PROFILE
) {
  const quoteInRaw = toBigIntAmount(quoteIn);
  const fee = applyBps(quoteInRaw, totalSwapFeeBps(feeProfile));
  const quoteInAfterFee = quoteInRaw - fee;
  const tokenReserve = toBigIntAmount(snapshot.initialVirtualTokenReserves);
  const quoteReserve = toBigIntAmount(snapshot.initialVirtualQuoteReserves);
  if (tokenReserve <= 0n || quoteReserve <= 0n) throw new Error("curve reserves must be positive");

  const tokenOut = (tokenReserve * quoteInAfterFee) / (quoteReserve + quoteInAfterFee);
  return { quoteIn: quoteInRaw, fee, quoteInAfterFee, tokenOut };
}

export function quoteCurveSellExactTokenIn(
  snapshot: CurveSnapshot,
  tokenIn: LaunchpadAmount,
  feeProfile: FeeProfile = EMPTY_FEE_PROFILE
) {
  const tokenInRaw = toBigIntAmount(tokenIn);
  const tokenReserve = toBigIntAmount(snapshot.initialVirtualTokenReserves);
  const quoteReserve = toBigIntAmount(snapshot.initialVirtualQuoteReserves);
  if (tokenReserve <= 0n || quoteReserve <= 0n) throw new Error("curve reserves must be positive");

  const quoteOutBeforeFee = (quoteReserve * tokenInRaw) / (tokenReserve + tokenInRaw);
  const fee = applyBps(quoteOutBeforeFee, totalSwapFeeBps(feeProfile));
  return { tokenIn: tokenInRaw, quoteOutBeforeFee, fee, quoteOut: quoteOutBeforeFee - fee };
}

export async function estimateLaunchpadAccountRent(connection: Connection) {
  const [configRentLamports, agentProfileRentLamports, launchRecordRentLamports] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(LAUNCHPAD_ACCOUNT_SIZES.launchpadConfig),
    connection.getMinimumBalanceForRentExemption(LAUNCHPAD_ACCOUNT_SIZES.agentProfile),
    connection.getMinimumBalanceForRentExemption(LAUNCHPAD_ACCOUNT_SIZES.launchRecord),
  ]);

  return {
    config: {
      bytes: LAUNCHPAD_ACCOUNT_SIZES.launchpadConfig,
      lamports: configRentLamports,
      sol: lamportsToSol(configRentLamports),
    },
    agentProfile: {
      bytes: LAUNCHPAD_ACCOUNT_SIZES.agentProfile,
      lamports: agentProfileRentLamports,
      sol: lamportsToSol(agentProfileRentLamports),
    },
    launchRecord: {
      bytes: LAUNCHPAD_ACCOUNT_SIZES.launchRecord,
      lamports: launchRecordRentLamports,
      sol: lamportsToSol(launchRecordRentLamports),
    },
  };
}

export async function estimateProgramDeploymentRent(
  connection: Connection,
  programBytes: number,
  opts: { includeTemporaryBuffer?: boolean; txFeePaddingLamports?: number } = {}
) {
  if (!Number.isInteger(programBytes) || programBytes <= 0) {
    throw new Error("programBytes must be a positive integer");
  }

  const includeTemporaryBuffer = opts.includeTemporaryBuffer ?? true;
  const txFeePaddingLamports = opts.txFeePaddingLamports ?? Math.round(0.05 * LAMPORTS_PER_SOL);
  const programDataBytes = programBytes + LAUNCHPAD_ACCOUNT_SIZES.upgradeableProgramDataOverhead;

  const [programAccountRentLamports, programDataRentLamports, bufferRentLamports] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(LAUNCHPAD_ACCOUNT_SIZES.programAccount),
    connection.getMinimumBalanceForRentExemption(programDataBytes),
    includeTemporaryBuffer ? connection.getMinimumBalanceForRentExemption(programBytes) : Promise.resolve(0),
  ]);

  const totalLamports =
    programAccountRentLamports +
    programDataRentLamports +
    bufferRentLamports +
    txFeePaddingLamports;

  return {
    programBytes,
    programDataBytes,
    includeTemporaryBuffer,
    programAccountRentLamports,
    programDataRentLamports,
    bufferRentLamports,
    txFeePaddingLamports,
    totalLamports,
    totalSol: lamportsToSol(totalLamports),
  };
}
