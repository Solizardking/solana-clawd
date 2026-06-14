import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  TOKEN_PROGRAM_ID,
  createBurnInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const RPC_URL = import.meta.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

export function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}

export type TxResult = {
  success: boolean;
  signature?: string;
  error?: string;
};

type OptimizedSubmitOptions = {
  mode?: "rpc" | "sender";
  skipPreflight?: boolean;
  maxRetries?: number;
  rebateAddress?: string;
};

async function submitSignedTransactionBase64(
  signedTransaction: string,
  options: OptimizedSubmitOptions = {},
): Promise<string> {
  const response = await fetch("/api/helius/send-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signedTransaction,
      mode: options.mode || "rpc",
      skipPreflight: options.skipPreflight ?? false,
      maxRetries: options.maxRetries ?? 3,
      rebateAddress: options.rebateAddress,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Helius send failed (${response.status})`);
  }
  return payload.data.signature;
}

async function submitSignedTransactionBytes(
  signedTransaction: Uint8Array,
  options: OptimizedSubmitOptions = {},
): Promise<string> {
  return submitSignedTransactionBase64(Buffer.from(signedTransaction).toString("base64"), options);
}

// ─── Token balance lookup ─────────────────────────────────────────────────────
export async function getWalletBalances(walletAddress: string) {
  const r = await fetch(`/api/wallet-ops/balances/${walletAddress}`);
  return r.json();
}

// ─── Token mint resolution ────────────────────────────────────────────────────
export async function resolveToken(symbolOrMint: string): Promise<{ mint: string; symbol: string; found: boolean }> {
  // If looks like a mint address (base58, 32–44 chars), use directly
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbolOrMint)) {
    return { mint: symbolOrMint, symbol: symbolOrMint.slice(0, 6) + "…", found: true };
  }
  const r = await fetch(`/api/wallet-ops/resolve-token?symbol=${encodeURIComponent(symbolOrMint.toUpperCase())}`);
  return r.json();
}

// ─── BURN SPL tokens ──────────────────────────────────────────────────────────
export async function buildBurnTransaction(
  walletPublicKey: PublicKey,
  mintAddress: string,
  rawAmount: bigint,
  closeAfterBurn = true
): Promise<Transaction> {
  const connection = getConnection();
  const mint = new PublicKey(mintAddress);
  const ata = await getAssociatedTokenAddress(mint, walletPublicKey);

  const tx = new Transaction();
  tx.add(createBurnInstruction(ata, mint, walletPublicKey, rawAmount));
  if (closeAfterBurn) {
    tx.add(createCloseAccountInstruction(ata, walletPublicKey, walletPublicKey));
  }
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = walletPublicKey;
  return tx;
}

export async function burnTokens(
  walletPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  mintAddress: string,
  uiAmount: number,
  decimals: number,
  closeAfterBurn = true
): Promise<TxResult> {
  try {
    const connection = getConnection();
    const rawAmount = BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
    const tx = await buildBurnTransaction(walletPublicKey, mintAddress, rawAmount, closeAfterBurn);
    const signed = await signTransaction(tx);
    const signature = await submitSignedTransactionBytes(signed.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    return { success: true, signature };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── TRANSFER SOL ─────────────────────────────────────────────────────────────
export async function transferSOL(
  walletPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  toAddress: string,
  amountSol: number
): Promise<TxResult> {
  try {
    const connection = getConnection();
    const to = new PublicKey(toAddress);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: walletPublicKey, toPubkey: to, lamports })
    );
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = walletPublicKey;

    const signed = await signTransaction(tx);
    const signature = await submitSignedTransactionBytes(signed.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    return { success: true, signature };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── TRANSFER SPL token ───────────────────────────────────────────────────────
export async function transferSPLToken(
  walletPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  mintAddress: string,
  toAddress: string,
  uiAmount: number,
  decimals: number
): Promise<TxResult> {
  try {
    const connection = getConnection();
    const mint = new PublicKey(mintAddress);
    const to = new PublicKey(toAddress);

    const fromAta = await getAssociatedTokenAddress(mint, walletPublicKey);
    const toAta = await getAssociatedTokenAddress(mint, to);

    const rawAmount = BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
    const tx = new Transaction();

    // Create destination ATA if it doesn't exist
    const toAtaInfo = await connection.getAccountInfo(toAta);
    if (!toAtaInfo) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      tx.add(
        createAssociatedTokenAccountInstruction(walletPublicKey, toAta, to, mint)
      );
    }

    tx.add(createTransferInstruction(fromAta, toAta, walletPublicKey, rawAmount));
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = walletPublicKey;

    const signed = await signTransaction(tx);
    const signature = await submitSignedTransactionBytes(signed.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    return { success: true, signature };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── JUPITER SWAP (v2 Meta-Aggregator) ───────────────────────────────────────
// Routers: Metis (iris), JupiterZ RFQ, Dflow, OKX — best price wins.
// Jupiter handles transaction landing, slippage optimization, and retry.

export type JupiterOrderResponse = {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: "iris" | "jupiterz" | "dflow" | "okx" | string;
  mode: "ultra" | "manual";
  slippageBps: number;
  inUsdValue?: number;
  outUsdValue?: number;
  priceImpact?: number;
  errorCode?: number;
  errorMessage?: string;
  error?: string;
};

// Price-check only — no taker, returns quote without transaction
export async function getJupiterOrderPreview(
  inputMint: string,
  outputMint: string,
  rawAmount: number
): Promise<JupiterOrderResponse> {
  const r = await fetch(
    `/api/wallet-ops/jupiter-order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}`
  );
  return r.json();
}

// Full swap: get order, sign, execute via Jupiter's managed pipeline
export async function executeJupiterSwap(
  walletPublicKey: PublicKey,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  inputMint: string,
  outputMint: string,
  uiAmount: number,
  inputDecimals: number,
  slippageBps = 50
): Promise<TxResult & { outAmount?: string; router?: string; outUsdValue?: number }> {
  try {
    const rawAmount = Math.floor(uiAmount * Math.pow(10, inputDecimals));

    // Step 1: Get order (quote + assembled transaction with taker)
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(rawAmount),
      taker: walletPublicKey.toBase58(),
      slippageBps: String(slippageBps),
    });
    const orderRes = await fetch(`/api/wallet-ops/jupiter-order?${params}`);
    const order: JupiterOrderResponse = await orderRes.json();

    if (order.errorCode || !order.transaction || order.transaction === "") {
      const msg = order.errorMessage || order.error || "Jupiter order failed";
      return { success: false, error: msg };
    }

    // Step 2: Deserialize and sign (partial sign — JupiterZ may need MM signature)
    const txBytes = Buffer.from(order.transaction, "base64");
    const vtx = VersionedTransaction.deserialize(txBytes);
    const signed = await signTransaction(vtx);
    const signedBase64 = Buffer.from(signed.serialize()).toString("base64");

    // Step 3: Execute via Jupiter's managed landing pipeline
    const execRes = await fetch("/api/wallet-ops/jupiter-execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedTransaction: signedBase64,
        requestId: order.requestId,
      }),
    });
    const result = await execRes.json();

    if (result.status === "Success") {
      return {
        success: true,
        signature: result.signature,
        outAmount: result.outputAmountResult,
        router: order.router,
        outUsdValue: order.outUsdValue,
      };
    }
    return { success: false, error: result.error || `Swap failed (code ${result.code})` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Convenience: get preview quote for UI display (no signing needed)
export async function getSwapPreview(
  inputMint: string,
  outputMint: string,
  uiAmount: number,
  inputDecimals: number,
  outputDecimals = 6
) {
  const rawAmount = Math.floor(uiAmount * Math.pow(10, inputDecimals));
  const order = await getJupiterOrderPreview(inputMint, outputMint, rawAmount);
  const outUi = order.outAmount
    ? (Number(order.outAmount) / Math.pow(10, outputDecimals)).toFixed(4)
    : "?";
  const routerLabel: Record<string, string> = {
    iris: "Metis", jupiterz: "JupiterZ RFQ", dflow: "Dflow", okx: "OKX",
  };
  return {
    order,
    outUi,
    routerLabel: routerLabel[order.router] ?? order.router ?? "Jupiter",
    priceImpact: order.priceImpact ? `${(order.priceImpact * 100).toFixed(4)}%` : "?",
  };
}

// ─── JUPITER /build (Router) — raw instructions for advanced flows ──────────
// Use when you need to inject custom instructions atomically (referral skim,
// post-swap transfer, multi-action). The client owns simulation, signing, and
// submission via its own RPC. Routing is Metis-only on /build.

type ApiAccount = { pubkey: string; isSigner: boolean; isWritable: boolean };
type ApiInstruction = { programId: string; accounts: ApiAccount[]; data: string };

export type JupiterBuildResponse = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: {
    percent: number;
    bps: number;
    swapInfo: {
      ammKey: string; label: string;
      inputMint: string; outputMint: string;
      inAmount: string; outAmount: string;
    };
  }[];
  computeBudgetInstructions: ApiInstruction[];
  setupInstructions: ApiInstruction[];
  swapInstruction: ApiInstruction;
  cleanupInstruction: ApiInstruction | null;
  otherInstructions: ApiInstruction[];
  tipInstruction: ApiInstruction | null;
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: { blockhash: number[]; lastValidBlockHeight: number };
};

const COMPUTE_UNIT_LIMIT_MAX = 1_400_000;

function toInstruction(ix: ApiInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function transformALTs(raw: Record<string, string[]> | null): AddressLookupTableAccount[] {
  if (!raw) return [];
  return Object.entries(raw).map(([key, addresses]) =>
    new AddressLookupTableAccount({
      key: new PublicKey(key),
      state: {
        deactivationSlot: BigInt("18446744073709551615"),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: addresses.map((a) => new PublicKey(a)),
      },
    }),
  );
}

export type BuildSwapOptions = {
  slippageBps?: number;
  excludeDexes?: string;
  referralAccount?: string;
  referralFee?: number;
  // Custom instructions inserted after the Jupiter swap, before cleanup.
  // Use this for referral skims, post-swap transfers, atomic CPI, etc.
  extraInstructions?: TransactionInstruction[];
  // Compute unit buffer multiplier on simulated usage (default 1.2x)
  cuBuffer?: number;
};

export async function fetchJupiterBuild(
  taker: PublicKey,
  inputMint: string,
  outputMint: string,
  rawAmount: number | bigint,
  opts: Pick<BuildSwapOptions, "slippageBps" | "excludeDexes" | "referralAccount" | "referralFee"> = {},
): Promise<JupiterBuildResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(rawAmount),
    taker: taker.toBase58(),
  });
  if (opts.slippageBps != null)  params.set("slippageBps", String(opts.slippageBps));
  if (opts.excludeDexes)         params.set("excludeDexes", opts.excludeDexes);
  if (opts.referralAccount)      params.set("referralAccount", opts.referralAccount);
  if (opts.referralFee != null)  params.set("referralFee", String(opts.referralFee));

  const r = await fetch(`/api/wallet-ops/jupiter-build?${params}`);
  if (!r.ok) throw new Error(`/jupiter-build failed: ${r.status} ${await r.text()}`);
  return r.json();
}

// Compose a v0 transaction from a /build response. Simulates with max CU,
// then rebuilds with a tight CU limit (1.2x simulated usage by default).
export async function compileJupiterBuildTransaction(
  build: JupiterBuildResponse,
  payer: PublicKey,
  extraInstructions: TransactionInstruction[] = [],
  cuBuffer = 1.2,
): Promise<{ transaction: VersionedTransaction; lastValidBlockHeight: number; blockhash: string }> {
  const connection = getConnection();

  const swapBlock: TransactionInstruction[] = [
    ...build.setupInstructions.map(toInstruction),
    toInstruction(build.swapInstruction),
    ...extraInstructions,
    ...(build.cleanupInstruction ? [toInstruction(build.cleanupInstruction)] : []),
    ...build.otherInstructions.map(toInstruction),
    ...(build.tipInstruction ? [toInstruction(build.tipInstruction)] : []),
  ];

  const altAccounts = transformALTs(build.addressesByLookupTableAddress);
  const recentBlockhash = bs58.encode(Buffer.from(build.blockhashWithMetadata.blockhash));

  // Simulate at max CU to estimate actual usage
  const simMessage = new TransactionMessage({
    payerKey: payer,
    recentBlockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT_MAX }),
      ...swapBlock,
    ],
  }).compileToV0Message(altAccounts);

  const simTx = new VersionedTransaction(simMessage);
  const sim = await connection.simulateTransaction(simTx, { replaceRecentBlockhash: true });
  if (sim.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
  }

  const estimatedCU = sim.value.unitsConsumed
    ? Math.min(Math.ceil(sim.value.unitsConsumed * cuBuffer), COMPUTE_UNIT_LIMIT_MAX)
    : COMPUTE_UNIT_LIMIT_MAX;

  const finalMessage = new TransactionMessage({
    payerKey: payer,
    recentBlockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: estimatedCU }),
      ...build.computeBudgetInstructions.map(toInstruction), // CU price from response
      ...swapBlock,
    ],
  }).compileToV0Message(altAccounts);

  return {
    transaction: new VersionedTransaction(finalMessage),
    lastValidBlockHeight: build.blockhashWithMetadata.lastValidBlockHeight,
    blockhash: recentBlockhash,
  };
}

// End-to-end: fetch /build, inject custom instructions, simulate, sign, submit
// via the project's own RPC (Helius). Returns signature on confirmation.
export async function executeJupiterBuildSwap(
  walletPublicKey: PublicKey,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  inputMint: string,
  outputMint: string,
  uiAmount: number,
  inputDecimals: number,
  opts: BuildSwapOptions = {},
): Promise<TxResult & { outAmount?: string; routePlan?: JupiterBuildResponse["routePlan"] }> {
  try {
    const rawAmount = BigInt(Math.floor(uiAmount * 10 ** inputDecimals));
    const build = await fetchJupiterBuild(walletPublicKey, inputMint, outputMint, rawAmount, opts);

    const { transaction, blockhash, lastValidBlockHeight } = await compileJupiterBuildTransaction(
      build,
      walletPublicKey,
      opts.extraInstructions ?? [],
      opts.cuBuffer ?? 1.2,
    );

    const signed = await signTransaction(transaction);

    const connection = getConnection();
    const signature = await submitSignedTransactionBytes(signed.serialize());

    const conf = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (conf.value.err) {
      return { success: false, error: `Tx failed: ${JSON.stringify(conf.value.err)}`, signature };
    }

    return {
      success: true,
      signature,
      outAmount: build.outAmount,
      routePlan: build.routePlan,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── FREEZE / LOCK token account (requires freeze authority) ─────────────────
// Simple approach: send to a time-lock PDA using StreamFlow or delegate + freeze
// For now, we offer "self-lock" by delegating to a derived PDA
// The real lock uses StreamFlow which is already wired in the backend
export async function createStreamLock(
  walletPublicKey: PublicKey,
  mintAddress: string,
  amount: number,
  durationSeconds: number
): Promise<TxResult> {
  // Delegate to server StreamFlow route
  try {
    const r = await fetch("/api/streamflow/create-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: walletPublicKey.toBase58(),
        mint: mintAddress,
        amount,
        durationSeconds,
      }),
    });
    const data = await r.json();
    return { success: data.success ?? false, signature: data.txId, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function solscanLink(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

export function explorerLink(signature: string) {
  return `https://explorer.solana.com/tx/${signature}`;
}

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
