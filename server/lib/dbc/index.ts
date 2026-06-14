import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
} from '@solana/spl-token';
import {
  AnchorProvider,
  Program,
  Wallet,
  type Program as AnchorProgram,
} from '@coral-xyz/anchor';
import BN from 'bn.js';
import bs58 from 'bs58';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  appendLaunchpadRegistryInstruction,
  type LaunchpadRegistryAppendResult,
  type LaunchpadRegistryOptions,
} from '../launchpad/registry';
import {
  appendClawdAgentBindingInstruction,
  type ClawdAgentBindingAppendResult,
  type ClawdAgentBindingOptions,
} from '../launchpad/clawd-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Constants ─────────────────────────────────────────────────────────────────

const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const DAMM_V2_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');

const SOL_MINT = NATIVE_MINT;

const MIN_SQRT_PRICE = new BN('4295048016');
const MAX_SQRT_PRICE = new BN('79226673521066979257578248091');
const PAYER_KEYPAIR_ENV_KEYS = [
  'WALLET_PRIVATE_KEY',
  'FEE_PAYER_SECRET_KEY',
  'SOLANA_PRIVATE_KEY',
  'AGENT_PRIVATE_KEY',
] as const;

// ── IDL loader ────────────────────────────────────────────────────────────────

function loadIdl(): Record<string, unknown> {
  const candidatePaths = [
    path.resolve(__dirname, 'release_0.1.6.json'),
    path.resolve(__dirname, '../server/lib/dbc/release_0.1.6.json'),
  ];

  for (const idlPath of candidatePaths) {
    if (fs.existsSync(idlPath)) {
      return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    }
  }

  throw new Error('DBC IDL file not found in expected runtime paths');
}

// ── Env helpers ───────────────────────────────────────────────────────────────

export function getConnection(): Connection {
  const rpc = process.env.HELIUS_RPC_URL;
  if (!rpc) throw new Error('HELIUS_RPC_URL is not set');
  return new Connection(rpc, 'confirmed');
}

export function getPayerKeypair(): Keypair {
  for (const key of PAYER_KEYPAIR_ENV_KEYS) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;

    const secretKey = raw.startsWith('[')
      ? Uint8Array.from(JSON.parse(raw))
      : bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  }

  throw new Error(`${PAYER_KEYPAIR_ENV_KEYS.join(' or ')} is not set`);
}

function getDbcProgram(connection: Connection, payer: Keypair): AnchorProgram<any> {
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = loadIdl();
  return new Program(idl as any, provider);
}

// ── PDA derivation ────────────────────────────────────────────────────────────

function derivePoolAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool_authority')],
    DBC_PROGRAM_ID
  )[0];
}

function getFirstKey(key1: PublicKey, key2: PublicKey): Buffer {
  const b1 = key1.toBuffer();
  const b2 = key2.toBuffer();
  return Buffer.compare(b1, b2) === 1 ? b1 : b2;
}

function getSecondKey(key1: PublicKey, key2: PublicKey): Buffer {
  const b1 = key1.toBuffer();
  const b2 = key2.toBuffer();
  return Buffer.compare(b1, b2) === 1 ? b2 : b1;
}

function derivePoolAddress(config: PublicKey, baseMint: PublicKey, quoteMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      config.toBuffer(),
      getFirstKey(baseMint, quoteMint),
      getSecondKey(baseMint, quoteMint),
    ],
    DBC_PROGRAM_ID
  )[0];
}

function deriveTokenVaultAddress(mint: PublicKey, pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token_vault'), mint.toBuffer(), pool.toBuffer()],
    DBC_PROGRAM_ID
  )[0];
}

function deriveMetadataAccount(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METAPLEX_PROGRAM_ID
  )[0];
}

function deriveMigrationDammV2MetadataAddress(virtualPool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('damm_v2'), virtualPool.toBuffer()],
    DBC_PROGRAM_ID
  )[0];
}

function deriveDammV2PoolAddress(config: PublicKey, tokenAMint: PublicKey, tokenBMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      config.toBuffer(),
      getFirstKey(tokenAMint, tokenBMint),
      getSecondKey(tokenAMint, tokenBMint),
    ],
    DAMM_V2_PROGRAM_ID
  )[0];
}

