import { defineRateLimits } from "convex-helpers/server/rateLimit";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // AI chat: 30 requests/minute with burst of 5
  aiChat: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 5 },

  // AI agents: 10 launches/hour
  agentLaunch: { kind: "fixed window", rate: 10, period: HOUR },

  // Auth sign-in attempts: 5/minute per wallet
  walletSignIn: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 3 },

  // X verification: 3 attempts/hour per wallet
  xVerify: { kind: "fixed window", rate: 3, period: HOUR },

  // Token launch: 5/day per user
  tokenLaunch: { kind: "fixed window", rate: 5, period: DAY },

  // Trade/swap: 60/minute per wallet (generous for active traders)
  trade: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 10 },

  // API key creation: 10/day per user
  apiKeyCreate: { kind: "fixed window", rate: 10, period: DAY },
});
