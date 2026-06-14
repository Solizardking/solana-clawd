/**
 * Anchor IDL for the copied OpenClawd Metaplex Core agent staking program.
 *
 * Program source: staking/programs/mpl-corenft-staking
 * Program ID defaults to the current devnet workspace target and can be overridden
 * with VITE_OPENCLAWD_AGENT_STAKING_PROGRAM_ID.
 */
export const STAKING_PROGRAM_ID =
  (import.meta.env.VITE_OPENCLAWD_AGENT_STAKING_PROGRAM_ID as string | undefined) ||
  (import.meta.env.VITE_OPENCLAWD_STAKING_PROGRAM_ID as string | undefined) ||
  "9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP";

export const MPL_CORE_PROGRAM_ID =
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

export const GLOBAL_AUTHORITY_SEED = "global-authority";
export const USER_POOL_SEED = "user-pool";
export const REWARD_RATE_BASE_UNITS_PER_SECOND = 1_000;
export const CLAWD_DECIMALS = 6;

export const STAKING_IDL = {
  address: STAKING_PROGRAM_ID,
  metadata: {
    name: "openclawd_agent_staking",
    version: "0.1.0",
    spec: "0.1.0",
    description:
      "OpenClawd agent staking and unstaking protocol for Metaplex Core assets on Solana.",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        { name: "admin", writable: true, signer: true },
        {
          name: "globalPool",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  103, 108, 111, 98, 97, 108, 45, 97, 117, 116, 104, 111,
                  114, 105, 116, 121,
                ],
              },
            ],
          },
        },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "stakeAgent",
      discriminator: [57, 152, 69, 17, 172, 229, 29, 105],
      accounts: [
        { name: "owner" },
        { name: "user", writable: true, signer: true },
        {
          name: "globalPool",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  103, 108, 111, 98, 97, 108, 45, 97, 117, 116, 104, 111,
                  114, 105, 116, 121,
                ],
              },
            ],
          },
        },
        {
          name: "userPool",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [117, 115, 101, 114, 45, 112, 111, 111, 108],
              },
              { kind: "account", path: "asset" },
            ],
          },
        },
        { name: "asset", writable: true },
        { name: "collection", writable: true, optional: true },
        { name: "coreProgram", address: MPL_CORE_PROGRAM_ID },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "unstakeAgent",
      discriminator: [233, 246, 239, 66, 94, 179, 65, 38],
      accounts: [
        { name: "owner" },
        { name: "user", writable: true, signer: true },
        {
          name: "globalPool",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  103, 108, 111, 98, 97, 108, 45, 97, 117, 116, 104, 111,
                  114, 105, 116, 121,
                ],
              },
            ],
          },
        },
        {
          name: "userPool",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [117, 115, 101, 114, 45, 112, 111, 111, 108],
              },
              { kind: "account", path: "asset" },
            ],
          },
        },
        { name: "asset", writable: true },
        { name: "collection", writable: true, optional: true },
        { name: "coreProgram", address: MPL_CORE_PROGRAM_ID },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "claimRewards",
      discriminator: [4, 144, 132, 71, 116, 23, 151, 80],
      accounts: [
        { name: "owner", writable: true, signer: true },
        {
          name: "globalPool",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  103, 108, 111, 98, 97, 108, 45, 97, 117, 116, 104, 111,
                  114, 105, 116, 121,
                ],
              },
            ],
          },
        },
        { name: "userPool", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
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
  ],
  types: [
    {
      name: "globalPool",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "pubkey" },
          { name: "totalAgentsStaked", type: "u64" },
          { name: "totalRewardsDistributed", type: "u64" },
          { name: "reserved", type: { array: ["u64", 4] } },
        ],
      },
    },
    {
      name: "userPool",
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
  ],
  errors: [
    { code: 6000, name: "InvalidAdmin", msg: "Caller is not the configured program admin" },
    { code: 6001, name: "InvalidMetadata", msg: "Agent asset metadata is invalid" },
    { code: 6002, name: "InvalidCollection", msg: "Collection does not match the asset's update authority" },
    { code: 6003, name: "MetadataCreatorParseError", msg: "Could not parse creators in metadata" },
    { code: 6004, name: "InvalidOwner", msg: "Caller is not the agent asset owner" },
    { code: 6005, name: "InvalidAgentAsset", msg: "Asset address does not match a staked record" },
    { code: 6006, name: "CounterOverflow", msg: "Stake counter overflow" },
    { code: 6007, name: "CounterUnderflow", msg: "Stake counter underflow" },
    { code: 6008, name: "RewardOverflow", msg: "Arithmetic overflow computing rewards" },
    { code: 6009, name: "NoRewardsToClaim", msg: "No rewards have accrued yet" },
    { code: 6010, name: "ClockUnavailable", msg: "Clock is unavailable" },
  ],
} as const;
