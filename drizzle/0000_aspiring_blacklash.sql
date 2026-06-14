CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."chat_mode" AS ENUM('chat', 'vibe-code', 'research');--> statement-breakpoint
CREATE TYPE "public"."generation_kind" AS ENUM('image', 'video', 'music');--> statement-breakpoint
CREATE TYPE "public"."image_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('pending', 'approved', 'rejected', 'executed');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('chat', 'image', 'code', 'research');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "agent_wallet_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentWalletId" integer NOT NULL,
	"userId" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"params" json,
	"status" "queue_status" DEFAULT 'pending',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"walletAddress" varchar(64),
	"privyWalletId" varchar(128),
	"isSimulated" boolean DEFAULT true,
	"solBalance" real DEFAULT 0,
	"totalPnlUsd" real DEFAULT 0,
	"winRate" real DEFAULT 0,
	"tradeCount" integer DEFAULT 0,
	"status" "agent_status" DEFAULT 'active',
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"sessionId" integer,
	"model" varchar(64) NOT NULL,
	"promptTokens" integer DEFAULT 0,
	"completionTokens" integer DEFAULT 0,
	"totalTokens" integer DEFAULT 0,
	"requestType" "request_type" DEFAULT 'chat',
	"costEstimate" real DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key_id" integer NOT NULL,
	"userId" integer NOT NULL,
	"event" varchar(64) NOT NULL,
	"route" text,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"agentWalletId" integer,
	"name" varchar(128) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"scopes" json DEFAULT '[]'::json NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"model" varchar(64),
	"promptTokens" integer DEFAULT 0,
	"completionTokens" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) DEFAULT 'New Session',
	"model" varchar(64) DEFAULT 'grok-4-1-fast',
	"mode" "chat_mode" DEFAULT 'chat',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"kind" "generation_kind" NOT NULL,
	"prompt" text NOT NULL,
	"model" varchar(128),
	"mediaUrl" text NOT NULL,
	"thumbnailUrl" text,
	"durationSeconds" integer,
	"isPublic" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"prompt" text NOT NULL,
	"model" varchar(64) DEFAULT 'fal-ai/flux/schnell',
	"imageUrl" text,
	"s3Key" text,
	"status" "image_status" DEFAULT 'pending',
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"walletAddress" varchar(64),
	"clawdBalance" real DEFAULT 0,
	"isTokenGated" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "wallet_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"walletAddress" varchar(64) NOT NULL,
	"clawdBalance" real DEFAULT 0,
	"solBalance" real DEFAULT 0,
	"isVerified" boolean DEFAULT false,
	"connectedAt" timestamp DEFAULT now() NOT NULL,
	"lastChecked" timestamp DEFAULT now() NOT NULL
);
