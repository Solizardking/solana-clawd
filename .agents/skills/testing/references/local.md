# Local testing with light-test-validator

Local development environment running Solana test validator with Light Protocol programs, Photon indexer, and ZK prover.

## Quick start

```bash
# Start all services
light test-validator

# Stop
light test-validator --stop
```

## Services & ports

| Service | Port | Endpoint |
|---------|------|----------|
| Solana RPC | 8899 | `http://127.0.0.1:8899` |
| Solana WebSocket | 8900 | `ws://127.0.0.1:8900` |
| Photon Indexer | 8784 | `http://127.0.0.1:8784` |
| Light Prover | 3001 | `http://127.0.0.1:3001` |

## Command flags

| Flag | Default | Description |
|------|---------|-------------|
| `--skip-indexer` | false | Run without Photon indexer |
| `--skip-prover` | false | Run without Light Prover |
| `--skip-system-accounts` | false | Skip pre-initialized accounts |
| `--devnet` | false | Clone programs from devnet |
| `--mainnet` | false | Clone programs from mainnet |
| `--sbf-program <ID> <PATH>` | - | Load additional program |
| `--skip-reset` | false | Keep existing ledger |
| `--verbose` | false | Enable verbose logging |

## Deployed programs

| Program | Address |
|---------|---------|
| SPL Noop | `noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV` |
| Light System | `SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7` |
| Compressed Token | `cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m` |
| Account Compression | `compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq` |
| Light Registry | `Lighton6oQpVkeewmo2mcPTQQp7kYHr4fWpAgJyEmDX` |

## TypeScript test integration

```typescript
import { getTestRpc, newAccountWithLamports } from '@lightprotocol/stateless.js/test-helpers';
import { WasmFactory } from '@lightprotocol/hasher.rs';

const lightWasm = await WasmFactory.getInstance();
const rpc = await getTestRpc(lightWasm);
const payer = await newAccountWithLamports(rpc, 1e9, 256);
```

**Run tests:**
```bash
cd js/stateless.js
pnpm test-validator && pnpm test:e2e:all
```

## Troubleshooting

**Validator fails to start:**
```bash
lsof -i :8899              # Check port
light test-validator --stop # Stop existing
rm -rf test-ledger/        # Reset ledger
```

**Photon version mismatch:**
```bash
cargo install --git https://github.com/lightprotocol/photon.git \
  --rev ac7df6c388db847b7693a7a1cb766a7c9d7809b5 --locked --force
```

## File locations

| Component | Location |
|-----------|----------|
| Program binaries | `~/.config/light/bin/` |
| Prover binary | `~/.config/light/bin/prover-{platform}-{arch}` |
| Proving keys | `~/.config/light/proving-keys/` |
| Test ledger | `./test-ledger/` |