use anchor_lang::prelude::*;

declare_id!("4qakoSGamZSo5VHkTZT2vQYt9JSGaAJ4wuw1uij4uCME");

#[program]
pub mod clawd_treasury {
    use super::*;

    pub fn initialize_treasury(_ctx: Context<InitializeTreasury>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTreasury {}
