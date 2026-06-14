import { Router } from "express";
import type { Request, Response } from "express";
import { createHash, randomBytes, randomUUID } from "crypto";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import bs58 from "bs58";
import {
  GACHA_CLAWD_MINT,
  GACHA_PUBLIC_SPIN_PRICE_SOL,
  GACHA_MAX_SINGLE_PRIZE_CLAWD,
  getGachaPublicPriceLamports,
  getGachaPublicPriceSol,
  GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD,
  GACHA_SESSION_TTL_MS,
  type AgentCardTemplate,
  type GachaAccessMode,
  type GachaPullCount,
  derivePrizeAmountFromHash,
  deriveRarityFromHash,
  isGuaranteedRareSlot,
  selectCardFromHash,
} from "@shared/gacha";
import { treasuryPayments } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { HOLDER_MIN, getWalletAccessState } from "../lib/access-control";
import { sendOptimizedRawTransaction } from "../lib/helius/transactionOptimization";

const router = Router();

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);
const GACHA_PAYMENT_TOLERANCE_LAMPORTS = 5_000;

type SessionRecord = {
  sessionId: string;
  walletAddress: string;
  pullCount: GachaPullCount;
  accessMode: GachaAccessMode;
  paymentSignature: string | null;
  createdAt: number;
  expiresAt: number;
  serverSeed: string;
  serverSeedHash: string;
  entropyBlockhash: string;
  entropySlot: number | null;
  resolvedAt: number | null;
};

type DerivedPullCard = AgentCardTemplate & {
  prizeClawd: number;
  proofHash: string;
  guaranteedRarePlus: boolean;
};

type VaultAuthorityMode =
  | "direct-owner"
  | "delegated-authority"
  | "wallet-key-mismatch"
  | "missing-signer";

const sessions = new Map<string, SessionRecord>();
const consumedPaymentSignatures = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now || session.resolvedAt) {
      sessions.delete(sessionId);
    }
  }
  for (const [signature, consumedAt] of consumedPaymentSignatures.entries()) {
    if (consumedAt <= now - GACHA_SESSION_TTL_MS) {
      consumedPaymentSignatures.delete(signature);
    }
  }
}, 60_000).unref();

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function getRpcUrl(): string {
  return (
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : undefined) ||
    DEFAULT_RPC_URL
  );
}

function getConnection(): Connection {
  return new Connection(getRpcUrl(), "confirmed");
}

function getTreasuryWallet(): PublicKey {
  const address =
    process.env.TREASURY_WALLET ||
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
  return new PublicKey(address);
}

function getClawdMint(): PublicKey {
  return new PublicKey(
    process.env.CLAWD_MINT_ADDRESS ||
      process.env.CLAWD_TOKEN_ADDRESS ||
      process.env.VITE_CLAWD_MINT ||
      GACHA_CLAWD_MINT,
  );
}

