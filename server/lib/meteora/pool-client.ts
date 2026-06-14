import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

// CLAWD is a Token-2022 mint; SOL/wSOL uses the standard SPL program
const TOKEN_PROGRAM_ID      = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOC_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
import BN from 'bn.js';
import bs58 from 'bs58';
import {
  CpAmm,
  CollectFeeMode,
  BaseFeeMode,
  ActivationType,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
  SwapMode,
  derivePositionAddress,
  getBaseFeeParams,
  getDynamicFeeParams,
  getPriceFromSqrtPrice,
  type PoolState,
  type Swap2Params,
} from '@meteora-ag/cp-amm-sdk';

// ── Constants ──────────────────────────────────────────────────────────────────
export const CLAWD_MINT = new PublicKey('8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump');
export const SOL_MINT   = new PublicKey('So11111111111111111111111111111111111111112');
export const CLAWD_DECIMALS = 6;
export const SOL_DECIMALS   = 9;

/** Vault token accounts for the CLAWD/SOL DAMM V2 pool (read from pool.tokenAVault / pool.tokenBVault) */
export const CLAWD_VAULT = new PublicKey('FHsdgJXdcFbQQmjDprgtGWMq6XhMCfA21DxCevAz6a1w');
export const SOL_VAULT   = new PublicKey('3z1bNMRpM7YV5U1WGLPBM4nAWNkn6JwCBUrcaL1g7nMv');

let cachedPoolAddress: PublicKey | null = null;

export function getRpcUrl(): string {
  return (
    process.env.HELIUS_RPC_URL ||
    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  );
}

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), 'confirmed');
}

export function getCpAmm(): CpAmm {
  return new CpAmm(getConnection());
}

/** Prefer WALLET_PRIVATE_KEY (user wallet) then TREASURY_KEY fallback */
export function getTreasuryKeypair(): Keypair | null {
  const raw = process.env.WALLET_PRIVATE_KEY || process.env.TREASURY_KEY;
  if (!raw) return null;
  try {
    const secretKey = raw.startsWith('[')
      ? new Uint8Array(JSON.parse(raw))
      : bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  } catch {
    return null;
  }
}

// ── Pool Discovery ─────────────────────────────────────────────────────────────

export async function findClawdPool(): Promise<PublicKey | null> {
  if (process.env.METEORA_CLAWD_POOL) {
    return new PublicKey(process.env.METEORA_CLAWD_POOL);
  }
  if (cachedPoolAddress) return cachedPoolAddress;

  try {
    const cpAmm = getCpAmm();
    const pools = await cpAmm.fetchPoolStatesByTokenAMint(CLAWD_MINT);
    if (!pools || pools.length === 0) return null;

    const solStr = SOL_MINT.toString();
    const matching = pools.filter(
      (p) =>
        p.account.tokenAMint.toString() === solStr ||
        p.account.tokenBMint.toString() === solStr,
    );
    const best = matching.length > 0 ? matching[0] : pools[0];
    cachedPoolAddress = best.publicKey;
    return cachedPoolAddress;
  } catch (err) {
    console.error('[meteora] findClawdPool error:', err);
    return null;
  }
}

export async function loadPool(poolAddress: PublicKey): Promise<PoolState> {
  const cpAmm = getCpAmm();
  return cpAmm.fetchPoolState(poolAddress);
}

// ── Pool Info ──────────────────────────────────────────────────────────────────

export interface PoolInfo {
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAmount: string;
  tokenBAmount: string;
  clawdPerSol: number;
  solPerClawd: number;
  clawdUsdEstimate: number | null;
  feeBps: number;
  lpSupply: string;
  liquidity: string;
  liquidityReady: boolean;
  collectFeeMode: number;
  collectFeeModeName: string;
  compoundingFeeBps: number;
  feeCollectionToken: string;
}

function collectFeeModeName(mode: number): string {
  if (mode === CollectFeeMode.BothToken) return 'BothToken';
  if (mode === CollectFeeMode.OnlyB) return 'OnlyB';
  if (mode === CollectFeeMode.Compounding) return 'Compounding';
  return `Unknown(${mode})`;
}

function feeCollectionToken(mode: number): string {
  if (mode === CollectFeeMode.BothToken) return 'CLAWD+SOL';
  if (mode === CollectFeeMode.OnlyB) return 'SOL';
  if (mode === CollectFeeMode.Compounding) return 'SOL auto-compounding';
  return 'Unknown';
}

