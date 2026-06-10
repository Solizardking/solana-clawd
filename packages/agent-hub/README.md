# @openclawdsolana/agent-hub

Spawn platform, local discovery server, and real-time dashboard for Solana AI agents.

The package now includes:

- a spawn UI for templates, characters, runtimes, budgets, Helius DAS, and custom RPC
- curated playbooks for buddies, x402, auto-research, wallet, orchestrator, lobster trader, and OODA
- repo inventory for `knowledge`, `library`, `hedge`, `goals`, `gateway`, `formal_verification`, `packages`, `programs`, `skills`, `spinners`, `staking`, and `src`
- a `/runtime` mount that preserves the existing `dist-web` assets

## Install

```bash
npm install -g @openclawdsolana/agent-hub
# or run without installing:
npx @openclawdsolana/agent-hub start
```

## CLI Commands

```bash
# Start the hub server (default port 3747)
clawd-hub start

# Start and open dashboard in browser
clawd-hub start --open

# Custom port
clawd-hub start --port 4000

# Check if hub is running
clawd-hub status

# Open dashboard in browser (hub must already be running)
clawd-hub open
clawd-hub open --port 4000
```

## Dashboard & API

Once running, the hub exposes:

| Endpoint | Description |
|---|---|
| `http://localhost:3747` | Web dashboard |
| `http://localhost:3747/api/v1` | REST API |
| `ws://localhost:3747/ws` | WebSocket broadcast |
| `http://localhost:3747/runtime` | Existing `dist-web` runtime |

### REST API

```bash
# Hub health / status
curl http://localhost:3747/api/v1/hub/status

# List registered agents
curl http://localhost:3747/api/v1/agents

# Spawn catalog with templates, characters, modules, playbooks, and jobs
curl http://localhost:3747/api/v1/spawn/catalog

# Repo module inventory
curl http://localhost:3747/api/v1/spawn/modules

# Wallet provisioning defaults
curl http://localhost:3747/api/v1/spawn/wallet-config

# Create a spawn job
curl -X POST http://localhost:3747/api/v1/spawn/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "spawn-alpha",
    "templateId": "solana-openclawd-orchestrator",
    "characterId": "solana-openclawd-orchestrator",
    "runtime": "cloudflare",
    "walletMode": "vault",
    "network": "solana-mainnet",
    "budgetUsd": 500,
    "rpcUrl": "https://rpc.x402.wtf",
    "heliusDasUrl": "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
    "mission": "Deploy an x402-aware fleet orchestrator."
  }'

# Register an agent
curl -X POST http://localhost:3747/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-trading-agent",
    "address": "<solana-asset-address>",
    "services": [{"name": "A2A", "endpoint": "http://localhost:9001"}],
    "vaultUrl": "http://localhost:9099/api"
  }'

# Get a specific agent
curl http://localhost:3747/api/v1/agents/<id>

# Heartbeat (keep agent active)
curl -X POST http://localhost:3747/api/v1/agents/<id>/heartbeat
```

### WebSocket

Connect to `ws://localhost:3747/ws` to receive real-time agent events:

```typescript
const ws = new WebSocket("ws://localhost:3747/ws");
ws.on("message", (data) => {
  const event = JSON.parse(data.toString());
  // event.type: "agent:registered" | "agent:heartbeat" | "agent:updated"
  // event.agent: { id, name, address, ... }
});
```

## Programmatic Usage

```typescript
import { startHub } from "@openclawdsolana/agent-hub";

const hub = await startHub(3747);
console.log("Hub running at", hub.url);

// Graceful shutdown
await hub.stop();
```

## Integration with OpenClawd

`agent-hub` is the local discovery layer of the [solana-clawd](https://github.com/solizardking/solanaclawd) monorepo:

- **`@openclawdsolana/agent-registry`** — mint agents on-chain (Metaplex), then `clawd-registry add <address>` to index them; the hub discovers indexed agents
- **`agentwallet-vault`** — agents advertise their vault REST URL so the hub can proxy key requests
- **`@openclawdsolana/leviathan`** — the root runtime calls `npm run hub:start` to spin up the hub as part of its startup sequence

## Deploying To `spawn.x402.wtf`

This package now includes `vercel.json` and `api/index.ts` scaffolding for deployment.

```bash
cd packages/agent-hub
vercel
vercel --prod
```

After deploy, attach `spawn.x402.wtf` to the Vercel project and configure:

- `SOLANA_RPC_URL`
- `HELIUS_API_KEY`
- any vault or x402 secrets required by your downstream runtimes

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `HUB_PORT` | Override default port | `3747` |
| `HUB_HOST` | Listen host | `0.0.0.0` |
| `SOLANA_RPC_URL` | Default RPC used by the spawn UI | `https://api.mainnet-beta.solana.com` |
| `HELIUS_API_KEY` | Used to prefill Helius DAS / RPC URLs | unset |

## License

MIT
