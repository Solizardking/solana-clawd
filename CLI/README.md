# openclawd CLI

Command-line tools for the openclawd ecosystem — solanaclawd.com · github.com/x402agent/openclawd

## Scripts

### clawd-cli.sh

Main CLI for agents, skills, payments, and node operations:

```bash
# Skills (ClawdHub)
clawd-cli.sh skills
clawd-cli.sh skills:list
clawd-cli.sh skills:install pumpfun-trading
clawd-cli.sh skills:search solana
clawd-cli.sh skills:featured

# Marketplace
clawd-cli.sh marketplace
clawd-cli.sh marketplace:trending
clawd-cli.sh marketplace:new

# Agents
clawd-cli.sh agents
clawd-cli.sh status
clawd-cli.sh connect

# Wallet & Trading
clawd-cli.sh wallet
clawd-cli.sh prices
clawd-cli.sh trading
clawd-cli.sh swap <from> <to> <amount>

# x402 Payments
clawd-cli.sh payment:supported
clawd-cli.sh payment:verify <id>
clawd-cli.sh payment:settle <tx>

# Node Operations
clawd-cli.sh node
clawd-cli.sh node:register <name>
clawd-cli.sh node:status
clawd-cli.sh node:peers

# Agent registration (Metaplex)
clawd-cli.sh register
```

### clawd-connect.sh

Terminal connection and skills commands:

```bash
# Skills
clawd-connect.sh skills
clawd-connect.sh skills:list
clawd-connect.sh skills:featured
clawd-connect.sh skills:search <query>
clawd-connect.sh skills:install <slug>

# Marketplace
clawd-connect.sh marketplace
clawd-connect.sh marketplace:trending
clawd-connect.sh marketplace:new

# Agents
clawd-connect.sh connect
clawd-connect.sh status
clawd-connect.sh agents

# Wallet
clawd-connect.sh wallet
clawd-connect.sh prices

# x402 Payments
clawd-connect.sh payment:supported
clawd-connect.sh payment:verify <id>
clawd-connect.sh payment:settle <tx>
```

### solana-clawd CLI (primary)

The main agent CLI is `solana-clawd`, published to npm:

```bash
npm i -g solana-clawd

solana-clawd pair <CODE>     # pair this device
solana-clawd mint            # mint your agent NFT (Metaplex Core)
solana-clawd status          # show pairing + wallet
solana-clawd agent           # start OODA loop trading agent
```

### @openclawd/wallet (Privy embedded wallet)

```bash
npm install @openclawd/wallet

clawd-wallet tokens              # list Jupiter tokens
clawd-wallet quote SOL USDC 0.1  # get swap quote
clawd-wallet balance <addr>      # check SOL balance
```

Or in React:

```tsx
import { PrivyProvider, useClawdWallet } from "@openclawd/wallet/react";

<PrivyProvider appId={process.env.PRIVY_APP_ID!} embeddedWallets>
  <SwapButton />
</PrivyProvider>

// Inside component:
const { wallet, connectWallet } = useClawdWallet();
```

## Curl Commands

```bash
# Browse skills
curl https://solanaclawd.com/marketplace/skills | jq '.'

# List all skills
curl https://solanaclawd.com/api/skills | jq '.'

# Search skills
curl "https://solanaclawd.com/api/skills/search?q=solana" | jq '.'

# Get featured skills
curl https://solanaclawd.com/api/skills/featured | jq '.'

# Install skill (download SKILL.md)
curl -s "https://solanaclawd.com/api/skills/pumpfun-trading/download" -o SKILL.md

# Marketplace trending
curl https://solanaclawd.com/api/marketplace/trending | jq '.'

# Agent status
curl https://solanaclawd.com/api/status | jq '.'

# List agents
curl https://solanaclawd.com/api/agents | jq '.'

# Token prices
curl https://solanaclawd.com/api/prices | jq '.'

# x402 payment verification
curl -X POST https://solanaclawd.com/x402/facilitator/verify \
  -H "Content-Type: application/json" \
  -d '{"payment":"<id>"}' | jq '.'

# x402 supported tokens
curl https://solanaclawd.com/x402/facilitator/supported | jq '.'
```

## Installation

```bash
# Make scripts executable
chmod +x clawd-cli.sh
chmod +x clawd-connect.sh

# Add to PATH (optional)
export PATH="$PATH:$(pwd)/CLI"

# Use directly
./clawd-cli.sh skills:list
./clawd-connect.sh marketplace:trending
```

## Also Available

```bash
# npx clawdhub CLI
npx clawdhub install <skill>
npx clawdhub list
npx clawdhub search <query>
npx clawdhub publish ./skill

# Install npm packages
npm i -g @clawd/cli
npm i -g solanaos-cli
```

## License

MIT — See [`../LICENSE.md`](../LICENSE.md)