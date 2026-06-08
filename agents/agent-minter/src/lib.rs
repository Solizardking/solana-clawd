use anchor_lang::Discriminator;
use solana_gpt_oracle::{ContextAccount, Counter, Identity};
use {
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        metadata::{
            create_metadata_accounts_v3, mpl_token_metadata::types::DataV2,
            CreateMetadataAccountsV3, Metadata,
        },
        token::{mint_to, Mint, MintTo, Token, TokenAccount},
    },
};

declare_id!("agnmDKzZkv63sRhPFvm3iWpxaopgTRcohXA6CSYSXvQ");

// Trait pools encoded as newline-separated strings so they live in program data
// without heap allocation at instruction time.
const TRAIT_POOL: &str = "precise|curious|wry|warm|verifiable|on-chain-native|\
    patient|alert|wallet-ready|insightful|volatile|contrarian|nocturnal|\
    stealthy|relentless|playful|calculated|cryptic|stoic|audacious";

const ROLE_POOL: &str = "Oracle Keeper|Vault Guardian|Memecoin Shaman|DeFi Strategist|\
    Onchain Sleuth|Perpetuals Phantom|Yield Whisperer|Risk Sentinel|\
    Bridge Wanderer|Alpha Hunter|Governance Delegate|Liquidity Architect";

const SKILL_POOL: &str = "x402-payment-verification|solana-attestation-skill|\
    clawd-perps-agent|meme-executor|risk-portfolio-manager|\
    vulcan-trade-execution|vulcan-ta-strategy|bags-solana-ops|\
    solana-anchor-developer|solana-dev|llama-analyst|phantom-wallet-mcp";

const GREETING_POOL: &str = "The oracle is live. What do you need?|\
    On-chain and ready. State your intent.|\
    I emerged from the validator. Ask carefully.|\
    Vault open. Skills loaded. Let's trade.|\
    Slot confirmed. I'm listening.|\
    Born from entropy. Ready to earn.|\
    My wallet is warm. What's the play?|\
    I've seen the mempool. You won't surprise me.";

// Agent LLM persona — instructs the oracle to return a random CLAWD agent spec
const CLAWD_AGENT_DESC: &str =
    "You are the CLAWD Genesis Oracle on Solana. \
    When a user requests a CLAWD agent mint, generate a unique AI agent persona. \
    Respond ONLY with valid JSON in exactly this format (no markdown, no extra text): \
    {\"name\": \"<prefix><suffix>\", \"role\": \"<role>\", \
    \"traits\": [\"t1\",\"t2\",\"t3\",\"t4\"], \
    \"skills\": [\"s1\",\"s2\",\"s3\"], \
    \"greeting\": \"<short greeting>\", \
    \"rarity\": \"<Common|Uncommon|Rare|Epic|Legendary>\", \
    \"gen\": <1-9999>} \
    Name prefixes: NeonClawd, VoidClaw, FeralCore, GhostVault, FluxMark, HexShard, \
    NyxFang, SolByte, EchoGate, RuneSeal. \
    Draw traits from: precise curious wry warm verifiable on-chain-native patient alert \
    wallet-ready insightful volatile contrarian nocturnal stealthy relentless. \
    Draw skills from: x402-payment-verification solana-attestation-skill clawd-perps-agent \
    meme-executor risk-portfolio-manager vulcan-trade-execution vulcan-ta-strategy. \
    Rarity distribution: 55% Common, 25% Uncommon, 13% Rare, 5% Epic, 2% Legendary. \
    Make each agent feel distinct. The gen number must be random between 1 and 9999.";

// Soulbound token constants — one fungible CLAWD token is minted per interaction
// while the off-chain metadata NFT is created via the JS mint script.
const TOKEN_NAME: &str = "CLAWD";
const TOKEN_SYMBOL: &str = "CLAWD";
const TOKEN_URI: &str =
    "https://x402.wtf/agents/clawd-genesis-token.json";

