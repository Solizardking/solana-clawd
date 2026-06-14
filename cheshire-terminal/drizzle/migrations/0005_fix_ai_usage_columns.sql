-- Fix ai_usage table column names (PostgreSQL stores unquoted identifiers as lowercase)
-- Rename any existing lowercase columns to match Drizzle schema

-- Check and rename totaltokens -> totalTokens
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_usage' AND column_name = 'totaltokens'
    ) THEN
        ALTER TABLE "ai_usage" RENAME COLUMN "totaltokens" TO "totalTokens";
    END IF;
END $$;

-- Check and rename prompttokens -> promptTokens
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_usage' AND column_name = 'prompttokens'
    ) THEN
        ALTER TABLE "ai_usage" RENAME COLUMN "prompttokens" TO "promptTokens";
    END IF;
END $$;

-- Check and rename completiontokens -> completionTokens
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_usage' AND column_name = 'completiontokens'
    ) THEN
        ALTER TABLE "ai_usage" RENAME COLUMN "completiontokens" TO "completionTokens";
    END IF;
END $$;

-- Check and rename createdat -> createdAt
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_usage' AND column_name = 'createdat'
    ) THEN
        ALTER TABLE "ai_usage" RENAME COLUMN "createdat" TO "createdAt";
    END IF;
END $$;

-- Add missing columns if they don't exist
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();
