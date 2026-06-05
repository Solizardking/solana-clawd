# @openclawdsolana/agent-registry

Mint, discover, and index AI agents on-chain via Metaplex Core with local SQLite caching. Implements EIP-8004-style agent metadata on Solana — agents are NFT assets with structured JSON metadata describing their services, models, and trust levels.

## Install

```bash
npm install -g @openclawdsolana/agent-registry
# or via npx:
npx @openclawdsolana/agent-registry list
```

## CLI Commands

### Discover Agents

```bash
# List all locally indexed agents
clawd-registry list

# Filter by network
clawd-registry list --network solana-mainnet

# Search by name or capability
clawd-registry list --query "trading"

# Filter by service type
clawd-registry list --service A2A
clawd-registry list --service MCP

# Limit results
clawd-registry list --limit 50
```

### Index an Agent

```bash
# Fetch an on-chain agent by its Metaplex Core asset address and add to local index
clawd-registry add <asset-address>

# With custom RPC
clawd-registry add <asset-address> --rpc https://api.mainnet-beta.solana.com
```

### Inspect an Agent

```bash
# Show full on-chain details for an agent
clawd-registry info <asset-address>

# With custom RPC
clawd-registry info <asset-address> --rpc https://api.mainnet-beta.solana.com
```

### Mint an Agent On-Chain

```bash
# Requires a funded Solana wallet (set SOLANA_PRIVATE_KEY or ~/.config/solana/id.json)

clawd-registry mint \
  --name "my-trading-agent" \
  --uri "https://arweave.net/<metadata-hash>" \
  --description "Autonomous DeFi trading agent on Solana" \
  --service "A2A:http://localhost:9001" \
  --service "MCP:http://localhost:9002" \
  --model "claude-sonnet-4-6" \
  --network solana-mainnet \
  --rpc https://api.mainnet-beta.solana.com

# Outputs:
#   Asset address: <metaplex-asset-address>
#   Signature:     <tx-signature>
```

### Index Statistics

```bash
clawd-registry stats
# Shows: total agents, active agents, breakdown by network, last indexed timestamp
```

## Environment Variables

| Variable | Description |
|---|---|
| `SOLANA_PRIVATE_KEY` | Base58 private key for minting |
| `X402_SVM_PRIVATE_KEY` | Alternate private key env (also accepted) |

Or place a keypair JSON array at `~/.config/solana/id.json` (standard `solana-keygen` output).

## Agent Metadata Schema

When minting, the `--uri` should point to a publicly hosted JSON following this structure:

```json
{
  "name": "my-agent",
  "description": "What this agent does",
  "services": [
    { "name": "A2A", "endpoint": "https://agent.example.com/a2a" },
    { "name": "MCP", "endpoint": "https://agent.example.com/mcp" }
  ],
  "models": ["claude-sonnet-4-6", "gpt-4o"],
  "supportedTrust": ["signed", "anonymous"]
}
```

## Programmatic Usage

```typescript
import { fetchAgent, mintAgent } from "@openclawdsolana/agent-registry/registry";
import { AgentIndex } from "@openclawdsolana/agent-registry/indexer";
import { buildMetadata } from "@openclawdsolana/agent-registry/metadata";

// Fetch an agent from chain
const agent = await fetchAgent("<asset-address>", "https://api.mainnet-beta.solana.com");

// Search the local index
const idx = new AgentIndex();
const agents = idx.search({ query: "trading", service: "A2A", limit: 10 });
idx.close();

// Build metadata and mint
const metadata = buildMetadata({
  name: "my-agent",
  description: "Autonomous trading agent",
  services: [{ name: "A2A", endpoint: "http://localhost:9001" }],
  models: ["claude-sonnet-4-6"],
});

const result = await mintAgent({
  name: "my-agent",
  uri: "https://arweave.net/...",
  metadata,
  network: "solana-mainnet",
  secretKey: mySecretKey,
});
console.log("Asset:", result.assetAddress);
```

## Integration with OpenClawd

`agent-registry` is part of the [solana-clawd](https://github.com/solizardking/solanaclawd) monorepo:

- **`@openclawdsolana/agent-hub`** — the hub queries the local index to populate its discovery dashboard
- **`agentwallet-vault`** — minted agents use vault URLs as service endpoints
- **`@openclawdsolana/leviathan`** — root runtime mints its own agent NFT on first spawn

## Local Index

Agents are cached in a SQLite database at `~/.clawd/agent-index.db`. Re-run `clawd-registry add <address>` to refresh on-chain data. The index is local-only and does not require any external API key.

## License

MIT