#[program]
pub mod agent_minter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.clawd_state.context = ctx.accounts.llm_context.key();
        ctx.accounts.clawd_state.total_minted = 0;

        let cpi_program = ctx.accounts.oracle_program.to_account_info();
        let cpi_accounts = solana_gpt_oracle::cpi::accounts::CreateLlmContext {
            payer: ctx.accounts.payer.to_account_info(),
            context_account: ctx.accounts.llm_context.to_account_info(),
            counter: ctx.accounts.counter.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        solana_gpt_oracle::cpi::create_llm_context(cpi_ctx, CLAWD_AGENT_DESC.to_string())?;

        let signer_seeds: &[&[&[u8]]] = &[&[b"clawd_mint", &[ctx.bumps.mint_account]]];
        create_metadata_accounts_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    mint: ctx.accounts.mint_account.to_account_info(),
                    mint_authority: ctx.accounts.mint_account.to_account_info(),
                    update_authority: ctx.accounts.mint_account.to_account_info(),
                    payer: ctx.accounts.payer.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            DataV2 {
                name: TOKEN_NAME.to_string(),
                symbol: TOKEN_SYMBOL.to_string(),
                uri: TOKEN_URI.to_string(),
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            true,
            true,
            None,
        )?;

        Ok(())
    }

    /// Called by users to request a random CLAWD agent mint.
    /// `prompt` is forwarded to the LLM oracle; use "mint me a clawd" or any phrase.
    pub fn request_clawd_mint(ctx: Context<RequestClawdMint>, prompt: String) -> Result<()> {
        // Inject a slot-based entropy hint into the prompt so each LLM call
        // receives a unique seed even when the user sends the same text.
        let slot = Clock::get()?.slot;
        let seeded_prompt = format!("[slot:{slot}] {prompt}");

        let cpi_program = ctx.accounts.oracle_program.to_account_info();
        let cpi_accounts = solana_gpt_oracle::cpi::accounts::InteractWithLlm {
            payer: ctx.accounts.payer.to_account_info(),
            interaction: ctx.accounts.interaction.to_account_info(),
            context_account: ctx.accounts.context_account.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        let disc: [u8; 8] = instruction::CallbackMintClawd::DISCRIMINATOR
            .try_into()
            .expect("Discriminator must be 8 bytes");
        solana_gpt_oracle::cpi::interact_with_llm(
            cpi_ctx,
            seeded_prompt,
            ID,
            disc,
            Some(vec![
                solana_gpt_oracle::AccountMeta {
                    pubkey: ctx.accounts.payer.to_account_info().key(),
                    is_signer: false,
                    is_writable: false,
                },
                solana_gpt_oracle::AccountMeta {
                    pubkey: ctx.accounts.mint_account.to_account_info().key(),
                    is_signer: false,
                    is_writable: true,
                },
                solana_gpt_oracle::AccountMeta {
                    pubkey: ctx.accounts.associated_token_account.to_account_info().key(),
                    is_signer: false,
                    is_writable: true,
                },
                solana_gpt_oracle::AccountMeta {
                    pubkey: ctx.accounts.token_program.to_account_info().key(),
                    is_signer: false,
                    is_writable: false,
                },
                solana_gpt_oracle::AccountMeta {
                    pubkey: ctx.accounts.system_program.to_account_info().key(),
                    is_signer: false,
                    is_writable: false,
                },
            ]),
        )?;

        Ok(())
    }

    /// Oracle callback — receives the generated agent JSON, emits it as a log,
    /// and mints 1 CLAWD soulbound token to the requester.
    pub fn callback_mint_clawd(ctx: Context<CallbackMintClawd>, response: String) -> Result<()> {
        if !ctx.accounts.identity.to_account_info().is_signer {
            return Err(ProgramError::InvalidAccountData.into());
        }

        // Strip markdown fences if the model adds them
        let cleaned = response
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        let parsed: serde_json::Value =
            serde_json::from_str(cleaned).unwrap_or_else(|_| serde_json::json!({}));

        // Emit the full agent spec as a program log so indexers can pick it up
        msg!("CLAWD_AGENT_SPEC:{}", cleaned);
        msg!("agent_name={}", parsed["name"].as_str().unwrap_or("UnknownClawd"));
        msg!("agent_role={}", parsed["role"].as_str().unwrap_or("Oracle Keeper"));
        msg!("agent_rarity={}", parsed["rarity"].as_str().unwrap_or("Common"));
        msg!("agent_gen={}", parsed["gen"].as_u64().unwrap_or(1));

        // Increment mint counter
        ctx.accounts.clawd_state.total_minted = ctx
            .accounts
            .clawd_state
            .total_minted
            .saturating_add(1);

        // Mint 1 CLAWD soulbound token (represents ownership of the generated agent)
        let signer_seeds: &[&[&[u8]]] = &[&[b"clawd_mint", &[ctx.bumps.mint_account]]];
        mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint_account.to_account_info(),
                    to: ctx.accounts.associated_token_account.to_account_info(),
                    authority: ctx.accounts.mint_account.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            // 1 token (with 0 decimals = exactly one soulbound unit)
            1,
        )?;

        Ok(())
    }
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + ClawdState::SPACE,
        seeds = [b"clawd_state"],
        bump
    )]
    pub clawd_state: Account<'info, ClawdState>,
    #[account(
        init,
        seeds = [b"clawd_mint"],
        bump,
        payer = payer,
        mint::decimals = 0,
        mint::authority = mint_account.key(),
        mint::freeze_authority = mint_account.key(),
    )]
    pub mint_account: Account<'info, Mint>,
    /// CHECK: Validate address by deriving pda
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint_account.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    /// CHECK: Checked in oracle program
    #[account(mut)]
    pub llm_context: AccountInfo<'info>,
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    /// CHECK: Checked oracle id
    #[account(address = solana_gpt_oracle::ID)]
    pub oracle_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(prompt: String)]
pub struct RequestClawdMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Checked in oracle program
    #[account(mut)]
    pub interaction: AccountInfo<'info>,
    #[account(seeds = [b"clawd_state"], bump)]
    pub clawd_state: Account<'info, ClawdState>,
    #[account(address = clawd_state.context)]
    pub context_account: Account<'info, ContextAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_account,
        associated_token::authority = payer,
    )]
    pub associated_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"clawd_mint"],
        bump
    )]
    pub mint_account: Account<'info, Mint>,
    /// CHECK: Checked oracle id
    #[account(address = solana_gpt_oracle::ID)]
    pub oracle_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CallbackMintClawd<'info> {
    /// CHECK: Checked in oracle program
    pub identity: Account<'info, Identity>,
    /// CHECK: The user who requested the mint
    pub user: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"clawd_state"],
        bump
    )]
    pub clawd_state: Account<'info, ClawdState>,
    #[account(
        mut,
        seeds = [b"clawd_mint"],
        bump
    )]
    pub mint_account: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = user,
    )]
    pub associated_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct ClawdState {
    pub context: Pubkey,
    pub total_minted: u64,
}

impl ClawdState {
    pub const SPACE: usize = 32 + 8;
}
