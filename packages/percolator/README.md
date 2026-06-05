# 🧪 Percolator CLI

**Perpetuals trading CLI for Solana** — Trade, manage, and monitor perpetuals markets.

> Part of the [OpenClawd](https://github.com/x402agent/openclawd) monorepo — the Hermes of Web3.

---

## Changelog

### v1.1.0 (April 23, 2025)

**NEW: Full Percolator CLI Package**

30 commands with viral emoji branding for perpetuals trading:

- 🏛️ **Market Management** — `init-market`, `list-markets`, `close-slab`, `close-all-slabs`
- 💰 **Trading** — `init-user`, `init-lp`, `deposit`, `withdraw`, `trade-cpi`, `best-price`
- ⚔️ **Liquidation** — `liquidate-at-oracle`, `close-account`
- 🔮 **Oracle** — `push-oracle-price`, `set-oracle-authority`
- 🛡️ **Insurance** — `topup-insurance`, `withdraw-insurance`, `resolve-market`
- 👑 **Admin** — `update-admin`, `update-config`
- 🔍 **Inspection** — `slab:get`, `slab:header`, `slab:config`, `slab:nonce`, `slab:engine`, `slab:params`, `slab:account`, `slab:accounts`, `slab:bitmap`
- 📊 **Utilities** — `audit-cu`

Features:
- Global `--simulate` and `--json` flags
- Support for testnet, devnet, mainnet-beta
- Keypair-based wallet authentication
- Custom RPC URL configuration
- x402-ready for future payment integration

---

## Features

- 📊 **Market Management** - Initialize, configure, and close perpetuals markets
- 💰 **Trading** - Deposit, withdraw, and trade with leverage
- 🔒 **Account Management** - Create and manage trading accounts
- ⚔️ **Liquidation** - Liquidate undercollateralized positions
- 🔮 **Oracle Management** - Push prices, set authorities
- 📋 **Inspection** - Query market state, accounts, headers, engine

## Installation

```bash
# Clone the repo
git clone https://github.com/x402agent/openclawd.git
cd openclawd

# Build the package
cd packages/percolator
npm install
npm run build

# Link globally
npm link
```

## Quick Start

```bash
# List all markets
percolator list-markets

# Get market state
percolator slab:get --slab <PUBKEY>

# Create a trading account
percolator init-user --slab <PUBKEY>

# Deposit collateral
percolator deposit --slab <PUBKEY> --idx <ACCOUNT_IDX> --amount 100000000
```

## Commands

### Market Management

| Command | Description |
|---------|-------------|
| `init-market` | 🏛️ Initialize a new perpetuals market |
| `init-lp` | 💰 Initialize an LP (Liquidity Provider) account |
| `list-markets` | 📋 List all markets on the program |
| `update-config` | ⚙️ Update market configuration |
| `close-slab` | 🗑️ Close a market |
| `close-all-slabs` | 🗑️ Close all markets |

### Trading

| Command | Description |
|---------|-------------|
| `init-user` | 🏗️ Initialize a trading account |
| `deposit` | 💎 Deposit collateral |
| `withdraw` | 💸 Withdraw collateral |
| `trade-cpi` | 📈 Execute a perpetuals trade |
| `liquidate-at-oracle` | ⚔️ Liquidate an account at oracle price |
| `close-account` | 🔒 Close your account |
| `best-price` | 💰 Find best LP price for a trade |

### Oracle

| Command | Description |
|---------|-------------|
| `push-oracle-price` | 🔮 Push oracle price (authority only) |
| `set-oracle-authority` | 🔮 Set oracle authority |

### Insurance

| Command | Description |
|---------|-------------|
| `topup-insurance` | 🛡️ Top up insurance fund |
| `withdraw-insurance` | 💰 Withdraw from insurance fund |
| `resolve-market` | ✅ Resolve a market |

### Inspection

| Command | Description |
|---------|-------------|
| `slab:get` | 🔍 Get full slab state |
| `slab:header` | 📋 Get header info |
| `slab:config` | ⚙️ Get config info |
| `slab:nonce` | 🔢 Get nonce |
| `slab:engine` | ⚡ Get engine state |
| `slab:params` | 📊 Get risk parameters |
| `slab:account` | 👤 Get account by index |
| `slab:accounts` | 📋 List all accounts |
| `slab:bitmap` | 🗺️ Get used account bitmap |
| `audit-cu` | 📊 Compute unit audit |

### Admin

| Command | Description |
|---------|-------------|
| `update-admin` | 👑 Update market admin |

## Global Options

```
-c, --cluster <cluster>      Solana cluster (mainnet-beta, testnet, devnet)
--commitment <level>         Transaction commitment (confirmed, finalized, processed)
--simulate                   Simulate transactions without sending
--json                       Output JSON format
-k, --keypair <path>          Path to keypair
-v, --verbose                Verbose output
--program-id <pubkey>         Percolator program ID
--rpc-url <url>              Custom RPC URL
```

## Environment Variables

```bash
# Optional - can also use --keypair, --program-id, --rpc-url flags
export KEYPAIR=~/.config/solana/id.json
export CLUSTER=mainnet-beta
export PROGRAM_ID=PERC8m2tkHwVBEZSCz3E5JhcUVE5sWsEG8q39h7mSS5M
export RPC_URL=https://api.mainnet-beta.solana.com
```

## Examples

### Initialize and trade

```bash
# Initialize market
percolator init-market \
  --slab <NEW_PUBKEY> \
  --mint So11111111111111111111111111111111111111112 \
  --vault <VAULT_PUBKEY> \
  --index-feed-id 0x1234... \
  --max-staleness-secs 60 \
  --conf-filter-bps 100

# Initialize user account
percolator init-user --slab <SLAB_PUBKEY> --idx 0

# Deposit 100 USDC
percolator deposit \
  --slab <SLAB_PUBKEY> \
  --idx 0 \
  --amount 100000000

# Execute a trade
percolator trade-cpi \
  --slab <SLAB_PUBKEY> \
  --lp-idx 1 \
  --user-idx 0 \
  --size 1000000 \
  --matcher-program <MATCHER_PUBKEY> \
  --matcher-ctx <CTX_PUBKEY>
```

### Inspect market state

```bash
# Get full state
percolator slab:get --slab <PUBKEY> --json

# List all accounts
percolator slab:accounts --slab <PUBKEY>

# Get engine state
percolator slab:engine --slab <PUBKEY>
```

## Related Documentation

| Document | Description |
|----------|-------------|
| [OpenClawd README](../README.md) | Main monorepo documentation |
| [AutoResearch Wiki](../llm-wiki-tang/README.md) | Karpathy-style research engine |
| [Solana Integration](../API/README.md) | Blockchain API reference |
| [STACK.md](../STACK.md) | Technical architecture |

## Links

| Service | URL |
|---------|-----|
| 🌐 Website | [solanaclawd.com](https://solanaclawd.com) |
| 📦 GitHub | [github.com/x402agent/openclawd](https://github.com/x402agent/openclawd) |
| 🐦 Twitter | [x.com/clawddevs](https://x.com/clawddevs) |
| 💬 Telegram | [t.me/clawdtoken](https://t.me/clawdtoken) |

---

*Built with 🦞 by the OpenClawd crew — The Hermes of Web3*

## License

MIT — See [`../LICENSE.md`](../LICENSE.md)
