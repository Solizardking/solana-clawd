-- Multi-tenant x402 monetization: agents/MCPs and their payment events
DO $$ BEGIN
  CREATE TYPE monetized_target AS ENUM ('agent', 'mcp', 'http', 'tool');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_event_status AS ENUM ('verified', 'settled', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS monetized_agents (
  id SERIAL PRIMARY KEY,
  "ownerUserId" INTEGER NOT NULL,
  slug VARCHAR(96) NOT NULL UNIQUE,
  target monetized_target NOT NULL DEFAULT 'agent',
  label VARCHAR(160) NOT NULL,
  description TEXT,
  "recipientWallet" VARCHAR(64) NOT NULL,
  "agentWalletId" INTEGER,
  "agentAddress" VARCHAR(64),
  "pricePerCallAtomic" INTEGER NOT NULL DEFAULT 0,
  "commissionBps" INTEGER NOT NULL DEFAULT 1000,
  network VARCHAR(32) NOT NULL DEFAULT 'solana-mainnet',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monetized_agents_owner ON monetized_agents ("ownerUserId");
CREATE INDEX IF NOT EXISTS idx_monetized_agents_agent_address ON monetized_agents ("agentAddress");
CREATE INDEX IF NOT EXISTS idx_monetized_agents_active ON monetized_agents (active) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS payment_events (
  id SERIAL PRIMARY KEY,
  "monetizedAgentId" INTEGER,
  "payerWallet" VARCHAR(64),
  "recipientWallet" VARCHAR(64) NOT NULL,
  "amountAtomic" INTEGER NOT NULL DEFAULT 0,
  "commissionAtomic" INTEGER NOT NULL DEFAULT 0,
  "commissionBps" INTEGER NOT NULL DEFAULT 0,
  network VARCHAR(32) NOT NULL,
  mint VARCHAR(64) NOT NULL,
  signature VARCHAR(128),
  status payment_event_status NOT NULL DEFAULT 'verified',
  reason TEXT,
  route TEXT,
  "userAgent" TEXT,
  "ipAddress" VARCHAR(64),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_agent ON payment_events ("monetizedAgentId");
CREATE INDEX IF NOT EXISTS idx_payment_events_signature ON payment_events (signature);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events (status);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events ("createdAt" DESC);
