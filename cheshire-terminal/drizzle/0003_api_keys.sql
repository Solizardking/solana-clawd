-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "agentWalletId" INTEGER,
  name VARCHAR(128) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  scopes JSON NOT NULL DEFAULT '[]',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys ("userId");
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);

-- API Key Audit Log table
CREATE TABLE IF NOT EXISTS api_key_audit_log (
  id SERIAL PRIMARY KEY,
  api_key_id INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  event VARCHAR(64) NOT NULL,
  route TEXT,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_audit_key ON api_key_audit_log (api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_user ON api_key_audit_log ("userId");