export async function getPoolInfo(pool: PoolState, poolAddress: PublicKey, solUsd?: number): Promise<PoolInfo> {
  const connection = getConnection();
  const tokenAMint = pool.tokenAMint.toString();
  const tokenBMint = pool.tokenBMint.toString();

  const isClawd_A = tokenAMint === CLAWD_MINT.toString();

  // Resolve vault addresses from pool state (tokenAVault / tokenBVault)
  const ps = pool as any;
  const clawdVaultKey: PublicKey = isClawd_A
    ? (ps.tokenAVault as PublicKey ?? CLAWD_VAULT)
    : (ps.tokenBVault as PublicKey ?? CLAWD_VAULT);
  const solVaultKey: PublicKey = isClawd_A
    ? (ps.tokenBVault as PublicKey ?? SOL_VAULT)
    : (ps.tokenAVault as PublicKey ?? SOL_VAULT);

  // Read actual on-chain reserve balances from vault token accounts
  let clawdAmount = 0;
  let solAmount = 0;
  try {
    const [clawdBal, solBal] = await Promise.all([
      connection.getTokenAccountBalance(clawdVaultKey),
      connection.getTokenAccountBalance(solVaultKey),
    ]);
    clawdAmount = Number(clawdBal.value.uiAmount ?? 0);
    solAmount   = Number(solBal.value.uiAmount ?? 0);
  } catch (e) {
    console.warn('[meteora] vault balance fetch error:', e);
  }

  // Derive price from sqrtPrice (returns SOL per CLAWD as a Decimal)
  let clawdPerSol = 0;
  let solPerClawd = 0;
  try {
      const sqrtPrice = ps.sqrtPrice as BN;
    if (sqrtPrice) {
      const priceDecimal = getPriceFromSqrtPrice(sqrtPrice, CLAWD_DECIMALS, SOL_DECIMALS);
      solPerClawd = priceDecimal.toNumber(); // SOL per CLAWD
      clawdPerSol = solPerClawd > 0 ? 1 / solPerClawd : 0;
    }
  } catch (e) {
    console.warn('[meteora] sqrtPrice decode error:', e);
    // Fallback to reserve ratio
    clawdPerSol = solAmount > 0 ? clawdAmount / solAmount : 0;
    solPerClawd = clawdAmount > 0 ? solAmount / clawdAmount : 0;
  }

  const clawdUsdEstimate = solUsd ? solPerClawd * solUsd : null;

  const lpSupply = String(ps.lpSupply ?? ps.liquidity ?? '0');
  // The SDK stores scheduled base-fee data in an encoded byte array on this pool.
  // Quotes below expose the effective fee; for pool info we report the post-launch base fee.
  const feeBps = 25;
  const liquidity = String(ps.liquidity ?? '0');
  const collectFeeMode = Number(ps.collectFeeMode ?? CollectFeeMode.OnlyB);
  const compoundingFeeBps = Number(ps.poolFees?.compoundingFeeBps ?? 0);

  return {
    poolAddress: poolAddress.toString(),
    tokenAMint,
    tokenBMint,
    tokenASymbol: isClawd_A ? 'CLAWD' : 'SOL',
    tokenBSymbol: isClawd_A ? 'SOL' : 'CLAWD',
    tokenAAmount: clawdAmount.toFixed(6),
    tokenBAmount: solAmount.toFixed(9),
    clawdPerSol,
    solPerClawd,
    clawdUsdEstimate,
    feeBps,
    lpSupply,
    liquidity,
    liquidityReady: Number(liquidity) > 0 && clawdAmount > 0 && solAmount > 0,
    collectFeeMode,
    collectFeeModeName: collectFeeModeName(collectFeeMode),
    compoundingFeeBps,
    feeCollectionToken: feeCollectionToken(collectFeeMode),
  };
}

// ── Swap Quote ─────────────────────────────────────────────────────────────────

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  minOutputAmount: number;
  priceImpactPct: number;
  feeAmount: number;
  feeBps: number;
  swapInRaw: string;
  swapOutRaw: string;
  minSwapOutRaw: string;
}

