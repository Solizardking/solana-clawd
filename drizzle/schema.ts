import {
  bigint,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  json,
  jsonb,
  numeric,
  real,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const chatModeEnum = pgEnum("chat_mode", ["chat", "vibe-code", "research"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const requestTypeEnum = pgEnum("request_type", ["chat", "image", "code", "research"]);
export const imageStatusEnum = pgEnum("image_status", ["pending", "completed", "failed"]);
export const generationKindEnum = pgEnum("generation_kind", ["image", "video", "music"]);
export const agentStatusEnum = pgEnum("agent_status", ["active", "paused", "archived"]);
export const queueStatusEnum = pgEnum("queue_status", ["pending", "approved", "rejected", "executed"]);
export const savedItemKindEnum = pgEnum("saved_item_kind", [
  "vibe-project",
  "image",
  "video",
  "music",
  "audio",
  "document",
  "chat",
  "agent",
  "other",
]);
export const monetizedTargetEnum = pgEnum("monetized_target", [
  "agent",
  "mcp",
  "http",
  "tool",
]);
export const paymentEventStatusEnum = pgEnum("payment_event_status", [
  "verified",
  "settled",
  "failed",
]);
export const airdropClaimStatusEnum = pgEnum("airdrop_claim_status", [
  "pending",
  "sent",
  "failed",
  "skipped",
]);

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }),
  primaryWalletAddress: varchar("primaryWalletAddress", { length: 64 }),
  clawdBalance: real("clawdBalance").default(0),
  isTokenGated: boolean("isTokenGated").default(false),
  agentName: varchar("agentName", { length: 64 }),
  bio: text("bio"),
  avatarUrl: text("avatarUrl"),
  twitterUsername: varchar("twitterUsername", { length: 64 }),
  githubUsername: varchar("githubUsername", { length: 64 }),
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
  lastHolderVerifiedAt: timestamp("lastHolderVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  // Telegram identity — populated when user logs in via Privy Telegram bot
  telegramUserId: varchar("telegramUserId", { length: 64 }),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  // Telegram chat ID where the bot sends trade confirmations
  telegramChatId: varchar("telegramChatId", { length: 64 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Auth Challenges / Sessions / Activity ──────────────────────────────────
export const authChallenges = pgTable("auth_challenges", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  nonce: varchar("nonce", { length: 128 }).notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("idx_auth_challenges_wallet").on(table.walletAddress),
  nonceIdx: index("idx_auth_challenges_nonce").on(table.nonce),
}));

export type AuthChallenge = typeof authChallenges.$inferSelect;

export const authSessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  sessionToken: varchar("sessionToken", { length: 255 }).notNull().unique(),
  loginMethod: varchar("loginMethod", { length: 64 }).default("solana-wallet").notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  isTokenHolder: boolean("isTokenHolder").default(false).notNull(),
  clawdBalance: real("clawdBalance").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_auth_sessions_user").on(table.userId),
  walletIdx: index("idx_auth_sessions_wallet").on(table.walletAddress),
}));

export type AuthSession = typeof authSessions.$inferSelect;

export const holderVerifications = pgTable("holder_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  tokenMint: varchar("tokenMint", { length: 64 }).notNull(),
  rawBalance: bigint("rawBalance", { mode: "number" }).default(0).notNull(),
  balance: real("balance").default(0).notNull(),
  isHolder: boolean("isHolder").default(false).notNull(),
  source: varchar("source", { length: 64 }).default("helius-rpc").notNull(),
  verifiedAt: timestamp("verifiedAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("idx_holder_verifications_wallet").on(table.walletAddress),
  userIdx: index("idx_holder_verifications_user").on(table.userId),
}));

export type HolderVerification = typeof holderVerifications.$inferSelect;

export const entryPayments = pgTable("entry_payments", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  recipientWallet: varchar("recipientWallet", { length: 64 }).notNull(),
  tokenMint: varchar("tokenMint", { length: 64 }).notNull(),
  amount: real("amount").notNull(),
  rawAmount: bigint("rawAmount", { mode: "number" }).notNull(),
  txSignature: varchar("txSignature", { length: 128 }).notNull().unique(),
  status: varchar("status", { length: 32 }).default("verified").notNull(),
  verifiedAt: timestamp("verifiedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("idx_entry_payments_wallet").on(table.walletAddress),
  recipientIdx: index("idx_entry_payments_recipient").on(table.recipientWallet),
  txIdx: uniqueIndex("idx_entry_payments_tx").on(table.txSignature),
}));

export type EntryPayment = typeof entryPayments.$inferSelect;
export type InsertEntryPayment = typeof entryPayments.$inferInsert;

export const walletProfiles = pgTable("wallet_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  displayName: varchar("displayName", { length: 128 }),
  agentName: varchar("agentName", { length: 64 }),
  bio: text("bio"),
  avatarUrl: text("avatarUrl"),
  twitterUsername: varchar("twitterUsername", { length: 64 }),
  githubUsername: varchar("githubUsername", { length: 64 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  lastLoginAt: timestamp("lastLoginAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("idx_wallet_profiles_wallet").on(table.walletAddress),
  userWalletIdx: index("idx_wallet_profiles_user_wallet").on(table.userId, table.walletAddress),
}));

export type WalletProfile = typeof walletProfiles.$inferSelect;

export const walletSocialLinks = pgTable("wallet_social_links", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  handle: varchar("handle", { length: 128 }).notNull(),
  url: text("url"),
  verified: boolean("verified").default(false).notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  walletProviderIdx: index("idx_wallet_social_links_wallet_provider").on(table.walletAddress, table.provider),
  userProviderIdx: index("idx_wallet_social_links_user_provider").on(table.userId, table.provider),
}));

