-- Upstash Box registry: local index of deployed cloud containers.
-- The live box state lives in Upstash; this table provides fast lookup,
-- owner filtering, and per-wallet history without hitting the Upstash API
-- on every page load.

DO $$ BEGIN
  CREATE TYPE upstash_box_status AS ENUM (
    'running', 'paused', 'created', 'deleted', 'unknown'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS upstash_boxes (
  id              SERIAL PRIMARY KEY,
  "boxId"         VARCHAR(128)  NOT NULL UNIQUE,
  "ownerWallet"   VARCHAR(64),
  name            VARCHAR(128),
  runtime         VARCHAR(32)   NOT NULL DEFAULT 'node',
  size            VARCHAR(16)   NOT NULL DEFAULT 'small',
  "agentId"       VARCHAR(96),
  "agentHarness"  VARCHAR(32)            DEFAULT 'claude-code',
  "agentModel"    VARCHAR(96),
  "gitRepo"       TEXT,
  pinned          BOOLEAN       NOT NULL DEFAULT FALSE,
  status          upstash_box_status NOT NULL DEFAULT 'created',
  "lastRunAt"     TIMESTAMP,
  notes           TEXT,
  "createdAt"     TIMESTAMP     NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upstash_boxes_owner  ON upstash_boxes ("ownerWallet");
CREATE INDEX IF NOT EXISTS idx_upstash_boxes_status ON upstash_boxes (status);
