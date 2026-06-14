import { relations } from "drizzle-orm";

import {
  airdropClaims,
  agentWalletQueue,
  agentWallets,
  aiUsage,
  apiKeyAuditLog,
  apiKeys,
  chatMessages,
  chatSessions,
  cliPairCodes,
  generations,
  imageGenerations,
  installExecutions,
  metaplexAgents,
  monetizedAgents,
  paymentEvents,
  savedItems,
  telegramLinkChallenges,
  telegramLinks,
  users,
  walletConnections,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  chatSessions: many(chatSessions),
  chatMessages: many(chatMessages),
  aiUsage: many(aiUsage),
  imageGenerations: many(imageGenerations),
  generations: many(generations),
  agentWallets: many(agentWallets),
  walletConnections: many(walletConnections),
  telegramLink: many(telegramLinks),
  telegramLinkChallenges: many(telegramLinkChallenges),
  cliPairCodes: many(cliPairCodes),
  apiKeys: many(apiKeys),
  savedItems: many(savedItems),
  monetizedAgents: many(monetizedAgents),
  installExecutions: many(installExecutions),
  airdropClaims: many(airdropClaims),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
  messages: many(chatMessages),
  aiUsage: many(aiUsage),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, { fields: [chatMessages.sessionId], references: [chatSessions.id] }),
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(users, { fields: [aiUsage.userId], references: [users.id] }),
  session: one(chatSessions, { fields: [aiUsage.sessionId], references: [chatSessions.id] }),
}));

export const imageGenerationsRelations = relations(imageGenerations, ({ one }) => ({
  user: one(users, { fields: [imageGenerations.userId], references: [users.id] }),
}));

export const generationsRelations = relations(generations, ({ one }) => ({
  user: one(users, { fields: [generations.userId], references: [users.id] }),
}));

export const agentWalletsRelations = relations(agentWallets, ({ one, many }) => ({
  user: one(users, { fields: [agentWallets.userId], references: [users.id] }),
  queue: many(agentWalletQueue),
  apiKeys: many(apiKeys),
  monetizedAgents: many(monetizedAgents),
}));

export const agentWalletQueueRelations = relations(agentWalletQueue, ({ one }) => ({
  agentWallet: one(agentWallets, { fields: [agentWalletQueue.agentWalletId], references: [agentWallets.id] }),
  user: one(users, { fields: [agentWalletQueue.userId], references: [users.id] }),
}));

export const walletConnectionsRelations = relations(walletConnections, ({ one }) => ({
  user: one(users, { fields: [walletConnections.userId], references: [users.id] }),
}));

export const telegramLinksRelations = relations(telegramLinks, ({ one }) => ({
  user: one(users, { fields: [telegramLinks.userId], references: [users.id] }),
}));

export const telegramLinkChallengesRelations = relations(telegramLinkChallenges, ({ one }) => ({
  user: one(users, { fields: [telegramLinkChallenges.userId], references: [users.id] }),
}));

export const cliPairCodesRelations = relations(cliPairCodes, ({ one }) => ({
  user: one(users, { fields: [cliPairCodes.userId], references: [users.id] }),
  consumedApiKey: one(apiKeys, { fields: [cliPairCodes.consumedApiKeyId], references: [apiKeys.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
  agentWallet: one(agentWallets, { fields: [apiKeys.agentWalletId], references: [agentWallets.id] }),
  auditLog: many(apiKeyAuditLog),
}));

export const apiKeyAuditLogRelations = relations(apiKeyAuditLog, ({ one }) => ({
  apiKey: one(apiKeys, { fields: [apiKeyAuditLog.apiKeyId], references: [apiKeys.id] }),
  user: one(users, { fields: [apiKeyAuditLog.userId], references: [users.id] }),
}));

export const savedItemsRelations = relations(savedItems, ({ one }) => ({
  user: one(users, { fields: [savedItems.userId], references: [users.id] }),
}));

export const monetizedAgentsRelations = relations(monetizedAgents, ({ one, many }) => ({
  owner: one(users, { fields: [monetizedAgents.ownerUserId], references: [users.id] }),
  agentWallet: one(agentWallets, { fields: [monetizedAgents.agentWalletId], references: [agentWallets.id] }),
  paymentEvents: many(paymentEvents),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  monetizedAgent: one(monetizedAgents, { fields: [paymentEvents.monetizedAgentId], references: [monetizedAgents.id] }),
}));

export const installExecutionsRelations = relations(installExecutions, ({ one, many }) => ({
  user: one(users, { fields: [installExecutions.userId], references: [users.id] }),
  airdropClaims: many(airdropClaims),
}));

export const airdropClaimsRelations = relations(airdropClaims, ({ one }) => ({
  user: one(users, { fields: [airdropClaims.userId], references: [users.id] }),
  installExecution: one(installExecutions, { fields: [airdropClaims.installHash], references: [installExecutions.installHash] }),
}));

export const metaplexAgentsRelations = relations(metaplexAgents, ({ one }) => ({
  ownerUser: one(users, { fields: [metaplexAgents.ownerWallet], references: [users.walletAddress] }),
}));
