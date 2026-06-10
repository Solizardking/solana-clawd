use anchor_lang::prelude::*;

#[account]
pub struct GlobalPool {
    /// Program admin — only key allowed to perform emergency unstakes.
    pub admin: Pubkey,
    /// Total OpenClawd agent NFTs currently staked across all owners.
    pub total_agents_staked: u64,
    /// Cumulative CLAWD base-units distributed as rewards (6 decimals).
    pub total_rewards_distributed: u64,
    /// Reserved space for future fields.
    /// Layout-stable: do not reorder above this field across upgrades.
    pub reserved: u128,
}

impl Default for GlobalPool {
    #[inline]
    fn default() -> GlobalPool {
        GlobalPool {
            admin: Pubkey::default(),
            total_agents_staked: 0,
            total_rewards_distributed: 0,
            reserved: 0,
        }
    }
}

impl GlobalPool {
    pub const DATA_SIZE: usize = 8 + std::mem::size_of::<GlobalPool>();
}

/// Per-agent staking record. PDA: ["user-pool", asset_pubkey].
/// Closed when the agent is unstaked (lamports returned to owner).
#[account]
#[derive(Default)]
pub struct UserPool {
    /// Wallet that staked this agent.
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
