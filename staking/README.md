# 🦞 OpenClawd Agent Staking Protocol

[![x402](https://img.shields.io/badge/x402.wtf-payments-1E5AA8?style=for-the-badge)](https://x402.wtf)
[![$CLAWD](https://img.shields.io/badge/$CLAWD-8cHzQH...pump-C85C2B?style=for-the-badge&logo=solana&logoColor=white)](https://pump.fun/coin/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)

*Powered by [x402.wtf](https://x402.wtf) · $CLAWD: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`*

---

OpenClawd Agent Staking is an Anchor program and frontend-ready transaction
surface for staking Metaplex Core agent assets on Solana. It lets an agent owner
lock a Core asset in place by adding a frozen `FreezeDelegate` plugin, then later
unstake by unfreezing and removing that plugin.

**No escrow. No custody transfer. The asset stays in the owner's wallet.**

## Position in the OpenClawd stack

This package is the **live devnet lock layer** of the broader OpenClawd Agent
Staking platform. It proves the critical primitive: a Metaplex Core agent can be
made non-transferable through `FreezeDelegate` without transferring custody.

The larger reward/position protocol lives in:

```text
programs/clawd-stake/
server/_core/clawdStakeRoutes.ts
server/_core/clawdStakeWebhook.ts
convex/clawdStake.ts
```

That layer adds weighted `StakePosition` accounts, lock durations, CLAWD
emissions, SOL fee-share, and phase-2 gacha fee routing. The live `/staking`
frontend surfaces the lock layer today and documents the reward protocol as the
next layer of the same product, not a separate experiment.

## Live Devnet Deployment

Current devnet deployment:

```text
Program ID:      D5MLxrKAnppBVLuukKQzQGTMSfEwBqWCDPGAhGhthdLP
Global pool PDA: EyDhP1HU3yqCmqCpKkQHFuX3wMD6sJF1kK8eeRwmTr1K
MPL Core:        CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
Cluster:         devnet
```

The main OpenClawd frontend route is:

```text
/staking
```

The legacy `/agents/stake` and `/stake` URLs redirect to `/staking`. The
frontend builds wallet-signed transactions directly for `initialize`,
`stakeAgent`, and `unstakeAgent`; it also reads the global pool PDA and inspects
the Core asset `FreezeDelegate` state.

## What It Does

- Initializes a global staking pool PDA with an admin authority.
- Stakes a Metaplex Core asset by adding `FreezeDelegate { frozen: true }`.
- Unstakes by updating the `FreezeDelegate` to `frozen: false`, then removing it.
- Tracks `total_agents_staked` in the global pool.
- Allows normal unstake by owner and emergency unstake by the configured admin.
- Provides a TypeScript CLI for `init`, `stake`/`lock`, and `unstake`/`unlock`.

## Project Layout

```text
staking/
├── programs/mpl-corenft-staking/   Anchor Rust program
│   └── src/
│       ├── lib.rs                  declare_id! + instruction dispatch
│       ├── constant.rs             PDA seeds
│       ├── state.rs                GlobalPool account struct
│       ├── error.rs                StakingError enum
│       └── instructions/
│           ├── mod.rs
│           ├── initialize.rs       Create global pool
│           ├── stake_agent.rs      Add FreezeDelegate plugin
│           └── unstake_agent.rs    Remove FreezeDelegate plugin
├── cli/
│   ├── command.ts                  Commander CLI entrypoint
│   └── scripts.ts                  CLI orchestration (init, stake, unstake)
├── lib/
│   ├── constant.ts                 Program ID, seeds, collection, RPC config
│   ├── idl.ts                      Hardcoded IDL (no Anchor workspace needed)
│   ├── scripts.ts                  Transaction builder helpers
│   └── util.ts                     Metaplex PDA derivation helpers
├── tests/
│   └── mpl-corenft-pnft-staking.ts Anchor integration test
├── Anchor.toml                     Solana cluster, wallet, program ID config
├── package.json                    @openclawdsolana/agent-staking
├── tsconfig.json
└── README.md                       This file
```

## Program Accounts

### `initialize`

Creates the global pool PDA:

```text
seed: ["global-authority"]
```

Accounts:
- `admin` signer and payer
- `global_pool` PDA
- `system_program`

### `stakeAgent`

Adds a frozen Core `FreezeDelegate` plugin.

Accounts:
- `owner` asset owner
- `user` signer and payer, must equal `owner`
- `global_pool`
- `asset` Metaplex Core asset account
- `collection` Metaplex Core collection account
- `core_program`
- `system_program`

Validation:
- `user == owner`
- decoded Core `asset.owner == owner`
- decoded Core `asset.update_authority == Collection(collection)`

### `unstakeAgent`

Unfreezes and removes the Core `FreezeDelegate` plugin.

Accounts:
- `owner` asset owner
- `user` signer and payer
- `global_pool`
- `asset` Metaplex Core asset account
- `collection` Metaplex Core collection account
- `core_program`
- `system_program`

Validation:
- `asset.owner == owner`
- decoded Core `asset.update_authority == Collection(collection)`
- `user == owner`, or `user == global_pool.admin` for emergency recovery

## Environment

Devnet defaults:

```bash
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export OPENCLAWD_AGENT_STAKING_PROGRAM_ID="D5MLxrKAnppBVLuukKQzQGTMSfEwBqWCDPGAhGhthdLP"
export OPENCLAWD_AGENT_COLLECTION="<metaplex-core-collection-address>"
```

Mainnet should use a dedicated deployer or Squads-controlled upgrade authority:

```bash
export SOLANA_RPC_URL="https://your-mainnet-rpc.example"
export ANCHOR_WALLET="$HOME/.config/solana/openclawd-mainnet-deployer.json"
export OPENCLAWD_AGENT_STAKING_PROGRAM_ID="<mainnet-program-id>"
export OPENCLAWD_AGENT_COLLECTION="<mainnet-core-collection-address>"
```

Do not commit populated `.env` files, deployer keypairs, wallet JSON, or
production API secrets.

## Install

```bash
cd staking
npm install
npm run build       # anchor build — compiles Rust program
```

## CLI Usage

Initialize the global pool (first deploy only):

```bash
npm run script:devnet -- init
```

Stake (lock) a Metaplex Core agent asset:

```bash
npm run script:devnet -- stake \
  --asset <agent-core-asset-address> \
  --collection "$OPENCLAWD_AGENT_COLLECTION"
```

Alias:

```bash
npm run script:devnet -- lock \
  --asset <agent-core-asset-address> \
  --collection "$OPENCLAWD_AGENT_COLLECTION"
```

Unstake (unlock):

```bash
npm run script:devnet -- unstake \
  --asset <agent-core-asset-address> \
  --collection "$OPENCLAWD_AGENT_COLLECTION"
```

Alias:

```bash
npm run script:devnet -- unlock \
  --asset <agent-core-asset-address> \
  --collection "$OPENCLAWD_AGENT_COLLECTION"
```

## Deploy

### Devnet

```bash
solana config set --url "$SOLANA_RPC_URL"
solana config set --keypair "$ANCHOR_WALLET"
solana balance
npm run build
npm run deploy:devnet
```

Initialize the global pool after a first deploy:

```bash
npm run script:devnet -- init
```

### Mainnet Gate

Mainnet deployment should only happen after:
- clean build with aligned Anchor versions
- devnet stake and unstake test with a real Core collection
- confirmed program id and upgrade authority
- funded deployer wallet
- explicit `[programs.mainnet]` block in `Anchor.toml`
- frontend env pointed at the mainnet program id and collection
- admin recovery runbook reviewed

The current `Anchor.toml` intentionally omits `[programs.mainnet]`.

## Frontend Usage

The OpenClawd app exposes `/staking`.

Required frontend env when overriding defaults:

```bash
VITE_OPENCLAWD_AGENT_STAKING_PROGRAM_ID="D5MLxrKAnppBVLuukKQzQGTMSfEwBqWCDPGAhGhthdLP"
VITE_OPENCLAWD_AGENT_COLLECTION="<metaplex-core-collection-address>"
VITE_SOLANA_RPC_URL="$SOLANA_RPC_URL"
```

User flow:
1. Connect a Solana wallet.
2. Paste a Metaplex Core agent asset address.
3. Paste or preconfigure the agent collection address.
4. Inspect the asset to confirm owner, collection, and freeze status.
5. Click `stake` to add the frozen `FreezeDelegate`.
6. Click `unstake` to unfreeze and remove the delegate.

Admin recovery flow:
1. Connect the admin wallet.
2. Paste the asset address and collection.
3. Paste the real asset owner into the owner override field.
4. Submit `unstake`.

## Integration with OpenClawd Ecosystem

This protocol sits under the OpenClawd Solana-native agent economy:

- agent minting via Metaplex Core
- agent registration via Metaplex Agent Registry
- staking state visible in `/staking`
- wallet-gated agent actions
- policy checks in the OpenClawd backend
- staking status indexing for dashboards and future rewards
- admin runbooks for emergency unlocks
- **All powered by [x402.wtf](https://x402.wtf)** — the HTTP 402 micropayment protocol on Solana USDC

## Safety Notes

- This is a lock/unlock primitive, not a yield product.
- The admin can emergency-unstake assets only through the program constraints.
- Use a dedicated deployer and program upgrade authority.
- Public RPC is not reliable enough for production.
- Keep the collection address pinned in frontend/backend config.
- Run `anchor keys sync` after changing the program keypair.

## License

MIT · Powered by [x402.wtf](https://x402.wtf) · $CLAWD: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`