export async function getSwapQuote(
  pool: PoolState,
  poolAddress: PublicKey,
  inMint: PublicKey,
  inAmountHuman: number,
  slippagePct = 1,
): Promise<SwapQuote> {
  const cpAmm = getCpAmm();
  if (Number((pool as any).liquidity ?? 0) <= 0) {
    throw new Error('CLAWD/SOL Meteora pool has no active liquidity. Seed the pool before quoting swaps.');
  }
  const isInClawd  = inMint.equals(CLAWD_MINT);
  const inDecimals  = isInClawd ? CLAWD_DECIMALS : SOL_DECIMALS;
  const outDecimals = isInClawd ? SOL_DECIMALS : CLAWD_DECIMALS;

  const inRaw = new BN(Math.floor(inAmountHuman * 10 ** inDecimals));

  const connection = getConnection();
  const slot = await connection.getSlot('confirmed');
  const time = Math.floor(Date.now() / 1000);

  const quote = cpAmm.getQuote({
    inAmount: inRaw,
    inputTokenMint: inMint,
    slippage: slippagePct,
    poolState: pool,
    currentSlot: slot,
    currentTime: time,
    tokenADecimal: CLAWD_DECIMALS,
    tokenBDecimal: SOL_DECIMALS,
  });

  const outRaw      = quote.swapOutAmount as BN;
  const minOutRaw   = quote.minSwapOutAmount as BN;
  const feeRaw      = quote.totalFee as BN;
  const priceImpact = Number(quote.priceImpact ?? 0);

  return {
    inputMint:      inMint.toString(),
    outputMint:     isInClawd ? SOL_MINT.toString() : CLAWD_MINT.toString(),
    inputAmount:    inAmountHuman,
    outputAmount:   Number(outRaw) / 10 ** outDecimals,
    minOutputAmount: Number(minOutRaw) / 10 ** outDecimals,
    priceImpactPct:  priceImpact,
    feeAmount:       Number(feeRaw) / 10 ** inDecimals,
    feeBps:          25,
    swapInRaw:       inRaw.toString(),
    swapOutRaw:      outRaw.toString(),
    minSwapOutRaw:   minOutRaw.toString(),
  };
}

// ── Build Swap Transaction ─────────────────────────────────────────────────────

export async function buildSwapTransaction(
  pool: PoolState,
  poolAddress: PublicKey,
  userPubkey: PublicKey,
  inMint: PublicKey,
  quote: SwapQuote,
  referralWallet?: PublicKey,
): Promise<Transaction> {
  const cpAmm = getCpAmm();
  const isInClawd = inMint.equals(CLAWD_MINT);
  const outMint   = isInClawd ? SOL_MINT : CLAWD_MINT;

  const ps = pool as any;
  const tokenAVault = ps.tokenAVault as PublicKey;
  const tokenBVault = ps.tokenBVault as PublicKey;

  const tx = await cpAmm.swap2({
    payer:             userPubkey,
    pool:              poolAddress,
    inputTokenMint:    inMint,
    outputTokenMint:   outMint,
    swapMode:          SwapMode.ExactIn,
    amountIn:          new BN(quote.swapInRaw),
    minimumAmountOut:  new BN(quote.minSwapOutRaw),
    tokenAMint:        pool.tokenAMint,
    tokenBMint:        pool.tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram:     TOKEN_2022_PROGRAM_ID, // CLAWD is Token-2022
    tokenBProgram:     TOKEN_PROGRAM_ID,      // wSOL is standard SPL
    referralTokenAccount: referralWallet ?? null,
    poolState: pool,
  } as Swap2Params);

  return tx;
}

// ── Pool Creation (DAMM V2 — compounding fee mode) ────────────────────────────

export interface CreatePoolParams {
  clawdAmount: number;
  solAmount: number;
  /** Starting fee bps, decays to endFeeBps over 1 hour (default 100 = 1%) */
  startFeeBps?: number;
  /** Ending fee bps after decay (default 25 = 0.25%) */
  endFeeBps?: number;
  /** How much of fees auto-compound back into liquidity in bps (default 5000 = 50%) */
  compoundingFeeBps?: number;
  activationPoint?: number;
}

export interface CreatePoolResult {
  transactions: Transaction[];
  poolAddress: string;
  positionAddress: string;
  positionNft: Keypair;
}

export interface SeedLiquidityParams {
  clawdAmount: number;
  solAmount: number;
}

export interface SeedLiquidityResult {
  transaction: Transaction;
  poolAddress: string;
  positionAddress: string;
  positionNft: Keypair;
  liquidityDelta: string;
}

