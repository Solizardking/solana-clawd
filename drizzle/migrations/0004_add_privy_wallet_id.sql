-- Migration: Add privyWalletId column to agent_wallets
ALTER TABLE agent_wallets ADD COLUMN IF NOT EXISTS privy_wallet_id VARCHAR(128);
