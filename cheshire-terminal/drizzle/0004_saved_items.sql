-- Saved Items (Cloudflare R2 user vault)
DO $$ BEGIN
  CREATE TYPE saved_item_kind AS ENUM (
    'vibe-project',
    'image',
    'video',
    'music',
    'audio',
    'document',
    'chat',
    'agent',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS saved_items (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  kind saved_item_kind NOT NULL DEFAULT 'other',
  source VARCHAR(64),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  "r2Key" TEXT NOT NULL,
  "contentType" VARCHAR(128),
  "sizeBytes" INTEGER DEFAULT 0,
  "thumbnailUrl" TEXT,
  metadata JSON,
  "isPublic" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user ON saved_items ("userId");
CREATE INDEX IF NOT EXISTS idx_saved_items_user_kind ON saved_items ("userId", kind);
CREATE INDEX IF NOT EXISTS idx_saved_items_created ON saved_items ("createdAt" DESC);