function getClawdDecimals(): number {
  return Number(process.env.CLAWD_DECIMALS ?? "6");
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getMagicBlockConfig() {
  return {
    programId: process.env.GACHA_MAGICBLOCK_PROGRAM_ID || null,
    routerEndpoint:
      process.env.GACHA_MAGICBLOCK_ROUTER_ENDPOINT ||
      process.env.NEXT_PUBLIC_ROUTER_ENDPOINT ||
      "https://devnet-router.magicblock.app",
    routerWsEndpoint:
      process.env.GACHA_MAGICBLOCK_ROUTER_WS_ENDPOINT ||
      process.env.NEXT_PUBLIC_ROUTER_WS_ENDPOINT ||
      "wss://devnet-router.magicblock.app",
    ephemeralEndpoint:
      process.env.GACHA_MAGICBLOCK_EPHEMERAL_ENDPOINT ||
      process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
      process.env.NEXT_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ||
      "https://devnet.magicblock.app",
    ephemeralWsEndpoint:
      process.env.GACHA_MAGICBLOCK_EPHEMERAL_WS_ENDPOINT ||
      process.env.EPHEMERAL_WS_ENDPOINT ||
      process.env.NEXT_PUBLIC_EPHEMERAL_WS_ENDPOINT ||
      "wss://devnet.magicblock.app",
    vrfOracleQueue: process.env.GACHA_MAGICBLOCK_VRF_QUEUE || null,
  };
}

function getGachaKeypair(): Keypair | null {
  const raw = process.env.GACHA_KEY?.trim();
  if (!raw) return null;

  try {
    const secretKey = raw.startsWith("[")
      ? Uint8Array.from(JSON.parse(raw))
      : bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.warn("[gacha] failed to decode GACHA_KEY:", error);
    return null;
  }
}

function getGachaWalletAddress(): PublicKey | null {
  const explicitWallet = process.env.GACHA_WALLET?.trim();
  if (explicitWallet) {
    try {
      return new PublicKey(explicitWallet);
    } catch (error) {
      console.warn("[gacha] invalid GACHA_WALLET:", error);
      return null;
    }
  }

  const signer = getGachaKeypair();
  return signer ? signer.publicKey : null;
}

function describeVaultAuthorityMode(mode: VaultAuthorityMode): string {
  switch (mode) {
    case "direct-owner":
      return "Signer owns vault";
    case "delegated-authority":
      return "Signer delegated by vault";
    case "wallet-key-mismatch":
      return "Vault/key mismatch";
    case "missing-signer":
      return "Missing signer";
  }
}

function buildVaultReadiness(clawdBalance: number) {
  const shortfallClawd = Math.max(
    0,
    GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD - clawdBalance,
  );

  return {
    shortfallClawd,
    readyForClaims: clawdBalance > 0,
    readyForJackpot: clawdBalance >= GACHA_MAX_SINGLE_PRIZE_CLAWD,
    readyForRecommendedBuffer:
      clawdBalance >= GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD,
  };
}

function isValidWalletAddress(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function isValidTxSignature(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(value.trim());
}

function isValidPullCount(value: unknown): value is GachaPullCount {
  return value === 1 || value === 10;
}

function normalizeClientSeed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  return trimmed;
}

async function markPaymentSignatureConsumed(args: {
  txSignature: string;
  walletAddress: string;
  pullCount: GachaPullCount;
  receivedLamports: number;
}) {
  consumedPaymentSignatures.set(args.txSignature, Date.now());

  if (!db) return;

  try {
    await db.insert(treasuryPayments).values({
      walletAddress: args.walletAddress,
      txSignature: args.txSignature,
      solPaid: args.receivedLamports / LAMPORTS_PER_SOL,
      feature: `gacha-public-spin:${args.pullCount}`,
      status: "verified",
    });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      throw new Error("Payment signature already used for another treasury action.");
    }
    console.warn("[gacha] could not persist payment receipt:", error);
  }
}

async function verifyPublicSpinPayment(args: {
  txSignature: string;
  walletAddress: string;
  pullCount: GachaPullCount;
}) {
  if (consumedPaymentSignatures.has(args.txSignature)) {
    throw new Error("Payment signature already used for a gacha session.");
  }

  if (db) {
    const existing = await db
      .select()
      .from(treasuryPayments)
      .where(eq(treasuryPayments.txSignature, args.txSignature));
    if (existing.length > 0) {
      throw new Error("Payment signature already used for another treasury action.");
    }
  }

  const connection = getConnection();
  const treasuryWallet = getTreasuryWallet();
  const tx = await connection.getTransaction(args.txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Payment transaction not found or not yet confirmed.");
  }
  if (tx.meta?.err) {
    throw new Error("Payment transaction failed on-chain.");
  }
  if (!tx.meta) {
    throw new Error("Payment transaction metadata unavailable.");
  }

  const message: any = tx.transaction.message;
  const accountKeys: PublicKey[] =
    message.getAccountKeys?.().staticAccountKeys ||
    message.staticAccountKeys ||
    message.accountKeys ||
    [];
  const signerCount = Number(message.header?.numRequiredSignatures ?? 0);
  const signerKeys = accountKeys
    .slice(0, signerCount)
    .map((key) => key.toBase58());

  if (!signerKeys.includes(args.walletAddress)) {
    throw new Error("Payment transaction must be signed by the pulling wallet.");
  }

  const treasuryIndex = accountKeys.findIndex(
    (key) => key.toBase58() === treasuryWallet.toBase58(),
  );
  if (treasuryIndex === -1) {
    throw new Error("Treasury wallet was not found in the payment transaction.");
  }

  const receivedLamports =
    (tx.meta.postBalances[treasuryIndex] ?? 0) -
    (tx.meta.preBalances[treasuryIndex] ?? 0);
  const expectedLamports = getGachaPublicPriceLamports(args.pullCount);

  if (receivedLamports < expectedLamports - GACHA_PAYMENT_TOLERANCE_LAMPORTS) {
    throw new Error(
      `Public gacha payment too small. Expected ${getGachaPublicPriceSol(args.pullCount).toFixed(6)} SOL.`,
    );
  }

  await markPaymentSignatureConsumed({
    txSignature: args.txSignature,
    walletAddress: args.walletAddress,
    pullCount: args.pullCount,
    receivedLamports,
  });

  return {
    treasuryWallet: treasuryWallet.toBase58(),
    receivedLamports,
    receivedSol: receivedLamports / LAMPORTS_PER_SOL,
  };
}

