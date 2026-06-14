# Mint compressed tokens

Use `mintTo()` to create compressed token accounts for recipients and increase the mint's supply. Only the mint authority can call it. The mint must already have an interface PDA (created via `createMint()` or `createTokenPool()`).

```typescript
import { Keypair } from '@solana/web3.js';
import { createRpc } from '@lightprotocol/stateless.js';
import { createMint, mintTo } from '@lightprotocol/compressed-token';

const rpc = createRpc();
const payer = Keypair.generate();

const { mint } = await createMint(rpc, payer, payer.publicKey, 9);

const recipient = Keypair.generate();
const transactionSignature = await mintTo(
    rpc,
    payer,
    mint,                 // SPL mint with interface PDA
    recipient.publicKey,  // recipient
    payer,                // mint authority
    1_000_000_000,        // amount
);
```

## Mint to multiple recipients

Pass arrays of equal length for recipients and amounts.

```typescript
const recipients = [a.publicKey, b.publicKey, c.publicKey];
const amounts = [1_000_000_000, 2_000_000_000, 500_000_000];

await mintTo(rpc, payer, mint, recipients, payer, amounts);
```

## Mint with a separate authority

Use `approveAndMintTo()` when the mint authority differs from the fee payer.

```typescript
import { approveAndMintTo } from '@lightprotocol/compressed-token';

await approveAndMintTo(
    rpc,
    payer,
    mint,
    recipient.publicKey,
    mintAuthority, // mint authority signer
    1_000_000_000,
);
```

## Verify

```typescript
const accounts = await rpc.getCompressedTokenAccountsByOwner(recipient.publicKey, { mint });
const balance = accounts.items[0].parsed.amount; // BN
```

## Troubleshooting

- **TokenPool not found** — the mint has no interface PDA. Create the mint with `createMint()` or add one with `createTokenPool()`.
- **Amount and toPubkey arrays must have the same length** — when minting to multiple recipients, the recipient and amount arrays must match.

## Source

- [compressed-token-cookbook/actions/mint-to.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/mint-to.ts)