export type WalletSocialLink = typeof walletSocialLinks.$inferSelect;

export const walletActivityLog = pgTable("wallet_activity_log", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  activityType: varchar("activityType", { length: 64 }).notNull(),
  route: text("route"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("idx_wallet_activity_log_wallet").on(table.walletAddress),
  userIdx: index("idx_wallet_activity_log_user").on(table.userId),
  activityIdx: index("idx_wallet_activity_log_type").on(table.activityType),
}));

export type WalletActivityLog = typeof walletActivityLog.$inferSelect;

// ─── Chat Sessions ────────────────────────────────────────────────────────────
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).default("New Session"),
  model: varchar("model", { length: 64 }).default("grok-4-1-fast"),
  mode: chatModeEnum("mode").default("chat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Better Auth tables ───────────────────────────────────────────────────────
export const betterAuthUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const betterAuthSession = pgTable("ba_session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => betterAuthUser.id, { onDelete: "cascade" }),
  activeOrganizationId: text("activeOrganizationId"),
  activeTeamId: text("activeTeamId"),
});

export const betterAuthAccount = pgTable("ba_account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => betterAuthUser.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const betterAuthVerification = pgTable("ba_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export type ChatSession = typeof chatSessions.$inferSelect;

// ─── Chat Messages ────────────────────────────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull(),
  userId: integer("userId").notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  model: varchar("model", { length: 64 }),
  promptTokens: integer("promptTokens").default(0),
  completionTokens: integer("completionTokens").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

// ─── AI Usage Tracking ────────────────────────────────────────────────────────
export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  sessionId: integer("sessionId"),
  model: varchar("model", { length: 64 }).notNull(),
  promptTokens: integer("promptTokens").default(0),
  completionTokens: integer("completionTokens").default(0),
  totalTokens: integer("totalTokens").default(0),
  requestType: requestTypeEnum("requestType").default("chat"),
  costEstimate: real("costEstimate").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiUsage = typeof aiUsage.$inferSelect;

// ─── Image Generations ────────────────────────────────────────────────────────
export const imageGenerations = pgTable("image_generations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  prompt: text("prompt").notNull(),
  model: varchar("model", { length: 64 }).default("fal-ai/flux/schnell"),
  imageUrl: text("imageUrl"),
  s3Key: text("s3Key"),
  status: imageStatusEnum("status").default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImageGeneration = typeof imageGenerations.$inferSelect;

// ─── Unified generations feed (image + video + music, powers trending) ──────
export const generations = pgTable("generations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  kind: generationKindEnum("kind").notNull(),
  prompt: text("prompt").notNull(),
  model: varchar("model", { length: 128 }),
  mediaUrl: text("mediaUrl").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  durationSeconds: integer("durationSeconds"),
  isPublic: boolean("isPublic").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Generation = typeof generations.$inferSelect;
export type InsertGeneration = typeof generations.$inferInsert;

// ─── Agent Wallets ────────────────────────────────────────────────────────────
export const agentWallets = pgTable("agent_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }),
  privyWalletId: varchar("privyWalletId", { length: 128 }),
  isSimulated: boolean("isSimulated").default(true),
  solBalance: real("solBalance").default(0),
  totalPnlUsd: real("totalPnlUsd").default(0),
  winRate: real("winRate").default(0),
  tradeCount: integer("tradeCount").default(0),
  status: agentStatusEnum("status").default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentWallet = typeof agentWallets.$inferSelect;

// ─── Agent Wallet Queue ───────────────────────────────────────────────────────
export const agentWalletQueue = pgTable("agent_wallet_queue", {
  id: serial("id").primaryKey(),
  agentWalletId: integer("agentWalletId").notNull(),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  params: json("params"),
  status: queueStatusEnum("status").default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type AgentWalletQueueItem = typeof agentWalletQueue.$inferSelect;

// ─── Metaplex Agent Lookup Index ─────────────────────────────────────────────
// Durable projection of Metaplex Agent Registry + Genesis metadata. This gives
// the app a fast local lookup path by Core asset, PDA wallet, owner, token mint,
// delegation, and service metadata while preserving raw registry payloads.
export const metaplexAgents = pgTable(
  "metaplex_agents",
  {
    id: serial("id").primaryKey(),
    assetAddress: varchar("assetAddress", { length: 64 }).notNull().unique(),
    network: varchar("network", { length: 32 }).default("solana-mainnet").notNull(),
    ownerWallet: varchar("ownerWallet", { length: 64 }),
    payerWallet: varchar("payerWallet", { length: 64 }),
    authorityWallet: varchar("authorityWallet", { length: 64 }),
    collectionAddress: varchar("collectionAddress", { length: 64 }),
    agentIdentityPda: varchar("agentIdentityPda", { length: 64 }),
    assetSignerPda: varchar("assetSignerPda", { length: 64 }),
    coreMetadataUri: text("coreMetadataUri"),
    agentRegistrationUri: text("agentRegistrationUri"),
    schemaType: text("schemaType"),
    name: varchar("name", { length: 160 }),
    description: text("description"),
    image: text("image"),
    active: boolean("active"),
    lifecycleTransfer: boolean("lifecycleTransfer"),
    lifecycleUpdate: boolean("lifecycleUpdate"),
    lifecycleExecute: boolean("lifecycleExecute"),
    services: json("services").default([]).notNull(),
    registrations: json("registrations").default([]).notNull(),
    supportedTrust: json("supportedTrust").default([]).notNull(),
    metadata: json("metadata"),
    nftMetadata: json("nftMetadata"),
    rawRegistry: json("rawRegistry"),
    walletBalanceLamports: varchar("walletBalanceLamports", { length: 48 }),
    mintSignature: varchar("mintSignature", { length: 128 }),
    registerSignature: varchar("registerSignature", { length: 128 }),
    lastObservedSignature: varchar("lastObservedSignature", { length: 128 }),
    slot: bigint("slot", { mode: "bigint" }),
    blockTime: integer("blockTime"),
    executiveAuthority: varchar("executiveAuthority", { length: 64 }),
    executiveProfilePda: varchar("executiveProfilePda", { length: 64 }),
    delegateRecordPda: varchar("delegateRecordPda", { length: 64 }),
    delegated: boolean("delegated"),
    delegationSignature: varchar("delegationSignature", { length: 128 }),
    delegatedAt: timestamp("delegatedAt"),
    tokenMint: varchar("tokenMint", { length: 64 }),
    genesisAccount: varchar("genesisAccount", { length: 64 }),
    launchId: varchar("launchId", { length: 128 }),
    launchUrl: text("launchUrl"),
    launchType: varchar("launchType", { length: 32 }),
    setAgentToken: boolean("setAgentToken"),
    firstBuyAmountSol: real("firstBuyAmountSol"),
    creatorFeeWallet: varchar("creatorFeeWallet", { length: 64 }),
    launchSignatures: json("launchSignatures").default([]).notNull(),
    launchedAt: timestamp("launchedAt"),
    source: varchar("source", { length: 64 }).default("metaplex").notNull(),
    status: varchar("status", { length: 32 }).default("registered").notNull(),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    networkAssetIdx: index("idx_metaplex_agents_network_asset").on(
      table.network,
      table.assetAddress,
    ),
    ownerIdx: index("idx_metaplex_agents_owner").on(table.ownerWallet),
    identityPdaIdx: index("idx_metaplex_agents_identity_pda").on(table.agentIdentityPda),
    signerPdaIdx: index("idx_metaplex_agents_signer_pda").on(table.assetSignerPda),
    tokenMintIdx: index("idx_metaplex_agents_token_mint").on(table.tokenMint),
    activeIdx: index("idx_metaplex_agents_active").on(table.active),
    updatedAtIdx: index("idx_metaplex_agents_updated_at").on(table.updatedAt),
  }),
);

export type MetaplexAgent = typeof metaplexAgents.$inferSelect;
export type InsertMetaplexAgent = typeof metaplexAgents.$inferInsert;

// ─── Wallet Connections ───────────────────────────────────────────────────────
export const walletConnections = pgTable("wallet_connections", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  clawdBalance: real("clawdBalance").default(0),
  solBalance: real("solBalance").default(0),
  isVerified: boolean("isVerified").default(false),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  lastChecked: timestamp("lastChecked").defaultNow().notNull(),
});

export type WalletConnection = typeof walletConnections.$inferSelect;

// ─── Telegram Links (web app user ↔ Telegram identity) ───────────────────────
export const telegramLinks = pgTable("telegram_links", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  telegramUserId: varchar("telegramUserId", { length: 64 }).notNull().unique(),
  telegramChatId: varchar("telegramChatId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  telegramFirstName: varchar("telegramFirstName", { length: 128 }),
  telegramLastName: varchar("telegramLastName", { length: 128 }),
  linkedAt: timestamp("linkedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TelegramLink = typeof telegramLinks.$inferSelect;

// ─── Telegram Link Challenges (one-time deep-link tokens) ────────────────────
export const telegramLinkChallenges = pgTable("telegram_link_challenges", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TelegramLinkChallenge = typeof telegramLinkChallenges.$inferSelect;

// ─── CLI Pair Codes (solana-clawd CLI ↔ web pairing) ────────────────────────
export const cliPairCodes = pgTable("cli_pair_codes", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  consumedApiKeyId: integer("consumedApiKeyId"),
  consumedDevice: text("consumedDevice"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CliPairCode = typeof cliPairCodes.$inferSelect;

// ─── API Keys ─────────────────────────────────────────────────────────────────
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  agentWalletId: integer("agentWalletId"),         // null = user key, set = agent key
  name: varchar("name", { length: 128 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),   // e.g. "clawd_sk_01ab"
  keyHash: varchar("key_hash", { length: 64 }).notNull(),       // SHA-256 of full key
  scopes: json("scopes").default([]).notNull(),                 // string[]
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;

// ─── API Key Audit Log ─────────────────────────────────────────────────────────
export const apiKeyAuditLog = pgTable("api_key_audit_log", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull(),
  userId: integer("userId").notNull(),
  event: varchar("event", { length: 64 }).notNull(),   // "used", "created", "revoked", "failed"
  route: text("route"),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ApiKeyAuditLogEntry = typeof apiKeyAuditLog.$inferSelect;

// ─── Saved Items (Cloudflare R2 user vault) ──────────────────────────────────
// Every row points at an object in the `clawd` R2 bucket under
// `users/<openId>/…`. Source is the page/module the user saved from (e.g.
// "vibe", "image-studio") so the drawer can group things by origin.
export const savedItems = pgTable("saved_items", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  kind: savedItemKindEnum("kind").default("other").notNull(),
  source: varchar("source", { length: 64 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  r2Key: text("r2Key").notNull(),
  contentType: varchar("contentType", { length: 128 }),
  sizeBytes: integer("sizeBytes").default(0),
  thumbnailUrl: text("thumbnailUrl"),
  metadata: json("metadata"),
  isPublic: boolean("isPublic").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SavedItem = typeof savedItems.$inferSelect;
export type InsertSavedItem = typeof savedItems.$inferInsert;

// ─── Monetized Agents (x402 recipient routing) ───────────────────────────────
// Each row says "when a payment comes in for this agent/MCP/URL, send the
// USDC to <recipientWallet> and credit the platform a <commissionBps> cut."
// slug is the public identifier echoed in paymentRequirements; treasury is
// the fallback when no slug matches.
export const monetizedAgents = pgTable("monetized_agents", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  target: monetizedTargetEnum("target").default("agent").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  description: text("description"),
  // Solana wallet address that receives USDC for this agent.
  recipientWallet: varchar("recipientWallet", { length: 64 }).notNull(),
  // Optional reference to the agent registry row if this monetizes an
  // agent_wallet or on-chain agent identity.
  agentWalletId: integer("agentWalletId"),
  agentAddress: varchar("agentAddress", { length: 64 }),
  // Default price per billable unit (e.g. per call / per 1K tokens) in atomic
  // USDC (6 decimals). Callers can ask for more; they cannot pay less.
  pricePerCallAtomic: integer("pricePerCallAtomic").default(0).notNull(),
  // Platform commission in basis points. 1000 bps = 10%. Applied to the
  // atomic transfer amount and accrued off-chain (payment_events.commissionAtomic).
  commissionBps: integer("commissionBps").default(1000).notNull(),
  network: varchar("network", { length: 32 }).default("solana-mainnet").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type MonetizedAgent = typeof monetizedAgents.$inferSelect;
export type InsertMonetizedAgent = typeof monetizedAgents.$inferInsert;

// ─── Payment Events (every /verify + /settle attempt) ────────────────────────
// Dual-purpose: (1) lets the owner see earnings per agent, (2) gives the
// platform an auditable record of commission owed. One row per facilitator
// call; status transitions verified → settled or verified → failed.
export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  monetizedAgentId: integer("monetizedAgentId"),
  // The wallet that actually signed the USDC transfer (the payer).
  payerWallet: varchar("payerWallet", { length: 64 }),
  // The recipient wallet used on this transaction — copied from the agent
  // row at event time so later edits can't rewrite history.
  recipientWallet: varchar("recipientWallet", { length: 64 }).notNull(),
  amountAtomic: integer("amountAtomic").default(0).notNull(),
  commissionAtomic: integer("commissionAtomic").default(0).notNull(),
  commissionBps: integer("commissionBps").default(0).notNull(),
  network: varchar("network", { length: 32 }).notNull(),
  mint: varchar("mint", { length: 64 }).notNull(),
  signature: varchar("signature", { length: 128 }),
  status: paymentEventStatusEnum("status").default("verified").notNull(),
  reason: text("reason"),
  route: text("route"),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type InsertPaymentEvent = typeof paymentEvents.$inferInsert;

// ─── Install Executions (every run of the /install.sh one-liner) ─────────────
// Rows are keyed by a per-invocation hash emitted by the install script. The
// same wallet can run install many times (different machines), but each
// unique install → at most one airdrop claim.
export const installExecutions = pgTable("install_executions", {
  id: serial("id").primaryKey(),
  installHash: varchar("installHash", { length: 64 }).notNull().unique(),
  walletAddress: varchar("walletAddress", { length: 64 }),
  userId: integer("userId"),
  source: varchar("source", { length: 64 }).default("install.sh"),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  os: varchar("os", { length: 32 }),
  arch: varchar("arch", { length: 32 }),
  version: varchar("version", { length: 32 }),
  metadata: json("metadata"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InstallExecution = typeof installExecutions.$inferSelect;
export type InsertInstallExecution = typeof installExecutions.$inferInsert;

// ─── Airdrop Claims ($CLAWD payout per verified install) ─────────────────────
// Unique on (installHash, walletAddress) so a wallet can only claim once per
// install. status transitions pending → sent | failed | skipped.
export const airdropClaims = pgTable("airdrop_claims", {
  id: serial("id").primaryKey(),
  installHash: varchar("installHash", { length: 64 }).notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  userId: integer("userId"),
  amountAtomic: bigint("amountAtomic", { mode: "bigint" }).default(0n).notNull(),
  amountUi: real("amountUi").default(0).notNull(),
  mint: varchar("mint", { length: 64 }).notNull(),
  status: airdropClaimStatusEnum("status").default("pending").notNull(),
  signature: varchar("signature", { length: 128 }),
  reason: text("reason"),
  claimedAt: timestamp("claimedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AirdropClaim = typeof airdropClaims.$inferSelect;
export type InsertAirdropClaim = typeof airdropClaims.$inferInsert;

// ─── X (Twitter) Verification Codes ─────────────────────────────────────────
export const xVerificationCodes = pgTable("x_verification_codes", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  xHandle: varchar("xHandle", { length: 64 }),
  tweetId: varchar("tweetId", { length: 64 }),
  verified: boolean("verified").default(false).notNull(),
  verifiedAt: timestamp("verifiedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("idx_x_verification_wallet").on(table.walletAddress),
  expiresIdx: index("idx_x_verification_expires").on(table.expiresAt),
}));

export type XVerificationCode = typeof xVerificationCodes.$inferSelect;
export type InsertXVerificationCode = typeof xVerificationCodes.$inferInsert;

// ─── Chess Bets (Clawd Chess + $CLAWD escrow betting) ────────────────────────
// One row per bet. Status moves pending → escrowed → completed | cancelled.
// `payoutOutcome` caches the on-chain settlement result so a second
// `/complete` call is idempotent across server restarts.
export const chessBetStatusEnum = pgEnum("chess_bet_status", [
  "pending",
  "escrowed",
  "completed",
  "cancelled",
]);

export const chessBets = pgTable("chess_bets", {
  id: serial("id").primaryKey(),
  betId: varchar("betId", { length: 64 }).notNull().unique(),
  gameId: varchar("gameId", { length: 64 }).notNull(),
  whitePlayerWallet: varchar("whitePlayerWallet", { length: 64 }).notNull(),
  blackPlayerWallet: varchar("blackPlayerWallet", { length: 64 }).notNull(),
  // Bet amount in whole $CLAWD units (NOT atomic). The pot is `betAmount * 2`
  // and the on-chain SPL transfer uses `betAmount * 2 * 10^9` atomic.
  betAmountClawd: integer("betAmountClawd").notNull(),
  escrowWalletAddress: varchar("escrowWalletAddress", { length: 64 }).notNull(),
  escrowWalletId: varchar("escrowWalletId", { length: 128 }).notNull(),
  status: chessBetStatusEnum("status").default("pending").notNull(),
  winner: varchar("winner", { length: 64 }),
  // { [playerWallet]: { signature: string, ts: number } }
  transfers: json("transfers").default({}).notNull(),
  // Cached PayoutOutcome from settleChessPayoutViaPrivy. NULL until /complete
  // runs once. Used for idempotency: a duplicate /complete returns the cached
  // signature instead of re-broadcasting.
  payoutOutcome: json("payoutOutcome"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ChessBet = typeof chessBets.$inferSelect;
export type InsertChessBet = typeof chessBets.$inferInsert;

// ─── Upstash Boxes ────────────────────────────────────────────────────────────
// Local record of every deployed Upstash Box. The box itself lives in the
// Upstash cloud; this table is the durable index that lets us list, filter,
// and tag boxes without hammering the Upstash API on every page load.
export const upstashBoxStatusEnum = pgEnum("upstash_box_status", [
  "running",
  "paused",
  "created",
  "deleted",
  "unknown",
]);

export const upstashBoxes = pgTable(
  "upstash_boxes",
  {
    id: serial("id").primaryKey(),
    boxId: varchar("boxId", { length: 128 }).notNull().unique(),
    ownerWallet: varchar("ownerWallet", { length: 64 }),
    name: varchar("name", { length: 128 }),
    runtime: varchar("runtime", { length: 32 }).default("node").notNull(),
    size: varchar("size", { length: 16 }).default("small").notNull(),
    agentId: varchar("agentId", { length: 96 }),
    agentHarness: varchar("agentHarness", { length: 32 }).default("claude-code"),
    agentModel: varchar("agentModel", { length: 96 }),
    gitRepo: text("gitRepo"),
    pinned: boolean("pinned").default(false).notNull(),
    status: upstashBoxStatusEnum("status").default("created").notNull(),
    lastRunAt: timestamp("lastRunAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("idx_upstash_boxes_owner").on(table.ownerWallet),
    statusIdx: index("idx_upstash_boxes_status").on(table.status),
  }),
);

export type UpstashBox = typeof upstashBoxes.$inferSelect;
export type InsertUpstashBox = typeof upstashBoxes.$inferInsert;

// ─── Legacy/App Feature Tables ───────────────────────────────────────────────
export const tokens = pgTable("tokens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  mintAddress: text("mint_address").notNull(),
  metadata: jsonb("metadata"),
  upvotes: integer("upvotes").default(0).notNull(),
  downvotes: integer("downvotes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Token = typeof tokens.$inferSelect;
export type InsertToken = typeof tokens.$inferInsert;

export const burns = pgTable("burns", {
  id: serial("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  ownerAddress: text("owner_address").notNull(),
  signature: text("signature").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  assetType: text("asset_type").default("token"),
  metadata: jsonb("metadata"),
});

export type Burn = typeof burns.$inferSelect;
export type InsertBurn = typeof burns.$inferInsert;

export const tokenVotes = pgTable("token_votes", {
  id: text("id").notNull(),
  tokenAddress: text("token_address").notNull(),
  walletAddress: text("wallet_address").notNull(),
  voteType: text("vote_type").notNull(),
  timestamp: integer("timestamp").notNull(),
}, (table) => ({
  pk: primaryKey(table.id),
}));

export type TokenVote = typeof tokenVotes.$inferSelect;
export type InsertTokenVote = typeof tokenVotes.$inferInsert;

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  isUpvote: boolean("is_upvote").notNull(),
  reason: text("reason"),
  signature: text("signature").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Vote = typeof votes.$inferSelect;
export type InsertVote = typeof votes.$inferInsert;

export const chatRooms = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  tokenAddress: text("token_address"),
  isPrivate: boolean("is_private").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  memberCount: integer("member_count").default(0).notNull(),
  metadata: jsonb("metadata"),
});

export type ChatRoom = typeof chatRooms.$inferSelect;
export type InsertChatRoom = typeof chatRooms.$inferInsert;

export const roomMembers = pgTable("room_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  displayName: varchar("display_name", { length: 50 }).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isBanned: boolean("is_banned").default(false).notNull(),
}, (table) => ({
  uniqueMembership: uniqueIndex("room_members_room_wallet_unique").on(table.roomId, table.walletAddress),
}));

export type RoomMember = typeof roomMembers.$inferSelect;
export type InsertRoomMember = typeof roomMembers.$inferInsert;

export const deepseekSessions = pgTable("deepseek_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  walletAddress: text("wallet_address"),
  model: text("model").default("deepseek-v4-pro").notNull(),
  thinkingEnabled: boolean("thinking_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  cacheHitTokens: integer("cache_hit_tokens").default(0).notNull(),
  metadata: jsonb("metadata"),
});

export type DeepseekSession = typeof deepseekSessions.$inferSelect;
export type InsertDeepseekSession = typeof deepseekSessions.$inferInsert;

export const deepseekMessages = pgTable("deepseek_messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content"),
  reasoningContent: text("reasoning_content"),
  toolCalls: jsonb("tool_calls"),
  toolCallId: text("tool_call_id"),
  toolName: text("tool_name"),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  cacheHitTokens: integer("cache_hit_tokens").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sessionIdx: index("deepseek_messages_session_idx").on(table.sessionId, table.createdAt),
}));

export type DeepseekMessage = typeof deepseekMessages.$inferSelect;
export type InsertDeepseekMessage = typeof deepseekMessages.$inferInsert;

export const agentDeployments = pgTable("agent_deployments", {
  id: serial("id").primaryKey(),
  assetAddress: text("asset_address").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol"),
  agentType: text("agent_type"),
  ownerWallet: text("owner_wallet"),
  registrationUri: text("registration_uri"),
  tokenMint: text("token_mint"),
  signature: text("signature"),
  isRegistered: boolean("is_registered").default(false).notNull(),
  network: text("network").default("mainnet-beta").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgentDeployment = typeof agentDeployments.$inferSelect;
export type InsertAgentDeployment = typeof agentDeployments.$inferInsert;

export const galleryVotes = pgTable("gallery_votes", {
  generationId: integer("generation_id").notNull(),
  voterId: text("voter_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey(table.generationId, table.voterId),
  generationCreatedIdx: index("gallery_votes_generation_created_at_idx").on(table.generationId, table.createdAt),
  voterCreatedIdx: index("gallery_votes_voter_created_at_idx").on(table.voterId, table.createdAt),
}));

export type GalleryVote = typeof galleryVotes.$inferSelect;
export type InsertGalleryVote = typeof galleryVotes.$inferInsert;

export const agentFeedItems = pgTable("agent_feed_items", {
  id: serial("id").primaryKey(),
  assetAddress: text("asset_address").notNull().unique(),
  pda: text("pda"),
  wallet: text("wallet"),
  signature: text("signature").unique(),
  slot: bigint("slot", { mode: "number" }),
  blockTime: bigint("block_time", { mode: "number" }),
  network: text("network"),
  name: text("name"),
  image: text("image"),
  description: text("description"),
  registrationUri: text("registration_uri"),
  services: jsonb("services").default([]).notNull(),
  active: boolean("active"),
  supportedTrust: jsonb("supported_trust").default([]).notNull(),
  ownerWallet: text("owner_wallet"),
  payerWallet: text("payer_wallet"),
  authorityWallet: text("authority_wallet"),
  collectionAddress: text("collection_address"),
  agentIdentityPda: text("agent_identity_pda"),
  assetSignerPda: text("asset_signer_pda"),
  coreMetadataUri: text("core_metadata_uri"),
  schemaType: text("schema_type"),
  lifecycleTransfer: boolean("lifecycle_transfer"),
  lifecycleUpdate: boolean("lifecycle_update"),
  lifecycleExecute: boolean("lifecycle_execute"),
  registrations: jsonb("registrations").default([]).notNull(),
  metadata: jsonb("metadata"),
  rawRegistry: jsonb("raw_registry"),
  walletBalanceLamports: text("wallet_balance_lamports"),
  tokenMint: text("token_mint"),
  genesisAccount: text("genesis_account"),
  launchId: text("launch_id"),
  launchUrl: text("launch_url"),
  launchType: text("launch_type"),
  setAgentToken: boolean("set_agent_token"),
  creatorFeeWallet: text("creator_fee_wallet"),
  launchSignatures: jsonb("launch_signatures").default([]).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  insertedAt: timestamp("inserted_at").defaultNow().notNull(),
}, (table) => ({
  insertedAtIdx: index("agent_feed_items_inserted_at_idx").on(table.insertedAt),
}));

export type AgentFeedItem = typeof agentFeedItems.$inferSelect;
export type InsertAgentFeedItem = typeof agentFeedItems.$inferInsert;

export const treasuryPayments = pgTable("treasury_payments", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  txSignature: varchar("txSignature", { length: 128 }).notNull().unique(),
  solPaid: real("solPaid").notNull(),
  solUsdAtTime: real("solUsdAtTime"),
  clawdBurned: real("clawdBurned"),
  clawdUsdAtTime: real("clawdUsdAtTime"),
  feature: varchar("feature", { length: 64 }).default("general").notNull(),
  burnSignature: varchar("burnSignature", { length: 128 }),
  status: varchar("status", { length: 32 }).default("verified").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TreasuryPayment = typeof treasuryPayments.$inferSelect;
export type InsertTreasuryPayment = typeof treasuryPayments.$inferInsert;

export const agentStakes = pgTable("agent_stakes", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  assetAddress: varchar("assetAddress", { length: 64 }).notNull().unique(),
  assetName: varchar("assetName", { length: 128 }),
  assetImage: text("assetImage"),
  assetType: varchar("assetType", { length: 32 }).default("nft").notNull(),
  collectionAddress: varchar("collectionAddress", { length: 64 }),
  rewardRatePerDay: integer("rewardRatePerDay").default(100).notNull(),
  rewardsClaimed: integer("rewardsClaimed").default(0).notNull(),
  status: varchar("status", { length: 32 }).default("staked").notNull(),
  stakedAt: timestamp("stakedAt").defaultNow().notNull(),
  unstakedAt: timestamp("unstakedAt"),
  lastClaimedAt: timestamp("lastClaimedAt"),
});

export type AgentStake = typeof agentStakes.$inferSelect;
export type InsertAgentStake = typeof agentStakes.$inferInsert;

export const userGenerations = pgTable("user_generations", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  kind: generationKindEnum("kind").notNull(),
  prompt: text("prompt").notNull(),
  enhancedPrompt: text("enhancedPrompt"),
  mode: varchar("mode", { length: 32 }).default("t2i").notNull(),
  model: varchar("model", { length: 64 }).default("grok-imagine-image").notNull(),
  sourceUrl: text("sourceUrl"),
  bucketKey: text("bucketKey"),
  mediaUrl: text("mediaUrl"),
  thumbnail: text("thumbnail"),
  galleryId: varchar("galleryId", { length: 64 }),
  metadata: jsonb("metadata"),
  saved: boolean("saved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  walletIdx: index("user_generations_wallet_idx").on(table.walletAddress),
  savedIdx: index("user_generations_saved_idx").on(table.walletAddress, table.saved),
}));

export type UserGeneration = typeof userGenerations.$inferSelect;
export type InsertUserGeneration = typeof userGenerations.$inferInsert;

export const walletTelegramLinks = pgTable("wallet_telegram_links", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull().unique(),
  telegramId: varchar("telegramId", { length: 32 }).notNull().unique(),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  telegramFirstName: varchar("telegramFirstName", { length: 128 }),
  photoUrl: text("photoUrl"),
  authDate: integer("authDate"),
  linkedAt: timestamp("linkedAt").defaultNow().notNull(),
});

export type WalletTelegramLink = typeof walletTelegramLinks.$inferSelect;
export type InsertWalletTelegramLink = typeof walletTelegramLinks.$inferInsert;

export const userAgents = pgTable("user_agents", {
  id: serial("id").primaryKey(),
  ownerWallet: varchar("ownerWallet", { length: 64 }).notNull(),
  slug: varchar("slug", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  persona: text("persona").notNull(),
  greeting: text("greeting"),
  provider: varchar("provider", { length: 32 }).default("deepseek").notNull(),
  model: varchar("model", { length: 64 }).default("deepseek-v4-pro").notNull(),
  avatarUrl: text("avatarUrl"),
  sourceAgentId: varchar("sourceAgentId", { length: 128 }),
  launchRuntime: varchar("launchRuntime", { length: 64 }),
  importedSpec: jsonb("importedSpec"),
  status: varchar("status", { length: 16 }).default("active").notNull(),
  promptCount: integer("promptCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index("user_agents_owner_idx").on(table.ownerWallet),
}));

export type UserAgent = typeof userAgents.$inferSelect;
export type InsertUserAgent = typeof userAgents.$inferInsert;

export const clawdState = pgTable("clawd_state", {
  id: integer("id").primaryKey(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  cashUsd: numeric("cash_usd").default("10000").notNull(),
  totalPnlUsd: numeric("total_pnl_usd").default("0").notNull(),
  totalFills: integer("total_fills").default(0).notNull(),
  lastTick: timestamp("last_tick", { withTimezone: true }),
});

export const clawdDecisions = pgTable("clawd_decisions", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  venue: text("venue").notNull(),
  symbol: text("symbol").notNull(),
  signal: text("signal").notNull(),
  signalScore: numeric("signal_score").default("0").notNull(),
  signalReasons: jsonb("signal_reasons").default([]).notNull(),
  gateAction: text("gate_action").notNull(),
  gateReasoning: text("gate_reasoning").notNull(),
  outcome: text("outcome"),
});

export const clawdFills = pgTable("clawd_fills", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  venue: text("venue").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  size: numeric("size").notNull(),
  price: numeric("price").notNull(),
  notionalUsd: numeric("notional_usd").notNull(),
  pnlUsd: numeric("pnl_usd"),
  mode: text("mode").notNull(),
  txSignature: text("tx_signature"),
  decisionId: integer("decision_id"),
});

export const clawdPositions = pgTable("clawd_positions", {
  id: serial("id").primaryKey(),
  venue: text("venue").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  size: numeric("size").notNull(),
  entryPrice: numeric("entry_price").notNull(),
  currentPrice: numeric("current_price"),
  pnlUsd: numeric("pnl_usd").default("0").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const clawdMirrorActions = pgTable("clawd_mirror_actions", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  walletAddress: text("wallet_address").notNull(),
  sourceFillId: integer("source_fill_id").notNull(),
  symbol: text("symbol").notNull(),
  mint: text("mint").notNull(),
  side: text("side").notNull(),
  amountInRaw: numeric("amount_in_raw"),
  amountOut: numeric("amount_out"),
  notionalUsd: numeric("notional_usd"),
  txSignature: text("tx_signature"),
  status: text("status").default("submitted").notNull(),
}, (table) => ({
  txSignatureIdx: uniqueIndex("clawd_mirror_actions_tx_signature_idx")
    .on(table.txSignature),
}));

// ─── Better Auth: Organization plugin tables (org + teams) ───────────────────
export const betterAuthOrganization = pgTable("ba_organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const betterAuthMember = pgTable("ba_member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => betterAuthOrganization.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => betterAuthUser.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const betterAuthInvitation = pgTable("ba_invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => betterAuthOrganization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expiresAt").notNull(),
  inviterId: text("inviterId").notNull().references(() => betterAuthUser.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const baTeam = pgTable("ba_team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  organizationId: text("organizationId").notNull().references(() => betterAuthOrganization.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt"),
});

export const baTeamMember = pgTable("ba_team_member", {
  id: text("id").primaryKey(),
  teamId: text("teamId").notNull().references(() => baTeam.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => betterAuthUser.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ─── Better Auth: Agent Auth plugin tables (trainer → pokemon) ────────────────
// agentHost = "trainer" — a registered client app / human who sponsors agents
export const baAgentHost = pgTable("ba_agent_host", {
  id: text("id").primaryKey(),
  name: text("name"),
  userId: text("userId").references(() => betterAuthUser.id, { onDelete: "cascade" }),
  defaultCapabilities: text("defaultCapabilities"),
  publicKey: text("publicKey"),
  kid: text("kid"),
  jwksUrl: text("jwksUrl"),
  enrollmentTokenHash: text("enrollmentTokenHash"),
  enrollmentTokenExpiresAt: timestamp("enrollmentTokenExpiresAt"),
  status: text("status").notNull().default("active"),
  activatedAt: timestamp("activatedAt"),
  expiresAt: timestamp("expiresAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// agent = "pokemon" — an AI agent registered under a host
export const baAgent = pgTable("ba_agent", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  userId: text("userId").references(() => betterAuthUser.id, { onDelete: "cascade" }),
  hostId: text("hostId").notNull().references(() => baAgentHost.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  mode: text("mode").notNull().default("delegated"),
  publicKey: text("publicKey").notNull(),
  kid: text("kid"),
  jwksUrl: text("jwksUrl"),
  lastUsedAt: timestamp("lastUsedAt"),
  activatedAt: timestamp("activatedAt"),
  expiresAt: timestamp("expiresAt"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const baAgentCapabilityGrant = pgTable("ba_agent_capability_grant", {
  id: text("id").primaryKey(),
  agentId: text("agentId").notNull().references(() => baAgent.id, { onDelete: "cascade" }),
  capability: text("capability").notNull(),
  deniedBy: text("deniedBy").references(() => betterAuthUser.id, { onDelete: "cascade" }),
  grantedBy: text("grantedBy").references(() => betterAuthUser.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt"),
  status: text("status").notNull().default("active"),
  reason: text("reason"),
  constraints: text("constraints"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const baApprovalRequest = pgTable("ba_approval_request", {
  id: text("id").primaryKey(),
  method: text("method").notNull(),
  agentId: text("agentId").references(() => baAgent.id, { onDelete: "cascade" }),
  hostId: text("hostId").references(() => baAgentHost.id, { onDelete: "cascade" }),
  userId: text("userId").references(() => betterAuthUser.id, { onDelete: "cascade" }),
  capabilities: text("capabilities"),
  status: text("status").notNull().default("pending"),
  userCodeHash: text("userCodeHash"),
  loginHint: text("loginHint"),
  bindingMessage: text("bindingMessage"),
  clientNotificationToken: text("clientNotificationToken"),
  clientNotificationEndpoint: text("clientNotificationEndpoint"),
  deliveryMode: text("deliveryMode"),
  interval: integer("interval").notNull().default(5),
  lastPolledAt: timestamp("lastPolledAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
