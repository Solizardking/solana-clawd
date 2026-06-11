import type { Idl } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "./constant";

export const OPENCLAWD_AGENT_STAKING_IDL: Idl = {
  address: PROGRAM_ID.toBase58(),
  metadata: {
    name: "openclawdAgentStaking",
    version: "0.2.0",
    spec: "0.1.0",
    description:
      "OpenClawd agentic staking and Clawd Verified hub for Solana agents. " +
      "Powered by $CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        { name: "admin", writable: true, signer: true },
        { name: "globalPool", writable: true },
        { name: "clawdMint" },
        { name: "clawdVault", writable: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
      ],
      args: [],
    },
    {
      name: "stakeAgent",
      discriminator: [57, 152, 69, 17, 172, 229, 29, 105],
      accounts: [
        { name: "owner" },
        { name: "user", writable: true, signer: true },
        { name: "globalPool", writable: true },
        { name: "userPool", writable: true },
        { name: "asset", writable: true },
        { name: "collection", writable: true },
        { name: "coreProgram" },
        { name: "systemProgram" },
      ],
      args: [],
    },
    {
      name: "unstakeAgent",
      discriminator: [233, 246, 239, 66, 94, 179, 65, 38],
      accounts: [
        { name: "owner" },
        { name: "user", writable: true, signer: true },
        { name: "globalPool", writable: true },
        { name: "userPool", writable: true },
        { name: "asset", writable: true },
        { name: "collection", writable: true },
        { name: "coreProgram" },
        { name: "systemProgram" },
      ],
      args: [],
    },
    {
      name: "claimRewards",
      discriminator: [4, 144, 132, 71, 116, 23, 151, 80],
      accounts: [
        { name: "owner", writable: true, signer: true },
        { name: "globalPool", writable: true },
        { name: "userPool", writable: true },
        { name: "systemProgram" },
      ],
      args: [],
    },
    {
      name: "stakeForVerification",
      discriminator: [139, 1, 144, 73, 117, 88, 34, 126],
      accounts: [
        { name: "agent", writable: true, signer: true },
        { name: "globalPool", writable: true },
        { name: "verificationRecord", writable: true },
        { name: "agentClawdAta", writable: true },
        { name: "clawdVault", writable: true },
        { name: "clawdMint" },
        { name: "tokenProgram" },
        { name: "systemProgram" },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "unstakeVerification",
      discriminator: [25, 73, 128, 138, 211, 75, 134, 161],
      accounts: [
        { name: "agent", writable: true, signer: true },
        { name: "globalPool", writable: true },
        { name: "verificationRecord", writable: true },
        { name: "agentClawdAta", writable: true },
        { name: "clawdVault", writable: true },
        { name: "clawdMint" },
        { name: "tokenProgram" },
        { name: "systemProgram" },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "globalPool",
      discriminator: [162, 244, 124, 37, 148, 94, 28, 50],
    },
    {
      name: "userPool",
      discriminator: [236, 73, 56, 184, 205, 24, 145, 220],
    },
    {
      name: "clawdVerificationRecord",
      discriminator: [225, 139, 234, 191, 74, 49, 64, 241],
    },
  ],
  events: [
    {
      name: "AgentStaked",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      name: "AgentUnstaked",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 1],
    },
    {
      name: "RewardsClaimed",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 2],
    },
    {
      name: "AgentVerified",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 3],
    },
    {
      name: "AgentUnverified",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 4],
    },
  ],
  errors: [
    { code: 6000, name: "InvalidAdmin", msg: "Caller is not the configured program admin" },
    { code: 6001, name: "InvalidMetadata", msg: "Agent asset metadata is invalid" },
    { code: 6002, name: "InvalidCollection", msg: "Collection does not match the asset's update authority" },
    { code: 6003, name: "MetadataCreatorParseError", msg: "Could not parse creators in metadata" },
    { code: 6004, name: "LackVaultBalance", msg: "Reward vault has insufficient balance" },
    { code: 6005, name: "InvalidOwner", msg: "Caller is not the agent asset owner" },
    { code: 6006, name: "InvalidAgentAsset", msg: "Asset address does not match a staked record" },
    { code: 6007, name: "DisabledReward", msg: "Reward distribution is currently disabled" },
    { code: 6008, name: "CounterOverflow", msg: "Stake counter overflow" },
    { code: 6009, name: "CounterUnderflow", msg: "Stake counter underflow" },
    { code: 6010, name: "RewardOverflow", msg: "Arithmetic overflow computing rewards" },
    { code: 6011, name: "NoRewardsToClaim", msg: "No rewards have accrued yet" },
    { code: 6012, name: "ClockUnavailable", msg: "Clock is unavailable" },
    { code: 6013, name: "InsufficientStake", msg: "Stake amount is below the minimum required for Clawd Verified status" },
    { code: 6014, name: "InvalidMint", msg: "Token mint does not match the program's registered $CLAWD mint" },
    { code: 6015, name: "AlreadyVerified", msg: "Agent is already Clawd Verified — call unstake_verification first to re-stake" },
  ],
  types: [
    {
      name: "GlobalPool",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "pubkey" },
          { name: "clawdMint", type: "pubkey" },
          { name: "totalAgentsStaked", type: "u64" },
          { name: "totalRewardsDistributed", type: "u64" },
          { name: "totalVerifiedAgents", type: "u64" },
          { name: "totalClawdStaked", type: "u64" },
          { name: "reserved", type: "u64" },
        ],
      },
    },
    {
      name: "UserPool",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "pubkey" },
          { name: "asset", type: "pubkey" },
          { name: "stakeTime", type: "i64" },
          { name: "lastClaimTime", type: "i64" },
          { name: "totalClaimed", type: "u64" },
        ],
      },
    },
    {
      name: "ClawdVerificationRecord",
      type: {
        kind: "struct",
        fields: [
          { name: "agent", type: "pubkey" },
          { name: "verifiedAt", type: "i64" },
          { name: "stakeAmount", type: "u64" },
          { name: "isActive", type: "bool" },
          { name: "reserved", type: { array: ["u8", 31] } },
        ],
      },
    },
  ],
};
