# Create a mint with interface PDA

Use `createMint()` to create a new SPL mint and register it for compression in one call, or `createTokenPool()` to add an interface PDA to an existing SPL mint. The mint and interface PDA pay rent like regular SPL accounts; individual compressed token accounts are rent-free.

Each mint supports a maximum of 4 interface PDAs. They get write-locked during compression and decompression, so add more with `addTokenPools()` to raise per-block write-lock capacity for high-throughput distribution.

## Create a new mint with interface PDA

```typescript
import { Keypair } from '@solana/web3.js';
import { createRpc } from '@lightprotocol/stateless.js';
import { createMint } from '@lightprotocol/compressed-token';

const rpc = createRpc(); // localnet
const payer = Keypair.generate();

const { mint, transactionSignature } = await createMint(
    rpc,
    payer,
    payer.publicKey, // mint authority
    9,               // decimals
);
```

### Custom mint and freeze authority

```typescript
const mintAuthority = Keypair.generate();
const freezeAuthority = Keypair.generate();

const { mint } = await createMint(
    rpc,
    payer,
    mintAuthority.publicKey, // mint authority
    9,                       // decimals
    Keypair.generate(),      // mint keypair
    undefined,               // confirm options
    undefined,               // token program ID
    freezeAuthority.publicKey,
);
```

## Add an interface PDA to an existing SPL mint

`createTokenPool()` requires only the fee payer and has no mint-authority constraint.

```typescript
import { createTokenPool, addTokenPools } from '@lightprotocol/compressed-token';

// Register an existing SPL mint for compression
const transactionSignature = await createTokenPool(rpc, payer, mint);

// Add up to 3 more interface PDAs (4 total) to raise write-lock capacity
const additionalPoolsTx = await addTokenPools(
    rpc,
    payer,
    mint,
    2, // number of additional interface PDAs
);
```

For a Token-2022 mint, pass the program id:

```typescript
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

await createTokenPool(rpc, payer, mint, undefined, TOKEN_2022_PROGRAM_ID);
```

## Troubleshooting

- **TokenPool not found** — the mint has no interface PDA. Create one with `createTokenPool(rpc, payer, mint)`, or create the mint with `createMint()`.

## Source

- [compressed-token-cookbook/actions/create-mint.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/create-mint.ts)
- [compressed-token-cookbook/actions/create-token-pool.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/create-token-pool.ts)
