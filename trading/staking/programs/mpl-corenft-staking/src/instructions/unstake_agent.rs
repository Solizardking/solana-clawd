use crate::*;
use mpl_core::{
    accounts::BaseAssetV1,
    instructions::{RemovePluginV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{FreezeDelegate, Plugin, PluginType, UpdateAuthority},
    ID as CORE_PROGRAM_ID,
};

#[derive(Accounts)]
pub struct UnstakeAgent<'info> {
    /// Owner of the staked agent NFT.
    /// CHECK: validated against the decoded Metaplex Core asset in the handler.
    pub owner: UncheckedAccount<'info>,

    /// Tx fee payer. Either `owner` (normal flow) or the program admin
    /// (emergency-recovery flow).
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED],
        bump
    )]
    pub global_pool: Account<'info, GlobalPool>,

    /// Closed on unstake — lamports returned to `user`.
    #[account(
        mut,
        seeds = [USER_POOL_SEED, asset.key().as_ref()],
        bump,
        close = user
    )]
    pub user_pool: Account<'info, UserPool>,

    #[account(
        mut,
        owner = CORE_PROGRAM_ID,
    )]
    /// CHECK: account owner is pinned to Metaplex Core and decoded in handler.
    pub asset: UncheckedAccount<'info>,

    #[account(mut, owner = CORE_PROGRAM_ID)]
    /// CHECK: account owner is pinned to Metaplex Core and referenced by asset update authority.
    pub collection: UncheckedAccount<'info>,

    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: pinned by address constraint; CPI'd into directly.
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn unstake_agent_handler(ctx: Context<UnstakeAgent>) -> Result<()> {
    let global_pool = &mut ctx.accounts.global_pool;
    let user_pool = &ctx.accounts.user_pool;
    let asset = BaseAssetV1::try_from(&ctx.accounts.asset.to_account_info())
        .map_err(|_| error!(StakingError::InvalidMetadata))?;

    // Authorization: tx-fee-payer (`user`) must be the asset owner OR the program admin.
    if !ctx.accounts.user.key().eq(&ctx.accounts.owner.key()) {
        require!(
            global_pool.admin.eq(&ctx.accounts.user.key()),
            StakingError::InvalidAdmin
        );
    }
    require_keys_eq!(
        asset.owner,
        ctx.accounts.owner.key(),
        StakingError::InvalidOwner
    );
    require!(
        asset.update_authority == UpdateAuthority::Collection(ctx.accounts.collection.key()),
        StakingError::InvalidCollection
    );

    let now = Clock::get()
        .map_err(|_| error!(StakingError::ClockUnavailable))?
        .unix_timestamp;

    let pending = user_pool.pending_rewards(now, REWARD_RATE_PER_SECOND);
    let total_accrued = user_pool.total_claimed.saturating_add(pending);

    // Step 1: flip FreezeDelegate.frozen to false so the asset can be moved.
    UpdatePluginV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.user.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
        .invoke()?;

    // Step 2: remove the FreezeDelegate plugin entirely (cleanup).
    RemovePluginV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.user)
        .system_program(&ctx.accounts.system_program)
        .plugin_type(PluginType::FreezeDelegate)
        .invoke()?;

    global_pool.total_agents_staked = global_pool
        .total_agents_staked
        .checked_sub(1)
        .ok_or(StakingError::CounterUnderflow)?;

    emit!(AgentUnstaked {
        owner: ctx.accounts.owner.key(),
        asset: ctx.accounts.asset.key(),
        unstake_time: now,
        pending_rewards: pending,
        total_accrued,
    });

    Ok(())
}

#[event]
pub struct AgentUnstaked {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub unstake_time: i64,
    pub pending_rewards: u64,
    pub total_accrued: u64,
}