function deriveDammV2PoolAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool_authority')],
    DAMM_V2_PROGRAM_ID
  )[0];
}

function deriveDammV2EventAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    DAMM_V2_PROGRAM_ID
  )[0];
}

function derivePositionAddress(positionNftMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    DAMM_V2_PROGRAM_ID
  )[0];
}

function derivePositionNftAccount(positionNftMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position_nft_account'), positionNftMint.toBuffer()],
    DAMM_V2_PROGRAM_ID
  )[0];
}

function deriveDammV2TokenVault(mint: PublicKey, pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token_vault'), mint.toBuffer(), pool.toBuffer()],
    DAMM_V2_PROGRAM_ID
  )[0];
}

// ── Default ConfigParameters ──────────────────────────────────────────────────

function buildDefaultConfigParams(overrides: Partial<ConfigParameters> = {}): ConfigParameters {
  const baseFee: BaseFee = {
    cliffFeeNumerator: new BN(10_000_000),
    firstFactor: 0,
    secondFactor: new BN(0),
    thirdFactor: new BN(0),
    baseFeeMode: 0,
  };

  const defaults: ConfigParameters = {
    poolFees: { baseFee, dynamicFee: null },
    collectFeeMode: 0,
    migrationOption: 1,
    activationType: 1,
    tokenType: 0,
    tokenDecimal: 6,
    migrationQuoteThreshold: new BN(3 * LAMPORTS_PER_SOL),
    partnerLpPercentage: 0,
    partnerLockedLpPercentage: 50,
    creatorLpPercentage: 0,
    creatorLockedLpPercentage: 50,
    sqrtStartPrice: MIN_SQRT_PRICE.shln(32),
    lockedVesting: {
      amountPerPeriod: new BN(0),
      cliffDurationFromMigrationTime: new BN(0),
      frequency: new BN(0),
      numberOfPeriod: new BN(0),
      cliffUnlockAmount: new BN(0),
    },
    // FixedBps25. For non-custom DAMM v2 migrations, migratedPoolFee must be empty.
    migrationFeeOption: 0,
    tokenSupply: null,
    creatorTradingFeePercentage: 0,
    tokenUpdateAuthority: 0,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    migratedPoolFee: { poolFeeBps: 0, collectFeeMode: 0, dynamicFee: 0 },
    poolCreationFee: new BN(0),
    migratedPoolBaseFeeMode: 0,
    migratedPoolMarketCapFeeSchedulerParams: {
      numberOfPeriod: 0,
      sqrtPriceStepBps: 0,
      schedulerExpirationDuration: 0,
      reductionFactor: new BN(0),
    },
    partnerLiquidityVestingInfo: {
      vestingPercentage: 0,
      cliffDurationFromMigrationTime: 0,
      bpsPerPeriod: 0,
      frequency: 0,
      numberOfPeriods: 0,
    },
    creatorLiquidityVestingInfo: {
      vestingPercentage: 0,
      cliffDurationFromMigrationTime: 0,
      bpsPerPeriod: 0,
      frequency: 0,
      numberOfPeriods: 0,
    },
    enableFirstSwapWithMinFee: false,
    compoundingFeeBps: 0,
    curve: [{ sqrtPrice: MAX_SQRT_PRICE, liquidity: new BN('18446744073709551615').shln(30) }],
  };

  return { ...defaults, ...overrides };
}

// ── Exported types ────────────────────────────────────────────────────────────

export interface BaseFee {
  cliffFeeNumerator: BN;
  firstFactor: number;
  secondFactor: BN;
  thirdFactor: BN;
  baseFeeMode: number;
}

export interface LockedVestingParams {
  amountPerPeriod: BN;
  cliffDurationFromMigrationTime: BN;
  frequency: BN;
  numberOfPeriod: BN;
  cliffUnlockAmount: BN;
}

export interface LiquidityVestingInfoParams {
  vestingPercentage: number;
  cliffDurationFromMigrationTime: number;
  bpsPerPeriod: number;
  frequency: number;
  numberOfPeriods: number;
}

export interface MigratedPoolMarketCapFeeSchedulerParams {
  numberOfPeriod: number;
  sqrtPriceStepBps: number;
  schedulerExpirationDuration: number;
  reductionFactor: BN;
}

