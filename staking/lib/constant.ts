import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ── PDA seeds (must match Rust constant.rs) ────────────────────────────────
export const GLOBAL_AUTHORITY_SEED = "global-authority";
export const USER_POOL_SEED = "user-pool";
export const CLAWD_VERIFIED_SEED = "clawd-verified";
export const CLAWD_VAULT_SEED = "clawd-vault";

// ── Program ────────────────────────────────────────────────────────────────
export const PROGRAM_ID = new PublicKey(
  process.env.OPENCLAWD_AGENT_STAKING_PROGRAM_ID ??
    "D5MLxrKAnppBVLuukKQzQGTMSfEwBqWCDPGAhGhthdLP"
);

// ── $CLAWD token ───────────────────────────────────────────────────────────
/** $CLAWD SPL token mint on Solana mainnet (pump.fun). */
export const CLAWD_MINT = new PublicKey(
  process.env.CLAWD_MINT ?? "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
);

/**
 * Minimum CLAWD base-units (6 decimals) required for Clawd Verified status.
 * 100_000_000 = 100 CLAWD tokens.
 */
export const MIN_CLAWD_STAKE = new BN(100_000_000);

// ── Collection ────────────────────────────────────────────────────────────
export const CORE_COLLECTION_ADDRESS = new PublicKey(
  process.env.OPENCLAWD_AGENT_COLLECTION ?? "11111111111111111111111111111111"
);

// ── RPC ───────────────────────────────────────────────────────────────────
export const DEFAULT_DEVNET_RPC =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const DEFAULT_MAINNET_RPC =
  process.env.SOLANA_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
