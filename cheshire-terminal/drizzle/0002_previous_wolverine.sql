-- CLI pair codes for the solana-clawd CLI ↔ web pairing flow.
-- NOTE: drizzle-kit's auto-generated diff also included telegram_links and
-- telegram_link_challenges because those were applied through the manual
-- drizzle/migrations/ pipeline and aren't reflected in meta snapshots.
-- Trimmed to only the genuinely-new table; `IF NOT EXISTS` is belt-and-braces
-- in case this migration was partially applied on a previous attempt.

CREATE TABLE IF NOT EXISTS "cli_pair_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"walletAddress" varchar(64) NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	"label" varchar(128),
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"consumedApiKeyId" integer,
	"consumedDevice" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cli_pair_codes_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_pair_codes_user_id_idx"
	ON "cli_pair_codes" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_pair_codes_expires_at_idx"
	ON "cli_pair_codes" ("expiresAt");
