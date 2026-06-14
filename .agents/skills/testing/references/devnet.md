# Devnet testing

## Quick start

```typescript
import { createRpc } from "@lightprotocol/stateless.js";

const connection = createRpc(
  "https://devnet.helius-rpc.com?api-key=<api_key>",
  "https://devnet.helius-rpc.com?api-key=<api_key>",
  "https://devnet.helius-rpc.com?api-key=<api_key>"
);
```

## Endpoints

| Service   | URL                                              |
|-----------|--------------------------------------------------|
| RPC       | `https://devnet.helius-rpc.com?api-key=<api_key>` |
| WebSocket | `wss://devnet.helius-rpc.com?api-key=<api_key>`   |
| Indexer   | `https://devnet.helius-rpc.com?api-key=<api_key>` |
| Prover    | `https://prover.helius.dev`                       |

## Client setup

```typescript
import { Rpc, createRpc } from "@lightprotocol/stateless.js";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const RPC_ENDPOINT = `https://devnet.helius-rpc.com?api-key=${HELIUS_API_KEY}`;
const COMPRESSION_ENDPOINT = RPC_ENDPOINT;
const PROVER_ENDPOINT = "https://prover.helius.dev";

const connection: Rpc = createRpc(RPC_ENDPOINT, COMPRESSION_ENDPOINT, PROVER_ENDPOINT);

// Fetch state trees at runtime
const { stateTrees } = await connection.getCachedActiveStateTreeInfo();
const outputStateTree = stateTrees[0].tree;
```

## Key considerations

- **Helius or Triton required**: The photon indexer implementation is maintained by Helius. You can also use Triton. Currently these RPC's provide compression endpoints.
- **Runtime tree fetch**: Always fetch active state trees at runtime via `getCachedActiveStateTreeInfo()`
- **Same programs**: Program addresses are identical on devnet and mainnet
- **Devnet-specific trees**: State tree lookup tables differ from mainnet