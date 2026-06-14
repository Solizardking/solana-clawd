import BN from 'bn.js';
import { createRequire } from 'node:module';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { sendOptimizedRawTransaction } from '../helius/transactionOptimization';
import type * as PumpSdkTypes from '@pump-fun/pump-sdk';
import type * as PumpSwapSdkTypes from '@pump-fun/pump-swap-sdk';
import type { BondingCurve, Global } from '@pump-fun/pump-sdk';

const require = createRequire(import.meta.url);
const pumpSdkModule = require('@pump-fun/pump-sdk') as typeof PumpSdkTypes;
const pumpSwapSdkModule = require('@pump-fun/pump-swap-sdk') as typeof PumpSwapSdkTypes;

const {
  OnlinePumpSdk,
  PUMP_SDK,
  bondingCurvePda,
  canonicalPumpPoolPdaWithQuote,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  isLegacyQuoteMint,
} = pumpSdkModule as typeof PumpSdkTypes;

const {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  buyQuoteInput: estimatePumpAmmBuyQuoteInput,
  sellBaseInput: estimatePumpAmmSellBaseInput,
} = pumpSwapSdkModule as typeof PumpSwapSdkTypes;

const SOL_MINT = NATIVE_MINT.toBase58();

export type PumpRoute = 'pump-v2-bonding' | 'pumpswap-canonical';

export interface PumpExecutionResult {
  ok: boolean;
  route?: PumpRoute;
  error?: string;
  terminal?: boolean;
  txSignature?: string;
  inAmount?: number;
  outAmount?: number;
}

function slippagePercent(slippageBps: number) {
  return Math.max(slippageBps, 0) / 100;
}

function addSlippage(raw: BN, slippageBps: number) {
  return raw.add(raw.mul(new BN(Math.max(slippageBps, 0))).div(new BN(10_000)));
}

function subSlippage(raw: BN, slippageBps: number) {
  return raw.sub(raw.mul(new BN(Math.max(slippageBps, 0))).div(new BN(10_000)));
}

function rawBn(amountRaw: number) {
  return new BN(String(Math.max(0, Math.floor(amountRaw))));
}

async function mintOwner(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`mint account not found: ${mint.toBase58()}`);
  return info.owner;
}

async function mintSupply(connection: Connection, mint: PublicKey): Promise<{ amount: BN; decimals: number } | null> {
  try {
    const supply = await connection.getTokenSupply(mint);
    return { amount: new BN(supply.value.amount), decimals: supply.value.decimals };
  } catch {
    return null;
  }
}

