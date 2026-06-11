use crate::*;
use anchor_spl::token::Token;

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

    /// $CLAWD SPL token mint. Stored in GlobalPool; used as mint for the vault init.
    /// CHECK: any SPL token mint the admin designates — key stored in GlobalPool.
    pub clawd_mint: UncheckedAccount<'info>,

    /// Program-owned CLAWD vault. PDA: ["clawd-vault"]. Authority = global_pool PDA.
    /// Initialised here as a raw SPL token account owned by the global_pool PDA.
    /// CHECK: initialised below via spl_token CPI.
    #[account(
        init,
        payer = admin,
        space = spl_token::state::Account::LEN,
        seeds = [CLAWD_VAULT_SEED],
        bump,
        owner = spl_token::ID
    )]
    pub clawd_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    // Initialise the vault token account via spl_token CPI.
    let cpi_accounts = spl_token::instruction::initialize_account3(
        ctx.accounts.token_program.key,
        ctx.accounts.clawd_vault.key,
        ctx.accounts.clawd_mint.key,
        &ctx.accounts.global_pool.key(),
    )?;
    anchor_lang::solana_program::program::invoke(
        &cpi_accounts,
        &[
            ctx.accounts.clawd_vault.to_account_info(),
            ctx.accounts.clawd_mint.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
    )?;

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
