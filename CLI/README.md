# openclawd CLI

Command-line tools for the openclawd / Solana Clawd ecosystem — [solanaclawd.com](https://solanaclawd.com) · [github.com/solizardking/solana-clawd](https://github.com/solizardking/solana-clawd)

Artifacts in this directory share one set of public service bases:

| Base | Default URL |
|------|-------------|
| site | `https://solanaclawd.com` |
| api | `https://solanaclawd.com/api` |
| marketplace | `https://solanaclawd.com/marketplace` |
| x402 gateway | `https://solanaclawd.com/api/x402` |
| MCP | `https://solanaclawd.com/mcp` |
| A2A | `https://solanaclawd.com/a2a` |

Override with env vars: `CLAWD_SITE_BASE`, `CLAWD_API_BASE`, `CLAWD_MARKETPLACE_BASE`, `CLAWD_X402_GATEWAY`, `CLAWD_MCP_BASE`, `CLAWD_A2A_BASE`.

The x402 gateway defaults to `/api/x402` because that path returns live facilitator JSON on solanaclawd.com (the bare `/x402` path serves SPA HTML).

## Installation

From the repository root:

```bash
# Make scripts executable
chmod +x cli/clawd-cli.sh cli/clawd-connect.sh

# Optional: add cli/ to PATH
export PATH="$PATH:$(pwd)/cli"

# Use from repo root
./cli/clawd-cli.sh help
./cli/clawd-connect.sh help
```

Or from inside `cli/`:

```bash
./clawd-cli.sh skills
./clawd-connect.sh payment:supported
```

## Scripts

### `clawd-cli.sh`

Main CLI for agents, skills, payments, marketplace, attestation, and node ops.

```bash
# Skills (ClawdHub)
./cli/clawd-cli.sh skills
./cli/clawd-cli.sh skills:list
./cli/clawd-cli.sh skills:install pumpfun-trading
./cli/clawd-cli.sh skills:search solana
./cli/clawd-cli.sh skills:featured

# Marketplace
./cli/clawd-cli.sh marketplace
./cli/clawd-cli.sh marketplace:trending
./cli/clawd-cli.sh marketplace:new

# Agents
./cli/clawd-cli.sh agents
./cli/clawd-cli.sh status
./cli/clawd-cli.sh connect
./cli/clawd-cli.sh register

# Wallet & Trading
./cli/clawd-cli.sh wallet
./cli/clawd-cli.sh prices
./cli/clawd-cli.sh trading
./cli/clawd-cli.sh swap <from> <to> <amount>

# x402 Payments (live facilitator under /api/x402)
./cli/clawd-cli.sh payment:supported
./cli/clawd-cli.sh payment:verify <id>
./cli/clawd-cli.sh payment:settle <tx>

# Node Operations
./cli/clawd-cli.sh node
./cli/clawd-cli.sh node:register
./cli/clawd-cli.sh node:status
./cli/clawd-cli.sh node:peers

# Attestation (SAS)
./cli/clawd-cli.sh attest:skill --skill <id> --verifier <id>
./cli/clawd-cli.sh attest:verify --address <addr>
./cli/clawd-cli.sh attest:status
./cli/clawd-cli.sh attest:agent --agent <id> --wallet <pubkey>
./cli/clawd-cli.sh attest:vault --agent <id> --wallet <pubkey>
```

### `clawd-connect.sh`

Terminal connection and skills surface (same service bases as `clawd-cli.sh`).

```bash
# Skills
./cli/clawd-connect.sh skills
./cli/clawd-connect.sh skills:list
./cli/clawd-connect.sh skills:featured
./cli/clawd-connect.sh skills:search <query>
./cli/clawd-connect.sh skills:install <slug>

# Marketplace
./cli/clawd-connect.sh marketplace
./cli/clawd-connect.sh marketplace:trending
./cli/clawd-connect.sh marketplace:new

# Agents
./cli/clawd-connect.sh connect
./cli/clawd-connect.sh status
./cli/clawd-connect.sh agents

# Wallet
./cli/clawd-connect.sh wallet
./cli/clawd-connect.sh prices

# x402 Payments
./cli/clawd-connect.sh payment:supported
./cli/clawd-connect.sh payment:verify <id>
./cli/clawd-connect.sh payment:settle <tx>
```

### `clawd-register.ts`

Loadable TypeScript module for Solana Clawd / openclawd registration metadata and optional Metaplex mint. **Importing does not mint** and does not require a secret key.

```bash
# Print aligned metadata (safe)
npx tsx cli/clawd-register.ts metadata
npx tsx cli/clawd-register.ts diff

# Explicit mint only (needs CLAWD_MINT_SECRET_KEY_B64 + Metaplex deps + RPC)
CLAWD_MINT_SECRET_KEY_B64=... npx tsx cli/clawd-register.ts mint
```

### Registration & config JSON

| File | Role |
|------|------|
| `solana-clawd-registration.json` | Solana Clawd agent identity (name, services, supportedTrust) |
| `clawd-registration.json` | openclawd EIP-8004-style registration |
| `clawd-openclaw-config.json` | openclawd runtime config (services, models, permissions) |

These agree with the shell bases for `api`, `marketplace`, `x402`, `mcp`, and `a2a`.

## Curl examples (same bases as the scripts)

```bash
# List skills
curl https://solanaclawd.com/api/skills | jq '.'

# Search skills
curl "https://solanaclawd.com/api/skills/search?q=solana" | jq '.'

# Featured skills
curl https://solanaclawd.com/api/skills/featured | jq '.'

# Install skill (download SKILL.md)
curl -s "https://solanaclawd.com/api/skills/pumpfun-trading/download" -o SKILL.md

# Marketplace trending
curl https://solanaclawd.com/api/marketplace/trending | jq '.'

# Marketplace browse UI
curl https://solanaclawd.com/marketplace/skills | jq '.'

# Agent status / agents
curl https://solanaclawd.com/api/status | jq '.'
curl https://solanaclawd.com/api/agents | jq '.'

# Token prices
curl https://solanaclawd.com/api/prices | jq '.'

# x402 facilitator (live JSON under /api/x402)
curl https://solanaclawd.com/api/x402/facilitator/supported | jq '.'
curl -X POST https://solanaclawd.com/api/x402/facilitator/verify \
  -H "Content-Type: application/json" \
  -d '{"payment":"<id>"}' | jq '.'
```

## Package checks

```bash
# From repo root — alignment + bash -n + JSON parse (drives real cli/ files)
npx vitest run --root . cli/cli-package.test.ts
```

## Related CLIs (outside this folder)

```bash
# Primary agent CLI (npm)
npm i -g solana-clawd
solana-clawd pair <CODE>
solana-clawd status

# ClawdHub
npx clawdhub list
npx clawdhub search <query>
```

## License

MIT — See [`../LICENSE.md`](../LICENSE.md)
