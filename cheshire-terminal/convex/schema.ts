import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rateLimitTables } from "convex-helpers/server/rateLimit";

export default defineSchema({
  ...rateLimitTables,
  // ── Auth & Identity ────────────────────────────────────────────────────────
  users: defineTable({
    walletAddress: v.optional(v.string()),
    openId: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    loginMethod: v.optional(v.string()),
    role: v.string(),
    clawdBalance: v.number(),
    isTokenGated: v.boolean(),
    lastSignedIn: v.number(),
    updatedAt: v.optional(v.number()),
    // Profile fields (added via 0008_wallet_auth_profiles.sql)
    primaryWalletAddress: v.optional(v.string()),
    agentName: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    onboardingCompleted: v.optional(v.boolean()),
    lastHolderVerifiedAt: v.optional(v.number()),
    // Telegram identity
    telegramUserId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_openId", ["openId"])
    .index("by_email", ["email"])
    .index("by_primary_wallet", ["primaryWalletAddress"])
    .index("by_telegram", ["telegramUserId"]),

  userProfiles: defineTable({
    userId: v.string(),
    openId: v.optional(v.string()),
    primaryWalletAddress: v.optional(v.string()),
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
    telegramUserId: v.optional(v.string()),
    agentName: v.optional(v.string()),
    primaryLoginMethod: v.optional(v.string()),
    role: v.string(),
    isTokenGated: v.boolean(),
    onboardingCompleted: v.boolean(),
    preferences: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_openId", ["openId"])
    .index("by_wallet", ["primaryWalletAddress"])
    .index("by_username", ["username"]),

  // ── Auth Challenges (nonce/signature flow) ─────────────────────────────────
  authChallenges: defineTable({
    walletAddress: v.string(),
    nonce: v.string(),
    message: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_nonce", ["nonce"]),

  // ── Auth Sessions ──────────────────────────────────────────────────────────
  authSessions: defineTable({
    userId: v.string(),
    walletAddress: v.string(),
    sessionToken: v.string(),
    loginMethod: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    isTokenHolder: v.boolean(),
    clawdBalance: v.number(),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_wallet", ["walletAddress"])
    .index("by_token", ["sessionToken"]),

  // ── Holder Verifications ───────────────────────────────────────────────────
  holderVerifications: defineTable({
    userId: v.optional(v.string()),
    walletAddress: v.string(),
    tokenMint: v.string(),
    rawBalance: v.number(),
    balance: v.number(),
    isHolder: v.boolean(),
    source: v.string(),
    verifiedAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_user", ["userId"])
    .index("by_wallet_mint", ["walletAddress", "tokenMint"]),

  // ── Entry Payments ($CLAWD entry fee) ──────────────────────────────────────
  entryPayments: defineTable({
    userId: v.optional(v.string()),
    walletAddress: v.string(),
    recipientWallet: v.string(),
    tokenMint: v.string(),
    amount: v.number(),
    rawAmount: v.number(),
    txSignature: v.string(),
    status: v.string(),
    verifiedAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_recipient", ["recipientWallet"])
    .index("by_signature", ["txSignature"]),

  // ── Wallet Profiles ────────────────────────────────────────────────────────
  walletProfiles: defineTable({
    userId: v.string(),
    walletAddress: v.string(),
    displayName: v.optional(v.string()),
    agentName: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    isPrimary: v.boolean(),
    lastLoginAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_user", ["userId"])
    .index("by_user_wallet", ["userId", "walletAddress"]),

  // ── Wallet Social Links ────────────────────────────────────────────────────
  walletSocialLinks: defineTable({
    userId: v.string(),
    walletAddress: v.string(),
    provider: v.string(),
    handle: v.string(),
    url: v.optional(v.string()),
    verified: v.boolean(),
    metadata: v.optional(v.any()),
    updatedAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_provider", ["walletAddress", "provider"])
    .index("by_user_provider", ["userId", "provider"]),

  // ── Wallet Activity Log ────────────────────────────────────────────────────
  walletActivityLog: defineTable({
    userId: v.optional(v.string()),
    walletAddress: v.string(),
    activityType: v.string(),
    route: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_user", ["userId"])
    .index("by_type", ["activityType"]),

  walletConnections: defineTable({
    userId: v.string(),
    walletAddress: v.string(),
    clawdBalance: v.number(),
    solBalance: v.number(),
    isVerified: v.boolean(),
    connectedAt: v.number(),
    lastChecked: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_wallet", ["walletAddress"]),

  // ── Agent Wallets ──────────────────────────────────────────────────────────
  agentWallets: defineTable({
    userId: v.string(),
    name: v.string(),
    walletAddress: v.optional(v.string()),
    privyWalletId: v.optional(v.string()),
    isSimulated: v.boolean(),
    solBalance: v.number(),
    totalPnlUsd: v.number(),
    winRate: v.number(),
    tradeCount: v.number(),
    status: v.string(),
  }).index("by_user", ["userId"]),

  agentWalletQueue: defineTable({
    agentWalletId: v.string(),
    userId: v.string(),
    action: v.string(),
    params: v.optional(v.any()),
    status: v.string(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentWalletId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // ── AI Usage ───────────────────────────────────────────────────────────────
  aiUsage: defineTable({
    userId: v.string(),
    sessionId: v.optional(v.string()),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    requestType: v.string(),
    costEstimate: v.number(),
  }).index("by_user", ["userId"]),

  usageEvents: defineTable({
    userId: v.string(),
    profileId: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    eventType: v.string(),
    productArea: v.string(),
    model: v.optional(v.string()),
    route: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    tokenMint: v.optional(v.string()),
    units: v.optional(v.number()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    costEstimate: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_createdAt", ["userId", "createdAt"])
    .index("by_user_and_productArea", ["userId", "productArea"])
    .index("by_user_and_eventType", ["userId", "eventType"]),

  usageDaily: defineTable({
    userId: v.string(),
    day: v.string(),
    totalEvents: v.number(),
    totalPromptTokens: v.number(),
    totalCompletionTokens: v.number(),
    totalTokens: v.number(),
    totalCostEstimate: v.number(),
    messagesCount: v.number(),
    chatsCount: v.number(),
    agentDeploymentsCount: v.number(),
    tokenDeploymentsCount: v.number(),
    modelCallsCount: v.number(),
    imageGenerationsCount: v.number(),
    updatedAt: v.number(),
    productBreakdown: v.optional(v.any()),
    eventBreakdown: v.optional(v.any()),
    modelBreakdown: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_day", ["userId", "day"]),

  // ── API Keys ───────────────────────────────────────────────────────────────
  apiKeys: defineTable({
    userId: v.string(),
    agentWalletId: v.optional(v.string()),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    scopes: v.array(v.string()),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["keyHash"])
    .index("by_prefix", ["keyPrefix"]),

  apiKeyAuditLog: defineTable({
    apiKeyId: v.string(),
    userId: v.string(),
    event: v.string(),
    route: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_key", ["apiKeyId"])
    .index("by_user", ["userId"]),

  // ── Chat ───────────────────────────────────────────────────────────────────
  chatSessions: defineTable({
    userId: v.string(),
    title: v.string(),
    model: v.string(),
    mode: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  chatMessages: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    role: v.string(),
    content: v.string(),
    model: v.optional(v.string()),
    promptTokens: v.number(),
    completionTokens: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  // ── Generations ────────────────────────────────────────────────────────────
  generations: defineTable({
    userId: v.string(),
    kind: v.string(),
    prompt: v.string(),
    model: v.optional(v.string()),
    mediaUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    isPublic: v.boolean(),
  }).index("by_user", ["userId"]),

  imageGenerations: defineTable({
    userId: v.string(),
    prompt: v.string(),
    model: v.string(),
    imageUrl: v.optional(v.string()),
    s3Key: v.optional(v.string()),
    status: v.string(),
  }).index("by_user", ["userId"]),

  // ── Saved Items ────────────────────────────────────────────────────────────
  savedItems: defineTable({
    userId: v.string(),
    kind: v.string(),
    source: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    r2Key: v.string(),
    contentType: v.optional(v.string()),
    sizeBytes: v.number(),
    thumbnailUrl: v.optional(v.string()),
    metadata: v.optional(v.any()),
    isPublic: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"]),

  // ── CLI Pairing ────────────────────────────────────────────────────────────
  cliPairCodes: defineTable({
    userId: v.string(),
    walletAddress: v.string(),
    codeHash: v.string(),
    label: v.optional(v.string()),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    consumedApiKeyId: v.optional(v.string()),
    consumedDevice: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["codeHash"]),

  // ── Monetized Agents ───────────────────────────────────────────────────────
  monetizedAgents: defineTable({
    ownerUserId: v.string(),
    slug: v.string(),
    target: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    recipientWallet: v.string(),
    agentWalletId: v.optional(v.string()),
    agentAddress: v.optional(v.string()),
    pricePerCallAtomic: v.number(),
    commissionBps: v.number(),
    network: v.string(),
    active: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_slug", ["slug"])
    .index("by_active", ["active"]),

  paymentEvents: defineTable({
    monetizedAgentId: v.optional(v.string()),
    payerWallet: v.optional(v.string()),
    recipientWallet: v.string(),
    amountAtomic: v.number(),
    commissionAtomic: v.number(),
    commissionBps: v.number(),
    network: v.string(),
    mint: v.string(),
    signature: v.optional(v.string()),
    status: v.string(),
    reason: v.optional(v.string()),
    route: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  })
    .index("by_agent", ["monetizedAgentId"])
    .index("by_signature", ["signature"])
    .index("by_status", ["status"]),

  // ── Telegram ───────────────────────────────────────────────────────────────
  telegramLinks: defineTable({
    userId: v.string(),
    telegramUserId: v.string(),
    telegramChatId: v.string(),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    telegramLastName: v.optional(v.string()),
    linkedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_telegram_user", ["telegramUserId"]),

  telegramLinkChallenges: defineTable({
    userId: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["tokenHash"]),

  // ── Install Tracking & Airdrops ────────────────────────────────────────────
  installExecutions: defineTable({
    installHash: v.string(),
    walletAddress: v.optional(v.string()),
    userId: v.optional(v.string()),
    source: v.string(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    os: v.optional(v.string()),
    arch: v.optional(v.string()),
    version: v.optional(v.string()),
    metadata: v.optional(v.any()),
    completedAt: v.optional(v.number()),
  })
    .index("by_hash", ["installHash"])
    .index("by_wallet", ["walletAddress"]),

  airdropClaims: defineTable({
    installHash: v.string(),
    walletAddress: v.string(),
    userId: v.optional(v.string()),
    amountAtomic: v.number(),
    amountUi: v.number(),
    mint: v.string(),
    status: v.string(),
    signature: v.optional(v.string()),
    reason: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_install_wallet", ["installHash", "walletAddress"])
    .index("by_status", ["status"]),

  // ── Chess Bets ($CLAWD escrow betting) ────────────────────────────────────
  chessBets: defineTable({
    betId: v.string(),
    gameId: v.string(),
    whitePlayerWallet: v.string(),
    blackPlayerWallet: v.string(),
    betAmountClawd: v.number(),
    escrowWalletAddress: v.string(),
    escrowWalletId: v.string(),
    status: v.string(),
    winner: v.optional(v.string()),
    transfers: v.any(),
    payoutOutcome: v.optional(v.any()),
    completedAt: v.optional(v.number()),
  })
    .index("by_bet_id", ["betId"])
    .index("by_game_id", ["gameId"])
    .index("by_white_player", ["whitePlayerWallet"])
    .index("by_black_player", ["blackPlayerWallet"])
    .index("by_status", ["status"]),

  // ── Upstash Boxes ──────────────────────────────────────────────────────────
  upstashBoxes: defineTable({
    boxId: v.string(),
    ownerWallet: v.optional(v.string()),
    name: v.optional(v.string()),
    runtime: v.string(),
    size: v.string(),
    agentId: v.optional(v.string()),
    agentHarness: v.optional(v.string()),
    agentModel: v.optional(v.string()),
    gitRepo: v.optional(v.string()),
    pinned: v.boolean(),
    status: v.string(),
    lastRunAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_box_id", ["boxId"])
    .index("by_owner", ["ownerWallet"])
    .index("by_status", ["status"]),

  // ── Metaplex Agents ────────────────────────────────────────────────────────
  metaplexAgents: defineTable({
    assetAddress: v.string(),
    network: v.string(),
    ownerWallet: v.optional(v.string()),
    payerWallet: v.optional(v.string()),
    authorityWallet: v.optional(v.string()),
    collectionAddress: v.optional(v.string()),
    agentIdentityPda: v.optional(v.string()),
    assetSignerPda: v.optional(v.string()),
    coreMetadataUri: v.optional(v.string()),
    agentRegistrationUri: v.optional(v.string()),
    schemaType: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.string()),
    active: v.optional(v.boolean()),
    lifecycleTransfer: v.optional(v.boolean()),
    lifecycleUpdate: v.optional(v.boolean()),
    lifecycleExecute: v.optional(v.boolean()),
    services: v.array(v.any()),
    registrations: v.array(v.any()),
    supportedTrust: v.array(v.any()),
    metadata: v.optional(v.any()),
    nftMetadata: v.optional(v.any()),
    rawRegistry: v.optional(v.any()),
    walletBalanceLamports: v.optional(v.string()),
    mintSignature: v.optional(v.string()),
    registerSignature: v.optional(v.string()),
    lastObservedSignature: v.optional(v.string()),
    slot: v.optional(v.number()),
    blockTime: v.optional(v.number()),
    executiveAuthority: v.optional(v.string()),
    executiveProfilePda: v.optional(v.string()),
    delegateRecordPda: v.optional(v.string()),
    delegated: v.optional(v.boolean()),
    delegationSignature: v.optional(v.string()),
    delegatedAt: v.optional(v.number()),
    tokenMint: v.optional(v.string()),
    genesisAccount: v.optional(v.string()),
    launchId: v.optional(v.string()),
    launchUrl: v.optional(v.string()),
    launchType: v.optional(v.string()),
    setAgentToken: v.optional(v.boolean()),
    firstBuyAmountSol: v.optional(v.number()),
    creatorFeeWallet: v.optional(v.string()),
    launchSignatures: v.array(v.any()),
    source: v.string(),
    status: v.string(),
    launchedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_asset", ["assetAddress"])
    .index("by_owner", ["ownerWallet"])
    .index("by_network_asset", ["network", "assetAddress"])
    .index("by_token_mint", ["tokenMint"]),

  // ── Twitter OAuth PKCE State (for wallet-linked Twitter OAuth flow) ────────
  twitterOAuthStates: defineTable({
    sessionToken: v.string(),
    state: v.string(),
    codeVerifier: v.string(),
    expiresAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_token", ["sessionToken"]),

  // ── X Gate Verifications ───────────────────────────────────────────────────
  xVerificationCodes: defineTable({
    walletAddress: v.string(),
    code: v.string(),
    xHandle: v.optional(v.string()),
    tweetId: v.optional(v.string()),
    verified: v.boolean(),
    verifiedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_code", ["code"]),

  xVerifications: defineTable({
    walletAddress: v.string(),
    challengeCode: v.string(),
    tweetId: v.optional(v.string()),
    tweetUrl: v.optional(v.string()),
    xUsername: v.optional(v.string()),
    xUserId: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
  }).index("by_wallet", ["walletAddress"]),

  // Denormalized stats for the public landing page. Currently a single
  // singleton row keyed by `key === "singleton"`, mutated atomically with
  // `xGate.markVerified` and read by `xGate.countVerified` (O(1)).
  xGateStats: defineTable({
    key: v.optional(v.string()),
    verifiedCount: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
