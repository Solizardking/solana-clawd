# Solana Clawd MCP Server

Model Context Protocol server for Pump.fun and Solana agent workflows. It exposes the Pump SDK through 55 MCP tools, 4 resource surfaces, and 5 guided prompts so Claude Desktop, Cursor, VS Code, Clawdex, and other MCP clients can quote, build, inspect, and prepare Solana transactions.

This package is intentionally transaction-builder first: tools return quotes, account data, signatures, or serialized instructions. A human wallet, trusted agent policy, or downstream transaction service must review, sign, and submit any onchain action.

## What It Ships

| Surface | Count | Purpose |
| --- | ---: | --- |
| Tools | 55 | Wallet utilities, Pump quotes, transaction builders, fee sharing, analytics, AMM, metadata, incentives |
| Resources | 4 | Program IDs, SDK configuration, generated keypair public views, address inspection |
| Prompts | 5 | Token launch, buy flow, fee sharing setup, portfolio check, graduation check |
| Transports | 2 | MCP stdio for desktop clients and streamable HTTP for local/proxy integrations |

## Architecture

```text
MCP client
  Claude Desktop, Cursor, VS Code, Clawdex, custom agent
        |
        | JSON-RPC over stdio or streamable HTTP
        v
Solana Clawd MCP Server
  src/index.ts
  src/server.ts
        |
        +-- handlers/tools.ts      -> 55 tool definitions and dispatch
        +-- handlers/resources.ts  -> programs, config, keypairs, addresses
        +-- handlers/prompts.ts    -> guided agent workflows
        |
        v
@nirholas/pump-sdk + @solana/web3.js
        |
        v
Solana RPC endpoints
```

RPC connections are lazy. Wallet-only tools run without opening an RPC connection; Pump SDK tools initialize the connection on first use. `SOLANA_RPC_URLS` supports failover across multiple RPC endpoints.

## Tool Catalog

| Category | Count | Tools |
| --- | ---: | --- |
| Quoting | 8 | `get_buy_quote`, `get_sell_quote`, `get_price_impact`, `get_market_cap`, `get_token_price`, `get_bonding_curve_summary`, `get_graduation_progress`, `get_amm_quote` |
| Trading | 6 | `build_buy_instructions`, `build_sell_instructions`, `build_create_token`, `build_create_and_buy`, `build_amm_swap`, `build_migrate_instructions` |
| Fees | 8 | `get_fee_tier`, `get_fee_breakdown`, `get_creator_vault_balance`, `get_minimum_distributable_fee`, `build_collect_creator_fees`, `build_distribute_fees`, `get_fee_sharing_config`, `build_update_fee_shares` |
| Analytics | 7 | `get_bonding_curve_state`, `get_token_info`, `get_creator_profile`, `get_token_holders`, `get_recent_trades`, `get_sol_usd_price`, `get_graduation_status` |
| AMM | 5 | `get_amm_pool`, `get_amm_reserves`, `get_amm_price`, `build_amm_deposit`, `build_amm_withdraw` |
| Social Fees | 6 | `build_create_fee_sharing`, `build_update_shareholders`, `build_revoke_admin`, `get_shareholders`, `get_distributable_amount`, `build_claim_share` |
| Wallet | 7 | `generate_keypair`, `generate_vanity_address`, `validate_address`, `estimate_vanity_time`, `restore_keypair`, `sign_message`, `verify_signature` |
| Token Incentives | 5 | `get_unclaimed_tokens`, `get_current_day_tokens`, `get_volume_stats`, `build_claim_incentives`, `build_claim_cashback` |
| Metadata | 3 | `search_tokens`, `get_token_metadata_uri`, `get_token_socials` |

## Resources

| URI | Description |
| --- | --- |
| `solana://programs` | Pump, PumpAMM, and Pump fee program IDs |
| `solana://config` | SDK configuration, token decimals, max shareholders, BPS constants |
| `solana://keypair/{id}` | Public view of a generated in-memory keypair |
| `solana://address/{pubkey}` | Solana address validation and on-curve/PDA classification |

## Prompts

| Prompt | Workflow |
| --- | --- |
| `create_token` | Generate mint keypair, build create instructions, optionally create and buy |
| `buy_token` | Check graduation, quote route, build bonding-curve or AMM instructions |
| `setup_fee_sharing` | Inspect fee sharing, define shareholders, build create/update instructions |
| `check_portfolio` | Review creator fees, incentives, cashback, and claimable balances |
| `graduation_check` | Inspect bonding curve progress and AMM migration status |

## Install

```bash
cd /Users/8bit/Downloads/solana-clawd/mcp-server
npm install
npm run build
```

Node.js 18 or newer is required.

## Environment

