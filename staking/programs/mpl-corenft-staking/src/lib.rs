use anchor_lang::{prelude::*, AnchorDeserialize};

pub mod constant;
pub mod error;
pub mod instructions;
pub mod state;
use constant::*;
use error::*;
use instructions::*;
use state::*;

declare_id!("D5MLxrKAnppBVLuukKQzQGTMSfEwBqWCDPGAhGhthdLP");

#[program]
pub mod openclawd_agent_staking {
    use super::*;

    /// Initialize the global staking authority for OpenClawd agent assets.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::initialize_handler(ctx)
    }

    /// Stake an OpenClawd agent NFT (Metaplex Core asset) by adding a FreezeDelegate
    /// plugin. The asset stays in the owner's wallet but becomes non-transferable.
    /// Creates a `UserPool` PDA that tracks the stake timestamp for reward accrual.
    pub fn stake_agent(ctx: Context<StakeAgent>) -> Result<()> {
        stake_agent::stake_agent_handler(ctx)
    }

    /// Unstake an agent NFT. Removes the FreezeDelegate plugin, closes the
    /// `UserPool` account (lamports returned to caller), and emits pending rewards.
    /// The owner can always unstake; the admin can emergency-unstake any asset.
    pub fn unstake_agent(ctx: Context<UnstakeAgent>) -> Result<()> {
        unstake_agent::unstake_agent_handler(ctx)
    }

    /// Record a reward claim on-chain. Updates `UserPool.last_claim_time` and emits
    /// a `RewardsClaimed` event. The backend treasury wallet watches for this event
    /// and transfers CLAWD tokens to the claimant's wallet off-chain.
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        claim_rewards::claim_rewards_handler(ctx)
    }
}
