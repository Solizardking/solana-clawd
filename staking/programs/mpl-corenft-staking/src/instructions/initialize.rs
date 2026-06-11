use crate::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = GlobalPool::DATA_SIZE,
        seeds = [GLOBAL_AUTHORITY_SEED],
        bump
    )]
    pub global_pool: Account<'info, GlobalPool>,

    /// $CLAWD SPL token mint. Validated by the caller; stored in GlobalPool for
    /// runtime checks in stake_for_verification / unstake_verification.
    pub clawd_mint: Account<'info, Mint>,

    /// Program-owned vault that holds all staked CLAWD tokens.
    /// PDA: ["clawd-vault"]. Authority = global_pool PDA.
    #[account(
        init,
        payer = admin,
        token::mint = clawd_mint,
        token::authority = global_pool,
        seeds = [CLAWD_VAULT_SEED],
        bump
    )]
    pub clawd_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let global_pool = &mut ctx.accounts.global_pool;

    global_pool.admin = ctx.accounts.admin.key();
    global_pool.clawd_mint = ctx.accounts.clawd_mint.key();
    global_pool.total_agents_staked = 0;
    global_pool.total_rewards_distributed = 0;
    global_pool.total_verified_agents = 0;
    global_pool.total_clawd_staked = 0;
    global_pool.reserved = 0;

    Ok(())
}
