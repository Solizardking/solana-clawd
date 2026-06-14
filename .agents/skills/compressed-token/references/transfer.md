# Transfer compressed tokens

Use `transfer()` to move compressed tokens between owners. The transfer consumes the sender's input compressed accounts and creates new output accounts for sender and recipient with updated balances.

```typescript
import { Keypair } from '@solana/web3.js';
import { createRpc } from '@lightprotocol/stateless.js';
import { createMint, mintTo, transfer } from '@lightprotocol/compressed-token';

const rpc = createRpc();
const payer = Keypair.generate();

const { mint } = await createMint(rpc, payer, payer.publicKey, 9);
const owner = Keypair.generate();
await mintTo(rpc, payer, mint, owner.publicKey, payer, 1_000_000_000);

const recipient = Keypair.generate();
const transactionSignature = await transfer(
    rpc,
    payer,
    mint,                 // SPL mint with interface PDA
    500_000_000,          // amount
    owner,                // owner signer
    recipient.publicKey,  // destination
);
```

## Transfer as a delegate

A delegate approved with `approve()` can move tokens with `transferDelegated()`.

```typescript
import { approve, transferDelegated } from '@lightprotocol/compressed-token';
import BN from 'bn.js';

await approve(rpc, payer, mint, new BN(500_000_000), owner, delegate.publicKey);
await transferDelegated(rpc, payer, mint, 300_000_000, delegate, recipient.publicKey);
```

## Instruction-level transfer

Build the instruction yourself when combining it with others or using a custom signer. Select input accounts and a validity proof first.

```typescript
import { CompressedTokenProgram, selectMinCompressedTokenAccountsForTransfer } from '@lightprotocol/compressed-token';
import { bn, buildAndSignTx, sendAndConfirmTx, dedupeSigner } from '@lightprotocol/stateless.js';
import { ComputeBudgetProgram } from '@solana/web3.js';

const accounts = await rpc.getCompressedTokenAccountsByOwner(owner.publicKey, { mint });
const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(accounts.items, bn(1e8));

const proof = await rpc.getValidityProof(
    inputAccounts.map((a) => a.compressedAccount.hash),
);

const ix = await CompressedTokenProgram.transfer({
    payer: payer.publicKey,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: recipient.publicKey,
    amount: bn(1e8),
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
});

const { blockhash } = await rpc.getLatestBlockhash();
const tx = buildAndSignTx(
    [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ix],
    payer,
    blockhash,
    dedupeSigner(payer, [owner]),
);
await sendAndConfirmTx(rpc, tx);
```

## Troubleshooting

- **Insufficient balance** — sum balances across all of the owner's accounts before transferring; the total may be split across several compressed accounts.
- **Account limit exceeded** — a transfer can spend at most 4 compressed accounts per transaction. Split large transfers into several transactions, or merge accounts first with `mergeTokenAccounts()`.

## Source

- [compressed-token-cookbook/actions/transfer.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/transfer.ts)
- [compressed-token-cookbook/wallet-integration/send-tokens.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/wallet-integration/send-tokens.ts)
