# Merge compressed token accounts

Use `mergeTokenAccounts()` to consolidate multiple compressed accounts of the same mint, owned by the same wallet, into a single account. It consumes up to 8 input accounts and creates one output account with the combined balance.

State trees are append-only, so repeated `mintTo()` or incoming transfers leave an owner with several fragmented accounts. Merging reduces fragmentation and simplifies balance calculations.

```typescript
import { Keypair } from '@solana/web3.js';
import { createRpc, bn } from '@lightprotocol/stateless.js';
import { createMint, mintTo, mergeTokenAccounts } from '@lightprotocol/compressed-token';

const rpc = createRpc();
const payer = Keypair.generate();

const { mint } = await createMint(rpc, payer, payer.publicKey, 9);
const owner = Keypair.generate();

// Several mints create several compressed accounts
await mintTo(rpc, payer, mint, owner.publicKey, payer, bn(100_000_000));
await mintTo(rpc, payer, mint, owner.publicKey, payer, bn(200_000_000));
await mintTo(rpc, payer, mint, owner.publicKey, payer, bn(300_000_000));

const transactionSignature = await mergeTokenAccounts(
    rpc,
    payer,
    mint,   // SPL mint with interface PDA
    owner,  // owner signer
);
```

## Verify

```typescript
const before = await rpc.getCompressedTokenAccountsByOwner(owner.publicKey, { mint });
// ... merge ...
const after = await rpc.getCompressedTokenAccountsByOwner(owner.publicKey, { mint });
console.log(before.items.length, '->', after.items.length); // collapses to 1
```

## Troubleshooting

- **No compressed token accounts found** — the owner has no accounts for this mint. Check with `getCompressedTokenAccountsByOwner` before merging.

## Source

- [compressed-token-cookbook/actions/merge-token-accounts.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/merge-token-accounts.ts)
