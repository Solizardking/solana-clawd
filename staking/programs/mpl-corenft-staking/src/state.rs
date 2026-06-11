use anchor_lang::prelude::*;

#[account]
pub struct GlobalPool {
    /// Program admin — only key allowed to perform emergency unstakes.
    pub admin: Pubkey,
    /// $CLAWD SPL token mint — set at initialize time, immutable thereafter.
    pub clawd_mint: Pubkey,
    /// Total OpenClawd agent NFTs currently staked across all owners.
    pub total_agents_staked: u64,
    /// Cumulative CLAWD base-units distributed as NFT staking rewards (6 decimals).
    pub total_rewards_distributed: u64,
    /// Total agents that have obtained Clawd Verified status (stake is currently active).
    pub total_verified_agents: u64,
    /// Total CLAWD base-units currently held in the verification vault.
    pub total_clawd_staked: u64,
    /// Reserved space for future fields.
    /// Layout-stable: do not reorder above this field across upgrades.
    pub reserved: u64,
}

impl Default for GlobalPool {
    #[inline]
    fn default() -> GlobalPool {
        GlobalPool {
            admin: Pubkey::default(),
            clawd_mint: Pubkey::default(),
            total_agents_staked: 0,
            total_rewards_distributed: 0,
            total_verified_agents: 0,
            total_clawd_staked: 0,
            reserved: 0,
        }
    }
}

impl GlobalPool {
    pub const DATA_SIZE: usize = 8 + std::mem::size_of::<GlobalPool>();
}

/// Per-agent NFT staking record. PDA: ["user-pool", asset_pubkey].
/// Closed when the agent NFT is unstaked (lamports returned to owner).
#[account]
#[derive(Default)]
pub struct UserPool {
    /// Wallet that staked this agent NFT.
    pub owner: Pubkey,
    /// The Metaplex Core asset (agent NFT) that is staked.
    pub asset: Pubkey,
    /// Unix timestamp when staking began.
    pub stake_time: i64,
    /// Unix timestamp of the most recent reward claim (initialised = stake_time).
    pub last_claim_time: i64,
    /// Cumulative CLAWD base-units claimed by this staker for this asset.
    pub total_claimed: u64,
}

impl UserPool {
    pub const DATA_SIZE: usize = 8 + std::mem::size_of::<UserPool>();

    /// Calculates accrued-but-unclaimed CLAWD base-units up to `now`.
    pub fn pending_rewards(&self, now: i64, rate_per_second: u64) -> u64 {
        let elapsed = now.saturating_sub(self.last_claim_time).max(0) as u64;
        elapsed.saturating_mul(rate_per_second)
    }
}

/// Clawd Verified badge for any Solana agent. PDA: ["clawd-verified", agent_wallet].
///
/// Created when an agent stakes >= MIN_CLAWD_STAKE CLAWD tokens into the vault.
/// Any wallet can query this PDA to confirm an agent is Clawd Verified.
/// Closed when the agent unstakes (lamports and CLAWD tokens returned to agent).
#[account]
pub struct ClawdVerificationRecord {
    /// The agent wallet that holds this verification.
    pub agent: Pubkey,
    /// Unix timestamp when verification was first granted.
    pub verified_at: i64,
    /// CLAWD base-units currently staked for this verification (6 decimals).
    pub stake_amount: u64,
    /// Whether this verification is currently active.
    /// Always true while the account exists; set false only as a tombstone before close.
    pub is_active: bool,
    /// Reserved for future fields (e.g. tier, delegated executive, agent asset pubkey).
    pub reserved: [u8; 31],
}

impl ClawdVerificationRecord {
    pub const DATA_SIZE: usize = 8 + std::mem::size_of::<ClawdVerificationRecord>();
}