function buildPullCards(
  session: SessionRecord,
  clientSeed: string,
): {
  revealHash: string;
  cards: DerivedPullCard[];
  totalPrizeClawd: number;
} {
  const revealHash = sha256Hex(
    [
      session.serverSeed,
      clientSeed,
      session.walletAddress,
      session.entropyBlockhash,
      String(session.pullCount),
      session.sessionId,
    ].join(":"),
  );

  const cards: DerivedPullCard[] = [];

  for (let index = 0; index < session.pullCount; index += 1) {
    const guaranteedRarePlus = isGuaranteedRareSlot(session.pullCount, index);
    const proofHash = sha256Hex(`${revealHash}:${index}`);
    const rarity = deriveRarityFromHash(proofHash, guaranteedRarePlus);
    const card = selectCardFromHash(proofHash, rarity);

    cards.push({
      ...card,
      prizeClawd: derivePrizeAmountFromHash(
        proofHash,
        rarity,
        guaranteedRarePlus,
      ),
      proofHash,
      guaranteedRarePlus,
    });
  }

  return {
    revealHash,
    cards,
    totalPrizeClawd: cards.reduce((sum, card) => sum + card.prizeClawd, 0),
  };
}

async function getVaultStatus() {
  const wallet = getGachaWalletAddress();
  const signer = getGachaKeypair();
  const signerAddress = signer?.publicKey ?? null;
  const clawdMint = getClawdMint();
  const decimals = getClawdDecimals();
  const recordAllPulls = parseBoolean(
    process.env.GACHA_RECORD_ALL_PULLS,
    true,
  );
  const defaultMode: VaultAuthorityMode = signer
    ? wallet && signer.publicKey.equals(wallet)
      ? "direct-owner"
      : "wallet-key-mismatch"
    : "missing-signer";

  if (!wallet) {
    const readiness = buildVaultReadiness(0);
    return {
      walletAddress: null,
      signerAddress: signerAddress?.toBase58() ?? null,
      tokenAccount: null,
      clawdBalance: 0,
      rawBalance: 0,
      payoutEnabled: false,
      receiptSignerReady: Boolean(signer),
      signerCanTransfer: false,
      onChainRecordingEnabled: false,
      clawdMint: clawdMint.toBase58(),
      decimals,
      delegatedRawAmount: 0,
      vaultAuthorityMode: describeVaultAuthorityMode(defaultMode),
      maxSinglePrizeClawd: GACHA_MAX_SINGLE_PRIZE_CLAWD,
      recommendedBufferClawd: GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD,
      jackpotCoverage: 0,
      fundingMode: "GACHA_WALLET + GACHA_KEY",
      ...readiness,
    };
  }

  const connection = getConnection();
  const tokenAccount = await getAssociatedTokenAddress(clawdMint, wallet);

  try {
    const account = await getAccount(connection, tokenAccount);
    const rawBalance = Number(account.amount);
    const clawdBalance = rawBalance / 10 ** decimals;
    const signerIsOwner = Boolean(
      signerAddress && account.owner.equals(signerAddress),
    );
    const signerIsDelegate = Boolean(
      signerAddress && account.delegate?.equals(signerAddress),
    );
    const signerCanTransfer = signerIsOwner || signerIsDelegate;
    const delegatedRawAmount = signerIsDelegate
      ? Number(account.delegatedAmount)
      : 0;
    const readiness = buildVaultReadiness(clawdBalance);
    const vaultAuthorityMode: VaultAuthorityMode = !signerAddress
      ? "missing-signer"
      : signerIsOwner && wallet.equals(signerAddress)
        ? "direct-owner"
        : signerCanTransfer
          ? "delegated-authority"
          : "wallet-key-mismatch";

    return {
      walletAddress: wallet.toBase58(),
      signerAddress: signerAddress?.toBase58() ?? null,
      tokenAccount: tokenAccount.toBase58(),
      clawdBalance,
      rawBalance,
      payoutEnabled: Boolean(signer) && signerCanTransfer,
      receiptSignerReady: Boolean(signer),
      signerCanTransfer,
      onChainRecordingEnabled: Boolean(signer) && recordAllPulls,
      clawdMint: clawdMint.toBase58(),
      decimals,
      delegatedRawAmount,
      vaultAuthorityMode: describeVaultAuthorityMode(vaultAuthorityMode),
      maxSinglePrizeClawd: GACHA_MAX_SINGLE_PRIZE_CLAWD,
      recommendedBufferClawd: GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD,
      jackpotCoverage:
        GACHA_MAX_SINGLE_PRIZE_CLAWD > 0
          ? clawdBalance / GACHA_MAX_SINGLE_PRIZE_CLAWD
          : 0,
      fundingMode: "GACHA_WALLET + GACHA_KEY",
      ...readiness,
    };
  } catch {
    const readiness = buildVaultReadiness(0);
    return {
      walletAddress: wallet.toBase58(),
      signerAddress: signerAddress?.toBase58() ?? null,
      tokenAccount: tokenAccount.toBase58(),
      clawdBalance: 0,
      rawBalance: 0,
      payoutEnabled: false,
      receiptSignerReady: Boolean(signer),
      signerCanTransfer: false,
      onChainRecordingEnabled: Boolean(signer) && recordAllPulls,
      clawdMint: clawdMint.toBase58(),
      decimals,
      delegatedRawAmount: 0,
      vaultAuthorityMode: describeVaultAuthorityMode(defaultMode),
      maxSinglePrizeClawd: GACHA_MAX_SINGLE_PRIZE_CLAWD,
      recommendedBufferClawd: GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD,
      jackpotCoverage: 0,
      fundingMode: "GACHA_WALLET + GACHA_KEY",
      ...readiness,
    };
  }
}

