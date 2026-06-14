-- Track every run of the /install.sh curl|bash one-liner, plus the $CLAWD
-- airdrop claim flow that pays out after a successful install + X verification.
--
-- The model is: (1) every install records a row in install_executions keyed by
-- a per-run hash; (2) a wallet can later claim one airdrop per install by
-- signing a message; (3) we also persist X verification challenges and keep an
-- idempotent log of the actual claim transfer so re-tries don't double-pay.

DO $$ BEGIN
  CREATE TYPE airdrop_claim_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS install_executions (
  id SERIAL PRIMARY KEY,
  "installHash" VARCHAR(64) NOT NULL UNIQUE,
  "walletAddress" VARCHAR(64),
  "userId" INTEGER,
  source VARCHAR(64) DEFAULT 'install.sh',
  "userAgent" TEXT,
  "ipAddress" VARCHAR(64),
  os VARCHAR(32),
  arch VARCHAR(32),
  version VARCHAR(32),
  metadata JSON,
  "completedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_install_executions_wallet ON install_executions ("walletAddress");
CREATE INDEX IF NOT EXISTS idx_install_executions_user ON install_executions ("userId");
CREATE INDEX IF NOT EXISTS idx_install_executions_created ON install_executions ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS airdrop_claims (
  id SERIAL PRIMARY KEY,
  "installHash" VARCHAR(64) NOT NULL,
  "walletAddress" VARCHAR(64) NOT NULL,
  "userId" INTEGER,
  "amountAtomic" BIGINT NOT NULL DEFAULT 0,
  "amountUi" REAL NOT NULL DEFAULT 0,
  mint VARCHAR(64) NOT NULL,
  status airdrop_claim_status NOT NULL DEFAULT 'pending',
  signature VARCHAR(128),
  reason TEXT,
  "claimedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_airdrop_claims_install_wallet
  ON airdrop_claims ("installHash", "walletAddress");
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_wallet ON airdrop_claims ("walletAddress");
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_status ON airdrop_claims (status);

CREATE TABLE IF NOT EXISTS x_verification_codes (
  id SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  "xHandle" VARCHAR(64),
  "tweetId" VARCHAR(64),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  "verifiedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x_verification_wallet ON x_verification_codes ("walletAddress");
CREATE INDEX IF NOT EXISTS idx_x_verification_expires ON x_verification_codes ("expiresAt");