export interface ConfigParameters {
  poolFees: { baseFee: BaseFee; dynamicFee: null | object };
  collectFeeMode: number;
  migrationOption: number;
  activationType: number;
  tokenType: number;
  tokenDecimal: number;
  migrationQuoteThreshold: BN;
  partnerLpPercentage: number;
  partnerLockedLpPercentage: number;
  creatorLpPercentage: number;
  creatorLockedLpPercentage: number;
  sqrtStartPrice: BN;
  lockedVesting: LockedVestingParams;
  migrationFeeOption: number;
  tokenSupply: null | { preMigrationTokenSupply: BN; postMigrationTokenSupply: BN };
  creatorTradingFeePercentage: number;
  tokenUpdateAuthority: number;
  migrationFee: { feePercentage: number; creatorFeePercentage: number };
  migratedPoolFee: { poolFeeBps: number; collectFeeMode: number; dynamicFee: number };
  poolCreationFee: BN;
  migratedPoolBaseFeeMode: number;
  migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParams;
  partnerLiquidityVestingInfo: LiquidityVestingInfoParams;
  creatorLiquidityVestingInfo: LiquidityVestingInfoParams;
  enableFirstSwapWithMinFee: boolean;
  compoundingFeeBps: number;
  curve: Array<{ sqrtPrice: BN; liquidity: BN }>;
}

export interface LaunchTokenParams {
  name: string;
  symbol: string;
  uri: string;
  configAddress: string;
  userWallet: string;
  launchRegistry?: LaunchpadRegistryOptions;
  clawdAgentBinding?: ClawdAgentBindingOptions;
}

export interface SwapParams {
  poolAddress: string;
  userWallet: string;
  inputMint: string;
  outputMint: string;
  amountIn: number;
  minAmountOut: number;
  referralAddress?: string;
}

export interface BuildMigrateToDammV2Params {
  poolAddress: string;
  payerAddress: string;
  dammConfigAddress: string;
}

export interface QuoteParams {
  poolAddress: string;
  inputMint: string;
  amountIn: number;
}

export interface QuoteResult {
  amountOut: number;
  priceImpact: number;
  fee: number;
}

export interface BuildCreateConfigResult {
  transaction: string;
  configAddress: string;
}

export interface BuildLaunchTokenResult {
  transaction: string;
  mintAddress: string;
  poolAddress: string;
  launchRegistry: LaunchpadRegistryAppendResult | null;
  clawdAgentBinding: ClawdAgentBindingAppendResult | null;
}

// ── buildCreateConfigTransaction ─────────────────────────────────────────────

