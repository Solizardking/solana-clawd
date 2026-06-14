import {
  derivePrizeAmountFromHash,
  deriveRarityFromHash,
  isGuaranteedRareSlot,
  selectCardFromHash,
  type AgentCardTemplate,
  type GachaAccessMode,
  type GachaPullCount,
} from "@shared/gacha";

export interface GachaStatusResponse {
  success: boolean;
  fairnessMode: string;
  sessionTtlMs: number;
  access: {
    holderMinimum: number;
    treasuryWallet: string;
    publicSpinPriceSol: number;
    publicSpinPriceLamports: number;
    pricingModel: "per-spin";
  };
  vault: {
    walletAddress: string | null;
    signerAddress: string | null;
    tokenAccount: string | null;
    clawdBalance: number;
    rawBalance: number;
    payoutEnabled: boolean;
    receiptSignerReady: boolean;
    signerCanTransfer: boolean;
    onChainRecordingEnabled: boolean;
    clawdMint: string;
    decimals: number;
    delegatedRawAmount: number;
    vaultAuthorityMode: string;
    maxSinglePrizeClawd: number;
    recommendedBufferClawd: number;
    jackpotCoverage: number;
    shortfallClawd: number;
    readyForClaims: boolean;
    readyForJackpot: boolean;
    readyForRecommendedBuffer: boolean;
    fundingMode: string;
  };
  magicBlock: {
    programId: string | null;
    routerEndpoint: string;
    routerWsEndpoint: string;
    ephemeralEndpoint: string;
    ephemeralWsEndpoint: string;
    vrfOracleQueue: string | null;
    scaffoldReady: boolean;
    readyForOnChainPulls: boolean;
    bundlePullCounts: number[];
    supportsGuaranteedRareTail: boolean;
    currentSettlementMode: string;
    targetSettlementMode: string;
    targetFlow: string;
  };
}

export interface GachaSessionResponse {
  success: boolean;
  sessionId: string;
  walletAddress: string;
  pullCount: GachaPullCount;
  access: {
    mode: GachaAccessMode;
    paymentSignature: string | null;
    publicPriceSol: number;
  };
  createdAt: number;
  expiresAt: number;
  serverSeedHash: string;
  entropyBlockhash: string;
  entropySlot: number | null;
}

export interface GachaRevealCard extends AgentCardTemplate {
  prizeClawd: number;
  proofHash: string;
  guaranteedRarePlus: boolean;
}

export interface GachaRevealResponse {
  success: boolean;
  sessionId: string;
  createdAt: number;
  resolvedAt: number;
  pullCount: GachaPullCount;
  walletAddress: string;
  fairness: {
    mode: string;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    entropyBlockhash: string;
    entropySlot: number | null;
    revealHash: string;
  };
  cards: GachaRevealCard[];
  totalPrizeClawd: number;
  payout: {
    attempted: boolean;
    recordedOnChain: boolean;
    payoutSignature: string | null;
    receiptSignature: string | null;
    explorerUrl: string | null;
    payablePrizeClawd: number;
    error: string | null;
  };
}

export type GachaPaymentRequiredPayload = {
  paymentRequired: true;
  access: {
    mode: GachaAccessMode;
    holderMinimum: number;
    treasuryWallet: string;
    publicSpinPriceSol: number;
    expectedAmountSol: number;
    expectedAmountLamports: number;
    pullCount: GachaPullCount;
  };
};

export type RequestJsonError = Error & {
  status?: number;
  data?: unknown;
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createClientSeed() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function isGachaPaymentRequiredError(
  error: unknown,
): error is RequestJsonError & { data: GachaPaymentRequiredPayload } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "data" in error &&
      (error as { data?: { paymentRequired?: boolean } }).data?.paymentRequired,
  );
}

export async function verifyGachaReveal(
  reveal: GachaRevealResponse,
): Promise<boolean> {
  const expectedServerSeedHash = await sha256Hex(reveal.fairness.serverSeed);
  if (expectedServerSeedHash !== reveal.fairness.serverSeedHash) return false;

  const expectedRevealHash = await sha256Hex(
    [
      reveal.fairness.serverSeed,
      reveal.fairness.clientSeed,
      reveal.walletAddress,
      reveal.fairness.entropyBlockhash,
      String(reveal.pullCount),
      reveal.sessionId,
    ].join(":"),
  );

  if (expectedRevealHash !== reveal.fairness.revealHash) return false;

  let totalPrizeClawd = 0;

  for (let index = 0; index < reveal.cards.length; index += 1) {
    const card = reveal.cards[index];
    const expectedProofHash = await sha256Hex(
      `${reveal.fairness.revealHash}:${index}`,
    );

    if (expectedProofHash !== card.proofHash) return false;

    const guaranteedRarePlus = isGuaranteedRareSlot(reveal.pullCount, index);
    if (guaranteedRarePlus !== card.guaranteedRarePlus) return false;

    const rarity = deriveRarityFromHash(expectedProofHash, guaranteedRarePlus);
    if (rarity !== card.rarity) return false;

    const template = selectCardFromHash(expectedProofHash, rarity);
    if (template.id !== card.id) return false;

    const prizeClawd = derivePrizeAmountFromHash(
      expectedProofHash,
      rarity,
      guaranteedRarePlus,
    );
    if (prizeClawd !== card.prizeClawd) return false;

    totalPrizeClawd += prizeClawd;
  }

  return totalPrizeClawd === reveal.totalPrizeClawd;
}
