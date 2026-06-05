# agentwallet-vault

Encrypted agentic wallet vault for Solana and EVM chains. Stores keypairs with AES-256-GCM encryption, exposes a REST API server, and deploys to E2B sandboxes or Cloudflare Workers for remote agent access.

## Install

```bash
npm install agentwallet-vault
```

Or run directly:

```bash
npx agentwallet-vault --help
```

## Quick Start

```bash
# Start the vault server on port 9099
agentwallet serve

# With API auth token
agentwallet serve --token my-secret-token

# Custom port and host
agentwallet serve --port 8080 --host 127.0.0.1
```

## CLI Commands

### Wallet Management

```bash
# Create a new Solana wallet
agentwallet wallet create "my-trading-wallet"

# Create an EVM wallet
agentwallet wallet create "eth-wallet" --chain evm --chain-id 1

# List all wallets
agentwallet wallet list

# Show wallet details
agentwallet wallet show <id>

# Import existing Solana wallet (base58 private key)
agentwallet wallet import "label" <base58-private-key>

# Import EVM wallet (hex private key)
agentwallet wallet import "label" <hex-private-key> --chain evm

# Pause/unpause a wallet (freeze operations)
agentwallet wallet pause <id>
agentwallet wallet unpause <id>

# Delete a wallet
agentwallet wallet delete <id>
```

### Vault Operations

```bash
# Export vault as encrypted JSON (for backup)
agentwallet vault export > backup.enc.json

# Import from encrypted backup
agentwallet vault import "$(cat backup.enc.json)"
```

### Deploy Commands

```bash
# Deploy to E2B sandbox (remote agent access)
agentwallet deploy e2b --api-key $E2B_API_KEY

# Deploy to Cloudflare Workers
agentwallet deploy cloudflare \
  --api-token $CLOUDFLARE_API_TOKEN \
  --account-id $CLOUDFLARE_ACCOUNT_ID \
  --name agentwallet-vault
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VAULT_PASSPHRASE` | Master encryption passphrase | `SOLANA_PRIVATE_KEY` or default |
| `VAULT_PORT` | Server port | `9099` |
| `VAULT_HOST` | Server bind host | `0.0.0.0` |
| `VAULT_API_TOKEN` | Bearer token for API auth | none (open) |
| `E2B_API_KEY` | E2B sandbox API key | — |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | — |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | — |

## REST API

When the server is running (`agentwallet serve`), the API is available at `http://localhost:9099/api`.

```bash
# Health check
curl http://localhost:9099/api/health

# List wallets
curl http://localhost:9099/api/wallets

# Create wallet
curl -X POST http://localhost:9099/api/wallets \
  -H "Content-Type: application/json" \
  -d '{"label":"agent-wallet","chainType":"solana"}'

# Get wallet
curl http://localhost:9099/api/wallets/<id>

# Import existing wallet
curl -X POST http://localhost:9099/api/wallets/import \
  -H "Content-Type: application/json" \
  -d '{"label":"imported","chainType":"solana","privateKey":"<base58>"}'

# Get private key (requires auth if token set)
curl http://localhost:9099/api/wallets/<id>/private-key \
  -H "Authorization: Bearer $VAULT_API_TOKEN"

# Pause / unpause
curl -X POST http://localhost:9099/api/wallets/<id>/pause
curl -X POST http://localhost:9099/api/wallets/<id>/unpause

# Delete
curl -X DELETE http://localhost:9099/api/wallets/<id>

# Export vault
curl http://localhost:9099/api/vault/export

# Import vault
curl -X POST http://localhost:9099/api/vault/import \
  -H "Content-Type: application/json" \
  -d '{"data":"<encrypted-export>"}'
```

## Programmatic Usage

```typescript
import { Vault, generateSolanaKeypair, startServer } from "agentwallet-vault";

// Create / load vault
const vault = await Vault.create({
  storePath: "/path/to/vault",
  passphrase: process.env.VAULT_PASSPHRASE!,
});

// Generate and store a Solana keypair
const keypair = await generateSolanaKeypair();
const entry = await vault.addWallet(undefined, "agent", "solana", 0, keypair.address, keypair.privateKey);
console.log("Wallet:", entry.address);

// List wallets
const wallets = vault.listWallets();

// Retrieve private key for signing
const privateKey = vault.getPrivateKey(entry.id); // Uint8Array

// Start REST server
await startServer(vault, { port: 9099, host: "0.0.0.0", cors: true });
```

### Deploy to E2B Sandbox

```typescript
import { deployToE2B } from "agentwallet-vault/deploy/e2b";

const instance = await deployToE2B({
  apiKey: process.env.E2B_API_KEY!,
  vaultPassphrase: process.env.VAULT_PASSPHRASE,
  timeout: 600,
});

console.log("Vault URL:", instance.url);
// Remote agent can now call: GET <instance.url>/api/wallets
```

### Deploy to Cloudflare Workers

```typescript
import { deployToCloudflare } from "agentwallet-vault/deploy/cloudflare";

const instance = await deployToCloudflare({
  apiToken: process.env.CLOUDFLARE_API_TOKEN!,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  workerName: "my-agent-vault",
  vaultPassphrase: process.env.VAULT_PASSPHRASE,
});

console.log("Worker URL:", instance.url);
```

## Security

- Keypairs are encrypted with AES-256-GCM before writing to disk
- Vault file is written with `chmod 600` (owner read/write only)
- Vault directory is created with `chmod 700`
- Set `VAULT_API_TOKEN` in production to require bearer auth on all API routes
- Use a strong, unique `VAULT_PASSPHRASE` — do not use the default

## Integration with OpenClawd

`agentwallet-vault` is part of the [solana-clawd](https://github.com/solizardking/solanaclawd) monorepo. Other packages that use it:

- `@openclawd/wallet` — Privy-powered embedded wallet (uses vault for server-side key storage)
- `@openclawdsolana/leviathan` — Root agent runtime (spawns wallets via vault)
- `@openclawdsolana/agent-hub` — Agent discovery hub (agents register vault URLs)

## License

MIT
