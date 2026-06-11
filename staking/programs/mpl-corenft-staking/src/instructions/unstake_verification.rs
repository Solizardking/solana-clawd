use crate::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Return staked CLAWD tokens and revoke the agent's Clawd Verified badge.
///
/// Closes the `ClawdVerificationRecord` PDA (lamports returned to agent) and
/// transfers the full staked CLAWD amount back from the vault to the agent's ATA.
/// The agent's wallet can immediately re-stake to regain verified status.
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

    /// Agent's CLAWD token account — destination for returned stake.
    #[account(
        mut,
        token::mint = clawd_mint,
        token::authority = agent,
    )]
    pub agent_clawd_ata: Account<'info, TokenAccount>,

    /// Program-owned vault that holds the staked CLAWD.
    #[account(
        mut,
        token::mint = clawd_mint,
        token::authority = global_pool,
        seeds = [CLAWD_VAULT_SEED],
        bump
    )]
    pub clawd_vault: Account<'info, TokenAccount>,

    /// $CLAWD SPL token mint — validated against global_pool.clawd_mint.
    #[account(
        constraint = clawd_mint.key() == global_pool.clawd_mint @ StakingError::InvalidMint
    )]
    pub clawd_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn unstake_verification_handler(ctx: Context<UnstakeVerification>) -> Result<()> {
    let stake_amount = ctx.accounts.verification_record.stake_amount;

    let now = Clock::get()
        .map_err(|_| error!(StakingError::ClockUnavailable))?
        .unix_timestamp;

    // Transfer staked CLAWD from vault back to agent's ATA.
    // Vault authority is the global_pool PDA so we need signer seeds.
    let bump = ctx.bumps.global_pool;
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.clawd_vault.to_account_info(),
                to: ctx.accounts.agent_clawd_ata.to_account_info(),
                authority: ctx.accounts.global_pool.to_account_info(),
            },
            &[&[GLOBAL_AUTHORITY_SEED, &[bump]]],
        ),
        stake_amount,
    )?;

    let pool = &mut ctx.accounts.global_pool;
    pool.total_verified_agents = pool
        .total_verified_agents
        .checked_sub(1)
        .ok_or(StakingError::CounterUnderflow)?;
    pool.total_clawd_staked = pool
        .total_clawd_staked
        .saturating_sub(stake_amount);

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
    /// Global count of currently-verified agents after this unstake.
    pub total_verified: u64,
}
