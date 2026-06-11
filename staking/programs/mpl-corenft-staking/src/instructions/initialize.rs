use crate::*;
use anchor_spl::token::Token;

/// SPL token account is always 165 bytes (Pack::LEN for spl_token::state::Account).
const SPL_TOKEN_ACCOUNT_LEN: usize = 165;

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

    /// $CLAWD SPL token mint. Key is stored in GlobalPool and used to gate
    /// the stake_for_verification / unstake_verification instructions.
    /// CHECK: any valid SPL token mint the admin designates.
    pub clawd_mint: UncheckedAccount<'info>,

    /// Program-owned vault for staked CLAWD. PDA: ["clawd-vault"].
    /// Allocated here by system_program then initialised as a token account
    /// via spl_token CPI, with authority = global_pool PDA.
    /// CHECK: initialised via spl_token::instruction::initialize_account3 in handler.
    #[account(
        init,
        payer = admin,
        space = SPL_TOKEN_ACCOUNT_LEN,
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
    // Initialise the vault as an SPL token account owned by global_pool PDA.
    let init_ix = spl_token::instruction::initialize_account3(
        ctx.accounts.token_program.key,
        ctx.accounts.clawd_vault.key,
        ctx.accounts.clawd_mint.key,
        &ctx.accounts.global_pool.key(),
    )?;
    anchor_lang::solana_program::program::invoke(
        &init_ix,
        &[
            ctx.accounts.clawd_vault.to_account_info(),
            ctx.accounts.clawd_mint.to_account_info(),
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
