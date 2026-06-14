-- Migration: Add Telegram identity fields to users table
-- Supports Privy Telegram bot login (via Mini App initData)
-- and server-side session verification via /api/privy-telegram/verify

BEGIN;

-- Add nullable Telegram identity columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "telegramUserId" varchar(64),
  ADD COLUMN IF NOT EXISTS "telegramUsername" varchar(64),
  ADD COLUMN IF NOT EXISTS "telegramChatId" varchar(64);

-- Index for fast Telegram user lookup (e.g. bot sends trade confirmation)
CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users ("telegramUserId")
  WHERE "telegramUserId" IS NOT NULL;

COMMIT;
