CREATE TABLE IF NOT EXISTS metaplex_agents (
  id SERIAL PRIMARY KEY,
  "assetAddress" VARCHAR(64) NOT NULL UNIQUE,
  network VARCHAR(32) NOT NULL DEFAULT 'solana-mainnet',
  "ownerWallet" VARCHAR(64),
  "payerWallet" VARCHAR(64),
  "authorityWallet" VARCHAR(64),
  "collectionAddress" VARCHAR(64),
  "agentIdentityPda" VARCHAR(64),
  "assetSignerPda" VARCHAR(64),
  "coreMetadataUri" TEXT,
  "agentRegistrationUri" TEXT,
  "schemaType" TEXT,
  name VARCHAR(160),
  description TEXT,
  image TEXT,
  active BOOLEAN,
  "lifecycleTransfer" BOOLEAN,
  "lifecycleUpdate" BOOLEAN,
  "lifecycleExecute" BOOLEAN,
  services JSON NOT NULL DEFAULT '[]'::json,
  registrations JSON NOT NULL DEFAULT '[]'::json,
  "supportedTrust" JSON NOT NULL DEFAULT '[]'::json,
  metadata JSON,
  "nftMetadata" JSON,
  "rawRegistry" JSON,
  "walletBalanceLamports" VARCHAR(48),
  "mintSignature" VARCHAR(128),
  "registerSignature" VARCHAR(128),
  "lastObservedSignature" VARCHAR(128),
  slot BIGINT,
  "blockTime" INTEGER,
  "executiveAuthority" VARCHAR(64),
  "executiveProfilePda" VARCHAR(64),
  "delegateRecordPda" VARCHAR(64),
  delegated BOOLEAN,
  "delegationSignature" VARCHAR(128),
  "delegatedAt" TIMESTAMP,
  "tokenMint" VARCHAR(64),
  "genesisAccount" VARCHAR(64),
  "launchId" VARCHAR(128),
  "launchUrl" TEXT,
  "launchType" VARCHAR(32),
  "setAgentToken" BOOLEAN,
  "firstBuyAmountSol" REAL,
  "creatorFeeWallet" VARCHAR(64),
  "launchSignatures" JSON NOT NULL DEFAULT '[]'::json,
  source VARCHAR(64) NOT NULL DEFAULT 'metaplex',
  status VARCHAR(32) NOT NULL DEFAULT 'registered',
  "launchedAt" TIMESTAMP,
  "verifiedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metaplex_agents_network_asset
  ON metaplex_agents (network, "assetAddress");
CREATE INDEX IF NOT EXISTS idx_metaplex_agents_owner
  ON metaplex_agents ("ownerWallet");
CREATE INDEX IF NOT EXISTS idx_metaplex_agents_identity_pda
  ON metaplex_agents ("agentIdentityPda");
CREATE INDEX IF NOT EXISTS idx_metaplex_agents_signer_pda
  ON metaplex_agents ("assetSignerPda");
CREATE INDEX IF NOT EXISTS idx_metaplex_agents_token_mint
  ON metaplex_agents ("tokenMint");
CREATE INDEX IF NOT EXISTS idx_metaplex_agents_active
  ON metaplex_agents (active);
CREATE INDEX IF NOT EXISTS idx_metaplex_agents_updated_at
  ON metaplex_agents ("updatedAt" DESC);
