use crate::*;
use anchor_lang::solana_program::{program::invoke, program_option::COption};
use anchor_spl::token::Token;

/// Read the mint pubkey from a raw SPL token account AccountInfo.
fn read_token_account_mint(info: &AccountInfo) -> Result<Pubkey> {
    let data = info.try_borrow_data()?;
    // SPL token account layout: mint is bytes 0..32
    if data.len() < 32 {
        return err!(StakingError::InvalidAgentAsset);
    }
    Ok(Pubkey::try_from(&data[0..32]).map_err(|_| error!(StakingError::InvalidAgentAsset))?)
}

#[derive(Accounts)]
pub struct StakeForVerification<'info> {
    /// The agent wallet seeking Clawd Verified status.
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED],
        bump
    )]
    pub global_pool: Account<'info, GlobalPool>,

    /// On-chain Clawd Verified badge — created here, closed in unstake_verification.
    #[account(
        init,
        payer = agent,
        space = ClawdVerificationRecord::DATA_SIZE,
        seeds = [CLAWD_VERIFIED_SEED, agent.key().as_ref()],
        bump
    )]
    pub verification_record: Account<'info, ClawdVerificationRecord>,

    /// Agent's CLAWD ATA — source of the stake.
    /// CHECK: mint validated in handler; authority checked via transfer CPI.
    #[account(mut)]
    pub agent_clawd_ata: UncheckedAccount<'info>,

    /// Program-owned vault that holds all staked CLAWD.
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

pub fn stake_for_verification_handler(
    ctx: Context<StakeForVerification>,
    amount: u64,
) -> Result<()> {
    require!(amount >= MIN_CLAWD_STAKE, StakingError::InsufficientStake);

    // Validate agent ATA mint matches CLAWD mint.
    let ata_mint = read_token_account_mint(&ctx.accounts.agent_clawd_ata)?;
    require_keys_eq!(ata_mint, global_pool.clawd_mint, StakingError::InvalidMint);

    let now = Clock::get()
        .map_err(|_| error!(StakingError::ClockUnavailable))?
        .unix_timestamp;

    // Transfer CLAWD from agent's ATA into the vault.
    let ix = spl_token::instruction::transfer(
        ctx.accounts.token_program.key,
        ctx.accounts.agent_clawd_ata.key,
        ctx.accounts.clawd_vault.key,
        ctx.accounts.agent.key,
        &[],
        amount,
    )?;
    invoke(
        &ix,
        &[
            ctx.accounts.agent_clawd_ata.to_account_info(),
            ctx.accounts.clawd_vault.to_account_info(),
            ctx.accounts.agent.to_account_info(),
        ],
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
/// Index on `agent` to build a permissionless verified-agent directory.
#[event]
pub struct AgentVerified {
    pub agent: Pubkey,
    pub stake_amount: u64,
    pub verified_at: i64,
    /// Global count of currently-verified agents after this stake.
    pub total_verified: u64,
}
