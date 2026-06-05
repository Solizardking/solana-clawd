/**
 * ABI Instruction Encoding
 * 
 * Binary encoding for Percolator program instructions.
 * 
 * @module abi/instructions
 */

import { PublicKey } from "@solana/web3.js";
import {
  encU8,
  encU16,
  encU32,
  encU64,
  encI64,
  encU128,
  encI128,
  encPubkey,
} from "./encode.js";

/**
 * Instruction tags
 */
export const IX_TAG = {
  InitMarket: 0,
  InitUser: 1,
  InitLP: 2,
  DepositCollateral: 3,
  WithdrawCollateral: 4,
  KeeperCrank: 5,
  TradeNoCpi: 6,
  LiquidateAtOracle: 7,
  CloseAccount: 8,
  TopUpInsurance: 9,
  TradeCpi: 10,
  CloseSlab: 13,
  UpdateConfig: 14,
  WithdrawInsuranceLimited: 23,
  PushOraclePrice: 17,
  SetOraclePriceCap: 18,
  ResolveMarket: 19,
  WithdrawInsurance: 20,
  AdminForceCloseAccount: 21,
  ReclaimEmptyAccount: 25,
  SettleAccount: 26,
  DepositFeeCredits: 27,
  ConvertReleasedPnl: 28,
  ResolvePermissionless: 29,
  ForceCloseResolved: 30,
  CatchupAccrue: 31,
  UpdateAuthority: 32,
} as const;

/**
 * Authority kinds for UpdateAuthority (tag 32)
 */
export const AUTHORITY_KIND = {
  ADMIN: 0,
  HYPERP_MARK: 1,
  INSURANCE: 2,
  INSURANCE_OPERATOR: 4,
  ORACLE: 1,
  CLOSE: 0,
} as const;

// InitUser
export interface InitUserArgs { feePayment: bigint | string; }
export function encodeInitUser(args: InitUserArgs): Buffer {
  return Buffer.concat([encU8(IX_TAG.InitUser), encU64(args.feePayment)]);
}

// InitLP
export interface InitLPArgs {
  matcherProgram: PublicKey | string;
  matcherContext: PublicKey | string;
  feePayment: bigint | string;
}
export function encodeInitLP(args: InitLPArgs): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.InitLP),
    encPubkey(args.matcherProgram),
    encPubkey(args.matcherContext),
    encU64(args.feePayment),
  ]);
}

// DepositCollateral
export interface DepositCollateralArgs { userIdx: number; amount: bigint | string; }
export function encodeDepositCollateral(args: DepositCollateralArgs): Buffer {
  return Buffer.concat([encU8(IX_TAG.DepositCollateral), encU16(args.userIdx), encU64(args.amount)]);
}

// WithdrawCollateral
export interface WithdrawCollateralArgs { userIdx: number; amount: bigint | string; }
export function encodeWithdrawCollateral(args: WithdrawCollateralArgs): Buffer {
  return Buffer.concat([encU8(IX_TAG.WithdrawCollateral), encU16(args.userIdx), encU64(args.amount)]);
}

// KeeperCrank
export interface KeeperCrankArgs { callerIdx: number; candidates?: number[]; }
export function encodeKeeperCrank(args: KeeperCrankArgs): Buffer {
  const parts: Buffer[] = [
    encU8(IX_TAG.KeeperCrank),
    encU16(args.callerIdx),
    encU8(1), // format_version=1
  ];
  for (const c of args.candidates ?? []) {
    parts.push(encU16(c));
    parts.push(encU8(0xFF));
  }
  return Buffer.concat(parts);
}

// Trade
export interface TradeNoCpiArgs { lpIdx: number; userIdx: number; size: bigint | string; }
export function encodeTradeNoCpi(args: TradeNoCpiArgs): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.TradeNoCpi),
    encU16(args.lpIdx),
    encU16(args.userIdx),
    encI128(args.size),
  ]);
}

export interface TradeCpiArgs {
  lpIdx: number;
  userIdx: number;
  size: bigint | string;
  limitPriceE6?: bigint | string;
}
export function encodeTradeCpi(args: TradeCpiArgs): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.TradeCpi),
    encU16(args.lpIdx),
    encU16(args.userIdx),
    encI128(args.size),
    encU64(args.limitPriceE6 ?? "0"),
  ]);
}

// LiquidateAtOracle
export interface LiquidateAtOracleArgs { targetIdx: number; }
export function encodeLiquidateAtOracle(args: LiquidateAtOracleArgs): Buffer {
  return Buffer.concat([encU8(IX_TAG.LiquidateAtOracle), encU16(args.targetIdx)]);
}

// CloseAccount
export interface CloseAccountArgs { userIdx: number; }
export function encodeCloseAccount(args: CloseAccountArgs): Buffer {
  return Buffer.concat([encU8(IX_TAG.CloseAccount), encU16(args.userIdx)]);
}

// Insurance
export interface TopUpInsuranceArgs { amount: bigint | string; }
export function encodeTopUpInsurance(args: TopUpInsuranceArgs): Buffer {
  return Buffer.concat([encU8(IX_TAG.TopUpInsurance), encU64(args.amount)]);
}

export function encodeWithdrawInsurance(): Buffer {
  return encU8(IX_TAG.WithdrawInsurance);
}

export function encodeWithdrawInsuranceLimited(args: { amount: bigint | string }): Buffer {
  return Buffer.concat([encU8(IX_TAG.WithdrawInsuranceLimited), encU64(args.amount)]);
}

// Slab lifecycle
export function encodeCloseSlab(): Buffer {
  return encU8(IX_TAG.CloseSlab);
}

// UpdateConfig
export interface UpdateConfigArgs {
  fundingHorizonSlots: bigint | string;
  fundingKBps: bigint | string;
  fundingMaxPremiumBps: bigint | string;
  fundingMaxE9PerSlot: bigint | string;
  tvlInsuranceCapMult: number;
}
export function encodeUpdateConfig(args: UpdateConfigArgs): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.UpdateConfig),
    encU64(args.fundingHorizonSlots),
    encU64(args.fundingKBps),
    encI64(args.fundingMaxPremiumBps),
    encI64(args.fundingMaxE9PerSlot),
    encU16(args.tvlInsuranceCapMult),
  ]);
}

// Oracle
export interface PushOraclePriceArgs { priceE6: bigint | string; timestamp: bigint | string; }
export function encodePushOraclePrice(args: PushOraclePriceArgs): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.PushOraclePrice),
    encU64(args.priceE6),
    encI64(args.timestamp),
  ]);
}

// Resolve
export function encodeResolveMarket(): Buffer {
  return encU8(IX_TAG.ResolveMarket);
}

// Authority management
export interface UpdateAuthorityArgs {
  kind: number;
  newPubkey: PublicKey | string;
}
export function encodeUpdateAuthority(args: UpdateAuthorityArgs): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.UpdateAuthority),
    encU8(args.kind),
    encPubkey(args.newPubkey),
  ]);
}

export function encodeSetOracleAuthority(args: { newAuthority: PublicKey | string }): Buffer {
  return encodeUpdateAuthority({ kind: AUTHORITY_KIND.ORACLE, newPubkey: args.newAuthority });
}

export function encodeUpdateAdmin(args: { newAdmin: PublicKey | string }): Buffer {
  return encodeUpdateAuthority({ kind: AUTHORITY_KIND.ADMIN, newPubkey: args.newAdmin });
}
