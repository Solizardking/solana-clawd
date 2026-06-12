import { PublicKey } from "@solana/web3.js";

// ── PDA seeds (must match Rust constant.rs) ────────────────────────────────
export const GLOBAL_AUTHORITY_SEED = "global-authority";
export const USER_POOL_SEED = "user-pool";

// ── Program ────────────────────────────────────────────────────────────────
export const PROGRAM_ID = new PublicKey(
  process.env.OPENCLAWD_AGENT_STAKING_PROGRAM_ID ??
    "9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP",
);

// ── Collection ────────────────────────────────────────────────────────────
export const CORE_COLLECTION_ADDRESS = new PublicKey(
  process.env.OPENCLAWD_AGENT_COLLECTION ?? "11111111111111111111111111111111",
);

// ── RPC ───────────────────────────────────────────────────────────────────
export const DEFAULT_DEVNET_RPC =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const DEFAULT_MAINNET_RPC =
  process.env.SOLANA_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
