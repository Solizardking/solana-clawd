use anchor_lang::prelude::*;

declare_id!("61QySJJ7DikMTMkmp3YDWJURrFTPnmUTFLcVNY1U3pwY");

#[program]
pub mod clawd_registry {
    use super::*;

    pub fn initialize_registry(_ctx: Context<InitializeRegistry>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeRegistry {}
