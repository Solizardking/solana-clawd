use crate::*;

/// On-chain claim-rewards: updates `last_claim_time` and emits a `RewardsClaimed`
/// event. The actual CLAWD transfer from the treasury wallet is executed off-chain
/// by the backend API using the TREASURY_KEY after verifying this event.
#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    /// The staker claiming rewards. Must match `user_pool.owner`.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED],
        bump
    )]
    pub global_pool: Account<'info, GlobalPool>,

    #[account(
        mut,
        seeds = [USER_POOL_SEED, user_pool.asset.as_ref()],
        bump,
        has_one = owner @ StakingError::InvalidOwner,
    )]
    pub user_pool: Account<'info, UserPool>,

    pub system_program: Program<'info, System>,
}

pub fn claim_rewards_handler(ctx: Context<ClaimRewards>) -> Result<()> {
    let user_pool = &mut ctx.accounts.user_pool;
    let global_pool = &mut ctx.accounts.global_pool;

    let now = Clock::get()
        .map_err(|_| error!(StakingError::ClockUnavailable))?
        .unix_timestamp;

    let pending = user_pool.pending_rewards(now, REWARD_RATE_PER_SECOND);
    require!(pending > 0, StakingError::NoRewardsToClaim);

    user_pool.last_claim_time = now;
    user_pool.total_claimed = user_pool
        .total_claimed
        .checked_add(pending)
        .ok_or(StakingError::RewardOverflow)?;

    global_pool.total_rewards_distributed = global_pool
        .total_rewards_distributed
        .checked_add(pending)
        .ok_or(StakingError::RewardOverflow)?;

    emit!(RewardsClaimed {
        owner: ctx.accounts.owner.key(),
        asset: user_pool.asset,
        amount: pending,
        claim_time: now,
    });

    Ok(())
}

#[event]
pub struct RewardsClaimed {
    pub owner: Pubkey,
    pub asset: Pubkey,
    /// CLAWD base-units (6 decimals) accrued since last claim.
    pub amount: u64,
    pub claim_time: i64,
}