Copy `.env.example` to `.env` for local development, or set variables in the MCP client config.

| Variable | Default | Description |
| --- | --- | --- |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Single RPC endpoint used when `SOLANA_RPC_URLS` is not set |
| `SOLANA_RPC_URLS` | unset | Comma-separated RPC endpoints used by Pump SDK fallback connection handling |

Example:

```bash
SOLANA_RPC_URLS="https://rpc-one.example,https://rpc-two.example" npm run start:http
```

## Run

### Stdio

```bash
npm run start
```

### Streamable HTTP

```bash
npm run start:http
node dist/index.js --http --port=3001
```

HTTP endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | `GET` | Returns server health and tool count |
| `/mcp` | `POST` | Streamable HTTP MCP request endpoint |
| `/mcp` | `OPTIONS` | CORS preflight |

## MCP Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "solana-clawd-pump": {
      "command": "node",
      "args": ["/Users/8bit/Downloads/solana-clawd/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

### Cursor or VS Code

```json
{
  "mcp": {
    "servers": {
      "solana-clawd-pump": {
        "command": "node",
        "args": ["/Users/8bit/Downloads/solana-clawd/mcp-server/dist/index.js"],
        "env": {
          "SOLANA_RPC_URLS": "https://api.mainnet-beta.solana.com"
        }
      }
    }
  }
}
```

### HTTP Proxy or Local Agent

```bash
npm run start:http
curl http://localhost:3001/health
```

Point the MCP client or proxy at `http://localhost:3001/mcp`.

## Development

```bash
npm run dev          # Run TypeScript directly with tsx
npm run lint         # Type-check without writing dist
npm run build        # Compile TypeScript into dist
npm run start        # Run built stdio server
npm run start:http   # Run built HTTP server
npm test             # Run vitest when tests are present
```

## Project Layout

```text
mcp-server/
  src/
    index.ts                  CLI entrypoint
    server.ts                 MCP server, transports, lifecycle, RPC setup
    types.ts                  Shared MCP result and server state types
    handlers/
      tools.ts                MCP list/call tool handlers
      resources.ts            MCP list/read resource handlers
      prompts.ts              MCP list/get prompt handlers
    tools/
      index.ts                Tool registry and schema conversion
      quoting.ts              Bonding curve and AMM quote tools
      trading.ts              Transaction instruction builders
      fees.ts                 Creator fees and fee sharing
      analytics.ts            Token, curve, holder, and price analysis
      amm.ts                  PumpAMM pool and liquidity tools
      social-fees.ts          Shareholder and vault operations
      token-incentives.ts     PUMP incentives and cashback builders
      metadata.ts             Metadata and token discovery guidance
      wallet.ts               Wallet tool aggregator
      wallet/                 Wallet tool implementations
    resources/
      index.ts                Resource routing
      keypair.ts              In-memory generated keypair resources
      address.ts              Address helpers
      config.ts               Configuration helpers
    prompts/
      index.ts                Prompt workflow definitions
    utils/
      validation.ts           Zod schemas
      formatting.ts           Instruction and number serialization
  .env.example                Local environment template
  package.json                Package metadata and scripts
  tsconfig.json               TypeScript compiler configuration
```

## Security Model

- Private keys are not persisted by the server.
- Generated keypair resources expose public information only.
- Secret key material is zeroized on shutdown and after wallet operations where possible.
- Tool inputs are validated with Zod schemas before execution.
- Transaction-building tools return instructions; they do not submit transactions.
- Use trusted RPC endpoints for production and agent workflows with signing authority.
- Keep `.env`, wallet files, and generated secret material out of git.

## Trust Gates

This server fits the Clawd progressive trust model:

| Trust Level | Server Behavior |
| --- | --- |
| Observer | Read-only tools, quotes, resource inspection, analytics |
| Dry-Run | Build instructions and simulate downstream without signing |
| Delegated | User reviews and signs each prepared transaction |
| Autonomous | External policy engine signs within explicit user limits |
| Sovereign | Reserved for creator-controlled, multisig-governed deployments |

## Release and GitHub Deployment

Source files, package metadata, lockfile, and docs are the GitHub deployment surface. `node_modules/` and generated `dist/` output are intentionally local build artifacts unless a release process explicitly publishes compiled files.

Recommended release flow:

```bash
npm install
npm run lint
npm run build
git status --short
git add mcp-server
git commit -m "Document and harden Solana Clawd MCP server"
git push origin HEAD
```

For npm publishing, run `npm pack --dry-run` first and confirm the package contains `dist/` and `README.md`.

## Package

- Name: `@pump-fun/mcp-server`
- Binary: `pump-mcp`
- Main entry: `dist/index.js`
- Type declarations: `dist/index.d.ts`
- License: MIT
