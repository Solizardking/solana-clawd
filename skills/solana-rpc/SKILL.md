---
name: solana-rpc
description: >
  Solana RPC data toolkit — 8-command CLI for live on-chain data: SOL balance +
  SPL token portfolio with USD values, transaction detail with balance changes,
  SPL token metadata + top holders, recent activity history, NFT portfolio
  (SPL + cNFT via Helius DAS), whale detector, network stats (TPS/epoch/price),
  and quick price lookup. Pure Python stdlib, no extra packages. Optional
  HELIUS_API_KEY for compressed NFT detection.
homepage: https://github.com/solanaclawd/solana-clawd
metadata:
  clawdbot:
    emoji: 🔗
    requires:
      bins:
        - python3
      env: []
    optional_env:
      - SOLANA_RPC_URL
      - HELIUS_API_KEY
    install:
      - id: copy-script
        kind: shell
        cmd: |
          mkdir -p ~/.clawd/skills/solana-rpc
          cp ai-training/scripts/solana_client.py ~/.clawd/skills/solana-rpc/solana_client.py
          chmod +x ~/.clawd/skills/solana-rpc/solana_client.py
        label: Install solana-rpc client
attestation:
  verified: true
  verified_at: '2026-06-15'
  registries:
    - https://x402.wtf/skills/solana-rpc
---

# Solana RPC — Live On-Chain Data Toolkit

8-command CLI for live Solana data. Uses only Python stdlib + free public endpoints.
No pip install required. Optional `HELIUS_API_KEY` unlocks compressed NFT detection.

## Commands

| Command | Args | Description |
|---------|------|-------------|
| `wallet` | `<address>` | SOL balance + SPL token portfolio with USD values |
| `tx` | `<signature>` | Transaction detail: status, fee, balance changes, programs |
| `token` | `<mint\|symbol>` | SPL token: decimals, supply, price, top 5 holders |
| `activity` | `<address>` | Recent tx history (default 10, max 25) |
| `nft` | `<address>` | SPL NFTs + cNFTs (requires `HELIUS_API_KEY`) |
| `whales` | `[--min-sol N]` | Large SOL transfers in latest block (default 500 SOL) |
| `stats` | — | Slot, epoch, TPS, circulating supply, SOL price, version |
| `price` | `<mint\|symbol>` | Price, 24h/7d %, market cap, volume (via CoinGecko) |

## Setup

```bash
# Copy the script (no install needed beyond Python 3)
cp ai-training/scripts/solana_client.py ~/.clawd/skills/solana-rpc/

# Optional: set a faster RPC (public mainnet used by default)
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"

# Optional: Helius DAS for compressed NFT (cNFT) support
export HELIUS_API_KEY="your-helius-api-key"
```

## Usage

```bash
SCRIPT="python3 ~/.clawd/skills/solana-rpc/solana_client.py"

# Network health
$SCRIPT stats

# Wallet overview (skips CoinGecko for speed)
$SCRIPT wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM --no-prices

# Full wallet with USD values
$SCRIPT wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM

# Transaction details
$SCRIPT tx 5wHu1qwD7q5ifaN5nwLDTFPSfDd8Z5WtjnJPSFGbdDWX3XqxLPWRSLT1k4e4kZn6NvA

# SPL token — use known symbol or mint address
$SCRIPT token BONK
$SCRIPT token DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263

# Recent activity
$SCRIPT activity 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM --limit 20

# NFT portfolio (SPL + cNFT if HELIUS_API_KEY set)
$SCRIPT nft 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM

# Whale detector — default 500 SOL minimum
$SCRIPT whales --min-sol 1000

# Price lookup
$SCRIPT price SOL
$SCRIPT price JUP
```

## Known Symbols

The `token` and `price` commands accept 25+ known symbols directly:
`SOL`, `USDC`, `USDT`, `BONK`, `JUP`, `WIF`, `MEW`, `JTO`, `PYTH`,
`WEN`, `DRIFT`, `TNSR`, `BOME`, `PENGU`, `WETH`, `mSOL`, `stSOL`,
`bSOL`, `JLP`, `HNT`, `RNDR`, `W`, `CLAWD`, and more.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_RPC_URL` | No | Override public mainnet RPC. Helius/QuickNode recommended for production. |
| `HELIUS_API_KEY` | No | Enables Helius DAS for cNFT detection in the `nft` command. |

## Rate Limits

- Public Solana RPC: ~100 req/s (sufficient for all commands)
- CoinGecko free tier: 30 req/min — `wallet` adds a 100ms delay per token to stay within limits
- Use `--no-prices` flag on `wallet` to skip CoinGecko entirely

## Integration with Clawd Agents

This script is also registered in `ai-training/scripts/solana_client.py` and
is used as training data for the Clawd SFT pipeline. Agents can call it as a
subprocess tool:

```typescript
import { execSync } from 'child_process'
const solana = (cmd: string) =>
  execSync(`python3 ~/.clawd/skills/solana-rpc/solana_client.py ${cmd}`, { encoding: 'utf8' })

const stats = solana('stats')
const wallet = solana(`wallet ${address} --no-prices`)
```

## Data Sources

| Source | Used by | Notes |
|--------|---------|-------|
| Solana public RPC | All commands | Default: `api.mainnet-beta.solana.com` |
| CoinGecko free API | `wallet`, `token`, `price`, `stats` | No key needed, rate-limited |
| Helius DAS | `nft` (optional) | Requires `HELIUS_API_KEY` |
