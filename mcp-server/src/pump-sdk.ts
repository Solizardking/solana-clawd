import { createRequire } from "node:module";
import type * as PumpSdkTypes from "@nirholas/pump-sdk";

const require = createRequire(import.meta.url);
const pumpSdk = require("@nirholas/pump-sdk") as typeof PumpSdkTypes;

export const {
  OnlinePumpSdk,
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  MAX_SHAREHOLDERS,
  bondingCurveMarketCap,
  calculateFeeTier,
  canonicalPumpPoolPda,
  computeFeesBps,
  createFallbackConnection,
  feeSharingConfigPda,
  getBondingCurveSummary,
  getBuySolAmountFromTokenAmount,
  getBuyTokenAmountFromSolAmount,
  getFee,
  getGraduationProgress,
  getSellSolAmountFromTokenAmount,
  getTokenPrice,
  newBondingCurve,
  parseEndpoints,
} = pumpSdk;

export type OnlinePumpSdkInstance = PumpSdkTypes.OnlinePumpSdk;
