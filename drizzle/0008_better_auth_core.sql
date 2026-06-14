-- Better Auth core tables.
-- These must exist before the org, teams, and agent-auth migrations because
-- those tables reference ba_user and ba_session.

CREATE TABLE IF NOT EXISTS "ba_user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ba_session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "activeOrganizationId" TEXT,
  "activeTeamId" TEXT
);

CREATE INDEX IF NOT EXISTS "ba_session_user_idx" ON "ba_session"("userId");
CREATE INDEX IF NOT EXISTS "ba_session_token_idx" ON "ba_session"("token");

CREATE TABLE IF NOT EXISTS "ba_account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "ba_user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP,
  "refreshTokenExpiresAt" TIMESTAMP,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_account_user_idx" ON "ba_account"("userId");
CREATE INDEX IF NOT EXISTS "ba_account_provider_idx" ON "ba_account"("providerId", "accountId");

CREATE TABLE IF NOT EXISTS "ba_verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ba_verification_identifier_idx" ON "ba_verification"("identifier");