export async function buildCreateConfigTransaction(
  feeClaimer: PublicKey,
  leftoverReceiver: PublicKey,
  customParams?: Partial<ConfigParameters>
): Promise<BuildCreateConfigResult> {
  const connection = getConnection();
  const payer = getPayerKeypair();
  const program = getDbcProgram(connection, payer);

  const configKP = Keypair.generate();
  const params = buildDefaultConfigParams(customParams);

  const tx: Transaction = await program.methods
    .createConfig({
      ...params,
      padding: Array.from({ length: 7 }, () => new BN(0)),
    })
    .accountsPartial({
      config: configKP.publicKey,
      feeClaimer,
      leftoverReceiver,
      quoteMint: SOL_MINT,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  tx.partialSign(payer, configKP);

  return {
    transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    configAddress: configKP.publicKey.toBase58(),
  };
}

// ── buildLaunchTokenTransaction ───────────────────────────────────────────────

export async function buildLaunchTokenTransaction(
  params: LaunchTokenParams
): Promise<BuildLaunchTokenResult> {
  const { name, symbol, uri, configAddress, userWallet } = params;

  const connection = getConnection();
  const payer = getPayerKeypair();
  const program = getDbcProgram(connection, payer);

  const config = new PublicKey(configAddress);
  const userPubkey = new PublicKey(userWallet);
  const quoteMint = SOL_MINT;

  const poolAuthority = derivePoolAuthority();
  const baseMintKP = Keypair.generate();
  const pool = derivePoolAddress(config, baseMintKP.publicKey, quoteMint);
  const baseVault = deriveTokenVaultAddress(baseMintKP.publicKey, pool);
  const quoteVault = deriveTokenVaultAddress(quoteMint, pool);
  const mintMetadata = deriveMetadataAccount(baseMintKP.publicKey);

  const ix = await program.methods
    .initializeVirtualPoolWithSplToken({ name, symbol, uri })
    .accountsPartial({
      config,
      baseMint: baseMintKP.publicKey,
      quoteMint,
      pool,
      payer: userPubkey,
      creator: userPubkey,
      poolAuthority,
      baseVault,
      quoteVault,
      mintMetadata,
      metadataProgram: METAPLEX_PROGRAM_ID,
      tokenQuoteProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ix);
  const launchRegistry = appendLaunchpadRegistryInstruction({
    transaction: tx,
    creator: userPubkey,
    tokenMint: baseMintKP.publicKey,
    curvePool: pool,
    name,
    symbol,
    metadataUri: uri,
    ...params.launchRegistry,
  });
  const clawdAgentBinding = appendClawdAgentBindingInstruction({
    transaction: tx,
    baseMint: baseMintKP.publicKey,
    agentWallet: userPubkey,
    authority: userPubkey,
    character: { name, symbol, uri },
    ...params.clawdAgentBinding,
  });

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = userPubkey;

  tx.partialSign(baseMintKP);

  return {
    transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    mintAddress: baseMintKP.publicKey.toBase58(),
    poolAddress: pool.toBase58(),
    launchRegistry,
    clawdAgentBinding,
  };
}

// ── getVirtualPool ────────────────────────────────────────────────────────────

export async function getVirtualPool(poolAddress: string): Promise<any> {
  const connection = getConnection();
  const payer = getPayerKeypair();
  const program = getDbcProgram(connection, payer);
  return (program.account as any).virtualPool.fetch(new PublicKey(poolAddress));
}

// ── getPoolsByConfig ──────────────────────────────────────────────────────────

export async function getPoolsByConfig(configAddress: string): Promise<any[]> {
  const connection = getConnection();
  const payer = getPayerKeypair();
  const program = getDbcProgram(connection, payer);

  const config = new PublicKey(configAddress);
  const pools = await (program.account as any).virtualPool.all([
    {
      memcmp: {
        offset: 8 + 32,
        bytes: config.toBase58(),
      },
    },
  ]);
  return pools.map((p: any) => ({ address: p.publicKey.toBase58(), ...p.account }));
}

// ── buildBondingCurveSwapTx ───────────────────────────────────────────────────

export async function buildBondingCurveSwapTx(params: SwapParams): Promise<string> {
  const {
    poolAddress,
    userWallet,
    inputMint,
    outputMint,
    amountIn,
    minAmountOut,
    referralAddress,
  } = params;

  const connection = getConnection();
  const payer = getPayerKeypair();
  const program = getDbcProgram(connection, payer);

  const pool = new PublicKey(poolAddress);
  const userPubkey = new PublicKey(userWallet);
  const inputMintPubkey = new PublicKey(inputMint);
  const outputMintPubkey = new PublicKey(outputMint);

  const poolState = await (program.account as any).virtualPool.fetch(pool);
  const configPubkey: PublicKey = poolState.config;
  const configState = await (program.account as any).poolConfig.fetch(configPubkey);

  const baseMint: PublicKey = poolState.baseMint;
  const quoteMint: PublicKey = configState.quoteMint;

  const isInputBase = inputMintPubkey.equals(baseMint);
  const isInputQuote = inputMintPubkey.equals(quoteMint);
  const isOutputBase = outputMintPubkey.equals(baseMint);
  const isOutputQuote = outputMintPubkey.equals(quoteMint);
  if ((!isInputBase && !isInputQuote) || (!isOutputBase && !isOutputQuote) || isInputBase === isOutputBase) {
    throw new Error('inputMint/outputMint must be the pool base and quote mints in opposite directions');
  }

  const tokenBaseProgram = configState.tokenType === 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const tokenQuoteProgram = Number(configState.quoteTokenFlag ?? 0) === 0
    ? TOKEN_PROGRAM_ID
    : TOKEN_2022_PROGRAM_ID;
  const inputTokenProgram = isInputBase ? tokenBaseProgram : tokenQuoteProgram;
  const outputTokenProgram = isInputBase ? tokenQuoteProgram : tokenBaseProgram;

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMintPubkey,
    userPubkey,
    false,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMintPubkey,
    userPubkey,
    false,
    outputTokenProgram
  );

  const poolAuthority = derivePoolAuthority();
  const baseVault: PublicKey = poolState.baseVault;
  const quoteVault: PublicKey = poolState.quoteVault;

  const preInstructions: any[] = [];
  const postInstructions: any[] = [];

  const inputAccountInfo = await connection.getAccountInfo(inputTokenAccount);
  const createdInputTokenAccount = !inputAccountInfo;
  if (!inputAccountInfo) {
    preInstructions.push(
      createAssociatedTokenAccountInstruction(
        userPubkey,
        inputTokenAccount,
        userPubkey,
        inputMintPubkey,
        inputTokenProgram
      )
    );
  }

  const outputAccountInfo = await connection.getAccountInfo(outputTokenAccount);
  const createdOutputTokenAccount = !outputAccountInfo;
  if (!outputAccountInfo) {
    preInstructions.push(
      createAssociatedTokenAccountInstruction(
        userPubkey,
        outputTokenAccount,
        userPubkey,
        outputMintPubkey,
        outputTokenProgram
      )
    );
  }

  if (inputMintPubkey.equals(SOL_MINT)) {
    preInstructions.push(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: inputTokenAccount,
        lamports: Math.round(amountIn * LAMPORTS_PER_SOL),
      }),
      createSyncNativeInstruction(inputTokenAccount)
    );
    if (createdInputTokenAccount) {
      postInstructions.push(
        createCloseAccountInstruction(inputTokenAccount, userPubkey, userPubkey)
      );
    }
  }

  if (outputMintPubkey.equals(SOL_MINT) && createdOutputTokenAccount) {
    postInstructions.push(
      createCloseAccountInstruction(outputTokenAccount, userPubkey, userPubkey)
    );
  }

  const amountInBN = new BN(
    inputMintPubkey.equals(SOL_MINT)
      ? Math.round(amountIn * LAMPORTS_PER_SOL)
      : Math.round(amountIn * 10 ** 6)
  );
  const minAmountOutBN = new BN(
    outputMintPubkey.equals(SOL_MINT)
      ? Math.round(minAmountOut * LAMPORTS_PER_SOL)
      : Math.round(minAmountOut * 10 ** 6)
  );

  const referralTokenAccount = referralAddress
    ? new PublicKey(referralAddress)
    : null;

  const tx: Transaction = await program.methods
    .swap({
      amountIn: amountInBN,
      minimumAmountOut: minAmountOutBN,
      swapMode: 0,
    })
    .accountsPartial({
      poolAuthority,
      config: configPubkey,
      pool,
      inputTokenAccount,
      outputTokenAccount,
      baseVault,
      quoteVault,
      baseMint,
      quoteMint,
      payer: userPubkey,
      tokenBaseProgram,
      tokenQuoteProgram,
      referralTokenAccount,
    })
    .preInstructions(preInstructions)
    .postInstructions(postInstructions)
    .transaction();

  tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = userPubkey;

  return tx.serialize({ requireAllSignatures: false }).toString('base64');
}

