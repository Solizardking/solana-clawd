pub const GLOBAL_AUTHORITY_SEED: &[u8] = b"global-authority";
pub const USER_POOL_SEED: &[u8] = b"user-pool";

/// PDA seed for each agent's Clawd Verified badge. ["clawd-verified", agent_wallet]
pub const CLAWD_VERIFIED_SEED: &[u8] = b"clawd-verified";

/// PDA seed for the program-owned CLAWD token vault. ["clawd-vault"]
pub const CLAWD_VAULT_SEED: &[u8] = b"clawd-vault";

/// CLAWD base units (6 decimals) earned per second per staked agent NFT.
/// 1_000 units = 0.001 CLAWD/sec → ~86.4 CLAWD/day → ~2,592 CLAWD/month.
/// Adjustable by server-side multipliers without a program upgrade.
pub const REWARD_RATE_PER_SECOND: u64 = 1_000;

/// Minimum CLAWD base-units (6 decimals) required to obtain Clawd Verified status.
/// 100_000_000 = 100 CLAWD tokens.
pub const MIN_CLAWD_STAKE: u64 = 100_000_000;