async function sendInstructions(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 160_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
      ...instructions,
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  const { signature } = await sendOptimizedRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 2,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

function chooseFeeRecipient(global: Global, curve: BondingCurve) {
  const recipients = curve.isMayhemMode
    ? [global.reservedFeeRecipient, ...(global.reservedFeeRecipients ?? [])]
    : [global.feeRecipient, ...(global.feeRecipients ?? [])];
  const valid = recipients.filter((key) => key && !key.equals(PublicKey.default));
  return valid[Math.floor(Math.random() * valid.length)] ?? global.feeRecipient;
}

function chooseBuybackFeeRecipient(global: Global) {
  const recipients = (global.buybackFeeRecipients ?? []).filter((key) => key && !key.equals(PublicKey.default));
  return recipients[Math.floor(Math.random() * recipients.length)];
}

async function quoteTokenProgram(connection: Connection, quoteMint: PublicKey) {
  if (quoteMint.equals(NATIVE_MINT)) return TOKEN_PROGRAM_ID;
  return mintOwner(connection, quoteMint);
}

async function tryPumpBondingSwap(opts: {
  connection: Connection;
  payer: Keypair;
  inputMint: string;
  outputMint: string;
  amountRaw: number;
  slippageBps: number;
}): Promise<PumpExecutionResult | null> {
  const input = new PublicKey(opts.inputMint);
  const output = new PublicKey(opts.outputMint);
  let isBuy = input.equals(NATIVE_MINT);
  let mint = isBuy ? output : input;
  let curveInfo = await opts.connection.getAccountInfo(bondingCurvePda(mint));

  if (!curveInfo && !input.equals(NATIVE_MINT) && !output.equals(NATIVE_MINT)) {
    const outputCurveInfo = await opts.connection.getAccountInfo(bondingCurvePda(output));
    if (outputCurveInfo) {
      isBuy = true;
      mint = output;
      curveInfo = outputCurveInfo;
    } else {
      const inputCurveInfo = await opts.connection.getAccountInfo(bondingCurvePda(input));
      if (inputCurveInfo) {
        isBuy = false;
        mint = input;
        curveInfo = inputCurveInfo;
      }
    }
  }

  if (!curveInfo) return null;

  const pump = new OnlinePumpSdk(opts.connection);
  const [global, feeConfig, tokenProgram, supply] = await Promise.all([
    pump.fetchGlobal(),
    pump.fetchFeeConfig().catch(() => null),
    mintOwner(opts.connection, mint),
    mintSupply(opts.connection, mint),
  ]);
  const curve = PUMP_SDK.decodeBondingCurve(curveInfo);
  if (curve.complete || curve.realTokenReserves.isZero() || curve.virtualTokenReserves.isZero()) {
    return null;
  }

  const quoteMint = isLegacyQuoteMint(curve.quoteMint) ? NATIVE_MINT : curve.quoteMint;
  const [quoteProgram, quoteSupply] = await Promise.all([
    quoteTokenProgram(opts.connection, quoteMint),
    quoteMint.equals(NATIVE_MINT) ? Promise.resolve(null) : mintSupply(opts.connection, quoteMint),
  ]);
  const quoteDecimals = quoteMint.equals(NATIVE_MINT) ? 9 : quoteSupply?.decimals ?? 6;
  const feeRecipient = chooseFeeRecipient(global, curve);
  const buybackFeeRecipient = chooseBuybackFeeRecipient(global);
  if (!buybackFeeRecipient) {
    return { ok: false, terminal: true, route: 'pump-v2-bonding', error: 'Pump global has no buyback fee recipients' };
  }

  if (isBuy) {
    if (!quoteMint.equals(input)) return null;

    const quoteAmount = rawBn(opts.amountRaw);
    const tokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: supply?.amount ?? curve.tokenTotalSupply,
      bondingCurve: curve,
      amount: quoteAmount,
      quoteMint,
    } as any);
    if (tokenAmount.lte(new BN(0))) return null;

    const associatedUser = getAssociatedTokenAddressSync(mint, opts.payer.publicKey, true, tokenProgram);
    const ix = await PUMP_SDK.getBuyV2InstructionRaw({
      user: opts.payer.publicKey,
      mint,
      creator: curve.creator,
      amount: tokenAmount,
      quoteAmount: addSlippage(quoteAmount, opts.slippageBps),
      tokenProgram,
      quoteMint,
      quoteTokenProgram: quoteProgram,
      feeRecipient,
      buybackFeeRecipient,
    });

    const signature = await sendInstructions(opts.connection, opts.payer, [
      createAssociatedTokenAccountIdempotentInstruction(
        opts.payer.publicKey,
        associatedUser,
        opts.payer.publicKey,
        mint,
        tokenProgram,
      ),
      ix,
    ]);

    return {
      ok: true,
      route: 'pump-v2-bonding',
      txSignature: signature,
      inAmount: Number(quoteAmount.toString()) / 10 ** quoteDecimals,
      outAmount: Number(tokenAmount.toString()) / 10 ** (supply?.decimals ?? 6),
    };
  }

  if (!quoteMint.equals(output)) return null;

  const tokenAmount = rawBn(opts.amountRaw);
  const quoteOut = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: supply?.amount ?? curve.tokenTotalSupply,
    bondingCurve: curve,
    amount: tokenAmount,
  });
  if (quoteOut.lte(new BN(0))) return null;

  const ix = await PUMP_SDK.getSellV2InstructionRaw({
    user: opts.payer.publicKey,
    mint,
    creator: curve.creator,
    amount: tokenAmount,
    quoteAmount: subSlippage(quoteOut, opts.slippageBps),
    tokenProgram,
    quoteMint,
    quoteTokenProgram: quoteProgram,
    feeRecipient,
    buybackFeeRecipient,
  });

  const signature = await sendInstructions(opts.connection, opts.payer, [ix]);
  return {
    ok: true,
    route: 'pump-v2-bonding',
    txSignature: signature,
    inAmount: Number(tokenAmount.toString()) / 10 ** (supply?.decimals ?? 6),
    outAmount: Number(quoteOut.toString()) / 10 ** quoteDecimals,
  };
}

