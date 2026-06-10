pub const GLOBAL_AUTHORITY_SEED: &[u8] = b"global-authority";
pub const USER_POOL_SEED: &[u8] = b"user-pool";

/// CLAWD base units (6 decimals) earned per second per staked agent.
/// 1_000 units = 0.001 CLAWD/sec → ~86.4 CLAWD/day → ~2,592 CLAWD/month.
/// Adjustable by server-side multipliers without a program upgrade.
pub const REWARD_RATE_PER_SECOND: u64 = 1_000;