function patchClawdAtaInstructions(tx: Transaction) {
  for (const ix of tx.instructions) {
    if (!ix.programId.equals(ASSOC_TOKEN_PROGRAM_ID)) continue;
    // AToken accounts: [payer, ata, owner, mint, systemProgram, tokenProgram, ...]
    if (ix.keys.length < 6) continue;
    const mintKey = ix.keys[3]?.pubkey;
    const tokenProgKey = ix.keys[5]?.pubkey;
    if (mintKey?.equals(CLAWD_MINT) && tokenProgKey?.equals(TOKEN_PROGRAM_ID)) {
      ix.keys[5].pubkey = TOKEN_2022_PROGRAM_ID;
      const owner = ix.keys[2].pubkey;
      ix.keys[1].pubkey = getAssociatedTokenAddressSync(CLAWD_MINT, owner, true, TOKEN_2022_PROGRAM_ID);
    }
  }
}

export async function buildCreatePoolTransactions(
  payer: Keypair,
  params: CreatePoolParams,
): Promise<CreatePoolResult> {
  const {
    clawdAmount,
    solAmount,
    startFeeBps     = 100,
    endFeeBps       = 25,
    compoundingFeeBps = 5000,
    activationPoint,
  } = params;

  const cpAmm = getCpAmm();

  const clawdRaw = new BN(Math.floor(clawdAmount * 10 ** CLAWD_DECIMALS));
  const solRaw   = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));

  // Compounding pools use full range (MIN → MAX sqrt price)
  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount:   clawdRaw,
    tokenBAmount:   solRaw,
    minSqrtPrice:   MIN_SQRT_PRICE,
    maxSqrtPrice:   MAX_SQRT_PRICE,
    collectFeeMode: CollectFeeMode.Compounding,
  });

  const poolFees = {
    baseFee: getBaseFeeParams(
      {
        baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear,
        feeTimeSchedulerParam: {
          startingFeeBps: startFeeBps,
          endingFeeBps:   endFeeBps,
          numberOfPeriod: 10,
          totalDuration:  3600, // 1 hour decay
        },
      },
      SOL_DECIMALS,
      ActivationType.Timestamp,
    ),
    compoundingFeeBps,
    padding: 0,
    dynamicFee: getDynamicFeeParams(endFeeBps),
  };

  const positionNft = Keypair.generate();

  const { tx: createTxs, pool, position } = await cpAmm.createCustomPool({
    payer:          payer.publicKey,
    creator:        payer.publicKey,
    positionNft:    positionNft.publicKey,
    tokenAMint:     CLAWD_MINT,
    tokenBMint:     SOL_MINT,
    tokenAAmount:   clawdRaw,
    tokenBAmount:   solRaw,
    sqrtMinPrice:   MIN_SQRT_PRICE,
    sqrtMaxPrice:   MAX_SQRT_PRICE,
    initSqrtPrice,
    liquidityDelta,
    poolFees,
    hasAlphaVault: false,
    collectFeeMode: CollectFeeMode.Compounding,
    activationPoint: activationPoint ? new BN(activationPoint) : null,
    activationType:  ActivationType.Timestamp,
    tokenAProgram:   TOKEN_2022_PROGRAM_ID, // CLAWD is Token-2022
    tokenBProgram:   TOKEN_PROGRAM_ID,      // wSOL is standard SPL
  });

  // createTxs may be a single Transaction or an array
  const txArr: Transaction[] = Array.isArray(createTxs)
    ? (createTxs as Transaction[])
    : [createTxs as Transaction];

  // cp-amm-sdk can emit legacy-token ATA creation for Token-2022 CLAWD.
  txArr.forEach(patchClawdAtaInstructions);

  cachedPoolAddress = pool;

  return {
    transactions:    txArr,
    poolAddress:     pool.toString(),
    positionAddress: position.toString(),
    positionNft,
  };
}

