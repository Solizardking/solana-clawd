-- Migration: better-auth organization teams support
-- Adds ba_team and ba_team_member tables to match ClawdBrowser's org+teams setup.

CREATE TABLE IF NOT EXISTS "ba_team" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "organizationId" TEXT NOT NULL REFERENCES "ba_organization"("id") ON DELETE CASCADE,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ba_team_org_idx" ON "ba_team"("organizationId");

CREATE TABLE IF NOT EXISTS "ba_team_member" (
  "id"        TEXT PRIMARY KEY,
  "teamId"    TEXT NOT NULL REFERENCES "ba_team"("id") ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "role"      TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_team_member_team_idx" ON "ba_team_member"("teamId");
CREATE INDEX IF NOT EXISTS "ba_team_member_user_idx" ON "ba_team_member"("userId");

ALTER TABLE "ba_session"
  ADD COLUMN IF NOT EXISTS "activeTeamId" TEXT;
