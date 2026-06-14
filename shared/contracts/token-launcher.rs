use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Mint, Token, TokenAccount},
    associated_token::AssociatedToken,
};
use solana_program::{
    system_instruction,
    program::{invoke, invoke_signed},
    system_program,
};

declare_id!("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

#[program]
pub mod funpump_ai {
    use super::*;

    // Initialize the FunPump.ai token launcher program
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let launcher_state = &mut ctx.accounts.launcher_state;
        launcher_state.authority = authority;
        launcher_state.token_counter = 0;
        launcher_state.fee_amount = 0.01 * 10u64.pow(9); // 0.01 SOL in lamports
        launcher_state.is_paused = false;
        launcher_state.bump = *ctx.bumps.get("launcher_state").unwrap();
        
        Ok(())
    }

    // Launch a new FunPump token with verification
    pub fn launch_token(
        ctx: Context<LaunchToken>,
        name: String,
        symbol: String,
        uri: String,
        supply: u64,
        is_voice_verified: bool,
        voice_signature: Option<String>,
        vesting_schedule: Option<VestingSchedule>,
        streaming_config: Option<StreamingConfig>,
        agent_config: Option<AgentConfig>
    ) -> Result<()> {
        // Check if program is paused
        let launcher_state = &ctx.accounts.launcher_state;
        if launcher_state.is_paused {
            return err!(ErrorCode::ProgramPaused);
        }

        // Verify the fee payment
        let fee_amount = launcher_state.fee_amount;
        if **ctx.accounts.payer.to_account_info().lamports.borrow() < fee_amount {
            return err!(ErrorCode::InsufficientFunds);
        }

        // Transfer fee to the program account
        invoke(
            &system_instruction::transfer(
                ctx.accounts.payer.key,
                ctx.accounts.launcher_state.to_account_info().key,
                fee_amount,
            ),
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.launcher_state.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Verify voice authorization if enabled
        if is_voice_verified {
            if voice_signature.is_none() {
                return err!(ErrorCode::MissingVoiceSignature);
            }
            
            // Verify the voice signature against the payer's voice profile
            // Implementation would call external verification service
            let voice_verified = verify_voice_signature(
                ctx.accounts.payer.key(),
                voice_signature.as_ref().unwrap(),
            )?;
            
            if !voice_verified {
                return err!(ErrorCode::InvalidVoiceSignature);
            }
        }

        // Create new token
        let token_state = &mut ctx.accounts.token_state;
        token_state.authority = *ctx.accounts.payer.key;
        token_state.mint = ctx.accounts.mint.key();
        token_state.name = name;
        token_state.symbol = symbol;
        token_state.uri = uri;
        token_state.supply = supply;
        token_state.created_at = Clock::get()?.unix_timestamp;
        token_state.is_voice_verified = is_voice_verified;
        
        // Setup vesting if enabled
        if let Some(vesting_config) = vesting_schedule {
            token_state.vesting = Some(vesting_config);
            
            // Lock 50% of supply in vesting contract
            let locked_amount = supply / 2;
            token_state.locked_supply = locked_amount;
            token_state.next_unlock_time = Clock::get()?.unix_timestamp + vesting_config.cliff_period;
        }
        
        // Setup token streaming if enabled
        if let Some(streaming_config) = streaming_config {
            token_state.streaming = Some(streaming_config);
            // Initialize StreamFlow integration
            setup_streamflow_distribution(&ctx, &streaming_config)?;
        }
        
        // Setup AI agent if enabled
        if let Some(agent_config) = agent_config {
            token_state.agent = Some(agent_config);
            // Initialize AI agent
            setup_ai_agent(&ctx, &agent_config)?;
        }

        // Increment token counter
        let launcher_state = &mut ctx.accounts.launcher_state;
        launcher_state.token_counter += 1;

        // Mint tokens to the creator
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            supply,
        )?;

        emit!(TokenLaunchedEvent {
            token_address: ctx.accounts.mint.key(),
            creator: *ctx.accounts.payer.key,
            name: name.clone(),
            symbol: symbol.clone(),
            supply,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // Unlock vested tokens based on vesting schedule
    pub fn unlock_tokens(ctx: Context<UnlockTokens>) -> Result<()> {
        let token_state = &mut ctx.accounts.token_state;
        
        // Check if vesting is configured
        if token_state.vesting.is_none() {
            return err!(ErrorCode::NoVestingSchedule);
        }
        
        let vesting = token_state.vesting.as_ref().unwrap();
        let current_time = Clock::get()?.unix_timestamp;
        
        // Check if we've reached next unlock time
        if current_time < token_state.next_unlock_time {
            return err!(ErrorCode::VestingPeriodNotReached);
        }
        
        // Calculate unlockable amount (25% of locked supply per period)
        let unlock_amount = token_state.locked_supply / 4;
        
        if unlock_amount == 0 {
            return err!(ErrorCode::NoTokensToUnlock);
        }
        
        // Mint unlocked tokens to specified recipient
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: token_state.to_account_info(),
                },
                &[&[
                    b"token_state".as_ref(),
                    token_state.mint.as_ref(),
                    &[token_state.bump],
                ]],
            ),
            unlock_amount,
        )?;
        
        // Update state
        token_state.locked_supply -= unlock_amount;
        token_state.next_unlock_time = current_time + vesting.period_length;
        
        emit!(TokensUnlockedEvent {
            token_address: ctx.accounts.mint.key(),
            recipient: ctx.accounts.recipient.key(),
            amount: unlock_amount,
            timestamp: current_time,
            remaining_locked: token_state.locked_supply,
        });
        
        Ok(())
    }

    // Configure StreamFlow distribution for token
    pub fn configure_stream_flow(
        ctx: Context<ConfigureStreamFlow>,
        config: StreamingConfig,
    ) -> Result<()> {
        let token_state = &mut ctx.accounts.token_state;
        
        // Only token authority can configure streaming
        if token_state.authority != *ctx.accounts.authority.key {
            return err!(ErrorCode::Unauthorized);
        }
        
        // Save configuration
        token_state.streaming = Some(config.clone());
        
        // Setup StreamFlow integration
        setup_streamflow_distribution(&ctx, &config)?;
        
        emit!(StreamFlowConfiguredEvent {
            token_address: token_state.mint,
            start_time: config.start_time,
            end_time: config.end_time,
            amount: config.amount,
            recipient: config.recipient,
        });
        
        Ok(())
    }

    // Configure AI agent for token management
    pub fn configure_agent(
        ctx: Context<ConfigureAgent>,
        config: AgentConfig,
    ) -> Result<()> {
        let token_state = &mut ctx.accounts.token_state;
        
        // Only token authority can configure agent
        if token_state.authority != *ctx.accounts.authority.key {
            return err!(ErrorCode::Unauthorized);
        }
        
        // Save configuration
        token_state.agent = Some(config.clone());
        
        // Setup AI agent
        setup_ai_agent(&ctx, &config)?;
        
        emit!(AgentConfiguredEvent {
            token_address: token_state.mint,
            agent_type: config.agent_type,
            parameters: config.parameters,
        });
        
        Ok(())
    }

    // Verify a voice command for token operations
    pub fn voice_authorize(
        ctx: Context<VoiceAuthorize>,
        command: String,
        voice_signature: String,
    ) -> Result<()> {
        // Verify the voice signature
        let voice_verified = verify_voice_signature(
            ctx.accounts.authority.key(),
            &voice_signature,
        )?;
        
        if !voice_verified {
            return err!(ErrorCode::InvalidVoiceSignature);
        }
        
        // Process the voice command
        // This would execute different operations based on command
        process_voice_command(&ctx, &command)?;
        
        emit!(VoiceCommandEvent {
            user: ctx.accounts.authority.key(),
            command,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    // Set program fees
    pub fn set_fee(ctx: Context<SetFee>, new_fee: u64) -> Result<()> {
        let launcher_state = &mut ctx.accounts.launcher_state;
        
        // Only authority can set fees
        if launcher_state.authority != *ctx.accounts.authority.key {
            return err!(ErrorCode::Unauthorized);
        }
        
        launcher_state.fee_amount = new_fee;
        
        Ok(())
    }

    // Pause the program in an emergency
    pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
        let launcher_state = &mut ctx.accounts.launcher_state;
        
        // Only authority can pause
        if launcher_state.authority != *ctx.accounts.authority.key {
            return err!(ErrorCode::Unauthorized);
        }
        
        launcher_state.is_paused = true;
        
        Ok(())
    }

    // Unpause the program
    pub fn unpause_program(ctx: Context<PauseProgram>) -> Result<()> {
        let launcher_state = &mut ctx.accounts.launcher_state;
        
        // Only authority can unpause
        if launcher_state.authority != *ctx.accounts.authority.key {
            return err!(ErrorCode::Unauthorized);
        }
        
        launcher_state.is_paused = false;
        
        Ok(())
    }
}

// Helper function for voice signature verification
fn verify_voice_signature(user: Pubkey, signature: &str) -> Result<bool> {
    // In a real implementation, this would call an external verification service
    // For demonstration, we'll assume any signature that's longer than 64 chars is valid
    Ok(signature.len() > 64)
}

// Process voice commands
fn process_voice_command(ctx: &Context<VoiceAuthorize>, command: &str) -> Result<()> {
    // In a real implementation, this would parse and execute commands
    // For demonstration, we'll just validate the command contains some keywords
    if command.contains("transfer") || command.contains("buy") || command.contains("sell") {
        // Command would be executed here
        Ok(())
    } else {
        err!(ErrorCode::InvalidCommand)
    }
}

// Setup StreamFlow distribution
fn setup_streamflow_distribution(
    ctx: &Context<LaunchToken>,
    config: &StreamingConfig
) -> Result<()> {
    // In a real implementation, this would create a StreamFlow stream
    // For demonstration, we just emit a log
    msg!("Setting up StreamFlow distribution with start: {}, end: {}, amount: {}", 
        config.start_time, config.end_time, config.amount);
    
    Ok(())
}

// Setup AI agent
fn setup_ai_agent(
    ctx: &Context<LaunchToken>,
    config: &AgentConfig
) -> Result<()> {
    // In a real implementation, this would configure an AI agent
    // For demonstration, we just emit a log
    msg!("Setting up AI agent type: {} with parameters: {}", 
        config.agent_type, config.parameters);
    
    Ok(())
}

// Account structs

#[account]
pub struct LauncherState {
    pub authority: Pubkey,
    pub token_counter: u64,
    pub fee_amount: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
pub struct TokenState {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub supply: u64,
    pub created_at: i64,
    pub is_voice_verified: bool,
    pub locked_supply: u64,
    pub next_unlock_time: i64,
    pub vesting: Option<VestingSchedule>,
    pub streaming: Option<StreamingConfig>,
    pub agent: Option<AgentConfig>,
    pub bump: u8,
}

// Config structs

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct VestingSchedule {
    pub cliff_period: i64,  // Seconds until first unlock
    pub period_length: i64, // Seconds between unlocks
    pub total_periods: u64, // Total number of unlock periods
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StreamingConfig {
    pub recipient: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AgentConfig {
    pub agent_type: String,    // Type of AI agent (buyback, marketing, etc)
    pub parameters: String,    // JSON string of agent parameters
    pub is_active: bool,
}

// Events

#[event]
pub struct TokenLaunchedEvent {
    pub token_address: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensUnlockedEvent {
    pub token_address: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub remaining_locked: u64,
}

#[event]
pub struct StreamFlowConfiguredEvent {
    pub token_address: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub amount: u64,
    pub recipient: Pubkey,
}

#[event]
pub struct AgentConfiguredEvent {
    pub token_address: Pubkey,
    pub agent_type: String,
    pub parameters: String,
}

#[event]
pub struct VoiceCommandEvent {
    pub user: Pubkey,
    pub command: String,
    pub timestamp: i64,
}

// Instruction contexts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 8 + 1 + 1,
        seeds = [b"launcher_state"],
        bump
    )]
    pub launcher_state: Account<'info, LauncherState>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LaunchToken<'info> {
    #[account(
        mut,
        seeds = [b"launcher_state"],
        bump = launcher_state.bump
    )]
    pub launcher_state: Account<'info, LauncherState>,
    
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 100 + 10 + 200 + 8 + 8 + 1 + 8 + 8 + 
                128 + 128 + 256 + 1, // Space for optional fields
        seeds = [b"token_state", mint.key().as_ref()],
        bump
    )]
    pub token_state: Account<'info, TokenState>,
    
    #[account(
        init,
        payer = payer,
        mint::decimals = 9,
        mint::authority = payer
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    #[account(
        mut,
        seeds = [b"token_state", mint.key().as_ref()],
        bump = token_state.bump
    )]
    pub token_state: Account<'info, TokenState>,
    
    #[account(
        mut,
        address = token_state.mint
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub recipient: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = recipient,
        associated_token::mint = mint,
        associated_token::authority = recipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ConfigureStreamFlow<'info> {
    #[account(
        mut,
        seeds = [b"token_state", mint.key().as_ref()],
        bump = token_state.bump
    )]
    pub token_state: Account<'info, TokenState>,
    
    #[account(
        address = token_state.mint
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        address = token_state.authority
    )]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfigureAgent<'info> {
    #[account(
        mut,
        seeds = [b"token_state", mint.key().as_ref()],
        bump = token_state.bump
    )]
    pub token_state: Account<'info, TokenState>,
    
    #[account(
        address = token_state.mint
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        address = token_state.authority
    )]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoiceAuthorize<'info> {
    #[account(
        mut,
        seeds = [b"token_state", mint.key().as_ref()],
        bump = token_state.bump
    )]
    pub token_state: Account<'info, TokenState>,
    
    #[account(
        address = token_state.mint
    )]
    pub mint: Account<'info, Mint>,
    
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFee<'info> {
    #[account(
        mut,
        seeds = [b"launcher_state"],
        bump = launcher_state.bump
    )]
    pub launcher_state: Account<'info, LauncherState>,
    
    #[account(
        address = launcher_state.authority
    )]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseProgram<'info> {
    #[account(
        mut,
        seeds = [b"launcher_state"],
        bump = launcher_state.bump
    )]
    pub launcher_state: Account<'info, LauncherState>,
    
    #[account(
        address = launcher_state.authority
    )]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Program is paused")]
    ProgramPaused,
    
    #[msg("Insufficient funds for operation")]
    InsufficientFunds,
    
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Missing voice signature")]
    MissingVoiceSignature,
    
    #[msg("Invalid voice signature")]
    InvalidVoiceSignature,
    
    #[msg("Invalid command")]
    InvalidCommand,
    
    #[msg("No vesting schedule configured")]
    NoVestingSchedule,
    
    #[msg("Vesting period not yet reached")]
    VestingPeriodNotReached,
    
    #[msg("No tokens available to unlock")]
    NoTokensToUnlock,
    
    // FunPump specific error codes
    #[msg("Maximum slippage exceeded")]
    MaxSlippageExceeded,
    
    #[msg("Invalid bonding curve parameters")]
    InvalidBondingCurve,
    
    #[msg("Liquidity pool not found")]
    PoolNotFound,
    
    #[msg("Transaction would impact price too much")]
    ExcessivePriceImpact,
    
    #[msg("Token is not tradeable yet")]
    TokenNotTradeable,
    
    #[msg("Invalid token metadata")]
    InvalidTokenMetadata,
    
    #[msg("AI operation failed")]
    AIOperationFailed,
    
    #[msg("Voice model verification error")]
    VoiceModelError,
}