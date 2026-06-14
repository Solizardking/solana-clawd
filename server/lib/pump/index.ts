import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { createRequire } from "node:module";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import type * as PumpSdkTypes from "@pump-fun/pump-sdk";
import {
  AmmRoute,
  CurveRoute,
  FeeRoute,
  LaunchKind,
  PUMP_STYLE_CURVE_SNAPSHOT,
  PUMP_STYLE_FEE_PROFILE,
} from "../../../shared/cheshire-launchpad/sdk";
import {
  appendLaunchpadRegistryInstruction,
  type LaunchpadRegistryAppendResult,
  type LaunchpadRegistryOptions,
} from "../launchpad/registry";
import {
  appendClawdAgentBindingInstruction,
  type ClawdAgentBindingAppendResult,
  type ClawdAgentBindingOptions,
} from "../launchpad/clawd-sdk";
import {
  PUMP_BUYBACK_FEE_RECIPIENTS,
  PUMP_NORMAL_FEE_RECIPIENTS,
  PUMP_RESERVED_FEE_RECIPIENTS,
} from "./constants";
import { sendOptimizedRawTransaction } from "../helius/transactionOptimization";

const require = createRequire(import.meta.url);
const {
  OnlinePumpSdk,
  PUMP_AMM_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
  bondingCurvePda,
} = require("@pump-fun/pump-sdk") as typeof PumpSdkTypes;

export {
  PUMP_BUYBACK_FEE_RECIPIENTS,
  PUMP_NORMAL_FEE_RECIPIENTS,
  PUMP_RESERVED_FEE_RECIPIENTS,
};

const MAX_PUMP_NAME_CHARS = 32;
const MAX_PUMP_SYMBOL_CHARS = 13;
const MAX_PUMP_URI_CHARS = 200;

export interface BuildPumpLaunchParams {
  name: string;
  symbol: string;
  uri: string;
  userWallet: string;
  creator?: string;
  mayhemMode?: boolean;
  cashback?: boolean;
  quoteMint?: string;
  launchRegistry?: LaunchpadRegistryOptions;
  clawdAgentBinding?: ClawdAgentBindingOptions;
  blockhash?: string;
}

export interface BuildPumpLaunchResult {
  transaction: string;
  transactions: string[];
  mintAddress: string;
  bondingCurveAddress: string;
  userWallet: string;
  creator: string;
  tokenProgram: string;
  quoteMint: string;
  quoteTokenProgram: string;
  pumpProgramId: string;
  pumpAmmProgramId: string;
  launchRegistry: LaunchpadRegistryAppendResult | null;
  clawdAgentBinding: ClawdAgentBindingAppendResult | null;
}

export interface BuildPumpTradeParams {
  side: "buy" | "sell";
  mint: string;
  userWallet: string;
  amount: string | number | bigint;
  quoteAmount: string | number | bigint;
  creator?: string;
  tokenProgram?: string;
  quoteMint?: string;
  quoteTokenProgram?: string;
  feeRecipient?: string;
  buybackFeeRecipient?: string;
  mayhemMode?: boolean;
  blockhash?: string;
}

export interface BuildPumpTradeResult {
  transaction: string;
  side: "buy" | "sell";
  mintAddress: string;
  bondingCurveAddress: string;
  userWallet: string;
  creator: string;
  amount: string;
  quoteAmount: string;
  tokenProgram: string;
  quoteMint: string;
  quoteTokenProgram: string;
  feeRecipient: string;
  buybackFeeRecipient: string;
  mayhemMode: boolean;
  pumpProgramId: string;
}

export function getPumpConnection(): Connection {
  const rpc =
    process.env.PUMP_SOLANA_RPC_URL ||
    process.env.PUMP_RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
    process.env.SOLANA_RPC_URL ||
    process.env.VITE_HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com";

  return new Connection(rpc, "confirmed");
}

export function normalizePumpSymbol(value: string): string {
  return value.trim().toUpperCase();
}

