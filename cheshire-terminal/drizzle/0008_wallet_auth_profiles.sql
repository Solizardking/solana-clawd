ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "primaryWalletAddress" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "agentName" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "bio" TEXT,
  ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "twitterUsername" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "githubUsername" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "lastHolderVerifiedAt" TIMESTAMP;

CREATE TABLE IF NOT EXISTS "auth_challenges" (
  "id" SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL,
  "nonce" VARCHAR(128) NOT NULL,
  "message" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_auth_challenges_wallet" ON "auth_challenges" ("walletAddress");
CREATE INDEX IF NOT EXISTS "idx_auth_challenges_nonce" ON "auth_challenges" ("nonce");

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "walletAddress" VARCHAR(64) NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE,
  "loginMethod" VARCHAR(64) DEFAULT 'solana-wallet' NOT NULL,
  "ipAddress" VARCHAR(64),
  "userAgent" TEXT,
  "isTokenHolder" BOOLEAN DEFAULT false NOT NULL,
  "clawdBalance" REAL DEFAULT 0 NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "lastSeenAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "revokedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user" ON "auth_sessions" ("userId");
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_wallet" ON "auth_sessions" ("walletAddress");

CREATE TABLE IF NOT EXISTS "holder_verifications" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "walletAddress" VARCHAR(64) NOT NULL,
  "tokenMint" VARCHAR(64) NOT NULL,
  "rawBalance" BIGINT DEFAULT 0 NOT NULL,
  "balance" REAL DEFAULT 0 NOT NULL,
  "isHolder" BOOLEAN DEFAULT false NOT NULL,
  "source" VARCHAR(64) DEFAULT 'helius-rpc' NOT NULL,
  "verifiedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_holder_verifications_wallet" ON "holder_verifications" ("walletAddress");
CREATE INDEX IF NOT EXISTS "idx_holder_verifications_user" ON "holder_verifications" ("userId");

CREATE TABLE IF NOT EXISTS "wallet_profiles" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "walletAddress" VARCHAR(64) NOT NULL,
  "displayName" VARCHAR(128),
  "agentName" VARCHAR(64),
  "bio" TEXT,
  "avatarUrl" TEXT,
  "twitterUsername" VARCHAR(64),
  "githubUsername" VARCHAR(64),
  "isPrimary" BOOLEAN DEFAULT false NOT NULL,
  "lastLoginAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_wallet_profiles_wallet" ON "wallet_profiles" ("walletAddress");
CREATE INDEX IF NOT EXISTS "idx_wallet_profiles_user_wallet" ON "wallet_profiles" ("userId", "walletAddress");

CREATE TABLE IF NOT EXISTS "wallet_social_links" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "walletAddress" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "handle" VARCHAR(128) NOT NULL,
  "url" TEXT,
  "verified" BOOLEAN DEFAULT false NOT NULL,
  "metadata" JSON,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_wallet_social_links_wallet_provider" ON "wallet_social_links" ("walletAddress", "provider");
CREATE INDEX IF NOT EXISTS "idx_wallet_social_links_user_provider" ON "wallet_social_links" ("userId", "provider");

CREATE TABLE IF NOT EXISTS "wallet_activity_log" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "walletAddress" VARCHAR(64) NOT NULL,
  "activityType" VARCHAR(64) NOT NULL,
  "route" TEXT,
  "ipAddress" VARCHAR(64),
  "userAgent" TEXT,
  "metadata" JSON,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_wallet_activity_log_wallet" ON "wallet_activity_log" ("walletAddress");
CREATE INDEX IF NOT EXISTS "idx_wallet_activity_log_user" ON "wallet_activity_log" ("userId");
CREATE INDEX IF NOT EXISTS "idx_wallet_activity_log_type" ON "wallet_activity_log" ("activityType");
