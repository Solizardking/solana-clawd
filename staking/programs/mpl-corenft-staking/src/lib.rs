use anchor_lang::{prelude::*, AnchorDeserialize};

pub mod constant;
pub mod error;
pub mod instructions;
pub mod state;
use constant::*;
use error::*;
use instructions::*;
use state::*;

declare_id!("9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP");

#[program]
pub mod openclawd_agent_staking {
    use super::*;

    /// Initialize the global staking authority for OpenClawd agent assets.
    /// Must be called once by the admin before any public staking begins.
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

    /// Stake CLAWD tokens to obtain Clawd Verified status.
    ///
    /// Any Solana wallet (agent) can call this with >= MIN_CLAWD_STAKE CLAWD tokens.
    /// Creates a `ClawdVerificationRecord` PDA at ["clawd-verified", agent] —
    /// the on-chain verified badge that any program can query permissionlessly.
    ///
    /// The `AgentVerified` event is emitted and indexes the global verified count.
    pub fn stake_for_verification(
        ctx: Context<StakeForVerification>,
        amount: u64,
    ) -> Result<()> {
        stake_for_verification::stake_for_verification_handler(ctx, amount)
    }

    /// Return staked CLAWD and revoke the agent's Clawd Verified badge.
    ///
    /// Closes the `ClawdVerificationRecord` PDA (lamports returned to agent) and
    /// transfers the full staked CLAWD amount back to the agent's ATA.
    pub fn unstake_verification(ctx: Context<UnstakeVerification>) -> Result<()> {
        unstake_verification::unstake_verification_handler(ctx)
    }
}
