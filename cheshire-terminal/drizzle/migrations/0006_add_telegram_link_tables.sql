-- Migration: add Telegram account linking tables used by web↔bot deep-link auth.

CREATE TABLE IF NOT EXISTS telegram_links (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE,
  "telegramUserId" VARCHAR(64) NOT NULL UNIQUE,
  "telegramChatId" VARCHAR(64) NOT NULL,
  "telegramUsername" VARCHAR(64),
  "telegramFirstName" VARCHAR(128),
  "telegramLastName" VARCHAR(128),
  "linkedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_link_challenges (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP NOT NULL,
  "consumedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS telegram_link_challenges_user_id_idx
  ON telegram_link_challenges ("userId");

CREATE INDEX IF NOT EXISTS telegram_link_challenges_expires_at_idx
  ON telegram_link_challenges ("expiresAt");