export function parsePumpU64(value: string | number | bigint, label: string, allowZero = false): BN {
  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? String(value)
        : value.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be an unsigned integer in base units`);
  }
  const amount = new BN(normalized, 10);
  if (!allowZero && amount.isZero()) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (amount.bitLength() > 64) {
    throw new Error(`${label} exceeds u64`);
  }
  return amount;
}

function validatePumpMetadata(name: string, symbol: string, uri: string) {
  if (!name.trim()) throw new Error("name is required");
  if (!symbol.trim()) throw new Error("symbol is required");
  if (!uri.trim()) throw new Error("uri is required");
  if (name.trim().length > MAX_PUMP_NAME_CHARS) {
    throw new Error(`name must be ${MAX_PUMP_NAME_CHARS} characters or fewer`);
  }
  if (symbol.trim().length > MAX_PUMP_SYMBOL_CHARS) {
    throw new Error(`symbol must be ${MAX_PUMP_SYMBOL_CHARS} characters or fewer`);
  }
  if (uri.trim().length > MAX_PUMP_URI_CHARS) {
    throw new Error(`uri must be ${MAX_PUMP_URI_CHARS} characters or fewer`);
  }
}

function seedIndex(seed: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % size;
  }
  return hash;
}

function selectFeeRecipient(args: {
  seed: string;
  mayhemMode: boolean;
  feeRecipient?: string;
  buybackFeeRecipient?: string;
}) {
  const feeRecipients = args.mayhemMode ? PUMP_RESERVED_FEE_RECIPIENTS : PUMP_NORMAL_FEE_RECIPIENTS;
  const feeSet = new Set<string>(feeRecipients);
  const buybackSet = new Set<string>(PUMP_BUYBACK_FEE_RECIPIENTS);

  const feeRecipient = args.feeRecipient?.trim() ||
    feeRecipients[seedIndex(`${args.seed}:fee`, feeRecipients.length)];
  const buybackFeeRecipient = args.buybackFeeRecipient?.trim() ||
    PUMP_BUYBACK_FEE_RECIPIENTS[seedIndex(`${args.seed}:buyback`, PUMP_BUYBACK_FEE_RECIPIENTS.length)];

  if (!feeSet.has(feeRecipient)) {
    throw new Error(args.mayhemMode
      ? "feeRecipient must be one of the documented Pump reserved fee recipients"
      : "feeRecipient must be one of the documented Pump normal fee recipients");
  }
  if (!buybackSet.has(buybackFeeRecipient)) {
    throw new Error("buybackFeeRecipient must be one of the documented Pump buyback fee recipients");
  }

  return {
    feeRecipient: new PublicKey(feeRecipient),
    buybackFeeRecipient: new PublicKey(buybackFeeRecipient),
  };
}

function parseKnownTokenProgram(value: string | undefined, label: string): PublicKey | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^(token-2022|spl-token-2022)$/i.test(normalized)) return TOKEN_2022_PROGRAM_ID;
  if (/^(token|spl-token|legacy)$/i.test(normalized)) return TOKEN_PROGRAM_ID;

  const publicKey = new PublicKey(normalized);
  if (publicKey.equals(TOKEN_2022_PROGRAM_ID) || publicKey.equals(TOKEN_PROGRAM_ID)) return publicKey;
  throw new Error(`${label} must be SPL Token or Token-2022`);
}

async function resolveBaseTokenProgram(
  connection: Connection,
  mint: PublicKey,
  provided?: string
): Promise<PublicKey> {
  const parsed = parseKnownTokenProgram(provided, "tokenProgram");
  if (parsed) return parsed;

  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) {
    throw new Error("tokenProgram is required when the mint account is not found on-chain");
  }
  if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) || mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    return mintInfo.owner;
  }
  throw new Error(`Unsupported mint owner: ${mintInfo.owner.toBase58()}`);
}

async function resolveTradeContext(params: BuildPumpTradeParams) {
  const connection = getPumpConnection();
  const mint = new PublicKey(params.mint);
  const user = new PublicKey(params.userWallet);
  const onlineSdk = new OnlinePumpSdk(connection);

  const needsBondingCurve =
    !params.creator ||
    !params.quoteMint ||
    params.mayhemMode == null;

  let bondingCurve: Awaited<ReturnType<InstanceType<typeof OnlinePumpSdk>["fetchBondingCurve"]>> | null = null;
  if (needsBondingCurve) {
    bondingCurve = await onlineSdk.fetchBondingCurve(mint);
  }

  const creatorSource = params.creator || bondingCurve?.creator;
  if (!creatorSource) {
    throw new Error("creator is required when bonding curve creator is unavailable");
  }
  const creator = new PublicKey(creatorSource);
  const tokenProgram = await resolveBaseTokenProgram(connection, mint, params.tokenProgram);
  const quoteTokenProgram = parseKnownTokenProgram(params.quoteTokenProgram, "quoteTokenProgram") ?? TOKEN_PROGRAM_ID;
  const bondingCurveQuoteMint = bondingCurve?.quoteMint;
  const quoteMint = params.quoteMint
    ? new PublicKey(params.quoteMint)
    : bondingCurveQuoteMint && !bondingCurveQuoteMint.equals(PublicKey.default)
      ? bondingCurveQuoteMint
      : NATIVE_MINT;
  const mayhemMode = params.mayhemMode ?? bondingCurve?.isMayhemMode ?? false;

  return {
    connection,
    mint,
    user,
    creator,
    tokenProgram,
    quoteMint,
    quoteTokenProgram,
    mayhemMode,
  };
}

async function finalizeTransaction(
  tx: Transaction,
  connection: Connection,
  feePayer: PublicKey,
  blockhash?: string
) {
  tx.recentBlockhash = blockhash || (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.feePayer = feePayer;
}

function serializeTransaction(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

export async function buildPumpLaunchTransaction(
  params: BuildPumpLaunchParams
): Promise<BuildPumpLaunchResult> {
  const name = params.name.trim();
  const symbol = normalizePumpSymbol(params.symbol);
  const uri = params.uri.trim();
  validatePumpMetadata(name, symbol, uri);

  const connection = getPumpConnection();
  const user = new PublicKey(params.userWallet);
  const creator = new PublicKey(params.creator || params.userWallet);
  const quoteMint = params.quoteMint ? new PublicKey(params.quoteMint) : NATIVE_MINT;
  const mint = Keypair.generate();
  const bondingCurve = bondingCurvePda(mint.publicKey);
  const mayhemMode = params.mayhemMode ?? false;
  const cashback = params.cashback ?? false;

  const createInstruction = await PUMP_SDK.createV2Instruction({
    mint: mint.publicKey,
    name,
    symbol,
    uri,
    creator,
    user,
    mayhemMode,
    cashback,
    quoteMint: quoteMint.equals(NATIVE_MINT) ? undefined : quoteMint,
  });

  const launchTx = new Transaction();
  launchTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  launchTx.add(createInstruction);

  const metadataTx = new Transaction();
  metadataTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));

  const launchKind =
    params.launchRegistry?.launchKind ??
    (params.clawdAgentBinding?.enabled ? LaunchKind.AgentToken : LaunchKind.Pump);
  const launchRegistry = appendLaunchpadRegistryInstruction({
    transaction: metadataTx,
    creator: user,
    tokenMint: mint.publicKey,
    curvePool: bondingCurve,
    name,
    symbol,
    metadataUri: uri,
    launchKind,
    curveRoute: CurveRoute.PumpSynthetic,
    ammRoute: AmmRoute.PumpSwap,
    feeRoute: launchKind === LaunchKind.AgentToken
      ? FeeRoute.ProtocolCreatorAgent
      : FeeRoute.ProtocolCreator,
    feeProfile: launchKind === LaunchKind.AgentToken ? undefined : PUMP_STYLE_FEE_PROFILE,
    curveSnapshot: PUMP_STYLE_CURVE_SNAPSHOT,
    quoteMint,
    ...params.launchRegistry,
  });

  const clawdAgentBinding = params.clawdAgentBinding
    ? appendClawdAgentBindingInstruction({
      transaction: metadataTx,
      baseMint: mint.publicKey,
      agentWallet: user,
      authority: user,
      character: { name, symbol, uri },
      ...params.clawdAgentBinding,
    })
    : null;

  await finalizeTransaction(launchTx, connection, user, params.blockhash);
  launchTx.partialSign(mint);

  const transactions = [serializeTransaction(launchTx)];
  if (metadataTx.instructions.length > 1) {
    await finalizeTransaction(metadataTx, connection, user, params.blockhash);
    transactions.push(serializeTransaction(metadataTx));
  }

  return {
    transaction: transactions[0],
    transactions,
    mintAddress: mint.publicKey.toBase58(),
    bondingCurveAddress: bondingCurve.toBase58(),
    userWallet: user.toBase58(),
    creator: creator.toBase58(),
    tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
    quoteMint: quoteMint.toBase58(),
    quoteTokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    pumpProgramId: PUMP_PROGRAM_ID.toBase58(),
    pumpAmmProgramId: PUMP_AMM_PROGRAM_ID.toBase58(),
    launchRegistry,
    clawdAgentBinding,
  };
}

export async function buildPumpTradeTransaction(
  params: BuildPumpTradeParams
): Promise<BuildPumpTradeResult> {
  const amount = parsePumpU64(params.amount, "amount");
  const quoteAmount = parsePumpU64(params.quoteAmount, "quoteAmount", params.side === "sell");
  if (params.side === "buy" && quoteAmount.isZero()) {
    throw new Error("quoteAmount must be greater than zero for buys");
  }

  const {
    connection,
    mint,
    user,
    creator,
    tokenProgram,
    quoteMint,
    quoteTokenProgram,
    mayhemMode,
  } = await resolveTradeContext(params);
  const { feeRecipient, buybackFeeRecipient } = selectFeeRecipient({
    seed: `${params.side}:${mint.toBase58()}:${user.toBase58()}`,
    mayhemMode,
    feeRecipient: params.feeRecipient,
    buybackFeeRecipient: params.buybackFeeRecipient,
  });

  const associatedBaseUser = getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
  const associatedQuoteUser = getAssociatedTokenAddressSync(quoteMint, user, true, quoteTokenProgram);
  const tradeInstruction = params.side === "buy"
    ? await PUMP_SDK.getBuyV2InstructionRaw({
      user,
      mint,
      creator,
      amount,
      quoteAmount,
      tokenProgram,
      quoteMint,
      quoteTokenProgram,
      feeRecipient,
      buybackFeeRecipient,
    })
    : await PUMP_SDK.getSellV2InstructionRaw({
      user,
      mint,
      creator,
      amount,
      quoteAmount,
      tokenProgram,
      quoteMint,
      quoteTokenProgram,
      feeRecipient,
      buybackFeeRecipient,
    });

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      associatedBaseUser,
      user,
      mint,
      tokenProgram
    )
  );
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      associatedQuoteUser,
      user,
      quoteMint,
      quoteTokenProgram
    )
  );
  tx.add(tradeInstruction);

  await finalizeTransaction(tx, connection, user, params.blockhash);

  return {
    transaction: serializeTransaction(tx),
    side: params.side,
    mintAddress: mint.toBase58(),
    bondingCurveAddress: bondingCurvePda(mint).toBase58(),
    userWallet: user.toBase58(),
    creator: creator.toBase58(),
    amount: amount.toString(10),
    quoteAmount: quoteAmount.toString(10),
    tokenProgram: tokenProgram.toBase58(),
    quoteMint: quoteMint.toBase58(),
    quoteTokenProgram: quoteTokenProgram.toBase58(),
    feeRecipient: feeRecipient.toBase58(),
    buybackFeeRecipient: buybackFeeRecipient.toBase58(),
    mayhemMode,
    pumpProgramId: PUMP_PROGRAM_ID.toBase58(),
  };
}

export async function submitPumpTransaction(signedTransaction: string) {
  const connection = getPumpConnection();
  const raw = Buffer.from(signedTransaction, "base64");
  const { signature } = await sendOptimizedRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
