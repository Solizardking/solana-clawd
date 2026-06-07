import { pgTable, text, timestamp, boolean, integer, index, jsonb } from "drizzle-orm/pg-core";

// ── Better Auth core tables ──────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ── Agent Auth tables ────────────────────────────────────────────────

export const agentHost = pgTable(
  "agent_host",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    defaultCapabilities: text("default_capabilities"),
    publicKey: text("public_key"),
    kid: text("kid"),
    jwksUrl: text("jwks_url"),
    enrollmentTokenHash: text("enrollment_token_hash"),
    enrollmentTokenExpiresAt: timestamp("enrollment_token_expires_at"),
    status: text("status").notNull().default("active"),
    activatedAt: timestamp("activated_at"),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("agentHost_userId_idx").on(table.userId),
    index("agentHost_kid_idx").on(table.kid),
    index("agentHost_status_idx").on(table.status),
  ],
);

export const agent = pgTable(
  "agent",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    hostId: text("host_id")
      .notNull()
      .references(() => agentHost.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    mode: text("mode").notNull().default("delegated"),
    publicKey: text("public_key").notNull(),
    kid: text("kid"),
    jwksUrl: text("jwks_url"),
    lastUsedAt: timestamp("last_used_at"),
    activatedAt: timestamp("activated_at"),
    expiresAt: timestamp("expires_at"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("agent_userId_idx").on(table.userId),
    index("agent_hostId_idx").on(table.hostId),
    index("agent_kid_idx").on(table.kid),
    index("agent_status_idx").on(table.status),
  ],
);

export const agentCapabilityGrant = pgTable(
  "agent_capability_grant",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    deniedBy: text("denied_by").references(() => user.id, { onDelete: "cascade" }),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    status: text("status").notNull().default("active"),
    reason: text("reason"),
    constraints: text("constraints"),
  },
  (table) => [
    index("agentCapabilityGrant_agentId_idx").on(table.agentId),
    index("agentCapabilityGrant_agentId_status_idx").on(table.agentId, table.status),
  ],
);

export const approvalRequest = pgTable(
  "approval_request",
  {
    id: text("id").primaryKey(),
    method: text("method").notNull(),
    agentId: text("agent_id").references(() => agent.id, { onDelete: "cascade" }),
    hostId: text("host_id").references(() => agentHost.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    capabilities: text("capabilities"),
    status: text("status").notNull().default("pending"),
    userCodeHash: text("user_code_hash"),
    loginHint: text("login_hint"),
    bindingMessage: text("binding_message"),
    clientNotificationToken: text("client_notification_token"),
    clientNotificationEndpoint: text("client_notification_endpoint"),
    deliveryMode: text("delivery_mode"),
    interval: integer("interval").notNull(),
    lastPolledAt: timestamp("last_polled_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("approvalRequest_agentId_idx").on(table.agentId),
    index("approvalRequest_userId_idx").on(table.userId),
    index("approvalRequest_status_idx").on(table.status),
  ],
);

// ── Brex Agent app-specific tables ───────────────────────────────────

export const brexConnection = pgTable(
  "brex_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brexAccessToken: text("brex_access_token").notNull(),
    brexAccountId: text("brex_account_id"),
    accountName: text("account_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("brexConnection_userId_idx").on(table.userId)],
);

export const brexCard = pgTable(
  "brex_card",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brexConnectionId: text("brex_connection_id")
      .notNull()
      .references(() => brexConnection.id, { onDelete: "cascade" }),
    brexCardId: text("brex_card_id").notNull(),
    last4: text("last4").notNull(),
    cardName: text("card_name").notNull(),
    cardType: text("card_type").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("brexCard_userId_idx").on(table.userId),
    index("brexCard_userId_isDefault_idx").on(table.userId, table.isDefault),
  ],
);

export const agentPayment = pgTable(
  "agent_payment",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    merchantName: text("merchant_name").notNull(),
    itemDescription: text("item_description").notNull(),
    status: text("status").notNull().default("pending"),
    brexCardLast4: text("brex_card_last4"),
    sptId: text("spt_id"),
    approvedAt: timestamp("approved_at"),
    deniedAt: timestamp("denied_at"),
    deniedReason: text("denied_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("agentPayment_agentId_idx").on(table.agentId),
    index("agentPayment_userId_idx").on(table.userId),
    index("agentPayment_status_idx").on(table.status),
    index("agentPayment_userId_status_idx").on(table.userId, table.status),
  ],
);
