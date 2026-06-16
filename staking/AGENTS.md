# OpenClawd Agent Staking — Developer Guide

## Security: No Private Keys

This repository has been scanned and **verified to contain no private keys**. The following patterns are explicitly blocked by `.gitignore`:

- `*.json` (catches Solana keypair JSON files, wallet files)
- `*.pem`, `*.p12`, `*.pfx` (certificates)
- `*.key` (private keys)
- `id_*`, `keypair*`, `wallet*` (Solana keypair naming patterns)
- `secret*`, `private*` (generic secret files)
- `.env`, `.env.*` (environment files)

The `Anchor.toml` references `~/.config/solana/id.json` which is the standard Solana CLI keypair path — this is a **path string**, not an embedded key. The keypair file itself is never committed.

## Architecture

```
staking/
├── programs/mpl-corenft-staking/   # Anchor program (Rust)
│   └── src/
│       ├── lib.rs                   # Program entry + 4 instructions
│       ├── constant.rs              # PDAs, reward rate
│       ├── error.rs                 # Error codes
│       ├── state.rs                 # GlobalPool + UserPool accounts
│       └── instructions/            # initialize, stake, unstake, claim
├── cli/                             # Commander-based CLI (TS)
├── lib/                             # SDK (constant, scripts, util, IDL)
├── tests/                           # Anchor test suite
├── docs/                            # Documentation site (open index.html)
├── Anchor.toml                      # Anchor config
└── README.md                        # Full protocol documentation
```

## Program ID

- **Devnet:** `9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP`
- **Mainnet:** Not yet deployed

## Key Concepts

- **Non-custodial staking:** Agent NFT stays in owner's wallet. `FreezeDelegate` plugin makes it non-transferable while staked.
- **Reward rate:** 1,000 CLAWD base-units/sec per staked agent (~86.4 CLAWD/day, ~2,592 CLAWD/month)
- **Off-chain settlement:** On-chain claims emit events; backend treasury wallet transfers CLAWD tokens
- **Owner always wins:** Owner can unstake anytime. Admin has emergency-unstake but Core asset owner is always validated on-chain.

## CLI Usage

```bash
npm run script:devnet -- init                                    # Initialize global pool
npm run script:devnet -- stake --asset <ASSET>                   # Stake agent (collection auto-derived)
npm run script:devnet -- unstake --asset <ASSET>                 # Unstake agent (collection auto-derived)
npm run script:devnet -- claim --asset <ASSET>                    # Claim rewards
npm run script:devnet -- status --asset <ASSET>                   # Inspect on-chain stake state
```

## Tech Stack

- **Anchor v0.30.1** — Solana framework
- **Metaplex MPL Core v1.0.2** — Core asset model
- **Metaplex Agent Registry** — Agent identity (mint, register, delegate)
- **@metaplex-foundation/umi** — JS SDK for Metaplex
- **Commander.js** — CLI framework