// ── getBondingCurveQuote ──────────────────────────────────────────────────────

export async function getBondingCurveQuote(params: QuoteParams): Promise<QuoteResult> {
  const { poolAddress, inputMint, amountIn } = params;

  const connection = getConnection();
  const payer = getPayerKeypair();
  const program = getDbcProgram(connection, payer);

  const pool = new PublicKey(poolAddress);
  const poolState = await (program.account as any).virtualPool.fetch(pool);
  const configState = await (program.account as any).poolConfig.fetch(poolState.config);

  const baseMint: PublicKey = poolState.baseMint;
  const inputMintPubkey = new PublicKey(inputMint);
  const isInputBase = inputMintPubkey.equals(baseMint);

  const baseReserve: BN = poolState.baseReserve ?? new BN(0);
  const quoteReserve: BN = poolState.quoteReserve ?? new BN(0);

  const feeNumerator: number = configState.poolFees?.baseFee?.cliffFeeNumerator?.toNumber() ?? 10_000_000;
  const feeDenominator = 1_000_000_000;
  const feeRate = feeNumerator / feeDenominator;

  const amountInRaw = isInputBase
    ? amountIn * 10 ** 6
    : amountIn * LAMPORTS_PER_SOL;

  const inputReserve = isInputBase ? baseReserve.toNumber() : quoteReserve.toNumber();
  const outputReserve = isInputBase ? quoteReserve.toNumber() : baseReserve.toNumber();

  if (inputReserve === 0 || outputReserve === 0) {
    return { amountOut: 0, priceImpact: 0, fee: 0 };
  }

  const fee = amountInRaw * feeRate;
  const amountInAfterFee = amountInRaw - fee;

  const amountOutRaw = (amountInAfterFee * outputReserve) / (inputReserve + amountInAfterFee);

  const priceImpact = (amountInAfterFee / (inputReserve + amountInAfterFee)) * 100;

  const decimalsOut = isInputBase ? 9 : 6;
  const amountOut = amountOutRaw / 10 ** decimalsOut;

  const feeInDisplayUnits = fee / (isInputBase ? 10 ** 6 : LAMPORTS_PER_SOL);

  return {
    amountOut,
    priceImpact,
    fee: feeInDisplayUnits,
  };
}

