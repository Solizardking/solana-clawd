-- Migration: organization plugin + agent auth (trainer/pokemon) + Neon auth
-- Adds tables for better-auth organization and @better-auth/agent-auth plugins

-- ── Organization plugin ──────────────────────────────────────────────────────

ALTER TABLE "ba_session"
  ADD COLUMN IF NOT EXISTS "activeOrganizationId" TEXT;

CREATE TABLE IF NOT EXISTS "ba_organization" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL UNIQUE,
  "logo"      TEXT,
  "metadata"  TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ba_member" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "ba_organization"("id") ON DELETE CASCADE,
  "userId"         TEXT NOT NULL REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "role"           TEXT NOT NULL DEFAULT 'member',
  "createdAt"      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_member_org_idx"  ON "ba_member"("organizationId");
CREATE INDEX IF NOT EXISTS "ba_member_user_idx" ON "ba_member"("userId");

CREATE TABLE IF NOT EXISTS "ba_invitation" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "ba_organization"("id") ON DELETE CASCADE,
  "email"          TEXT NOT NULL,
  "role"           TEXT,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "expiresAt"      TIMESTAMP NOT NULL,
  "inviterId"      TEXT NOT NULL REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "createdAt"      TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_invitation_org_idx"   ON "ba_invitation"("organizationId");
CREATE INDEX IF NOT EXISTS "ba_invitation_email_idx" ON "ba_invitation"("email");

-- ── Agent Auth plugin (hosts = trainers, agents = pokemon) ───────────────────

CREATE TABLE IF NOT EXISTS "ba_agent_host" (
  "id"                      TEXT PRIMARY KEY,
  "name"                    TEXT,
  "userId"                  TEXT REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "defaultCapabilities"     TEXT,
  "publicKey"               TEXT,
  "kid"                     TEXT,
  "jwksUrl"                 TEXT,
  "enrollmentTokenHash"     TEXT,
  "enrollmentTokenExpiresAt" TIMESTAMP,
  "status"                  TEXT NOT NULL DEFAULT 'active',
  "activatedAt"             TIMESTAMP,
  "expiresAt"               TIMESTAMP,
  "lastUsedAt"              TIMESTAMP,
  "createdAt"               TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"               TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_agent_host_user_idx" ON "ba_agent_host"("userId");
CREATE INDEX IF NOT EXISTS "ba_agent_host_kid_idx"  ON "ba_agent_host"("kid");
CREATE INDEX IF NOT EXISTS "ba_agent_host_enrollment_idx" ON "ba_agent_host"("enrollmentTokenHash");
CREATE INDEX IF NOT EXISTS "ba_agent_host_status_idx" ON "ba_agent_host"("status");

CREATE TABLE IF NOT EXISTS "ba_agent" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "userId"      TEXT REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "hostId"      TEXT NOT NULL REFERENCES "ba_agent_host"("id") ON DELETE CASCADE,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "mode"        TEXT NOT NULL DEFAULT 'delegated',
  "publicKey"   TEXT NOT NULL,
  "kid"         TEXT,
  "jwksUrl"     TEXT,
  "lastUsedAt"  TIMESTAMP,
  "activatedAt" TIMESTAMP,
  "expiresAt"   TIMESTAMP,
  "metadata"    TEXT,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_agent_user_idx"   ON "ba_agent"("userId");
CREATE INDEX IF NOT EXISTS "ba_agent_host_idx"   ON "ba_agent"("hostId");
CREATE INDEX IF NOT EXISTS "ba_agent_kid_idx"    ON "ba_agent"("kid");
CREATE INDEX IF NOT EXISTS "ba_agent_status_idx" ON "ba_agent"("status");

CREATE TABLE IF NOT EXISTS "ba_agent_capability_grant" (
  "id"          TEXT PRIMARY KEY,
  "agentId"     TEXT NOT NULL REFERENCES "ba_agent"("id") ON DELETE CASCADE,
  "capability"  TEXT NOT NULL,
  "deniedBy"    TEXT REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "grantedBy"   TEXT REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "expiresAt"   TIMESTAMP,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "reason"      TEXT,
  "constraints" TEXT,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_cap_grant_agent_idx"      ON "ba_agent_capability_grant"("agentId");
CREATE INDEX IF NOT EXISTS "ba_cap_grant_capability_idx" ON "ba_agent_capability_grant"("capability");
CREATE INDEX IF NOT EXISTS "ba_cap_grant_status_idx"     ON "ba_agent_capability_grant"("status");
CREATE INDEX IF NOT EXISTS "ba_cap_grant_granted_by_idx" ON "ba_agent_capability_grant"("grantedBy");

CREATE TABLE IF NOT EXISTS "ba_approval_request" (
  "id"                        TEXT PRIMARY KEY,
  "method"                    TEXT NOT NULL,
  "agentId"                   TEXT REFERENCES "ba_agent"("id") ON DELETE CASCADE,
  "hostId"                    TEXT REFERENCES "ba_agent_host"("id") ON DELETE CASCADE,
  "userId"                    TEXT REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "capabilities"              TEXT,
  "status"                    TEXT NOT NULL DEFAULT 'pending',
  "userCodeHash"              TEXT,
  "loginHint"                 TEXT,
  "bindingMessage"            TEXT,
  "clientNotificationToken"   TEXT,
  "clientNotificationEndpoint" TEXT,
  "deliveryMode"              TEXT,
  "interval"                  INTEGER NOT NULL DEFAULT 5,
  "lastPolledAt"              TIMESTAMP,
  "expiresAt"                 TIMESTAMP NOT NULL,
  "createdAt"                 TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"                 TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_approval_agent_idx"  ON "ba_approval_request"("agentId");
CREATE INDEX IF NOT EXISTS "ba_approval_host_idx"   ON "ba_approval_request"("hostId");
CREATE INDEX IF NOT EXISTS "ba_approval_user_idx"   ON "ba_approval_request"("userId");
CREATE INDEX IF NOT EXISTS "ba_approval_status_idx" ON "ba_approval_request"("status");