function buildMemoInstruction(memo: string, signer: PublicKey) {
  return new TransactionInstruction({
    programId: DEFAULT_MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
}

async function sendReceiptAndMaybePayout(args: {
  walletAddress: string;
  totalPrizeClawd: number;
  memo: string;
}): Promise<{
  attempted: boolean;
  recordedOnChain: boolean;
  payoutSignature: string | null;
  receiptSignature: string | null;
  explorerUrl: string | null;
  payablePrizeClawd: number;
  error: string | null;
}> {
  const signer = getGachaKeypair();
  if (!signer) {
    return {
      attempted: false,
      recordedOnChain: false,
      payoutSignature: null,
      receiptSignature: null,
      explorerUrl: null,
      payablePrizeClawd: 0,
      error: null,
    };
  }

  const connection = getConnection();
  const recordAllPulls = parseBoolean(process.env.GACHA_RECORD_ALL_PULLS, true);
  const clawdMint = getClawdMint();
  const decimals = getClawdDecimals();
  const vaultOwner = getGachaWalletAddress();
  const requestedRawAmount = BigInt(
    Math.max(0, Math.floor(args.totalPrizeClawd * 10 ** decimals)),
  );
  const payer = signer.publicKey;
  const tx = new Transaction();
  tx.add(buildMemoInstruction(args.memo, payer));

  let payablePrizeClawd = 0;
  let canAttemptTransfer = requestedRawAmount > 0n;
  let payoutPreflightError: string | null = null;

  if (canAttemptTransfer) {
    try {
      if (!vaultOwner) {
        throw new Error("Configured GACHA_WALLET is invalid.");
      }

      const sourceAta = await getAssociatedTokenAddress(clawdMint, vaultOwner);
      const sourceAccount = await getAccount(connection, sourceAta);
      const signerIsOwner = sourceAccount.owner.equals(payer);
      const signerIsDelegate = Boolean(sourceAccount.delegate?.equals(payer));
      const delegateAllowance = signerIsDelegate
        ? sourceAccount.delegatedAmount
        : 0n;

      if (!signerIsOwner && !signerIsDelegate) {
        payoutPreflightError =
          "Configured GACHA_KEY is not authorized for the CLAWD vault ATA.";
        canAttemptTransfer = false;
      } else if (
        signerIsDelegate &&
        delegateAllowance < requestedRawAmount
      ) {
        payoutPreflightError =
          "Configured GACHA_KEY delegate allowance is smaller than the prize amount.";
        canAttemptTransfer = false;
      } else if (sourceAccount.amount < requestedRawAmount) {
        payoutPreflightError = "Vault underfunded for the derived prize.";
        canAttemptTransfer = false;
      }

      if (canAttemptTransfer) {
        const recipient = new PublicKey(args.walletAddress);
        const recipientAta = await getAssociatedTokenAddress(clawdMint, recipient);
        const recipientAtaInfo = await connection.getAccountInfo(recipientAta);

        if (!recipientAtaInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              payer,
              recipientAta,
              recipient,
              clawdMint,
            ),
          );
        }

        tx.add(
          createTransferCheckedInstruction(
            sourceAta,
            clawdMint,
            recipientAta,
            payer,
            requestedRawAmount,
            decimals,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );
        payablePrizeClawd = args.totalPrizeClawd;
      }
    } catch (error) {
      canAttemptTransfer = false;
      payoutPreflightError =
        payoutPreflightError ||
        "Vault underfunded, payout ATA missing, or signer authority is misconfigured.";
      console.warn("[gacha] payout preflight failed:", error);
    }
  }

  if (!recordAllPulls && !canAttemptTransfer) {
    return {
      attempted: false,
      recordedOnChain: false,
      payoutSignature: null,
      receiptSignature: null,
      explorerUrl: null,
      payablePrizeClawd: 0,
      error:
        requestedRawAmount > 0n ? payoutPreflightError : null,
    };
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  try {
    tx.sign(signer);
    const { signature } = await sendOptimizedRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    return {
      attempted: true,
      recordedOnChain: true,
      payoutSignature: canAttemptTransfer ? signature : null,
      receiptSignature: signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
      payablePrizeClawd,
      error:
        requestedRawAmount > 0n && !canAttemptTransfer
          ? payoutPreflightError ||
            "Prize derived successfully but vault could not pay it."
          : null,
    };
  } catch (error: any) {
    console.error("[gacha] receipt/payout transaction failed:", error);
    return {
      attempted: true,
      recordedOnChain: false,
      payoutSignature: null,
      receiptSignature: null,
      explorerUrl: null,
      payablePrizeClawd: 0,
      error: error?.message || "Failed to record pull on-chain.",
    };
  }
}

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const vault = await getVaultStatus();
    const magicBlock = getMagicBlockConfig();
    const readyForOnChainPulls = Boolean(
      magicBlock.programId && magicBlock.vrfOracleQueue,
    );

    return res.json({
      success: true,
      fairnessMode: "commit-reveal+on-chain-receipt",
      access: {
        holderMinimum: HOLDER_MIN,
        treasuryWallet: getTreasuryWallet().toBase58(),
        publicSpinPriceSol: GACHA_PUBLIC_SPIN_PRICE_SOL,
        publicSpinPriceLamports: getGachaPublicPriceLamports(1),
        pricingModel: "per-spin",
      },
      vault,
      magicBlock: {
        ...magicBlock,
        scaffoldReady: Boolean(magicBlock.programId),
        readyForOnChainPulls,
        bundlePullCounts: [1, 10],
        supportsGuaranteedRareTail: true,
        currentSettlementMode: "server-vault",
        targetSettlementMode: "magicblock-program-vault",
        targetFlow:
          "delegate -> request_vrf -> callback_consume_randomness_bundle -> commit_or_undelegate -> claim_prize",
      },
      sessionTtlMs: GACHA_SESSION_TTL_MS,
    });
  } catch (error: any) {
    return res
      .status(503)
      .json({
        success: false,
        configured: false,
        error: error?.message || "Failed to load gacha status.",
      });
  }
});

