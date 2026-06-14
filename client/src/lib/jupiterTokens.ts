// Jupiter Tokens API V2 — typed wrappers for search, tag, category, recent,
// and the Express Verification (1000 JUP) flow. All requests go through the
// /api/jupiter-tokens/* server proxy so the JUPITER_API_KEY stays server-side.

import { VersionedTransaction } from "@solana/web3.js";

const BASE = "/api/jupiter-tokens";

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") qs.set(k, String(v));
    }
  }
  const url = qs.toString() ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`tokens ${path} ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`tokens POST ${path} ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}

// ─── Types (mirrors MintInformation schema) ──────────────────────────────────

export type SwapStats = {
  priceChange?: number | null;
  holderChange?: number | null;
  liquidityChange?: number | null;
  volumeChange?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
  buyOrganicVolume?: number | null;
  sellOrganicVolume?: number | null;
  numBuys?: number | null;
  numSells?: number | null;
  numTraders?: number | null;
  numOrganicBuyers?: number | null;
  numNetBuyers?: number | null;
};

export type TokenAudit = {
  isSus?: boolean;
  mintAuthorityDisabled?: boolean | null;
  freezeAuthorityDisabled?: boolean | null;
  topHoldersPercentage?: number | null;
  devBalancePercentage?: number | null;
  devMints?: number | null;
};

export type MintInformation = {
  id: string;
  name: string;
  symbol: string;
  icon?: string | null;
  decimals: number;
  tokenProgram?: string;
  createdAt?: string;

  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  discord?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  otherUrl?: string | null;
  dev?: string | null;

  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  circSupply?: number | null;
  totalSupply?: number | null;
  launchpad?: string | null;
  partnerConfig?: string | null;
  graduatedPool?: string | null;
  graduatedAt?: string | null;
  holderCount?: number | null;

  fdv?: number | null;
  mcap?: number | null;
  usdPrice?: number | null;
  priceBlockId?: number | null;
  liquidity?: number | null;
  apy?: { jupEarn?: number } | null;

  stats5m?: SwapStats | null;
  stats1h?: SwapStats | null;
  stats6h?: SwapStats | null;
  stats24h?: SwapStats | null;

  firstPool?: { id: string; createdAt: string } | null;
  audit?: TokenAudit | null;

  organicScore: number;
  organicScoreLabel: "high" | "medium" | "low";
  isVerified?: boolean | null;
  tags?: string[] | null;

  updatedAt?: string;
};

export type TokenTag = "lst" | "verified" | "stocks";
export type TokenCategory = "toporganicscore" | "toptraded" | "toptrending";
export type TokenInterval = "5m" | "1h" | "6h" | "24h";

// ─── Search · Tag · Category · Recent ────────────────────────────────────────

// Search by symbol, name, or mint. For multiple mints, comma-separate (max 100).
export const searchTokens = (query: string) => get<MintInformation[]>("/search", { query });

export const getTokensByTag = (tag: TokenTag) => get<MintInformation[]>("/tag", { query: tag });

export const getTokenCategory = (category: TokenCategory, interval: TokenInterval, limit?: number) =>
  get<MintInformation[]>(`/${category}/${interval}`, { limit });

export const getRecentTokens = () => get<MintInformation[]>("/recent");

// ─── Express Verification (1000 JUP) ─────────────────────────────────────────

export type VerifyEligibility = {
  tokenExists: boolean;
  isVerified: boolean;
  canVerify: boolean;
  canMetadata: boolean;
  verificationError?: string;
  metadataError?: string;
};

export type VerifyCraftResponse = {
  transaction: string;     // base64-encoded unsigned tx
  requestId: string;
  mint: string;            // JUP mint
  amount: string;          // 1_000_000_000 = 1000 JUP
  expireAt: string;
  gasless: boolean;
};

export type TokenMetadataInput = {
  tokenId: string;
  name?: string;
  symbol?: string;
  icon?: string;
  website?: string;
  twitter?: string;
  twitterCommunity?: string;
  telegram?: string;
  discord?: string;
  instagram?: string;
  tiktok?: string;
  tokenDescription?: string;
  circulatingSupply?: string;
  circulatingSupplyUrl?: string;
  coingeckoCoinId?: string;
  otherUrl?: string;
};

export type VerifyExecuteRequest = {
  transaction: string;          // base64 SIGNED tx
  requestId: string;
  senderAddress: string;
  tokenId: string;
  twitterHandle?: string;
  description?: string;
  tokenMetadata?: TokenMetadataInput;
};

export type VerifyExecuteResponse = {
  status: "Success" | "Failed";
  signature?: string;
  totalTime?: number;
  verificationCreated?: boolean;
  metadataCreated?: boolean;
  error?: string;
};

export const checkVerifyEligibility = (tokenId: string) =>
  get<VerifyEligibility>("/verify/check-eligibility", { tokenId });

export const craftVerifyPaymentTxn = (senderAddress: string) =>
  get<VerifyCraftResponse>("/verify/craft-txn", { senderAddress });

export const executeVerifySubmission = (body: VerifyExecuteRequest) =>
  post<VerifyExecuteResponse>("/verify/execute", body);

// End-to-end helper: check eligibility → craft → sign → execute.
// Throws if the token can't be verified and metadata can't be updated.
export async function submitTokenForExpressVerification(opts: {
  tokenId: string;
  senderAddress: string;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  twitterHandle?: string;
  description?: string;
  tokenMetadata?: TokenMetadataInput;
  skipEligibilityCheck?: boolean;
}): Promise<VerifyExecuteResponse> {
  if (!opts.skipEligibilityCheck) {
    const eligibility = await checkVerifyEligibility(opts.tokenId);
    if (!eligibility.canVerify && !eligibility.canMetadata) {
      throw new Error(
        eligibility.verificationError
          || eligibility.metadataError
          || "Token is not eligible for verification or metadata update",
      );
    }
  }

  const craft = await craftVerifyPaymentTxn(opts.senderAddress);
  const tx = VersionedTransaction.deserialize(Buffer.from(craft.transaction, "base64"));
  const signed = await opts.signTransaction(tx);
  const signedB64 = Buffer.from(signed.serialize()).toString("base64");

  return executeVerifySubmission({
    transaction: signedB64,
    requestId: craft.requestId,
    senderAddress: opts.senderAddress,
    tokenId: opts.tokenId,
    twitterHandle: opts.twitterHandle,
    description: opts.description,
    tokenMetadata: opts.tokenMetadata,
  });
}