async function tryPumpSwap(opts: {
  connection: Connection;
  payer: Keypair;
  inputMint: string;
  outputMint: string;
  amountRaw: number;
  slippageBps: number;
}): Promise<PumpExecutionResult | null> {
  const input = new PublicKey(opts.inputMint);
  const output = new PublicKey(opts.outputMint);
  const isBuy = input.equals(NATIVE_MINT);
  const baseMint = isBuy ? output : input;
  const quoteMint = isBuy ? input : output;
  if (!quoteMint.equals(NATIVE_MINT)) return null;

  const pool = canonicalPumpPoolPdaWithQuote(baseMint, quoteMint);
  const poolInfo = await opts.connection.getAccountInfo(pool);
  if (!poolInfo) return null;

  const online = new OnlinePumpAmmSdk(opts.connection);
  const state = await online.swapSolanaState(pool, opts.payer.publicKey);
  const raw = rawBn(opts.amountRaw);
  const slippage = slippagePercent(opts.slippageBps);
  const { coinCreator, creator } = state.pool;
  let instructions: TransactionInstruction[];
  let inAmount: number | undefined;
  let outAmount: number | undefined;

  if (isBuy) {
    const estimate = estimatePumpAmmBuyQuoteInput({
      quote: raw,
      slippage,
      baseReserve: state.poolBaseAmount,
      quoteReserve: state.poolQuoteAmount,
      globalConfig: state.globalConfig,
      baseMintAccount: state.baseMintAccount,
      baseMint: state.baseMint,
      coinCreator,
      creator,
      feeConfig: state.feeConfig,
    });
    instructions = await PUMP_AMM_SDK.buyQuoteInput(state, raw, slippage);
    inAmount = Number(raw.toString()) / 1e9;
    outAmount = Number(estimate.base.toString()) / 10 ** state.baseMintAccount.decimals;
  } else {
    const estimate = estimatePumpAmmSellBaseInput({
      base: raw,
      slippage,
      baseReserve: state.poolBaseAmount,
      quoteReserve: state.poolQuoteAmount,
      globalConfig: state.globalConfig,
      baseMintAccount: state.baseMintAccount,
      baseMint: state.baseMint,
      coinCreator,
      creator,
      feeConfig: state.feeConfig,
    });
    instructions = await PUMP_AMM_SDK.sellBaseInput(state, raw, slippage);
    inAmount = Number(raw.toString()) / 10 ** state.baseMintAccount.decimals;
    outAmount = Number(estimate.uiQuote.toString()) / 1e9;
  }

  const signature = await sendInstructions(opts.connection, opts.payer, instructions);
  return {
    ok: true,
    route: 'pumpswap-canonical',
    txSignature: signature,
    inAmount,
    outAmount,
  };
}

export async function executePumpRoute(opts: {
  connection: Connection;
  payer: Keypair;
  inputMint: string;
  outputMint: string;
  amountRaw: number;
  slippageBps: number;
}): Promise<PumpExecutionResult | null> {
  try {
    const bonding = await tryPumpBondingSwap(opts);
    if (bonding) return bonding;
  } catch (error) {
    return {
      ok: false,
      terminal: true,
      route: 'pump-v2-bonding',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    return await tryPumpSwap(opts);
  } catch (error) {
    return {
      ok: false,
      terminal: true,
      route: 'pumpswap-canonical',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { SOL_MINT };