export async function buildSeedLiquidityTransaction(
  payer: Keypair,
  poolAddress: PublicKey,
  params: SeedLiquidityParams,
): Promise<SeedLiquidityResult> {
  const { clawdAmount, solAmount } = params;
  const cpAmm = getCpAmm();
  const pool = await loadPool(poolAddress);

  const clawdRaw = new BN(Math.floor(clawdAmount * 10 ** CLAWD_DECIMALS));
  const solRaw = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
  if (clawdRaw.lte(new BN(0)) || solRaw.lte(new BN(0))) {
    throw new Error('clawdAmount and solAmount must be greater than zero');
  }

  const ps = pool as any;
  const liquidityDelta = cpAmm.getLiquidityDelta({
    maxAmountTokenA: clawdRaw,
    maxAmountTokenB: solRaw,
    sqrtPrice: ps.sqrtPrice,
    sqrtMinPrice: ps.sqrtMinPrice ?? MIN_SQRT_PRICE,
    sqrtMaxPrice: ps.sqrtMaxPrice ?? MAX_SQRT_PRICE,
    collectFeeMode: Number(ps.collectFeeMode ?? CollectFeeMode.Compounding),
    liquidity: ps.liquidity,
  });

  if (liquidityDelta.lte(new BN(0))) {
    throw new Error('Calculated liquidityDelta is zero. Increase seed amounts.');
  }

  const positionNft = Keypair.generate();
  const tx = await cpAmm.createPositionAndAddLiquidity({
    owner: payer.publicKey,
    pool: poolAddress,
    positionNft: positionNft.publicKey,
    liquidityDelta,
    maxAmountTokenA: clawdRaw,
    maxAmountTokenB: solRaw,
    tokenAAmountThreshold: clawdRaw,
    tokenBAmountThreshold: solRaw,
    tokenAMint: CLAWD_MINT,
    tokenBMint: SOL_MINT,
    tokenAProgram: TOKEN_2022_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
  });
  patchClawdAtaInstructions(tx);

  return {
    transaction: tx,
    poolAddress: poolAddress.toString(),
    positionAddress: derivePositionAddress(positionNft.publicKey).toString(),
    positionNft,
    liquidityDelta: liquidityDelta.toString(),
  };
}

// ── Add Liquidity (open position + deposit) ────────────────────────────────────

export async function buildAddLiquidityTransaction(
  pool: PoolState,
  poolAddress: PublicKey,
  userPubkey: PublicKey,
  clawdAmount: number,
  solAmount: number,
  slippagePct = 1,
): Promise<{ transaction: Transaction; positionNft: Keypair; liquidityDelta: string }> {
  const cpAmm = getCpAmm();
  const clawdRaw = new BN(Math.floor(clawdAmount * 10 ** CLAWD_DECIMALS));
  const solRaw   = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));

  if (clawdRaw.lte(new BN(0)) || solRaw.lte(new BN(0))) {
    throw new Error('clawdAmount and solAmount must be greater than zero');
  }

  const ps = pool as any;
  const liquidityDelta = cpAmm.getLiquidityDelta({
    maxAmountTokenA: clawdRaw,
    maxAmountTokenB: solRaw,
    sqrtPrice:       ps.sqrtPrice,
    sqrtMinPrice:    ps.sqrtMinPrice ?? MIN_SQRT_PRICE,
    sqrtMaxPrice:    ps.sqrtMaxPrice ?? MAX_SQRT_PRICE,
    collectFeeMode:  Number(ps.collectFeeMode ?? CollectFeeMode.Compounding),
    liquidity:       ps.liquidity,
  });

  if (liquidityDelta.lte(new BN(0))) {
    throw new Error('Calculated liquidityDelta is zero. Increase amounts.');
  }

  // Apply slippage tolerance to thresholds
  const slippageFactor = 1 - slippagePct / 100;
  const clawdThreshold = new BN(Math.floor(clawdAmount * slippageFactor * 10 ** CLAWD_DECIMALS));
  const solThreshold   = new BN(Math.floor(solAmount * slippageFactor * LAMPORTS_PER_SOL));

  const positionNft = Keypair.generate();
  const transaction = await cpAmm.createPositionAndAddLiquidity({
    owner:                  userPubkey,
    pool:                   poolAddress,
    positionNft:            positionNft.publicKey,
    liquidityDelta,
    maxAmountTokenA:        clawdRaw,
    maxAmountTokenB:        solRaw,
    tokenAAmountThreshold:  clawdThreshold,
    tokenBAmountThreshold:  solThreshold,
    tokenAMint:             CLAWD_MINT,
    tokenBMint:             SOL_MINT,
    tokenAProgram:          TOKEN_2022_PROGRAM_ID, // CLAWD is Token-2022
    tokenBProgram:          TOKEN_PROGRAM_ID,      // wSOL is standard SPL
  });
  patchClawdAtaInstructions(transaction);

  return { transaction, positionNft, liquidityDelta: liquidityDelta.toString() };
}
