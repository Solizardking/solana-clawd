# Approve and revoke delegates

Use `approve()` to grant a delegate spending authority over compressed tokens, and `revoke()` to remove it. Only the token owner can call these.

## Approve

```typescript
import { Keypair } from '@solana/web3.js';
import { createRpc } from '@lightprotocol/stateless.js';
import { createMint, mintTo, approve } from '@lightprotocol/compressed-token';
import BN from 'bn.js';

const rpc = createRpc();
const payer = Keypair.generate();

const { mint } = await createMint(rpc, payer, payer.publicKey, 9);
const owner = Keypair.generate();
await mintTo(rpc, payer, mint, owner.publicKey, payer, 1_000_000_000);

const delegate = Keypair.generate();
const approveSignature = await approve(
    rpc,
    payer,
    mint,                  // SPL mint with interface PDA
    new BN(500_000_000),   // amount the delegate may spend
    owner,                 // owner signer
    delegate.publicKey,    // delegate
);
```

## Revoke

Fetch the delegated accounts, then revoke.

```typescript
import { revoke } from '@lightprotocol/compressed-token';

const delegatedAccounts = await rpc.getCompressedTokenAccountsByDelegate(
    delegate.publicKey,
    { mint },
);

const revokeSignature = await revoke(
    rpc,
    payer,
    delegatedAccounts.items, // delegated compressed token accounts
    owner,                   // owner signer
);
```

## Verify

```typescript
const delegated = await rpc.getCompressedTokenAccountsByDelegate(delegate.publicKey, { mint });
console.log('Delegated accounts:', delegated.items.length); // 0 after revoke
```

## Troubleshooting

- **Account is not delegated** — verify accounts are delegated with `getCompressedTokenAccountsByDelegate` before calling `revoke()`. If the list is empty, there is nothing to revoke.

## Source

- [compressed-token-cookbook/actions/approve.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/approve.ts)
- [compressed-token-cookbook/actions/revoke.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/revoke.ts)