// ── buildMigrateToDammV2Tx ────────────────────────────────────────────────────

export async function buildMigrateToDammV2Tx(params: BuildMigrateToDammV2Params): Promise<string> {
  const { poolAddress, payerAddress, dammConfigAddress } = params;
  const connection = getConnection();
  const serverPayer = getPayerKeypair();
  const program = getDbcProgram(connection, serverPayer);

  const virtualPool = new PublicKey(poolAddress);
  const payerPubkey = new PublicKey(payerAddress);

  const poolState = await (program.account as any).virtualPool.fetch(virtualPool);
  const configState = await (program.account as any).poolConfig.fetch(poolState.config);

  const baseMint: PublicKey = poolState.baseMint;
  const quoteMint: PublicKey = configState.quoteMint;

  const poolAuthority = derivePoolAuthority();
  const migrationMetadata = deriveMigrationDammV2MetadataAddress(virtualPool);

  const dammConfig = new PublicKey(dammConfigAddress);

  const dammPool = deriveDammV2PoolAddress(dammConfig, baseMint, quoteMint);
  const dammPoolAuthority = deriveDammV2PoolAuthority();

  const firstPositionNftKP = Keypair.generate();
  const firstPosition = derivePositionAddress(firstPositionNftKP.publicKey);
  const firstPositionNftAccount = derivePositionNftAccount(firstPositionNftKP.publicKey);

  const secondPositionNftKP = Keypair.generate();
  const secondPosition = derivePositionAddress(secondPositionNftKP.publicKey);
  const secondPositionNftAccount = derivePositionNftAccount(secondPositionNftKP.publicKey);

  const tokenAVault = deriveDammV2TokenVault(baseMint, dammPool);
  const tokenBVault = deriveDammV2TokenVault(quoteMint, dammPool);

  const tokenBaseProgram = configState.tokenType === 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const tokenQuoteProgram = Number(configState.quoteTokenFlag ?? 0) === 0
    ? TOKEN_PROGRAM_ID
    : TOKEN_2022_PROGRAM_ID;

  const migrateTx: Transaction = await program.methods
    .migrationDammV2()
    .accountsStrict({
      virtualPool,
      migrationMetadata,
      config: poolState.config,
      poolAuthority,
      pool: dammPool,
      firstPositionNftMint: firstPositionNftKP.publicKey,
      firstPosition,
      firstPositionNftAccount,
      secondPositionNftMint: secondPositionNftKP.publicKey,
      secondPosition,
      secondPositionNftAccount,
      dammPoolAuthority,
      ammProgram: DAMM_V2_PROGRAM_ID,
      baseMint,
      quoteMint,
      tokenAVault,
      tokenBVault,
      baseVault: poolState.baseVault,
      quoteVault: poolState.quoteVault,
      payer: payerPubkey,
      tokenBaseProgram,
      tokenQuoteProgram,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      dammEventAuthority: deriveDammV2EventAuthority(),
    })
    .remainingAccounts([
      { isSigner: false, isWritable: false, pubkey: dammConfig },
    ])
    .transaction();

  migrateTx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  migrateTx.recentBlockhash = blockhash;
  migrateTx.feePayer = payerPubkey;
  migrateTx.partialSign(firstPositionNftKP, secondPositionNftKP);

  return migrateTx.serialize({ requireAllSignatures: false }).toString('base64');
}
