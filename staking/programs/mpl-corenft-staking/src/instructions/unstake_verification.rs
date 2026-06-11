use crate::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token::Token;

#[derive(Accounts)]
pub struct UnstakeVerification<'info> {
    /// The verified agent. Must match verification_record.agent.
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED],
        bump
    )]
    pub global_pool: Account<'info, GlobalPool>,

    /// The Clawd Verified badge being revoked.
    /// Closed on success — lamports returned to agent.
    #[account(
        mut,
        seeds = [CLAWD_VERIFIED_SEED, agent.key().as_ref()],
        bump,
        has_one = agent @ StakingError::InvalidOwner,
        close = agent
    )]
    pub verification_record: Account<'info, ClawdVerificationRecord>,

    /// Agent's CLAWD ATA — destination for returned stake.
    /// CHECK: mint validated in handler; recipient of PDA-signed transfer.
    #[account(mut)]
    pub agent_clawd_ata: UncheckedAccount<'info>,

    /// Program-owned vault — source of the returned stake.
    /// CHECK: validated to be the canonical clawd-vault PDA in constraints.
    #[account(
        mut,
        seeds = [CLAWD_VAULT_SEED],
        bump
    )]
    pub clawd_vault: UncheckedAccount<'info>,

    /// $CLAWD SPL token mint — validated against global_pool.clawd_mint.
    /// CHECK: key validated against global_pool.clawd_mint below.
    #[account(constraint = clawd_mint.key() == global_pool.clawd_mint @ StakingError::InvalidMint)]
    pub clawd_mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn unstake_verification_handler(ctx: Context<UnstakeVerification>) -> Result<()> {
    let stake_amount = ctx.accounts.verification_record.stake_amount;

    let now = Clock::get()
        .map_err(|_| error!(StakingError::ClockUnavailable))?
        .unix_timestamp;

    // Transfer staked CLAWD from vault back to agent's ATA.
    // The vault is a PDA whose authority is global_pool — sign with global_pool seeds.
    let bump = ctx.bumps.global_pool;
    let ix = spl_token::instruction::transfer(
        ctx.accounts.token_program.key,
        ctx.accounts.clawd_vault.key,
        ctx.accounts.agent_clawd_ata.key,
        &ctx.accounts.global_pool.key(),
        &[],
        stake_amount,
    )?;
    invoke_signed(
        &ix,
        &[
            ctx.accounts.clawd_vault.to_account_info(),
            ctx.accounts.agent_clawd_ata.to_account_info(),
            ctx.accounts.global_pool.to_account_info(),
        ],
        &[&[GLOBAL_AUTHORITY_SEED, &[bump]]],
    )?;

    let pool = &mut ctx.accounts.global_pool;
    pool.total_verified_agents = pool
        .total_verified_agents
        .checked_sub(1)
        .ok_or(StakingError::CounterUnderflow)?;
    pool.total_clawd_staked = pool.total_clawd_staked.saturating_sub(stake_amount);

    emit!(AgentUnverified {
        agent: ctx.accounts.agent.key(),
        stake_amount,
        unstaked_at: now,
        total_verified: pool.total_verified_agents,
    });

    Ok(())
}

/// Emitted when a verified agent withdraws their stake and loses verified status.
#[event]
pub struct AgentUnverified {
    pub agent: Pubkey,
    pub stake_amount: u64,
    pub unstaked_at: i64,
    pub total_verified: u64,
}
