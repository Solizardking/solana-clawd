-- Catch-up migration for route-backed product tables that existed in shared
-- schema or runtime CREATE TABLE blocks but were missing from drizzle/.

DO $$ BEGIN
  CREATE TYPE chess_bet_status AS ENUM ('pending', 'escrowed', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tokens (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  mint_address TEXT NOT NULL,
  metadata JSONB,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS burns (
  id SERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  signature TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  asset_type TEXT DEFAULT 'token',
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS token_votes (
  id TEXT PRIMARY KEY,
  token_address TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  vote_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  token_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  is_upvote BOOLEAN NOT NULL,
  reason TEXT,
  signature TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  token_address TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
  member_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS room_members (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_active TIMESTAMP NOT NULL DEFAULT NOW(),
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_banned BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS room_members_room_wallet_unique
  ON room_members (room_id, wallet_address);

CREATE TABLE IF NOT EXISTS deepseek_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT,
  model TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
  thinking_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cache_hit_tokens INTEGER NOT NULL DEFAULT 0,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS deepseek_messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  reasoning_content TEXT,
  tool_calls JSONB,
  tool_call_id TEXT,
  tool_name TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cache_hit_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deepseek_messages_session_idx
  ON deepseek_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS agent_deployments (
  id SERIAL PRIMARY KEY,
  asset_address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT,
  agent_type TEXT,
  owner_wallet TEXT,
  registration_uri TEXT,
  token_mint TEXT,
  signature TEXT,
  is_registered BOOLEAN NOT NULL DEFAULT false,
  network TEXT NOT NULL DEFAULT 'mainnet-beta',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery_votes (
  generation_id INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (generation_id, voter_id)
);

CREATE INDEX IF NOT EXISTS gallery_votes_generation_created_at_idx
  ON gallery_votes (generation_id, created_at);
CREATE INDEX IF NOT EXISTS gallery_votes_voter_created_at_idx
  ON gallery_votes (voter_id, created_at);

CREATE TABLE IF NOT EXISTS agent_feed_items (
  id SERIAL PRIMARY KEY,
  asset_address TEXT NOT NULL UNIQUE,
  pda TEXT,
  wallet TEXT,
  signature TEXT UNIQUE,
  slot BIGINT,
  block_time BIGINT,
  network TEXT,
  name TEXT,
  image TEXT,
  description TEXT,
  registration_uri TEXT,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN,
  supported_trust JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_wallet TEXT,
  payer_wallet TEXT,
  authority_wallet TEXT,
  collection_address TEXT,
  agent_identity_pda TEXT,
  asset_signer_pda TEXT,
  core_metadata_uri TEXT,
  schema_type TEXT,
  lifecycle_transfer BOOLEAN,
  lifecycle_update BOOLEAN,
  lifecycle_execute BOOLEAN,
  registrations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB,
  raw_registry JSONB,
  wallet_balance_lamports TEXT,
  token_mint TEXT,
  genesis_account TEXT,
  launch_id TEXT,
  launch_url TEXT,
  launch_type TEXT,
  set_agent_token BOOLEAN,
  creator_fee_wallet TEXT,
  launch_signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_feed_items_inserted_at_idx
  ON agent_feed_items (inserted_at);

CREATE TABLE IF NOT EXISTS treasury_payments (
  id SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL,
  "txSignature" VARCHAR(128) NOT NULL UNIQUE,
  "solPaid" REAL NOT NULL,
  "solUsdAtTime" REAL,
  "clawdBurned" REAL,
  "clawdUsdAtTime" REAL,
  feature VARCHAR(64) NOT NULL DEFAULT 'general',
  "burnSignature" VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'verified',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_stakes (
  id SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL,
  "assetAddress" VARCHAR(64) NOT NULL UNIQUE,
  "assetName" VARCHAR(128),
  "assetImage" TEXT,
  "assetType" VARCHAR(32) NOT NULL DEFAULT 'nft',
  "collectionAddress" VARCHAR(64),
  "rewardRatePerDay" INTEGER NOT NULL DEFAULT 100,
  "rewardsClaimed" INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'staked',
  "stakedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "unstakedAt" TIMESTAMP,
  "lastClaimedAt" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_generations (
  id SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL,
  kind generation_kind NOT NULL,
  prompt TEXT NOT NULL,
  "enhancedPrompt" TEXT,
  mode VARCHAR(32) NOT NULL DEFAULT 't2i',
  model VARCHAR(64) NOT NULL DEFAULT 'grok-imagine-image',
  "sourceUrl" TEXT,
  "bucketKey" TEXT,
  "mediaUrl" TEXT,
  thumbnail TEXT,
  "galleryId" VARCHAR(64),
  metadata JSONB,
  saved BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_generations_wallet_idx
  ON user_generations ("walletAddress");
CREATE INDEX IF NOT EXISTS user_generations_saved_idx
  ON user_generations ("walletAddress", saved);

CREATE TABLE IF NOT EXISTS wallet_telegram_links (
  id SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL UNIQUE,
  "telegramId" VARCHAR(32) NOT NULL UNIQUE,
  "telegramUsername" VARCHAR(64),
  "telegramFirstName" VARCHAR(128),
  "photoUrl" TEXT,
  "authDate" INTEGER,
  "linkedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_agents (
  id SERIAL PRIMARY KEY,
  "ownerWallet" VARCHAR(64) NOT NULL,
  slug VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  persona TEXT NOT NULL,
  greeting TEXT,
  provider VARCHAR(32) NOT NULL DEFAULT 'deepseek',
  model VARCHAR(64) NOT NULL DEFAULT 'deepseek-v4-pro',
  "avatarUrl" TEXT,
  "sourceAgentId" VARCHAR(128),
  "launchRuntime" VARCHAR(64),
  "importedSpec" JSONB,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  "promptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_agents_owner_idx
  ON user_agents ("ownerWallet");

CREATE TABLE IF NOT EXISTS x_verification_codes (
  id SERIAL PRIMARY KEY,
  "walletAddress" VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  "xHandle" VARCHAR(64),
  "tweetId" VARCHAR(64),
  verified BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x_verification_wallet
  ON x_verification_codes ("walletAddress");
CREATE INDEX IF NOT EXISTS idx_x_verification_expires
  ON x_verification_codes ("expiresAt");

CREATE TABLE IF NOT EXISTS chess_bets (
  id SERIAL PRIMARY KEY,
  "betId" VARCHAR(64) NOT NULL UNIQUE,
  "gameId" VARCHAR(64) NOT NULL,
  "whitePlayerWallet" VARCHAR(64) NOT NULL,
  "blackPlayerWallet" VARCHAR(64) NOT NULL,
  "betAmountClawd" INTEGER NOT NULL,
  "escrowWalletAddress" VARCHAR(64) NOT NULL,
  "escrowWalletId" VARCHAR(128) NOT NULL,
  status chess_bet_status NOT NULL DEFAULT 'pending',
  winner VARCHAR(64),
  transfers JSON NOT NULL DEFAULT '{}'::json,
  "payoutOutcome" JSON,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clawd_state (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  cash_usd NUMERIC NOT NULL DEFAULT 10000,
  total_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  total_fills INTEGER NOT NULL DEFAULT 0,
  last_tick TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clawd_decisions (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal TEXT NOT NULL,
  signal_score NUMERIC NOT NULL DEFAULT 0,
  signal_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  gate_action TEXT NOT NULL,
  gate_reasoning TEXT NOT NULL,
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS clawd_fills (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  notional_usd NUMERIC NOT NULL,
  pnl_usd NUMERIC,
  mode TEXT NOT NULL,
  tx_signature TEXT,
  decision_id INTEGER
);

CREATE TABLE IF NOT EXISTS clawd_positions (
  id SERIAL PRIMARY KEY,
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,
  pnl_usd NUMERIC NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clawd_mirror_actions (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address TEXT NOT NULL,
  source_fill_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  mint TEXT NOT NULL,
  side TEXT NOT NULL,
  amount_in_raw NUMERIC,
  amount_out NUMERIC,
  notional_usd NUMERIC,
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
);

CREATE UNIQUE INDEX IF NOT EXISTS clawd_mirror_actions_tx_signature_idx
  ON clawd_mirror_actions (tx_signature)
  WHERE tx_signature IS NOT NULL;

INSERT INTO clawd_state (id, status, mode, cash_usd, total_pnl_usd, total_fills, last_tick)
VALUES (1, 'idle', 'paper', 10000, 0, 0, NULL)
ON CONFLICT (id) DO NOTHING;
