use crate::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Stake CLAWD tokens to obtain Clawd Verified status.
///
/// Any Solana wallet (agent) can call this instruction to stake >= MIN_CLAWD_STAKE
/// CLAWD tokens into the program vault. On success a `ClawdVerificationRecord` PDA
/// is created at ["clawd-verified", agent] which serves as the on-chain verified badge.
///
/// Any program or wallet can check verification by deriving the PDA and confirming
/// the account exists with `is_active = true`.
#[derive(Accounts)]
pub struct StakeForVerification<'info> {
    /// The agent wallet seeking Clawd Verified status.
    /// Signs the transaction and pays rent for the verification record.
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED],
        bump
    )]
    pub global_pool: Account<'info, GlobalPool>,

    /// On-chain Clawd Verified badge for this agent.
    /// Created here, closed in unstake_verification.
    #[account(
        init,
        payer = agent,
        space = ClawdVerificationRecord::DATA_SIZE,
        seeds = [CLAWD_VERIFIED_SEED, agent.key().as_ref()],
        bump
    )]
    pub verification_record: Account<'info, ClawdVerificationRecord>,

    /// Agent's CLAWD token account — source of the stake.
    #[account(
        mut,
        token::mint = clawd_mint,
        token::authority = agent,
    )]
    pub agent_clawd_ata: Account<'info, TokenAccount>,

    /// Program-owned vault that holds all staked CLAWD.
    /// Authorised by the global_pool PDA.
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

pub fn stake_for_verification_handler(
    ctx: Context<StakeForVerification>,
    amount: u64,
) -> Result<()> {
    require!(amount >= MIN_CLAWD_STAKE, StakingError::InsufficientStake);

    let now = Clock::get()
        .map_err(|_| error!(StakingError::ClockUnavailable))?
        .unix_timestamp;

    // Transfer CLAWD from the agent's ATA into the program vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.agent_clawd_ata.to_account_info(),
                to: ctx.accounts.clawd_vault.to_account_info(),
                authority: ctx.accounts.agent.to_account_info(),
            },
        ),
        amount,
    )?;

    let record = &mut ctx.accounts.verification_record;
    record.agent = ctx.accounts.agent.key();
    record.verified_at = now;
    record.stake_amount = amount;
    record.is_active = true;
    record.reserved = [0u8; 31];

    let pool = &mut ctx.accounts.global_pool;
    pool.total_verified_agents = pool
        .total_verified_agents
        .checked_add(1)
        .ok_or(StakingError::CounterOverflow)?;
    pool.total_clawd_staked = pool
        .total_clawd_staked
        .checked_add(amount)
        .ok_or(StakingError::CounterOverflow)?;

    emit!(AgentVerified {
        agent: ctx.accounts.agent.key(),
        stake_amount: amount,
        verified_at: now,
        total_verified: pool.total_verified_agents,
    });

    Ok(())
}

/// Emitted every time an agent obtains Clawd Verified status.
/// Index on `agent` to build a verified-agent directory.
#[event]
pub struct AgentVerified {
    pub agent: Pubkey,
    /// CLAWD base-units staked (6 decimals).
    pub stake_amount: u64,
    pub verified_at: i64,
    /// Global count of currently-verified agents after this stake.
    pub total_verified: u64,
}
