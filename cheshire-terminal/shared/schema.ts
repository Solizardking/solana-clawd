import {
  pgTable, pgEnum, text, serial, integer, bigint, boolean, real,
  jsonb, json, timestamp, varchar, primaryKey, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const chatModeEnum = pgEnum("chat_mode", ["chat", "vibe-code", "research"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const requestTypeEnum = pgEnum("request_type", ["chat", "image", "code", "research"]);
export const imageStatusEnum = pgEnum("image_status", ["pending", "completed", "failed"]);
export const generationKindEnum = pgEnum("generation_kind", ["image", "video", "music"]);
export const agentStatusEnum = pgEnum("agent_status", ["active", "paused", "archived"]);
export const queueStatusEnum = pgEnum("queue_status", ["pending", "approved", "rejected", "executed"]);
export const savedItemKindEnum = pgEnum("saved_item_kind", [
  "vibe-project", "image", "video", "music", "audio", "document", "chat", "agent", "other",
]);
export const monetizedTargetEnum = pgEnum("monetized_target", ["agent", "mcp", "http", "tool"]);
export const paymentEventStatusEnum = pgEnum("payment_event_status", ["verified", "settled", "failed"]);
export const airdropClaimStatusEnum = pgEnum("airdrop_claim_status", ["pending", "sent", "failed", "skipped"]);

// ─── Tokens (meme token launcher) ────────────────────────────────────────────
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

export const insertTokenSchema = createInsertSchema(tokens).extend({
  name: z.string().min(1, "Name is required"),
  symbol: z.string().min(1, "Symbol is required").max(10, "Symbol too long"),
  description: z.string().min(1, "Description is required"),
  imageUrl: z.string().url("Invalid image URL"),
  mintAddress: z.string().min(32, "Invalid mint address"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokens.$inferSelect;

// ─── Burns ────────────────────────────────────────────────────────────────────
export const burns = pgTable("burns", {
  id: serial("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  ownerAddress: text("owner_address").notNull(),
  signature: text("signature").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  assetType: text("asset_type").default("token"),
  metadata: jsonb("metadata"),
});

export const insertBurnSchema = createInsertSchema(burns).extend({
  assetId: z.string().min(32, "Invalid asset ID"),
  ownerAddress: z.string().min(32, "Invalid owner address"),
  signature: z.string().default(""),
  timestamp: z.string().optional(),
  assetType: z.enum(["token", "nft"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InsertBurn = z.infer<typeof insertBurnSchema>;
export type Burn = typeof burns.$inferSelect;

// ─── Token Votes (by address) ─────────────────────────────────────────────────
export const tokenVotes = pgTable("token_votes", {
  id: text("id").notNull(),
  tokenAddress: text("token_address").notNull(),
  walletAddress: text("wallet_address").notNull(),
  voteType: text("vote_type").notNull(),
  timestamp: integer("timestamp").notNull(),
}, (table) => ({
  pk: primaryKey(table.id),
}));

export const insertTokenVoteSchema = createInsertSchema(tokenVotes);
export type InsertTokenVote = z.infer<typeof insertTokenVoteSchema>;
export type TokenVote = typeof tokenVotes.$inferSelect;

// ─── Votes (token ID-based) ───────────────────────────────────────────────────
export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  isUpvote: boolean("is_upvote").notNull(),
  reason: text("reason"),
  signature: text("signature").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVoteSchema = createInsertSchema(votes).extend({
  tokenId: z.number().int().positive(),
  walletAddress: z.string().min(32, "Invalid wallet address"),
  isUpvote: z.boolean(),
  reason: z.string().optional(),
  signature: z.string().min(1, "Signature is required"),
});

export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votes.$inferSelect;

export interface VoteStats {
  upvotes: number;
  downvotes: number;
  totalVotes: number;
  userVote?: boolean;
}

export const verifyVoteSchema = z.object({
  tokenId: z.number().int().positive(),
  walletAddress: z.string(),
  signature: z.string(),
  isUpvote: z.boolean(),
  timestamp: z.number(),
});
export type VerifyVote = z.infer<typeof verifyVoteSchema>;

// ─── Chat Rooms (real-time community chat) ────────────────────────────────────
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

export const insertChatRoomSchema = createInsertSchema(chatRooms).extend({
  name: z.string().min(3).max(100),
  description: z.string().optional(),
  tokenAddress: z.string().optional(),
  isPrivate: z.boolean().default(false),
  createdBy: z.string().min(32),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InsertChatRoom = z.infer<typeof insertChatRoomSchema>;
export type ChatRoom = typeof chatRooms.$inferSelect;

// ─── Chat Messages (room-based real-time chat) ────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  sender: text("sender").notNull(),
  senderName: varchar("sender_name", { length: 50 }).notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  replyTo: integer("reply_to"),
  clientType: varchar("client_type", { length: 20 }),
  metadata: jsonb("metadata"),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).extend({
  roomId: z.number().int().positive(),
  sender: z.string().min(3),
  senderName: z.string().min(1).max(50),
  content: z.string().min(1),
  isSystem: z.boolean().default(false),
  replyTo: z.number().int().positive().optional(),
  clientType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export enum ChatEventType {
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  SEND_MESSAGE = 'send_message',
  NEW_MESSAGE = 'new_message',
  USER_JOINED = 'user_joined',
  USER_LEFT = 'user_left',
  ROOM_UPDATE = 'room_update',
  ERROR = 'error'
}

export interface ChatEvent {
  type: ChatEventType;
  roomId?: number;
  message?: InsertChatMessage | ChatMessage;
  user?: { walletAddress: string; displayName: string };
  timestamp: string;
  error?: string;
}

// ─── Room Members ─────────────────────────────────────────────────────────────
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

export const insertRoomMemberSchema = createInsertSchema(roomMembers).extend({
  roomId: z.number().int().positive(),
  walletAddress: z.string().min(32),
  displayName: z.string().min(1).max(50),
  isAdmin: z.boolean().default(false),
});

export type InsertRoomMember = z.infer<typeof insertRoomMemberSchema>;
export type RoomMember = typeof roomMembers.$inferSelect;

// ─── DeepSeek Sessions ────────────────────────────────────────────────────────
export const deepseekSessions = pgTable("deepseek_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  walletAddress: text("wallet_address"),
  model: text("model").notNull().default("deepseek-v4-pro"),
  thinkingEnabled: boolean("thinking_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  cacheHitTokens: integer("cache_hit_tokens").default(0).notNull(),
  metadata: jsonb("metadata"),
});

export const insertDeepseekSessionSchema = createInsertSchema(deepseekSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeepseekSession = z.infer<typeof insertDeepseekSessionSchema>;
export type DeepseekSession = typeof deepseekSessions.$inferSelect;

// ─── DeepSeek Messages ────────────────────────────────────────────────────────
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
});

export const insertDeepseekMessageSchema = createInsertSchema(deepseekMessages).omit({ id: true, createdAt: true });
export type InsertDeepseekMessage = z.infer<typeof insertDeepseekMessageSchema>;
export type DeepseekMessage = typeof deepseekMessages.$inferSelect;

// ─── Agent Deployments (on-chain) ─────────────────────────────────────────────
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

export const insertAgentDeploymentSchema = createInsertSchema(agentDeployments).omit({ id: true, createdAt: true });
export type InsertAgentDeployment = z.infer<typeof insertAgentDeploymentSchema>;
export type AgentDeployment = typeof agentDeployments.$inferSelect;

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }),
  clawdBalance: real("clawdBalance").default(0),
  isTokenGated: boolean("isTokenGated").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  telegramUserId: varchar("telegramUserId", { length: 64 }),
  telegramUsername: varchar("telegramUsername", { length: 64 }),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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

export const insertWalletConnectionSchema = createInsertSchema(walletConnections).omit({ id: true });
export type InsertWalletConnection = z.infer<typeof insertWalletConnectionSchema>;
export type WalletConnection = typeof walletConnections.$inferSelect;

// ─── AI Chat Sessions ─────────────────────────────────────────────────────────
export const aiChatSessions = pgTable("ai_chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).default("New Session"),
  model: varchar("model", { length: 64 }).default("grok-4-1-fast"),
  mode: chatModeEnum("mode").default("chat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const insertAiChatSessionSchema = createInsertSchema(aiChatSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiChatSession = z.infer<typeof insertAiChatSessionSchema>;
export type AiChatSession = typeof aiChatSessions.$inferSelect;

// ─── AI Chat Messages (session-based, role/model aware) ───────────────────────
export const aiChatMessages = pgTable("ai_chat_messages", {
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

export const insertAiChatMessageSchema = createInsertSchema(aiChatMessages).omit({ id: true, createdAt: true });
export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;

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

export const insertAiUsageSchema = createInsertSchema(aiUsage).omit({ id: true, createdAt: true });
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;
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

export const insertImageGenerationSchema = createInsertSchema(imageGenerations).omit({ id: true, createdAt: true });
export type InsertImageGeneration = z.infer<typeof insertImageGenerationSchema>;
export type ImageGeneration = typeof imageGenerations.$inferSelect;

// ─── Unified Generations Feed (image + video + music) ─────────────────────────
export const generations = pgTable(
  "generations",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().default(0),
    kind: generationKindEnum("kind").notNull(),
    prompt: text("prompt").notNull(),
    model: varchar("model", { length: 128 }),
    mediaUrl: text("mediaUrl").notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    durationSeconds: integer("durationSeconds"),
    isPublic: boolean("isPublic").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    kindCreatedAtIdx: index("generations_kind_created_at_idx").on(table.kind, table.createdAt),
    publicCreatedAtIdx: index("generations_public_created_at_idx").on(table.isPublic, table.createdAt),
  }),
);

export const insertGenerationSchema = createInsertSchema(generations).omit({ id: true, createdAt: true });
export type InsertGeneration = z.infer<typeof insertGenerationSchema>;
export type Generation = typeof generations.$inferSelect;

// ─── Gallery Votes ────────────────────────────────────────────────────────────
export const galleryVotes = pgTable(
  "gallery_votes",
  {
    generationId: integer("generation_id").notNull().references(() => generations.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey(table.generationId, table.voterId),
    generationCreatedIdx: index("gallery_votes_generation_created_at_idx").on(table.generationId, table.createdAt),
    voterCreatedIdx: index("gallery_votes_voter_created_at_idx").on(table.voterId, table.createdAt),
  }),
);

export const insertGalleryVoteSchema = createInsertSchema(galleryVotes).omit({ createdAt: true });
export type InsertGalleryVote = z.infer<typeof insertGalleryVoteSchema>;
export type GalleryVote = typeof galleryVotes.$inferSelect;

// ─── Agent Feed Items ─────────────────────────────────────────────────────────
export const agentFeedItems = pgTable(
  "agent_feed_items",
  {
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
  },
  (table) => ({
    insertedAtIdx: index("agent_feed_items_inserted_at_idx").on(table.insertedAt),
  }),
);

export const insertAgentFeedItemSchema = createInsertSchema(agentFeedItems).omit({ id: true, insertedAt: true });
export type InsertAgentFeedItem = z.infer<typeof insertAgentFeedItemSchema>;
export type AgentFeedItem = typeof agentFeedItems.$inferSelect;

// ─── Metaplex Agents ──────────────────────────────────────────────────────────
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
    source: varchar("source", { length: 64 }).default("metaplex").notNull(),
    status: varchar("status", { length: 32 }).default("registered").notNull(),
    launchedAt: timestamp("launchedAt"),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    networkAssetIdx: index("idx_metaplex_agents_network_asset").on(table.network, table.assetAddress),
    ownerIdx: index("idx_metaplex_agents_owner").on(table.ownerWallet),
    identityPdaIdx: index("idx_metaplex_agents_identity_pda").on(table.agentIdentityPda),
    signerPdaIdx: index("idx_metaplex_agents_signer_pda").on(table.assetSignerPda),
    tokenMintIdx: index("idx_metaplex_agents_token_mint").on(table.tokenMint),
    activeIdx: index("idx_metaplex_agents_active").on(table.active),
    updatedAtIdx: index("idx_metaplex_agents_updated_at").on(table.updatedAt),
  }),
);

export const insertMetaplexAgentSchema = createInsertSchema(metaplexAgents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMetaplexAgent = z.infer<typeof insertMetaplexAgentSchema>;
export type MetaplexAgent = typeof metaplexAgents.$inferSelect;

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

export const insertAgentWalletSchema = createInsertSchema(agentWallets).omit({ id: true, createdAt: true });
export type InsertAgentWallet = z.infer<typeof insertAgentWalletSchema>;
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

export const insertAgentWalletQueueSchema = createInsertSchema(agentWalletQueue).omit({ id: true, createdAt: true });
export type InsertAgentWalletQueue = z.infer<typeof insertAgentWalletQueueSchema>;
export type AgentWalletQueueItem = typeof agentWalletQueue.$inferSelect;

// ─── API Keys ─────────────────────────────────────────────────────────────────
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  agentWalletId: integer("agentWalletId"),
  name: varchar("name", { length: 128 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  scopes: json("scopes").default([]).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true });
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// ─── API Key Audit Log ─────────────────────────────────────────────────────────
export const apiKeyAuditLog = pgTable("api_key_audit_log", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull(),
  userId: integer("userId").notNull(),
  event: varchar("event", { length: 64 }).notNull(),
  route: text("route"),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiKeyAuditLogSchema = createInsertSchema(apiKeyAuditLog).omit({ id: true, createdAt: true });
export type InsertApiKeyAuditLog = z.infer<typeof insertApiKeyAuditLogSchema>;
export type ApiKeyAuditLogEntry = typeof apiKeyAuditLog.$inferSelect;

// ─── Saved Items (R2 user vault) ──────────────────────────────────────────────
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

export const insertSavedItemSchema = createInsertSchema(savedItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSavedItem = z.infer<typeof insertSavedItemSchema>;
export type SavedItem = typeof savedItems.$inferSelect;

// ─── Monetized Agents (x402 payment routing) ─────────────────────────────────
export const monetizedAgents = pgTable("monetized_agents", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  target: monetizedTargetEnum("target").default("agent").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  description: text("description"),
  recipientWallet: varchar("recipientWallet", { length: 64 }).notNull(),
  agentWalletId: integer("agentWalletId"),
  agentAddress: varchar("agentAddress", { length: 64 }),
  pricePerCallAtomic: integer("pricePerCallAtomic").default(0).notNull(),
  commissionBps: integer("commissionBps").default(1000).notNull(),
  network: varchar("network", { length: 32 }).default("solana-mainnet").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const insertMonetizedAgentSchema = createInsertSchema(monetizedAgents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMonetizedAgent = z.infer<typeof insertMonetizedAgentSchema>;
export type MonetizedAgent = typeof monetizedAgents.$inferSelect;

// ─── Payment Events ───────────────────────────────────────────────────────────
export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  monetizedAgentId: integer("monetizedAgentId"),
  payerWallet: varchar("payerWallet", { length: 64 }),
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

export const insertPaymentEventSchema = createInsertSchema(paymentEvents).omit({ id: true, createdAt: true });
export type InsertPaymentEvent = z.infer<typeof insertPaymentEventSchema>;
export type PaymentEvent = typeof paymentEvents.$inferSelect;

// ─── Install Executions ───────────────────────────────────────────────────────
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

export const insertInstallExecutionSchema = createInsertSchema(installExecutions).omit({ id: true, createdAt: true });
export type InsertInstallExecution = z.infer<typeof insertInstallExecutionSchema>;
export type InstallExecution = typeof installExecutions.$inferSelect;

// ─── Airdrop Claims ───────────────────────────────────────────────────────────
export const airdropClaims = pgTable("airdrop_claims", {
  id: serial("id").primaryKey(),
  installHash: varchar("installHash", { length: 64 }).notNull(),
  walletAddress: varchar("walletAddress", { length: 64 }).notNull(),
  userId: integer("userId"),
  amountAtomic: bigint("amountAtomic", { mode: "bigint" }).notNull().default(sql`0`),
  amountUi: real("amountUi").default(0).notNull(),
  mint: varchar("mint", { length: 64 }).notNull(),
  status: airdropClaimStatusEnum("status").default("pending").notNull(),
  signature: varchar("signature", { length: 128 }),
  reason: text("reason"),
  claimedAt: timestamp("claimedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const insertAirdropClaimSchema = createInsertSchema(airdropClaims).omit({ id: true, createdAt: true });
export type InsertAirdropClaim = z.infer<typeof insertAirdropClaimSchema>;
export type AirdropClaim = typeof airdropClaims.$inferSelect;

// ─── CLI Pair Codes ───────────────────────────────────────────────────────────
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

export const insertCliPairCodeSchema = createInsertSchema(cliPairCodes).omit({ id: true, createdAt: true });
export type InsertCliPairCode = z.infer<typeof insertCliPairCodeSchema>;
export type CliPairCode = typeof cliPairCodes.$inferSelect;

// ─── Telegram Links ───────────────────────────────────────────────────────────
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

export const insertTelegramLinkSchema = createInsertSchema(telegramLinks).omit({ id: true, linkedAt: true, updatedAt: true });
export type InsertTelegramLink = z.infer<typeof insertTelegramLinkSchema>;
export type TelegramLink = typeof telegramLinks.$inferSelect;

// ─── Telegram Link Challenges ─────────────────────────────────────────────────
export const telegramLinkChallenges = pgTable("telegram_link_challenges", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const insertTelegramLinkChallengeSchema = createInsertSchema(telegramLinkChallenges).omit({ id: true, createdAt: true });
export type InsertTelegramLinkChallenge = z.infer<typeof insertTelegramLinkChallengeSchema>;
export type TelegramLinkChallenge = typeof telegramLinkChallenges.$inferSelect;

// ─── Treasury Payments & Burns ───────────────────────────────────────────────
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

export const insertTreasuryPaymentSchema = createInsertSchema(treasuryPayments).omit({ id: true, createdAt: true });
export type InsertTreasuryPayment = z.infer<typeof insertTreasuryPaymentSchema>;
export type TreasuryPayment = typeof treasuryPayments.$inferSelect;

// ─── Agent / NFT Staking ──────────────────────────────────────────────────────
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

export const insertAgentStakeSchema = createInsertSchema(agentStakes).omit({ id: true, stakedAt: true });
export type InsertAgentStake = z.infer<typeof insertAgentStakeSchema>;

export type AgentStake = typeof agentStakes.$inferSelect;

// ─── Imagine Studio: wallet-scoped persistent generations ────────────────────
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
export const insertUserGenerationSchema = createInsertSchema(userGenerations).omit({
  id: true, createdAt: true,
});
export type InsertUserGeneration = z.infer<typeof insertUserGenerationSchema>;
export type UserGeneration = typeof userGenerations.$inferSelect;

// ─── Wallet ↔ Telegram Login Widget Link ─────────────────────────────────────
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

// ─── User-built persistent CLAWD agents (deploy to Telegram) ─────────────────
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
});
export const insertUserAgentSchema = createInsertSchema(userAgents).omit({
  id: true, createdAt: true, promptCount: true, status: true,
}).extend({
  slug: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscore only"),
  name: z.string().min(2).max(64),
  persona: z.string().min(20, "Persona should be at least 20 characters").max(4000),
  greeting: z.string().max(500).optional(),
  provider: z.enum(["xai", "deepseek", "kimi", "openai"]).default("deepseek"),
  model: z.string().min(2).max(64),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  sourceAgentId: z.string().max(128).optional(),
  launchRuntime: z.string().max(64).optional(),
  importedSpec: z.record(z.string(), z.unknown()).optional(),
});
export type InsertUserAgent = z.infer<typeof insertUserAgentSchema>;
export type UserAgent = typeof userAgents.$inferSelect;