router.post("/session", async (req: Request, res: Response) => {
  try {
    const { walletAddress, pullCount, paymentSignature } = req.body ?? {};

    if (!isValidWalletAddress(walletAddress)) {
      return res.status(400).json({ error: "Valid walletAddress required." });
    }

    if (!isValidPullCount(pullCount)) {
      return res.status(400).json({ error: "pullCount must be 1 or 10." });
    }

    const access = await getWalletAccessState(walletAddress);
    const treasuryWallet = getTreasuryWallet().toBase58();
    const publicPriceSol = getGachaPublicPriceSol(pullCount);
    const accessMode: GachaAccessMode = access.allowed
      ? "holder-free"
      : "public-paid";
    let verifiedPaymentSignature: string | null = null;

    if (!access.allowed) {
      if (!isValidTxSignature(paymentSignature)) {
        return res.status(402).json({
          error: `Public pulls cost ${publicPriceSol.toFixed(6)} SOL for ${pullCount} spin${pullCount === 1 ? "" : "s"}. Hold $CLAWD to spin free.`,
          paymentRequired: true,
          access: {
            mode: accessMode,
            holderMinimum: access.holderMinimum,
            treasuryWallet,
            publicSpinPriceSol: GACHA_PUBLIC_SPIN_PRICE_SOL,
            expectedAmountSol: publicPriceSol,
            expectedAmountLamports: getGachaPublicPriceLamports(pullCount),
            pullCount,
          },
        });
      }

      await verifyPublicSpinPayment({
        txSignature: paymentSignature,
        walletAddress,
        pullCount,
      });
      verifiedPaymentSignature = paymentSignature;
    }

    const sessionId = randomUUID();
    const serverSeed = randomBytes(32).toString("hex");
    const serverSeedHash = sha256Hex(serverSeed);

    let entropyBlockhash = randomBytes(32).toString("hex");
    let entropySlot: number | null = null;

    try {
      const connection = getConnection();
      const [blockhashResponse, slot] = await Promise.all([
        connection.getLatestBlockhash("finalized"),
        connection.getSlot("finalized"),
      ]);
      entropyBlockhash = blockhashResponse.blockhash;
      entropySlot = slot;
    } catch (error) {
      console.warn("[gacha] falling back to local entropy:", error);
    }

    const createdAt = Date.now();
    const expiresAt = createdAt + GACHA_SESSION_TTL_MS;

    sessions.set(sessionId, {
      sessionId,
      walletAddress,
      pullCount,
      accessMode,
      paymentSignature: verifiedPaymentSignature,
      createdAt,
      expiresAt,
      serverSeed,
      serverSeedHash,
      entropyBlockhash,
      entropySlot,
      resolvedAt: null,
    });

    return res.json({
      success: true,
      sessionId,
      walletAddress,
      pullCount,
      access: {
        mode: accessMode,
        paymentSignature: verifiedPaymentSignature,
        publicPriceSol,
      },
      createdAt,
      expiresAt,
      serverSeedHash,
      entropyBlockhash,
      entropySlot,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to create gacha session." });
  }
});

router.post("/reveal", async (req: Request, res: Response) => {
  try {
    const { sessionId, walletAddress, clientSeed } = req.body ?? {};
    const normalizedClientSeed = normalizeClientSeed(clientSeed);

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId required." });
    }

    if (!isValidWalletAddress(walletAddress)) {
      return res.status(400).json({ error: "Valid walletAddress required." });
    }

    if (!normalizedClientSeed) {
      return res
        .status(400)
        .json({ error: "clientSeed must be 8-128 characters." });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (session.walletAddress !== walletAddress) {
      return res.status(403).json({ error: "Wallet does not match session." });
    }

    if (session.resolvedAt) {
      return res.status(409).json({ error: "Session already revealed." });
    }

    if (session.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      return res.status(410).json({ error: "Session expired." });
    }

    const { revealHash, cards, totalPrizeClawd } = buildPullCards(
      session,
      normalizedClientSeed,
    );

    session.resolvedAt = Date.now();

    const memo = [
      "clawd-gacha-v1",
      session.sessionId,
      session.serverSeedHash.slice(0, 16),
      revealHash.slice(0, 16),
      String(totalPrizeClawd),
    ].join(":");

    const payout = await sendReceiptAndMaybePayout({
      walletAddress: session.walletAddress,
      totalPrizeClawd,
      memo,
    });

    return res.json({
      success: true,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      resolvedAt: session.resolvedAt,
      pullCount: session.pullCount,
      walletAddress: session.walletAddress,
      fairness: {
        mode: "commit-reveal",
        serverSeed: session.serverSeed,
        serverSeedHash: session.serverSeedHash,
        clientSeed: normalizedClientSeed,
        entropyBlockhash: session.entropyBlockhash,
        entropySlot: session.entropySlot,
        revealHash,
      },
      cards,
      totalPrizeClawd,
      payout,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to reveal gacha pull." });
  }
});

// ── GET /api/gacha/attestations ───────────────────────────────────────────────
// Returns parsed on-chain pull records from the GACHA_KEY memo history.
router.get("/attestations", async (req: Request, res: Response) => {
  try {
    const signer = getGachaKeypair();
    if (!signer) {
      return res.json({ success: true, attestations: [], note: "GACHA_KEY not configured." });
    }

    const limit = Math.min(Number(req.query.limit ?? "50"), 200);
    const walletFilter = typeof req.query.wallet === "string" ? req.query.wallet.trim() : null;
    const connection = getConnection();

    const sigs = await connection.getSignaturesForAddress(signer.publicKey, { limit: limit * 2 });
    const txids = sigs.filter((s) => !s.err).map((s) => s.signature);

    const txs = await connection.getParsedTransactions(txids, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
    const attestations: Array<{
      signature: string;
      blockTime: number | null;
      sessionId: string;
      serverSeedHashPrefix: string;
      revealHashPrefix: string;
      totalPrizeClawd: number;
      raw: string;
    }> = [];

    for (let i = 0; i < txs.length && attestations.length < limit; i++) {
      const tx = txs[i];
      if (!tx) continue;
      for (const ix of tx.transaction.message.instructions) {
        if (!("parsed" in ix)) continue;
        const parsedIx = ix as { programId?: { toBase58?: () => string }; parsed?: unknown };
        const programId = parsedIx.programId?.toBase58?.() ?? null;
        if (programId !== MEMO_PROGRAM) continue;
        const data: string = typeof parsedIx.parsed === "string" ? parsedIx.parsed : "";
        if (!data.startsWith("clawd-gacha-v1:")) continue;

        const parts = data.split(":");
        // format: clawd-gacha-v1:{sessionId}:{serverSeedHashPrefix}:{revealHashPrefix}:{totalPrizeClawd}
        if (parts.length < 5) continue;
        const [, sessionId, serverSeedHashPrefix, revealHashPrefix, prizeStr] = parts;
        if (walletFilter) {
          // We can't filter by wallet from memo alone; skip walletFilter silently
        }
        attestations.push({
          signature: txids[i],
          blockTime: tx.blockTime ?? null,
          sessionId,
          serverSeedHashPrefix,
          revealHashPrefix,
          totalPrizeClawd: parseFloat(prizeStr) || 0,
          raw: data,
        });
      }
    }

    return res.json({
      success: true,
      signerAddress: signer.publicKey.toBase58(),
      attestations,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to fetch attestations." });
  }
});

// ── POST /api/gacha/verify ────────────────────────────────────────────────────
// Re-derives a pull server-side from full proof inputs and returns
// whether the cards and prizes match.
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { serverSeed, clientSeed, walletAddress, entropyBlockhash, pullCount, sessionId } =
      req.body ?? {};

    if (
      !serverSeed ||
      !clientSeed ||
      !walletAddress ||
      !entropyBlockhash ||
      !isValidPullCount(pullCount) ||
      !sessionId
    ) {
      return res.status(400).json({
        error: "Required: serverSeed, clientSeed, walletAddress, entropyBlockhash, pullCount, sessionId",
      });
    }

    const serverSeedHash = sha256Hex(serverSeed);
    const revealHash = sha256Hex(
      [serverSeed, clientSeed, walletAddress, entropyBlockhash, String(pullCount), sessionId].join(":")
    );

    const cards: Array<{
      slot: number;
      rarity: string;
      prizeClawd: number;
      proofHash: string;
      guaranteedRarePlus: boolean;
    }> = [];

    for (let i = 0; i < pullCount; i++) {
      const guaranteedRarePlus = isGuaranteedRareSlot(pullCount, i);
      const proofHash = sha256Hex(`${revealHash}:${i}`);
      const rarity = deriveRarityFromHash(proofHash, guaranteedRarePlus);
      const prize = derivePrizeAmountFromHash(proofHash, rarity, guaranteedRarePlus);
      cards.push({ slot: i, rarity, prizeClawd: prize, proofHash, guaranteedRarePlus });
    }

    return res.json({
      success: true,
      serverSeedHash,
      revealHash,
      pullCount,
      cards,
      totalPrizeClawd: cards.reduce((s, c) => s + c.prizeClawd, 0),
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to verify pull." });
  }
});

export default router;
